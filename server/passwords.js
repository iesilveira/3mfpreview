import crypto from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(crypto.scrypt);
export const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export function equal(a,b) {
  const x=Buffer.from(String(a)),y=Buffer.from(String(b));
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}
export function emailValue(value) {
  const email=String(value ?? '').trim().toLowerCase();
  if(email.length>254 || !/^[\x21-\x7e]+$/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Object.assign(new Error('Informe um e-mail válido.'),{status:400});
  return email;
}
export function checkNewPassword(value) {
  if(typeof value!=='string' || value.length<12 || value.length>1024)
    throw Object.assign(new Error('A senha deve ter de 12 a 1024 caracteres.'),{status:400});
  return value;
}
export async function hashPassword(password) {
  checkNewPassword(password);
  const salt=crypto.randomBytes(32).toString('hex');
  const hash=await derive(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
  return `scrypt$32768$8$3$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password,record) {
  if(typeof password!=='string' || password.length>1024) return false;
  const parts=String(record || '').split('$');
  const valid=parts.length===6 && parts[0]==='scrypt' && parts[1]==='32768'
    && parts[2]==='8' && parts[3]==='3' && /^[a-f0-9]{64}$/.test(parts[4])
    && /^[a-f0-9]{128}$/.test(parts[5]);
  const salt=valid?parts[4]:'0'.repeat(64);
  const hash=await derive(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
  return valid && equal(hash.toString('hex'),parts[5]);
}
