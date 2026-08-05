# Autenticação e permissões

## Sessão
Login por e-mail e senha emite um access token (JWT curto) e um refresh token opaco,
ambos em cookies httpOnly. O access carrega sub (usuário), sid (sessão) e nível. O
refresh é guardado só como hash na tabela sessions.

## Renovação e revogação
POST /auth/refresh rotaciona o refresh e emite novo access. Reapresentar um refresh
de sessão já revogada dispara a revogação de todas as sessões do usuário. Logout
revoga a sessão e limpa os cookies. Trocar a senha revoga as demais sessões.

## Login de protótipo
Em desenvolvimento, POST /auth/dev-login autentica por publicKey (sem senha), e
GET /auth/dev-accounts lista os colaboradores para a tela de login. Ambos exigem
ALLOW_DEV_LOGIN=true e retornam 404 em produção.

## Níveis
- dev: cria atividade só para si; edita/exclui só as próprias; vê as próprias
  atividades nas telas gerais; dentro de um projeto que participa, vê a timeline
  coletiva; conclui as próprias tarefas; não planeja tarefas nem administra.
- gestor: vê a equipe; cria e atribui tarefas; administra usuários, categorias,
  projetos, grupos e integrações; relatórios de equipe.
- ceo: tudo do gestor mais a visão executiva.

## Nível efetivo por grupo (ADR-007)
O nível efetivo do usuário é o maior nível entre seus grupos ativos; sem grupo, dev.
Salvar membros ou o nível de um grupo recalcula os usuários afetados na mesma
transação. O último CEO ativo não pode ser rebaixado nem desativado. Ninguém exclui
ou desativa a própria conta na mesma operação.

## Política de projetos
GET /activities para um dev retorna só as próprias. GET /activities?project=<que
participa> retorna a timeline completa daquele projeto. A regra é aplicada no
servidor (participatesInProject).

## Reset de senha
Dois caminhos geram o token, e os dois terminam no mesmo confirm.

Pelo administrador: POST /users/:publicKey/password-reset (gestor+) gera um token e
envia o link por e-mail para quem acionou, não para o titular da conta. O caso de uso é
o colaborador que não consegue acessar o próprio e-mail: o gestor recebe o link e o
repassa pelo canal que já usa com a equipe. A resposta traz `mailSent` para a tela
informar se o e-mail saiu, e um pedido novo invalida os anteriores ainda abertos. Fora
de produção o token também volta na resposta, para teste e para repasse sem SMTP; em
produção nunca.

Pelo próprio usuário, na tela de login: POST /auth/password-reset/request recebe só o
e-mail. É rota pública, com rate limit de 5 pedidos por 15 minutos. A resposta é
sempre a mesma, exista ou não conta para aquele e-mail, e nunca contém o token: assim
a rota não serve para descobrir quem tem conta. Um pedido novo invalida os anteriores
ainda abertos, para não deixar vários links válidos circulando. O token vale
PASSWORD_RESET_TTL_MINUTES (padrão 60) e o e-mail sai por SMTP
(SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, MAIL_FROM). Sem SMTP
configurado o pedido é registrado, o e-mail não sai e fica um WARN no log; fora de
produção o link também vai ao log, para o desenvolvedor seguir o fluxo.

O link aponta para APP_ORIGIN/login.dc.html#reset=TOKEN. O token vai no fragmento, e
não na query, de propósito: o navegador não envia o fragmento ao servidor, então o
token não aparece no log de requisição, no cabeçalho Referer nem em log de proxy. A
tela lê o fragmento, abre o formulário de nova senha e chama
POST /auth/password-reset/confirm, que troca a senha, consome o token (uso único) e
revoga as sessões do usuário. Depois de usado, a tela limpa o fragmento da barra de
endereço com history.replaceState.

Limitação: revogar a sessão invalida o refresh na hora, mas o access token já emitido
continua válido até expirar (ACCESS_TOKEN_TTL, padrão 15 min), porque o guard não
consulta a sessão a cada requisição. Ver a pendência correspondente em
IMPLEMENTATION_STATUS.md.
