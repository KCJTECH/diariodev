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
POST /users/:publicKey/password-reset (gestor+) gera um token; em desenvolvimento o
token é retornado na resposta (sem SMTP). POST /auth/password-reset/confirm troca a
senha e revoga as sessões. O envio por e-mail (SMTP) é um item pendente.
