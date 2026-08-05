# Integrações e webhooks

## Eventos
Nomes externos (mostrados na interface): atividade.criada, atividade.editada,
atividade.excluida, resumo.diario. Mapeados internamente a partir de activity.created,
activity.updated, activity.deleted e daily.summary.

## Entrega confiável
Padrão outbox transacional: o dado e o evento sao gravados na mesma transação. O
publicador enfileira um job por integração inscrita no evento. O worker entrega com
timeout, tentativas e backoff exponencial com jitter (BullMQ). Cada tentativa gera
uma linha em integration_runs; ao esgotar as tentativas, o status final é DEAD.

## Headers
- X-DiarioDev-Event, X-DiarioDev-Event-Id, X-DiarioDev-Timestamp
- X-DiarioDev-Signature: sha256=HMAC-SHA256(secret, timestamp + "." + corpo)
- X-DiarioDev-Secret: mantido por compatibilidade; a assinatura HMAC é a validação
  recomendada.

## Segurança de endpoint (SSRF)
Só HTTP/HTTPS. Bloqueia IP privado, loopback e link-local (inclui 169.254.169.254).
Não segue redirecionamentos. Timeout por integração. Hosts internos podem ser
liberados por WEBHOOK_ALLOWED_HOSTS.

## Segredos
Criptografados com AES-256-GCM. Nunca retornados por inteiro: a API devolve
secretConfigured e secretPreview (ex.: ****7f2a). Só reencripta quando um novo
segredo é enviado.

## Teste
POST /integrations/:id/test faz uma entrega síncrona única (feedback imediato),
registrada em integration_runs como qualquer disparo.

## Resumo diário
Job repetível (BullMQ) no horário configurado (DAILY_SUMMARY_TIME) e no fuso da
organização. Idempotente por dia com lock no Redis: dispara uma vez, mesmo com
múltiplas instâncias ou reinício. Enfileira resumo.diario para as integrações inscritas.

## Payload
Envelope: { event, id, occurredAt, data }. Testes de contrato garantem estabilidade.
