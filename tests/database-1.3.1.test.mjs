import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseOptions } from '../server/database-config.js';
import { describeDatabaseError, logFailure } from '../server/database-diagnostics.js';
const env = {DB_HOST:'localhost', DB_PORT:'3306', DB_NAME:'test_db',
  DB_USER:'test_user', DB_PASSWORD:'senha-apenas-de-teste'};
test('host/porta confirmados e senha nunca alterada', () => {
  const options=databaseOptions({...env, DB_PASSWORD:' # x $ ! '});
  assert.equal(options.host,'localhost');assert.equal(options.port,3306);
  assert.equal(options.password,' # x $ ! ');assert.equal(options.multipleStatements,false);
});
test('localhost:3306 também é normalizado; conflito é recusado', () => {
  assert.equal(databaseOptions({...env,DB_HOST:'localhost:3306'}).host,'localhost');
  assert.equal(databaseOptions({...env,DB_HOST:'localhost:3306',DB_PORT:''}).port,3306);
  assert.throws(()=>databaseOptions({...env,DB_HOST:'localhost:3307'}),{code:'DB_CONFIG_PORT'});
  assert.equal(databaseOptions({...env,DB_HOST:'[::1]:3306'}).host,'::1');
});
test('configuração ausente ou inválida falha antes da conexão', () => {
  for(const key of ['DB_NAME','DB_USER','DB_PASSWORD'])
    assert.throws(()=>databaseOptions({...env,[key]:''}),{code:'DB_CONFIG_MISSING'});
  assert.throws(()=>databaseOptions({...env,DB_PORT:'3306x'}),{code:'DB_CONFIG_PORT'});
  assert.throws(()=>databaseOptions({...env,DB_PORT:'0'}),{code:'DB_CONFIG_PORT'});
  assert.throws(()=>databaseOptions({...env,DB_HOST:'mysql://localhost'}),{code:'DB_CONFIG_HOST'});
  assert.throws(()=>databaseOptions({...env,DB_SSL:'yes'}),{code:'DB_CONFIG_TLS'});
  assert.equal(databaseOptions({...env,DB_SSL:'true'}).ssl.rejectUnauthorized,true);
});
test('erros encadeados distinguem conexão/credencial/migração', () => {
  const refused=Object.assign(new Error('secreto'),{code:'ECONNREFUSED'});
  assert.equal(describeDatabaseError(new AggregateError([refused],'oculto')).code,'ECONNREFUSED');
  for(const code of ['ER_ACCESS_DENIED_ERROR','ER_BAD_DB_ERROR','ER_NO_SUCH_TABLE'])
    assert.equal(describeDatabaseError(Object.assign(new Error(),{code})).code,code);
  assert.equal(describeDatabaseError(new Error('Migração MySQL 1.3.0 não aplicada.')).code,'SCHEMA_MISMATCH');
  assert.equal(describeDatabaseError(new Error('Importação pendente. Execute manualmente.')).code,'IMPORT_PENDING');
  assert.equal(describeDatabaseError(new Error('Configuração visual ausente. Verifique a importação.')).code,'BRANDING_MISSING');
});
test('diagnóstico não revela mensagem crua, SQL ou senha', () => {
  const secret='NAO-PODE-APARECER-123!';
  const error=Object.assign(new Error(secret),{code:'ER_ACCESS_DENIED_ERROR',
    sql:`SELECT '${secret}'`,sqlMessage:secret});
  const printed=[];const original=console.error;
  try {console.error=(...args)=>printed.push(args.join(' '));logFailure('teste',error);}
  finally {console.error=original;}
  assert.ok(!JSON.stringify(describeDatabaseError(error)).includes(secret));
  assert.ok(!printed.join('').includes(secret));
  assert.ok(printed.join('').includes('ER_ACCESS_DENIED_ERROR'));
});
