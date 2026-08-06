# Segurança

## Autenticação
Senhas com Argon2id. Access token JWT curto em cookie httpOnly. Refresh opaco,
guardado só como hash, com rotação e detecção de reuso (revoga a sessão ao detectar).
Secure em produção, SameSite Lax, escopo de caminho e expiração explícita. Tokens
nunca ficam no localStorage.

O guard valida a sessão, não só o usuário: consulta a tabela `sessions` e recusa
sessão revogada ou expirada. Por isso logout, troca de senha pelo administrador,
redefinição por link e desativação de conta deixam de autorizar na hora, e não ao
expirar o access token. O handshake do Socket.IO usa o mesmo guard, e sessão
revogada derruba os sockets abertos do usuário pelo publicador da outbox.

Login tem bloqueio por conta, além do limite por IP, com contador em Redis
(LOGIN_MAX_ATTEMPTS, LOGIN_LOCK_MINUTES). Limite só por IP é contornável
distribuindo tentativas e não protege uma conta específica. O contador falha
aberto de propósito: Redis indisponível não impede login.

Cookie de sessão sem Secure em produção exige ALLOW_INSECURE_COOKIES declarado,
senão o boot falha. Rodar sem HTTPS passa a ser escolha registrada.

## Autorização
Toda decisão no servidor. Nunca confia em level, who, by, permissions ou role
enviados pelo cliente. Níveis dev, gestor, ceo. Guardas authenticate e requireLevel.
Políticas de escopo reutilizáveis (visibleActs, participatesInProject).

Regras relacionais de nível ficam em `src/common/auth/policy.ts`: conceder nível
vai até o próprio nível; administrar pessoa e afetar nível por grupo também, com a
própria conta permitida; credencial é estritamente menor e proíbe a própria conta.
O racional e os becos sem saída que descartaram a regra estrita estão no ADR-009.

Critério para código futuro: toda função de service que escreve nível de acesso,
membresia de grupo ou credencial valida a autorização internamente, porque a
decisão depende do nível persistido do alvo e do mesmo limite transacional do
recálculo. As demais podem confiar no gate de rota, porque não têm relação de rank
entre ator e alvo. Se um diff escrever `effectiveLevel`, `groupMember` ou
`passwordHash`, tem de haver chamada de `policy.ts` na mesma função.

Participação em projeto é auto-declarada por escrita (§16.3), então `resolveProject`
recusa vincular um dev a projeto existente do qual ele não participa. Sem isso,
escrever uma atividade em projeto alheio destravava a timeline de terceiros, os
anexos e a sala de realtime daquele projeto. Projeto novo continua podendo nascer
de uma atividade.

Concluir tarefa por `sourceTaskId` na criação de atividade exige ser o responsável
pela tarefa ou ter permissão de planejar, a mesma regra do caminho por
`POST /tasks/:id/complete`.

## CSRF e origem
Mutações validam o header Origin contra uma allowlist (APP_ORIGIN e a própria origem
do servidor). CORS restrito com credenciais. Requisições de outras origens sao
recusadas com 403.

## HTTP
helmet, limites de corpo (1 MiB JSON) e de upload, rate limit global com teto
folgado mais limites apertados por rota (login, refresh, reset, senha, busca,
upload, teste de integração), request id e logs estruturados.

`trustProxy` aceita apenas os proxies declarados em TRUST_PROXY, vazio por padrão.
Confiar sem restrição deixava o cliente escolher o IP que o servidor registra, o
que furava o rate limit por IP e envenenava o `ipHash` gravado em auditoria e
sessões.

CSP ligada. O que ela entrega: origem de script restrita à própria e ao unpkg, de
onde vem o React; sem plugin; sem enquadramento; base e destino de formulário
fixados na origem; imagem, fonte e conexão restritas. O que ela **não** entrega:
contenção de XSS. `unsafe-inline` é obrigatório porque as telas definem o
componente em script inline e usam style inline em quase todo elemento, e
`unsafe-eval` porque o support.js avalia a classe de lógica como string. Sem
`unsafe-eval` a tela renderiza sem comportamento nenhum, medido no navegador.
Remover os dois exigiria alterar `.dc.html` e `support.js`, proibido por §4.1.

HSTS só é emitido quando o acesso é HTTPS: emitir em cenário HTTP interno faria o
navegador exigir HTTPS naquele host por um ano, inclusive subdomínios.

## Validação
Corpo, query e params validados com Zod. Paginação limitada, ordenação por lista
segura, e-mail, UUID, MIME, tamanho de texto e de arrays.

## Segredos
Segredos de integração criptografados com AES-256-GCM; a chave mestra vem de
ENCRYPTION_KEY. Consultas retornam apenas secretConfigured e uma prévia mascarada.
Logs redigem authorization, cookie, senha, hash, token e segredo.

## Webhooks
Assinatura HMAC-SHA256 sobre timestamp + "." + corpo bruto, com comparação em tempo
constante. Proteção SSRF: só HTTP/HTTPS, bloqueio de IP privado, loopback e
link-local, incluindo IPv4 embutido em IPv6 (`::ffff:127.0.0.1` escapava antes) e o
prefixo NAT64, sem seguir redirecionamentos, timeout e allowlist configurável para
hosts internos. Host que não resolve é recusado.

O header `X-DiarioDev-Secret` foi removido em 2026-08-06: enviava o segredo
compartilhado em texto puro, e o endpoint pode ser `http://`, então trafegava sem
TLS. A assinatura HMAC já era a validação recomendada e tornava o header
redundante. Quem consome deve validar a assinatura.

## Anexos
Extensão em allowlist, tipo real detectado (file-type), bloqueio de executáveis e de
conteúdo incompatível, checksum, nome interno aleatório, fora da pasta pública,
download autenticado com Content-Disposition attachment.

## Banco
Usar usuário de banco com privilégio mínimo (não o superusuário do PostgreSQL).

## Dados pessoais
O DTO de pessoa não expõe o id interno: a API identifica colaborador por
`publicKey`. Para nível dev, o e-mail de terceiros não é entregue; o próprio
registro vem completo. O nível de acesso continua visível para todos de propósito:
omiti-lo não esconderia, porque o `levelOf` do frontend tem fallback e passaria a
mostrar todo mundo como Desenvolvedor, ou seja, a tela exibiria informação falsa
em vez de ausente.

## Produção
Desligar login de protótipo (ALLOW_DEV_LOGIN=false), stack trace, seed automático
e credenciais padrão. Cookies seguros e CORS fechado. Não há Swagger exposto: as
dependências de swagger foram removidas em 2026-08-06 porque nunca foram
registradas, e o contrato é mantido à mão em `openapi.yaml`, que não é servido.
