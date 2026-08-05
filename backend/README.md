# Diário Dev — Backend

Backend do sistema interno Diário Dev. Transforma o protótipo estático (frontend
já pronto, na raiz do repositório) em um sistema real, persistente, multiusuário
e em tempo real, sem alterar o visual das telas.

## Objetivo
O backend é a fonte oficial de verdade. O frontend consome os dados por meio do
objeto `window.DV` (arquivo `assets/data.js`), cujo contrato foi preservado. As
páginas `*.dc.html` e o `assets/theme.css` nunca são alterados.

## Arquitetura
Monólito modular em Node.js e TypeScript estrito. Fastify para HTTP, Prisma sobre
PostgreSQL, Socket.IO para tempo real, Redis com BullMQ para filas e resumo diário.
Detalhes em `docs/ARQUITETURA.md`.

## Pré-requisitos
- Node.js 20 ou superior (validado em 24)
- PostgreSQL 14 ou superior
- Redis 6 ou superior (em Windows, Memurai é compatível)

## Instalação
```
cd backend
npm install
npx prisma generate
```

## Configuração
Copie `.env.example` para `.env` e preencha. Mínimo necessário: `DATABASE_URL`,
`REDIS_URL`, `APP_ORIGIN` e os segredos. Gere segredos fortes:
```
node -e "for (const k of ['COOKIE_SECRET','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET']) console.log(k+'='+require('crypto').randomBytes(48).toString('base64url')); console.log('ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('base64'))"
```
Use um usuário de banco com privilégio mínimo (não o superusuário). Para criar um:
```
CREATE ROLE diariodev_app WITH LOGIN PASSWORD 'senha_forte';
CREATE SCHEMA IF NOT EXISTS diariodev AUTHORIZATION diariodev_app;
GRANT CONNECT ON DATABASE "diarioDev" TO diariodev_app;
ALTER ROLE diariodev_app CREATEDB;   -- necessário só para o shadow db do migrate dev
```

## Migrations e seed
```
npx prisma migrate deploy   # aplica as migrations existentes
npm run seed                # popula dados de demonstração (idempotente)
```
Para criar uma nova migration em desenvolvimento, ver `docs/CONTINUIDADE_DO_DESENVOLVIMENTO.md`.

## Execução
```
npm run dev            # API + Socket.IO + serve o frontend em http://localhost:3333
npm run dev:worker     # (outro terminal) worker de webhooks e resumo diário
```
Produção:
```
npm run build
npm start              # API
npm run start:worker   # worker
```
Abra `http://localhost:3333/login.dc.html`.

## Acesso inicial
O seed cria usuários de desenvolvimento com a senha definida em `prisma/seed.ts`
(troque fora do ambiente local). Perfis: `marcelo` (ceo), `laerty` (gestor), demais
(dev). Em desenvolvimento o login aceita o atalho "entrar como".

## Testes
```
npm run typecheck
npm test                 # unitários
npm run test:contract    # contrato
npm run test:setup-db    # provisiona/reseta o banco de teste (diariodev_test)
npm run test:integration # integração
npx playwright test      # E2E (sobe servidor próprio na 3400)
npx tsx tests/load.ts    # teste de carga básico
```
Detalhes e resultados em `docs/TESTES.md`.

## Docker
```
docker compose up --build
```
Sobe API, worker, PostgreSQL, Redis e MinIO. Ajuste os segredos antes de usar.

## Estrutura de diretórios
```
prisma/            schema, migrations e seed
src/config/        variáveis de ambiente validadas
src/common/        infraestrutura (auth, http, erros, eventos, storage, utils)
src/modules/       domínio (auth, users, activities, tasks, categories, projects,
                   groups, integrations, attachments, reports, search, settings,
                   bootstrap, realtime, audit, health)
src/workers/       processo de filas (webhooks + resumo diário)
src/jobs/          jobs agendados (resumo diário)
tests/             unit, contract, integration, e2e, load
docs/              documentação e ADRs
```

## Comandos principais
`dev`, `dev:worker`, `build`, `start`, `start:worker`, `typecheck`, `lint`, `test`,
`test:contract`, `test:integration`, `test:e2e`, `test:setup-db`, `seed`,
`prisma:migrate`, `prisma:deploy`, `prisma:studio`.
