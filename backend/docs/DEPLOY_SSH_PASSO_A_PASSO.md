# Deploy via SSH, passo a passo (Windows)

Guia para VOCÊ executar no seu PowerShell. Servidor destino: 10.70.1.135, usuário kcj.
O PostgreSQL sobe em contêiner pelo Docker (não precisa instalar na mão). Onde pedir
senha, é você quem digita.

## Pré-requisitos
- Windows 10/11 com OpenSSH (ssh, scp) e tar nativos (já confirmado nesta máquina).
- No servidor: acesso do usuário kcj e permissão de administrador (su/sudo) para instalar
  o Docker, caso ainda não exista.

## Passo 1 — Testar a conexão SSH
No PowerShell:
```powershell
ssh kcj@10.70.1.135
```
Digite a senha do kcj quando pedir. Se entrar, você está no servidor. Rode `exit` para
voltar ao Windows e siga para o Passo 2. Na primeira conexão o SSH pergunta se confia na
chave do host: responda yes.

## Passo 2 — Gerar os segredos (no Windows)
No PowerShell (o Node já está instalado aqui):
```powershell
node -e "for (const k of ['COOKIE_SECRET','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET']) console.log(k+'='+require('crypto').randomBytes(48).toString('base64url')); console.log('ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('base64'))"
```
Copie as 4 linhas geradas; você vai colar no .env do servidor no Passo 6.

## Passo 3 — Empacotar o projeto (no Windows)
```powershell
cd "C:\Projeto Node"
tar --exclude="Diario Dev ITS app/backend/node_modules" --exclude="Diario Dev ITS app/backend/dist" --exclude="Diario Dev ITS app/backend/.env" -czf diariodev.tgz "Diario Dev ITS app"
```
Isso cria diariodev.tgz sem node_modules nem segredos.

## Passo 4 — Enviar para o servidor (no Windows)
```powershell
scp "C:\Projeto Node\diariodev.tgz" kcj@10.70.1.135:~/
```
Digite a senha do kcj.

## Passo 5 — Conectar e verificar o Docker (no servidor)
```powershell
ssh kcj@10.70.1.135
```
Já no servidor (Linux):
```bash
docker --version
```
- Se mostrar a versão, o Docker existe. Pule para o Passo 6.
- Se der "command not found", instale o Docker (última versão estável) com o script oficial.
  Isso exige administrador; use su ou sudo (você digita a senha):
```bash
su -                      # entre como root (digite a senha de root)
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
usermod -aG docker kcj    # deixa o kcj usar docker sem sudo
exit                      # sai do root
exit                      # sai do SSH
```
Depois reconecte para o grupo docker valer:
```powershell
ssh kcj@10.70.1.135
```

## Passo 6 — Descompactar, configurar e implantar (no servidor)
```bash
mkdir -p ~/diariodev
tar -xzf ~/diariodev.tgz -C ~/diariodev --strip-components=1
cd ~/diariodev/backend
cp .env.example .env
nano .env
```
No .env, faça o mínimo:
- Cole as 4 linhas de segredos geradas no Passo 2 (substituindo os CHANGE_ME).
- Defina a origem real de acesso:
  `APP_ORIGIN=http://10.70.1.135:3333`
- Habilite o login de protótipo (a tela aceita qualquer senha; login real por senha
  exigiria alterar o HTML):
  `ALLOW_DEV_LOGIN=true`
Salve (Ctrl+O, Enter) e saia (Ctrl+X). Então rode o deploy:
```bash
bash deploy.sh
```
O deploy.sh sobe API, worker, PostgreSQL, Redis e MinIO em contêiner, aplica as migrations
e faz o healthcheck. Ao final, mostra o endereço.

## Passo 7 — (Opcional) Popular dados de demonstração
Somente se quiser dados de exemplo (não é para produção):
```bash
docker compose exec -e NODE_ENV=development api node dist/prisma/seed.js
```

## Passo 8 — Acessar
No navegador: `http://10.70.1.135:3333/`
Entre com um e-mail cadastrado (ex.: seu usuário) e qualquer senha (modo protótipo).

## Verificações e problemas
- Saúde: `curl http://10.70.1.135:3333/health/ready` deve retornar status ok.
- Ver logs: `docker compose logs -f api` e `docker compose logs -f worker`.
- Escrita bloqueada (403 origem): confirme APP_ORIGIN igual ao endereço usado no navegador.
- Porta 3333 fechada por firewall: libere no servidor (ex.: `sudo ufw allow 3333`).
- Reiniciar tudo: `docker compose down` e depois `bash deploy.sh`.
- Banco externo em vez do contêiner: ajuste DATABASE_URL/REDIS_URL no docker-compose.yml.

## Segurança
Troque as senhas do kcj e do root que foram compartilhadas. Em produção real, use
NODE_ENV=production, ALLOW_DEV_LOGIN=false e login por senha (ver limitação de HTML, §4.3),
segredos fortes e a porta atrás de proxy/HTTPS.
