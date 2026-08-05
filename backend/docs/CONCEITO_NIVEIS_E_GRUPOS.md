# Níveis de acesso e grupos de acesso: o que são e como funcionam

Documento conceitual. Para a matriz detalhada de permissões por módulo, ver
`NIVEIS_DE_ACESSO.md`. Para a decisão de arquitetura, ver `adr/ADR-007`.

## Resumo em uma frase
**Nível de acesso** é o quanto uma pessoa pode ver e fazer no sistema; **grupo de
acesso** é a forma de organizar pessoas e atribuir esse nível a várias delas de uma vez.

## 1. Nível de acesso

É a classificação de poder de cada usuário. Existem exatamente três, e são fixos no
sistema (não é possível criar um quarto nível pela tela):

| Nível | Nome na interface | Para quem |
| --- | --- | --- |
| `dev` | Desenvolvedor | Quem registra o próprio trabalho |
| `gestor` | Gestor | Quem acompanha a equipe e administra o sistema |
| `ceo` | Diretoria | Quem acompanha a equipe e vê a visão executiva |

São hierárquicos: `dev` (1) < `gestor` (2) < `ceo` (3). Quem tem nível maior faz tudo
o que o menor faz.

O que muda na prática:

- **dev**: registra atividades para si; edita e exclui apenas as próprias; nas telas
  gerais vê somente os próprios registros; vê apenas os projetos em que participa
  (participa quem tem atividade ou tarefa nele); dentro de um projeto permitido, vê a
  timeline coletiva daquele projeto; conclui as tarefas atribuídas a ele. Não cria nem
  atribui tarefas e não acessa nenhuma administração.
- **gestor**: vê as atividades de toda a equipe; cria, atribui e edita tarefas;
  administra usuários, categorias, projetos, grupos e integrações; acessa relatórios de
  equipe (por pessoa, heatmap, matriz projeto × categoria).
- **ceo**: tudo do gestor, mais a visão executiva dos relatórios (evolução semanal,
  carteira de projetos, projetos parados, alertas).

Ponto importante: mesmo um gestor ou ceo **não edita a atividade de outra pessoa**.
Registro de diário é pessoal; a hierarquia dá visibilidade, não autoria.

## 2. Grupo de acesso

É um conjunto de pessoas com um nível em comum. Um grupo tem:

- **nome** (ex.: "Diretoria", "Desenvolvedor")
- **descrição**
- **nível** (`dev`, `gestor` ou `ceo`) — é isso que o grupo concede a quem está nele
- **permissões** (lista de rótulos, ex.: `registrar.atividade`, `ver.equipe`) — ver §5
- **membros** (os usuários que pertencem a ele)

O grupo existe para administrar em escala: em vez de ajustar o nível de dez pessoas uma
a uma, você coloca as dez em um grupo e define o nível ali.

## 3. Como os dois se combinam: o nível efetivo

O nível que vale para uma pessoa é chamado de **nível efetivo**, e é calculado assim:

> Nível efetivo = **o maior nível** entre todos os grupos ativos de que a pessoa
> participa. Sem nenhum grupo, o nível é `dev`.

Exemplos:

| Situação | Nível efetivo |
| --- | --- |
| Só no grupo Desenvolvimento (`dev`) | dev |
| Nos grupos Desenvolvimento (`dev`) e Liderança (`gestor`) | **gestor** (o maior) |
| Nos grupos Liderança (`gestor`) e Diretoria (`ceo`) | **ceo** (o maior) |
| Em nenhum grupo | dev |

O recálculo é **automático e imediato**: ao salvar os membros de um grupo, ou ao mudar o
nível do grupo, o sistema recalcula o nível de todos os usuários afetados na mesma
operação (transação). Quem entrou num grupo de nível maior passa a ter aquele nível na
hora; quem saiu volta ao nível que os grupos restantes concedem.

## 4. Estado atual do sistema (VM, 2026-08-04)

| Usuário | Nível efetivo | Grupo |
| --- | --- | --- |
| admin (admin@itscs.com.br) | ceo | Diretoria |
| alvaro-lima (alvaro.lima@itscs.com.br) | dev | Desenvolvedor |

| Grupo | Nível | Membros |
| --- | --- | --- |
| Diretoria | ceo | admin |
| Desenvolvedor | dev | alvaro-lima |

## 5. As "permissões" do grupo: o que são hoje

Cada grupo tem uma lista de permissões (`registrar.atividade`, `ver.proprios`,
`ver.equipe`, `relatorio.equipe`, `relatorio.executivo`, `exportar.dados`,
`gerenciar.usuarios`, `gerenciar.integracoes`).

**Sejamos precisos: hoje essas permissões são rótulos descritivos.** O sistema autoriza
pelo **nível efetivo**, não por essas strings. Ou seja, marcar `gerenciar.usuarios` em um
grupo de nível `dev` **não** dá acesso à administração; e um grupo `gestor` administra
mesmo sem essa permissão marcada.

Elas servem para documentar a intenção do grupo. Se no futuro for necessário um controle
mais fino (por exemplo, um gestor que administre integrações mas não usuários), o
backend precisaria passar a verificar essas permissões, e isso é uma evolução a planejar.

## 6. Quem decide: sempre o servidor

A autorização é aplicada no backend, nunca no navegador. O servidor:

- ignora `level`, `who`, `by` ou `permissions` enviados pelo cliente;
- filtra os dados antes de enviar (um dev só recebe as próprias atividades; grupos e
  integrações vêm vazios para ele);
- recusa as ações que o nível não permite, respondendo `403`.

Consequência visível: o menu lateral é igual para todos os níveis (o frontend não esconde
itens). Um dev consegue abrir a tela de Configurações, mas ela aparece sem dados de
administração e qualquer tentativa de gravar é recusada pelo servidor. A segurança está
no backend, não em esconder botões.

## 7. Salvaguardas

O sistema bloqueia operações que deixariam a organização sem governança:

- **Último CEO**: não é possível rebaixar, desativar ou excluir o único usuário `ceo`
  ativo, nem esvaziar/excluir o grupo que o mantém nesse nível. O erro é `LAST_CEO` (409).
- **Autoproteção**: ninguém desativa nem exclui a própria conta.
- Exclusão de usuário é **desativação com soft delete**: o histórico de atividades e o
  log de auditoria são preservados.

Exemplo real: como `admin` é hoje o único ceo, se você tentar removê-lo do grupo
Diretoria ou mudar o nível desse grupo para `dev`, o sistema recusa. Para fazer isso,
primeiro promova outra pessoa a ceo.

## 8. Como administrar (na tela)

Em **Configurações**, com nível gestor ou ceo:

- **Usuários**: criar, editar dados, ativar/desativar e alterar o nível diretamente.
- **Grupos de acesso**: criar grupo, definir nível e permissões, e escolher os membros.
  Ao salvar os membros, os níveis são recalculados na hora.

Atenção: se você definir o nível diretamente no usuário e ele pertencer a um grupo, um
recálculo posterior de grupo pode sobrepor esse ajuste manual. O caminho previsível é
governar pelo grupo.

## 9. Como escolher entre nível direto e grupo

- **Poucas pessoas, sem padrão**: ajustar o nível direto no usuário resolve.
- **Times, papéis recorrentes, entra e sai gente**: use grupos. É o modelo que o sistema
  favorece e o que mantém coerência quando a equipe cresce.

## 10. Por que os níveis não estão em uma tabela

Os três níveis **estão no banco**, mas como um tipo **enum** do PostgreSQL, não como
tabela. Verificação no banco da VM:

```
AccessLevel = [DEV, GESTOR, CEO]
colunas que usam: users.effective_level, access_groups.level
```

O critério da modelagem é: **dado configurável vai para tabela; regra de negócio
codificada vira enum**. Os níveis são regra, e não configuração, por três motivos:

1. **O comportamento de cada nível está escrito em código**, nos dois lados. No backend,
   os guardas (`requireLevel`) e as políticas de escopo (`seesAll`, `isExec`, `canPlan`)
   comparam o nível. No frontend, `DV.LEVELS` define os três com ranks 1/2/3, e as telas
   mudam por causa disso (os relatórios têm abas distintas: pessoal, equipe, executivo).
2. **Uma tabela criaria uma promessa falsa.** Se existisse uma tabela `levels`, a
   interface sugeriria que é possível criar um quarto nível (ex.: "Coordenador"). Ele não
   teria efeito algum: nenhuma regra saberia o que ele autoriza e, no frontend,
   `LEVELS['coordenador']` seria indefinido, caindo no padrão `dev`. Seria um cadastro
   que não faz nada, ou pior, que engana quem administra.
3. **Integridade e simplicidade.** O PostgreSQL só aceita os três valores na coluna, sem
   necessidade de chave estrangeira, join ou validação adicional. O prompt mestre também
   define exatamente esses três níveis (§16.1) e pede para não criar recursos que a
   interface não represente.

### Onde fica a flexibilidade
Na tabela **`access_groups`**, que é dinâmica: você cria quantos grupos quiser, cada um
apontando para um dos três níveis. Analogia útil: os níveis são os papéis fixos do
sistema; os grupos são os cargos da organização, modelados livremente.

### O que seria necessário para ter níveis dinâmicos
Trocar o enum por tabela, isoladamente, não resolveria. Seria preciso migrar a
autorização de "nível" para **permissões finas**:

1. Criar as tabelas `roles` e `permissions` (e a associação entre elas).
2. Substituir o gate por nível (`requireLevel`) por verificação de permissão
   (`requirePermission('gerenciar.usuarios')`) em cada rota.
3. Reescrever as políticas de escopo (hoje baseadas em `seesAll`/`isExec`) em termos de
   permissões, por exemplo `ver.equipe` e `relatorio.executivo`.
4. Ajustar o frontend, que hoje decide o que exibir a partir dos três perfis fixos: as
   abas de relatório e os filtros teriam de olhar permissões. Isso exige alterar arquivos
   `*.dc.html`, o que depende de autorização (§4.3).
5. Migrar os dados: converter os níveis atuais em conjuntos de permissões equivalentes.

As strings de permissão que os grupos já têm hoje (`ver.equipe`, `gerenciar.usuarios`,
`relatorio.executivo`, ...) são exatamente o embrião desse modelo. Hoje elas são
descritivas; nessa evolução, passariam a ser o que o servidor verifica.

Recomendação: só vale esse esforço se surgir uma necessidade real, como um gestor que
administre integrações mas não usuários. Para os três perfis atuais, o enum é mais
simples, mais seguro e mais honesto com o que a interface oferece.

## 11. Por que o nível aparece em dois lugares (users.effective_level e grupos)

Dúvida legítima: se o grupo define o nível, por que a tabela `users` também tem um campo
de nível? Porque são coisas com papéis diferentes.

- **`users.effective_level` é o RESULTADO**: o nível que vale para a pessoa agora. É o que
  o sistema consulta para autorizar.
- **Grupos (`access_groups` + `group_members`) são uma FORMA DE DEFINIR** esse resultado:
  o grupo tem um nível e quem entra nele recebe aquele nível.

Analogia: o grupo é a regra ("todos da Diretoria são ceo"); o campo no usuário é o crachá
que a pessoa carrega. O sistema confere o crachá, não relê o regulamento em cada porta.

### Por que materializar o nível no usuário
O nível é consultado em **toda requisição**: o guarda de autenticação lê
`effectiveLevel` para montar o usuário da sessão, e o próprio token JWT carrega o nível
(`auth.service.ts`). Sem esse campo, cada chamada precisaria de um join em
`group_members` + `access_groups` para recalcular o maior nível. É uma denormalização
deliberada, por desempenho e simplicidade.

### A ambiguidade: dois caminhos escrevem o mesmo campo

| Caminho | Onde no código | O que faz |
| --- | --- | --- |
| Direto no usuário | `users.service.ts` (createUser e updateUser) | a aba Usuários altera o nível da pessoa |
| Pelo grupo | `groups.service.ts` (recalcLevels) | ao salvar membros ou o nível do grupo, recalcula os afetados |

Consequência: **a última operação vence**. Se você promove alguém a gestor na aba
Usuários e depois salva os membros de um grupo `dev` do qual essa pessoa participa, o
recálculo a devolve para `dev`, sem erro nem aviso.

Por que ficou assim: o protótipo do frontend já tinha os dois mecanismos (a aba Usuários
tem um botão que alterna o nível ciclicamente; a aba Grupos define nível e membros).
Ambos foram implementados com fidelidade, em vez de inventar comportamento que a
interface não representa. O custo é essa ambiguidade.

### Três saídas possíveis
1. **Manter como está** (situação atual). Fiel à interface. Regra de operação: governe
   pelos grupos e use o ajuste direto apenas para exceções, ciente de que um recálculo de
   grupo pode sobrepor.
2. **Grupo como única fonte de verdade** (conceitualmente o mais limpo). `PATCH /users`
   deixaria de aceitar `level`. Custo: o botão de nível na aba Usuários ficaria sem
   efeito, o que exigiria removê-lo do HTML (§4.3) para não virar um botão morto.
3. **Override explícito**: um campo `level_override` que, quando preenchido, o recálculo
   de grupo respeita. Fica previsível ("esta pessoa tem nível fixo, independente de
   grupos"), ao custo de uma coluna e uma regra a mais.

Recomendação atual: opção 1, com a regra "governe por grupo". Com poucos usuários não há
dor real. Se a equipe crescer e a confusão aparecer, a opção 3 resolve sem tocar no
frontend.

## 12. Nota sobre exclusão de usuário

A exclusão pela tela é **soft delete**: o usuário é desativado e marcado com
`deleted_at`, deixando de aparecer nas listas e sem conseguir mais entrar, mas a linha
permanece na tabela. Isso preserva a integridade do histórico (atividades, tarefas e
auditoria continuam apontando para alguém real).

Remoção física só é adequada quando o usuário não tem histórico, e mesmo assim o registro
de auditoria deve ser preservado (basta desassociar o ator). Foi o que se fez ao limpar o
usuário de teste `teste-novo...` em 2026-08-04: ele não tinha atividades, tarefas nem
anexos; a preferência e a sessão foram apagadas, o log de auditoria foi mantido sem ator,
e a linha do usuário foi removida.

Usuários atuais na VM: `admin` (ceo, grupo Diretoria) e `alvaro-lima` (dev, grupo
Desenvolvedor).
