# Plano: nível de acesso definido apenas por grupo

Objetivo: eliminar a atribuição de nível **direto no usuário**, deixando os **grupos de
acesso** como única fonte do nível efetivo. Corresponde à "opção 2" descrita em
`CONCEITO_NIVEIS_E_GRUPOS.md` (§11).

**Nada foi executado.** Este documento é o plano; a implementação depende de aprovação.

## 1. Situação atual (o que muda)

Hoje dois caminhos escrevem `users.effective_level`:

| Caminho | Arquivo | Comportamento |
| --- | --- | --- |
| Direto no usuário | `src/modules/users/users.service.ts` (`createUser`, `updateUser`) | a aba Usuários define o nível da pessoa |
| Pelo grupo | `src/modules/groups/groups.service.ts` (`recalcLevels`) | ao salvar membros/nível do grupo, recalcula os afetados |

Resultado: a última operação vence, sem aviso. Depois da mudança, **só o segundo caminho
existirá**.

## 2. Decisão de modelagem: manter a coluna `effective_level`

Recomendação: **manter** a coluna, passando a tratá-la como valor derivado, escrito
exclusivamente por `recalcLevels`.

Motivo: o nível é lido em toda requisição (o guarda de autenticação e o JWT o carregam).
Remover a coluna obrigaria um join em `group_members` + `access_groups` a cada chamada, e
também mudaria o payload do token. Ganho conceitual pequeno, custo real alto.

Alternativa (não recomendada agora): remover a coluna e calcular por consulta/VIEW. Só
faz sentido se surgir divergência recorrente de dados.

## 3. Alterações no backend

### 3.1 `src/modules/users/users.routes.ts`
- Remover `level` de `createBody` e, por consequência, de `updateBody`.
- Manter os demais campos (name, role, email, initials, color, active).
- Efeito: `POST /users` e `PATCH /users/:id` deixam de aceitar nível. Se preferir aviso
  explícito em vez de silêncio, validar a presença de `level` e responder `422` com
  código `LEVEL_MANAGED_BY_GROUP`.

### 3.2 `src/modules/users/users.service.ts`
- `createUser`: fixar `effectiveLevel: 'DEV'` (todo usuário nasce dev e sobe ao entrar em
  grupo). Remover o uso de `API_TO_LEVEL[input.level ?? 'dev']`.
- `updateUser`: remover a escrita de `effectiveLevel` e a regra de "rebaixar o último CEO"
  (o rebaixamento passa a ocorrer somente via grupo, onde `ensureCeoRemains` já protege).
- `updateUser`/reativação: ao reativar um usuário (`active: true`), chamar o recálculo a
  partir dos grupos dele, para não reativar com nível defasado.
- `deactivateUser`: **manter** a proteção do último CEO ativo (desativar ainda pode deixar
  a organização sem diretoria).
- Manter `activeCeoCount` (usada pelas duas proteções).

### 3.3 `src/modules/groups/groups.service.ts`
- Extrair `recalcLevels` para uma função reutilizável (ex.: `recalcUserLevels(tx, userIds)`),
  para ser chamada também pelo módulo de usuários na reativação e pela rotina do item 3.4.
- Nenhuma mudança de regra: o nível efetivo continua sendo o maior nível entre grupos
  ativos; sem grupo, `DEV`.

### 3.4 Rotina de reconciliação (novo)
Criar um script (ex.: `prisma/reconcile-levels.ts`) que recalcula o nível de **todos** os
usuários a partir dos grupos e relata divergências. Serve para a migração (item 4) e para
auditoria posterior.

## 4. Migração de dados (passo mais crítico)

Risco central: um usuário que hoje é `GESTOR` ou `CEO` **por atribuição direta** e não
pertence a nenhum grupo equivalente será rebaixado a `DEV` no primeiro recálculo,
podendo deixar a organização **sem nenhum CEO ativo** e sem quem administre.

Ordem obrigatória:
1. **Inventariar**: listar cada usuário ativo com o nível atual e o nível que os grupos
   dariam hoje. Divergências são o trabalho a fazer.
2. **Criar/ajustar grupos** que cubram os níveis existentes (ex.: Diretoria = ceo,
   Liderança = gestor, Desenvolvimento = dev).
3. **Distribuir os membros** conforme o nível atual de cada um.
4. **Validar antes de aplicar**: garantir que existirá pelo menos um CEO ativo após o
   recálculo. Se não existir, abortar.
5. Só então rodar a reconciliação e implantar o código novo.

Estado atual da VM (favorável): `admin` já é ceo pelo grupo Diretoria e `alvaro-lima` é
dev pelo grupo Desenvolvedor. Nenhuma divergência conhecida, mas o inventário deve ser
refeito no momento da migração.

## 5. Alterações no frontend

### 5.1 `assets/data.js` (permitido)
- Em `setPeople`, parar de enviar `level` no corpo de `POST`/`PATCH /users`.
- No sincronismo de grupos, dispensar o `setPeople` que hoje ajusta níveis: o backend já
  recalcula e o `_reloadPeople()` traz os valores corretos.

### 5.2 `configuracoes.dc.html` (exige autorização, §4.3)
- A aba Usuários tem um controle que alterna o nível ciclicamente (dev → gestor → ceo).
  Sem a mudança no HTML ele se torna um **botão morto**: o usuário clica, a interface
  parece mudar e nada persiste. Isso é pior que a ambiguidade atual.
- Ação necessária: remover esse controle e, na coluna de nível, exibir o valor apenas como
  leitura (idealmente com a indicação de que vem do grupo).
- A aba Grupos permanece como está (é ela que passa a governar).

Conclusão importante: **esta mudança não pode ser feita só no backend**. Sem editar o
`configuracoes.dc.html`, a interface fica enganosa.

## 6. Testes a ajustar/criar

Em `tests/integration/admin.test.ts`:
- O teste "não é possível rebaixar o último CEO" (via `PATCH /users`) deixa de fazer
  sentido; substituir por "PATCH /users não altera o nível".
- Manter "não é possível desativar/excluir o último CEO".
- Criar: "usuário novo nasce dev"; "nível muda somente ao entrar/sair de grupo";
  "usuário sem grupo é dev"; "reativar usuário recalcula o nível pelos grupos".
- O teste de grupos (elevar e reverter o nível) continua válido.

E2E: verificar se algum cenário depende de mudar nível pela aba Usuários.

## 7. Documentação a atualizar

`CONCEITO_NIVEIS_E_GRUPOS.md` (§11 passa a descrever a decisão adotada),
`NIVEIS_DE_ACESSO.md`, `adr/ADR-007` (registrar a mudança de decisão),
`API.md` (contrato de `POST`/`PATCH /users` sem `level`),
`GUIA_DO_USUARIO.md` (o nível agora se define pelo grupo).

## 8. Ordem de execução sugerida

1. Inventário e criação/ajuste dos grupos (item 4, passos 1 a 3).
2. Validação de que sobrará CEO ativo (item 4, passo 4).
3. Backend: rotas, serviço de usuários, extração do recálculo, script de reconciliação.
4. `assets/data.js`: parar de enviar `level`.
5. Autorização e edição do `configuracoes.dc.html` (remover o controle de nível).
6. Testes (ajustar e criar), `npm run typecheck`, suíte completa.
7. Rodar a reconciliação em desenvolvimento, validar, depois na VM.
8. Atualizar a documentação e os ADRs.

## 9. Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Ficar sem CEO ativo após o recálculo | validação obrigatória antes de aplicar; abortar se contagem = 0 |
| Usuário perder acesso por não estar em grupo | inventário e distribuição de membros antes do deploy |
| Botão morto na aba Usuários | editar o HTML na mesma entrega (não implantar backend antes) |
| Divergência entre coluna e grupos | script de reconciliação executável a qualquer momento |
| Confusão de operação durante a transição | comunicar que o nível passa a ser gerido só em Grupos |

Rollback: reverter o código (a coluna e os dados continuam válidos, pois o formato não
muda) e, se necessário, reatribuir níveis diretamente no banco.

## 10. Esforço estimado

Backend e `data.js`: pequeno (poucas horas), por serem remoções e uma extração de função.
Migração de dados: depende do número de usuários com nível direto (hoje, zero na VM).
Frontend: pequeno, mas exige autorização. Testes e documentação: moderado.
O maior custo não é código, é a coordenação da migração para ninguém perder acesso.
