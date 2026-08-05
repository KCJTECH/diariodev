# PROMPT MESTRE — BACKEND COMPLETO DO DIÁRIO DEV COM INTEGRAÇÃO REAL AO FRONTEND EXISTENTE

## 1. Missão

Você deverá analisar, projetar, implementar, testar, integrar e documentar, de ponta a ponta, o backend do sistema interno chamado **Diário Dev**.

O frontend já existe, está visualmente pronto, funcional e navegável. Atualmente, os dados são armazenados em `localStorage` por meio de uma camada central localizada em:

```text
assets/data.js
```

Esse arquivo expõe globalmente o objeto:

```js
window.DV
```

Sua responsabilidade é transformar o protótipo em um sistema real, persistente, seguro, multiusuário e em tempo real, utilizando:

* Node.js;
* TypeScript em modo estrito;
* Fastify, salvo se o repositório já possuir um padrão técnico diferente e bem estabelecido;
* PostgreSQL;
* Prisma ORM;
* Socket.IO;
* Redis para escalabilidade do Socket.IO, filas e processamento assíncrono;
* BullMQ ou mecanismo equivalente para filas, tentativas e tarefas agendadas;
* autenticação segura com cookies `httpOnly`;
* testes unitários, de integração e ponta a ponta;
* documentação OpenAPI;
* Docker para desenvolvimento e implantação.

O backend deverá ser a **fonte oficial de verdade**. O navegador não poderá continuar sendo responsável pela persistência principal.

O resultado final precisa ser um sistema realmente funcional. Não entregue apenas estrutura, mocks, exemplos, interfaces vazias, rotas sem implementação ou documentação sem código executável.

---

# 2. Resultado obrigatório

Ao finalizar o trabalho, o sistema deverá permitir que:

1. usuários façam login com e-mail e senha;
2. cada pessoa registre suas próprias atividades;
3. gestores e CEO acompanhem a equipe conforme as permissões;
4. tarefas sejam criadas, atribuídas, concluídas e acompanhadas;
5. projetos, categorias, usuários, grupos e integrações sejam administrados;
6. anexos sejam enviados e baixados com autenticação;
7. relatórios sejam gerados com dados reais;
8. alterações sejam refletidas em tempo real entre navegadores conectados;
9. webhooks sejam processados com segurança, histórico e novas tentativas;
10. todas as páginas existentes continuem funcionando;
11. o frontend mantenha exatamente a aparência e o comportamento atuais;
12. os dados permaneçam disponíveis após reinicializações;
13. migrations, seed, testes e documentação possam ser executados por outro desenvolvedor;
14. o sistema possa ser instalado em desenvolvimento e produção seguindo instruções documentadas;
15. o código fique modular, legível, testável e preparado para continuidade.

---

# 3. Contexto do sistema

O **Diário Dev** é um diário de desenvolvimento.

Cada pessoa registra atividades como:

* entregas;
* correções;
* estudos;
* descobertas;
* reuniões;
* refatorações;
* documentações;
* outras categorias cadastradas pela administração.

Gestores acompanham o que a equipe realizou e podem criar tarefas planejadas simples.

O sistema:

* não é um Jira;
* não possui workflow complexo;
* não é um sistema de apontamento de horas;
* não deverá ser transformado em gestor de sprints;
* não deverá ganhar recursos que não estejam refletidos no frontend;
* deverá preservar o conceito de registro contínuo de atividades.

---

# 4. Regra absoluta: não alterar o frontend visual

## 4.1 Arquivos proibidos

Não altere:

```text
*.dc.html
assets/theme.css
```

Também não altere:

* HTML;
* markup;
* elementos;
* IDs;
* classes;
* estilos inline;
* cores;
* fontes;
* tamanhos;
* espaçamentos;
* posicionamentos;
* textos;
* ícones;
* modais;
* menus;
* gráficos;
* fluxo visual;
* comportamento percebido das páginas.

## 4.2 Limite permitido no frontend

A alteração principal permitida no frontend é:

```text
assets/data.js
```

Esse arquivo poderá ser reestruturado internamente, desde que continue expondo:

```js
window.DV
```

com a mesma superfície pública, assinaturas compatíveis e formatos esperados pelas páginas existentes.

Podem ser criados arquivos JavaScript auxiliares dentro de `assets/`, desde que:

* sejam carregados por `assets/data.js`;
* não exijam alteração nos arquivos HTML;
* não alterem a apresentação;
* não quebrem o carregamento atual;
* não introduzam dependência de build no frontend estático, salvo se o projeto já possuir build configurado.

## 4.3 Regra de bloqueio

Se for tecnicamente impossível integrar o backend sem alterar um arquivo HTML ou CSS:

1. não faça a alteração escondida;
2. não contorne modificando o DOM;
3. não use monkey patch perigoso em APIs globais;
4. documente exatamente o bloqueio;
5. apresente o arquivo, a linha e a alteração mínima necessária;
6. aguarde autorização antes de modificar o arquivo proibido.

Não utilize essa regra como desculpa para interromper o trabalho antes de investigar todas as opções seguras.

---

# 5. Telas existentes

Mapeie e teste todas estas páginas:

| Arquivo                 | Responsabilidade                                                           |
| ----------------------- | -------------------------------------------------------------------------- |
| `login.dc.html`         | Login por e-mail e senha e atalho de protótipo “entrar como”               |
| `dashboard.dc.html`     | Resumo diário e semanal, gráfico, projetos em destaque e tarefas atrasadas |
| `atividades.dc.html`    | Timeline, filtros, criação, edição, anexos e tarefas pendentes             |
| `colaboradores.dc.html` | Lista de colaboradores                                                     |
| `colaborador.dc.html`   | Perfil e timeline individual                                               |
| `projetos.dc.html`      | Projetos, indicadores e tarefas consolidadas                               |
| `projeto.dc.html`       | Timeline, tarefas, workload, calendário e Gantt                            |
| `relatorios.dc.html`    | Visão geral, equipe, insights, dados e exportações                         |
| `pesquisa.dc.html`      | Pesquisa global e auditoria de registros                                   |
| `configuracoes.dc.html` | Categorias, usuários, grupos, integrações, aparência e estados             |
| `usuario.dc.html`       | Conta, preferências e troca de senha                                       |

Não presuma como as páginas utilizam `DV`. Inspecione o código de cada uma.

---

# 6. Primeira etapa obrigatória: investigação do repositório

Antes de modelar o banco ou escrever o backend, execute uma análise completa.

## 6.1 Inspeção obrigatória

Leia integralmente:

```text
assets/data.js
```

Depois pesquise no repositório todas as ocorrências de:

```text
DV.
window.DV
localStorage
sessionStorage
dv.
fetch(
XMLHttpRequest
DOMContentLoaded
load
```

Identifique:

* cada função pública de `DV`;
* cada função privada utilizada;
* quais páginas chamam cada função;
* quando as funções são chamadas;
* se são chamadas durante a avaliação do script;
* se são chamadas no `DOMContentLoaded`;
* se os retornos são usados imediatamente;
* quais funções precisam continuar síncronas;
* quais funções podem devolver `Promise` sem quebrar o frontend;
* quais eventos, modais ou mensagens de erro já existem;
* como cada tela dispara uma nova renderização;
* como o login atual funciona;
* como os filtros e paginações funcionam;
* como o usuário atual é recuperado;
* como anexos são representados;
* como gráficos e relatórios consomem os dados;
* como grupos, integrações, aparência e estados são armazenados;
* quais campos existem no protótipo, mesmo que não estejam descritos neste documento.

## 6.2 Navegação funcional

Execute o frontend e percorra todas as telas.

Antes de alterar qualquer coisa:

* faça login;
* teste cada botão;
* abra cada modal;
* registre uma atividade;
* edite uma atividade;
* exclua uma atividade;
* crie e conclua uma tarefa;
* altere filtros;
* visualize colaboradores;
* abra projetos;
* navegue pelas abas;
* teste relatórios;
* teste pesquisa;
* teste configurações;
* teste aparência;
* teste troca de usuário;
* teste logout.

Registre o comportamento atual.

## 6.3 Evidências iniciais

Crie:

```text
backend/docs/ANALISE_INICIAL.md
backend/docs/MATRIZ_COMPATIBILIDADE_FRONTEND.md
backend/docs/MAPEAMENTO_DV.md
```

`ANALISE_INICIAL.md` deve conter:

* estrutura encontrada;
* tecnologias existentes;
* scripts disponíveis;
* forma de execução;
* riscos encontrados;
* inconsistências;
* decisões necessárias.

`MATRIZ_COMPATIBILIDADE_FRONTEND.md` deve relacionar:

* página;
* ação;
* função de `DV` usada;
* formato de entrada;
* formato de retorno;
* endpoint correspondente;
* evento Socket.IO correspondente;
* teste que valida o fluxo.

`MAPEAMENTO_DV.md` deve conter todas as propriedades e métodos públicos de `DV`, sem omissões.

---

# 7. Ponto crítico: inicialização assíncrona e getters síncronos

Atualmente, as páginas leem dados de forma síncrona por meio de:

```js
DV.acts()
DV.people()
DV.cats()
DV.projects()
DV.tasks()
DV.user()
DV.ui()
DV.theme()
DV.brand()
```

Uma requisição HTTP é assíncrona. Portanto, não implemente um simples `fetch()` sem analisar como o frontend inicia.

## 7.1 Estratégia obrigatória

Primeiro determine a ordem real de carregamento dos scripts e das páginas.

Implemente a estratégia mais segura entre as seguintes possibilidades, nesta ordem:

### Estratégia A — inicialização central existente

Se o frontend já possuir um ponto central assíncrono de inicialização, integre o bootstrap nesse ponto sem alterar a assinatura dos getters.

### Estratégia B — scripts deferidos ou módulos

Se os scripts já forem carregados de modo compatível com espera assíncrona, carregue o bootstrap antes da primeira renderização.

### Estratégia C — cache síncrono descartável

Caso o frontend não possua nenhuma forma de aguardar o backend sem modificar HTML, poderá ser utilizado `localStorage` apenas como:

* cache de última leitura;
* snapshot versionado;
* mecanismo de inicialização síncrona;
* fila temporária de mutações ainda não enviadas.

Nesse cenário:

* PostgreSQL continua sendo a fonte oficial;
* não armazene senha, token ou segredo no `localStorage`;
* use chaves diferentes das antigas, como `dv.cache.v1.*`;
* inclua versão do schema;
* inclua horário da última sincronização;
* inclua TTL;
* invalide cache incompatível;
* faça revalidação imediata com `/bootstrap`;
* substitua os dados do cache pelos dados do servidor;
* trate cache como descartável;
* não considere uma mutação concluída apenas porque foi salva localmente.

### Estratégia proibida

Não utilize requisição HTTP síncrona com `XMLHttpRequest`.

Não bloqueie a thread principal.

Não faça monkey patch de `DOMContentLoaded`, `fetch`, `Promise`, `document.addEventListener` ou APIs globais.

## 7.2 Estado de prontidão

É permitido adicionar, sem remover nada existente:

```js
DV.ready
DV.isReady()
DV.onReady(callback)
DV.onError(callback)
```

Porém, as páginas existentes não poderão depender dessas novas funções para continuar operando.

---

# 8. Contrato obrigatório do objeto `DV`

O objeto global deverá preservar os métodos existentes.

## 8.1 Leitura síncrona

```text
acts
people
cats
projects
tasks
user
ui
theme
brand
```

## 8.2 Escrita

```text
setActs
setPeople
setCats
setProjects
setTasks
setUi
setUser
setTheme
setBrand
resetBrand
create
update
remove
createTask
updateTask
removeTask
logout
reset
```

## 8.3 Derivados e utilitários

```text
person
cat
catStyle
catText
badge
chip
avatar
soft
priColor
nav
shell
logoVals
fmt
longDate
iso
isoPlus
offsetOf
dateOf
groupLabel
plural
daysLeft
dueInfo
dueLabel
levelOf
levelLabel
rankOf
seesAll
isExec
canPlan
visibleActs
visibleProjects
canSeeProject
sortList
sortOptions
paginate
selectStyle
csv
download
applyTheme
applyBrand
LEVELS
NAV
T
TODAY
PAGE_SIZE
```

Antes de modificar `data.js`, gere testes de caracterização para registrar o comportamento atual desses métodos.

Não altere:

* nomes;
* capitalização;
* tipos de retorno;
* formatos;
* efeitos colaterais esperados;
* ordenação;
* regras de filtro;
* comportamento visual;
* valores padrão.

Métodos adicionais são permitidos, mas nenhum método existente pode ser removido.

---

# 9. Formatos esperados pelo frontend

## 9.1 Atividade

```js
{
  id: 'a1',
  who: 'elaine',
  proj: 'Portal ITS',
  cat: 'Entrega',
  title: 'Título',
  desc: 'Descrição',
  d: 0,
  t: '16:40',
  dur: '3h',
  pri: 'média',
  tags: ['relatorio'],
  files: [
    {
      id: '...',
      name: 'print.png',
      size: '240 KB'
    }
  ]
}
```

## 9.2 Pessoa

```js
{
  id: 'elaine',
  name: 'Elaine Ribeiro',
  role: 'Desenvolvedora Frontend',
  email: 'elaine@itscs.com.br',
  ini: 'ER',
  color: '#E85928',
  active: true,
  level: 'dev'
}
```

## 9.3 Tarefa

```js
{
  id: 't1',
  title: 'Título',
  desc: 'Descrição',
  proj: 'Portal ITS',
  who: 'elaine',
  by: 'laerty',
  due: '2026-08-04',
  pri: 'alta',
  cat: 'Entrega',
  done: false
}
```

## 9.4 Grupo

```js
{
  id: 'g1',
  name: 'Desenvolvimento',
  desc: 'Descrição',
  level: 'dev',
  perms: ['registrar.atividade', 'ver.proprios'],
  members: ['elaine', 'julio']
}
```

## 9.5 Integração

```js
{
  id: 'i2',
  name: 'n8n — automações',
  abbr: 'n8n',
  type: 'webhook',
  enabled: true,
  endpoint: 'https://...',
  secret: '...',
  events: ['atividade.criada'],
  notes: '...'
}
```

## 9.6 Execução de integração

```js
{
  source: 'n8n — automações',
  event: 'atividade.criada',
  when: 'hoje 16:41',
  ok: true
}
```

O banco poderá usar formatos normalizados e UUIDs, mas `assets/data.js` deverá mapear os dados para os formatos esperados pelas páginas.

---

# 10. Datas, horários e fuso horário

O protótipo utiliza uma data fixa e offsets em dias.

Remova qualquer dependência funcional da data fixa.

## 10.1 Banco de dados

Armazene instantes em UTC usando:

```text
timestamptz
```

Use como fuso padrão da aplicação:

```text
America/Sao_Paulo
```

Permita configurar o fuso da organização e, se necessário, do usuário.

## 10.2 Bootstrap

O endpoint `/bootstrap` deverá devolver:

```json
{
  "serverNow": "2026-07-30T14:00:00.000Z",
  "timezone": "America/Sao_Paulo"
}
```

## 10.3 Conversão no cliente

O adaptador de `assets/data.js` deverá converter:

* `occurredAt` para `d`;
* `occurredAt` para `t`;
* `durationMinutes` para `dur`;
* datas de tarefas para `YYYY-MM-DD`;
* datas relativas para os textos existentes.

O cálculo de `d` deverá comparar datas civis no fuso configurado.

Não calcule diferença de dias simplesmente dividindo milissegundos por 86.400.000.

---

# 11. Arquitetura do backend

Implemente um **monólito modular**.

Não crie microsserviços desnecessários.

Não concentre toda a aplicação em arquivos gigantes.

## 11.1 Estrutura recomendada

```text
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   ├── common/
│   │   ├── errors/
│   │   ├── auth/
│   │   ├── validation/
│   │   ├── logging/
│   │   ├── database/
│   │   ├── http/
│   │   ├── events/
│   │   └── utils/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── activities/
│   │   ├── attachments/
│   │   ├── categories/
│   │   ├── projects/
│   │   ├── tasks/
│   │   ├── groups/
│   │   ├── integrations/
│   │   ├── reports/
│   │   ├── search/
│   │   ├── settings/
│   │   ├── bootstrap/
│   │   ├── realtime/
│   │   └── audit/
│   ├── workers/
│   └── jobs/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   └── e2e/
├── docs/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env.example
```

## 11.2 Organização interna dos módulos

Cada módulo poderá conter:

```text
routes
controller
service
repository
schemas
types
mapper
policy
events
tests
```

Não crie camadas vazias apenas para simular arquitetura.

Separe responsabilidades quando houver lógica real.

## 11.3 Qualidade do código

Utilize:

* TypeScript com `strict: true`;
* validação de entrada;
* tipagem de respostas;
* tratamento centralizado de erros;
* injeção explícita de dependências;
* funções pequenas;
* serviços de domínio;
* transações;
* nomes claros;
* comentários explicando decisões, não o óbvio.

Como orientação:

* procure manter arquivos abaixo de aproximadamente 300 linhas;
* arquivos acima de 500 linhas precisam ser divididos ou justificados;
* evite funções extensas;
* elimine duplicação;
* não use `any` sem justificativa registrada;
* não deixe `TODO`, `FIXME` ou código comentado sem necessidade;
* não deixe rotas vazias;
* não deixe retornos simulados.

---

# 12. Stack técnica

Utilize preferencialmente:

* Node.js em versão LTS compatível com o ambiente;
* TypeScript;
* Fastify;
* Prisma;
* PostgreSQL;
* Socket.IO;
* Redis;
* BullMQ;
* Zod, TypeBox ou schemas nativos do Fastify;
* Pino;
* Argon2id;
* Vitest;
* Supertest ou `fastify.inject`;
* Playwright;
* Docker;
* Docker Compose;
* OpenAPI/Swagger.

Trave versões no arquivo de lock.

Não utilize dependências abandonadas.

Não misture bibliotecas que resolvem o mesmo problema sem necessidade.

---

# 13. Modelo de banco de dados

Implemente migrations reais. Não use `prisma db push` como processo de produção.

Utilize UUIDs internamente.

Quando o frontend depender de identificadores legíveis, mantenha uma chave pública, como:

```text
public_key
slug
legacy_key
```

## 13.1 `users`

Campos mínimos:

```text
id
public_key
name
role_title
email
password_hash
initials
color
active
effective_level
timezone
last_login_at
password_changed_at
created_at
updated_at
deleted_at
```

Regras:

* e-mail único sem diferenciar maiúsculas e minúsculas;
* `public_key` único;
* senha nunca retornada;
* usuário referenciado não deve ser removido fisicamente;
* exclusão administrativa deverá desativar ou aplicar soft delete;
* ninguém pode excluir ou desativar o próprio usuário pela mesma operação;
* último CEO ativo não poderá ser removido ou rebaixado sem validação.

## 13.2 `user_preferences`

Adicione uma tabela específica para preferências individuais:

```text
id
user_id
collapsed
density
default_project_id
theme_preference
extra_preferences
created_at
updated_at
```

Não misture preferências individuais com configurações globais.

## 13.3 `categories`

Campos mínimos:

```text
id
name
slug
description
color
active
sort_order
created_at
updated_at
archived_at
```

Regras:

* nome único entre categorias ativas;
* exclusão deve arquivar;
* atividades antigas devem continuar exibindo o nome correto;
* salve um snapshot do nome da categoria na atividade quando necessário.

## 13.4 `projects`

Campos mínimos:

```text
id
name
slug
description
active
created_by
created_at
updated_at
archived_at
```

Regras:

* nomes únicos sem diferenciar maiúsculas e minúsculas;
* projetos referenciados não devem ser excluídos fisicamente;
* projetos antigos devem poder ser arquivados;
* preserve o comportamento atual de projetos surgirem a partir de atividades, caso isso seja confirmado no frontend;
* se o frontend aceitar projeto livre, utilize uma operação transacional de `find-or-create`;
* somente gestor ou CEO poderá editar e arquivar o projeto;
* um dev poderá causar a criação automática de um projeto apenas se o comportamento atual exigir isso.

## 13.5 `activities`

Campos mínimos:

```text
id
user_id
project_id
category_id
category_name_snapshot
title
description
occurred_at
duration_minutes
priority
tags
source_task_id
client_mutation_id
version
created_at
updated_at
deleted_at
```

Regras:

* `user_id` deve ser obtido da sessão;
* ignore qualquer `user_id` enviado por dev ao criar uma atividade;
* não confie no campo `who` do cliente;
* utilize transação;
* `version` deverá apoiar controle de concorrência;
* tags devem ser normalizadas;
* prioridade deve aceitar somente os valores definidos;
* atividade excluída deve permanecer no log de auditoria;
* atividade originada de tarefa poderá concluir a tarefa na mesma transação.

## 13.6 `attachments`

Campos mínimos:

```text
id
activity_id
original_name
storage_provider
storage_key
mime_type
detected_mime_type
size_bytes
checksum
uploaded_by
status
created_at
deleted_at
```

## 13.7 `tasks`

Campos mínimos:

```text
id
title
description
project_id
assignee_id
created_by
due_date
priority
category_id
category_name_snapshot
done
completed_at
completed_by
completion_activity_id
client_mutation_id
version
created_at
updated_at
deleted_at
```

## 13.8 `access_groups`

Campos mínimos:

```text
id
name
description
level
permissions
active
created_at
updated_at
deleted_at
```

## 13.9 `group_members`

Campos mínimos:

```text
group_id
user_id
created_at
```

Defina uma regra determinística para usuários em mais de um grupo.

Na ausência de comportamento contrário no frontend:

* permissões efetivas são a união das permissões dos grupos ativos;
* nível efetivo é o nível de maior hierarquia;
* regras de segurança obrigatórias não podem ser anuladas por permissões customizadas.

Documente essa decisão em ADR.

## 13.10 `integrations`

Campos mínimos:

```text
id
name
abbreviation
type
enabled
endpoint
encrypted_secret
events
notes
timeout_ms
max_attempts
created_by
created_at
updated_at
deleted_at
```

Nunca armazene o segredo em texto puro.

Nunca retorne o segredo completo após o cadastro.

## 13.11 `integration_runs`

Campos mínimos:

```text
id
integration_id
event_id
event_name
payload
attempt
status
http_status
response_excerpt
error_code
error_message
duration_ms
next_retry_at
started_at
finished_at
created_at
```

## 13.12 `app_settings`

Armazene configurações globais:

```text
id
brand
appearance
default_theme
default_density
organization_timezone
version
updated_by
created_at
updated_at
```

## 13.13 `sessions`

Campos mínimos:

```text
id
user_id
refresh_token_hash
user_agent
ip_hash
expires_at
rotated_at
revoked_at
created_at
last_used_at
```

## 13.14 `password_reset_tokens`

Campos mínimos:

```text
id
user_id
token_hash
expires_at
used_at
requested_by
created_at
```

## 13.15 `audit_logs`

Implemente log de auditoria:

```text
id
actor_user_id
action
entity_type
entity_id
request_id
before_data
after_data
ip_hash
user_agent
created_at
```

Não registre:

* senha;
* token;
* cookie;
* segredo completo;
* conteúdo sensível desnecessário.

## 13.16 `outbox_events`

Para eventos confiáveis, implemente o padrão outbox:

```text
id
event_name
aggregate_type
aggregate_id
payload
scope
created_at
published_at
attempts
last_error
```

Criação ou alteração de dados e gravação do evento devem ocorrer na mesma transação.

---

# 14. Índices e integridade

Crie índices para:

* `activities.user_id`;
* `activities.project_id`;
* `activities.category_id`;
* `activities.occurred_at`;
* `activities.created_at`;
* `tasks.assignee_id`;
* `tasks.project_id`;
* `tasks.due_date`;
* `tasks.done`;
* `integration_runs.integration_id`;
* `integration_runs.created_at`;
* `sessions.user_id`;
* `sessions.expires_at`;
* `audit_logs.actor_user_id`;
* `audit_logs.entity_type`;
* `audit_logs.entity_id`.

Considere:

* índice GIN para tags;
* `pg_trgm`;
* `unaccent`;
* busca textual do PostgreSQL;
* índices parciais para registros ativos;
* constraints de unicidade;
* constraints para datas e tamanhos válidos.

Não dependa somente da validação do Node.js. Regras essenciais devem ter proteção no banco.

---

# 15. Autenticação

Implemente:

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
POST /api/v1/auth/password
POST /api/v1/users/:id/password-reset
POST /api/v1/auth/password-reset/confirm
```

## 15.1 Senhas

Use Argon2id.

Defina:

* tamanho mínimo configurável;
* proteção contra senhas triviais;
* limite de tentativas;
* rehash quando parâmetros mudarem;
* invalidação das outras sessões após troca de senha, salvo a sessão atual quando apropriado.

## 15.2 Tokens e sessões

Use:

* access token de curta duração;
* refresh token com rotação;
* refresh token armazenado somente como hash;
* detecção de reutilização;
* revogação de sessão;
* cookies `httpOnly`;
* `secure` em produção;
* `sameSite` apropriado;
* escopo de caminho;
* expiração explícita.

Não armazene JWT no `localStorage`.

## 15.3 CSRF e origem

Para operações autenticadas por cookie:

* valide `Origin`;
* use proteção CSRF quando necessária;
* mantenha lista de origens permitidas;
* não configure CORS com origem aberta e credenciais;
* não aceite requisições de qualquer domínio.

## 15.4 Login de protótipo

A opção “entrar como” deve:

* existir somente em ambiente de desenvolvimento;
* depender de `ALLOW_DEV_LOGIN=true`;
* retornar `404` em produção;
* nunca permitir acesso sem autenticação em produção;
* ser documentada como recurso exclusivamente local.

---

# 16. Autorização

Toda autorização deverá ocorrer no servidor.

Nunca confie em:

```text
level
who
by
permissions
userId
role
```

enviados pelo navegador.

## 16.1 Níveis

```text
dev
gestor
ceo
```

## 16.2 Regras gerais

### Dev

* cria atividade somente para si;
* edita ou exclui somente suas próprias atividades, respeitando o comportamento atual;
* vê suas próprias atividades em telas gerais;
* vê os projetos dos quais participa;
* participa quando possui atividade ou tarefa no projeto;
* dentro de um projeto permitido, vê os dados coletivos que a interface já mostra;
* conclui suas próprias tarefas;
* não cria tarefa;
* não atribui tarefa;
* não administra usuários;
* não administra grupos;
* não administra integrações;
* não acessa relatório executivo.

### Gestor

* vê atividades da equipe;
* vê todos os projetos;
* cria e atribui tarefas;
* edita tarefas conforme as regras existentes;
* administra usuários;
* administra categorias;
* administra grupos;
* administra integrações;
* acessa relatórios de equipe;
* exporta dados permitidos.

### CEO

* possui as permissões do gestor;
* acessa visão executiva;
* acessa indicadores executivos definidos no frontend.

## 16.3 Política de projetos

A regra “dev vê apenas projetos em que participa, mas dentro do projeto vê tudo” deverá ser implementada no servidor.

Exemplo:

```text
GET /activities
```

Para um dev, retorna somente atividades próprias.

Exemplo:

```text
GET /activities?project=<projeto permitido>
```

Pode retornar a timeline completa daquele projeto, desde que o usuário participe dele.

Implemente políticas reutilizáveis. Não replique condições de permissão em cada controller.

---

# 17. API REST

Use prefixo:

```text
/api/v1
```

## 17.1 Convenções

Respostas de sucesso:

```json
{
  "data": {},
  "meta": {
    "requestId": "..."
  }
}
```

Listas paginadas:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "perPage": 25,
    "total": 100,
    "totalPages": 4,
    "requestId": "..."
  }
}
```

Erros:

```json
{
  "error": {
    "code": "ACTIVITY_NOT_FOUND",
    "message": "Atividade não encontrada.",
    "details": [],
    "requestId": "..."
  }
}
```

Não retorne stack trace em produção.

## 17.2 Bootstrap

```text
GET /api/v1/bootstrap
```

Deverá trazer, conforme o escopo do usuário:

* usuário autenticado;
* permissões efetivas;
* pessoas visíveis;
* categorias ativas e categorias históricas necessárias;
* projetos visíveis;
* atividades necessárias para o carregamento inicial;
* tarefas;
* grupos, quando permitido;
* integrações, quando permitido;
* histórico recente de integrações, quando permitido;
* configurações globais;
* preferências individuais;
* `serverNow`;
* `timezone`;
* versão da API;
* versão do schema do cache;
* cursor de sincronização;
* configuração do Socket.IO.

Não retorne todos os registros históricos sem limite.

Defina uma janela inicial coerente com o frontend e carregue períodos adicionais sob demanda, se a interface já permitir.

## 17.3 Atividades

```text
GET    /api/v1/activities
POST   /api/v1/activities
GET    /api/v1/activities/:id
PATCH  /api/v1/activities/:id
DELETE /api/v1/activities/:id
```

Filtros:

```text
from
to
person
project
category
q
priority
tags
page
perPage
sort
order
```

Requisitos:

* validação;
* paginação limitada;
* ordenação permitida por lista segura;
* filtro de escopo;
* transações;
* controle otimista de concorrência;
* `clientMutationId`;
* auditoria;
* evento após commit.

## 17.4 Anexos

```text
POST   /api/v1/activities/:id/attachments
GET    /api/v1/attachments/:id
DELETE /api/v1/attachments/:id
```

Download sempre autenticado e autorizado.

## 17.5 Tarefas

```text
GET    /api/v1/tasks
POST   /api/v1/tasks
GET    /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id
DELETE /api/v1/tasks/:id
POST   /api/v1/tasks/:id/complete
POST   /api/v1/tasks/:id/reopen
```

Filtros:

```text
project
person
status=open|late|done
from
to
page
perPage
```

Atrasada:

```text
due_date < data atual no fuso da organização
AND done = false
```

Concluir uma tarefa a partir de uma atividade deverá atualizar atividade e tarefa na mesma transação.

## 17.6 Usuários

```text
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id
POST   /api/v1/users/:id/password-reset
```

## 17.7 Categorias

```text
GET    /api/v1/categories
POST   /api/v1/categories
PATCH  /api/v1/categories/:id
DELETE /api/v1/categories/:id
```

O `DELETE` deve arquivar quando houver histórico.

## 17.8 Projetos

```text
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/:id
PATCH  /api/v1/projects/:id
DELETE /api/v1/projects/:id
```

O `DELETE` deverá arquivar projetos referenciados.

## 17.9 Grupos

```text
GET    /api/v1/groups
POST   /api/v1/groups
GET    /api/v1/groups/:id
PATCH  /api/v1/groups/:id
DELETE /api/v1/groups/:id
PUT    /api/v1/groups/:id/members
```

Salvar membros deve recalcular nível e permissões efetivas de forma transacional.

## 17.10 Integrações

```text
GET    /api/v1/integrations
POST   /api/v1/integrations
PATCH  /api/v1/integrations/:id
DELETE /api/v1/integrations/:id
POST   /api/v1/integrations/:id/test
GET    /api/v1/integration-runs
```

## 17.11 Configurações

```text
GET /api/v1/settings/appearance
PUT /api/v1/settings/appearance

GET /api/v1/preferences
PUT /api/v1/preferences
```

Separe configuração global de preferência individual.

## 17.12 Relatórios

```text
GET /api/v1/reports/summary
GET /api/v1/reports/by-person
GET /api/v1/reports/by-project
GET /api/v1/reports/by-category
GET /api/v1/reports/daily
```

Parâmetros:

```text
from
to
project
person
category
```

Os relatórios devem respeitar o escopo do usuário.

Não carregue todos os registros no Node.js para depois agregar. Utilize consultas eficientes no PostgreSQL.

## 17.13 Pesquisa

```text
GET /api/v1/search?q=
```

Pesquisar, conforme a autorização:

* atividades;
* pessoas;
* projetos;
* categorias;
* tarefas, caso a tela utilize;
* demais entidades confirmadas durante a análise.

Implemente:

* limite mínimo de caracteres;
* paginação;
* normalização;
* `unaccent`;
* trigram ou full-text search;
* proteção contra consultas excessivamente caras.

## 17.14 Sincronização incremental

Implemente:

```text
GET /api/v1/sync?cursor=<cursor>
```

Esse endpoint deverá devolver mudanças ocorridas após o cursor informado.

Ele será utilizado após reconexão do Socket.IO, porque eventos em tempo real podem ser perdidos durante indisponibilidade de rede.

---

# 18. Realtime com Socket.IO

“Tudo em realtime” não significa substituir REST por mensagens Socket.IO.

Use:

* REST para comandos e consultas;
* Socket.IO para atualizações, notificações e invalidação;
* sincronização incremental para recuperar eventos perdidos.

## 18.1 Autenticação do socket

O Socket.IO deverá:

* utilizar a sessão autenticada;
* validar cookie ou token;
* rejeitar usuário inativo;
* validar origem;
* não aceitar nível enviado pelo cliente;
* desconectar sessão revogada;
* renovar contexto quando permissões forem alteradas.

## 18.2 Salas

Considere salas como:

```text
user:<userId>
level:gestor
level:ceo
project:<projectId>
organization:default
```

O usuário somente poderá entrar em salas autorizadas pelo servidor.

## 18.3 Eventos mínimos

```text
activity.created
activity.updated
activity.deleted

task.created
task.updated
task.completed
task.reopened
task.deleted

user.created
user.updated
user.deactivated

category.created
category.updated
category.archived

project.created
project.updated
project.archived

group.created
group.updated
group.deleted

integration.created
integration.updated
integration.deleted
integration.run.updated

settings.appearance.updated
preferences.updated

reports.invalidated
permissions.changed
session.revoked
```

## 18.4 Envelope dos eventos

Utilize um formato consistente:

```json
{
  "eventId": "uuid",
  "event": "activity.created",
  "occurredAt": "2026-07-30T14:10:00.000Z",
  "cursor": "cursor-sequencial",
  "actor": {
    "id": "uuid",
    "publicKey": "elaine"
  },
  "scope": {
    "type": "project",
    "id": "uuid"
  },
  "clientMutationId": "uuid",
  "data": {}
}
```

## 18.5 Duplicidade

O cliente deverá deduplicar eventos por:

```text
eventId
clientMutationId
```

Quando o próprio navegador enviar uma alteração otimista e receber o evento correspondente, não poderá duplicar o registro.

## 18.6 Reconexão

Ao reconectar:

1. autenticar novamente;
2. solicitar `/sync` usando o último cursor;
3. aplicar as alterações faltantes;
4. atualizar o cursor;
5. retomar eventos Socket.IO.

Não considere conexão Socket.IO como garantia de entrega.

## 18.7 Escalabilidade

Use o adaptador Redis do Socket.IO quando houver mais de uma instância.

Documente o comportamento:

* com Redis;
* sem Redis;
* em desenvolvimento;
* em produção.

---

# 19. Cache e alterações otimistas no `data.js`

O cache em memória deverá ser centralizado.

Exemplo conceitual:

```js
const state = {
  ready: false,
  user: null,
  people: [],
  categories: [],
  projects: [],
  activities: [],
  tasks: [],
  groups: [],
  integrations: [],
  integrationRuns: [],
  appearance: {},
  preferences: {},
  cursor: null
};
```

Não permita que cada tela mantenha uma fonte de verdade independente.

## 19.1 Escrita otimista

Ao criar, editar ou excluir:

1. valide localmente;
2. gere `clientMutationId`;
3. salve snapshot do estado anterior;
4. atualize o cache;
5. permita que a tela continue funcionando;
6. envie a requisição;
7. substitua o registro temporário pelo registro oficial;
8. deduplique o evento Socket.IO;
9. em erro, faça rollback;
10. utilize o mecanismo de mensagem já existente na interface;
11. registre erro técnico no console somente em desenvolvimento.

Não introduza novos componentes visuais.

## 19.2 Erros

Não ignore falhas.

Não utilize `.catch(() => {})`.

Diferencie:

* sem conexão;
* sessão expirada;
* sem permissão;
* validação;
* conflito de versão;
* registro removido por outro usuário;
* erro de servidor;
* timeout.

## 19.3 Concorrência

Utilize:

```text
version
updatedAt
ETag
If-Match
```

ou outra estratégia equivalente.

Caso dois usuários editem o mesmo registro:

* não sobrescreva silenciosamente;
* detecte conflito;
* recupere o estado atual;
* restaure ou atualize o cache;
* utilize a mensagem existente na interface quando possível;
* documente o comportamento.

---

# 20. Upload e armazenamento de anexos

Implemente uma abstração de armazenamento.

Suporte inicial:

* disco local em desenvolvimento;
* S3 ou armazenamento compatível em produção;
* MinIO no Docker Compose, quando usado.

## 20.1 Segurança dos anexos

Implemente:

* limite de tamanho configurável;
* limite de quantidade por atividade;
* lista permitida de extensões;
* validação por extensão;
* validação por MIME informado;
* detecção real do tipo de arquivo;
* nome interno aleatório;
* checksum;
* prevenção de path traversal;
* bloqueio de arquivos executáveis;
* armazenamento fora da pasta pública;
* download autenticado;
* `Content-Disposition: attachment`;
* nome original higienizado;
* proteção contra sobrescrita;
* remoção segura;
* logs sem conteúdo sensível.

Prepare integração opcional com antivírus, como ClamAV, com estado de quarentena.

Não permita acesso direto por caminho previsível.

---

# 21. Integrações e webhooks

Eventos mínimos:

```text
atividade.criada
atividade.editada
atividade.excluida
resumo.diario
```

Mapeie também os nomes em inglês utilizados internamente, sem quebrar o formato mostrado na interface.

## 21.1 Entrega confiável

Use:

* outbox transacional;
* fila;
* worker;
* timeout;
* tentativas;
* backoff exponencial;
* jitter;
* limite de tentativas;
* histórico;
* estado final de falha;
* reprocessamento manual por gestor, caso compatível.

## 21.2 Headers

Mantenha por compatibilidade:

```text
X-DiarioDev-Secret
```

Adicione também:

```text
X-DiarioDev-Event
X-DiarioDev-Event-Id
X-DiarioDev-Timestamp
X-DiarioDev-Signature
```

A assinatura deverá usar HMAC-SHA256 sobre:

```text
timestamp + "." + corpo bruto
```

Utilize comparação em tempo constante.

Documente que `X-DiarioDev-Secret` existe por compatibilidade e que a assinatura HMAC é a validação recomendada.

## 21.3 Segurança de endpoint

Proteja contra SSRF.

Por padrão:

* bloqueie esquemas não HTTP/HTTPS;
* valide URL;
* limite redirecionamentos;
* bloqueie endereços perigosos;
* defina timeout;
* limite tamanho de resposta.

Como integrações internas podem utilizar IP privado, forneça uma allowlist configurável e documentada. Não libere redes privadas de forma indiscriminada.

## 21.4 Segredos

Criptografe segredos com AES-GCM ou mecanismo seguro equivalente.

A chave mestra deve vir de variável de ambiente.

Ao consultar integração:

```json
{
  "secretConfigured": true,
  "secretPreview": "****7f2a"
}
```

Nunca retorne o segredo completo.

## 21.5 Payload

O payload deverá corresponder ao formato apresentado pela interface.

Crie testes de contrato para garantir que futuras alterações não quebrem integrações.

---

# 22. Resumo diário

Implemente o disparo de resumo diário por job.

Requisitos:

* horário configurável;
* fuso da organização;
* execução única mesmo com múltiplas instâncias;
* lock distribuído ou mecanismo equivalente;
* histórico;
* repetição segura;
* idempotência;
* registro em `integration_runs`;
* não disparar duplicado em reinicialização.

---

# 23. Configuração “Estados”

A tela de configurações possui uma área chamada “Estados”, mas o modelo fornecido não descreve seu funcionamento.

Durante a análise:

1. descubra se essa aba possui uso funcional;
2. identifique o formato salvo em `localStorage`;
3. identifique as páginas que consomem esses estados;
4. documente o comportamento.

Somente crie tabela e endpoints específicos caso o frontend realmente utilize esse recurso.

Não invente um workflow.

---

# 24. Relatórios e exportações

Os relatórios deverão trabalhar com dados reais.

Implemente:

* resumo do período;
* atividades por pessoa;
* atividades por projeto;
* atividades por categoria;
* atividades por dia;
* tarefas abertas;
* tarefas atrasadas;
* tarefas concluídas;
* duração agregada, somente quando coerente com o protótipo;
* projetos em destaque;
* filtros existentes.

## 24.1 Visão do dev

Retorne somente sua visão pessoal, exceto informações coletivas de projetos autorizados quando a tela exigir.

## 24.2 Visão do gestor

Retorne dados da equipe.

## 24.3 Visão do CEO

Retorne indicadores executivos já representados pela interface.

## 24.4 CSV e PDF

Inspecione como o frontend exporta atualmente.

Se a exportação já ocorre corretamente no navegador:

* preserve o comportamento;
* alimente-a com dados autorizados;
* não duplique sem necessidade.

Se precisar de backend:

```text
GET /api/v1/reports/export.csv
GET /api/v1/reports/export.pdf
```

O servidor deverá aplicar novamente as permissões.

Nunca confie nos dados enviados pelo cliente para produzir o relatório.

---

# 25. Seed

Crie um seed idempotente com os dados existentes em `assets/data.js`.

Inclua aproximadamente:

* 7 pessoas;
* 7 categorias;
* 5 projetos;
* 25 atividades;
* 6 tarefas;
* 4 grupos;
* 4 integrações;
* configurações de aparência;
* preferências;
* usuário de administração para desenvolvimento.

## 25.1 Requisitos do seed

* IDs estáveis quando necessário para testes;
* senhas exclusivamente de desenvolvimento;
* senha informada no README;
* aviso explícito para troca;
* não executar seed automaticamente em produção;
* poder executar várias vezes sem duplicar dados;
* preservar relações;
* manter o frontend visualmente preenchido.

---

# 26. Segurança obrigatória

Implemente práticas alinhadas ao OWASP.

## 26.1 HTTP

Use:

* headers de segurança;
* limites de body;
* limites de upload;
* timeouts;
* CORS restritivo;
* validação de origem;
* rate limiting;
* request ID;
* logs estruturados;
* redaction de campos sensíveis.

## 26.2 Rate limiting

Aplique limites específicos para:

* login;
* refresh;
* recuperação de senha;
* teste de integração;
* busca;
* upload;
* exportação;
* endpoints administrativos.

## 26.3 Validação

Valide:

* body;
* query;
* params;
* headers relevantes;
* datas;
* e-mail;
* UUID;
* paginação;
* ordenação;
* MIME;
* tamanho de texto;
* tamanho de arrays;
* tags;
* cores;
* URLs.

## 26.4 Logs

Nunca registre:

* senha;
* hash de senha;
* cookie;
* JWT;
* refresh token;
* token de recuperação;
* segredo de integração;
* arquivo completo;
* dados pessoais desnecessários.

## 26.5 Banco

Utilize usuário de banco com privilégios mínimos.

Não utilize usuário administrador do PostgreSQL na aplicação.

## 26.6 Produção

Não deixe habilitado:

* Swagger público sem controle;
* login de protótipo;
* stack trace;
* seed;
* credenciais padrão;
* CORS aberto;
* cookies inseguros;
* debug excessivo.

---

# 27. Observabilidade

Implemente logs estruturados com Pino.

Cada requisição deverá possuir:

```text
requestId
method
route
statusCode
duration
userId, quando autenticado
```

Sem dados sensíveis.

Implemente:

```text
GET /health/live
GET /health/ready
```

`live` verifica se o processo está ativo.

`ready` verifica dependências essenciais, como:

* PostgreSQL;
* Redis, quando obrigatório;
* armazenamento, quando obrigatório.

Considere métricas para:

* quantidade de requisições;
* latência;
* erros;
* conexões Socket.IO;
* jobs pendentes;
* falhas de webhook;
* duração de consultas.

Documente como integrar com Prometheus, mesmo que a infraestrutura final ainda não o utilize.

---

# 28. Desempenho

Não otimize sem medir, mas não implemente consultas ineficientes conhecidas.

Evite:

* N+1;
* carregar todas as atividades para gerar um gráfico;
* consultas sem paginação;
* filtros em memória para grandes conjuntos;
* envio repetido de bootstrap completo;
* payloads Socket.IO gigantes;
* anexos carregados em memória integralmente;
* serializações desnecessárias.

Utilize:

* paginação;
* seleção somente de campos necessários;
* índices;
* agregação SQL;
* streaming de arquivo;
* cache apenas quando houver benefício;
* compressão;
* conexão persistente;
* queries medidas.

Crie um teste básico de carga e documente:

* volume utilizado;
* ambiente;
* tempo do bootstrap;
* tempo das consultas principais;
* quantidade de requisições suportadas;
* gargalos encontrados.

Não invente resultados. Registre somente medições executadas.

---

# 29. Testes

Nenhuma funcionalidade crítica será considerada concluída sem teste.

## 29.1 Testes de caracterização

Antes de reescrever `assets/data.js`, registre o comportamento atual de:

* datas;
* filtros;
* prioridades;
* permissões;
* projetos visíveis;
* ordenação;
* paginação;
* CSV;
* categorias;
* tarefas atrasadas;
* grupos;
* aparência.

## 29.2 Testes unitários

Cubra:

* regras de autorização;
* cálculo de atraso;
* transformação de datas;
* mapeamento backend → formato `DV`;
* formatação de duração;
* permissões efetivas;
* assinatura de webhook;
* sanitização de anexos;
* controle de concorrência;
* deduplicação de eventos.

## 29.3 Testes de integração

Utilize banco PostgreSQL real de teste ou Testcontainers.

Cubra:

* migrations;
* login;
* refresh;
* logout;
* CRUD de atividades;
* CRUD de tarefas;
* conclusão por atividade;
* permissões;
* anexos;
* grupos;
* categorias arquivadas;
* projetos;
* relatórios;
* pesquisa;
* integrações;
* outbox;
* retries;
* auditoria.

Não use SQLite para simular PostgreSQL.

## 29.4 Testes de contrato

Valide:

* estrutura de `/bootstrap`;
* respostas REST;
* payloads de webhook;
* eventos Socket.IO;
* formatos esperados pelo objeto `DV`;
* códigos de erro.

## 29.5 Testes E2E

Use Playwright.

Teste todas as páginas com pelo menos:

* um usuário dev;
* um gestor;
* um CEO;
* dois navegadores simultâneos.

Cenários mínimos:

1. login válido;
2. login inválido;
3. sessão expirada;
4. dev cria atividade;
5. segundo navegador recebe a atividade;
6. dev não cria atividade para outra pessoa;
7. gestor vê atividade;
8. gestor cria tarefa;
9. dev recebe tarefa em tempo real;
10. dev conclui tarefa;
11. gestor recebe conclusão;
12. criação de atividade a partir da tarefa conclui a tarefa;
13. edição de atividade;
14. exclusão de atividade;
15. upload;
16. download autorizado;
17. download negado;
18. categoria arquivada mantém histórico;
19. usuário não exclui a si próprio;
20. dev não acessa administração;
21. relatório respeita permissões;
22. pesquisa não vaza registros;
23. reconexão Socket.IO recupera eventos;
24. conflito de edição;
25. logout encerra sessão.

## 29.6 Regressão visual

Antes das alterações, capture screenshots de referência.

Depois, capture novamente.

Compare:

* páginas;
* modais;
* menus;
* estados vazios;
* estados preenchidos;
* temas;
* densidades;
* desktop nos tamanhos utilizados atualmente.

Não aceite alteração visual causada pela integração.

---

# 30. Docker e ambiente

Crie:

```text
backend/Dockerfile
backend/docker-compose.yml
backend/.env.example
```

## 30.1 Dockerfile

Use:

* build multi-stage;
* imagem enxuta;
* usuário não root;
* somente dependências necessárias em produção;
* healthcheck quando apropriado;
* encerramento gracioso;
* tratamento de `SIGTERM`;
* sem segredos copiados para a imagem.

## 30.2 Docker Compose

Inclua, conforme a arquitetura:

* API;
* worker;
* PostgreSQL;
* Redis;
* MinIO, caso utilizado;
* serviço de teste de e-mail, caso útil no desenvolvimento.

Use volumes persistentes.

Não exponha serviços internos desnecessariamente.

## 30.3 Variáveis

Documente todas as variáveis:

```text
NODE_ENV
PORT
DATABASE_URL
REDIS_URL
APP_ORIGIN
COOKIE_SECRET
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
ENCRYPTION_KEY
STORAGE_PROVIDER
STORAGE_PATH
S3_ENDPOINT
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
ORGANIZATION_TIMEZONE
ALLOW_DEV_LOGIN
LOG_LEVEL
```

Não coloque valores reais no repositório.

---

# 31. Migrations e implantação

Documente:

* como criar migration;
* como revisar migration;
* como aplicar em desenvolvimento;
* como aplicar em homologação;
* como aplicar em produção;
* como realizar rollback lógico;
* como fazer backup antes de migration;
* como restaurar backup;
* como executar seed;
* como iniciar API;
* como iniciar worker;
* como verificar health checks.

Não execute migrations destrutivas sem proteção.

Para alterações destrutivas, utilize estratégia expandir/migrar/contrair.

---

# 32. Documentação obrigatória

Ao finalizar, crie os seguintes arquivos:

```text
backend/README.md
backend/docs/ARQUITETURA.md
backend/docs/BANCO_DE_DADOS.md
backend/docs/API.md
backend/docs/REALTIME.md
backend/docs/SEGURANCA.md
backend/docs/AUTENTICACAO_E_PERMISSOES.md
backend/docs/INTEGRACAO_FRONTEND.md
backend/docs/INTEGRACOES_WEBHOOK.md
backend/docs/ANEXOS.md
backend/docs/TESTES.md
backend/docs/DEPLOYMENT.md
backend/docs/OPERACAO.md
backend/docs/BACKUP_E_RESTAURACAO.md
backend/docs/GUIA_DO_USUARIO.md
backend/docs/CONTINUIDADE_DO_DESENVOLVIMENTO.md
backend/docs/TROUBLESHOOTING.md
backend/docs/CHANGELOG_IMPLEMENTACAO.md
backend/docs/IMPLEMENTATION_STATUS.md
backend/openapi.yaml
```

## 32.1 `README.md`

Deve informar:

* objetivo;
* arquitetura;
* pré-requisitos;
* instalação;
* configuração;
* migrations;
* seed;
* execução;
* testes;
* acesso inicial;
* Docker;
* estrutura de diretórios;
* comandos principais.

## 32.2 `ARQUITETURA.md`

Deve explicar:

* módulos;
* responsabilidades;
* dependências;
* fluxo HTTP;
* fluxo Socket.IO;
* fluxo de eventos;
* outbox;
* filas;
* decisões técnicas;
* limites do sistema.

## 32.3 `BANCO_DE_DADOS.md`

Deve explicar:

* tabelas;
* campos;
* relacionamentos;
* constraints;
* índices;
* soft delete;
* auditoria;
* estratégia de migrations.

Inclua diagrama Mermaid.

## 32.4 `INTEGRACAO_FRONTEND.md`

Deve explicar:

* como `DV` funciona;
* como o bootstrap ocorre;
* como o cache funciona;
* como alterações otimistas funcionam;
* como rollback funciona;
* como o Socket.IO atualiza o cache;
* como datas são convertidas;
* como erros são tratados;
* como adicionar uma nova operação sem quebrar as telas.

## 32.5 `GUIA_DO_USUARIO.md`

Escreva instruções para:

* login;
* registrar atividade;
* editar atividade;
* anexar arquivo;
* concluir tarefa;
* visualizar projeto;
* usar relatórios;
* pesquisar;
* alterar preferências;
* administrar usuários;
* administrar categorias;
* administrar grupos;
* administrar integrações;
* solucionar problemas básicos.

## 32.6 `CONTINUIDADE_DO_DESENVOLVIMENTO.md`

Inclua:

* como criar um novo módulo;
* como criar rota;
* como criar migration;
* como adicionar evento Socket.IO;
* como adicionar integração;
* como adicionar teste;
* convenções;
* pontos de extensão;
* cuidados com o contrato `DV`;
* riscos conhecidos;
* dívida técnica restante.

## 32.7 ADRs

Crie registros de decisão em:

```text
backend/docs/adr/
```

No mínimo:

```text
ADR-001-monolito-modular.md
ADR-002-autenticacao-e-sessoes.md
ADR-003-bootstrap-e-compatibilidade-sincrona.md
ADR-004-realtime-e-recuperacao-de-eventos.md
ADR-005-outbox-e-webhooks.md
ADR-006-armazenamento-de-anexos.md
ADR-007-niveis-e-grupos-de-acesso.md
ADR-008-datas-e-fuso-horario.md
```

---

# 33. Documentação dentro do código

Adicione documentação apenas onde ela ajuda a continuidade.

Documente:

* regras de domínio;
* decisões não óbvias;
* políticas de autorização;
* formato de eventos;
* invariantes;
* efeitos de transações;
* motivos para adaptações de compatibilidade.

Não encha o código com comentários como:

```js
// Soma um ao contador
contador++;
```

Prefira nomes claros e documentação do motivo.

---

# 34. Estratégia de execução

Execute em fases.

## Fase 1 — análise

* inspecionar repositório;
* executar frontend;
* mapear `DV`;
* mapear telas;
* registrar baseline;
* identificar riscos;
* escrever análise inicial.

## Fase 2 — fundação

* criar estrutura do backend;
* configurar TypeScript;
* configurar Fastify;
* configurar Prisma;
* configurar PostgreSQL;
* configurar Redis;
* configurar logs;
* configurar erros;
* configurar validação;
* criar health checks.

## Fase 3 — banco

* criar schema;
* criar migrations;
* criar constraints;
* criar índices;
* criar seed;
* validar migrations em banco vazio;
* validar migration repetível no pipeline.

## Fase 4 — autenticação e autorização

* login;
* sessão;
* refresh;
* logout;
* troca de senha;
* reset;
* políticas;
* grupos;
* testes de permissão.

## Fase 5 — módulos de domínio

Implementar e testar:

1. usuários;
2. categorias;
3. projetos;
4. atividades;
5. tarefas;
6. anexos;
7. configurações;
8. preferências;
9. relatórios;
10. pesquisa;
11. auditoria.

## Fase 6 — realtime

* autenticação do socket;
* salas;
* eventos;
* Redis adapter;
* deduplicação;
* reconexão;
* sync por cursor;
* testes com dois clientes.

## Fase 7 — integrações

* criptografia de segredos;
* outbox;
* fila;
* worker;
* assinatura;
* retries;
* resumo diário;
* histórico;
* testes.

## Fase 8 — integração do frontend

* preservar API de `DV`;
* implementar bootstrap;
* implementar cache;
* implementar cliente HTTP;
* implementar escrita otimista;
* implementar rollback;
* integrar Socket.IO;
* mapear datas;
* mapear anexos;
* tratar sessão;
* remover dependência do armazenamento antigo como fonte oficial.

## Fase 9 — validação

* testes unitários;
* testes de integração;
* testes de contrato;
* testes E2E;
* regressão visual;
* carga básica;
* análise de segurança;
* correção de falhas.

## Fase 10 — documentação

* atualizar todos os arquivos;
* registrar comandos reais;
* registrar resultados reais;
* registrar limitações;
* concluir changelog;
* concluir relatório final.

Não avance uma fase crítica com testes quebrados sem registrar e corrigir a causa.

---

# 35. Commits

Faça commits pequenos e coerentes.

Exemplos:

```text
chore(backend): initialize fastify typescript project
feat(database): add initial prisma schema and migrations
feat(auth): implement secure session authentication
feat(activities): implement activity CRUD and authorization
feat(tasks): implement task planning and completion
feat(realtime): add authenticated socket.io events
feat(integrations): add transactional outbox and webhook worker
feat(frontend-data): connect DV cache to backend API
test(e2e): cover diary activity and task flows
docs(backend): add deployment and continuation guides
```

Antes de cada commit, confirme que não há alterações em:

```text
*.dc.html
assets/theme.css
```

Caso o repositório não permita commits, documente os commits sugeridos e mantenha as mudanças organizadas.

---

# 36. Critérios objetivos de aceite

O trabalho somente poderá ser declarado concluído quando todos os itens abaixo forem atendidos.

## Frontend

* [ ] Nenhum `*.dc.html` foi alterado.
* [ ] `assets/theme.css` não foi alterado.
* [ ] Todas as páginas abrem.
* [ ] Todos os modais funcionam.
* [ ] Aparência permanece igual.
* [ ] O objeto `DV` mantém seu contrato.
* [ ] Getters continuam síncronos.
* [ ] Datas reais são exibidas corretamente.
* [ ] Dados vêm do backend.
* [ ] Recarregar a página não perde dados.
* [ ] Logout limpa o estado sensível.
* [ ] Sessão expirada é tratada.
* [ ] Cache não é a fonte oficial.

## Backend

* [ ] Migrations funcionam em banco vazio.
* [ ] Seed funciona.
* [ ] Login funciona.
* [ ] Refresh funciona.
* [ ] Logout revoga a sessão.
* [ ] Permissões são aplicadas no servidor.
* [ ] CRUD de atividades funciona.
* [ ] CRUD de tarefas funciona.
* [ ] Conclusão por atividade é transacional.
* [ ] Usuários funcionam.
* [ ] Categorias arquivadas preservam histórico.
* [ ] Projetos funcionam.
* [ ] Grupos recalculam permissões.
* [ ] Integrações funcionam.
* [ ] Anexos são protegidos.
* [ ] Relatórios respeitam escopo.
* [ ] Pesquisa respeita escopo.
* [ ] Auditoria funciona.
* [ ] Health checks funcionam.

## Realtime

* [ ] Alteração aparece em outro navegador.
* [ ] Evento não duplica item otimista.
* [ ] Usuário não recebe evento não autorizado.
* [ ] Reconexão recupera eventos perdidos.
* [ ] Redis adapter está documentado.
* [ ] Sessão revogada desconecta o socket.

## Segurança

* [ ] Senhas usam Argon2id.
* [ ] Tokens não ficam no `localStorage`.
* [ ] Cookies usam flags seguras.
* [ ] CORS não está aberto.
* [ ] Rate limiting está configurado.
* [ ] Upload é validado.
* [ ] Segredos estão criptografados.
* [ ] Logs não expõem segredos.
* [ ] Webhooks têm assinatura.
* [ ] SSRF foi tratado.
* [ ] Rotas administrativas possuem autorização.
* [ ] Usuário não exclui a si próprio.

## Qualidade

* [ ] TypeScript compila sem erro.
* [ ] Linter passa.
* [ ] Testes unitários passam.
* [ ] Testes de integração passam.
* [ ] Testes de contrato passam.
* [ ] Testes E2E passam.
* [ ] Não há `TODO` crítico.
* [ ] Não há mocks em produção.
* [ ] Não há arquivos monolíticos injustificados.
* [ ] Documentação corresponde ao código real.

---

# 37. Relatório final obrigatório

Ao concluir, apresente um relatório contendo:

## 37.1 Resumo

* o que foi implementado;
* arquitetura adotada;
* principais decisões;
* como o frontend foi preservado.

## 37.2 Arquivos alterados

Liste:

* arquivos criados;
* arquivos modificados;
* finalidade de cada alteração importante.

Confirme explicitamente que:

```text
Nenhum arquivo *.dc.html foi alterado.
O arquivo assets/theme.css não foi alterado.
```

Essa afirmação deve ser baseada em `git diff`, não em memória.

## 37.3 Banco

Informe:

* migrations;
* tabelas;
* índices;
* seed;
* comandos executados.

## 37.4 API

Liste:

* endpoints;
* autenticação;
* permissões;
* OpenAPI.

## 37.5 Realtime

Liste:

* salas;
* eventos;
* estratégia de reconexão;
* sincronização;
* deduplicação.

## 37.6 Testes

Informe os comandos executados e o resultado real:

```text
npm run typecheck
npm run lint
npm run test
npm run test:integration
npm run test:e2e
npm run build
```

Não diga que um teste passou se ele não foi executado.

## 37.7 Pendências

Liste honestamente:

* limitações;
* riscos;
* funcionalidades não concluídas;
* dependências externas;
* decisões que ainda exigem autorização.

Não esconda falhas.

---

# 38. Regras de comportamento durante a implementação

1. Não entregue apenas uma análise.
2. Não pare após criar o schema.
3. Não pare após criar as rotas.
4. Não pare após alterar `data.js`.
5. Execute o sistema.
6. Execute as migrations.
7. Execute o seed.
8. execute os testes.
9. navegue pelas páginas.
10. corrija os erros encontrados.
11. valide o realtime com dois clientes.
12. documente o resultado real.
13. não declare conclusão com partes simuladas.
14. não ignore erros de TypeScript.
15. não use `any` para silenciar problemas.
16. não desative testes para fazê-los passar.
17. não reduza regras de segurança para facilitar.
18. não altere o frontend visual.
19. não substitua o sistema por outro layout.
20. não introduza arquitetura excessivamente complexa.
21. não crie código monolítico.
22. não invente comportamento não representado na interface.
23. não exponha dados por confiar em filtros do cliente.
24. não armazene segredos no código.
25. não sobrescreva dados concorrentes silenciosamente.
26. não utilize `localStorage` como banco principal.
27. não use mocks no resultado final.
28. não documente comandos que não funcionam.
29. não omita arquivos importantes da documentação.
30. sempre corrija a causa do erro, não apenas o sintoma.

---

# 39. Ordem para iniciar agora

Comece imediatamente seguindo esta ordem:

1. mostre a árvore relevante do repositório;
2. leia integralmente `assets/data.js`;
3. localize todas as chamadas a `DV`;
4. analise a ordem de carregamento dos scripts;
5. execute e navegue pelo frontend;
6. registre o comportamento atual;
7. crie a matriz de compatibilidade;
8. apresente os riscos técnicos encontrados;
9. defina a arquitetura em ADRs;
10. implemente o backend;
11. integre `assets/data.js`;
12. implemente Socket.IO;
13. execute os testes;
14. corrija todos os erros;
15. conclua a documentação;
16. apresente o relatório final.

Tome decisões triviais com base no código existente e documente-as.

Somente interrompa para solicitar decisão quando existir:

* impossibilidade comprovada de preservar os arquivos proibidos;
* ambiguidade de segurança que possa causar vazamento de dados;
* necessidade de credencial externa não disponível;
* escolha de negócio que não possa ser inferida pelo frontend;
* risco de perda ou destruição de dados.

Mesmo nesses casos, conclua antes todas as partes que não dependem da decisão.

O objetivo final é entregar o **Diário Dev funcionando de verdade**, com frontend preservado, backend Node.js, PostgreSQL, autenticação segura, atualizações em tempo real, código modular, testes executados e documentação suficiente para qualquer outro desenvolvedor continuar o projeto.
