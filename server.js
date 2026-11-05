import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from 'node:process';
import {getPool} from './server/db.js';
import {logFailure} from './server/database-diagnostics.js';
import {createStore,problem} from './server/store.js';
import {installAdminAuth,sameOrigin} from './server/admin-auth.js';
import {installBranding} from './server/branding.js';
const root=path.dirname(fileURLToPath(import.meta.url));
try{loadEnvFile(path.join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
const app=express(),store=createStore(getPool);
const port=Number(process.env.PORT||3001);
const models=path.resolve(process.env.DATA_DIR||path.join(root,'data'),'models');
app.disable('x-powered-by');
const proxy=process.env.TRUST_PROXY||'loopback';
app.set('trust proxy',/^\d+$/.test(proxy)?Number(proxy):proxy);
app.use(express.json({limit:'100kb'}));
app.get('/api/health',async(_req,res)=>{
  res.set('Cache-Control','no-store');
  try{
    await store.ready();
    res.json({ok:true,version:'1.3.1',storage:'mysql'});
  }catch(error){
    const info=logFailure('health',error);
    res.status(503).json({ok:false,version:'1.3.1',storage:'mysql',
      code:info.code,error:info.message,migrationRequired:['SCHEMA_MISMATCH','IMPORT_PENDING'].includes(info.code)});
  }
});
app.use('/api',async(_req,res,next)=>{
  res.set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff');
  try{await store.ready();next();}catch(error){next(error);}
});
const {requireAdmin}=installAdminAuth(app,{store});
installBranding(app,{store,requireAdmin});
const upload=multer({
  storage:multer.diskStorage({destination:(_req,_file,cb)=>cb(null,models),
    filename:(_req,_file,cb)=>cb(null,`${crypto.randomUUID()}.3mf`)}),
  limits:{fileSize:100*1024*1024,files:1,fields:4,fieldSize:10000,parts:5},
  fileFilter:(_req,file,cb)=>cb(path.extname(file.originalname).toLowerCase()==='.3mf'?null:problem(400,'Envie um arquivo .3mf.'),true)
});
const text=(value,max)=>String(value||'').trim().slice(0,max);
const tokenValid=token=>/^[a-f0-9]{48}$/.test(token);
const publicProject=project=>{
  const {storedFileName,...value}=project;
  return {...value,modelUrl:`/api/reviews/${encodeURIComponent(project.token)}/model`};
};
app.get('/api/admin/projects',requireAdmin,async(_req,res,next)=>{
  try{res.json(await store.listProjects());}catch(error){next(error);}
});
app.post('/api/admin/projects',requireAdmin,upload.single('model'),async(req,res,next)=>{
  let persisted=false;
  try{
    if(!req.file)throw problem(400,'Selecione um arquivo 3MF.');
    const name=text(req.body.name,120);
    if(!name)throw problem(400,'Informe o nome do serviço/projeto.');
    const handle=await fs.open(req.file.path,'r');
    const signature=Buffer.alloc(4);
    try{await handle.read(signature,0,4,0);}finally{await handle.close();}
    if(signature[0]!==0x50||signature[1]!==0x4b)throw problem(400,'O arquivo não parece ser um pacote 3MF válido.');
    const project={id:crypto.randomUUID(),token:crypto.randomBytes(24).toString('hex'),name,
      clientName:text(req.body.clientName,120),clientEmail:text(req.body.clientEmail,180),note:text(req.body.note,1200),
      originalFileName:path.basename(req.file.originalname),storedFileName:req.file.filename,fileSize:req.file.size,
      status:'pending',createdAt:new Date().toISOString(),decisionAt:null,decisionComment:''};
    await store.createProject(project);persisted=true;res.status(201).json(project);
  }catch(error){if(req.file&&!persisted)await fs.unlink(req.file.path).catch(()=>{});next(error);}
});
app.get('/api/reviews/:token',async(req,res,next)=>{
  try{
    const project=tokenValid(req.params.token)?await store.byToken(req.params.token):null;
    if(!project)throw problem(404,'Link de revisão não encontrado.');
    res.json(publicProject(project));
  }catch(error){next(error);}
});
app.get('/api/reviews/:token/model',async(req,res,next)=>{
  try{
    const project=tokenValid(req.params.token)?await store.byToken(req.params.token):null;
    if(!project)throw problem(404,'Modelo não encontrado.');
    if(!/^[a-f0-9-]{36}\.3mf$/.test(project.storedFileName))throw problem(503,'Referência de modelo inválida.');
    res.type('model/3mf').set('Content-Disposition',`inline; filename="${encodeURIComponent(project.originalFileName)}"`);
    res.sendFile(path.join(models,project.storedFileName),error=>{
      if(error&&!res.headersSent)res.status(error.code==='ENOENT'?404:500).json({error:'Arquivo 3MF indisponível.'});
    });
  }catch(error){next(error);}
});
app.post('/api/reviews/:token/decision',async(req,res,next)=>{
  try{
    if(!sameOrigin(req,res))return;
    if(!tokenValid(req.params.token))throw problem(404,'Link de revisão não encontrado.');
    const retry=await store.rate(`review:${req.params.token}:${req.ip}`,30);
    if(retry)return res.set('Retry-After',String(retry)).status(429).json({error:'Muitas solicitações. Aguarde.'});
    const status=req.body?.status,comment=text(req.body?.comment,1200);
    if(!['approved','changes_requested'].includes(status))throw problem(400,'Decisão inválida.');
    if(status==='changes_requested'&&!comment)throw problem(400,'Descreva o ajuste solicitado.');
    res.json(publicProject(await store.decide(req.params.token,status,comment)));
  }catch(error){next(error);}
});
app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint não encontrado.'}));
app.use('/assets',express.static(path.join(root,'dist','assets'),{maxAge:'1d'}));
app.use(express.static(path.join(root,'dist')));
app.get('/{*path}',(_req,res)=>res.sendFile(path.join(root,'dist','index.html'),error=>{
  if(error&&!res.headersSent)res.status(404).send('Execute npm run build antes de iniciar.');
}));
app.use((error,_req,res,_next)=>{
  if(res.headersSent)return res.end();
  if(error instanceof multer.MulterError)return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:'Upload inválido (3MF: 100 MB; identidade: 2 MB).'});
  if(error.type==='entity.parse.failed')return res.status(400).json({error:'JSON inválido.'});
  const status=Number.isInteger(error.status)&&error.status>=400&&error.status<600?error.status:503;
  if(status>=500){
    const info=logFailure('request',error);
    return res.status(status).json({error:info.message,code:info.code});
  }
  res.status(status).json({error:error.message});
});
// Não há top-level await, migração automática, escrita de JSON ou ativos em disco.
fs.mkdir(models,{recursive:true}).then(()=>app.listen(port,'0.0.0.0',()=>{
  console.log(`Aplicação 1.3.1 em http://localhost:${port}; verificação MySQL pendente.`);
  store.ready().then(()=>store.branding()).then(()=>{
    console.log('[OK] MySQL, esquema, importação e identidade visual disponíveis.');
  }).catch(error=>logFailure('startup',error));
})).catch(error=>{console.error('Falha ao preparar models:',error.code);process.exitCode=1;});
