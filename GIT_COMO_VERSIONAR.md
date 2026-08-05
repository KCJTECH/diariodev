# Como colocar este projeto no Git

Guia de referência. Nada foi executado: nenhum repositório foi criado, nenhum arquivo
foi versionado. Você decide quando e se rodar os comandos.

Levantamento feito em 2026-08-04 nesta pasta:
- Git instalado: versão 2.55.0 (Windows). OK.
- A pasta **ainda não é** um repositório Git (não existe `.git`).
- Já existe `backend/.gitignore` e `.dockerignore`.
- **Falta um `.gitignore` na raiz** (é o item mais importante antes do primeiro commit).

## 1. O que NÃO pode ir para o Git

Encontrei nesta pasta:

| Item | Por quê não versionar |
| --- | --- |
| `backend/.env` | **Contém segredos** (senha do banco, JWT, chave de criptografia). Crítico. |
| `backend/node_modules` (452 MB) | Dependências reinstaláveis com `npm ci`. |
| `backend/dist` | Resultado do build, gerado por `npm run build`. |
| `backend/storage` | Anexos enviados pelos usuários (dados, não código). |
| `backend/test-results`, `backend/playwright-report` | Saída de teste. |
| `uploads`, `screenshots` | Material de apoio/prints; versione só se realmente quiser. |

O que **deve** ir: o frontend (`*.dc.html`, `assets/`, `support.js`), todo o `backend/src`,
`backend/prisma` (schema, migrations e seed), `backend/tests`, `backend/docs`,
`package.json` e `package-lock.json`, `Dockerfile`, `docker-compose.yml`, `.env.example`,
e os documentos da raiz.

## 2. Criar o `.gitignore` da raiz

Antes de qualquer commit, crie o arquivo `.gitignore` na raiz do projeto com:

```gitignore
# dependências e build
**/node_modules/
backend/dist/

# segredos e ambiente
.env
.env.*
!.env.example

# dados de execução
backend/storage/
backend/logs/
logs/

# saída de teste
backend/test-results/
backend/playwright-report/
backend/tests/e2e/*-snapshots/*.tmp.png

# sistema e editor
*.log
Thumbs.db
.DS_Store
.vscode/
.idea/

# pacotes locais
*.tgz
```

Sobre as baselines de regressão visual (`backend/tests/e2e/*-snapshots/*.png`): elas
**devem** ser versionadas, senão os testes visuais não têm referência de comparação.

## 3. Verificar se há segredo antes do primeiro commit

Depois de criar o `.gitignore`, confira que o `.env` está fora:

```bash
cd "C:\Projeto Node\Diario Dev ITS app"
git init
git add -A
git status --short | Select-String "\.env"     # (PowerShell) não deve retornar nada
git check-ignore -v backend/.env               # deve dizer que está ignorado
```

Se o `.env` aparecer, **não faça o commit**: ajuste o `.gitignore` e rode
`git rm --cached backend/.env`.

Segredos que já circularam por fora do repositório (senhas da VM, do banco e a senha de
usuários) devem ser trocados de qualquer forma, e nunca entrar no repositório.

## 4. Primeiro commit

```bash
git init
git branch -M main
git config user.name "Seu Nome"
git config user.email "seu.email@itscs.com.br"
git add -A
git commit -m "feat: diario dev com backend fastify, prisma e realtime

Backend em monolito modular (Fastify, TypeScript estrito, Prisma/PostgreSQL,
Socket.IO, BullMQ) integrado ao frontend existente pela camada window.DV,
sem alterar as telas. Inclui testes, documentacao e deploy."
```

## 5. Enviar para um servidor remoto

### Opção A: GitHub/GitLab (repositório privado)
Crie o repositório **vazio e privado** no site e depois:

```bash
git remote add origin https://github.com/SUA-ORG/diario-dev.git
git push -u origin main
```

Na primeira vez o Git pede autenticação. Em GitHub use um **Personal Access Token**
(Settings → Developer settings → Tokens) no lugar da senha, ou instale o GitHub CLI
(`gh auth login`).

### Opção B: servidor Git interno da ITS (por SSH)
Se houver um servidor interno, crie um repositório vazio nele e:

```bash
git remote add origin ssh://usuario@servidor:/caminho/diario-dev.git
git push -u origin main
```

### Opção C: repositório bare na própria VM (simples, sem serviço extra)
Na VM (10.70.1.135), uma vez:
```bash
mkdir -p ~/repos/diario-dev.git && cd ~/repos/diario-dev.git && git init --bare
```
No Windows:
```bash
git remote add origin ssh://kcj@10.70.1.135/home/kcj/repos/diario-dev.git
git push -u origin main
```
Como já existe acesso por chave SSH, o push não pede senha.

## 6. Fluxo do dia a dia

```bash
git status                     # o que mudou
git add -A                     # ou: git add caminho/do/arquivo
git commit -m "fix: corrige X"
git push
```

Convenção de mensagens (Conventional Commits, em português):
`feat:` nova funcionalidade · `fix:` correção · `docs:` documentação ·
`refactor:` refatoração · `test:` testes · `chore:` build/config.
Assunto no imperativo, até 72 caracteres. Em mudanças não triviais, explique no corpo
o motivo da mudança.

## 7. Depois do Git: deploy por `git pull` (opcional)

Hoje o deploy na VM é por envio de arquivos. Com o repositório pronto, dá para fazer:

```bash
# na VM, uma vez
cd ~ && git clone ssh://... diariodev-git
# nas atualizações
cd ~/diariodev && git pull && cd backend && npm ci && npm run build
# reiniciar os serviços (ver docs/DEPLOY_VM_10.70.1.135.md)
```

Atenção: o `.env` da VM **não** vem do repositório (é ignorado, e deve ser assim). Ele
permanece no servidor e é mantido manualmente.

## 8. Antes de cada commit, confirme

- O `.env` não está sendo versionado.
- Nenhuma senha, token ou chave em código, teste, script ou documento.
- Nenhum dump de banco nem binário solto.
- Os arquivos `*.dc.html` e `assets/theme.css`: qualquer alteração neles é intencional
  e autorizada (a regra do projeto é preservá-los; hoje só o `login.dc.html` foi
  alterado, com autorização, para o login real por senha).
- `npm run typecheck` e os testes passam.
