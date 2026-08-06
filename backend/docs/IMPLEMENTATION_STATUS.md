# Status de implementação

## Concluído
- Fundação, banco (16 tabelas + seed), auth/autorização, domínio completo, realtime,
  webhooks + resumo diário, integração do frontend, anexos.
- Testes: 52 verdes (20 unit, 6 contrato, 19 integração, 9 E2E incluindo regressão
  visual). typecheck 0. Carga básica medida.
- Documentação, OpenAPI e ADRs.
- Docker (Dockerfile + docker-compose).

## Aceite (§36): atendido
Frontend intacto, dados do backend, getters síncronos, datas reais, persistência,
logout limpa sessão, sessão expirada tratada. Permissões no servidor, CRUD de
atividades/tarefas, conclusão transacional, usuários, categorias com histórico,
projetos, grupos recalculam nível, integrações, anexos protegidos, relatórios e
pesquisa com escopo, auditoria, health. Realtime com salas e sync. Segurança conforme
SEGURANCA.md. Qualidade: typecheck e testes verdes.

## Auditoria de 2026-08-06

Revisão completa contra o documento de requisitos, executada em quatro ondas, cada
uma com bateria verde, commit próprio e deploy com GO explícito.

Fechado na onda 1: cinco caminhos de escalonamento de privilégio, três verticais
(nível por PATCH de usuário, nível por grupo com autoinclusão, criação de conta
CEO por gestor) e dois horizontais (conclusão de tarefa alheia por `sourceTaskId`,
participação auto-declarada em projeto alheio). Modelo de autorização no ADR-009.

Fechado na onda 2: sessão revogada deixa de autorizar na hora e derruba socket;
bloqueio de força bruta por conta; `trustProxy` restrito; rate limit global;
cookie sem Secure em produção exige declaração.

Fechado na onda 3: CSP ligada, com limitação registrada em SEGURANCA.md; SSRF por
IPv4 embutido em IPv6; segredo do webhook fora do header; aparência sem chave
livre; id interno fora do DTO de pessoa; e-mail de terceiro oculto para dev;
permissões efetivas no bootstrap; busca sem acento com `unaccent` e `pg_trgm`;
janela do bootstrap com número verdadeiro.

Fechado na onda 4: `eslint.config.js` criado (o `npm run lint` nunca havia rodado
neste projeto, faltava o arquivo de configuração e o ESLint 9 exige o formato
flat); 87 arquivos analisados sem problema; dependências `@fastify/swagger` e
`@fastify/swagger-ui` removidas por nunca terem sido registradas.

## Pendências
- **Sem backup do banco em produção.** Revisão da VM em 2026-08-06: nada em
  `/etc/cron.d`, `/etc/cron.daily`, `/etc/cron.hourly`, `/etc/cron.weekly`, nenhum
  timer systemd de dump, nenhum arquivo `.sql` ou `.dump` no host e nenhum crontab
  do usuário da aplicação. O único timer de backup é o `dpkg-db-backup` do próprio
  Debian, que salva o banco de pacotes do sistema, não o nosso. Existe procedimento
  escrito em `BACKUP_E_RESTAURACAO.md`, mas nada executa. Hoje o banco tem 9,4 MB,
  9 usuários, 130 registros de auditoria e nenhum anexo, então a perda seria pequena
  em volume e total em histórico. Instalar timer exige root.
- **Sem rotina de retenção.** Não existe nenhum `deleteMany` em `src/jobs` nem em
  `src/workers`: sessões revogadas e eventos de outbox já publicados nunca são
  removidos. Na VM: 50 sessões revogadas de 84 e 61 eventos de outbox todos
  publicados. Irrelevante no volume atual, mas o crescimento não tem limite por
  desenho. (Os tokens de redefinição saíram do problema junto com a tabela.)
- Regressão visual limitada a regiões estáveis; full-page precisa congelar serverNow.
- Anexos: provider S3/MinIO, quarentena/ClamAV, streaming (hoje disco local + buffer).
- **Não existe recuperação de acesso por autoatendimento.** O fluxo "Esqueci minha
  senha" foi removido em 2026-08-06 a pedido do responsável: saíram as três rotas de
  redefinição por token, a tabela `password_reset_tokens`, o mailer e a dependência
  `nodemailer`. Quem perder a senha depende de alguém de nível superior definir uma
  nova em `POST /users/:publicKey/password`, pela tela de administração. Se a conta de
  nível mais alto perder o acesso, a saída é definir a senha direto no servidor, com
  acesso ao banco. Consequência aceita conscientemente pelo responsável.
- Resumo diário: o job dispara webhook, e não envia e-mail. Com a remoção do mailer,
  enviar e-mail no resumo exigiria reintroduzir `nodemailer` e as variáveis SMTP.
- Métricas Prometheus: decisão consciente de não implementar agora. Exige
  dependência nova e política de exposição do endpoint, que não pode ser público.
  Observabilidade hoje é log estruturado mais /health/live e /health/ready.
- Teste de contrato do payload de webhook e caracterização retroativa do DV.
- Aviso ao titular quando um administrador troca a senha dele.
- Frontend do "Esqueci minha senha" continua no `index.html` e no `assets/data.js`,
  chamando rotas que não existem mais. Remover exige tocar arquivo protegido pelo
  §4.1, portanto autorização explícita. Enquanto não for removido, quem clicar no
  link recebe erro.
- ~~`DV.onError` só está registrado em `configuracoes.dc.html`~~ Resolvido em
  2026-08-06: as cinco telas de escrita (`atividades`, `projeto`, `projetos`,
  `usuario`, `configuracoes`) registram o tratador e usam o toast que já possuem.
  Comprovado com recusa real do servidor em cada uma, 403 nas de permissão.
  Telas apenas de leitura (`dashboard`, `pesquisa`, `relatorios`, `colaborador`,
  `colaboradores`) não registram porque não escrevem.
- Banco de desenvolvimento local está atrás do da VM: a migration
  `20260806120000_busca_sem_acento` não foi aplicada, então `dv_norm` e as extensões
  `unaccent`/`pg_trgm` não existem e `GET /search` responde 500 para termo com três
  letras ou mais. Não afeta a VM, onde a função, as extensões e os seis índices
  trigram estão no lugar e `dv_norm('Ação de Manutenção')` devolve
  `acao de manutencao`. `npx prisma migrate deploy` local falha em
  `CREATE EXTENSION` por falta de privilégio: o usuário da aplicação é
  `diariodev_app` e criar extensão exige superusuário do Postgres, o mesmo que foi
  necessário na VM. Pendente decidir se a busca deve degradar para `ILIKE` em vez de
  responder 500 quando a função não existir, o que hoje transforma ambiente novo em
  tela de pesquisa quebrada até alguém com privilégio rodar a migration.
- Na VM, `_prisma_migrations` tem duas linhas para
  `20260806120000_busca_sem_acento`, resíduo da correção do SQL que resolvia o
  schema do dicionário em tempo de execução. Inofensivo para `migrate deploy`, que
  considera aplicada, mas suja `migrate status`. Limpeza opcional.
- Defeito corrigido em 2026-08-06, achado ao provar o toast de sucesso: o botão
  "Salvar alterações" de Minha conta nunca funcionou. `DV.user()` publica o cargo
  como `roleTitle` e a tela lê `u.role`, então o campo Cargo vinha vazio e o clique
  quebrava em `f.role.trim()` de undefined. Corrigido em `normalizeUser`, espelhando
  `role` e `ini` sem remover `roleTitle` nem `initials`. O `ini` era o mesmo defeito
  na terceira ocorrência: o avatar do próprio usuário ficava sem iniciais em Minha
  conta e em Relatórios, porque as duas telas leem `u.ini` e o DTO do servidor envia
  `initials`. Achado por varredura dos campos que cada tela lê do usuário da sessão,
  não por acaso. Confirmado em produção pelo responsável em
  2026-08-06: o campo Cargo aparece preenchido e o salvamento conclui. Fica o
  alerta: divergência de nome entre o DTO do servidor e o que a tela lê não aparece
  em teste de backend, nem de contrato, nem de tipo. Só aparece clicando.
- Verificação do bloco "Trocar de usuário" oculto: comprovada no navegador com a
  flag ligada (o bloco aparece, que é o correto) e comprovada no servidor da VM que
  a flag está desligada. A observação direta do bloco ausente em produção exige
  login com senha real, que não foi feito.

## Bloqueios de frontend (§4.3) — resolvidos em 2026-08-06 com autorização explícita
Os quatro foram fechados. Alteração em `*.dc.html` feita pelo procedimento do §4.3:
bloqueio documentado, alteração mínima apresentada, autorização recebida. Os dois
testes de regressão visual continuam passando, o que prova que a aparência não mudou.

- Anexos: era o único dos quatro que representava funcionalidade ausente. O HTML
  convertia o arquivo em nome e tamanho e descartava o objeto `File`, então nada
  chegava ao servidor, e abrir anexo era um stub. Hoje `onPickFiles` guarda o `File`,
  o commit envia depois de o servidor confirmar o registro, e o download é
  autenticado por `fetch` com blob, porque o arquivo fica fora da pasta pública.
  Para isso `DV.create` passou a expor `saved`, promessa que resolve com o registro
  confirmado. É adição, não troca de contrato (§8.3): o retorno síncrono continua
  sendo o registro otimista.
- Menu por permissão: `Configurações` sai para quem não administra, via
  `canAdminister`. Resolvido em `assets/data.js`, sem tocar HTML, porque o menu vem
  de `DV.NAV`. Correção da caracterização anterior: o item **Auditoria não era
  bloqueio**. Ele aponta para a tela de pesquisa, que respeita escopo e devolve só o
  que a pessoa pode ver, portanto é legítimo para nível dev.
- Escrita recusada deixa de reverter em silêncio: `configuracoes.dc.html` registra
  `DV.onError` e mostra o motivo no aviso visual que a tela já tem. As outras telas
  de escrita ainda não registram: pendência abaixo.
- Bloco "Trocar de usuário": o bootstrap informa `devLoginAllowed` e a tela esconde o
  bloco quando o recurso está desligado, como na VM, onde dev-login responde 404.

## Não implementar
- Aba "Estados" não persiste nada (§23): sem tabela nem endpoint.
- Endpoint de consulta de auditoria: o item "Auditoria" do menu aponta para a tela
  de pesquisa, nenhuma tela consome log de auditoria e §17 não especifica esse
  endpoint. Construir seria inventar comportamento não representado na interface,
  que §38 proíbe. A escrita de auditoria existe e está completa, que é o que §36
  exige.
