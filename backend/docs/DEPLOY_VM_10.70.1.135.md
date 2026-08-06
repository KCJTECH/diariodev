# Deploy realizado — VM 10.70.1.135

Registro do deploy executado em 2026-08-04. Sistema no ar e validado.

## Acesso
- Aplicação: http://10.70.1.135:3333/
- Saúde: http://10.70.1.135:3333/health/ready

## Ambiente do servidor
- Debian GNU/Linux 13 (trixie), host kcjlab17, usuário kcj
- Node.js v24.18.1 (já instalado no servidor)
- PostgreSQL 17.10 (já instalado) na porta **5433**
- Redis 8.0.2 (instalado durante o deploy)
- Docker NÃO foi usado: a stack roda direto com Node, pois o servidor já tinha
  PostgreSQL e Node. O docker-compose continua válido para outros ambientes.

## Banco
- Banco: `diariodev` | Schema: `diariodev` | Usuário da aplicação: `diariodev_app`
- 16 tabelas criadas por `prisma migrate deploy` (migrations init + outbox_sequence)
- Seed aplicado: 7 pessoas, 7 categorias, 5 projetos, 24 atividades, 6 tarefas,
  4 grupos, 4 integrações
- Conta de administração: alvaro.lima@itscs.com.br (nível CEO)

## Layout no servidor
```
/home/kcj/diariodev/            projeto (frontend na raiz + backend/)
/home/kcj/diariodev/backend/    API, worker, .env, dist/
/home/kcj/diariodev/logs/       api.log e worker.log
/home/kcj/diariodev/backend/storage/  anexos
```

## Configuração aplicada no .env
- `PORT=3333`, `NODE_ENV=production`
- `APP_ORIGIN=http://10.70.1.135:3333` (precisa ser o endereço real de acesso)
- `ALLOW_DEV_LOGIN=true` (a tela de login é protótipo; ver limitação abaixo)
- `COOKIE_SECURE=false` — obrigatório aqui: o acesso é HTTP puro, e um cookie
  `Secure` seria descartado pelo navegador, impedindo o login. Com HTTPS, use `true`.
- `DATABASE_URL` aponta para 127.0.0.1:5433, banco e schema diariodev
- `REDIS_URL=redis://127.0.0.1:6379`

## Como operar
```bash
# logs
tail -f /home/kcj/diariodev/logs/api.log
tail -f /home/kcj/diariodev/logs/worker.log

# estado dos processos
pgrep -af 'dist/src/(server|workers)'

# reiniciar (sempre por este caminho, inclusive por ssh)
bash /home/kcj/diariodev/restart.sh
```

O `restart.sh` está versionado na raiz do projeto. Ele encerra API e worker, sobe um de
cada, espera o `/health/ready` responder e informa quantos processos ficaram de pé.
Retorna 1 e mostra o fim do log se a API não subir.

Não reinicie por comando inline via `ssh usuario@host '... pkill ...'`. O `pkill -f`
casa contra a linha de comando completa dos processos, e o comando inline contém o
próprio padrão na sua argv: o `pkill` mata a sessão SSH antes de subir os processos e a
aplicação fica fora do ar. Isso aconteceu duas vezes em 2026-08-05, na segunda vez
inclusive com colchete no padrão (`'dist/src/[s]erver.js'`), que não protege, porque a
linha de subida traz o caminho sem colchete e casa igual. Em script isso não acontece,
porque a argv do shell é só `bash restart.sh`.

Para conferir processos sem correr esse risco, use o colchete apenas na consulta:
`pgrep -af 'dist/src/serve[r].js'`.

## Iniciar automaticamente no boot (exige root)

Revisão dos units feita em 2026-08-06, antes de instalar: `/usr/bin/node` existe
(v24.18.1), `redis-server.service` e `postgresql.service` são os nomes reais das
units nesta máquina, os arquivos de log são graváveis pelo `kcj` e o systemd é o
257, que suporta `StandardOutput=append:`. Os dois arquivos estão corretos como
escritos, sem ajuste necessário.

Depois de instalar, o restart passa a exigir privilégio: `systemctl restart` não
funciona como `kcj`. O `restart.sh` detecta os units e delega ao systemd, e falha
com mensagem clara em vez de subir processo duplicado, porque matar o processo com
o unit ativo faria o systemd subir um substituto e o método manual subir outro,
causando conflito na porta 3333.

Para o deploy continuar funcionando sem root, libere apenas estes dois units.
Como root, crie `/etc/sudoers.d/diariodev` com:
```
kcj ALL=(root) NOPASSWD: /usr/bin/systemctl restart diariodev-api diariodev-worker, /usr/bin/systemctl restart diariodev-api, /usr/bin/systemctl restart diariodev-worker, /usr/bin/systemctl status diariodev-api, /usr/bin/systemctl status diariodev-worker
```
Isso não dá privilégio geral: apenas reiniciar e consultar esses dois serviços.

Instalação, como root:
```bash
su -
install -m 644 /home/kcj/diariodev-api.service    /etc/systemd/system/diariodev-api.service
install -m 644 /home/kcj/diariodev-worker.service /etc/systemd/system/diariodev-worker.service
systemctl daemon-reload
pkill -f 'dist/src/server.js'; pkill -f 'dist/src/workers/index.js'   # encerra os manuais
systemctl enable --now diariodev-api diariodev-worker
systemctl status diariodev-api --no-pager
exit
```
Depois disso a aplicação sobe sozinha após reiniciar a VM, com restart automático
em caso de falha.

## Validação executada (resultados reais)
- Acesso externo: porta 3333 alcançável; index.html HTTP 200; assets/data.js 200
- Health: `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`
- Login por SENHA REAL via API: 200 (alvaro/ceo)
- Bootstrap: 8 pessoas, 7 categorias, 5 projetos, 24 atividades, 6 tarefas, admin true
- Criar atividade: 201; excluir: 204; relatório (agregação SQL): 25 atividades
- Admin: criar categoria 201, arquivar 200
- Escopo: dev (elaine) vê 5 atividades; ceo vê 25; dev criando categoria: 403
- Navegador: dashboard com dados reais e data dinâmica ("Terça, 04 ago")

## Correção feita durante o deploy
`COOKIE_SECURE` foi adicionado ao backend (src/config/env.ts e
src/modules/auth/auth.cookies.ts). Antes, com NODE_ENV=production, o cookie saía
sempre `Secure` e o login não persistia em acesso HTTP. Agora o comportamento é
configurável, mantendo Secure por padrão em produção.

## Senhas de usuário (importante)
A tela de administração NÃO tem campo de senha. Por isso o backend define a senha
inicial de novos usuários assim:
- Se `INITIAL_USER_PASSWORD` estiver no .env, é essa a senha inicial (na VM está
  definida). O admin cria o colaborador pela tela e informa essa senha a ele.
- Se estiver vazia, o sistema gera uma senha aleatória, devolvida apenas na resposta
  da API (e nem isso em produção) — na prática a conta ficaria inacessível pela tela.

Orientação: o usuário deve trocar a senha no primeiro acesso (Minha conta). Não existe
troca obrigatória automática.

Para definir a senha de alguém manualmente (uso administrativo, no servidor):
```bash
bash /home/kcj/set-pass.sh usuario@itscs.com.br 'NovaSenha@123'
```
Isso também revoga as sessões ativas daquele usuário.

## Limitações e próximos passos
- Sem HTTPS: para produção real, colocar atrás de proxy com TLS e voltar
  `COOKIE_SECURE=true`.
- A tela de login aceita qualquer senha (dev-login). O endpoint /auth/login valida
  senha real, mas o HTML não a envia; habilitar login real por senha exige alterar o
  frontend (§4.3), o que depende de autorização.
- `ALLOW_DEV_LOGIN=true` deve virar `false` quando o login real por senha estiver ativo.
- Firewall: a porta 3333 está acessível na rede interna. Restringir se necessário.
- Trocar as senhas que foram compartilhadas durante o processo (kcj, root) e a senha
  do usuário de banco, se desejado.

## Revisão da VM em 2026-08-06 (leitura, sem tocar dados)

Verificado com evidência, não por leitura de código:

- **Autenticação em toda a superfície.** As 18 rotas protegidas respondem 401 sem
  sessão: `auth/me`, `bootstrap`, `activities`, `tasks`, `users`, `categories`,
  `projects`, `groups`, `integrations`, `integration-runs`, `search`, os cinco
  relatórios, `sync` e `attachments`. `dev-login` e `dev-accounts` respondem 404,
  porque `ALLOW_DEV_LOGIN=false`. `health/live` e `health/ready` respondem 200.
- **Build igual ao repositório.** Comparação por SHA-256 dos 69 arquivos de
  `backend/dist`: 68 idênticos e o 69º, `search.service.js`, diferindo apenas por 17
  caracteres de retorno de carro. Conteúdo idêntico. Nenhuma alteração fora do git.
- **Cabeçalhos.** CSP, Referrer-Policy `no-referrer`, X-Content-Type-Options
  `nosniff`, X-Frame-Options `SAMEORIGIN`, X-DNS-Prefetch-Control `off`. Sem HSTS,
  correto: o acesso é HTTP e HSTS é condicional por desenho.
- **Rate limit** ativo, 600 por minuto, visível nos cabeçalhos `x-ratelimit-*`.
- **Units systemd** `enabled`, então sobem no boot, e `active`.
- **Busca sem acento funcionando de ponta a ponta.** `dv_norm` presente, `unaccent` e
  `pg_trgm` instaladas, seis índices trigram criados, e a consulta real prova a
  insensibilidade: `questao`, `QUESTÃO` e `questão` encontram a mesma atividade.
- **Outbox drenado.** 61 eventos, todos publicados, nenhum pendente: o worker está
  consumindo.
- **Resumo diário executando.** Job repetido registrado para 18:30 em
  America/Sao_Paulo, duas execuções concluídas e a próxima agendada.
- **Sem erro em 24 horas.** Zero registros de nível 50 ou 60 na API e no worker.
- **Auditoria ativa.** 130 registros, o mais recente no próprio dia da revisão.
- **Nenhum token de redefinição aberto.** 14 usados e 2 expirados.
- **Configuração efetiva:** `NODE_ENV=production`, `ALLOW_DEV_LOGIN=false`,
  `TRUST_PROXY=[]` (nenhum proxy confiável, correto para exposição direta),
  `LOGIN_MAX_ATTEMPTS=10`, `LOGIN_LOCK_MINUTES=15`, `COOKIE_SECURE=false` com
  `ALLOW_INSECURE_COOKIES=true`, que é a exceção explícita exigida para HTTP.

Duas lacunas encontradas, ambas registradas em `IMPLEMENTATION_STATUS.md`: não há
backup do banco agendado, e não há rotina de retenção para sessões, tokens e outbox.

Um job de webhook está parado no conjunto `failed` do BullMQ desde 2026-08-03, com
motivo `DELIVERY_ERROR`. Não é defeito de registro: `delivery.ts` grava a tentativa
em `integration_runs` inclusive quando falha. A tabela está vazia porque as
integrações de teste foram excluídas e a relação tem `onDelete: Cascade`. O que
sobra é higiene: o job permanece na fila indefinidamente e nada o expõe.
