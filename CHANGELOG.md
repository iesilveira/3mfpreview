# Changelog

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
