#!/usr/bin/env bash
# Deploy do Diário Dev. Rodar NO SERVIDOR, dentro de ~/diariodev/backend.
# Requer Docker e Docker Compose. Não expõe nem manipula segredos além do seu .env.
set -euo pipefail

if [ ! -f .env ]; then
  echo "ERRO: crie o arquivo .env (copie .env.example e preencha os segredos)."
  echo "Gere segredos: node -e \"for (const k of ['COOKIE_SECRET','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET']) console.log(k+'='+require('crypto').randomBytes(48).toString('base64url')); console.log('ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('base64'))\""
  exit 1
fi

echo "==> Build e subida dos serviços (API, worker, Postgres, Redis, MinIO)"
docker compose up -d --build

echo "==> Aguardando o PostgreSQL ficar pronto"
until docker compose exec -T postgres pg_isready -U diariodev >/dev/null 2>&1; do sleep 2; done

echo "==> Aplicando migrations"
docker compose exec -T api npx prisma migrate deploy

echo "==> Healthcheck"
sleep 3
docker compose exec -T api node -e "fetch('http://localhost:3333/health/ready').then(r=>r.json()).then(j=>{console.log(JSON.stringify(j));process.exit(j.status==='ok'?0:1)}).catch(e=>{console.error(String(e));process.exit(1)})"

echo "==> Pronto. Acesse http://<IP-DO-SERVIDOR>:3333/"
echo "    Seed (SOMENTE ambiente não produtivo, exige NODE_ENV!=production):"
echo "    docker compose exec -e NODE_ENV=development api node dist/prisma/seed.js"
