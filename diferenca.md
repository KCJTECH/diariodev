# Diferença entre a pasta local e a pasta da VM

Comparação executada em 2026-08-05.

Origem A (local): `C:\Projeto Node\Diario Dev ITS app`
Origem B (VM): `kcj@10.70.1.135:/home/kcj/diariodev`

Método: inventário recursivo dos dois lados com hash MD5 por arquivo, calculado após
remover os caracteres CR, para que a diferença de fim de linha entre Windows (CRLF) e
Linux (LF) não gerasse falso positivo. Foram comparados 178 arquivos em cada lado.

Excluídos da comparação, por serem gerados, dados de execução ou segredo:
`.git`, `node_modules`, `backend/dist`, `backend/storage`, `logs`, `backend/logs`,
`backend/test-results`, `backend/playwright-report` e `.env`.

## Resumo

| Situação | Quantidade |
| --- | --- |
| Arquivos presentes só na VM | 0 |
| Arquivos presentes só no local | 0 |
| Arquivos com conteúdo diferente | 2 |
| Arquivos idênticos | 176 |

Conclusão: as duas pastas têm exatamente o mesmo conjunto de arquivos. A divergência
está em dois arquivos de frontend, e nos dois casos a VM está mais nova que o local.

## Ponto de atenção

A VM tem alteração de frontend que não existe no local e, portanto, não está no
repositório Git. O código só está no servidor. Se a VM for reinstalada ou a pasta for
sobrescrita por um deploy a partir do local, essa alteração é perdida.

Data de modificação na VM dos dois arquivos: 2026-08-05 10:57.

## Arquivo 1: login.dc.html

73 linhas existem só na VM. 6 linhas existem só no local.

O que a VM tem a mais: a funcionalidade "Esqueci minha senha" implementada na tela.

- Link "Esqueci minha senha" clicável, com `openRecover`, e um segundo atalho no pé
  do formulário ("Renove aqui"). No local o mesmo texto existe, mas é estático, sem
  ação nenhuma.
- Modal "Recuperar senha" completo: campo de e-mail corporativo, validação de formato,
  faixa de erro, estado de envio concluído, botões Cancelar, Enviar link e Entendi.
- Animação `dvFade` no CSS, usada pelo fundo do modal.
- Estado novo do componente: `recoverOpen`, `recoverEmail`, `recoverError`,
  `recoverSent`, `recoverBusy`.
- Método `sendRecover()` com validação de e-mail e mensagem neutra, que não revela se
  a conta existe, para evitar enumeração de usuários.
- Tecla Escape fecha o modal e Enter dispara a ação do contexto ativo (no local, Enter
  só faz o login).

Observação importante sobre essa funcionalidade: ela é apenas de interface. O próprio
comentário no código da VM diz que ainda não existe endpoint de solicitação de reset no
backend, porque depende de SMTP, e o envio é simulado com um `setTimeout` de 600 ms.
Conferi no backend da VM e não há rota de solicitação de reset em
`backend/src/modules/auth/auth.routes.ts`. Ou seja: a tela promete o envio de um link
que hoje não é enviado.

## Arquivo 2: assets/app-shell.js

8 linhas existem só na VM. 5 linhas existem só no local.

O que a VM tem a mais: ajustes de layout do cabeçalho e da área de conteúdo.

- O padding horizontal saiu de `.as-header` e passou para `.as-bar`, que ganhou
  `max-width:1600px`, `margin:0 auto` e `flex-wrap:nowrap`.
- Container novo `.as-tabs`, também com `max-width:1600px` e centralizado.
- `.as-actions` mudou de `flex-wrap:wrap` para `nowrap`, com regra adicional para os
  filhos não quebrarem linha.
- Regra nova `.as-content > main` com `align-self:center` e `max-width:1600px`.
- No breakpoint de 880px, o padding passou de `.as-header` para `.as-bar` e `.as-tabs`.

Efeito prático: na VM o conteúdo fica centralizado e limitado a 1600px em telas largas,
e a barra de ações não quebra em duas linhas. No local o comportamento é o antigo.

## Situação depois da comparação

A divergência de arquivo foi resolvida por fora desta comparação, ainda em 2026-08-05.
O repositório recebeu os dois commits com exatamente essas alterações:

| Commit | Conteúdo |
| --- | --- |
| `332605d` | feat: adiciona recuperação de senha por modal no login |
| `3d52fb9` | fix: corrige header em duas linhas e conteúdo desalinhado |

Depois de integrar esses commits, `login.dc.html` e `assets/app-shell.js` na pasta local
ficaram idênticos aos da VM (verificado por comparação de conteúdo, ignorando fim de
linha). As duas pastas estão alinhadas nos 178 arquivos comparados, e o código que só
existia no servidor passou a estar versionado.

## Pendência que continua aberta

A tela de recuperação de senha é apenas de interface. Falta o endpoint de solicitação de
reset no backend e o SMTP configurado. Enquanto isso não existir, a tela informa ao
usuário um envio de link que não acontece.
