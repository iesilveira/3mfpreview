import crypto from 'node:crypto';
import { sha,equal,emailValue,checkNewPassword,hashPassword,verifyPassword } from './passwords.js';
const COOKIE='preview_admin_session',TTL=8*60*60*1000;
export function sameOrigin(req,res) {
  try {
    const origin=new URL(String(req.get('origin')||''));
    if(!['http:','https:'].includes(origin.protocol) || origin.host.toLowerCase()!==String(req.get('host')||'').toLowerCase()) throw new Error();
    return true;
  } catch {res.status(403).json({error:'Origem da solicitação inválida.'});return false;}
}
export function installAdminAuth(app,{store}={}) {
  if(!store) throw new Error('Armazenamento MySQL obrigatório.');
  let hashing=0;
  const expensive=async work=>{
    if(hashing>=2) throw Object.assign(new Error('Autenticação ocupada. Tente novamente.'),{status:429});
    hashing++;try{return await work();}finally{hashing--;}
  };
  const cookieOptions=req=>{const value=String(process.env.COOKIE_SECURE||'auto').toLowerCase();
    return {httpOnly:true,sameSite:'strict',path:'/',secure:value==='true' || (value!=='false'&&(process.env.NODE_ENV==='production'||Boolean(req.secure)))};};
  const tokenFrom=req=>String(req.get('cookie')||'').match(/(?:^|;\s*)preview_admin_session=([a-f0-9]{64})(?:;|$)/)?.[1]||'';
  const sessionFrom=req=>{const token=tokenFrom(req);return token?store.session(sha(token)):Promise.resolve(null);};
  const limited=async(req,res,key,max=10)=>{
    const delay=await store.rate(key,max);
    if(!delay)return false;
    res.set('Retry-After',String(delay)).status(429).json({error:'Muitas tentativas. Aguarde e tente novamente.'});
    return true;
  };
  async function requireAdmin(req,res,next) {
    try {
      res.set('Cache-Control','no-store');
      const session=await sessionFrom(req);
      if(!session)return res.status(401).json({error:'Sessão expirada. Entre novamente.'});
      if(!['GET','HEAD','OPTIONS'].includes(req.method)){
        if(!sameOrigin(req,res))return;
        if(!equal(req.get('x-csrf-token')||'',session.csrf))
          return res.status(403).json({error:'Token de segurança inválido. Recarregue o painel.'});
      }
      req.adminSession=session;return next();
    }catch(error){return next(error);}
  }
  app.use('/api/auth',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.use('/api/admin',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.get('/api/auth/status',async(_req,res,next)=>{
    try{res.json({setupRequired:await store.setupRequired()});}catch(error){next(error);}
  });
  app.post('/api/auth/setup',async(req,res,next)=>{
    try{
      if(!sameOrigin(req,res))return;
      if(await limited(req,res,'setup:'+req.ip))return;
      if(!String(req.get('content-type')||'').startsWith('application/json'))return res.status(415).json({error:'Envie JSON.'});
      const email=emailValue(req.body?.email),password=checkNewPassword(req.body?.password);
      const token=String(req.body?.token||'').trim().toLowerCase();
      if(!/^[a-f0-9]{64}$/.test(token))return res.status(403).json({error:'Token de instalação inválido ou expirado.'});
      const hash=await expensive(()=>hashPassword(password));
      await store.initialAdmin(email,hash,sha(token));
      res.status(201).json({ok:true});
    }catch(error){next(error);}
  });
  app.post('/api/auth/login',async(req,res,next)=>{
    try{
      if(!sameOrigin(req,res))return;
      if(!String(req.get('content-type')||'').startsWith('application/json'))return res.status(415).json({error:'Envie JSON.'});
      const key='login:'+req.ip;
      if(await limited(req,res,key))return;
      let email;try{email=emailValue(req.body?.email);}catch{return res.status(401).json({error:'E-mail ou senha inválidos.'});}
      const user=await store.findUser(email);
      const valid=await expensive(()=>verifyPassword(req.body?.password,user?.password_hash));
      if(!valid || !user?.active)return res.status(401).json({error:'E-mail ou senha inválidos.'});
      await store.clearRate(key);
      const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex');
      await store.createSession(user,sha(token),csrf,Date.now()+TTL);
      const old=tokenFrom(req);if(old)await store.revoke(sha(old));
      res.cookie(COOKIE,token,{...cookieOptions(req),maxAge:TTL});
      res.json({email:user.email,csrfToken:csrf});
      store.cleanup().catch(()=>{});
    }catch(error){next(error);}
  });
  app.get('/api/auth/session',requireAdmin,(req,res)=>res.json({email:req.adminSession.email,csrfToken:req.adminSession.csrf}));
  app.post('/api/auth/logout',requireAdmin,async(req,res,next)=>{
    try{await store.revoke(req.adminSession.token_hash);res.clearCookie(COOKIE,cookieOptions(req));res.json({ok:true});}catch(error){next(error);}
  });
  app.get('/api/admin/account',requireAdmin,(req,res)=>res.json({email:req.adminSession.email}));
  app.patch('/api/admin/account',requireAdmin,async(req,res,next)=>{
    try{
      const key='account:'+req.adminSession.userId;
      if(await limited(req,res,key,5))return;
      const user=await store.userById(req.adminSession.userId);
      if(!user || !await expensive(()=>verifyPassword(req.body?.currentPassword,user.password_hash)))
        return res.status(401).json({error:'Senha atual inválida.'});
      const email=emailValue(req.body?.email);
      const password=String(req.body?.newPassword||'');
      const hash=password?await expensive(()=>hashPassword(password)):user.password_hash;
      await store.changeAccount(user,email,hash);
      await store.clearRate(key);
      res.clearCookie(COOKIE,cookieOptions(req));
      res.json({ok:true,loginRequired:true});
    }catch(error){if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'E-mail já utilizado.'});next(error);}
  });
  return {requireAdmin};
}
