# Troubleshooting

## Configuração de ambiente inválida (no boot)
env.ts valida as variáveis com Zod e lista os nomes com problema. Preencha o .env
(DATABASE_URL, REDIS_URL, APP_ORIGIN e segredos).

## /health/ready retorna 503
database ou redis fora. Confira se o PostgreSQL e o Redis estão no ar e se as URLs
estão corretas. Em Windows, o Redis pode ser o Memurai.

## 401 ao usar a API pelo navegador
Sessão expirada ou ausente. O frontend tenta refresh automático; se falhar, faz login.
Pela API direta, faça login e reenvie os cookies.

## 403 Origem não permitida
A mutação veio de uma origem fora da allowlist. Sirva o frontend na mesma origem da
API ou ajuste APP_ORIGIN.

## 409 VERSION_CONFLICT
Duas edições concorrentes da mesma atividade/tarefa. Recarregue e edite de novo.

## 409 LAST_CEO
Tentou rebaixar/desativar o último diretor ativo, ou esvaziar o grupo que o mantém.
Promova outro diretor antes.

## Upload recusado (422)
Extensão fora da lista, tipo real incompatível com a extensão, executável, arquivo
vazio ou acima do limite. Ver ANEXOS.md.

## Webhook não entregue (status FAILED/DEAD)
Endpoint inacessível, bloqueado por SSRF (IP privado sem allowlist) ou retornou erro.
Verifique integration_runs (código, erro) e WEBHOOK_ALLOWED_HOSTS para hosts internos.

## prisma migrate dev trava (ambiente não interativo)
Use npx prisma migrate dev --create-only e depois npx prisma migrate deploy. Se
houver erro de advisory lock, encerre processos schema-engine órfãos.

## Erro de schema em SQL cru
O SQL usa nomes de tabela sem qualificar o schema (o Prisma resolve pelo search_path
da conexão). Garanta o parâmetro ?schema= na DATABASE_URL.

## Fila BullMQ
Nomes de fila não podem conter dois-pontos. As filas são dv-webhooks e dv-daily.

## Windows/PowerShell
Ao testar com curl, corpos com acento podem corromper o Content-Length; prefira enviar
o corpo por arquivo (--data-binary @arquivo) ou usar o navegador.
