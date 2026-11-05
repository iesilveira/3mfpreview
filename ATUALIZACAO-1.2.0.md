> HISTÓRICO: substituído por ATUALIZACAO-1.3.0.md. Não usar estas instruções na versão atual.

# Atualização 1.2.0

## Base e execução
Base analisada: `iesilveira/3mfpreview`, branch `main`, manifesto 0.1.0, consultada em 05/11/2026.
Não foi possível fixar um SHA de commit; o atualizador confere a versão, a estrutura e os
marcadores dos trechos que altera, e rejeita divergências. Não baixa código.
Python 3.9+ para o atualizador. Node.js 24 para a aplicação (como no Dockerfile existente).

1. Coloque `atualizador.py` dentro do projeto; pare manualmente a aplicação local.
2. Execute `python atualizador.py` (ou informe o caminho completo do script).
3. Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` no ambiente do servidor, ou no `.env` local.
   A senha deve ter pelo menos 12 caracteres, ser exclusiva e não ser um exemplo da documentação.
   O atualizador NÃO altera seu `.env`, suas credenciais, dados, modelos ou projetos.
4. Para compilar, execute manualmente `npm install` se necessário e `npm run build`.
   O atualizador não instala dependências nem executa deploy.
5. Reinicie manualmente a aplicação e entre com e-mail e senha.
6. No cabeçalho do painel, abra **Personalização**.

As versões 0.1.0 e 1.2.0 são versões de código; a execução local não atualiza o GitHub
nem comprova a versão publicada. Verifique a versão efetivamente instalada separadamente.

## Configuração
- `ADMIN_EMAIL`: e-mail da única conta administrativa.
- `ADMIN_PASSWORD`: senha forte da conta; não há senha ou usuário padrão utilizável.
- `COOKIE_SECURE=auto`: Secure ativado em produção ou quando `req.secure` é verdadeiro.
- Em HTTPS de produção, use `COOKIE_SECURE=true`; não use false para contornar problemas.
- `TRUST_PROXY`: `loopback` por padrão; se houver exatamente um proxy confiável entre
  cliente e Node, pode-se configurar `1`. Ajuste à topologia real; não confie em todos os proxies.
- Node 24 carrega `.env` nativamente, sem sobrescrever variáveis já fornecidas pelo ambiente.
- A aplicação falha de forma fechada no login se não houver credenciais válidas.
- A credencial antiga por `x-admin-password` não autoriza mais nenhum endpoint administrativo.
- Sessões opacas no servidor, cookie HttpOnly/SameSite=Strict, validade de 8h,
  logout com revogação, validação de origem e CSRF nas operações administrativas de escrita.
- Dez tentativas inválidas por IP em 15 minutos. A interpretação de IP depende do proxy.
- Sessões e limites ficam em memória: reiniciar o Node encerra as sessões. Destinado a
  uma única instância; múltiplos processos/replicas exigem um armazenamento compartilhado.
- Não há cadastro público, envio de e-mail, recuperação de senha ou gestão de múltiplas contas.
  Troque as credenciais nas variáveis de ambiente e reinicie o processo.

## Identidade
Montserrat (Google Fonts, com Arial como fallback). Cores iniciais #0572cf e #e62526.
Logo, favicon, cores e todos os textos do cabeçalho/rodapé são editáveis no painel.
Sem logo definida, fica somente o espaço reservado, sem “Forma” ou ícone “F”.
Logo: PNG/JPG/WebP, até 2 MB. Favicon: PNG/ICO, até 2 MB. SVG não é aceito.
O arquivo `data/branding.json` e `data/branding-assets/` são criados apenas em runtime,
quando o servidor inicia/salva configurações, não pelo atualizador.
Mantenha DATA_DIR persistente no servidor. Arquivos de identidade antigos não são apagados
automaticamente para não invalidar referências; uploads abandonados podem ficar sem uso.

## Busca e recursos preservados
Busca por nome de projeto ou nome de cliente, sem diferenciar maiúsculas/acentos,
abaixo de “Seus projetos”. Totais gerais permanecem gerais; a contagem indica filtrados/total.
Upload, links privados, visualizador, dimensões, cores do modelo e decisões são preservados.
O JSON de projetos continua sendo o armazenamento do MVP; não houve migração de banco.

## Validações e distribuição
O atualizador prepara candidatos em temporário; se Node estiver disponível, verifica sintaxe
JavaScript e executa testes isolados de autenticação/configuração, sem dependências adicionais.
Node ausente gera aviso, NÃO aprovação. Validação disponível que falhar interrompe a atualização.
Não executa build Vite, WebGL, navegador, Hostinger ou produção automaticamente.

ZIP de código-fonte: `<nome-da-pasta>-1.2.0.zip` no diretório pai, contendo uma pasta raiz do projeto.
Exclui o próprio atualizador (mesmo renomeado), atualizadores antigos com prefixos conhecidos,
.git, node_modules, dist (recompilar), caches, logs, ZIPs, .env, chaves privadas,
dados/modelos/configurações runtime. Os arquivos locais excluídos NÃO são removidos do disco.
Inclui `.env.example` e `data/.gitkeep`, quando presentes, além do código-fonte completo.
Arquivos desconhecidos do projeto são preservados; revise segredos em locais personalizados
antes de distribuir o pacote. Links simbólicos incluíveis são recusados, não seguidos.
Se já existir um ZIP com o mesmo nome, recebe sufixo numérico; nenhum pacote anterior é apagado.

Reexecução 1.2.0 confere hashes dos arquivos gerenciados e não duplica mudanças.
Se estes arquivos tiverem sido editados depois, interrompe sem sobrescrevê-los.
Não há backup, rollback, instalação, alteração de banco, commit, push ou deploy.
A gravação é atômica por arquivo, NÃO uma transação global: falha de escrita pode causar
atualização parcial. Tenha uma referência recuperável antes de executar.
Projetos ou pacotes anteriores nunca são apagados automaticamente.

## Aceitação recomendada em homologação
1. Executar em 0.1.0 e conferir 1.2.0 no package.json, VERSION e changelog.
2. Executar novamente: nenhum arquivo de código deve ser alterado.
3. Testar versão incompatível e trechos divergentes: devem ser rejeitados antes da gravação.
4. Inspecionar ZIP: fonte completo, nenhum atualizador, .env, dado de cliente ou chave.
5. Compilar e testar login inválido/válido, reload, expiração, logout e chave antiga recusada.
6. Trocar ambas as cores, textos, logo e favicon; recarregar painel/login/link do cliente.
7. Buscar por projeto e cliente, com variações de caixa e acento, e testar nenhum resultado.
8. Testar 3MF real: upload, link privado, rotação, zoom, dimensões, cores, aprovação e ajustes.
9. Confirmar startup na Hostinger sem top-level await e cookies seguros em HTTPS.
10. Validar telas móveis e persistência de DATA_DIR após reinício.
