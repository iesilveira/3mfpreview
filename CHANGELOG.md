# Changelog

## [1.3.2] - 2026-11-05
- Instalação nova pelo navegador, com chave privada e confirmação explícita.
- Criação das tabelas e do primeiro administrador sem terminal na hospedagem.
- Identidade padrão e estado inicial gravados junto com o cadastro transacional.
- Bloqueio após o primeiro cadastro e recusa de banco/arquivos não vazios.
- Redirecionamento da raiz para /install enquanto a instalação não foi concluída.
- Preservados login, sessões, conta, branding, projetos e visualizador.

## [1.3.1] - 2026-11-05
- Configuração MySQL localhost:3306 em .env privado, sem credenciais no código.
- Diagnóstico de configuração, conexão, credenciais, esquema, importação e identidade.
- Comando db:check somente de leitura e health check de prontidão.
- Frontend exibe orientação segura em falhas de identidade visual.
- Corrigido executor dos testes assíncronos de autenticação.
- Esquema 1.3.0 preservado; nenhuma migração automática.

## [1.3.0] - 2026-11-05
- MySQL para administradores, sessões/CSRF, limites, projetos/clientes, decisões, identidade e imagens.
- Somente binários 3MF permanecem em DATA_DIR/models.
- Importação legada explícita e transacional, com preservação de IDs/tokens e verificação de arquivos.
- Cadastro inicial por token temporário, senhas scrypt e edição da própria conta.
- Bloqueio da API até migração/importação; sem fallback silencioso a JSON.
- Preservados visualizador, busca, links, upload e personalização da 1.2.0.

## [1.2.0] - 2026-11-05
- Montserrat e cores configuráveis, inicialmente #0572cf e #e62526.
- Login administrativo por e-mail/senha com sessão, logout, CSRF e limites de tentativa.
- Logo, favicon e todos os textos de cabeçalho/rodapé editáveis pelo painel.
- Removidos nome e ícone Forma do cabeçalho; espaço reservado para logo.
- Busca por nome de projeto ou cliente abaixo de Seus projetos.
- Preservados upload 3MF, revisão privada, visualizador, dimensões e decisões.
- Inicialização assíncrona sem top-level await; configurações em DATA_DIR.
