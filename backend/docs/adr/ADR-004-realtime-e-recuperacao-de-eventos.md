# ADR-004: Realtime e recuperação de eventos

## Contexto
Atualizações em tempo real entre navegadores, sem substituir REST por mensagens. A
rede pode cair e perder eventos.

## Decisão
REST para comandos/consultas; Socket.IO para atualizações. Salas decididas pelo
servidor (organization, user, level, project). Envelope com cursor monotônico
(outbox_events.sequence). Na reconexão, o cliente chama GET /sync?cursor= e recupera
os eventos perdidos, filtrados pelas salas autorizadas. Adaptador Redis para múltiplas
instâncias.

## Consequências
Entrega ao menos uma vez; o cliente deduplica por eventId e clientMutationId. Não se
confia no socket como garantia de entrega; o sync fecha as lacunas. O cursor
sequencial dá ordenação estável.
