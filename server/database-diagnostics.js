// Não inclui SQL, valores das credenciais, stack ou mensagem crua na resposta/log.
const hints = Object.freeze({
  DB_CONFIG_MISSING: 'Faltam DB_NAME, DB_USER ou DB_PASSWORD. Confira as variáveis do servidor e o .env.',
  DB_CONFIG_HOST: 'DB_HOST inválido. Configure localhost e DB_PORT=3306 neste ambiente.',
  DB_CONFIG_PORT: 'Porta MySQL inválida ou conflitante. Configure DB_PORT=3306.',
  DB_CONFIG_TLS: 'Configuração TLS inválida. DB_SSL deve ser true ou false.',
  ECONNREFUSED: 'Conexão MySQL recusada. Verifique se localhost:3306 está disponível para este processo Node.',
  ETIMEDOUT: 'Tempo esgotado ao conectar ao MySQL. Confira endereço, porta e regras de rede.',
  ENOTFOUND: 'Endereço do servidor MySQL não encontrado. Confira DB_HOST.',
  EAI_AGAIN: 'Falha temporária ao resolver o endereço MySQL.',
  ER_ACCESS_DENIED_ERROR: 'MySQL recusou as credenciais. Confira DB_USER, DB_PASSWORD e o acesso autorizado para o host.',
  ER_DBACCESS_DENIED_ERROR: 'O usuário MySQL não tem acesso ao banco configurado.',
  ER_BAD_DB_ERROR: 'O banco configurado em DB_NAME não foi encontrado.',
  ER_NO_SUCH_TABLE: 'Tabelas MySQL ausentes. Importe migrations/1.3.0.sql no banco correto; depois importe os dados legados.',
  ER_TABLEACCESS_DENIED_ERROR: 'Permissão MySQL insuficiente para uma tabela da aplicação.',
  ER_LOCK_WAIT_TIMEOUT: 'O MySQL está aguardando um bloqueio. Aguarde e tente novamente.',
  ER_LOCK_DEADLOCK: 'Conflito temporário de transação no MySQL. Tente novamente.',
  ER_NET_PACKET_TOO_LARGE: 'O MySQL recusou o tamanho do pacote. Verifique max_allowed_packet para os ativos de identidade.',
  PROTOCOL_CONNECTION_LOST: 'Conexão com o MySQL interrompida. Verifique a disponibilidade do banco.',
  SCHEMA_MISMATCH: 'Esquema MySQL 1.3.0 ausente ou incompatível. Confira migrations/1.3.0.sql, sem apagar dados.',
  IMPORT_PENDING: 'Importação pendente. Com a aplicação parada, execute npm run data:import -- --confirm-stopped no ambiente dos dados reais.',
  BRANDING_MISSING: 'A identidade visual não foi encontrada no banco. Verifique a importação; não recrie ou apague tabelas.',
  SERVICE_UNAVAILABLE: 'Serviço indisponível. Consulte o diagnóstico do servidor.'
});
function chain(error, output = [], depth = 0) {
  if (!error || depth > 4 || output.length >= 12) return output;
  if (output.includes(error)) return output;
  output.push(error);
  chain(error.cause, output, depth + 1);
  if (Array.isArray(error.errors))
    for (const item of error.errors.slice(0, 8)) chain(item, output, depth + 1);
  return output;
}
export function describeDatabaseError(error) {
  const errors = chain(error);
  const named = errors.map(item => String(item.code || ''));
  let code = named.find(value => Object.hasOwn(hints, value));
  if (!code) {
    // Somente reconhece mensagens controladas pelo código conhecido da 1.3.0.
    const messages = errors.map(item => String(item.message || ''));
    if (messages.some(value => /^Configure DB_(?:NAME|USER|PASSWORD) no ambiente\.$/.test(value)))
      code = 'DB_CONFIG_MISSING';
    else if (messages.some(value => /^Migração MySQL 1\.3\.0 não aplicada\.$/.test(value)))
      code = 'SCHEMA_MISMATCH';
    else if (messages.some(value => value.startsWith('Importação pendente.')))
      code = 'IMPORT_PENDING';
    else if (messages.some(value => value.startsWith('Configuração visual ausente.')))
      code = 'BRANDING_MISSING';
  }
  code ||= 'SERVICE_UNAVAILABLE';
  const causes = [...new Set(named.filter(value => /^[A-Z][A-Z0-9_]{1,63}$/.test(value)))];
  return { code, message: hints[code], causes };
}
export function logFailure(context, error) {
  const info = describeDatabaseError(error);
  console.error('Falha da aplicação:', JSON.stringify({
    context, code: info.code, message: info.message, causes: info.causes
  }));
  return info;
}
