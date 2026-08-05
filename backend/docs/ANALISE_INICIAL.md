# Análise inicial — Diário Dev ITS

Documento da Fase 1 (§6 do prompt mestre). Registra o estado encontrado, os
riscos e as decisões que orientam a implementação do backend.

## Estrutura encontrada

Frontend estático, uma página por tela, sem build. Raiz do repositório:

- `*.dc.html` (11 telas) — protótipo navegável. Não podem ser alterados.
- `assets/data.js` — camada de dados única (`window.DV`), mock sobre `localStorage`. Único arquivo do frontend cuja reestruturação interna é permitida.
- `assets/theme.css` — tema. Proibido alterar.
- `assets/its-theme.css`, `assets/app-shell.js` — folha de referência e web component da sidebar.
- `support.js` — utilitário carregado antes de `data.js` em todas as telas.
- `screenshots/`, `uploads/` — material de referência.
- `PROMPT MESTRE — BACKEND COMPLETO.md`, `README.md` — especificação e contrato.

## Tecnologias existentes

- Sem framework de frontend com build; páginas usam um runtime próprio (`<script type="text/x-dc">`) e React-like via `support.js`.
- Persistência atual: `localStorage` inteiramente encapsulado em `DV`.
- Nenhum backend, nenhum `package.json` na raiz.

## Ordem de carregamento e ponto crítico de sincronismo

Em todas as telas, os scripts carregam no `<head>`, sem `defer`/`async`/`module`,
na ordem: `support.js` → `assets/theme.css` → `assets/data.js`.

Descoberta decisiva: **as telas não assumem `DV` pronto no parse**. Elas fazem
_polling_ por `window.DV` antes de renderizar:

- `login.dc.html:110` — `setInterval(() => { if (window.DV) {...ready...} }, 25)`
- `assets/app-shell.js:102` — mesmo padrão no `connectedCallback`
- `configuracoes.dc.html:920` — idem no `componentDidMount`

Consequência: é possível publicar `window.DV` **somente após** um bootstrap
assíncrono hidratar o cache, mantendo os getters síncronos, sem tocar em HTML
(Estratégia B do §7). Não é preciso XHR síncrono nem monkey patch.

## Como o frontend usa os dados

- Getters síncronos (`DV.acts()`, `DV.people()`, `DV.user()`, `DV.projects()`, `DV.tasks()`, `DV.cats()`, `DV.ui()`, `DV.brand()`, `DV.theme()`) leem de `localStorage` e são usados imediatamente para renderizar.
- Escrita otimista já é síncrona (`DV.create`, `DV.update`, `DV.remove`, `DV.createTask`, ...): a tela grava e re-renderiza sem esperar rede.
- **Grupos, integrações e histórico de execuções** não estão em `data.js`: são gravados dentro de `dv.ui` via `DV.setUi({ groups | integrations | integrationRuns })` (`configuracoes.dc.html:925,930,931,950,951,954`).
- **Aparência/marca**: `DV.brand()`/`DV.setBrand()` (`dv.brand`) + tema (`dv.theme`) + densidade (`dv.ui.density`).
- **Aba "Estados"** (`configuracoes.dc.html:731`): style-guide visual, **sem persistência**. Conforme §23, não gera tabela nem endpoint.
- **Anexos**: hoje apenas metadados `{name, size}` por atividade; sem upload real (`atividades.dc.html`, toast mock ao abrir).
- **Login**: sem senha real ("qualquer senha é aceita"); e-mail → `DV.people()` → `DV.setUser(id)` → dashboard (`login.dc.html:117,123`).

Chaves de `localStorage` em uso: `dv.acts`, `dv.people`, `dv.cats`, `dv.projects`,
`dv.user`, `dv.theme`, `dv.brand`, `dv.ui` (com campos aninhados `collapsed`,
`density`, `groups`, `integrations`, `integrationRuns`), `dv.tasks`.

## Datas

O protótipo fixa "hoje" em `new Date(2026, 6, 29)` (`data.js:80`) e usa offsets em
dias (`d`). O backend deve remover a data fixa: armazenar `timestamptz` em UTC e,
no adaptador, reconverter `occurredAt`→`d`/`t` comparando datas civis no fuso da
organização (`America/Sao_Paulo`), nunca dividindo milissegundos por 86.400.000.

## Ambiente desta máquina

- Node v24.18.0, npm 11.16.0 — OK.
- **Sem Docker, sem PostgreSQL, sem Redis** instalados (`docker`, `psql` ausentes).
- Não é repositório git.
- Wrapper corporativo `allow-scripts` retém postinstall de pacotes; Prisma Client
  é gerado manualmente com `npx prisma generate` (executado com sucesso).

## Decisão de infraestrutura

Definido com o responsável: **banco já existente**. As conexões
`DATABASE_URL` e `REDIS_URL` serão informadas diretamente no arquivo
`backend/.env` (nunca coladas em texto no chat). O agente não lê nem imprime o
conteúdo do `.env`. Migrations, seed e testes de integração são executados contra
esse banco assim que as conexões estiverem preenchidas.

## Riscos e inconsistências

1. **Infra local ausente** — migrations/seed/testes de integração/E2E/realtime só podem ser validados após `.env` apontar para Postgres+Redis reais. Escrita de código e testes de caracterização (jsdom) não bloqueiam.
2. **Contrato `DV` amplo** — muitos utilitários visuais (§8.3) devem permanecer 100% síncronos e idênticos. Serão protegidos por testes de caracterização antes de reescrever `data.js`.
3. **Sincronismo do bootstrap** — publicar `window.DV` cedo demais com cache vazio pinta tela vazia; publicar tarde demais atrasa o primeiro paint. Estratégia: snapshot em `localStorage` (`dv.cache.v1.*`) para paint imediato + revalidação por `/bootstrap`.
4. **Grupos/integrações dentro de `dv.ui`** — o adaptador precisa continuar entregando esses dados sob `DV.ui()` e roteando as escritas de `setUi` para os endpoints certos, sem quebrar `collapsed`/`density`.
5. **Autorização** — o frontend expõe `level`/`who`; o servidor não pode confiar neles. Toda decisão de escopo ocorre no backend.
6. **Anexos** — passar de metadados para upload real sem alterar o markup exige que o adaptador continue expondo `files: [{name, size}]` e resolva download autenticado por trás.

## Decisões que orientam a implementação

- Monólito modular Fastify + Prisma + PostgreSQL + Socket.IO + Redis/BullMQ.
- TypeScript `strict`. UUID interno, `public_key`/`slug` para o que o frontend referencia por texto.
- Enums internos em maiúsculas (`Priority`, `AccessLevel`), convertidos no mapper para os textos do frontend.
- "Estados" não vira entidade.
- Segredos de integração criptografados (AES-GCM); nunca retornados por inteiro.
- Login de protótipo só com `ALLOW_DEV_LOGIN=true` e ausente em produção.
