import crypto from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(crypto.scrypt);
const COOKIE = 'preview_admin_session';
const TTL = 8 * 60 * 60 * 1000;
const WINDOW = 15 * 60 * 1000;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const equal = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
export function installAdminAuth(app, options = {}) {
  const email = String(options.email ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = String(options.password ?? process.env.ADMIN_PASSWORD ?? '');
  const configured = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && password.length >= 12 && password.length <= 1024
    && !['troque-esta-senha', 'defina-uma-senha-forte', 'uma-senha-forte'].includes(password);
  const sessions = new Map(), attempts = new Map();
  const salt = crypto.randomBytes(32);
  // Promise inicializada sem top-level await: compatível com carregamento por require().
  const expected = configured ? scrypt(password, salt, 64) : Promise.resolve(null);
  expected.catch(error => console.error('Falha ao preparar autenticação:', error.message));
  const cookieOptions = req => {
    const setting = String(process.env.COOKIE_SECURE || 'auto').toLowerCase();
    const secure = setting === 'true' || (setting !== 'false'
      && (process.env.NODE_ENV === 'production' || Boolean(req.secure)));
    return { httpOnly: true, sameSite: 'strict', secure, path: '/' };
  };
  const tokenFrom = req => {
    const raw = String(req.get('cookie') || '');
    const match = raw.match(/(?:^|;\s*)preview_admin_session=([a-f0-9]{64})(?:;|$)/);
    return match ? match[1] : '';
  };
  const sessionFrom = req => {
    const token = tokenFrom(req);
    if (!token) return null;
    const key = digest(token), session = sessions.get(key);
    if (!session) return null;
    if (session.expires <= Date.now()) { sessions.delete(key); return null; }
    return { ...session, key };
  };
  const sameOrigin = (req, res) => {
    try {
      const origin = new URL(String(req.get('origin') || ''));
      if (!['http:', 'https:'].includes(origin.protocol)
          || origin.host.toLowerCase() !== String(req.get('host') || '').toLowerCase())
        throw new Error();
      return true;
    } catch {
      res.status(403).json({ error: 'Origem da solicitação inválida.' });
      return false;
    }
  };
  function requireAdmin(req, res, next) {
    res.set('Cache-Control', 'no-store');
    const session = sessionFrom(req);
    if (!session) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (!sameOrigin(req, res)) return;
      if (!equal(req.get('x-csrf-token') || '', session.csrf))
        return res.status(403).json({ error: 'Token de segurança inválido. Recarregue o painel.' });
    }
    req.adminSession = session;
    next();
  }
  app.use('/api/auth', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api/admin', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.post('/api/auth/login', async (req, res, next) => {
    try {
      if (!sameOrigin(req, res)) return;
      if (!String(req.get('content-type') || '').toLowerCase().startsWith('application/json'))
        return res.status(415).json({ error: 'Envie JSON.' });
      if (!configured) return res.status(503).json({
        error: 'Configure ADMIN_EMAIL e ADMIN_PASSWORD (senha exclusiva com pelo menos 12 caracteres) no servidor.'
      });
      const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
      const now = Date.now();
      let bucket = attempts.get(ip);
      if (!bucket || now >= bucket.until) {
        if (attempts.size >= 10000) return res.status(503).json({ error: 'Tente novamente mais tarde.' });
        bucket = { count: 0, until: now + WINDOW };
        attempts.set(ip, bucket);
      }
      if (bucket.count >= 10) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - now) / 1000))));
        return res.status(429).json({ error: 'Muitas tentativas. Aguarde até 15 minutos.' });
      }
      bucket.count++;
      const suppliedPassword = typeof req.body?.password === 'string' ? req.body.password : '';
      const suppliedEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      if (suppliedPassword.length > 1024 || suppliedEmail.length > 254)
        return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      const actual = await scrypt(suppliedPassword, salt, 64);
      const record = await expected;
      const passwordMatches = crypto.timingSafeEqual(actual, record);
      if (!passwordMatches || !equal(suppliedEmail, email))
        return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      attempts.delete(ip);
      const old = sessionFrom(req);
      if (old) sessions.delete(old.key);
      for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
      if (sessions.size >= 500) sessions.delete(sessions.keys().next().value);
      const token = crypto.randomBytes(32).toString('hex');
      const session = { email, csrf: crypto.randomBytes(32).toString('hex'), expires: now + TTL };
      sessions.set(digest(token), session);
      res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: TTL });
      res.json({ email, csrfToken: session.csrf });
    } catch (error) { next(error); }
  });
  app.get('/api/auth/session', requireAdmin, (req, res) =>
    res.json({ email: req.adminSession.email, csrfToken: req.adminSession.csrf }));
  app.post('/api/auth/logout', requireAdmin, (req, res) => {
    sessions.delete(req.adminSession.key);
    res.clearCookie(COOKIE, cookieOptions(req));
    res.json({ ok: true });
  });
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  }, 60000);
  timer.unref();
  if (!configured) console.warn('Login indisponível: configure ADMIN_EMAIL e ADMIN_PASSWORD forte.');
  return { requireAdmin, configured };
}
