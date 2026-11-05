# Atualização 1.3.1 → 1.3.2 — instalação nova pelo navegador

## Escopo confirmado
Aplicação 3mfpreview, base 1.3.1 gerada pelo atualizador desta conversa.
Instalação NOVA, sem projetos/clientes/admin anterior. Esquema continua 1.3.0.
Não é migração de dados nem recuperação de senha de uma conta existente.

## Aplicar no computador
1. Coloque atualizador_1_3_2.py dentro da pasta do projeto 1.3.1.
2. Execute: python atualizador_1_3_2.py
3. O script valida a base e prepara os arquivos, atualiza versão/changelog,
   valida o que estiver disponível e gera <pasta>-1.3.2.zip no diretório pai.
   ZIP anterior não é substituído: usa sufixo numérico.
4. Anote a chave privada mostrada no terminal. Ela também fica no arquivo LOCAL
   .installation-key, com permissão 0600 quando suportada pelo sistema operacional.
   Esse arquivo e os atualizadores ficam fora do ZIP/Git pelos filtros fornecidos.
   .gitignore não remove do Git um arquivo que já era rastreado.
5. Publique pelo seu fluxo habitual GitHub/Hostinger, sob sua autorização.
   O atualizador não executa commit, push, deploy, backup ou instalação de pacotes.

## Configurar a Hostinger — não há comando no servidor
Mantenha as variáveis MySQL já configuradas:
DB_HOST=localhost
DB_PORT=3306
DB_NAME=<nome real já configurado>
DB_USER=<usuário real já configurado>
DB_PASSWORD=<senha real já configurada>

Adicione somente a nova variável de proteção:
INSTALLATION_KEY=<chave privada exibida pelo atualizador local>

Salve/aplique as variáveis e reinicie/republique a aplicação pelo painel.
Não use a senha do banco como senha do administrador nem como chave de instalação.
O Python NÃO pergunta por DB_NAME/DB_USER/DB_PASSWORD, não os altera e não consegue
ler ou alterar as variáveis do painel remoto.

## Cadastro no navegador
1. Abra a raiz do seu domínio: a aplicação redireciona para /install.
   Também pode abrir diretamente /install.
2. Informe a chave de instalação, o e-mail e a senha do administrador.
   A senha precisa ter de 12 a 1024 caracteres; confirme-a no segundo campo.
3. Marque a confirmação de instalação nova e clique para concluir.
4. Somente esse POST, com chave válida e confirmação, prepara as oito tabelas
   do SQL 1.3.0, grava a identidade visual padrão, cadastra o administrador
   com hash scrypt e marca a instalação como concluída.
5. Clique em “Ir para o login” e use o e-mail/senha escolhidos.
6. Depois do sucesso, remova INSTALLATION_KEY do painel e reinicie quando puder.
   Mesmo que a chave permaneça no ambiente, o banco instalado bloqueia novo cadastro.

Não é necessário executar data:import, admin:setup-token ou SQL manual nesta
instalação nova. Os utilitários históricos permanecem para outros cenários,
mas NÃO são as instruções de instalação desta versão.

## Proteções e preservação
- GET /install e GET de status não criam tabelas nem administradores.
- Criação exige chave aleatória forte, mesma origem, JSON e confirmação.
- Limite de tentativas em memória por processo; reiniciar zera esse limite.
- GET_LOCK no mesmo servidor MySQL coordena o cadastro entre processos.
- Bloqueio de linha/transação protege admin, branding e estado.
- A senha usa o hash/salt do módulo já entregue; não é armazenada em texto puro.
- Banco já instalado ou parcialmente preenchido NÃO é zerado/reinicializado.
- Arquivos existentes em DATA_DIR impedem esta instalação nova.
  Diretórios models e branding-assets vazios e arquivos .gitkeep são aceitos.
- Aceita tabelas do SQL 1.3.0 já importadas, desde que vazias e com estado inicial.
- Não contém DROP/ALTER/DELETE de dados, não importa JSON nem move modelos.
- Mantém o restante de login/sessões, conta, branding, links e visualizador.
- O SQL precisa estar íntegro: hash do arquivo é fixado na atualização.
- O usuário MySQL precisa poder CREATE/REFERENCES na instalação, além de
  SELECT/INSERT/UPDATE. Depois é recomendável reduzir privilégios em operação.
- Não existe senha padrão, cadastro público sem chave ou reset público.

## Falhas e limites
DDL MySQL não é uma transação global. Uma falha pode deixar tabelas vazias criadas.
O cadastro/branding/estado são transacionais. Se falhar antes do commit,
o formulário pode ser enviado novamente sem excluir tabelas.
Se a conexão cair durante o commit, o resultado pode ser incerto. Recarregue
/install: se concluído, vá ao login. Nunca apague tabelas para tentar novamente.
Projetado para um único servidor MySQL; não homologado para NDB/cluster distribuído.
O usuário precisa autorizar e confirmar as escritas pelo formulário.
Nenhuma escrita no banco é feita pelo Python, pelo build ou ao iniciar o Node.

## Validações do atualizador
Valida manifesto/hashes da base; alterações desconhecidas são recusadas.
Python 3.9+, somente biblioteca padrão. Usa caminhos relativos ao próprio script.
Se Node estiver disponível: node --check e testes isolados de instalação com
um adaptador MySQL simulado. Testes Node ausentes são explicitamente avisados.
Não roda npm install/build, não acessa rede/MySQL, não abre servidor real.
Aplicação e empacotamento só depois das validações disponíveis passarem.
A substituição é atômica POR ARQUIVO, não por atualização inteira.
Não há backup nem rollback global. Falha de escrita pode deixar aplicação parcial.

## ZIP
Fonte completa com pasta raiz do projeto, no diretório pai.
Exclui atualizador, .installation-key, .env privados, dados, modelos 3MF,
dependências, dist, Git, caches, ZIPs e chaves privadas conhecidas.
DATA_DIR personalizado dentro do projeto também é excluído.
Não é backup do MySQL nem dos modelos. Revise outros segredos personalizados.
Geração do ZIP não equivale a publicar ou homologar em produção.

## Aceitação após publicar (manual)
- /install mostra o formulário com INSTALLATION_KEY configurada.
- Chave errada e origem externa não permitem cadastro.
- Chave correta, e-mail e senha criam um único administrador.
- Tela inicial permite login sem pedir token de terminal.
- Reabrir /install informa instalação encerrada.
- Testar logout/login, personalização e upload/revisão de um projeto de teste.
- Depois de remover INSTALLATION_KEY, login continua funcionando.

## Referências técnicas
https://dev.mysql.com/doc/refman/8.0/en/locking-functions.html
https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html
https://nodejs.org/api/crypto.html
