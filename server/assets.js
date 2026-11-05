export const MIME={png:'image/png',jpg:'image/jpeg',webp:'image/webp',ico:'image/x-icon'};
export function imageExtension(buffer) {
  if(!Buffer.isBuffer(buffer)||buffer.length<4||buffer.length>2*1024*1024)throw new Error('Imagem inválida ou acima de 2 MB.');
  if(buffer.length>=24 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    const w=buffer.readUInt32BE(16),h=buffer.readUInt32BE(20);
    if(!w||!h||w>4096||h>4096)throw new Error('PNG deve ter até 4096 × 4096 pixels.');
    return 'png';
  }
  if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return 'jpg';
  if(buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return 'webp';
  if(buffer.length>=6&&buffer.readUInt16LE(0)===0&&buffer.readUInt16LE(2)===1&&buffer.readUInt16LE(4)>0)return 'ico';
  throw new Error('Formato de imagem não permitido.');
}
