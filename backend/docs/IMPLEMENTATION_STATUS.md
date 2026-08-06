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
- Regressão visual limitada a regiões estáveis; full-page precisa congelar serverNow.
- Anexos: provider S3/MinIO, quarentena/ClamAV, streaming (hoje disco local + buffer).
- Reset de senha por e-mail implementado (SMTP via Nodemailer); depende de SMTP_HOST e
  MAIL_FROM preenchidos no ambiente. Sem isso o pedido é registrado e só vai ao log.
- Resumo diário: o job dispara webhook, mas NÃO envia e-mail. Não há mailer no job.
- Métricas Prometheus: decisão consciente de não implementar agora. Exige
  dependência nova e política de exposição do endpoint, que não pode ser público.
  Observabilidade hoje é log estruturado mais /health/live e /health/ready.
- Teste de contrato do payload de webhook e caracterização retroativa do DV.
- Validação do link de redefinição antes de mostrar o formulário: quem abre link
  expirado preenche a senha duas vezes para só então descobrir.
- Aviso ao titular quando um administrador troca a senha dele.
- ~~`DV.onError` só está registrado em `configuracoes.dc.html`~~ Resolvido em
  2026-08-06: as cinco telas de escrita (`atividades`, `projeto`, `projetos`,
  `usuario`, `configuracoes`) registram o tratador e usam o toast que já possuem.
  Comprovado com recusa real do servidor em cada uma, 403 nas de permissão.
  Telas apenas de leitura (`dashboard`, `pesquisa`, `relatorios`, `colaborador`,
  `colaboradores`) não registram porque não escrevem.
- Defeito corrigido em 2026-08-06, achado ao provar o toast de sucesso: o botão
  "Salvar alterações" de Minha conta nunca funcionou. `DV.user()` publica o cargo
  como `roleTitle` e a tela lê `u.role`, então o campo Cargo vinha vazio e o clique
  quebrava em `f.role.trim()` de undefined. Corrigido em `normalizeUser`, espelhando
  `role` sem remover `roleTitle`. Confirmado em produção pelo responsável em
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
