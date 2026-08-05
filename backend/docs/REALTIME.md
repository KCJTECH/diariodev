# Tempo real (Socket.IO)

REST para comandos e consultas; Socket.IO para atualizações e invalidação; /sync
para recuperar eventos perdidos.

## Autenticação do socket
O handshake lê o cookie de acesso, valida o JWT, carrega o usuário (ativo) e valida
a origem. Sem sessão válida, a conexão é recusada.

## Salas
Decididas pelo servidor. O usuário entra em: organization:default, user:<id>. Gestor
entra em level:gestor; ceo entra em level:gestor e level:ceo. Dev entra em
project:<id> para cada projeto em que participa. O cliente nunca escolhe sala.

## Roteamento de eventos
- activity.* e task.* vao para level:gestor e project:<id> (gestores recebem tudo;
  devs recebem via a sala do projeto que participam).
- category.*, project.*, settings.* vao para organization:default.
- user.*, group.*, integration.* vao para level:gestor.

## Envelope
`{ eventId, event, occurredAt, cursor, scope, data }`. O cliente deduplica por
eventId e por clientMutationId (evita duplicar a alteração otimista própria).

## Publicador (outbox)
No processo da API, em intervalo curto, reivindica eventos não publicados com
FOR UPDATE SKIP LOCKED, emite e marca como publicados. Entrega ao menos uma vez.

## Reconexão e sync
Ao reconectar, o cliente chama GET /sync?cursor=<ultimo> e aplica os eventos com
sequence maior que o cursor, filtrados pelas salas que o usuário pode receber.

## Escalabilidade
Com adaptador Redis, várias instâncias compartilham as salas. Sem Redis, funciona
em instância única (desenvolvimento). Em produção com mais de uma instância, o
adaptador Redis é obrigatório.

## Limitação conhecida
A revogação de sessão não desconecta um socket já aberto em tempo real; a conexão
cai quando o access token expira (curto). Endurecimento previsto: emitir
session.revoked para user:<id> e o cliente desconectar.
