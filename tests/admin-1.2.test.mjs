import test from 'node:test';
import assert from 'node:assert/strict';
import { installAdminAuth } from '../server/admin-auth.js';
import { validateBranding, DEFAULT_BRANDING } from '../shared/branding.js';
function fixture() {
  const routes=new Map();
  const app={use(){}, get(path,...handlers){routes.set('GET '+path,handlers);},
    post(path,...handlers){routes.set('POST '+path,handlers);}};
  const auth=installAdminAuth(app,{email:'admin@example.com',password:'Senha-unica-123456!'});
  const request=(method='GET',extra={}) => ({
    method,ip:'127.0.0.1',secure:false,body:{},
    get(name){return this.headers[name.toLowerCase()];},
    headers:{host:'localhost:3001',origin:'http://localhost:3001','content-type':'application/json'},
    ...extra
  });
  const response=() => ({
    statusCode:200,headers:{},status(code){this.statusCode=code;return this;},
    set(k,v){this.headers[k]=v;return this;},
    cookie(k,v,options){this.cookieValue=`${k}=${v}`;this.cookieOptions=options;return this;},
    clearCookie(){this.cleared=true;return this;},json(body){this.body=body;return this;}
  });
  async function call(method,path,req=request(method)){
    const res=response(),handlers=routes.get(method+' '+path);
    let index=0;
    async function next(error){if(error)throw error; const fn=handlers[index++];if(fn)await fn(req,res,next);}
    await next();return res;
  }
  return {auth,call,request,response};
}
test('sessão, e-mail/senha, cookie, CSRF, origem, logout e chave legada',async()=>{
  const f=fixture();
  const anonymous=await f.call('GET','/api/auth/session');
  assert.equal(anonymous.statusCode,401);
  const legacy=f.request('GET');legacy.headers['x-admin-password']='Senha-unica-123456!';
  assert.equal((await f.call('GET','/api/auth/session',legacy)).statusCode,401);
  let login=f.request('POST',{body:{email:'wrong@example.com',password:'Senha-unica-123456!'}});
  assert.equal((await f.call('POST','/api/auth/login',login)).statusCode,401);
  login=f.request('POST',{body:{email:'ADMIN@example.com',password:'Senha-unica-123456!'}});
  const accepted=await f.call('POST','/api/auth/login',login);
  assert.equal(accepted.statusCode,200);
  assert.equal(accepted.cookieOptions.httpOnly,true);
  assert.equal(accepted.cookieOptions.sameSite,'strict');
  assert.equal(accepted.body.csrfToken.length,64);
  const req=f.request('GET');req.headers.cookie=accepted.cookieValue;
  assert.equal((await f.call('GET','/api/auth/session',req)).body.email,'admin@example.com');
  const logout=f.request('POST');logout.headers.cookie=accepted.cookieValue;
  assert.equal((await f.call('POST','/api/auth/logout',logout)).statusCode,403);
  logout.headers['x-csrf-token']=accepted.body.csrfToken;
  logout.headers.origin='https://attacker.invalid';
  assert.equal((await f.call('POST','/api/auth/logout',logout)).statusCode,403);
  logout.headers.origin='http://localhost:3001';
  assert.equal((await f.call('POST','/api/auth/logout',logout)).body.ok,true);
  assert.equal((await f.call('GET','/api/auth/session',req)).statusCode,401);
});
test('bloqueio após dez tentativas inválidas',async()=>{
  const f=fixture();
  for(let n=0;n<10;n++){
    const req=f.request('POST',{body:{email:'admin@example.com',password:'errada'}});
    assert.equal((await f.call('POST','/api/auth/login',req)).statusCode,401);
  }
  assert.equal((await f.call('POST','/api/auth/login',f.request('POST'))).statusCode,429);
});
test('configuração ausente falha fechada',async()=>{
  const routes=new Map();
  const app={use(){},get(){},post(path,...fn){routes.set(path,fn);}};
  installAdminAuth(app,{email:'',password:''});
  const f=fixture(),req=f.request('POST'),res=f.response();
  await routes.get('/api/auth/login')[0](req,res,error=>{if(error)throw error;});
  assert.equal(res.statusCode,503);
});
test('cores padrão, campos, URLs e textos são validados',()=>{
  assert.equal(DEFAULT_BRANDING.primaryColor,'#0572cf');
  assert.equal(DEFAULT_BRANDING.secondaryColor,'#e62526');
  assert.equal(validateBranding({headerText:''}).headerText,'');
  assert.equal(validateBranding({primaryColor:'#ABCDEF'}).primaryColor,'#abcdef');
  assert.throws(()=>validateBranding({primaryColor:'red'}));
  assert.throws(()=>validateBranding({logoUrl:'javascript:alert(1)'}));
  assert.throws(()=>validateBranding({faviconUrl:'https://external.invalid/a.png'}));
  assert.throws(()=>validateBranding({unknown:'x'}));
  assert.throws(()=>validateBranding({footerLeft:'x'.repeat(241)}));
});
