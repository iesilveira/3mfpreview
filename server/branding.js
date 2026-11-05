import crypto from 'node:crypto';
import multer from 'multer';
import { ASSET_PATTERN } from '../shared/branding.js';
import { MIME,imageExtension } from './assets.js';
export function installBranding(app,{store,requireAdmin}) {
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1,fields:1,parts:2}});
  app.get('/api/branding',async(_req,res,next)=>{
    try{res.set('Cache-Control','no-store').json(await store.branding());}catch(error){next(error);}
  });
  app.put('/api/admin/branding',requireAdmin,async(req,res,next)=>{
    try{res.json(await store.saveBranding(req.body));}catch(error){if(!error.code&&!error.status)error.status=400;next(error);}
  });
  app.post('/api/admin/branding/assets',requireAdmin,upload.single('asset'),async(req,res,next)=>{
    try{
      const kind=req.body?.kind;
      if(!['logo','favicon'].includes(kind))return res.status(400).json({error:'Tipo de imagem inválido.'});
      let extension;
      try{extension=imageExtension(req.file?.buffer);}catch(error){error.status=400;throw error;}
      if(!(kind==='favicon'?['png','ico']:['png','jpg','webp']).includes(extension))
        return res.status(400).json({error:kind==='favicon'?'Favicon: PNG ou ICO.':'Logo: PNG, JPG ou WebP.'});
      const name=`${crypto.randomUUID()}.${extension}`;
      await store.saveAsset(name,MIME[extension],req.file.buffer);
      res.status(201).json({url:`/api/branding-assets/${name}`});
    }catch(error){next(error);}
  });
  app.get('/api/branding-assets/:name',async(req,res,next)=>{
    try{
      if(!ASSET_PATTERN.test(`/api/branding-assets/${req.params.name}`))return res.status(404).end();
      const asset=await store.asset(req.params.name);
      if(!asset)return res.status(404).end();
      res.set('X-Content-Type-Options','nosniff').set('Content-Security-Policy',"default-src 'none'");
      res.set('Cache-Control','public, max-age=86400, immutable').type(asset.mime).send(asset.content);
    }catch(error){next(error);}
  });
}
