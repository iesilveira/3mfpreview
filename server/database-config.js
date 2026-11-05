// Configuração sem senha embutida. Credenciais somente no ambiente/.env.
function invalid(code, message) {
  return Object.assign(new Error(message), { code });
}
export function databaseOptions(env = process.env) {
  for (const key of ['DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    if (typeof env[key] !== 'string' || !env[key].length ||
        (key !== 'DB_PASSWORD' && !env[key].trim()))
      throw invalid('DB_CONFIG_MISSING', `Configure ${key} no ambiente ou .env.`);
  }
  let host = String(env.DB_HOST || 'localhost').trim();
  let embeddedPort = '';
  if (host.startsWith('[')) {
    const match = host.match(/^\[([a-fA-F0-9:.]+)\](?::(\d+))?$/);
    if (!match) throw invalid('DB_CONFIG_HOST', 'DB_HOST inválido.');
    host = match[1]; embeddedPort = match[2] || '';
  } else if ((host.match(/:/g) || []).length === 1) {
    const match = host.match(/^([^:]+):(\d+)$/);
    if (!match) throw invalid('DB_CONFIG_HOST', 'DB_HOST inválido. Use host e porta separados.');
    host = match[1]; embeddedPort = match[2];
  }
  if (!host || /[\s\/\\?#@]/.test(host) ||
      !/^[a-zA-Z0-9_.:-]+$/.test(host))
    throw invalid('DB_CONFIG_HOST', 'DB_HOST inválido; não informe URL.');
  const explicitPort = String(env.DB_PORT || '').trim();
  if (explicitPort && !/^\d+$/.test(explicitPort))
    throw invalid('DB_CONFIG_PORT', 'DB_PORT deve conter somente números.');
  if (embeddedPort && explicitPort && Number(embeddedPort) !== Number(explicitPort))
    throw invalid('DB_CONFIG_PORT', 'DB_HOST e DB_PORT informam portas diferentes.');
  const port = Number(explicitPort || embeddedPort || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw invalid('DB_CONFIG_PORT', 'DB_PORT inválida.');
  const tls = String(env.DB_SSL || 'false').trim().toLowerCase();
  if (!['true', 'false'].includes(tls))
    throw invalid('DB_CONFIG_TLS', 'DB_SSL deve ser true ou false.');
  return {
    host, port, database: env.DB_NAME.trim(), user: env.DB_USER.trim(),
    password: env.DB_PASSWORD,
    charset: 'utf8mb4', connectionLimit: 5, queueLimit: 50,
    waitForConnections: true, connectTimeout: 10000, enableKeepAlive: true,
    multipleStatements: false, supportBigNumbers: true, bigNumberStrings: true,
    ...(tls === 'true' ? { ssl: { rejectUnauthorized: true } } : {})
  };
}
