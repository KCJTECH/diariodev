# Matriz de compatibilidade frontend ↔ backend

Relaciona cada ação das telas à função `DV`, ao endpoint REST, ao evento
Socket.IO e ao teste que valida o fluxo (§6.3). Coluna **Teste** referencia o
teste planejado; marcada como _pend._ enquanto não implementada.

| Página | Ação | Função DV | Entrada | Retorno esperado | Endpoint | Evento Socket.IO | Teste |
| --- | --- | --- | --- | --- | --- | --- | --- |
| login | entrar (e-mail/senha) | `setUser` | e-mail, senha | sessão + redirect | `POST /auth/login` | — | e2e login-valido _pend._ |
| login | login inválido | `setUser` | e-mail/senha errados | erro credenciais | `POST /auth/login` | — | e2e login-invalido _pend._ |
| login | "entrar como" (dev) | `setUser` | id colaborador | sessão (só dev) | `POST /auth/login` (dev) | — | int auth-dev-login _pend._ |
| shell | carregar usuário/nav | `user`,`nav`,`shell` | — | usuário + menu | `GET /bootstrap` | `session.revoked` | contract bootstrap _pend._ |
| shell | retrair sidebar | `ui`,`setUi` | `{collapsed}` | persistido | `PUT /preferences` | `preferences.updated` | unit prefs _pend._ |
| dashboard | resumo/gráfico 14d | `acts`,`visibleActs` | — | contadores/série | `GET /reports/summary` | `reports.invalidated` | int reports-scope _pend._ |
| dashboard | tarefas atrasadas | `tasks`,`dueInfo` | — | tarefas late | `GET /tasks?status=late` | `task.updated` | unit atraso-fuso _pend._ |
| atividades | listar/filtrar | `acts`,`sortList`,`paginate` | filtros | lista paginada | `GET /activities` | — | int activities-filter _pend._ |
| atividades | nova atividade | `create` | rec (sem `who`) | atividade criada | `POST /activities` | `activity.created` | e2e dev-cria _pend._ |
| atividades | editar | `update` | id, rec | atividade atualizada | `PATCH /activities/:id` | `activity.updated` | e2e edita _pend._ |
| atividades | excluir | `remove` | id | remoção | `DELETE /activities/:id` | `activity.deleted` | e2e exclui _pend._ |
| atividades | anexar arquivo | (adaptador) | file | `files:[{name,size}]` | `POST /activities/:id/attachments` | `activity.updated` | int upload _pend._ |
| atividades | abrir anexo | (adaptador) | id anexo | download autenticado | `GET /attachments/:id` | — | e2e download-autorizado _pend._ |
| atividades | concluir tarefa via atividade | `create`+`updateTask` | rec+taskId | tarefa concluída | `POST /tasks/:id/complete` | `task.completed` | int conclui-por-atividade _pend._ |
| colaboradores | listar | `people` | — | lista | `GET /users` | `user.updated` | int users-list _pend._ |
| colaborador | perfil + timeline | `person`,`visibleActs` | `?id=` | pessoa + atividades | `GET /users/:id`, `GET /activities?person=` | — | int person-timeline _pend._ |
| projetos | listar/indicadores | `projects`,`visibleProjects` | — | projetos visíveis | `GET /projects` | `project.updated` | int projects-scope _pend._ |
| projeto | timeline/tarefas | `acts`,`tasks` | `?p=` | timeline do projeto | `GET /activities?project=` | `activity.created` | int project-timeline _pend._ |
| relatorios | visão geral/equipe/exec | `visibleActs`,`isExec` | filtros | agregações | `GET /reports/*` | `reports.invalidated` | int reports-exec _pend._ |
| relatorios | export CSV | `csv`,`download` | dados autorizados | arquivo CSV | (cliente) / `GET /reports/export.csv` | — | contract csv _pend._ |
| pesquisa | busca global | (adaptador) | `?q=` | atividades/pessoas/projetos | `GET /search?q=` | — | int search-scope _pend._ |
| configuracoes | categorias | `cats`,`setCats` | nome | categoria | `POST/PATCH/DELETE /categories` | `category.*` | int categorias-arquiva _pend._ |
| configuracoes | usuários | `people`,`setPeople` | rec | usuário | `POST/PATCH /users` | `user.*` | int users-crud _pend._ |
| configuracoes | grupos | `ui.groups` via `setUi` | grupo+membros | grupo, recalcula nível | `POST/PATCH/PUT /groups`,`/groups/:id/members` | `group.*`,`permissions.changed` | int grupos-recalculo _pend._ |
| configuracoes | integrações | `ui.integrations` via `setUi` | integração | integração (segredo mascarado) | `POST/PATCH/DELETE /integrations` | `integration.*` | int integracoes-secret _pend._ |
| configuracoes | testar integração | (adaptador) | id | resultado + run | `POST /integrations/:id/test` | `integration.run.updated` | int webhook-assinatura _pend._ |
| configuracoes | histórico execuções | `ui.integrationRuns` | — | runs | `GET /integration-runs` | `integration.run.updated` | int runs-list _pend._ |
| configuracoes | aparência/marca | `brand`,`setBrand`,`resetBrand` | patch | marca aplicada | `GET/PUT /settings/appearance` | `settings.appearance.updated` | int aparencia _pend._ |
| configuracoes | "Estados" | — | — | (style-guide, sem dados) | — | — | — |
| usuario | minha conta/preferências | `user`,`ui`,`setUi`,`theme` | patch | preferências salvas | `GET/PUT /preferences` | `preferences.updated` | int prefs _pend._ |
| usuario | trocar senha | (adaptador) | senhas | ok / erro | `POST /auth/password` | `session.revoked` (outras) | int troca-senha _pend._ |
| usuario | trocar usuário/sair | `setUser`,`logout` | — | sessão encerrada | `POST /auth/logout` | `session.revoked` | e2e logout _pend._ |

## Observações de compatibilidade

- `create` ignora qualquer `who` do cliente; o `user_id` vem da sessão (§13.5).
- Escritas via `setUi` são roteadas pelo adaptador conforme a chave alterada
  (`collapsed`/`density` → preferências; `groups`/`integrations`/`integrationRuns`
  → endpoints próprios), preservando a assinatura única de `setUi`.
- Export CSV permanece no cliente (já funciona), alimentado por dados já
  autorizados pelo backend; endpoint de export só se necessário (§24.4).
- Anexos: o markup exibe `files:[{name,size}]`; o adaptador preenche isso a
  partir de `attachments` e resolve o download autenticado por trás.
