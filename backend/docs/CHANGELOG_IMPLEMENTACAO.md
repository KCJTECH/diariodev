# Changelog da implementação

## 2026-08-03
- Fase 1: análise do repositório e do contrato DV; docs de análise.
- Fase 2: fundação Fastify + TypeScript estrito; config, logger, erros, validação,
  health checks.
- Fase 3: schema Prisma (16 tabelas), migrations e seed idempotente.
- Fase 4: autenticação (login, refresh rotativo com detecção de reuso, logout, me,
  troca e reset de senha), guardas por nível, CSRF por origem, rate limit, auditoria.
- Fase 5: módulos de domínio (bootstrap, atividades, tarefas, usuários, categorias,
  projetos, grupos com recálculo de nível, integrações com segredo mascarado,
  relatórios com agregação SQL, pesquisa com escopo, settings/preferences, auditoria).
- Fase 6: realtime com Socket.IO (salas, publicador da outbox, sync, adaptador Redis);
  migration outbox_sequence (cursor monotônico).
- Fase 7: webhooks confiáveis (BullMQ, HMAC-SHA256, SSRF, retries com backoff até DEAD)
  e resumo diário idempotente.
- Fase 8: integração do frontend (assets/data.js consumindo o backend, DV preservado,
  escrita otimista, realtime, write-through do admin e do perfil, auto-refresh);
  Fastify passou a servir o frontend na mesma origem.
- Anexos: upload validado, download autenticado e remoção.
- Fase 9 (parcial): 52 testes (unit, contrato, integração, E2E), regressão visual e
  teste de carga.
- Correções pegas por teste: logout navegava antes de encerrar a sessão; SQL cru com
  schema fixo (tornado portável pelo search_path).
- Fase 10: documentação, OpenAPI, ADRs e Docker.

## Notas
Nenhum arquivo *.dc.html ou assets/theme.css foi alterado. A única mudança de frontend
é assets/data.js. Confirmar sempre por diff antes de commit.
