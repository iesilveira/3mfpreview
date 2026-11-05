import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {projectRoot,loadEnvironment} from './runtime-env.js';
import {getPool,closePool} from '../server/db.js';
import {createStore} from '../server/store.js';
import {sha} from '../server/passwords.js';
import {imageExtension,MIME} from '../server/assets.js';
import {DEFAULT_BRANDING,validateBranding,ASSET_PATTERN} from '../shared/branding.js';
export function validateLegacyProjects(projects) {
  if(!Array.isArray(projects))throw new Error('projects.json não contém uma lista.');
  const ids=new Set(),tokens=new Set();
  for(const p of projects){
    if(!p||typeof p!=='object'||Array.isArray(p)||!/^[a-f0-9-]{36}$/.test(p.id||'')
      ||!/^[a-f0-9]{48}$/.test(p.token||'')||!/^[a-f0-9-]{36}\.3mf$/.test(p.storedFileName||''))
      throw new Error('Projeto contém identificador/token/arquivo inválido.');
    if(ids.has(p.id)||tokens.has(p.token))throw new Error('IDs ou tokens duplicados.');
    ids.add(p.id);tokens.add(p.token);
    for(const key of ['name','clientName','clientEmail','note','originalFileName','createdAt','decisionComment'])
      if(typeof p[key]!=='string')throw new Error('Campo de projeto inválido: '+key);
    if(!p.name||!Number.isFinite(Date.parse(p.createdAt))||p.createdAt.length>32
      ||!Number.isSafeInteger(p.fileSize)||p.fileSize<1
      ||!['pending','approved','changes_requested'].includes(p.status))
      throw new Error('Metadados de projeto inválidos.');
    if(p.decisionAt!==null && (typeof p.decisionAt!=='string'||p.decisionAt.length>32||!Number.isFinite(Date.parse(p.decisionAt))))
      throw new Error('Data de decisão inválida.');
    if(p.status!=='pending'&&!p.decisionAt)throw new Error('Decisão sem data. Corrija a origem antes de importar.');
  }
  return projects;
}
async function optionalJSON(file,defaultValue) {
  try{
    const stat=await fs.lstat(file);
    if(stat.isSymbolicLink()||!stat.isFile()||stat.size>50*1024*1024)throw new Error('Origem inválida ou acima de 50 MB: '+file);
    return JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
  }catch(error){if(error.code==='ENOENT')return defaultValue;throw error;}
}
async function regular(file) {
  const stat=await fs.lstat(file);
  if(stat.isSymbolicLink()||!stat.isFile())throw new Error('Arquivo não regular: '+file);
  return stat;
}
async function realDirectory(directory,optional=false) {
  try{const stat=await fs.lstat(directory);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Diretório inválido: '+directory);}
  catch(error){if(optional&&error.code==='ENOENT')return false;throw error;}
  return true;
}
export async function scanLegacy(directory) {
  const root=path.resolve(directory),models=path.join(root,'models'),assetsDir=path.join(root,'branding-assets');
  await realDirectory(root);
  const projects=validateLegacyProjects(await optionalJSON(path.join(root,'projects.json'),[]));
  const branding=validateBranding(await optionalJSON(path.join(root,'branding.json'),{...DEFAULT_BRANDING}));
  const hasModels=await realDirectory(models,true);
  const modelNames=hasModels?(await fs.readdir(models)).filter(name=>name.endsWith('.3mf')):[];
  if(!projects.length&&modelNames.length)throw new Error('Existem 3MFs, mas nenhum projeto na origem. Confira DATA_DIR e projects.json.');
  for(const project of projects){
    const stat=await regular(path.join(models,project.storedFileName));
    if(stat.size!==project.fileSize)throw new Error('Tamanho do 3MF divergente: '+project.storedFileName);
  }
  const assets=[];
  if(await realDirectory(assetsDir,true)){
    const names=(await fs.readdir(assetsDir)).sort();
    for(const name of names){
      if(name==='.gitkeep')continue;
      if(!ASSET_PATTERN.test('/api/branding-assets/'+name))throw new Error('Ativo não reconhecido: '+name);
      const file=path.join(assetsDir,name),stat=await regular(file);
      if(stat.size>2*1024*1024)throw new Error('Ativo acima de 2 MB: '+name);
      const buffer=await fs.readFile(file),extension=imageExtension(buffer);
      if(name.split('.').pop()!==extension)throw new Error('Extensão/assinatura divergente: '+name);
      assets.push({name,file,mime:MIME[extension],hash:sha(buffer),size:buffer.length});
    }
  }
  for(const key of ['logoUrl','faviconUrl'])
    if(branding[key]&&!assets.some(a=>'/api/branding-assets/'+a.name===branding[key]))throw new Error('Ativo referenciado não encontrado: '+key);
  const digest=crypto.createHash('sha256').update(JSON.stringify({projects,branding,assets:assets.map(({name,mime,hash,size})=>({name,mime,hash,size}))})).digest('hex');
  return {projects,branding,assets,digest};
}
async function main(){
  if(!process.argv.includes('--confirm-stopped'))throw new Error('Pare a aplicação e confirme explicitamente: npm run data:import -- --confirm-stopped');
  loadEnvironment();
  const directory=path.resolve(process.env.DATA_DIR||path.join(projectRoot,'data'));
  console.log('Origem de dados:',directory);
  const bundle=await scanLegacy(directory),store=createStore(getPool);
  await store.state();
  let already=false;
  await store.transaction(async connection=>{
    const [states]=await connection.execute('SELECT * FROM mf3_state WHERE id=1 FOR UPDATE');
    const state=states[0];
    if(state.data_ready){
      if(state.import_digest===bundle.digest){already=true;return;}
      throw new Error('Banco já inicializado com outra origem. Importação recusada; nada será sobrescrito.');
    }
    for(const table of ['mf3_projects','mf3_decisions','mf3_assets','mf3_branding','mf3_admins','mf3_sessions']){
      const [counts]=await connection.execute('SELECT COUNT(*) AS n FROM '+table);
      if(Number(counts[0].n))throw new Error('Destino não vazio: '+table);
    }
    for(const a of bundle.assets){
      const buffer=await fs.readFile(a.file);
      if(sha(buffer)!==a.hash)throw new Error('Ativo mudou durante a importação: '+a.name);
      await connection.execute('INSERT INTO mf3_assets (name,mime,content,sha256) VALUES (?,?,?,?)',[a.name,a.mime,buffer,a.hash]);
    }
    for(const p of bundle.projects){
      await connection.execute('INSERT INTO mf3_projects (id,token,created_at,payload) VALUES (?,?,?,?)',[p.id,p.token,p.createdAt,JSON.stringify(p)]);
      if(p.status!=='pending')await connection.execute('INSERT INTO mf3_decisions (project_id,status,comment,decided_at) VALUES (?,?,?,?)',[p.id,p.status,p.decisionComment,p.decisionAt]);
    }
    await connection.execute('INSERT INTO mf3_branding (id,payload) VALUES (1,?)',[JSON.stringify(bundle.branding)]);
    // Detecta mudanças na origem antes do commit; não altera os arquivos legados.
    const recheck=await scanLegacy(directory);
    if(recheck.digest!==bundle.digest)throw new Error('Origem mudou durante a importação. Operação cancelada.');
    await connection.execute('UPDATE mf3_state SET data_ready=1,import_digest=? WHERE id=1',[bundle.digest]);
  });
  console.log(already?'[JÁ IMPORTADO] Mesma origem; banco não alterado.':
    `[OK] ${bundle.projects.length} projetos e ${bundle.assets.length} imagens importados. IDs, tokens e referências 3MF preservados.`);
  console.log('JSONs, imagens legadas e modelos originais não foram apagados ou modificados.');
}
if(process.argv[1] && path.resolve(process.argv[1])===path.join(projectRoot,'scripts','import-legacy.js')){
  main().catch(error=>{console.error('[ERRO]',error.code||error.message);process.exitCode=1;}).finally(()=>closePool().catch(()=>{}));
}
