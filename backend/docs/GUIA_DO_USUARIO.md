# Guia do usuário

Acesse http://localhost:3333/ (ou o endereço informado pela sua equipe).

## Login
Informe seu e-mail corporativo e a senha e clique em Entrar. Em desenvolvimento,
você também pode usar o atalho "entrar como" clicando no seu nome.

## Registrar atividade
Clique em Nova atividade. Escolha o projeto e a categoria, escreva um título curto e,
se quiser, uma descrição, a duração e a prioridade. A atividade é registrada em seu
nome (não é preciso escolher a pessoa). Salve. Ela aparece na timeline imediatamente.

## Editar atividade
Abra a atividade na timeline e use editar. Ajuste os campos e salve. Se outra pessoa
tiver alterado o mesmo registro, o sistema avisa em vez de sobrescrever.

## Anexar arquivo
Observação: no momento, o anexo pela tela registra o nome e o tamanho do arquivo. O
envio real do arquivo ao servidor está disponível pela API; a habilitação na tela
depende de um ajuste autorizado no frontend.

## Concluir tarefa
Nas tarefas atribuídas a você (dashboard e projetos), marque como concluída. Você
também pode concluir registrando a atividade correspondente.

## Visualizar projeto
Em Projetos, abra um projeto para ver a timeline, as tarefas, a carga da equipe, o
calendário e o Gantt. Um desenvolvedor vê os projetos em que participa; gestão e
diretoria veem todos.

## Usar relatórios
Em Relatórios, veja volume por período, categorias, projetos e pessoas, além de
exportar em CSV. O conteúdo respeita seu nível: desenvolvedor vê a visão pessoal;
gestão vê a equipe; diretoria vê a visão executiva.

## Pesquisar
Use a busca (ou a tela de Auditoria) para encontrar atividades, pessoas e projetos.
Os resultados respeitam o que você pode ver.

## Alterar preferências
Em Minha conta, ajuste tema (claro/escuro), densidade da timeline, recolhimento do
menu e o projeto padrão para novos registros. As preferências ficam salvas na sua conta.

## Administrar (gestão e diretoria)
Em Configurações:
- Categorias: criar e arquivar. Arquivar não apaga o histórico.
- Usuários: criar, editar dados e nível, ativar ou desativar. O último diretor ativo
  não pode ser rebaixado, e ninguém desativa a própria conta.
- Grupos: definir nível e membros. O nível de cada pessoa é recalculado pelos grupos.
- Integrações: cadastrar webhooks/automações, definir eventos e testar. O segredo
  fica protegido e nunca é exibido por inteiro.
- Aparência: marca, cores e densidade padrão.

## Solucionar problemas básicos
- Não carrega ou pede login de novo: sua sessão expirou. Faça login novamente.
- Uma alteração não apareceu para o colega: aguarde alguns segundos; a atualização é
  automática. Se persistir, recarregue a página.
- Erro ao salvar: verifique a mensagem exibida; pode ser falta de permissão, conflito
  de edição ou dado inválido.
- Sem permissão para uma ação: confirme seu nível de acesso com a administração.
