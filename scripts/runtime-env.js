import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from 'node:process';
export const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function loadEnvironment(){
  try{loadEnvFile(path.join(projectRoot,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
}
