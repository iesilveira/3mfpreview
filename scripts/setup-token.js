import crypto from 'node:crypto';
import {loadEnvironment} from './runtime-env.js';
import {getPool,closePool} from '../server/db.js';
import {createStore} from '../server/store.js';
import {sha} from '../server/passwords.js';
async function main(){
  loadEnvironment();
  const store=createStore(getPool);await store.ready();
  const token=crypto.randomBytes(32).toString('hex'),expires=Date.now()+30*60*1000;
  await store.transaction(async connection=>{
    const [states]=await connection.execute('SELECT * FROM mf3_state WHERE id=1 FOR UPDATE');
    const [counts]=await connection.execute('SELECT COUNT(*) AS n FROM mf3_admins');
    if(states[0].setup_consumed||Number(counts[0].n)>0)throw new Error('Cadastro inicial já encerrado.');
    await connection.execute('UPDATE mf3_state SET setup_hash=?,setup_expires_ms=? WHERE id=1',[sha(token),expires]);
  });
  console.log('Token de cadastro inicial (válido por 30 minutos, uso único):\n'+token);
  console.log('Abra a aplicação e informe este token para cadastrar o administrador. Não compartilhe.');
}
main().catch(error=>{console.error('[ERRO]',error.code||error.message);process.exitCode=1;}).finally(()=>closePool().catch(()=>{}));
