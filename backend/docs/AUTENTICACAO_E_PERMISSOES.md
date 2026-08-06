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

## Senha definida pelo administrador
POST /users/:publicKey/password (gestor+) define a senha do colaborador direto, e é o
que sustenta os campos Nova senha e Confirmar senha da tela de administração. Encerra as
sessões do colaborador na mesma transação, então a troca tem efeito imediato.

Duas regras de autorização, ambas em `assertCanManageCredentials` (policy.ts):

Ninguém age sobre a própria conta por essa rota. Trocar a própria senha é
POST /auth/password, que exige a senha atual. Sem isso, uma sessão sequestrada trocaria a
senha sem conhecer a antiga e trancaria o dono do lado de fora.

Só é possível agir sobre nível estritamente menor. Sem isso um gestor redefine a senha do
CEO e assume o acesso dele, e dois gestores se personificam entre si.

## Redefinição por link: removida em 2026-08-06
O fluxo "Esqueci minha senha" foi removido a pedido do responsável. Saíram as rotas
POST /auth/password-reset/request, POST /auth/password-reset/confirm e
POST /users/:publicKey/password-reset, as funções correspondentes em auth.service e
users.service, a tabela password_reset_tokens (migration
20260806190000_remove_password_reset), o módulo common/mail/mailer.ts, a dependência
nodemailer e as variáveis PASSWORD_RESET_TTL_MINUTES, PASSWORD_RESET_VIA_GESTOR e
SMTP_*. O histórico de quem pediu redefinição continua em audit_logs, que não foi tocado.

Consequência operacional: não existe mais autoatendimento de recuperação de acesso. Quem
perder a senha depende de alguém de nível superior definir uma nova por
POST /users/:publicKey/password, na tela de administração. Se a única conta de nível mais
alto perder o acesso, a saída é definir a senha direto no servidor, com acesso ao banco.
