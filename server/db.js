import mysql from 'mysql2/promise';
import fs from 'node:fs';
import { databaseOptions } from './database-config.js';
let pool;
export function getPool() {
  if (pool) return pool;
  const options = databaseOptions();
  if (options.ssl && process.env.DB_SSL_CA)
    options.ssl.ca = fs.readFileSync(process.env.DB_SSL_CA, 'utf8');
  pool = mysql.createPool(options);
  return pool;
}
export async function closePool() {
  if (pool) { const current = pool; pool = undefined; await current.end(); }
}
