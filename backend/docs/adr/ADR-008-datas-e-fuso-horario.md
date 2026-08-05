# ADR-008: Datas e fuso horário

## Contexto
O protótipo usava uma data fixa e offsets em dias. O sistema real precisa de datas
corretas e de comparações de dia por fuso.

## Decisão
Armazenar instantes em UTC (timestamptz). Fuso da organização America/Sao_Paulo. O
/bootstrap devolve serverNow e timezone. O adaptador do frontend converte occurredAt
em d (offset de dias), t (HH:mm) e dur (texto). Comparações de dia usam a data civil
no fuso (Intl/date_trunc), nunca dividindo milissegundos por 86.400.000. Atrasada é
due_date menor que a data civil de hoje no fuso e não concluída.

## Consequências
Datas corretas e estáveis independentemente da data do cliente. O adaptador assume que
o fuso da máquina coincide com o da organização para os cálculos locais de exibição;
em ambientes com fuso diferente, isso deve ser revisto. Agregações por dia sao feitas
em SQL com date_trunc no fuso.
