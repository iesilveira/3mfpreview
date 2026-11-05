import { loadEnvironment } from './runtime-env.js';
import { getPool, closePool } from '../server/db.js';
import { createStore } from '../server/store.js';
import { databaseOptions } from '../server/database-config.js';
import { logFailure } from '../server/database-diagnostics.js';
async function main() {
  loadEnvironment();
  const options = databaseOptions();
  console.log(`Verificando MySQL em ${options.host}:${options.port} (somente leitura).`);
  await getPool().execute('SELECT 1 AS ok');
  console.log('[OK] Conexão e autenticação MySQL.');
  const store = createStore(getPool);
  await store.ready();
  console.log('[OK] Esquema 1.3.0 e importação de dados.');
  await store.branding();
  console.log('[OK] Identidade visual no banco.');
  console.log('[OK] Diagnóstico concluído; nenhuma escrita executada.');
}
main().catch(error => {
  logFailure('db:check', error); process.exitCode = 1;
}).finally(() => closePool().catch(() => {}));
