# Implantação

## Ambientes
Desenvolvimento (local), homologação (HML) e produção. Commit é sempre local.
Deploy de produção exige validação em HML e liberação explícita do responsável.

## Variáveis
Documentadas em .env.example. Nunca colocar valores reais no repositório. Em produção:
NODE_ENV=production, ALLOW_DEV_LOGIN=false, cookies seguros, CORS fechado, segredos
fortes e únicos, usuário de banco com privilégio mínimo, WEBHOOK_ALLOWED_HOSTS restrito.

## Migrations
```
# criar (desenvolvimento)
npx prisma migrate dev --name <nome>
# revisar o SQL gerado em prisma/migrations
# aplicar (HML/produção)
npx prisma migrate deploy
```
Fazer backup antes de aplicar em produção (ver BACKUP_E_RESTAURACAO.md). Não executar
migrations destrutivas sem proteção; usar expandir, migrar, contrair.

## Seed
Apenas em ambientes não produtivos: npm run seed. Não executar seed em produção.

## Build e execução
```
npm run build
node dist/server.js        # API
node dist/workers/index.js # worker (obrigatório para webhooks e resumo diário)
```

## Docker
```
docker compose up --build
```
Sobe API, worker, PostgreSQL, Redis e MinIO. Ajustar segredos e o .env antes. A
imagem roda como usuário não root e trata SIGTERM (encerramento gracioso).

## Health checks
GET /health/live confirma o processo. GET /health/ready valida PostgreSQL e Redis.
Usar /health/ready como readiness probe.

## Realtime em múltiplas instâncias
Com mais de uma instância da API, o adaptador Redis do Socket.IO é obrigatório (já
configurado). O worker deve rodar como processo separado.

## Checklist de produção
Sem login de protótipo, sem Swagger público, sem stack trace, sem seed, sem
credenciais padrão, cookies seguros, CORS fechado, logs sem segredos, backup e
readiness configurados.
