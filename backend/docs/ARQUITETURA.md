# Arquitetura

## Visão geral
Monólito modular. Um processo de API (Fastify) e um processo de worker (BullMQ),
compartilhando o mesmo código e banco. PostgreSQL é a fonte de verdade; Redis
serve o adaptador do Socket.IO, as filas e o lock do resumo diário.

## Módulos (src/modules)
Cada módulo agrupa rotas, serviço, e quando há lógica real, mapper e políticas.
- auth: login, refresh rotativo, logout, /me, troca e reset de senha, guardas.
- users, categories, projects: administração (gestor+), com arquivamento e snapshot.
- activities: CRUD com escopo por nível, versão otimista, clientMutationId.
- tasks: CRUD, concluir/reabrir, planejamento restrito a gestor+.
- attachments: upload validado, download autenticado, remoção.
- groups: CRUD e membros, com recálculo do nível efetivo.
- integrations: CRUD com segredo criptografado; histórico de execuções.
- reports: agregação em SQL; search: busca com escopo.
- settings: aparência global e preferências individuais.
- bootstrap: estado inicial do frontend.
- realtime: Socket.IO, salas, publicador da outbox, sync.
- audit: registro de auditoria.
- health: live/ready.

## Infraestrutura (src/common)
config (env validada por Zod), logging (Pino com redaction), errors (AppError e
handler central), http (envelopes, meta de requisição), auth (JWT, tokens, senha,
tipos e níveis), database (Prisma e Redis), events (outbox), domain (prioridade,
datas, resolução de projeto/categoria), storage (disco local), utils (crypto, format).

## Fluxo HTTP
Requisição, plugins de segurança (helmet, CORS por origem, cookie, rate limit),
hook de validação de origem para mutações, guarda de autenticação/nível, validação
Zod do corpo, serviço de domínio em transação, resposta no envelope padrão. Erros
passam pelo handler central e viram o envelope de erro.

## Fluxo de eventos (outbox)
Toda mutação relevante grava, na MESMA transação, uma linha em outbox_events. O
publicador (no processo da API) reivindica eventos não publicados com FOR UPDATE
SKIP LOCKED, emite via Socket.IO às salas de destino e, para eventos externos,
enfileira webhooks no BullMQ. Entrega ao menos uma vez; o cliente deduplica.

## Fluxo Socket.IO
O socket autentica pela sessão (cookie). O servidor decide as salas: organization,
user, level e project. Eventos vão só às salas autorizadas. Na reconexão, o cliente
chama /sync com o último cursor para recuperar eventos perdidos. Adaptador Redis
permite múltiplas instâncias.

## Filas
Fila dv-webhooks (entrega de webhooks com retries e backoff) e fila dv-daily (job
repetível do resumo diário). Consumidas pelo worker.

## Limites do sistema
Não é Jira nem apontamento de horas. Não há workflow complexo. Recursos seguem o
que o frontend representa. A aba "Estados" não persiste nada.

## Decisões
Registradas em docs/adr/ADR-001 a ADR-008.
