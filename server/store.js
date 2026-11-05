import { sha,equal } from './passwords.js';
import { DEFAULT_BRANDING,validateBranding } from '../shared/branding.js';
export const problem=(status,message)=>Object.assign(new Error(message),{status});
export function createStore(poolProvider) {
  const pool=()=>typeof poolProvider==='function'?poolProvider():poolProvider;
  const rows=async(sql,args=[])=>{const [result]=await pool().execute(sql,args);return result;};
  async function transaction(work) {
    const connection=await pool().getConnection();
    try {await connection.beginTransaction();const result=await work(connection);
      await connection.commit();return result;
    } catch(error) {await connection.rollback().catch(()=>{});throw error;}
    finally {connection.release();}
  }
  const select=async(connection,sql,args=[])=>{const [result]=await connection.execute(sql,args);return result;};
  async function state() {
    const result=await rows('SELECT * FROM mf3_state WHERE id=1');
    if(!result[0] || result[0].schema_version!=='1.3.0') throw problem(503,'Migração MySQL 1.3.0 não aplicada.');
    return result[0];
  }
  async function ready() {
    const value=await state();
    if(!value.data_ready) throw problem(503,'Importação pendente. Execute npm run data:import -- --confirm-stopped.');
    return value;
  }
  async function setupRequired() {
    const value=await ready();
    const count=await rows('SELECT COUNT(*) AS n FROM mf3_admins');
    return !value.setup_consumed && Number(count[0].n)===0;
  }
  async function rate(key,max=10,window=900000) {
    const id=sha(key),now=Date.now();
    return transaction(async connection=>{
      await connection.execute('INSERT INTO mf3_attempts (rate_key,hits,reset_ms) VALUES (?,0,?) ON DUPLICATE KEY UPDATE rate_key=VALUES(rate_key)',[id,now+window]);
      const [record]=await select(connection,'SELECT hits,reset_ms FROM mf3_attempts WHERE rate_key=? FOR UPDATE',[id]);
      let hits=Number(record.hits),reset=Number(record.reset_ms);
      if(reset<=now){hits=0;reset=now+window;}
      if(hits>=max) return Math.max(1,Math.ceil((reset-now)/1000));
      await connection.execute('UPDATE mf3_attempts SET hits=?,reset_ms=? WHERE rate_key=?',[hits+1,reset,id]);
      return 0;
    });
  }
  const clearRate=key=>rows('DELETE FROM mf3_attempts WHERE rate_key=?',[sha(key)]);
  async function initialAdmin(email,passwordHash,tokenDigest) {
    return transaction(async connection=>{
      const [value]=await select(connection,'SELECT * FROM mf3_state WHERE id=1 FOR UPDATE');
      const [count]=await select(connection,'SELECT COUNT(*) AS n FROM mf3_admins');
      if(!value?.data_ready) throw problem(503,'Importação pendente.');
      if(value.setup_consumed || Number(count.n)>0) throw problem(409,'Cadastro inicial encerrado.');
      if(!value.setup_hash || Number(value.setup_expires_ms)<=Date.now() || !equal(value.setup_hash,tokenDigest))
        throw problem(403,'Token de instalação inválido ou expirado.');
      await connection.execute('INSERT INTO mf3_admins (email,password_hash) VALUES (?,?)',[email,passwordHash]);
      await connection.execute('UPDATE mf3_state SET setup_consumed=1,setup_hash=NULL,setup_expires_ms=NULL WHERE id=1');
    });
  }
  const findUser=email=>rows('SELECT id,email,password_hash,auth_version,active FROM mf3_admins WHERE email=? LIMIT 1',[email]).then(r=>r[0]);
  const userById=id=>rows('SELECT id,email,password_hash,auth_version,active FROM mf3_admins WHERE id=? LIMIT 1',[id]).then(r=>r[0]);
  async function createSession(user,tokenHash,csrf,expires) {
    const result=await rows('INSERT INTO mf3_sessions (token_hash,user_id,csrf_token,auth_version,expires_ms) SELECT ?,id,?,auth_version,? FROM mf3_admins WHERE id=? AND active=1 AND auth_version=?',
      [tokenHash,csrf,expires,user.id,user.auth_version]);
    if(result.affectedRows!==1) throw problem(401,'Conta alterada. Entre novamente.');
  }
  async function session(tokenHash) {
    const records=await rows('SELECT s.token_hash,s.csrf_token AS csrf,s.expires_ms AS expires,u.id AS userId,u.email,u.auth_version FROM mf3_sessions s JOIN mf3_admins u ON u.id=s.user_id AND u.auth_version=s.auth_version WHERE s.token_hash=? AND s.expires_ms>? AND u.active=1 LIMIT 1',[tokenHash,Date.now()]);
    return records[0];
  }
  const revoke=tokenHash=>rows('DELETE FROM mf3_sessions WHERE token_hash=?',[tokenHash]);
  async function changeAccount(user,email,passwordHash) {
    return transaction(async connection=>{
      const [current]=await select(connection,'SELECT auth_version FROM mf3_admins WHERE id=? AND active=1 FOR UPDATE',[user.id]);
      if(!current || Number(current.auth_version)!==Number(user.auth_version)) throw problem(409,'Conta alterada. Entre novamente.');
      await connection.execute('UPDATE mf3_admins SET email=?,password_hash=?,auth_version=auth_version+1 WHERE id=?',[email,passwordHash,user.id]);
      await connection.execute('DELETE FROM mf3_sessions WHERE user_id=?',[user.id]);
    });
  }
  const listProjects=()=>rows('SELECT payload FROM mf3_projects ORDER BY created_at DESC,id').then(r=>r.map(v=>JSON.parse(v.payload)));
  const byToken=token=>rows('SELECT payload FROM mf3_projects WHERE token=? LIMIT 1',[token]).then(r=>r[0]?JSON.parse(r[0].payload):null);
  async function createProject(project) {
    await rows('INSERT INTO mf3_projects (id,token,created_at,payload) VALUES (?,?,?,?)',
      [project.id,project.token,project.createdAt,JSON.stringify(project)]);
  }
  async function decide(token,status,comment) {
    return transaction(async connection=>{
      const [record]=await select(connection,'SELECT id,payload FROM mf3_projects WHERE token=? FOR UPDATE',[token]);
      if(!record) throw problem(404,'Link de revisão não encontrado.');
      const project=JSON.parse(record.payload);
      project.status=status;project.decisionComment=comment;project.decisionAt=new Date().toISOString();
      await connection.execute('UPDATE mf3_projects SET payload=? WHERE id=?',[JSON.stringify(project),record.id]);
      await connection.execute('INSERT INTO mf3_decisions (project_id,status,comment,decided_at) VALUES (?,?,?,?)',[record.id,status,comment,project.decisionAt]);
      return project;
    });
  }
  async function branding() {
    const result=await rows('SELECT payload FROM mf3_branding WHERE id=1');
    if(!result[0]) throw problem(503,'Configuração visual ausente. Verifique a importação.');
    return validateBranding(JSON.parse(result[0].payload));
  }
  async function saveBranding(input) {
    return transaction(async connection=>{
      const [current]=await select(connection,'SELECT payload FROM mf3_branding WHERE id=1 FOR UPDATE');
      if(!current) throw problem(503,'Configuração visual ausente.');
      const value=validateBranding(input,JSON.parse(current.payload));
      for(const key of ['logoUrl','faviconUrl']) {
        if(!value[key]) continue;
        const name=value[key].split('/').pop();
        const result=await select(connection,'SELECT name FROM mf3_assets WHERE name=?',[name]);
        if(!result.length) throw problem(400,'Arquivo de identidade não encontrado.');
      }
      await connection.execute('UPDATE mf3_branding SET payload=? WHERE id=1',[JSON.stringify(value)]);
      return value;
    });
  }
  const asset=name=>rows('SELECT mime,content FROM mf3_assets WHERE name=? LIMIT 1',[name]).then(r=>r[0]);
  const saveAsset=(name,mime,buffer)=>rows('INSERT INTO mf3_assets (name,mime,content,sha256) VALUES (?,?,?,?)',[name,mime,buffer,sha(buffer)]);
  async function cleanup() {
    await rows('DELETE FROM mf3_sessions WHERE expires_ms<=? LIMIT 1000',[Date.now()]);
    await rows('DELETE FROM mf3_attempts WHERE reset_ms<=? LIMIT 1000',[Date.now()]);
  }
  return {state,ready,setupRequired,rate,clearRate,initialAdmin,findUser,userById,createSession,session,revoke,
    changeAccount,listProjects,byToken,createProject,decide,branding,saveBranding,asset,saveAsset,cleanup,transaction};
}
