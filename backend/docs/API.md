# API REST

Prefixo: /api/v1. Autenticação por cookie httpOnly. Especificação formal em
openapi.yaml (na raiz do backend).

## Envelopes
Sucesso: `{ "data": ..., "meta": { "requestId": "...", ... } }`.
Lista paginada: meta com page, perPage, total, totalPages.
Erro: `{ "error": { "code": "...", "message": "...", "details": [], "requestId": "..." } }`.

## Autenticação
- POST /auth/login { email, password }
- POST /auth/dev-login { publicKey } (só em desenvolvimento)
- GET  /auth/dev-accounts (lista de colaboradores para o login, só em desenvolvimento)
- POST /auth/refresh
- POST /auth/logout
- GET  /auth/me
- POST /auth/password { currentPassword, newPassword }

## Bootstrap e sync
- GET /bootstrap (estado inicial conforme escopo)
- GET /sync?cursor= (eventos após o cursor, filtrados por escopo)

## Atividades
- GET /activities (filtros: from, to, person, project, category, q, priority, tags, page, perPage, sort, order)
- POST /activities
- GET /activities/:id
- PATCH /activities/:id (exige version)
- DELETE /activities/:id
- POST /activities/:id/attachments (multipart)

## Anexos
- GET /attachments/:id (download autenticado)
- DELETE /attachments/:id

## Tarefas
- GET /tasks (filtros: project, person, status=open|late|done, page, perPage)
- POST /tasks (gestor+)
- GET /tasks/:id
- PATCH /tasks/:id (gestor+)
- POST /tasks/:id/complete
- POST /tasks/:id/reopen (gestor+)
- DELETE /tasks/:id (gestor+)

## Administração (gestor+)
- Usuários: GET/POST /users, GET/PATCH/DELETE /users/:publicKey, POST /users/:publicKey/password
- Categorias: GET/POST /categories, PATCH/DELETE /categories/:id
- Projetos: GET/POST /projects, PATCH/DELETE /projects/:id
- Grupos: GET/POST /groups, PATCH/DELETE /groups/:id, PUT /groups/:id/members
- Integrações: GET/POST /integrations, PATCH/DELETE /integrations/:id, POST /integrations/:id/test
- Execuções: GET /integration-runs

## Relatórios (escopo por nível)
- GET /reports/summary
- GET /reports/by-person
- GET /reports/by-project
- GET /reports/by-category
- GET /reports/daily
Parâmetros: from, to, project, person, category.

## Pesquisa
- GET /search?q= (atividades, pessoas, projetos, categorias, tarefas; conforme escopo)

## Configurações e preferências
- GET/PUT /settings/appearance (leitura autenticada, escrita gestor+)
- GET/PUT /preferences (do próprio usuário)

## Saúde
- GET /health/live, GET /health/ready

## Erros comuns
UNAUTHORIZED (401), FORBIDDEN (403), *_NOT_FOUND (404), VALIDATION_ERROR (422),
VERSION_CONFLICT (409), LAST_CEO (409), RATE_LIMITED (429), INTERNAL_ERROR (500).
