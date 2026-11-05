# Atualização 1.2.0 → 1.3.0

## O que vai ao MySQL
Administradores, hashes scrypt das senhas, sessões, CSRF, limites de tentativa,
projetos (incluindo dados de cliente, observações, datas e referências dos arquivos),
decisões/histórico, cores e textos da identidade, logos e favicons (MEDIUMBLOB).
Os registros completos dos projetos são documentos JSON armazenados no MySQL
(LONGTEXT), com índices separados de ID/token/data; não são mais arquivos JSON.
Clientes continuam sendo dados vinculados a cada projeto, não um cadastro CRM separado.
Somente os binários `.3mf` ficam no disco em DATA_DIR/models.
Arquivos legados ficam intocados: a aplicação nova NÃO os consulta em runtime.

## Base e garantias do atualizador
Base local confirmada pelo usuário: 1.2.0 gerada pelo atualizador anterior.
Referência adicional consultada: GitHub iesilveira/3mfpreview, main, em 05/11/2026;
o SHA do commit não foi fixado. Confere manifesto local .migration-1.2.0.json,
hashes/estrutura/versão e marcadores antes de escrever.
Python 3.9+, Node 24, MySQL com InnoDB e utf8mb4 (homologar no seu servidor; alvo MySQL 8).
Sem rede, backup, instalação, banco, Git, push ou deploy durante `python atualizador.py`.
A aplicação passa a exigir mysql2 3.24.6. O atualizador apenas declara a dependência.

## Etapas obrigatórias — não pule
1. Pare a aplicação manualmente e mantenha uma referência recuperável. Nenhum backup é criado.
2. Coloque o novo atualizador.py na pasta do projeto e execute `python atualizador.py`.
3. Execute manualmente `npm install` para instalar mysql2 e regenerar o lockfile, depois `npm run build`.
   Se houver package-lock/npm-shrinkwrap, o atualizador sincroniza os metadados raiz, mas NÃO
   inventa a árvore resolvida. NÃO use npm ci antes desse npm install.
4. Configure as variáveis DB_* abaixo. Não é necessário configurar login administrativo no servidor.
5. Selecione o banco correto e importe manualmente `migrations/1.3.0.sql` pelo phpMyAdmin ou cliente MySQL.
   Esse passo cria as tabelas mf3_*, não cria o banco/usuário e NÃO importa seus JSONs.
   CREATE TABLE pode fazer commit implícito; não há promessa de rollback global do esquema.
   Não reutilize tabelas mf3_* existentes de outro sistema. Não há DROP/DELETE/ALTER de dados legados.
6. NO AMBIENTE QUE CONTÉM OS DADOS REAIS e com a aplicação parada:
   `npm run data:import -- --confirm-stopped`
   Confira o caminho de origem impresso. DATA_DIR deve apontar para a pasta antiga correta.
   Se for uma instalação vazia, crie a pasta DATA_DIR vazia explicitamente antes de importar.
   O importador lê projetos, branding e TODAS as imagens reconhecidas de branding-assets.
   Valida IDs/tokens/arquivos/tamanhos, mantém IDs e links existentes e importa as decisões disponíveis.
   O JSON antigo só tem a última decisão; histórico anterior inexistente não pode ser recuperado.
   A importação usa transação InnoDB. Falha nos dados causa rollback dessa transação.
   Destino não vazio é recusado. Mesma origem já importada é no-op; origem diferente é recusada.
   Se a conexão cair durante COMMIT, o resultado pode ser incerto: execute de novo com a mesma origem;
   a marca import_digest permite reconhecer um commit concluído. Nunca apague tabelas para tentar novamente.
7. Execute `npm run admin:setup-token`. O terminal mostra um token de uso único válido por 30 minutos.
   Abra a aplicação e use esse token para cadastrar e-mail e senha (mínimo 12 caracteres).
   O token não é senha administrativa e não é salvo em .env. O comando só funciona antes do primeiro admin.
   Se expirar, gere outro pelo mesmo comando. A conta antiga de ambiente NÃO é importada automaticamente.
8. Inicie/reinicie manualmente e valide os links antigos, as imagens, o upload, decisões e login.
   API bloqueia leituras/escritas de negócio enquanto data_ready=0, sem fallback silencioso a JSON.
9. Depois da validação, as cópias legadas poderão ser arquivadas/removidas POR VOCÊ, se desejar.
   Nem o atualizador nem o importador apagam JSONs, logos antigos ou modelos.

ATENÇÃO: se os dados reais só existem na Hostinger, importar uma pasta local vazia NÃO os migra.
Não publique antes de concluir o plano de migração dos dados reais.
O ZIP é de CÓDIGO-FONTE, não contém dados do banco nem arquivos dos clientes.

## Configuração de conexão (credenciais reais somente no ambiente)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=
DB_USER=
DB_PASSWORD=
DB_SSL=false
# Se a conexão exigir TLS:
# DB_SSL=true
# DB_SSL_CA=/caminho/ca-publica.pem

O driver valida certificados quando TLS é habilitado; não há opção para desabilitar essa validação.
Use TLS para conexões remotas conforme a configuração do provedor.
Privilégios de CREATE/REFERENCES são necessários para importar o SQL; em runtime use
um usuário limitado a SELECT/INSERT/UPDATE/DELETE das tabelas desta aplicação.
O MySQL precisa aceitar pacotes acima de 2 MB para logos/favicons de até 2 MB.

Preserve PORT, DATA_DIR, COOKIE_SECURE=true em HTTPS e TRUST_PROXY conforme sua topologia.
ADMIN_EMAIL/ADMIN_PASSWORD antigos ficam intactos no .env real, mas são ignorados pela aplicação.
Montserrat continua via Google Fonts, com fallback local; não houve hospedagem dos arquivos da fonte.

## Sessões e conta
Cookies HttpOnly/SameSite=Strict, Secure em produção, sessão fixa de 8 h,
CSRF e validação de origem nas escritas administrativas.
Sessões persistem em MySQL entre reinícios e podem ser compartilhadas entre processos.
Senha nunca é armazenada em texto puro. Salt exclusivo e scrypt N=32768,r=8,p=3.
Minha conta permite trocar e-mail/senha com confirmação da senha atual; todas as sessões são revogadas.
Cadastro inicial exige token gerado pelo operador no terminal, não é um cadastro público desprotegido.
Não há e-mail automático, recuperação por e-mail, CRM ou gestão de múltiplos admins nesta versão.
Se perder a senha e não houver sessão, será necessário um procedimento de recuperação autenticado
pelo operador/DBA; não existe redefinição pública ou senha de emergência padrão.
Logs e .env são configurações operacionais; não são dados de negócio transferidos ao banco.

## Dados e concorrência
Atualizações de decisão/histórico e configuração usam transações e bloqueios de linha.
Sem leitura/gravação de lista completa em JSON no servidor.
IDs, tokens e URLs dos projetos/imagens são preservados na importação.
O importador não move nem copia 3MFs. Mantenha DATA_DIR/models persistente em deploys.
As imagens antigas não são apagadas automaticamente, nem do banco; uploads abandonados podem ficar sem uso.
Backups operacionais precisam incluir MySQL E models; o ZIP da versão não substitui backup.

## Validação e limitações
O atualizador verifica sintaxe Python/JS, JSON e testes isolados sem abrir conexão MySQL.
SQL/driver/HTTP/navegador/WebGL/Vite/Hostinger/MySQL real NÃO são validados automaticamente.
Se Node não estiver disponível, avisa explicitamente que os testes Node foram omitidos.
Se um validador disponível falhar, não aplica arquivos.
Gravação atômica por arquivo não é transação global: falha de disco pode deixar atualização parcial.
Sem backup ou rollback automático.
Reexecução confere hashes gerenciados e não duplica código/changelog. Edição manual desses arquivos
é recusada para evitar sobrescrita silenciosa.
Se npm install alterar o lockfile após atualizar, a reexecução aceita apenas a alteração
do lockfile que corresponda à versão e à dependência raiz esperadas.

## Distribuição
ZIP completo <nome-da-pasta>-1.3.0.zip no diretório pai, com pasta raiz do projeto.
Não sobrescreve ZIPs anteriores; acrescenta sufixo numérico se necessário.
Exclui atualizadores, .env/credenciais conhecidas, data, node_modules, dist, Git, caches e temporários.
DATA_DIR personalizado dentro do projeto também é excluído quando reconhecido no ambiente/.env simples.
Se DATA_DIR usar interpolação/valor complexo, o atualizador para para não empacotar dados por engano.
Revise segredos em caminhos personalizados antes de distribuir.
O .env.example não contém senha padrão. Nenhum arquivo de dados do usuário é modificado pelo Python.

## Aceitação em homologação
- Base incorreta/arquivo alterado: abortar antes de gravações.
- Reexecução: zero alterações no código e novo ZIP íntegro sem segredos/atualizador.
- Importar dados reais de teste: comparar contagens, IDs, tokens, nomes e status.
- Repetir importação: no-op; dados inválidos/arquivo ausente: rollback.
- Cadastro inicial sem token: recusar; com token: apenas um administrador; token não reutilizável.
- Login/senha errada/limites/CSRF/logout/reinício e troca de senha revogando sessões.
- Alterar cores/textos/logo/favicon; reiniciar e confirmar persistência no MySQL.
- Abrir links anteriores e validar upload 3MF, dimensão/cor, rotação, zoom e decisões simultâneas.
- Com MySQL indisponível: erro 503, sem gravar dados em JSON e sem apresentar lista vazia como sucesso.

## Referências técnicas consultadas
https://sidorares.github.io/node-mysql2/docs
https://github.com/sidorares/node-mysql2/tree/v3.24.6
https://nodejs.org/docs/latest-v24.x/api/crypto.html
https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html
