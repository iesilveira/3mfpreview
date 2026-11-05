import fs from 'node:fs/promises';
import path from 'node:path';
import {hashPassword,emailValue,checkNewPassword,sha,equal} from './passwords.js';
import {DEFAULT_BRANDING,validateBranding} from '../shared/branding.js';
import {sameOrigin} from './admin-auth.js';
import {logFailure} from './database-diagnostics.js';

const TABLES=['mf3_state','mf3_admins','mf3_sessions','mf3_attempts',
  'mf3_projects','mf3_decisions','mf3_branding','mf3_assets'];
const SCHEMA_SHA='5b6ed5b542f421dee30a17693ca8389a1b9346f2de3e9492279d5e510a36f8b1';
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code,installationProblem:true});
const keyIsValid=value=>typeof value==='string' && value.length>=32 && value.length<=256 && !/\s/.test(value);
const rows=async(connection,sql,args=[]) => (await connection.execute(sql,args))[0];
const number=value=>Number(value||0);
const COLUMNS={
  mf3_state:'id,schema_version,data_ready,import_digest,setup_consumed,setup_hash,setup_expires_ms',
  mf3_admins:'id,email,password_hash,active,auth_version,created_at',
  mf3_sessions:'token_hash,user_id,csrf_token,auth_version,expires_ms',
  mf3_attempts:'rate_key,hits,reset_ms',mf3_projects:'id,token,created_at,payload',
  mf3_decisions:'id,project_id,status,comment,decided_at',
  mf3_branding:'id,payload',mf3_assets:'name,mime,content,sha256'
};
async function inspect(connection) {
  const tables=await rows(connection,
    "SELECT TABLE_NAME AS table_name,ENGINE AS engine,TABLE_TYPE AS table_type FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND LEFT(TABLE_NAME,4)='mf3_'");
  const present=new Set();
  for(const t of tables) {
    if(!TABLES.includes(t.table_name) || t.table_type!=='BASE TABLE' || String(t.engine).toLowerCase()!=='innodb')
      throw fail(409,'INSTALL_SCHEMA_CONFLICT','Há tabelas mf3_ desconhecidas ou incompatíveis. Nada será substituído.');
    present.add(t.table_name);
    await rows(connection,`SELECT ${COLUMNS[t.table_name]} FROM ${t.table_name} LIMIT 0`);
  }
  const states=present.has('mf3_state')?await rows(connection,
    'SELECT id,schema_version,data_ready,import_digest,setup_consumed,setup_hash,setup_expires_ms FROM mf3_state'):[];
  const admins=present.has('mf3_admins')
    ?number((await rows(connection,'SELECT COUNT(*) AS n FROM mf3_admins'))[0].n):0;
  if(states.length===1 && number(states[0].id)===1 && states[0].schema_version==='1.3.0'
      && number(states[0].data_ready)===1 && number(states[0].setup_consumed)===1 && admins>0
      && present.size===TABLES.length) return {installed:true,canInstall:false};
  if(states.length>1 || states.some(s=>number(s.id)!==1 || s.schema_version!=='1.3.0'
      || number(s.data_ready)!==0 || number(s.setup_consumed)!==0
      || s.import_digest || s.setup_hash || s.setup_expires_ms))
    throw fail(409,'INSTALL_NOT_EMPTY','O banco já foi inicializado ou possui configuração anterior. Instalação nova recusada; nenhum dado será apagado.');
  for(const table of present) {
    if(table==='mf3_state') continue;
    if(number((await rows(connection,`SELECT COUNT(*) AS n FROM ${table}`))[0].n)>0)
      throw fail(409,'INSTALL_NOT_EMPTY','O banco contém dados da aplicação. Instalação nova recusada; nenhum dado será apagado.');
  }
  return {installed:false,canInstall:true};
}
async function assertEmptyData(directory) {
  async function visit(target,depth=0) {
    let entries;
    try {
      const stat=await fs.lstat(target);
      if(stat.isSymbolicLink() || !stat.isDirectory())
        throw fail(409,'INSTALL_LOCAL_DATA','DATA_DIR inválido ou simbólico. Nenhum arquivo será modificado.');
      entries=await fs.readdir(target,{withFileTypes:true});
    } catch(error) {if(error.code==='ENOENT')return;throw error;}
    for(const entry of entries) {
      if(entry.name==='.gitkeep' && entry.isFile())continue;
      if(entry.isDirectory() && !entry.isSymbolicLink() && depth===0
          && ['models','branding-assets'].includes(entry.name)) {
        await visit(path.join(target,entry.name),depth+1);continue;
      }
      throw fail(409,'INSTALL_LOCAL_DATA','Existem arquivos em DATA_DIR. Esta instalação nova não importa nem apaga arquivos anteriores.');
    }
  }
  await visit(directory);
}
export function createWebInstaller({poolProvider,root,dataDir,env=process.env}) {
  if(!poolProvider || !root || !dataDir)throw new Error('Dependências de instalação ausentes.');
  const pool=()=>typeof poolProvider==='function'?poolProvider():poolProvider;
  let hashing=0;
  async function status() {
    const state=await inspect(pool());
    return {...state,keyConfigured:!state.installed&&keyIsValid(env.INSTALLATION_KEY),
      canInstall:state.canInstall&&keyIsValid(env.INSTALLATION_KEY)};
  }
  async function create(body={}) {
    const configured=env.INSTALLATION_KEY;
    if(!keyIsValid(configured))
      throw fail(503,'INSTALL_KEY_MISSING','Configure INSTALLATION_KEY nas variáveis da aplicação e reinicie. Use a chave exibida pelo atualizador local.');
    const supplied=typeof body.key==='string'?body.key:'';
    if(supplied.length>256 || !equal(sha(supplied),sha(configured)))
      throw fail(403,'INSTALL_KEY_INVALID','Chave de instalação inválida.');
    if(body.confirmEmpty!==true)
      throw fail(400,'INSTALL_CONFIRM_REQUIRED','Confirme que esta é uma instalação nova, sem dados.');
    let email,password;
    try {email=emailValue(body.email);password=checkNewPassword(body.password);}
    catch(error){throw fail(400,'INSTALL_INPUT_INVALID',error.message);}
    if(password!==body.confirmPassword)
      throw fail(400,'INSTALL_PASSWORD_MISMATCH','As senhas não coincidem.');
    if(hashing>=2)throw fail(429,'INSTALL_BUSY','Instalação ocupada. Aguarde e tente novamente.');
    hashing++;
    let connection,locked=false,transaction=false,destroyed=false;
    let lockName;
    try {
      connection=await pool().getConnection();
      const databases=await rows(connection,'SELECT DATABASE() AS db');
      if(!databases[0]?.db)throw fail(503,'INSTALL_DATABASE_MISSING','Selecione um banco em DB_NAME.');
      lockName='mf3.install.'+sha(String(databases[0].db)).slice(0,48);
      const acquired=await rows(connection,'SELECT GET_LOCK(?,5) AS acquired',[lockName]);
      if(number(acquired[0]?.acquired)!==1)
        throw fail(423,'INSTALL_BUSY','Outra instalação está em andamento. Aguarde e recarregue.');
      locked=true;
      const before=await inspect(connection);
      if(before.installed)throw fail(409,'INSTALL_CLOSED','O administrador já foi cadastrado. A instalação está encerrada.');
      await assertEmptyData(dataDir);
      const sql=(await fs.readFile(path.join(root,'migrations','1.3.0.sql'),'utf8'))
        .replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
      if(sha(sql)!==SCHEMA_SHA)
        throw fail(503,'INSTALL_SCHEMA_FILE','O SQL da instalação está ausente ou foi alterado. Republique os arquivos íntegros.');
      const statements=sql.replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);
      if(statements.length!==9 || statements.slice(0,8).some((s,i)=>
          !s.startsWith('CREATE TABLE IF NOT EXISTS '+TABLES[i]+' (')) ||
          !statements[8].startsWith("INSERT IGNORE INTO mf3_state "))
        throw fail(503,'INSTALL_SCHEMA_FILE','Estrutura do SQL inesperada. Nenhum esquema desconhecido será executado.');
      // DDL fica fora da transação de cadastro. Não contém DROP/ALTER/DELETE.
      for(const statement of statements)await connection.execute(statement);
      const after=await inspect(connection);
      if(after.installed)throw fail(409,'INSTALL_CLOSED','Cadastro inicial já concluído.');
      const passwordHash=await hashPassword(password);
      const branding=validateBranding({...DEFAULT_BRANDING});
      await connection.beginTransaction();transaction=true;
      const state=await rows(connection,'SELECT * FROM mf3_state WHERE id=1 FOR UPDATE');
      if(!state[0] || state[0].schema_version!=='1.3.0')
        throw fail(503,'INSTALL_SCHEMA_CONFLICT','O registro do esquema não corresponde à instalação.');
      const check=await inspect(connection);
      if(check.installed)throw fail(409,'INSTALL_CLOSED','Cadastro inicial já concluído.');
      await assertEmptyData(dataDir);
      await connection.execute('INSERT INTO mf3_admins (email,password_hash) VALUES (?,?)',[email,passwordHash]);
      await connection.execute('INSERT INTO mf3_branding (id,payload) VALUES (1,?)',[JSON.stringify(branding)]);
      await connection.execute('UPDATE mf3_state SET data_ready=1,import_digest=?,setup_consumed=1,setup_hash=NULL,setup_expires_ms=NULL WHERE id=1',
        [sha('browser-initial-installation:1.3.2')]);
      await connection.commit();transaction=false;
      return {ok:true,loginRequired:true};
    } catch(error) {
      if(transaction&&connection)await connection.rollback().catch(()=>{});
      throw error;
    } finally {
      if(connection&&locked) {
        try {
          const result=await rows(connection,'SELECT RELEASE_LOCK(?) AS released',[lockName]);
          if(number(result[0]?.released)!==1)throw new Error('Lock release');
        } catch {
          destroyed=true;
          try{connection.destroy();}catch{}
        }
      }
      if(connection&&!destroyed)connection.release();
      hashing--;
    }
  }
  return {status,create};
}
export function installWebSetup(app,options) {
  const installer=createWebInstaller(options),attempts=new Map();
  const noCache=res=>res.set('Cache-Control','no-store')
    .set('X-Content-Type-Options','nosniff').set('Referrer-Policy','no-referrer');
  const sendError=(res,error)=>{
    if(error.installationProblem)
      return res.status(error.status).json({error:error.message,code:error.code});
    const diagnostic=logFailure('installation',error);
    return res.status(503).json({error:diagnostic.message,code:diagnostic.code});
  };
  app.get('/install',(_req,res)=>{
    noCache(res).set('Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.sendFile(path.join(options.root,'installation','index.html'));
  });
  for(const [url,file,type] of [
    ['/installation/browser.js','browser.js','application/javascript'],
    ['/installation/style.css','style.css','text/css']]) {
    app.get(url,(_req,res)=>noCache(res).type(type).sendFile(path.join(options.root,'installation',file)));
  }
  app.get('/api/installation/status',async(_req,res)=>{
    noCache(res);
    try{res.json(await installer.status());}catch(error){sendError(res,error);}
  });
  app.post('/api/installation',async(req,res)=>{
    noCache(res);
    if(!sameOrigin(req,res))return;
    if(!String(req.get('content-type')||'').toLowerCase().startsWith('application/json'))
      return res.status(415).json({error:'Envie JSON.',code:'INSTALL_JSON_REQUIRED'});
    const now=Date.now();
    for(const [key,value] of attempts)if(value.until<=now)attempts.delete(key);
    const id=String(req.ip||''),record=attempts.get(id)||{n:0,until:now+15*60*1000};
    if(record.n>=12 || (!attempts.has(id)&&attempts.size>=2000))
      return res.set('Retry-After','900').status(429).json({error:'Muitas tentativas. Aguarde 15 minutos.',code:'INSTALL_RATE_LIMIT'});
    record.n++;attempts.set(id,record);
    try{res.status(201).json(await installer.create(req.body));}catch(error){sendError(res,error);}
  });
  // Registrado ANTES do bloqueio /api e ANTES dos arquivos estáticos.
  app.get(['/','/index.html'],async(_req,res,next)=>{
    noCache(res);
    try{if((await installer.status()).installed)return next();}
    catch{/* /install apresenta o diagnóstico seguro; não faz escrita ao abrir. */}
    res.redirect(302,'/install');
  });
  return installer;
}
