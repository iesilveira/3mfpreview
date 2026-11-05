import mysql from 'mysql2/promise';
import fs from 'node:fs';
let pool;
export function getPool() {
  if(pool) return pool;
  for(const key of ['DB_NAME','DB_USER','DB_PASSWORD'])
    if(!Object.hasOwn(process.env,key) || (key!=='DB_PASSWORD' && !process.env[key]))
      throw new Error(`Configure ${key} no ambiente.`);
  const port=Number(process.env.DB_PORT || 3306);
  if(!Number.isInteger(port) || port<1 || port>65535) throw new Error('DB_PORT inválida.');
  const ssl=String(process.env.DB_SSL || 'false').toLowerCase()==='true';
  pool=mysql.createPool({
    host:process.env.DB_HOST || '127.0.0.1',port,user:process.env.DB_USER,
    password:process.env.DB_PASSWORD,database:process.env.DB_NAME,
    charset:'utf8mb4',connectionLimit:5,queueLimit:50,waitForConnections:true,
    connectTimeout:10000,enableKeepAlive:true,multipleStatements:false,
    supportBigNumbers:true,bigNumberStrings:true,
    ...(ssl?{ssl:{rejectUnauthorized:true,...(process.env.DB_SSL_CA?
      {ca:fs.readFileSync(process.env.DB_SSL_CA,'utf8')}: {})}}:{})
  });
  return pool;
}
export async function closePool() {if(pool){const p=pool;pool=undefined;await p.end();}}
