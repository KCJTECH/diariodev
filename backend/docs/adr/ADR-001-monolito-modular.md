# ADR-001: Monólito modular

## Contexto
Sistema interno de porte médio, uma equipe, frontend estático já pronto. O prompt
mestre pede modularidade sem complexidade excessiva.

## Decisão
Monólito modular: um processo de API e um de worker, mesmo código. Módulos por
domínio, com camadas apenas onde há lógica real. Sem microsserviços.

## Consequências
Menos operação e latência entre serviços; deploy simples. A separação por módulos
mantém o código organizado e testável. Se um dia houver necessidade, um módulo pode
ser extraído. O worker já é um processo separado, o que facilita escalar filas.
