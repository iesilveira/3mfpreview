# Aprovação 3MF — 1.3.0

> **1.3.0 — MySQL obrigatório.** Leia `ATUALIZACAO-1.3.0.md` antes de iniciar.
> Execute a migração SQL e a importação dos dados reais separadamente.
> Administradores, sessões, projetos, decisões e imagens ficam no banco; apenas 3MF no disco.
> Primeiro acesso com token gerado por `npm run admin:setup-token`; não há senha padrão.
> `npm install` e `npm run build` são etapas manuais. Não use npm ci antes de regenerar o lockfile.

## Documentação anterior (histórica)
As referências a login por ambiente, sessões em memória e JSON abaixo descrevem versões antigas.
**Não siga essas instruções para configurar a 1.3.0; use o guia atual acima.**


> Versão 1.2.0: leia `ATUALIZACAO-1.2.0.md` para configuração de acesso, cookies HTTPS, personalização, validações e empacotamento.

Aplicação web para enviar um arquivo `.3mf`, gerar um link privado de revisão, visualizar o modelo no navegador com rotação/zoom e dimensões X/Y/Z, e registrar aprovação ou solicitação de ajustes.

## Funcionalidades incluídas

- Painel administrativo com login de e-mail/senha e sessão; personalização visual e busca.
- Upload de arquivo `.3mf` (limite de 100 MB).
- Link privado aleatório para o cliente.
- Visualizador 3D com câmera orbital e cores/materiais que o loader conseguir interpretar.
- Medidas da caixa delimitadora X, Y e Z, exibidas em milímetros.
- Aprovar ou solicitar ajuste com comentário.
- Persistência simples em `data/projects.json` e arquivos em `data/models/`.
- Docker/Compose para execução em servidor.

## Rodar localmente

Requer Node.js 24 LTS (ou outra versão compatível com Vite 7) e npm.

```bash
npm install
```

Linux/macOS:
```bash
ADMIN_EMAIL='admin@exemplo.com' ADMIN_PASSWORD='substitua-por-uma-senha-exclusiva' npm run dev
```

PowerShell:
```powershell
$env:ADMIN_EMAIL='admin@exemplo.com'
$env:ADMIN_PASSWORD='substitua-por-uma-senha-exclusiva'
npm run dev
```

Abra o endereço de desenvolvimento indicado pelo Vite, normalmente `http://localhost:5173`. O painel está na raiz; o cliente recebe links como `/p/<token>`.

## Deploy com Docker Compose

1. Copie `.env.example` para `.env` e defina `ADMIN_EMAIL` e uma senha exclusiva de pelo menos 12 caracteres em `ADMIN_PASSWORD`.
2. Execute:
   ```bash
   docker compose up --build -d
   ```
3. A aplicação responderá na porta `3001`. Configure HTTPS em um proxy reverso (Caddy, Nginx ou equivalente).
4. Mantenha o volume `./data` persistente e faça backup periódico.

## Deploy sem Docker

```bash
npm install
npm run build
ADMIN_EMAIL='admin@exemplo.com' ADMIN_PASSWORD='substitua-por-uma-senha-exclusiva' npm start
```

Defina também `PORT` e `DATA_DIR` conforme o ambiente. Para produção, use HTTPS e armazenamento persistente.

## Como usar

1. Abra o painel e entre com o e-mail e a senha configurados em `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
2. Clique **Novo modelo**, preencha os dados e selecione um `.3mf`.
3. Após o upload, copie o link de revisão para enviar ao cliente.
4. O cliente pode girar/ampliar o modelo e aprovar ou solicitar ajustes.
5. A decisão e o comentário aparecem no painel.

## Notas e limitações do protótipo

- Este é um MVP inicial, não uma implantação auditada para produção. Há uma única conta administrativa por ambiente e sessões em memória. Para múltiplas contas ou réplicas, implemente um provedor de identidade e armazenamento compartilhado; faça uma revisão de segurança antes de uso comercial.
- O banco atual é um arquivo JSON: adequado para protótipo/instância única, não para múltiplas réplicas ou grande volume. Migre para PostgreSQL e armazenamento privado de objetos conforme crescer.
- Os links de revisão são bearer links: quem tiver o link poderá ver o modelo e registrar uma decisão. Compartilhe apenas com o cliente; implemente expiração/revogação quando necessário.
- Dimensões são calculadas pela caixa delimitadora da geometria interpretada pelo visualizador. Confirme um arquivo real de cada fatiador/exportador e unidade antes de usar como especificação de fabricação.
- A cor exibida é uma aproximação digital dos dados presentes no 3MF; não representa garantia de cor/material impresso.
- O visualizador é carregado no navegador e requer WebGL. Arquivos 3MF muito grandes/complexos podem não funcionar em celulares ou equipamentos modestos.
- O protótipo verifica extensão e assinatura ZIP, mas não faz análise antivírus ou validação completa de conformidade 3MF.
- Google Fonts requer internet; a aplicação mantém fontes de sistema como alternativa.

## Estrutura

```text
src/main.js       interface, visualizador 3D e ações do cliente
src/style.css     estilos responsivos
server.js         API, upload e persistência
data/models/      arquivos 3MF enviados (não versionar dados reais)
```
