# Mapeamento completo de `window.DV`

Superfície pública de `assets/data.js` (416 linhas) que o backend deve preservar
sem remover nada nem mudar assinaturas/formatos (§8). Coluna **Categoria**:
`R` leitura síncrona (lê do cache) · `W` escrita (mantém assinatura síncrona,
persiste otimista + rede por baixo) · `U` utilitário puro (permanece local, sem
backend) · `C` constante/estado.

## Estado e constantes

| Membro | Cat | Origem no backend |
| --- | --- | --- |
| `T` | C | tokens visuais; permanece local |
| `TODAY` | C | passa a derivar de `serverNow` (`/bootstrap`) |
| `todayLabel` | C | derivado de `serverNow` no fuso da org |
| `BRAND_DEFAULT` | C | espelha `app_settings.brand` default |
| `LEVELS` | C | rótulos de nível; local |
| `NAV` | C | navegação; local |
| `PAGE_SIZE` | C | 8; local |
| `selectStyle` | C | estilo; local |

## Coleções — leitura (R) e escrita (W)

| Membro | Cat | Endpoint / evento |
| --- | --- | --- |
| `acts()` | R | cache de `GET /activities` (janela do `/bootstrap`) |
| `setActs(l)` | W | uso interno do cache; não chama rede diretamente |
| `people()` / `setPeople(l)` | R/W | `GET/POST/PATCH /users` |
| `cats()` / `setCats(l)` | R/W | `GET/POST/PATCH/DELETE /categories` |
| `projects()` / `setProjects(l)` | R/W | `GET/POST /projects` (inclui projetos derivados de atividades) |
| `tasks()` / `setTasks(l)` | R/W | `GET /tasks` |
| `ui()` / `setUi(patch)` | R/W | preferências (`collapsed`,`density`) → `PUT /preferences`; `groups`→`/groups`; `integrations`→`/integrations`; `integrationRuns`→`GET /integration-runs` |
| `brand()` / `setBrand(patch)` / `resetBrand()` | R/W | `GET/PUT /settings/appearance` |
| `theme()` / `setTheme(t)` / `toggleTheme()` | R/W | preferência individual (`PUT /preferences`) |

## Sessão

| Membro | Cat | Endpoint |
| --- | --- | --- |
| `user()` | R | `GET /auth/me` (via cache do `/bootstrap`) |
| `setUser(id)` | W | login de protótipo (`POST /auth/login` dev) |
| `logout()` | W | `POST /auth/logout` (revoga sessão) |
| `isLogged()` | R | presença de sessão válida |

## Escrita de domínio (otimista)

| Membro | Cat | Endpoint / evento Socket.IO |
| --- | --- | --- |
| `create(rec)` | W | `POST /activities` → `activity.created` |
| `update(id, rec)` | W | `PATCH /activities/:id` → `activity.updated` |
| `remove(id)` | W | `DELETE /activities/:id` → `activity.deleted` |
| `createTask(rec)` | W | `POST /tasks` → `task.created` |
| `updateTask(id, rec)` | W | `PATCH /tasks/:id` → `task.updated` |
| `removeTask(id)` | W | `DELETE /tasks/:id` → `task.deleted` |
| `reset()` | W | apenas limpa cache local (dev) |

## Autorização / escopo (derivados — recalculados a partir do usuário do bootstrap)

`levelOf(p)`, `levelLabel(p)`, `rankOf(p)`, `seesAll(p)`, `isExec(p)`,
`canPlan(p)`, `visibleActs(p)`, `visibleProjects(p)`, `canSeeProject(p, name)`.
Permanecem no cliente por conveniência de render, mas **a autorização real é do
servidor**: o backend só entrega o que o usuário pode ver, então esses derivados
operam sobre dados já filtrados.

## Datas (U — reimplementados sobre `serverNow`/fuso)

`dateOf(d)`, `fmt(d)`, `longDate(d)`, `iso(d)`, `isoPlus(n)`, `offsetOf(isoStr)`,
`groupLabel(d)`, `plural(n)`, `daysLeft(iso)`, `dueInfo(iso)`, `dueLabel(iso)`.
Devem passar a comparar datas civis no fuso da organização.

## Lookups e utilitários visuais (U — permanecem locais, inalterados)

`person(id)`, `cat(name)`, `catStyle(name)`, `catText(c)`, `badge(kind)`,
`chip(active, extra)`, `avatar(p, size)`, `soft(hex, a)`, `priColor(p)`,
`nav(active, collapsed)`, `shell(collapsed)`, `logoVals(collapsed)`,
`sortList(list, mode, textKey, numKey)`, `sortOptions(numLabel)`,
`paginate(list, page, size, noun, onPage)`, `csv(header, rows)`,
`download(filename, text)`, `applyTheme()`, `applyBrand()`.

## Estado de prontidão (a adicionar — §7.2, sem remover nada)

`DV.ready`, `DV.isReady()`, `DV.onReady(cb)`, `DV.onError(cb)`. As telas atuais
**não** podem depender destes para funcionar (continuam com o polling por
`window.DV`).

## Invariantes a preservar (protegidos por testes de caracterização)

- `acts()`/`people()`/`cats()`/`projects()`/`tasks()`/`user()`/`ui()`/`brand()`/`theme()` retornam **síncrono**.
- `projects()` inclui projetos que aparecem em atividades além dos cadastrados.
- `user()` cai para `people()[1]` (Laerty) quando não há sessão — no backend, sem sessão não há usuário; o adaptador trata como não logado.
- `visibleActs`/`visibleProjects` filtram por `who === p.id` quando o nível não é gestor+.
- Ordenação, paginação e CSV com separador `;` e BOM UTF-8 inalterados.
