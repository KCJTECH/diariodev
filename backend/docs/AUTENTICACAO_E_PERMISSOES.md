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
sessões do colaborador e invalida links de redefinição em aberto, senão um link antigo
continuaria válido depois da troca.

Duas regras de autorização, ambas em `assertCanActOnPassword` e válidas também para o
reset por link abaixo:

Ninguém age sobre a própria conta por essas rotas. Trocar a própria senha é
POST /auth/password, que exige a senha atual. Sem isso, uma sessão sequestrada trocaria a
senha sem conhecer a antiga e trancaria o dono do lado de fora.

Só é possível agir sobre nível estritamente menor. Sem isso um gestor redefine a senha do
CEO e assume o acesso dele, e dois gestores se personificam entre si. Vale para as duas
rotas: definir senha e gerar link.

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

### Contas sem caixa de e-mail própria

Algumas contas têm e-mail cadastrado que ninguém lê, como conta de sistema. Para elas o
link não é enviado ao titular: iria para uma caixa que não é aberta e ficaria um link
válido parado lá. O destino é o papel de gestor, não um endereço fixo: todos os usuários
ativos com nível GESTOR recebem a mensagem, que identifica de quem é o link, e repassam ao
responsável.

Essas contas são declaradas em PASSWORD_RESET_VIA_GESTOR, lista de e-mails separada por
vírgula. Precisa ser declaração explícita porque não há como o sistema descobrir sozinho:
foi medido em 2026-08-05 que o servidor de e-mail da ITS aceita a mensagem mesmo para
caixa que não atende, então o envio é reportado como sucesso e não serve de sinal.

O mesmo desvio acontece quando o envio ao titular falha de verdade, com o SMTP recusando:
aí o link é tentado com os gestores. O caso de o servidor aceitar e a mensagem não chegar
continua sem tratamento automático, porque não é observável pelo backend.

Se um gestor pedir a redefinição da própria senha, ele recebe direto, como qualquer
titular com caixa própria.

Consequência de segurança, aceita conscientemente: quem recebe o link pode definir a senha
daquela conta. Um gestor que receba o link de uma conta de nível superior, como a conta
administrativa, passa a poder assumir aquele acesso. É acesso de emergência, e por isso a
lista PASSWORD_RESET_VIA_GESTOR deve conter apenas o que realmente precisa. As rotas
administrativas de senha continuam com a regra de nível estritamente menor; ela não se
aplica aqui porque no autoatendimento não existe um solicitante autenticado para comparar.

O link aponta para APP_ORIGIN/#reset=TOKEN. O token vai no fragmento, e
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
