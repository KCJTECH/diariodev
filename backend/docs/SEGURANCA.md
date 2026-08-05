# Segurança

## Autenticação
Senhas com Argon2id. Access token JWT curto em cookie httpOnly. Refresh opaco,
guardado só como hash, com rotação e detecção de reuso (revoga a sessão ao detectar).
Secure em produção, SameSite Lax, escopo de caminho e expiração explícita. Tokens
nunca ficam no localStorage.

## Autorização
Toda decisão no servidor. Nunca confia em level, who, by, permissions ou role
enviados pelo cliente. Níveis dev, gestor, ceo. Guardas authenticate e requireLevel.
Políticas de escopo reutilizáveis (visibleActs, participatesInProject).

## CSRF e origem
Mutações validam o header Origin contra uma allowlist (APP_ORIGIN e a própria origem
do servidor). CORS restrito com credenciais. Requisições de outras origens sao
recusadas com 403.

## HTTP
helmet, limites de corpo (1 MiB JSON) e de upload, rate limit por rota (login,
refresh, reset, busca, upload, teste de integração), request id e logs estruturados.

## Validação
Corpo, query e params validados com Zod. Paginação limitada, ordenação por lista
segura, e-mail, UUID, MIME, tamanho de texto e de arrays.

## Segredos
Segredos de integração criptografados com AES-256-GCM; a chave mestra vem de
ENCRYPTION_KEY. Consultas retornam apenas secretConfigured e uma prévia mascarada.
Logs redigem authorization, cookie, senha, hash, token e segredo.

## Webhooks
Assinatura HMAC-SHA256 sobre timestamp + "." + corpo bruto, com comparação em tempo
constante. Proteção SSRF: só HTTP/HTTPS, bloqueio de IP privado/loopback/link-local,
sem seguir redirecionamentos, timeout e allowlist configurável para hosts internos.

## Anexos
Extensão em allowlist, tipo real detectado (file-type), bloqueio de executáveis e de
conteúdo incompatível, checksum, nome interno aleatório, fora da pasta pública,
download autenticado com Content-Disposition attachment.

## Banco
Usar usuário de banco com privilégio mínimo (não o superusuário do PostgreSQL).

## Produção
Desligar login de protótipo (ALLOW_DEV_LOGIN=false), Swagger público, stack trace,
seed automático e credenciais padrão. Cookies seguros e CORS fechado.
