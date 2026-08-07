# Memória do projeto — Diário Dev (continuidade)

Arquivo de retomada. Diz onde o trabalho parou, como rodar e o que fazer a seguir.
Para o entendimento do escopo (as 39 seções do PROMPT MESTRE), ver `conversa.md`.

Última atualização: 2026-08-03.

## O que é
Backend real para o frontend estático existente do Diário Dev, sem tocar no visual
(`*.dc.html` e `assets/theme.css` intocados). Único arquivo de frontend reescrito:
`assets/data.js` (contrato `window.DV` preservado, getters síncronos). Backend em
`backend/` (Fastify + TypeScript estrito + Prisma + PostgreSQL + Socket.IO + BullMQ).

## Estado atual (Fases 1–8 do PROMPT MESTRE)
Todas verificadas contra servidor/banco reais; `npm run typecheck` = exit 0 em cada fase.

- Fase 1 — Análise: `backend/docs/ANALISE_INICIAL.md`, `MAPEAMENTO_DV.md`, `MATRIZ_COMPATIBILIDADE_FRONTEND.md`.
- Fase 2 — Fundação: config (Zod), logger (Pino + redaction), erros, envelopes, Prisma, Redis, health checks, app/server.
- Fase 3 — Banco: 16 tabelas migradas no schema `diariodev`; seed idempotente (7 pessoas, 7 categorias, 5 projetos, 24 atividades, 6 tarefas, 4 grupos, 4 integrações).
- Fase 4 — Auth: login, refresh rotativo com detecção de reuso, logout, `/me`, troca e reset de senha, guardas por nível, CSRF por origem, rate limit, auditoria.
- Fase 5 — Domínio: bootstrap, atividades, tarefas, usuários, categorias, projetos, grupos (recálculo de nível + guarda último CEO), integrações (segredo mascarado), relatórios (agregação SQL), pesquisa (escopo), settings/preferences, auditoria transversal. Outbox gravada em todas as mutações.
- Fase 6 — Realtime: Socket.IO autenticado por cookie, salas por servidor, publicador da outbox (FOR UPDATE SKIP LOCKED), `/sync`, adaptador Redis.
- Fase 7 — Webhooks: BullMQ + worker, HMAC-SHA256, SSRF, retries→DEAD, `POST /integrations/:id/test`, resumo diário idempotente (lock Redis por dia).
- Fase 8 (núcleo) — Frontend ligado: `assets/data.js` consome o backend; login por dev-login, bootstrap, telas com dados reais, datas dinâmicas (serverNow), escrita otimista com reconciliação, persistência após reload, sessão por cookie, realtime cross-session. Fastify serve o frontend na mesma origem (allowlist de caminhos; `backend/.env` bloqueado).

## Como rodar (dev)
```
cd backend
npm run dev            # API + Socket.IO + serve o frontend em http://localhost:3333
npm run start:worker   # (outro terminal) worker de webhooks + resumo diário
```
Abrir: http://localhost:3333/login.dc.html
Login de dev: qualquer colaborador pela lista "entrar como". Senha do seed em `prisma/seed.ts`
(todos os usuários; trocar fora do local). Perfis: marcelo=ceo, laerty=gestor, demais=dev.

## Deploy em VM (2026-08-04) — NO AR
Sistema implantado e validado em http://10.70.1.135:3333/login.dc.html (Debian 13, host kcjlab17, user kcj).
Sem Docker: o servidor já tinha Node 24 e PostgreSQL 17 (porta **5433**); Redis 8 foi instalado no deploy.
Banco `diariodev` / schema `diariodev` / user `diariodev_app`; migrations + seed aplicados; conta alvaro (CEO).
Projeto em /home/kcj/diariodev, logs em /home/kcj/diariodev/logs. Detalhes e comandos: backend/docs/DEPLOY_VM_10.70.1.135.md.
Acesso por chave SSH configurado (o agente conecta sem senha; root/sudo continua sendo o Julio).
Correção nascida do deploy: `COOKIE_SECURE` (env + auth.cookies.ts) — com NODE_ENV=production o cookie saía sempre
Secure e o login não persistia em HTTP; na VM está COOKIE_SECURE=false. Com HTTPS, voltar para true.
Login na tela passou a ser REAL por e-mail e senha (2026-08-04): removida a lista "ou entre como" do
login.dc.html (expunha nome/cargo/nível de todos sem autenticar), adicionado `DV.login()` no data.js e
ALLOW_DEV_LOGIN=false na VM (fecha /auth/dev-login e /auth/dev-accounts). E2E atualizados: 10 verdes.
Senha de novos usuários: a tela de admin NÃO tem campo de senha, então o backend usa
`INITIAL_USER_PASSWORD` (definida na VM) como senha inicial; sem ela, gera aleatória e a conta fica
inacessível pela tela. Script administrativo na VM: `bash /home/kcj/set-pass.sh email 'senha'`.
PENDENTE no servidor (exige root): instalar os units systemd já enviados (/home/kcj/diariodev-api.service e
diariodev-worker.service) para subir no boot; hoje os processos rodam via setsid/nohup.

## Infra local (desenvolvimento)
- PostgreSQL local: banco `diarioDev` (D maiúsculo, case-sensitive na URL), schema `diariodev`,
  usuário app `diariodev_app` (não superusuário; tem CREATEDB p/ shadow db do migrate dev).
- Redis: Memurai (serviço Windows, `localhost:6379`).
- Conexões e segredos ficam em `backend/.env` (nunca versionar; não são lidos/impressos).

## Próximos passos (pendências)
1. Fase 8 increment 2 — CONCLUÍDO (2026-08-03): write-through do painel admin e do perfil próprio persistindo por diff em `assets/data.js` (`setCats`→`/categories`, `setPeople`→`/users`, `setUi({groups})`→`/groups`+`/groups/:id/members`, `setUi({integrations})`→`/integrations`, `setUi({defaultProject})`→`/preferences`). Verificado no navegador (cria/edita/remove + recálculo de nível de grupo, persiste após reload). Também adicionado auto-refresh no bootstrap (renova access token expirado pelo refresh antes de cair no login). Resta só: modal de troca de senha (aparenta ser protótipo; efetivar exigiria mudar HTML).
2. Fase 9 — testes automatizados: PARCIAL (2026-08-03). Feito: 20 unitários (Argon2id, JWT, AES-GCM, HMAC, SSRF, prioridade, slug, datas civis, níveis); 8 de integração via `fastify.inject` contra banco de teste dedicado `diariodev_test` (auth, CSRF por origem, escopo dev/ceo, conflito de versão, permissão e conclusão de tarefa); e 4 E2E Playwright em Chromium (login→dashboard, persistência de sessão, realtime entre dois navegadores, logout+proteção de rota). Comandos: `npm test`, `npm run test:setup-db`, `npm run test:integration`, `npx playwright test` (sobe servidor próprio na 3400 apontando para o banco de teste). Dois bugs reais encontrados e corrigidos pelo E2E: (a) `DV.logout()` navegava antes de a requisição concluir, deixando cookies/sessão ativos — agora navega só após o logout; (b) SQL cru do publicador da outbox e dos relatórios tinha o schema `diariodev` fixo, quebrando em qualquer outro schema — trocado por nomes sem qualificar (Prisma resolve pelo search_path), tornando o app portável entre schemas. Ampliado em 2026-08-03: total **48 testes verdes** = 20 unit + 6 contrato + 15 integração (auth/CSRF, escopo, conflito de versão, tarefa, último CEO, auto-exclusão, criar/desativar usuário, categoria arquivada+histórico+recriar nome, recálculo de grupo, segredo mascarado, outbox+auditoria) + 7 E2E (login→dashboard, persistência de sessão, realtime 2 navegadores, logout+proteção de rota, login inválido, pesquisa sem vazamento). Reset limpo do banco de teste via `npm run test:setup-db` (migrate+truncate+seed); `fileParallelism:false`. Anexos implementados no backend em 2026-08-03 (§17.4/§20): `POST /api/v1/activities/:id/attachments` (multipart), `GET /api/v1/attachments/:id` (download autenticado com Content-Disposition), `DELETE /api/v1/attachments/:id`. Storage local em disco (`STORAGE_PATH`, fora da pasta pública, chave aleatória, sem sobrescrita), validação de extensão + tipo real por file-type + bloqueio de executáveis/incompatibilidade + checksum + limites de tamanho/quantidade; autorização por dono da atividade/escopo. 4 testes de integração (total agora 19). Suíte da Fase 9: 20 unit + 6 contrato + 19 integração + 7 E2E = 52 verdes.
LIMITAÇÃO da UI (§4.3): o upload/download real pela tela ainda não funciona porque `atividades.dc.html` (onPickFiles, ~linha 769) descarta o objeto File e guarda só {name,size}, e o onOpen mostra um toast — ligar de verdade exigiria alterar o HTML (proibido sem autorização). O backend funciona e é testável por API. Falta na Fase 9: regressão visual e E2E de anexos (depende do wiring da UI).
3. Fase 10 — documentação final + `openapi.yaml` + ADRs; preencher docs pendentes em `backend/docs/`.
4. Endurecimento: desconectar socket ao revogar sessão/logout (emitir `session.revoked` p/ `user:<id>`); instalar extensões `pg_trgm`/`unaccent` para busca sem acento; anexos reais (upload) se necessário.

## Armadilhas do ambiente (Windows/git-bash)
- curl `-d` com acento corrompe Content-Length: usar `--data-binary @arquivo`.
- `prisma migrate dev` é interativo e trava aqui: usar `--create-only` + `migrate deploy`, ou autorar
  a migration.sql à mão. Matar processos `schema-engine-windows` órfãos (seguram advisory lock) antes de migrar.
- Nomes de fila BullMQ não podem conter `:` (usados `dv-webhooks`/`dv-daily`).
- postinstall retido por `allow-scripts`: rodar `npx prisma generate` manualmente.
- `prisma migrate reset` exige consentimento explícito do usuário (trava anti-agente do Prisma) e apaga tudo.

## Limpeza pendente
Os smoke tests deixaram registros de teste no banco (ex.: categoria "Seguranca", usuário "Teste Novo",
algumas atividades). Um `prisma migrate reset` + seed limpa, mas depende de consentimento explícito.

## Mapa do frontend (telas x DV x backend)

Modelo: toda tela lê de `window.DV` (cache hidratado no bootstrap) e calcula as visões no
cliente. O backend só entrega os dados iniciais, persiste escritas e empurra eventos em tempo
real. Nenhuma tela precisa de endpoint de cálculo.

Cobertura (leitura já 100% coberta pelo backend):
- dashboard, colaboradores, colaborador: leitura pura. OK.
- atividades: leitura + CRUD de atividade + concluir tarefa. OK.
- projetos, projeto (workload/calendário/Gantt): leitura + CRUD de tarefa; abas derivam de
  `acts`/`tasks` (`a.d`, `t.due`, `t.pri`, `t.who`); sem dado novo. OK.
- relatorios (dev/gestor/ceo, heatmap, matriz, evolução semanal, carteira, insights, CSV):
  tudo calculado no cliente sobre `visibleActs`/`people`/`projects`. OK.
- pesquisa: filtro local. OK.
- usuario: tema/densidade/recolhido persistem; perfil próprio, projeto padrão e senha faltam.
- configuracoes: leitura OK, Aparência OK, Estados sem persistência; Categorias/Usuários/
  Grupos/Integrações faltam persistir.

Increment 2 (CONCLUÍDO em 2026-08-03; tudo em `assets/data.js`, endpoints já existiam):
1. `setCats(nomes)` → `/categories` (diff). OK.
2. `setPeople(lista)` → `/users` (admin e perfil próprio). OK.
3. `setUi({groups})` → `/groups` + `PUT /groups/:id/members` (recalcula nível, protege último CEO). OK.
4. `setUi({integrations})` → `/integrations`. OK. (O botão "Testar" da tela só cria run fictício local, não aciona o `/test`.)
5. `setUi({defaultProject})` → `PUT /preferences` (nome→id). OK. Bootstrap agora envia `defaultProjectId`.
6. Modal de troca de senha aparenta ser protótipo (não chama `DV`); efetivar exigiria mudar HTML. PENDENTE.
Extra: auto-refresh no bootstrap (renova access token expirado pelo refresh antes de cair no login).

Ressalvas de backend (não são do front):
- Janela do bootstrap (60 dias / 500 atividades) precisa cobrir o período máximo dos relatórios;
  conferir o seletor e ampliar/carregar sob demanda se necessário.
- `DV.ui().defaultProject` retorna `undefined` hoje (fallback vazio); popular de `user_preferences`.

Não precisa: novo endpoint, nova entidade, nenhuma mudança no front. Nenhum método `DV` usado
pelas telas está faltando.

## Status vs PROMPT MESTRE (2026-08-03)

Fases 1 a 10 FEITAS (Fase 9 testes e Fase 10 documentação concluídas em 2026-08-03). Restam itens de endurecimento.

FEITO (§34):
- 1 Análise, 2 Fundação, 3 Banco (16 tabelas + seed), 4 Auth/autorização, 5 Domínio (inclui anexos),
  6 Realtime (Socket.IO + outbox + /sync + Redis), 7 Webhooks (BullMQ + HMAC + SSRF + retries + resumo diário),
  8 Integração do frontend (data.js + DV preservado + realtime + write-through admin + auto-refresh).
- Testes (Fase 9): 52 verdes (20 unit, 6 contrato, 19 integração, 7 E2E); typecheck 0.
- Anexos (§17.4/§20): upload/download/remoção com validação, checksum, storage local seguro.

FEITO em 2026-08-03 (fecha Fases 9 e 10):
- Fase 9: 52 testes (unit/contrato/integração/E2E) + regressão visual (baselines em tests/e2e/*-snapshots)
  + teste de carga com números reais (bootstrap p95 81ms/283 rps; activities 811 rps; reports 743 rps).
- Fase 10: README + 18 docs em backend/docs + 8 ADRs + backend/openapi.yaml + Dockerfile + docker-compose.

FALTA (endurecimento, não bloqueia uso):
- Anexos avançados (§20): provider S3/MinIO, quarentena/ClamAV, streaming (hoje disco local + buffer).
- Socket em sessão revogada não desconecta em tempo real (§18.1); pg_trgm/unaccent para busca sem acento.
- SMTP real (reset de senha e resumo por e-mail); métricas Prometheus (§27).
- Contrato do payload de webhook e caracterização retroativa do DV.
- Bloqueios de HTML (§4.3, backend já pronto): upload/download de anexo pela tela e login real por senha.
- NÃO fazer: aba "Estados" não persiste nada (§23).

## Níveis de acesso e módulos (verificado no backend, 2026-08-03)
Detalhe completo em backend/docs/NIVEIS_DE_ACESSO.md.
- Níveis: ceo (alvaro, marcelo), gestor (laerty), dev (camila, elaine, julio, rafael; bruna inativo; teste-novo sobra).
- Nível efetivo = maior nível entre grupos ativos; sem grupo, dev. Grupos: Desenvolvimento[dev], Liderança técnica[gestor], Diretoria[ceo], Administração[gestor]. alvaro é ceo por atribuição direta (fora de grupo).
- Verificado por requisição real: dev recebe 403 em criar categoria/usuário/projeto, ver grupos/integrações, alterar aparência e planejar tarefa; gestor e ceo passam. Escopo: dev vê só as próprias atividades (10), gestor/ceo veem a equipe (32).
- Gate real é o NÍVEL (dev/gestor/ceo); as permissões finas dos grupos são só rótulos descritivos do frontend. O menu é igual para todos; o bloqueio é no servidor. Salvaguardas: último CEO e auto-exclusão.

## Revisão das permissões (2026-08-07)
Análise completa em conversa.md, seção "Revisão das permissões de usuários (2026-08-07)".
A lista de usuários da seção acima (2026-08-03) é do seed antigo e não existe mais no banco.

- Estado real no banco `diariodev` da VM: 6 usuários ativos, cada um em exatamente um grupo, sem divergência entre nível efetivo e nível do grupo. CEO: Admin (`admin`) no grupo Diretoria. GESTOR: Jean Passos (`jean-passos`) no grupo Gestor. DEV: Alvaro Lima, Diogo Koerich, Joao Paulo, Kauan Dalfovo, no grupo Desenvolvedor. Três grupos ativos mais um "Gestor" excluído sem membros; três contas de teste com soft delete (`smoke-gestor`, `smoke-sessao`, `teste-redefinicao`).
- Autorização em três camadas: `requireLevel` na rota (só administração), `seesAll`/`canPlan` no serviço (é onde dev e gestor realmente diferem), e `policy.ts` para regra relacional (cadastro usa teto, credencial usa nível estritamente menor e nunca a própria conta). Grupo entra só via `recalcLevels`.
- Sólido: escalonamento por grupo está fechado nas três portas (criar grupo acima do próprio nível, elevar grupo, se incluir em grupo superior), com 5 casos em `tests/integration/privilege-escalation.test.ts`.
- ABERTO 1 (alta, governança, CONFIRMADO EM EXECUÇÃO): as 8 permissões finas da tela não autorizam nada. `permissions` é gravado, vai no bootstrap e nenhuma rota consulta. Tirar `gerenciar.usuarios` de um grupo não revoga acesso. Prova: conta DEV em grupo DEV com `gerenciar.usuarios`, `gerenciar.integracoes`, `relatorio.executivo`, `exportar.dados` e `ver.equipe`; `bootstrap.permissions` traz as 5 strings e `POST /users`, `GET /integrations` e `GET /groups` seguem 403, `canAdminister` segue false, `ver.equipe` não mostra a equipe. Decidir entre aplicar de verdade (RBAC granular, hoje pausado) ou remover da tela e da API.
- ABERTO 2 (média): dois caminhos gravam `effective_level`. `PATCH /users/:id` grava direto e `recalcLevels` sobrescreve na próxima edição de grupo, em silêncio. Atenuante: o frontend nunca envia `level` nesse PATCH (comentário e corpo em assets/data.js), então só é alcançável chamando a API direto.
- ABERTO 3 (média): nível CEO não protege rota nenhuma. Não existe `requireLevel('ceo')` e `isExec` está definido e nunca usado. Na prática são dois níveis de capacidade: dev e gestor+. Relatório executivo sem gate no servidor.
- ABERTO 4 (governança): gestor promove qualquer dev a gestor (teto = próprio nível, decisão deliberada e documentada em `policy.ts`). Base de administradores pode crescer sem passar pela diretoria; reversível e auditado.
- ABERTO 5 a 7 (baixa): grupo inativo existe no modelo e não na API (só criar e excluir); chave pública inexistente em `PUT /groups/:id/members` é descartada em silêncio com 200; `listGroups` não filtra por nível, então gestor vê a composição da Diretoria.
- ABERTO 8 (governança): o único CEO é a conta genérica `admin`. A salvaguarda do último CEO apoia-se nela e toda ação executiva sai em `audit_log` como "Admin", sem identificar quem agiu.
- ABERTO 9 (média, DESCOBERTO EM EXECUÇÃO): dev cria projeto pela porta lateral. `POST /projects` é gestor+, mas `resolveProject` cria projeto novo quando o nome não existe, então `POST /activities` com nome inédito devolve 201 e o projeto passa a existir. Intencional e comentado no código (herdado do protótipo); a guarda de escopo só barra projeto alheio já existente. Efeito: o gate de gestor sobre criar projeto é contornável por qualquer dev.
- Verificado com usuário DEV real (2026-08-07, conta descartável criada e removida): bootstrap traz `level=dev`, `canAdminister=false`, `permissions=[]`, 7 pessoas, 8 categorias, e ZERO em grupos/integrações/histórico (decisão do servidor, não filtro de tela). E-mail de terceiros vem mascarado como string vazia. Leitura 200 em users/activities/tasks/projects/categories/reports/search (escopo pessoal); 403 em groups, integrations, integration-runs e settings/mail. Escrita: 201 em atividade própria, 200 em preferências próprias, senha própria exige a atual; 403 em `POST /tasks` ("Sem permissão para criar tarefas") e em toda a administração. `GET /activities?person=admin` devolve 200 com 0 itens, não vaza registro alheio.
- Método: a matriz DEV acima vem de requisições reais. Os ABERTOS 2 a 8 vêm de leitura de código e consulta ao banco. Os testes de integração NÃO rodam neste ambiente: `diariodev_test` não existe e o usuário do Postgres não pode criá-lo (`prisma migrate deploy` falha com "permissão negada ao criar banco de dados").
