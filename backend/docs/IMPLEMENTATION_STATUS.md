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

## Pendências
- Regressão visual limitada a regiões estáveis; full-page precisa congelar serverNow.
- Anexos: provider S3/MinIO, quarentena/ClamAV, streaming (hoje disco local + buffer).
- Reset de senha e resumo por e-mail dependem de SMTP configurado.
- Métricas Prometheus (observabilidade além de logs e health).
- Extensões pg_trgm/unaccent para busca sem acento.
- Socket em sessão revogada não desconecta em tempo real (cai no fim do access token).
- Teste de contrato do payload de webhook e caracterização retroativa do DV.

## Bloqueios de frontend (§4.3, exigem autorização para tocar HTML)
- Upload/download de anexo pela tela (o HTML descarta o objeto File; o backend existe).
- Login real por senha (a tela aceita qualquer senha via dev-login; o backend valida
  senha real em /auth/login).

## Não implementar
- Aba "Estados" não persiste nada (§23): sem tabela nem endpoint.
