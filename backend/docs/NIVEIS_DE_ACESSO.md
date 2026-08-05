# Níveis de acesso e módulos

Matriz verificada empiricamente contra o backend em execução (requisições reais como
cada nível). A autorização é aplicada no servidor, não apenas herdada do frontend.
Verificado em 2026-08-03.

## Níveis cadastrados (do banco)
- ceo (Diretoria): alvaro, marcelo
- gestor: laerty
- dev: camila, elaine, julio, rafael (ativos); bruna (inativo); teste-novo (sobra de teste)

## Grupos de acesso (definem o nível efetivo)
- Desenvolvimento [dev]: elaine, julio, camila, rafael
- Liderança técnica [gestor]: laerty
- Diretoria [ceo]: marcelo
- Administração [gestor]: laerty

O nível efetivo do usuário é o maior nível entre seus grupos ativos; sem grupo, dev
(ADR-007). Observação: alvaro está como ceo por atribuição direta, não por grupo.

## Matriz de acesso por módulo (resultado real)
Legenda: bloqueado = 403 no servidor; permitido = passou pelo controle de nível.

| Ação (módulo)                         | dev        | gestor    | ceo       |
| ------------------------------------- | ---------- | --------- | --------- |
| Dashboard (ver)                       | sim (pessoal) | sim (equipe) | sim (equipe) |
| Atividades: ver                       | só as próprias | todas | todas |
| Atividades: criar (para si)           | sim        | sim       | sim       |
| Atividades: editar/excluir            | só as próprias | só as próprias | só as próprias |
| Anexos: enviar                        | só no próprio registro | idem | idem |
| Tarefas: ver                          | só as suas | todas     | todas     |
| Tarefas: planejar/atribuir/editar     | bloqueado  | permitido | permitido |
| Tarefas: concluir                     | as suas    | sim       | sim       |
| Colaboradores: ver                    | sim        | sim       | sim       |
| Projetos: ver                         | só os que participa | todos | todos |
| Projetos: criar/editar/arquivar       | bloqueado  | permitido | permitido |
| Relatórios                            | visão pessoal | equipe | executiva |
| Pesquisa/Auditoria                    | sim (só o próprio) | equipe | equipe |
| Config: Categorias                    | bloqueado  | permitido | permitido |
| Config: Usuários                      | bloqueado  | permitido | permitido |
| Config: Grupos                        | bloqueado  | permitido | permitido |
| Config: Integrações                   | bloqueado  | permitido | permitido |
| Config: Aparência                     | bloqueado  | permitido | permitido |
| Preferências (tema/densidade)         | sim (só as suas) | sim | sim |

Escopo de leitura verificado: na base de teste do momento, dev via 10 atividades (só
as próprias) e gestor/ceo viam 32 (equipe inteira).

## Salvaguardas
O último CEO ativo não pode ser rebaixado nem desativado. Ninguém exclui ou desativa a
própria conta na mesma operação.

## Observações importantes
1. O menu lateral é o mesmo para todos os níveis (o frontend não esconde itens). Um dev
   abre a tela de Configurações, mas as escritas retornam 403 e os dados de grupos e
   integrações vêm vazios no bootstrap. O acesso real é garantido no servidor.
2. As permissões finas dos grupos (registrar.atividade, gerenciar.usuarios,
   relatorio.executivo, etc.) sao rótulos descritivos herdados do frontend. O backend
   autoriza pelo NÍVEL efetivo (dev/gestor/ceo), não por essas strings. Autorização por
   permissão fina seria uma evolução a planejar.
3. Diferença gestor x ceo: nas ações de administração sao equivalentes (gestor+); o ceo
   se distingue pela visão executiva nos relatórios (isExec).
