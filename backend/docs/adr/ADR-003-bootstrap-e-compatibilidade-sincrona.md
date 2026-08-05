# ADR-003: Bootstrap e compatibilidade síncrona do DV

## Contexto
As telas leem dados do DV de forma síncrona e não podem ser alteradas. HTTP é
assíncrono. As telas fazem polling por window.DV antes de renderizar.

## Decisão
Aproveitar o polling: só publicar window.DV depois que o bootstrap (GET /bootstrap)
hidratar um cache em memória. Os getters continuam síncronos, lendo do cache. Login
de protótipo usa uma ponte em localStorage (dv.session.pending) porque a tela navega
logo após setUser; a próxima página autentica antes do bootstrap. Sem XHR síncrono e
sem monkey patch.

## Consequências
Preserva o contrato do DV sem tocar em HTML. Há um pequeno atraso até o primeiro
paint (uma ida ao servidor), mitigado por snapshot de tema/marca. Alterações otimistas
mantêm a fluidez das escritas.
