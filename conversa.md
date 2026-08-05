# Entendimento do PROMPT MESTRE — Backend Completo do Diário Dev

Resumo do que entendi do documento `PROMPT MESTRE — BACKEND COMPLETO.md`.
Ao final, o mapeamento do que já foi construído (Fases 1–8) contra cada exigência.

## 1. Missão e resultado esperado
- Transformar o protótipo navegável (frontend já pronto, hoje sobre `localStorage`)
  em um sistema real: persistente, seguro, multiusuário e em tempo real.
- O backend é a fonte oficial de verdade; o navegador deixa de ser a persistência principal.
- Entregar sistema funcionando de verdade — não estrutura, mocks ou rotas vazias.

## 2. Regra absoluta: não alterar o frontend visual
- Proibido alterar `*.dc.html` e `assets/theme.css` (markup, IDs, classes, estilos, textos, fluxo).
- Único arquivo do frontend cuja reestruturação interna é permitida: `assets/data.js`,
  desde que preserve `window.DV` com a mesma superfície pública, assinaturas e formatos.
- Getters permanecem SÍNCRONOS. Métodos novos são permitidos; nenhum existente pode sumir.
- Se for impossível integrar sem tocar em arquivo proibido: documentar o bloqueio e pedir autorização.

## 3. Ponto crítico: inicialização assíncrona x getters síncronos
- As telas leem dados de forma síncrona (`DV.acts()`, `DV.people()`, `DV.user()`...).
- HTTP é assíncrono: é preciso hidratar um cache no bootstrap antes de publicar `window.DV`,
  sem XHR síncrono e sem monkey patch. Permitido adicionar `DV.ready/isReady/onReady/onError`
  (as telas não podem depender deles).

## 4. Stack e arquitetura
- Node LTS + TypeScript estrito, Fastify, PostgreSQL, Prisma (migrations reais, nunca `db push`),
  Socket.IO, Redis, BullMQ, Zod, Pino, Argon2id, Vitest, Playwright, Docker, OpenAPI.
- Monólito modular: módulos por domínio (auth, users, activities, attachments, categories,
  projects, tasks, groups, integrations, reports, search, settings, bootstrap, realtime, audit),
  camadas só quando há lógica real, arquivos enxutos, DI explícita.

## 5. Modelo de dados (16 tabelas)
- users, user_preferences, categories, projects, activities, attachments, tasks,
  access_groups, group_members, integrations, integration_runs, app_settings,
  sessions, password_reset_tokens, audit_logs, outbox_events.
- UUID interno + chave pública legível (public_key/slug). Soft delete, snapshot de nome de
  categoria na atividade, versão para concorrência otimista, índices e constraints no banco.
- Regras: e-mail único case-insensitive; categorias/projetos arquivam (não apagam) preservando
  histórico; último CEO ativo não pode ser removido/rebaixado; ninguém se exclui na mesma operação.

## 6. Datas e fuso
- Remover a data fixa do protótipo. Guardar instantes em UTC (timestamptz); fuso da organização
  `America/Sao_Paulo`. Converter `occurredAt`→`d`/`t`/`dur` comparando datas civis no fuso,
  nunca dividindo milissegundos por 86.400.000.

## 7. Autenticação e autorização
- Login e-mail/senha, refresh com rotação e detecção de reuso, logout, troca e reset de senha.
- Argon2id; access token curto; refresh só como hash; cookies httpOnly/secure/sameSite; CSRF por
  validação de origem; CORS restrito. Login de protótipo ("entrar como") só em dev (ALLOW_DEV_LOGIN).
- Níveis dev/gestor/ceo. Toda autorização no servidor; nunca confiar em level/who/by do cliente.
  Dev vê/edita só o próprio; dentro de projeto que participa, vê a timeline coletiva. Gestor/CEO
  administram; CEO tem visão executiva.

## 8. API REST
- Prefixo `/api/v1`, envelope `{data, meta}` / `{error}`. `/bootstrap` entrega o estado inicial
  conforme o escopo. CRUD de atividades/tarefas/usuários/categorias/projetos/grupos/integrações,
  anexos, relatórios, pesquisa, configurações/preferências, `/sync` incremental.
- Validação, paginação limitada, ordenação por lista segura, transações, versão otimista,
  clientMutationId, auditoria, evento após commit. Agregação de relatórios no SQL, não no Node.

## 9. Realtime (Socket.IO)
- REST para comandos/consultas; Socket.IO para atualizações/invalidação; `/sync` para eventos
  perdidos. Autenticação do socket pela sessão; salas por usuário/nível/projeto/organização
  decididas pelo servidor. Envelope com eventId/cursor/scope; dedupe por eventId/clientMutationId;
  reconexão pede `/sync`; adaptador Redis para múltiplas instâncias.

## 10. Integrações e webhooks
- Outbox transacional (dado + evento na mesma transação), fila, worker, timeout, tentativas,
  backoff com jitter, limite, histórico e estado final de falha. Assinatura HMAC-SHA256 sobre
  `timestamp + "." + corpo`; header legado `X-DiarioDev-Secret`. Proteção SSRF (bloquear IP
  privado/loopback salvo allowlist). Segredos criptografados (AES-GCM), nunca retornados por inteiro.
  Resumo diário por job idempotente no fuso da organização.

## 11. Anexos
- Abstração de armazenamento (disco em dev, S3/MinIO em produção). Limite de tamanho/quantidade,
  extensões permitidas, MIME real detectado, nome interno aleatório, checksum, anti path traversal,
  fora de pasta pública, download autenticado com Content-Disposition.

## 12. Segurança, observabilidade e desempenho
- Headers de segurança, limites de body/upload, timeouts, rate limiting específico (login, refresh,
  reset, busca, upload, export, admin), request id, logs sem segredos. Usuário de banco com
  privilégio mínimo. Health checks live/ready. Evitar N+1 e cargas totais em memória.

## 13. Testes e critérios de aceite
- Caracterização do `DV` antes de reescrever; unitários, integração (Postgres real/Testcontainers,
  nunca SQLite), contrato, E2E (Playwright, cenários de permissão/realtime/conflito) e regressão
  visual. Aceite objetivo: frontend intacto, dados do backend, permissões no servidor, realtime,
  segurança, e qualidade (typecheck/lint/testes verdes).

## 14. Docker, deploy e documentação
- Dockerfile multi-stage (não root, SIGTERM), docker-compose (API, worker, Postgres, Redis, MinIO),
  variáveis documentadas sem valores reais. Migrations com expandir/migrar/contrair. Documentação
  completa (README, ARQUITETURA, BANCO, API, REALTIME, SEGURANCA, INTEGRACAO_FRONTEND, etc.),
  ADRs e relatório final honesto de pendências.

## 15. Estratégia em 10 fases
Análise → fundação → banco → auth/autorização → módulos de domínio → realtime → integrações →
integração do frontend (`data.js`) → validação → documentação.

---

## Mapeamento contra o que já foi construído (2026-08-03)

- Fases 1–7 concluídas e verificadas contra servidor real: análise + docs, fundação Fastify/TS
  estrito, banco (16 tabelas + seed idempotente), auth/sessões/permissões, domínio completo
  (atividades, tarefas, usuários, categorias, projetos, grupos com recálculo de nível, integrações
  com segredo mascarado, relatórios com agregação SQL, pesquisa com escopo, settings/preferences,
  auditoria), realtime (Socket.IO + outbox + salas + `/sync` + adaptador Redis), webhooks (BullMQ,
  HMAC, SSRF, retries→DEAD) e resumo diário idempotente.
- Fase 8 (núcleo) concluída e verificada no navegador: `assets/data.js` reescrito consumindo o
  backend, `DV` preservado com getters síncronos, login por dev-login, bootstrap, telas com dados
  reais, datas dinâmicas, escrita otimista com reconciliação, persistência após reload, sessão por
  cookie e realtime cross-session. Fastify passou a servir o frontend na mesma origem.
- Pendências honestas: write-through do painel admin (categorias/usuários/grupos/integrações pela
  tela de Configurações ainda não persiste — increment 2); login real por senha ficaria bloqueado
  pela regra de não alterar HTML; Fase 9 (testes automatizados) e Fase 10 (docs finais + OpenAPI)
  ainda pendentes; algumas limitações registradas (desconexão de socket em sessão revogada,
  extensões pg_trgm/unaccent não instaladas).
- Infra: Postgres local `diarioDev`/schema `diariodev`/usuário `diariodev_app`; Redis via Memurai.

---

## Mapa do frontend (entendimento das 11 telas)

Modelo mental: toda tela lê de `window.DV` (cache em memória hidratado no bootstrap)
e calcula as visões no próprio cliente. O backend tem três papéis apenas: entregar os
dados iniciais no formato do `DV`, persistir as escritas e empurrar eventos em tempo real.
Nenhuma tela precisa de endpoint de cálculo (dashboard, relatórios, Gantt, workload,
heatmap, pesquisa são todos derivados em JavaScript sobre as coleções em cache).

### Cobertura por tela
- dashboard, colaboradores, colaborador: leitura pura. OK.
- atividades: leitura + CRUD de atividade + concluir tarefa. OK.
- projetos: leitura + CRUD de tarefa. OK.
- projeto (abas workload, calendário, Gantt): tudo derivado de `acts`/`tasks`
  (`a.d`, `t.due`, `t.pri`, `t.who`). O Gantt calcula a barra por prioridade
  (alta 3d, média 6d, baixa 10d) e prazo, não pela duração real. Sem dado novo. OK.
- relatorios (dev/gestor/ceo, heatmap, matriz projeto x categoria, evolução semanal,
  carteira, insights, export CSV): calculado no cliente sobre `visibleActs`/`people`/
  `projects`. Nenhum endpoint de relatório é necessário. OK.
- pesquisa: filtro local sobre `acts`/`people`/`projects`. OK.
- usuario: tema, densidade e recolhido persistem; perfil próprio, projeto padrão e senha faltam.
- configuracoes: leitura OK; Aparência OK; aba Estados sem persistência;
  Categorias, Usuários, Grupos e Integrações ainda não persistem.

### Increment 2 (concluído em 2026-08-03; tudo no `assets/data.js`, endpoints já existiam)
1. `setCats(nomes)` para `/categories` (diff de nomes). Feito.
2. `setPeople(lista)` para `/users` (admin de colaboradores e edição do próprio perfil). Feito.
3. `setUi({groups})` para `/groups` + `PUT /groups/:id/members` (recalcula nível, protege último CEO). Feito.
4. `setUi({integrations})` para `/integrations`. Feito. O botão "Testar" da tela só cria um run fictício local.
5. `setUi({defaultProject})` para `PUT /preferences` (mapeia nome do projeto para id). Feito.
6. Modal de troca de senha (`usuario?senha`) aparenta ser protótipo (não chama `DV`);
   efetivar a troca exigiria mudar HTML. Pendente.
Extra: auto-refresh no bootstrap (renova o access token expirado pelo refresh antes de cair no login).

### Ressalvas de backend (não são do front)
- A janela do bootstrap (60 dias, até 500 atividades) precisa cobrir o período máximo dos
  relatórios; conferir o seletor de período e ampliar ou carregar sob demanda se necessário.
- `DV.ui().defaultProject` hoje retorna `undefined` (a tela cai no fallback vazio sem quebrar);
  pode ser populado a partir de `user_preferences`.

### O que explicitamente não precisa
Nenhum endpoint novo, nenhuma entidade nova, nenhuma mudança no frontend. A aba Estados não
persiste nada. Gantt, workload e calendário não pedem dados extras. Nenhum método do `DV`
usado pelas telas está faltando na implementação atual.

---

## Status vs PROMPT MESTRE (2026-08-03)

### Panorama por fase (§34)
- Fase 1 Análise: FEITO (docs em backend/docs/).
- Fase 2 Fundação: FEITO (Fastify + TS estrito, config zod, logger pino, erros, validação, health live/ready).
- Fase 3 Banco: FEITO (16 tabelas migradas, seed idempotente).
- Fase 4 Auth e autorização: FEITO (login, refresh rotativo, logout, /me, troca e reset de senha, guardas por nível, CSRF por origem, rate limit, sessões no Postgres).
- Fase 5 Domínio: FEITO (bootstrap, atividades, tarefas, usuários, categorias, projetos, grupos com recálculo de nível, integrações com segredo mascarado, relatórios com agregação SQL, pesquisa com escopo, settings/preferences, auditoria e anexos).
- Fase 6 Realtime: FEITO (Socket.IO por cookie, salas, publicador da outbox, /sync, adaptador Redis).
- Fase 7 Integrações/webhooks: FEITO (outbox transacional, BullMQ, HMAC-SHA256, SSRF, retries com backoff até DEAD, resumo diário idempotente).
- Fase 8 Integração do frontend: FEITO (assets/data.js consumindo o backend, DV preservado e síncrono, bootstrap, escrita otimista, realtime, write-through do admin/perfil, auto-refresh; Fastify serve o frontend na mesma origem).
- Fase 9 Validação: FEITO. 52 testes (20 unit, 6 contrato, 19 integração, 9 E2E com regressão visual), teste de carga com números reais, typecheck 0.
- Fase 10 Documentação: FEITO. README + 18 docs + 8 ADRs + openapi.yaml; Docker (Dockerfile + docker-compose, §30).

### Critérios de aceite (§36) já atendidos
Frontend intacto (nenhum *.dc.html/theme.css alterado), dados vindos do backend, getters síncronos, datas reais, recarregar não perde dados, logout limpa sessão, sessão expirada tratada. Backend: migrations, seed, login/refresh/logout, permissões no servidor, CRUD de atividades/tarefas, conclusão transacional por atividade, usuários, categorias arquivadas com histórico, projetos, grupos recalculando nível, integrações, anexos protegidos, relatórios e pesquisa com escopo, auditoria, health checks. Realtime: alteração aparece em outro navegador, sem vazamento por sala, /sync na reconexão, adaptador Redis. Segurança: Argon2id, tokens fora do localStorage, cookies seguros, CORS restrito, rate limit, upload validado, segredos criptografados, logs sem segredos, webhooks assinados, SSRF tratado, rotas admin autorizadas, usuário não se exclui. Qualidade: typecheck 0, testes verdes.

### Falta (endurecimento, não bloqueia uso)
Fases 9 e 10 concluídas em 2026-08-03 (testes + regressão visual + carga; documentação completa + OpenAPI + ADRs + Docker). Restam apenas itens de endurecimento:
- Anexos avançados (§20): provider S3/MinIO (só disco local feito), quarentena/antivírus ClamAV, streaming no lugar de buffer.
- Desconectar socket em sessão revogada (§18.1); extensões pg_trgm/unaccent para busca sem acento; envio real por SMTP (reset e resumo por e-mail); métricas Prometheus (§27).
- Contrato do payload de webhook e caracterização retroativa do DV (§29.1/29.4).
- Bloqueios de frontend (§4.3, exigem autorização para tocar HTML; o backend já existe): upload/download de anexo pela tela (onPickFiles descarta o File) e login real por senha (a tela aceita qualquer senha via dev-login).
- Confirmado que NÃO deve existir: a aba "Estados" não persiste nada, sem tabela nem endpoint (§23).

---

## Níveis de acesso e módulos (verificado no backend, 2026-08-03)
Detalhe completo em backend/docs/NIVEIS_DE_ACESSO.md.

Níveis: ceo (alvaro, marcelo), gestor (laerty), dev (camila, elaine, julio, rafael;
bruna inativo; teste-novo sobra de teste). Nível efetivo = maior nível entre os grupos
ativos; sem grupo, dev. Grupos: Desenvolvimento[dev], Liderança técnica[gestor],
Diretoria[ceo], Administração[gestor].

Matriz (bloqueado = 403 no servidor; permitido = passou pelo controle de nível):
- dev: registra e vê só as próprias atividades (10 de 32 na base de teste), conclui as
  próprias tarefas, vê projetos que participa, relatório pessoal. Bloqueado em toda a
  administração (categorias, usuários, projetos, grupos, integrações, aparência) e em
  planejar tarefas.
- gestor: vê a equipe inteira (32), planeja/atribui tarefas e administra tudo.
- ceo: tudo do gestor mais a visão executiva nos relatórios.

Observações: o menu é o mesmo para todos (o frontend não esconde itens; o gate é o
backend). As permissões finas dos grupos (gerenciar.usuarios etc.) são rótulos
descritivos herdados do frontend; a autorização real é por NÍVEL efetivo, não por essas
strings. Salvaguardas: último CEO não rebaixa/desativa; ninguém se exclui.
