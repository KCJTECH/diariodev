# Fluxograma do sistema

Diagramas em Mermaid. Abrem renderizados no GitHub, no VS Code (extensão Mermaid) ou
em qualquer visualizador compatível.

## 1. Arquitetura geral
```mermaid
flowchart LR
  U[Usuario / Navegador]
  subgraph Frontend [Frontend preservado]
    DC[Paginas *.dc.html]
    DV[assets/data.js<br/>window.DV]
    DC --> DV
  end
  U --- DC
  U -->|HTTP + cookie httpOnly| API
  U <-->|Socket.IO| API
  subgraph Servidor
    API[API Fastify :3333<br/>serve o frontend + REST + Socket.IO]
    PUB[Publicador da outbox]
    WK[Worker BullMQ<br/>webhooks + resumo diario]
    API --> PUB
  end
  API -->|Prisma| PG[(PostgreSQL<br/>schema diariodev)]
  API -->|adaptador / rate limit| RD[(Redis / Memurai)]
  PUB --> RD
  WK --> RD
  WK -->|Prisma| PG
  WK -->|HTTP assinado + SSRF| EXT[Integracoes externas<br/>n8n, Slack, e-mail]
```

## 2. Login e carga inicial
```mermaid
sequenceDiagram
  participant B as Navegador (DV)
  participant API as API Fastify
  participant DB as PostgreSQL
  B->>API: POST /auth/login (ou dev-login)
  API->>DB: valida usuario e cria sessao
  API-->>B: cookies dv_access e dv_refresh
  B->>API: GET /bootstrap
  API->>DB: le dados conforme o escopo do usuario
  API-->>B: usuario, pessoas, categorias, projetos, atividades, tarefas, serverNow
  B->>B: hidrata o cache e publica window.DV
  B->>API: conecta Socket.IO (cookie)
  note over B,API: telas fazem polling por window.DV ate ficar pronto
```

## 3. Criar atividade: escrita otimista, realtime e webhook
```mermaid
sequenceDiagram
  participant A as Navegador A (autor)
  participant API as API Fastify
  participant DB as PostgreSQL
  participant OB as Publicador outbox
  participant Q as Fila BullMQ
  participant W as Worker
  participant B as Navegador B
  participant EXT as Integracao externa
  A->>A: DV.create (otimista, id temporario)
  A->>API: POST /activities
  API->>DB: transacao (activity + outbox_event)
  API-->>A: 201 (troca id temporario pelo oficial)
  OB->>DB: reivindica outbox (FOR UPDATE SKIP LOCKED)
  OB-->>B: Socket.IO dv:event (activity.created)
  B->>B: atualiza cache e re-renderiza (sem recarregar)
  OB->>Q: enfileira webhook (atividade.criada)
  W->>Q: consome o job
  W->>EXT: POST assinado HMAC + SSRF + timeout
  W->>DB: grava integration_run (retries com backoff ate DEAD)
```

## 4. Autorização de uma requisição
```mermaid
flowchart TD
  R[Requisicao /api/v1/...] --> Origin{Origem permitida?}
  Origin -->|nao, em mutacao| E403o[403 origem]
  Origin -->|sim| Auth{authenticate:<br/>cookie valido?}
  Auth -->|nao| E401[401]
  Auth -->|sim| Lvl{requireLevel:<br/>nivel suficiente?}
  Lvl -->|nao| E403[403]
  Lvl -->|sim| Val{validacao Zod ok?}
  Val -->|nao| E422[422]
  Val -->|sim| Svc[Servico aplica o escopo<br/>ex.: dev ve so o proprio]
  Svc --> Tx[transacao + evento na outbox + auditoria]
  Tx --> OK[200 / 201]
```

## 5. Reconexao e sincronizacao
```mermaid
flowchart LR
  D[Socket cai / rede volta] --> C[Reconecta Socket.IO]
  C --> S[GET /sync?cursor=ultimo]
  S --> F[Servidor devolve eventos com sequence maior<br/>filtrados pelas salas do usuario]
  F --> AP[Cliente aplica as mudancas e atualiza o cursor]
  AP --> RT[Retoma eventos em tempo real]
```
