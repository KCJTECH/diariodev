# Operação

## Processos
- API: serve HTTP, Socket.IO e o publicador da outbox.
- Worker: consome a fila de webhooks e executa o resumo diário agendado.
Ambos precisam estar no ar para o sistema funcionar por completo.

## Observabilidade
Logs estruturados (Pino) com requestId, método, rota, status, duração e userId quando
autenticado, sem dados sensíveis. Nível por LOG_LEVEL. Health checks em /health/live e
/health/ready. Métricas Prometheus sao um item pendente.

## Filas
Fila dv-webhooks (entregas) e dv-daily (resumo). Jobs com retries e backoff. Falhas
finais viram status DEAD e ficam em integration_runs para inspeção. Reprocessamento
manual pode ser feito recriando o disparo.

## Rotina diária
O resumo diário dispara no horário DAILY_SUMMARY_TIME (fuso da organização), uma vez
por dia, com lock no Redis. Verificar integration_runs para confirmar as entregas.

## Erros comuns
Ver TROUBLESHOOTING.md.

## Encerramento
SIGTERM e SIGINT encerram graciosamente: param o publicador, fecham o Socket.IO, o
Fastify, o Prisma e o Redis.
