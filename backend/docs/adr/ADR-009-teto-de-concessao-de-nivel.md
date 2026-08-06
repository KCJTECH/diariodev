# ADR-009: Teto de concessão de nível de acesso

Data: 2026-08-06. Estado: aceito e implementado.

## Contexto

A auditoria do backend encontrou cinco caminhos de escalonamento de privilégio, três deles verticais e exploráveis por qualquer gestor autenticado:

`PATCH /users/:id` aceitava `level` sem comparar o nível de quem pedia. Um gestor fazia PATCH na própria chave pública com `level: ceo` e se promovia. O efeito era imediato, sem novo login, porque o guard relê o nível do banco a cada requisição.

O mesmo resultado pela via de grupos: `POST /groups` com `level: ceo`, depois `PUT /groups/:id/members` incluindo a própria chave. O recálculo gravava CEO no próprio usuário. Nenhum ponto do fluxo comparava o nível do grupo com o do ator, nem impedia o ator de se incluir.

`POST /users` criava conta de nível CEO sem teto. Somado ao fluxo de redefinição de senha, o gestor obtinha uma conta CEO operacional.

Havia ainda uma assimetria reveladora: a regra de senha (`assertCanActOnPassword`) já comparava níveis corretamente, e a de nível não comparava nada.

## Decisão

Três regras, centralizadas em `src/common/auth/policy.ts`, aplicadas no service e não na rota.

**Conceder nível vai até o próprio nível.** Um gestor cria ou promove até gestor; um CEO até CEO. Vale para o nível do usuário e para o nível do grupo.

**Administrar pessoa e afetar nível por grupo também vão até o próprio nível**, com a própria conta sempre permitida. Cobre cadastro, ativação, exclusão e entrada ou saída de grupo.

**Credencial é estritamente menor e proíbe a própria conta.** Definir senha ou gerar link de redefinição de alguém exige nível estritamente maior.

## Por que teto e não regra estrita

A primeira versão do desenho usava "estritamente menor" para tudo, e três becos sem saída apareceram, dois deles descobertos por teste que já existia.

Com regra estrita, ninguém nunca criaria um CEO. Perder a conta administrativa viraria incidente de recuperação manual em produção.

Com regra estrita, uma conta CEO não poderia ser desativada por ninguém, nem por outro CEO. Removê-la exigiria SQL no banco.

Com regra estrita, o nível de um membro pode vir do próprio grupo que está sendo editado: incluir alguém em grupo de nível CEO seria permitido, porque no momento da inclusão a pessoa ainda é dev, e remover seria proibido, porque ela já virou par do ator. Entra e nunca sai, e nem o CEO desfaz.

O que fecha a escalada não é a regra do alvo, é o teto do objeto: quem não pode administrar um grupo de nível superior não eleva ninguém por aquele caminho. Movimento lateral, um gestor criando outro gestor, não é escalonamento: não retira acesso de ninguém e fica em `audit_log`.

A credencial permanece estrita porque é categoricamente diferente. Definir a senha de alguém é assumir a identidade dele. Administrar a conta de um par não é.

## Onde a regra mora

Gate grosso na rota: autenticação e nível mínimo, declarativo e visível. Regra relacional no service, por três motivos concretos: depende do nível persistido do alvo, que só é conhecido depois da consulta que o service já faz; precisa estar no mesmo limite transacional do recálculo por grupo; e vale para chamador interno que não passa por rota, como script de reconciliação.

Critério para código futuro, registrado também em `SEGURANCA.md`: toda função de service que escreve nível de acesso, membresia de grupo ou credencial valida a autorização internamente. As demais podem confiar no gate de rota, porque não têm relação de rank entre ator e alvo.

## Consequências

Um gestor pode criar e administrar outro gestor, e não pode trocar a senha dele nem elevá-lo. O último CEO ativo continua protegido pelas salvaguardas que já existiam, e a ordem das verificações preserva o `409 LAST_CEO` em vez de trocá-lo por `403`.

A guarda de membros usa o delta entre antes e depois, nunca a lista inteira, porque o `PUT` da tela é substituição total e reenvia todos os membros: validar a lista completa impediria um gestor de salvar qualquer grupo que já contenha alguém de nível superior.

Provado por 49 casos unitários de matriz e 21 de integração que conferem status e não-efeito, mais verificação em produção com conta gestor descartável.

## Relação com outras decisões

Complementa o ADR-007, que definiu o nível efetivo como o maior entre os grupos ativos. Se o `level` for removido de `POST` e `PATCH /users`, como propõe `PLANO_NIVEL_SO_POR_GRUPO.md` e como o frontend já fez em 2026-08-06, o teto de concessão em usuários perde alvo, mas o teto de grupo e a regra de alvo pessoa continuam necessários. A decisão é aditiva e não se perde.
