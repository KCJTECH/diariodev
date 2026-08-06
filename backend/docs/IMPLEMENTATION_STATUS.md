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

## Bloqueios de frontend (§4.3, exigem autorização para tocar HTML)
- Upload/download de anexo pela tela (o HTML descarta o objeto File; o backend existe).
- Tela de Configurações e item Auditoria aparecem para nível dev, que não pode usar
  nenhuma das ações: nenhuma tela consulta `canAdminister`, que o bootstrap envia.
- Escrita recusada pelo servidor reverte em silêncio: `notifyError` só escreve no
  console e nenhuma tela registra `DV.onError`, então o usuário vê a alteração
  aplicar e voltar sozinha, sem explicação.
- Bloco "Trocar de usuário" em usuario.dc.html depende de dev-login, que responde
  404 em produção.

## Não implementar
- Aba "Estados" não persiste nada (§23): sem tabela nem endpoint.
- Endpoint de consulta de auditoria: o item "Auditoria" do menu aponta para a tela
  de pesquisa, nenhuma tela consome log de auditoria e §17 não especifica esse
  endpoint. Construir seria inventar comportamento não representado na interface,
  que §38 proíbe. A escrita de auditoria existe e está completa, que é o que §36
  exige.
