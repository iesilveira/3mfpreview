import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWebInstaller,installWebSetup} from '../server/web-installation.js';
import {verifyPassword} from '../server/passwords.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=['mf3_state','mf3_admins','mf3_sessions','mf3_attempts','mf3_projects','mf3_decisions','mf3_branding','mf3_assets'];
const key='K'.repeat(43),password='Uma-senha-de-teste-123!';
const input={key,email:' ADMIN@EXAMPLE.COM ',password,confirmPassword:password,confirmEmpty:true};
function database(){
  const db={tables:new Set(),data:Object.fromEntries(names.map(n=>[n,[]])),writes:[],locked:false,failBranding:false,connections:0};
  function conn(){
    let snapshot;
    return {
      async execute(sql,args=[]){
        if(sql.includes('FROM information_schema.TABLES'))return [[...db.tables].map(table_name=>({table_name,engine:'InnoDB',table_type:'BASE TABLE'}))];
        if(sql.endsWith('LIMIT 0'))return [[]];
        if(sql==='SELECT DATABASE() AS db')return [[{db:'test_installation'}]];
        if(sql.startsWith('SELECT GET_LOCK')){if(db.locked)return [[{acquired:0}]];db.locked=true;return [[{acquired:1}]];}
        if(sql.startsWith('SELECT RELEASE_LOCK')){db.locked=false;return [[{released:1}]];}
        if(sql.startsWith('SELECT COUNT(*)')){const name=sql.split('FROM ')[1];return [[{n:db.data[name].length}]];}
        if(sql.startsWith('SELECT ')&&sql.includes('FROM mf3_state'))return [structuredClone(db.data.mf3_state)];
        if(sql.startsWith('CREATE TABLE')){
          const name=sql.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)[1];db.tables.add(name);db.writes.push(sql);return [{}];
        }
        if(sql.startsWith('INSERT IGNORE INTO mf3_state')){
          db.writes.push(sql);
          if(!db.data.mf3_state.length)db.data.mf3_state.push({id:1,schema_version:'1.3.0',data_ready:0,
            import_digest:null,setup_consumed:0,setup_hash:null,setup_expires_ms:null});
          return [{}];
        }
        if(sql.startsWith('INSERT INTO mf3_admins')){
          db.writes.push(sql);
          if(db.data.mf3_admins.length)throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
          db.data.mf3_admins.push({id:1,email:args[0],password_hash:args[1],active:1,auth_version:1});return [{affectedRows:1}];
        }
        if(sql.startsWith('INSERT INTO mf3_branding')){
          if(db.failBranding)throw Object.assign(new Error('simulated failure'),{code:'ER_TEST_FAILURE'});
          db.writes.push(sql);db.data.mf3_branding.push({id:1,payload:args[0]});return [{affectedRows:1}];
        }
        if(sql.startsWith('UPDATE mf3_state SET data_ready=1')){
          db.writes.push(sql);Object.assign(db.data.mf3_state[0],{data_ready:1,import_digest:args[0],setup_consumed:1,setup_hash:null,setup_expires_ms:null});
          return [{affectedRows:1}];
        }
        throw new Error('Unexpected fixture SQL: '+sql);
      },
      async beginTransaction(){snapshot=structuredClone(db.data);},
      async commit(){snapshot=undefined;},
      async rollback(){if(snapshot)db.data=snapshot;snapshot=undefined;},
      release(){},destroy(){db.locked=false;}
    };
  }
  db.pool={execute:(...args)=>conn().execute(...args),async getConnection(){db.connections++;return conn();}};
  return db;
}
async function fixture(env={INSTALLATION_KEY:key}){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mf3-install-test-'));
  const db=database();
  const installer=createWebInstaller({root,dataDir:directory,poolProvider:()=>db.pool,env});
  return {db,installer,directory,cleanup:()=>fs.rm(directory,{recursive:true,force:true})};
}
test('status vazio é somente leitura e não exige tabelas prontas',async()=>{
  const f=await fixture();try{
    assert.deepEqual(await f.installer.status(),{installed:false,canInstall:true,keyConfigured:true});
    assert.equal(f.db.writes.length,0);
  }finally{await f.cleanup();}
});
test('chave ausente/inválida e confirmação impedem qualquer escrita',async()=>{
  const f=await fixture({});try{
    await assert.rejects(()=>f.installer.create(input),{code:'INSTALL_KEY_MISSING'});
    assert.equal(f.db.connections,0);
  }finally{await f.cleanup();}
  const g=await fixture();try{
    await assert.rejects(()=>g.installer.create({...input,key:'wrong'}),{code:'INSTALL_KEY_INVALID'});
    await assert.rejects(()=>g.installer.create({...input,confirmEmpty:false}),{code:'INSTALL_CONFIRM_REQUIRED'});
    assert.equal(g.db.writes.length,0);
  }finally{await g.cleanup();}
});
test('validação de senha, confirmação e email acontece antes das escritas',async()=>{
  const f=await fixture();try{
    await assert.rejects(()=>f.installer.create({...input,password:'short'}),{code:'INSTALL_INPUT_INVALID'});
    await assert.rejects(()=>f.installer.create({...input,confirmPassword:'different'}),{code:'INSTALL_PASSWORD_MISMATCH'});
    await assert.rejects(()=>f.installer.create({...input,email:'invalid'}),{code:'INSTALL_INPUT_INVALID'});
    assert.equal(f.db.connections,0);
  }finally{await f.cleanup();}
});
test('instalação cria esquema, hash válido, branding e bloqueia reutilização',async()=>{
  const f=await fixture();try{
    assert.equal((await f.installer.create(input)).ok,true);
    assert.equal(f.db.tables.size,8);
    const user=f.db.data.mf3_admins[0];
    assert.equal(user.email,'admin@example.com');
    assert.ok(!user.password_hash.includes(password));
    assert.ok(await verifyPassword(password,user.password_hash));
    assert.equal(f.db.data.mf3_state[0].data_ready,1);
    assert.equal(f.db.data.mf3_state[0].setup_consumed,1);
    const branding=JSON.parse(f.db.data.mf3_branding[0].payload);
    assert.equal(branding.primaryColor,'#0572cf');assert.equal(branding.secondaryColor,'#e62526');
    assert.equal((await f.installer.status()).installed,true);
    const count=f.db.writes.length;
    await assert.rejects(()=>f.installer.create(input),{code:'INSTALL_CLOSED'});
    assert.equal(f.db.data.mf3_admins.length,1);assert.equal(f.db.writes.length,count);
  }finally{await f.cleanup();}
});
test('aceita SQL já importado com tabelas vazias e state ainda não inicializado',async()=>{
  const f=await fixture();try{
    f.db.tables=new Set(names);
    f.db.data.mf3_state=[{id:1,schema_version:'1.3.0',data_ready:0,setup_consumed:0,import_digest:null,setup_hash:null,setup_expires_ms:null}];
    assert.equal((await f.installer.create(input)).ok,true);
    assert.equal(f.db.data.mf3_admins.length,1);
  }finally{await f.cleanup();}
});
test('recusa dados existentes sem executar DDL e sem apagar linhas',async()=>{
  const f=await fixture();try{
    f.db.tables.add('mf3_projects');f.db.data.mf3_projects.push({id:'existing'});
    await assert.rejects(()=>f.installer.create(input),{code:'INSTALL_NOT_EMPTY'});
    assert.equal(f.db.writes.length,0);assert.equal(f.db.data.mf3_projects.length,1);
  }finally{await f.cleanup();}
});
test('recusa arquivos legados antes de alterar esquema',async()=>{
  const f=await fixture();try{
    await fs.writeFile(path.join(f.directory,'projects.json'),'[]');
    await assert.rejects(()=>f.installer.create(input),{code:'INSTALL_LOCAL_DATA'});
    assert.equal(f.db.writes.length,0);
  }finally{await f.cleanup();}
});
test('falha no branding desfaz cadastro e permite tentar novamente',async()=>{
  const f=await fixture();try{
    f.db.failBranding=true;
    await assert.rejects(()=>f.installer.create(input),{code:'ER_TEST_FAILURE'});
    assert.equal(f.db.data.mf3_admins.length,0);assert.equal(f.db.data.mf3_state[0].data_ready,0);
    assert.equal(f.db.locked,false);
    f.db.failBranding=false;assert.equal((await f.installer.create(input)).ok,true);
  }finally{await f.cleanup();}
});
test('requisições simultâneas não criam dois administradores',async()=>{
  const f=await fixture();try{
    const result=await Promise.allSettled([f.installer.create(input),f.installer.create(input)]);
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(f.db.data.mf3_admins.length,1);assert.equal(f.db.locked,false);
  }finally{await f.cleanup();}
});
test('rotas recusam origem externa e não expõem a chave no status',async()=>{
  const f=await fixture();try{
    const routes=new Map(),app={get(p,fn){routes.set('GET '+p,fn);},post(p,fn){routes.set('POST '+p,fn);}};
    installWebSetup(app,{root,dataDir:f.directory,poolProvider:()=>f.db.pool,env:{INSTALLATION_KEY:key}});
    const res={statusCode:200,set(){return this;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
    const headers={origin:'https://evil.invalid',host:'localhost','content-type':'application/json'};
    await routes.get('POST /api/installation')({ip:'test',body:input,get:n=>headers[n]},res);
    assert.equal(res.statusCode,403);assert.equal(f.db.writes.length,0);
    assert.ok(!JSON.stringify(await f.installer.status()).includes(key));
  }finally{await f.cleanup();}
});
test('rotas de instalação precedem bloqueio global e estáticos',async()=>{
  const source=await fs.readFile(path.join(root,'server.js'),'utf8');
  const registered=source.indexOf('installWebSetup(app,');
  assert.ok(registered>0);
  assert.ok(registered<source.indexOf("app.use('/api',"));
  assert.ok(registered<source.indexOf('express.static('));
  assert.ok(!source.includes('store.ready().then(()=>store.branding())'));
});
