import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3001);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'troque-esta-senha';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MODELS_DIR = path.join(DATA_DIR, 'models');
const DB_FILE = path.join(DATA_DIR, 'projects.json');
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MODELS_DIR),
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.3mf`)
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.3mf') {
      return cb(new Error('Envie um arquivo com extensão .3mf.'));
    }
    cb(null, true);
  }
});

async function readProjects() {
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeProjects(projects) {
  const temp = `${DB_FILE}.tmp`;
  await fs.writeFile(temp, JSON.stringify(projects, null, 2), 'utf8');
  await fs.rename(temp, DB_FILE);
}

function requireAdmin(req, res, next) {
  const supplied = req.get('x-admin-password') || '';
  const expected = Buffer.from(ADMIN_PASSWORD);
  const actual = Buffer.from(supplied);
  const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!valid) return res.status(401).json({ error: 'Senha administrativa inválida.' });
  next();
}

function cleanText(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/admin/projects', requireAdmin, async (_req, res, next) => {
  try {
    const projects = await readProjects();
    projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(projects);
  } catch (error) { next(error); }
});

app.post('/api/admin/projects', requireAdmin, upload.single('model'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Selecione um arquivo 3MF.' });
    const name = cleanText(req.body.name, 120);
    if (!name) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Informe o nome do serviço/projeto.' });
    }
    // Reject files that do not look like ZIP-based 3MF packages.
    const handle = await fs.open(req.file.path, 'r');
    const signature = Buffer.alloc(4);
    await handle.read(signature, 0, 4, 0);
    await handle.close();
    if (!(signature[0] === 0x50 && signature[1] === 0x4b)) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'O arquivo não parece ser um pacote 3MF válido.' });
    }

    const project = {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(24).toString('hex'),
      name,
      clientName: cleanText(req.body.clientName, 120),
      clientEmail: cleanText(req.body.clientEmail, 180),
      note: cleanText(req.body.note, 1200),
      originalFileName: path.basename(req.file.originalname),
      storedFileName: req.file.filename,
      fileSize: req.file.size,
      status: 'pending',
      createdAt: new Date().toISOString(),
      decisionAt: null,
      decisionComment: ''
    };
    const projects = await readProjects();
    projects.push(project);
    await writeProjects(projects);
    res.status(201).json(project);
  } catch (error) { next(error); }
});

app.get('/api/reviews/:token', async (req, res, next) => {
  try {
    const project = (await readProjects()).find(p => p.token === req.params.token);
    if (!project) return res.status(404).json({ error: 'Link de revisão não encontrado.' });
    const { storedFileName, ...publicProject } = project;
    publicProject.modelUrl = `/api/reviews/${encodeURIComponent(project.token)}/model`;
    res.json(publicProject);
  } catch (error) { next(error); }
});

app.get('/api/reviews/:token/model', async (req, res, next) => {
  try {
    const project = (await readProjects()).find(p => p.token === req.params.token);
    if (!project) return res.status(404).json({ error: 'Modelo não encontrado.' });
    const filePath = path.join(MODELS_DIR, path.basename(project.storedFileName));
    res.type('model/3mf').set('Content-Disposition', `inline; filename="${encodeURIComponent(project.originalFileName)}"`);
    res.sendFile(filePath);
  } catch (error) { next(error); }
});

app.post('/api/reviews/:token/decision', async (req, res, next) => {
  try {
    const status = req.body?.status;
    const comment = cleanText(req.body?.comment, 1200);
    if (!['approved', 'changes_requested'].includes(status)) {
      return res.status(400).json({ error: 'Decisão inválida.' });
    }
    if (status === 'changes_requested' && !comment) {
      return res.status(400).json({ error: 'Descreva o ajuste solicitado.' });
    }
    const projects = await readProjects();
    const project = projects.find(p => p.token === req.params.token);
    if (!project) return res.status(404).json({ error: 'Link de revisão não encontrado.' });
    project.status = status;
    project.decisionAt = new Date().toISOString();
    project.decisionComment = comment;
    await writeProjects(projects);
    const { storedFileName, ...publicProject } = project;
    res.json(publicProject);
  } catch (error) { next(error); }
});

app.use('/assets', express.static(path.join(__dirname, 'dist', 'assets'), { maxAge: '1d' }));
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*path', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), error => {
    if (error) res.status(404).send('Execute npm run build antes de iniciar em produção.');
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo acima do limite de 100 MB.' });
  }
  res.status(400).json({ error: error.message || 'Não foi possível concluir a solicitação.' });
});

fs.mkdir(MODELS_DIR, { recursive: true })
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(
        `API/app em http://localhost:${PORT} (senha ADMIN_PASSWORD configurada: ${ADMIN_PASSWORD !== 'troque-esta-senha'})`
      );
    });
  })
  .catch(error => {
    console.error('Falha ao criar o diretório de dados:', error);
    process.exit(1);
  });
