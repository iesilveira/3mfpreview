import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { DEFAULT_BRANDING, validateBranding, ASSET_PATTERN } from '../shared/branding.js';
export function installBranding(app, { dataDir, requireAdmin }) {
  const root = path.resolve(dataDir);
  const directory = path.join(root, 'branding-assets');
  const config = path.join(root, 'branding.json');
  const ready = fs.mkdir(directory, { recursive: true });
  let writeQueue = Promise.resolve();
  const read = async () => {
    try { return validateBranding(JSON.parse(await fs.readFile(config, 'utf8'))); }
    catch (error) { if (error.code === 'ENOENT') return { ...DEFAULT_BRANDING }; throw error; }
  };
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1, parts: 2 }
  });
  app.get('/api/branding', async (_req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json(await read()); } catch (error) { next(error); }
  });
  app.put('/api/admin/branding', requireAdmin, async (req, res, next) => {
    const operation = writeQueue.then(async () => {
      const nextSettings = validateBranding(req.body, await read());
      for (const key of ['logoUrl', 'faviconUrl']) {
        if (nextSettings[key]) await fs.access(path.join(directory, path.basename(nextSettings[key])));
      }
      const temp = path.join(root, `.branding-${crypto.randomUUID()}.tmp`);
      try {
        await fs.writeFile(temp, JSON.stringify(nextSettings, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
        await fs.rename(temp, config);
      } catch (error) { await fs.unlink(temp).catch(() => {}); throw error; }
      return nextSettings;
    });
    writeQueue = operation.catch(() => {});
    try { res.json(await operation); } catch (error) { next(error); }
  });
  app.post('/api/admin/branding/assets', requireAdmin, upload.single('asset'), async (req, res, next) => {
    try {
      const buffer = req.file?.buffer;
      const kind = req.body?.kind;
      if (!buffer || !['logo', 'favicon'].includes(kind))
        return res.status(400).json({ error: 'Selecione a imagem e seu tipo.' });
      let extension = '';
      if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
        if (!buffer.readUInt32BE(16) || !buffer.readUInt32BE(20)
            || buffer.readUInt32BE(16) > 4096 || buffer.readUInt32BE(20) > 4096)
          return res.status(400).json({ error: 'PNG deve ter até 4096 × 4096 pixels.' });
        extension = 'png';
      } else if (buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
        extension = 'jpg';
      else if (buffer.length >= 12 && buffer.toString('ascii',0,4) === 'RIFF'
          && buffer.toString('ascii',8,12) === 'WEBP') extension = 'webp';
      else if (buffer.length >= 6 && buffer.readUInt16LE(0) === 0
          && buffer.readUInt16LE(2) === 1 && buffer.readUInt16LE(4) > 0) extension = 'ico';
      const allowed = kind === 'favicon' ? ['png','ico'] : ['png','jpg','webp'];
      if (!allowed.includes(extension)) return res.status(400).json({
        error: kind === 'favicon' ? 'Favicon: PNG ou ICO, até 2 MB.' : 'Logo: PNG, JPG ou WebP, até 2 MB.'
      });
      const filename = `${crypto.randomUUID()}.${extension}`;
      await fs.writeFile(path.join(directory, filename), buffer, { flag: 'wx' });
      res.status(201).json({ url: `/api/branding-assets/${filename}` });
    } catch (error) { next(error); }
  });
  app.get('/api/branding-assets/:name', (req, res) => {
    if (!ASSET_PATTERN.test(`/api/branding-assets/${req.params.name}`))
      return res.status(404).end();
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'");
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.sendFile(path.join(directory, req.params.name), error => {
      if (error && !res.headersSent) res.status(404).end();
    });
  });
  return ready;
}
