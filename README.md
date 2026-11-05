# Forma — MVP de aprovação 3MF

Aplicação web para enviar um arquivo `.3mf`, gerar um link privado de revisão, visualizar o modelo no navegador com rotação/zoom e dimensões X/Y/Z, e registrar aprovação ou solicitação de ajustes.

## Funcionalidades incluídas

- Painel administrativo protegido por senha compartilhada.
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
ADMIN_PASSWORD='uma-senha-forte' npm run dev
```

PowerShell:
```powershell
$env:ADMIN_PASSWORD='uma-senha-forte'
npm run dev
```

Abra o endereço de desenvolvimento indicado pelo Vite, normalmente `http://localhost:5173`. O painel está na raiz; o cliente recebe links como `/p/<token>`.

## Deploy com Docker Compose

1. Copie `.env.example` para `.env` e defina uma senha forte em `ADMIN_PASSWORD`.
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
ADMIN_PASSWORD='uma-senha-forte' npm start
```

Defina também `PORT` e `DATA_DIR` conforme o ambiente. Para produção, use HTTPS e armazenamento persistente.

## Como usar

1. Abra o painel e entre com a senha configurada em `ADMIN_PASSWORD`.
2. Clique **Novo modelo**, preencha os dados e selecione um `.3mf`.
3. Após o upload, copie o link de revisão para enviar ao cliente.
4. O cliente pode girar/ampliar o modelo e aprovar ou solicitar ajustes.
5. A decisão e o comentário aparecem no painel.

## Notas e limitações do protótipo

- Este é um MVP inicial, não uma implantação auditada para produção. A senha administrativa é compartilhada; substitua por contas individuais, autenticação robusta, limites de tentativa, política de privacidade e proteção operacional antes de uso comercial.
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
