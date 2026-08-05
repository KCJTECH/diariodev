# Integração com o frontend

O frontend não foi alterado, exceto o arquivo permitido assets/data.js, que expõe
window.DV com o mesmo contrato público de antes. As telas continuam lendo dados de
forma síncrona.

## Como o DV funciona
data.js mantém um cache central em memória. Os getters (acts, people, cats, projects,
tasks, user, ui, brand, theme e derivados) leem desse cache de forma síncrona. As
telas fazem polling por window.DV; por isso window.DV só é publicado depois que o
bootstrap hidrata o cache.

## Bootstrap
Ao carregar, data.js resolve um login pendente (atalho "entrar como") se houver,
chama GET /bootstrap e preenche o cache. Se o access token expirou, tenta
POST /auth/refresh antes de redirecionar para o login. Na tela de login sem sessão,
busca GET /auth/dev-accounts para listar os colaboradores.

## Cache e escrita otimista
create, update, remove, createTask, updateTask e removeTask atualizam o cache na
hora (com id temporário) e disparam a requisição. No sucesso, o registro temporário
é substituído pelo oficial; no erro, faz rollback e reporta pelo mecanismo visual
existente. Os setters de administração (setCats, setPeople, setUi para grupos e
integrações, setBrand, preferências) roteiam por diff para os endpoints.

## Datas
occurredAt (ISO) do backend vira d (offset de dias), t (HH:mm) e dur (texto) no
adaptador, comparando datas civis no fuso. As funções de data do DV usam serverNow.

## Socket.IO
data.js carrega o cliente servido pelo backend (/socket.io/socket.io.js), conecta
com o cookie e escuta dv:event. Ao receber um evento, recarrega a coleção afetada e
força o re-render dos componentes montados (via window.__dcRegistry).

## Re-render sem tocar em HTML
O micro-framework das telas mantém, em window.__dcRegistry, um conjunto de funções
de re-render por componente. Ao mudar o cache por socket, data.js chama essas
funções; renderVals lê o DV atualizado e a tela reflete a mudança.

## Erros e sessão
401 redireciona para o login (após tentar refresh). Falhas são reportadas sem novos
componentes visuais. Logout encerra a sessão no servidor antes de navegar.

## Como adicionar uma operação sem quebrar as telas
Preserve as assinaturas e formatos do DV. Adicione métodos novos se necessário, mas
não remova nem altere os existentes. Datas e escopo continuam iguais aos do protótipo.

## Limitações da UI que exigiriam alterar HTML (§4.3)
Upload/download de anexo pela tela: onPickFiles descarta o objeto File; o backend de
anexos existe e funciona por API. Login real por senha: a tela aceita qualquer senha
via dev-login. Ambos precisariam de mudança no HTML, com autorização.
