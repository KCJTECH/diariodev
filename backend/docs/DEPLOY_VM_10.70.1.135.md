# Deploy realizado — VM 10.70.1.135

Registro do deploy executado em 2026-08-04. Sistema no ar e validado.

## Acesso
- Aplicação: http://10.70.1.135:3333/login.dc.html
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

# reiniciar manualmente
cd /home/kcj/diariodev/backend
pkill -f 'dist/src/server.js'; pkill -f 'dist/src/workers/index.js'
setsid nohup node dist/src/server.js        > ../logs/api.log    2>&1 < /dev/null &
setsid nohup node dist/src/workers/index.js > ../logs/worker.log 2>&1 < /dev/null &
```

## Pendente: iniciar automaticamente no boot (exige root)
Os arquivos de serviço já estão no servidor em /home/kcj/. Instale como root:
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
- Acesso externo: porta 3333 alcançável; login.dc.html HTTP 200; assets/data.js 200
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
