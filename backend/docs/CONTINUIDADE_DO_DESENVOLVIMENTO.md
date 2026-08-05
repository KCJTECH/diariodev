# Continuidade do desenvolvimento

## Como criar um novo módulo
Em src/modules/<nome>, crie service (regras + Prisma), routes (validação Zod +
guardas) e, se necessário, mapper e policy. Registre as rotas em src/app.ts com um
prefixo próprio. Siga o padrão dos módulos existentes.

## Como criar uma rota
Use z.parse para validar body/query/params. Aplique app.authenticate e, se preciso,
app.requireLevel. Responda com ok/paginated (envelope). Lance AppError para erros de
domínio; o handler central formata a resposta.

## Como criar uma migration
```
npx prisma migrate dev --name <nome>
```
Revise o SQL em prisma/migrations. Índices parciais ou SQL específico podem ser
acrescentados manualmente ao migration.sql. Aplique em HML/produção com migrate deploy.
Observação em ambiente não interativo: migrate dev pode travar; use --create-only e
depois migrate deploy, ou autore o migration.sql à mão.

## Como adicionar um evento Socket.IO
Grave o evento na outbox dentro da transação (writeOutbox) com aggregate e scope.
Ajuste eventRooms (src/modules/realtime/rooms.ts) para rotear o novo evento. O
publicador cuida da entrega. No cliente, trate o novo event em data.js (_applyEvent).

## Como adicionar uma integração (evento de webhook)
Mapeie o evento interno para o externo em webhook/events.ts. O despacho e o worker já
tratam entrega, assinatura, SSRF e retries.

## Como adicionar um teste
Unitário: em tests/unit, importe a função pura. Integração: use buildApp e app.inject
contra o banco de teste; rode test:setup-db antes. E2E: tests/e2e com Playwright.

## Convenções
Português em comentários e mensagens; identificadores em inglês. TypeScript estrito,
sem any sem justificativa. Arquivos enxutos. Não confie em level/who do cliente.
Preserve o contrato do DV no frontend.

## Pontos de extensão
Storage (novo provider em src/common/storage), providers de e-mail (SMTP), métricas,
novos relatórios (agregação em SQL), novos tipos de integração.

## Cuidados com o contrato DV
Não remova nem altere assinaturas/formatos dos métodos do DV. Getters devem continuar
síncronos. Datas dependem de serverNow e do fuso.

## Dívida técnica e riscos conhecidos
Ver IMPLEMENTATION_STATUS.md e a seção de pendências. Principais: socket em sessão
revogada, provider S3 de anexos, SMTP, métricas Prometheus, e as limitações de HTML
para anexo e login por senha na tela.
