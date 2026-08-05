# ADR-002: Autenticação e sessões

## Contexto
Multiusuário, cookies httpOnly, sem tokens no localStorage. Precisa de revogação e
proteção contra reuso de refresh.

## Decisão
Access token JWT curto (HS256, assinado e verificado com algoritmo fixo) em cookie
httpOnly. Refresh opaco, guardado só como hash na tabela sessions, com rotação a cada
uso e detecção de reuso (revoga todas as sessões do usuário ao detectar). CSRF por
validação de Origin nas mutações. Argon2id para senhas.

## Consequências
Verificação de access sem consulta ao banco (rápida), mas revogação imediata só no
refresh; o access de vida curta limita a janela. Sessões auditáveis e revogáveis. Um
socket já aberto de sessão revogada só cai no fim do access (endurecimento previsto).
