# Atualização 1.3.0 → 1.3.1

## Escopo e base
Base: código 1.3.0 do atualizador entregue nesta conversa, validado pelo manifesto
`.migration-1.3.0.json`. Reexecução 1.3.1 exige manifesto e hashes correspondentes.
O atualizador NÃO acessa o GitHub ou a hospedagem. Edições desconhecidas são recusadas.

Host confirmado pelo usuário: **localhost**, porta **3306**.
No `.env`, use `DB_HOST=localhost` e `DB_PORT=3306`, em campos separados.
A normalização também aceita `DB_HOST=localhost:3306`, sem portas conflitantes.
Não usa mysql:// como DB_HOST. Localhost refere-se ao ambiente onde o Node está rodando.
Em contêiner separado, localhost pode não apontar para o servidor MySQL: confira a topologia.

## Execução
1. Coloque `atualizador_1_3_1.py` na pasta do projeto 1.3.0.
2. Execute `python atualizador_1_3_1.py`.
3. Se necessário, confirme banco e usuário. Sugestões extraídas da imagem, quando disponíveis,
   precisam de confirmação: OCR pode confundir caracteres.
4. A senha existente em `.env`/ambiente é preservada. Para trocar:
   `python atualizador_1_3_1.py --solicitar-senha`
   Se não existir senha, a entrada oculta será obrigatória. Não usa OCR de senha.
   O arquivo `.env` fica local, fora do manifesto/ZIP. Nenhuma senha vai ao código.
5. O script valida e atualiza arquivos, registra 1.3.1 e gera ZIP completo de fonte
   `<nome-da-pasta>-1.3.1.zip` no diretório pai; usa sufixo se o nome já existir.
6. Execute manualmente `npm run db:check` NO SERVIDOR, com as dependências já instaladas.
7. Execute manualmente `npm run build` e reinicie/republique apenas quando desejar.

## Hostinger e GitHub: importante
O `.env` NÃO é incluído no ZIP/Git. Atualizar o projeto local não altera as variáveis
da aplicação publicada. Configure DB_HOST, DB_PORT, DB_NAME, DB_USER e DB_PASSWORD no
painel da aplicação Hostinger ou em um .env privado do servidor.
Variáveis já fornecidas ao processo têm precedência sobre o .env.
A atualização inclui regras .gitignore, mas NÃO remove arquivos já rastreados por Git.
Nunca envie a senha no repositório. Se já foi publicada, troque-a no provedor.
Não use credenciais MySQL como credenciais do administrador da aplicação.

## Diagnóstico
- DB_CONFIG_MISSING: faltam variáveis de conexão.
- ECONNREFUSED / ETIMEDOUT / ENOTFOUND: endereço, porta, resolução ou disponibilidade.
- ER_ACCESS_DENIED_ERROR: usuário/senha ou acesso do usuário a partir do host.
- ER_BAD_DB_ERROR: DB_NAME não existe.
- ER_NO_SUCH_TABLE: tabelas 1.3.0 não criadas nesse banco.
- SCHEMA_MISMATCH: versão/registro do esquema incompatível.
- IMPORT_PENDING: mf3_state.data_ready ainda é 0.
- BRANDING_MISSING: falta o registro de identidade no banco.

O backend registra código e orientação, inclusive causas de AggregateError,
sem imprimir senha, SQL ou mensagem crua do driver.
O frontend passa a mostrar a orientação segura e o código, em vez do erro genérico.
`GET /api/health` exige importação concluída; o comando `npm run db:check` faz
apenas leituras e verifica também a identidade visual.

## Esquema e dados: sem alteração automática
A versão do APLICATIVO muda para 1.3.1; o ESQUEMA continua 1.3.0, intencionalmente.
Não existe migrations/1.3.1.sql porque não há mudança nas tabelas.
Nenhum SQL/importação/cadastro é executado pelo Python ou automaticamente na inicialização.

Se as tabelas 1.3.0 ainda não existem, selecione o banco correto e importe manualmente
`migrations/1.3.0.sql`. Não apague tabelas existentes para resolver erros.
Se o diagnóstico indicar IMPORT_PENDING, pare a aplicação e, NO AMBIENTE DOS DADOS REAIS,
execute manualmente:
`npm run data:import -- --confirm-stopped`
Siga ATUALIZACAO-1.3.0.md. Uma pasta local vazia não migra dados existentes na hospedagem.
Se precisar criar o primeiro administrador, após a importação, use manualmente
`npm run admin:setup-token`. Não precisa recadastrar uma conta já existente no MySQL.
Modelos .3mf permanecem onde estão; não são copiados/apagados.

## Preservação e validação
Sem dependência nova. Mantém MySQL, login/sessões, revisão privada, 3MF e personalização.
Corrige o executor assíncrono do teste de cadastro/login da 1.3.0.
Antes de gravar, executa validação JSON e, se Node estiver disponível, sintaxe JS
e testes isolados de autenticação, configuração e diagnóstico.
Node ausente gera aviso; testes omitidos não são apresentados como aprovados.
O script testa a infraestrutura de código, NÃO conecta ao MySQL real nem executa
npm install, npm run build, WebGL, deploy, Git, backups ou alteração de banco.
Gravação atômica por arquivo, não uma transação global. Falha de disco pode deixar
atualização parcial; não existe rollback automático.

## ZIP
Fonte completa com uma pasta raiz do projeto, fora da pasta do projeto.
Exclui atualizador, .env, dados, .3mf, Git, dependências, dist, caches, chaves e ZIPs.
DATA_DIR personalizado dentro do projeto também é excluído.
Caminhos de DATA_DIR interpolados/complexos são recusados para evitar vazamento.
A senha conhecida é verificada nos arquivos que entrariam no pacote; se encontrada,
a distribuição é bloqueada antes da escrita. Isso não substitui revisão de outros segredos.

## Referências técnicas
https://sidorares.github.io/node-mysql2/docs/examples/connections/create-pool
https://sidorares.github.io/node-mysql2/docs/faq/how-to-handle-errors
https://nodejs.org/docs/latest-v24.x/api/process.html
