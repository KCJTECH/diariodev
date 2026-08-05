# Diário Dev ITS — estrutura do projeto

Registro contínuo das atividades da equipe de desenvolvimento (diário de dev).
Protótipo navegável, uma página por tela, pronto para virar um app React/TypeScript.

## Arquivos

| Arquivo | Tela / papel |
| --- | --- |
| `login.dc.html` | Login (e-mail + senha, ou entrada rápida por colaborador) |
| `dashboard.dc.html` | Dashboard: cards coloridos, gráfico 14 dias, quem registrou hoje, últimas atividades |
| `atividades.dc.html` | Lista/timeline + drawer de **Nova / Editar atividade** |
| `colaboradores.dc.html` | Lista de colaboradores |
| `colaborador.dc.html` | Perfil + timeline completa (`?id=`) |
| `projetos.dc.html` | Lista de projetos |
| `projeto.dc.html` | Detalhe do projeto + timeline (`?p=`) |
| `relatorios.dc.html` | Relatórios/BI: gráficos + export CSV, conteúdo por nível de acesso |
| `pesquisa.dc.html` | Pesquisa global (`?q=`) |
| `configuracoes.dc.html` | Categorias, cadastro de colaboradores, estados do sistema |
| `usuario.dc.html` | Minha conta: dados, preferências, trocar usuário, sair |
| `assets/data.js` | Camada de dados / mock API + tokens e estilos compartilhados |
| `assets/its-theme.css` | Folha de estilo de referência (tokens + classes) para o projeto real |

## Rotas equivalentes (React Router)

```
/login                    login
/                         dashboard
/atividades               lista + drawer (?nova=1, ?editar=:id)
/colaboradores            lista
/colaboradores/:id        perfil
/projetos                 lista
/projetos/:nome           detalhe
/relatorios               relatórios (dev / gestor / diretoria)
/pesquisa                 busca global (?q=)
/configuracoes            admin
/minha-conta              usuário logado
```

## Parâmetros de URL usados no protótipo

- `atividades.dc.html?nova=1` — abre o drawer de novo registro
- `atividades.dc.html?editar=<id>` — abre o drawer em edição
- `atividades.dc.html?pessoa=<id>&projeto=<nome>&cat=<categoria>&q=<texto>` — filtros pré-aplicados
- `colaborador.dc.html?id=<id>`, `projeto.dc.html?p=<nome>`, `pesquisa.dc.html?q=<texto>`

## Contrato de dados

```ts
type Atividade = {
  id: string;
  who: string;        // id do colaborador (vem da sessão, não é escolhido no formulário)
  proj: string;       // nome do projeto
  cat: string;        // categoria (tabela administrativa)
  title: string;
  desc: string;
  d: number;          // offset em dias em relação a hoje (no back: date ISO)
  t: string;          // hora HH:mm
  dur: string;        // duração livre ("2h 30m" | "—")
  pri: 'baixa' | 'média' | 'alta';
  tags: string[];
};

type Colaborador = {
  id: string; name: string; role: string; email: string;
  ini: string; color: string; active: boolean;
};
```

## Endpoints sugeridos

```
POST   /auth/login                 { email, password } -> { token, user }
GET    /me
GET    /activities?person&project&category&q&from&to&page
POST   /activities                 (who = usuário do token)
PUT    /activities/:id
DELETE /activities/:id
GET    /people        POST /people        PATCH /people/:id   (ativar/desativar)
GET    /categories    POST /categories    DELETE /categories/:id
GET    /projects      POST /projects
GET    /dashboard/summary          contadores, série de 14 dias, top projetos/categorias
GET    /search?q=                  atividades + pessoas + projetos
```

`assets/data.js` isola toda leitura/escrita (`DV.acts()`, `DV.create()`, `DV.update()`,
`DV.remove()`, `DV.people()`, `DV.setPeople()`, `DV.cats()`, `DV.user()`…).
Trocar essas funções por chamadas HTTP é suficiente para plugar o back-end —
as telas não acessam armazenamento diretamente.

## Níveis de acesso

`level` no colaborador (`dev` | `gestor` | `ceo`), alternável em Configurações:

| Nível | Atividades | Relatórios |
| --- | --- | --- |
| dev | apenas os próprios registros | relatório pessoal: volume, categorias, projetos, minhas entregas |
| gestor | equipe inteira, filtro por pessoa | + por colaborador (barras empilhadas), heatmap de constância, resumo de equipe no CSV |
| ceo | equipe inteira | + visão executiva: evolução semanal, % de entregas, projetos sem movimentação, alertas |

No back-end isso vira autorização no servidor: `GET /activities` filtra por `user.id` quando
`level = dev`, e `GET /reports/*` recusa o escopo de equipe para esse nível
(`DV.visibleActs()`, `DV.seesAll()` e `DV.isExec()` marcam onde aplicar).

## Export CSV

`DV.csv(header, rows)` + `DV.download(file, texto)` — separador `;` e BOM UTF-8 (abre direto no Excel pt-BR).
Dois arquivos: **detalhado** (uma linha por atividade) e **resumo** (por colaborador para gestão, por categoria para dev).

## Decisões de UX

- O colaborador **não** é escolhido no formulário: vem da sessão (`DV.user()`), exibido como “Registrando como …”.
- Drawer em vez de página cheia: não perde o contexto da lista.
- Categoria, prioridade e projeto por chips/autocomplete — 1 clique cada, categoria também por número.
- Atalhos: `N` nova atividade, `⌘K` pesquisa global, `⌘↵` salvar, `Esc` fechar.
- Timeline agrupada por período (Hoje / Ontem / Esta semana / Semanas anteriores) com faixa colorida por grupo,
  coluna de hora, trilho vertical e ponto na cor da categoria; alternativa: agrupar por projeto.
- Sidebar retrátil (preferência persistida) e densidade da timeline em Minha conta.

## Melhorias futuras

Resumo semanal automático para a retro · registro via Slack/CLI · menções `@pessoa` e `#projeto`
no título · exportação do período em PDF · streak de registros diários.
