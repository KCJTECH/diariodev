# ADR-007: Níveis e grupos de acesso

## Contexto
Usuários podem estar em mais de um grupo, e cada grupo tem um nível e permissões. O
frontend deriva o nível efetivo da pessoa.

## Decisão
Regra determinística: o nível efetivo do usuário é o MAIOR nível entre seus grupos
ativos; sem grupo, dev. As permissões efetivas sao a união das permissões dos grupos
ativos. Regras de segurança obrigatórias não podem ser anuladas por permissões
customizadas. Salvar membros ou o nível de um grupo recalcula os usuários afetados na
mesma transação. O último CEO ativo é protegido.

## Consequências
Comportamento previsível ao combinar grupos. O recálculo é transacional e coerente
com o realtime (permissions.changed). Uma alteração de nível direta no usuário pode
ser sobreposta por um recálculo de grupo, o que é aceitável e documentado.
