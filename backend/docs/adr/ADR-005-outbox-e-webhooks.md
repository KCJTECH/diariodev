# ADR-005: Outbox e webhooks

## Contexto
Eventos precisam ser confiáveis e refletir exatamente as mutações, tanto para o
realtime quanto para integrações externas.

## Decisão
Padrão outbox transacional: a mutação e o evento sao gravados na mesma transação. Um
publicador drena a outbox (FOR UPDATE SKIP LOCKED), emite via Socket.IO e enfileira
webhooks (BullMQ). Entrega com timeout, tentativas e backoff exponencial com jitter;
falha final vira status DEAD. Assinatura HMAC-SHA256; proteção SSRF; segredos
criptografados.

## Consequências
Sem perda silenciosa de eventos mesmo com falha após o commit (o publicador reprocessa;
o cliente deduplica). O enfileiramento do webhook ocorre após o commit; uma falha rara
ao enfileirar pode perder o webhook (o Socket.IO já entregou). Melhoria possível: uma
outbox dedicada de webhooks.
