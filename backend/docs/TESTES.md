# Testes

## Comandos
```
npm run typecheck
npm test                 # unitários (sem banco)
npm run test:contract    # contrato
npm run test:setup-db    # migrate + truncate + seed no banco de teste
npm run test:integration # integração (fastify.inject contra diariodev_test)
npx playwright test      # E2E (sobe servidor na 3400, banco de teste)
npx tsx tests/load.ts    # carga básica
```

## Banco de teste
Banco dedicado diariodev_test, criado com o privilégio CREATEDB da própria role do
app. A URL de teste é derivada da conexão real por parsing, sem imprimir a senha. Os
arquivos de integração rodam em série (fileParallelism false).

## Cobertura atual (52 verdes)
- Unitários (20): Argon2id, JWT HS256, AES-GCM, HMAC de webhook, SSRF, prioridade,
  slug, datas civis, níveis.
- Contrato (6): envelopes de sucesso e erro, códigos estáveis, estrutura do
  /bootstrap, DTO de atividade e de tarefa.
- Integração (19): auth e CSRF, escopo dev/ceo, conflito de versão, permissão e
  conclusão de tarefa, último CEO, auto-exclusão, criar/desativar usuário, categoria
  arquivada com histórico, recálculo de nível por grupo, segredo de integração
  mascarado, outbox e auditoria, anexos (upload/download/segurança).
- E2E (9): login e dashboard, persistência de sessão, realtime entre dois navegadores,
  logout e proteção de rota, login inválido, pesquisa sem vazamento, e regressão
  visual (login e sidebar).

## Regressão visual
Baselines em tests/e2e/visual.spec.ts-snapshots. Regiões estáveis (sem datas do
servidor). Full-page de telas com data exigiria congelar o serverNow. Atualizar
baseline: npx playwright test visual --update-snapshots.

## Carga (medição real)
Ambiente: máquina de desenvolvimento, Node 24, PostgreSQL e Redis locais, concorrência 20.
- GET /bootstrap: p50 68ms, p95 81ms, 283 req/s.
- GET /activities?perPage=200: p50 23ms, p95 39ms, 811 req/s.
- GET /reports/summary: p50 25ms, p95 34ms, 743 req/s.
O bootstrap é o mais pesado por agregar várias coleções. Números reais, não estimados.

## Pendências
Teste de contrato do payload de webhook, caracterização retroativa do DV e teste de
carga sob volume maior de dados.
