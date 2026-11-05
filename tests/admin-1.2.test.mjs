import test from 'node:test';
import assert from 'node:assert/strict';
import {installAdminAuth} from '../server/admin-auth.js';
import {hashPassword,verifyPassword,sha,emailValue} from '../server/passwords.js';
import {DEFAULT_BRANDING,validateBranding} from '../shared/branding.js';
import {imageExtension} from '../server/assets.js';
function fakeStore(){
  const users=new Map(),sessions=new Map(),attempts=new Map();
  let consumed=false;
  return {users,sessions,
    async setupRequired(){return !consumed&&!users.size;},
    async initialAdmin(email,password_hash,digest){if(consumed)throw Object.assign(new Error('encerrado'),{status:409});
      if(digest!==sha('a'.repeat(64)))throw Object.assign(new Error('token'),{status:403});
      users.set(email,{id:1,email,password_hash,active:1,auth_version:1});consumed=true;},
    async rate(key,max){const n=attempts.get(key)||0;attempts.set(key,n+1);return n>=max?900:0;},
    async clearRate(key){attempts.delete(key);},
    async findUser(email){return users.get(email);},
    async userById(id){return [...users.values()].find(u=>u.id===id);},
    async createSession(user,token_hash,csrf,expires){sessions.set(token_hash,{token_hash,csrf,expires,userId:user.id,email:user.email});},
    async session(hash){const s=sessions.get(hash);return s&&s.expires>Date.now()?s:null;},
    async revoke(hash){sessions.delete(hash);},
    async changeAccount(user,email,password_hash){users.delete(user.email);users.set(email,{...user,email,password_hash,auth_version:user.auth_version+1});sessions.clear();},
    async cleanup(){}
  };
}
function fixture(store=fakeStore()){
  const routes=new Map(),app={use(){},get(p,...h){routes.set('GET '+p,h);},post(p,...h){routes.set('POST '+p,h);},patch(p,...h){routes.set('PATCH '+p,h);}};
  installAdminAuth(app,{store});
  async function call(method,path,{body={},cookie='',csrf='',origin='http://localhost:3001',ip='test'}={}){
    const headers={host:'localhost:3001',origin,cookie,'x-csrf-token':csrf,'content-type':'application/json'};
    const req={method,body,ip,secure:false,get:k=>headers[k.toLowerCase()]};
    const res={statusCode:200,status(n){this.statusCode=n;return this;},set(){return this;},
      json(body){this.body=body;return this;},cookie(k,v,o){this.cookieValue=k+'='+v;this.options=o;return this;},clearCookie(){this.cleared=true;return this;}};
    const handlers=routes.get(method+' '+path);let i=0;
    const next=async error=>{if(error)throw error;const fn=handlers[i++];if(fn)return fn(req,res,next);};
    try{await next();}catch(error){res.statusCode=error.status||500;res.body={error:error.message};}
    return res;
  }
  return {call,store};
}
test('senhas: salt exclusivo, verificação, ausência de segredo em texto puro',async()=>{
  const password='Exclusiva-123456!',a=await hashPassword(password),b=await hashPassword(password);
  assert.notEqual(a,b);assert.ok(!a.includes(password));assert.ok(await verifyPassword(password,a));
  assert.equal(await verifyPassword('errada',a),false);assert.equal(await verifyPassword('errada',null),false);
  assert.equal(emailValue(' ADMIN@EXAMPLE.COM '),'admin@example.com');
});
test('cadastro protegido, login, CSRF, origem, logout e persistência via adapter',async()=>{
  const f=fixture();
  assert.equal((await f.call('GET','/api/auth/status')).body.setupRequired,true);
  const body={email:'admin@example.com',password:'Exclusiva-123456!',token:'a'.repeat(64)};
  assert.equal((await f.call('POST','/api/auth/setup',{body:{...body,token:'b'.repeat(64)}})).statusCode,403);
  assert.equal((await f.call('POST','/api/auth/setup',{body})).statusCode,201);
  assert.equal((await f.call('POST','/api/auth/setup',{body})).statusCode,409);
  const login=await f.call('POST','/api/auth/login',{body});
  assert.equal(login.statusCode,200);assert.equal(login.options.httpOnly,true);assert.equal(login.options.sameSite,'strict');
  assert.equal((await f.call('GET','/api/auth/session',{cookie:login.cookieValue})).body.email,body.email);
  const restarted=fixture(f.store);
  assert.equal((await restarted.call('GET','/api/auth/session',{cookie:login.cookieValue})).statusCode,200);
  assert.equal((await f.call('POST','/api/auth/logout',{cookie:login.cookieValue})).statusCode,403);
  assert.equal((await f.call('POST','/api/auth/logout',{cookie:login.cookieValue,csrf:login.body.csrfToken,origin:'https://evil.invalid'})).statusCode,403);
  assert.equal((await f.call('POST','/api/auth/logout',{cookie:login.cookieValue,csrf:login.body.csrfToken})).body.ok,true);
  assert.equal((await restarted.call('GET','/api/auth/session',{cookie:login.cookieValue})).statusCode,401);
});
test('limite persistido no adapter e troca de conta revogando sessões',async()=>{
  const f=fixture(),body={email:'a@example.com',password:'Exclusiva-123456!',token:'a'.repeat(64)};
  await f.call('POST','/api/auth/setup',{body});
  for(let n=0;n<10;n++)await f.call('POST','/api/auth/login',{body:{email:'bad@example.com',password:'wrong'},ip:'bad'});
  assert.equal((await f.call('POST','/api/auth/login',{body,ip:'bad'})).statusCode,429);
  const login=await f.call('POST','/api/auth/login',{body});
  const changed=await f.call('PATCH','/api/admin/account',{cookie:login.cookieValue,csrf:login.body.csrfToken,
    body:{email:'new@example.com',currentPassword:body.password,newPassword:'Outra-exclusiva-123!'}});
  assert.equal(changed.statusCode,200);
  assert.equal((await f.call('GET','/api/auth/session',{cookie:login.cookieValue})).statusCode,401);
  assert.equal((await f.call('POST','/api/auth/login',{body:{email:'new@example.com',password:'Outra-exclusiva-123!'}})).statusCode,200);
});
test('identidade, validação de ativos e URLs preservadas',()=>{
  assert.equal(DEFAULT_BRANDING.primaryColor,'#0572cf');assert.equal(DEFAULT_BRANDING.secondaryColor,'#e62526');
  assert.equal(validateBranding({accountLabel:'Conta'}).accountLabel,'Conta');
  assert.throws(()=>validateBranding({logoUrl:'javascript:alert(1)'}));
  assert.throws(()=>imageExtension(Buffer.from('not an image')));
});
