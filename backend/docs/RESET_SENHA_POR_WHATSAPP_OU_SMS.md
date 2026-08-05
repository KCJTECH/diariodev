# Redefinição de senha por WhatsApp ou SMS

Documento de decisão. Nada foi implementado. Levantamento feito em 2026-08-05 sobre o
código real deste repositório.

## Pedido

Quando o e-mail de redefinição não foi enviado, ou o endereço não existe, ou o
colaborador não recebeu, enviar o mesmo link por WhatsApp ou SMS.

## O que precisa ser corrigido no pedido antes de virar projeto

Dos três gatilhos descritos, só um é viável como automação. Isso não é detalhe técnico,
muda o escopo.

Não existe conta para o e-mail informado. Não há o que enviar. Sem conta não há
cadastro, não há telefone e não há destinatário. Além disso, hoje a rota responde
exatamente igual exista ou não a conta, de propósito, para que ninguém descubra quem tem
acesso ao sistema informando e-mails e observando a resposta. Fazer o sistema tentar
outro canal nesse caso exigiria admitir que a conta existe, o que devolve o problema de
enumeração de usuários que foi fechado. Este gatilho deve ser descartado.

O colaborador não recebeu. O sistema não tem como saber isso. O servidor de e-mail
aceitar a mensagem não significa entrega na caixa, e entrega não significa leitura.
Nenhum dos três estados é observável pelo backend. Portanto o reenvio por outro canal
não pode ser automático: precisa ser pedido por quem está na tela, em um botão do tipo
"não recebi o e-mail, tentar por WhatsApp".

O e-mail não foi enviado. Este é observável e é o único que serve para automação. Hoje o
código já sabe distinguir: quando o envio falha ou o SMTP não está configurado, fica um
WARN no log. É aqui que um segundo canal pode entrar automaticamente, como reserva.

Conclusão: o desenho viável é um caminho automático quando o envio de e-mail falha, mais
um caminho manual acionado pelo próprio usuário na tela.

## Situação atual do código

| Peça | Estado |
| --- | --- |
| Fluxo de reset por e-mail | implementado e em produção na VM |
| Token com hash, uso único, expiração, auditoria | pronto |
| Campo de telefone no cadastro | não existe em nenhuma tabela do schema |
| Tela de administração com telefone | não existe |
| Módulo de envio de e-mail (`common/mail/mailer.ts`) | serve de molde para o novo canal |
| Fila BullMQ com retry | já existe, usada por webhooks |
| Reset administrativo por gestor (`POST /users/:id/password-reset`) | já existe e funciona |

O ponto mais caro não é a integração com WhatsApp. É que o sistema não tem o telefone de
ninguém. Sem cadastro de telefone confiável e atualizado, o canal não sai do papel.

## Opções

### Opção A: enviar o mesmo link por WhatsApp ou SMS

É o pedido literal. Funciona, mas o link tem características ruins neste canal. Ele fica
guardado no histórico da conversa, é encaminhável em um toque, aparece em prévia na tela
de bloqueio e, em aparelho compartilhado, fica visível para quem pegar o telefone. O
token vale por 60 minutos hoje, então uma mensagem encaminhada por engano entrega a
conta.

### Opção B: enviar um código numérico curto em vez do link (recomendada)

O mesmo pedido de redefinição, mas por WhatsApp ou SMS o usuário recebe um código de 6
dígitos, com validade de 10 minutos e limite de tentativas, que ele digita na tela. O
link continua sendo o formato do e-mail.

É o padrão do mercado para este canal, e não por moda: o WhatsApp tem uma categoria
própria de template de autenticação feita exatamente para código de uso único, com
aprovação mais simples e preço menor que outras categorias. Em SMS, código evita os
problemas de link encurtado, link quebrado por cliente de mensagem e desconfiança de
phishing. E um código de 10 minutos exposto no histórico da conversa vale muito menos que
um link de 60 minutos.

Custo de implementação praticamente igual ao da opção A: o token já existe no banco, o
que muda é gerar um código curto associado a ele e validar o código na confirmação.

### Opção C: não criar canal novo e usar o reset acionado pelo gestor

Gestor ou CEO aciona `POST /users/:id/password-reset`, recebe o link no próprio e-mail e
repassa ao colaborador pelo canal que já usa no dia a dia. Nenhuma dependência externa,
nenhum dado pessoal novo, nenhum custo por mensagem.

Correção de uma afirmação errada da primeira versão deste documento. Quando escrevi que
esta opção já estava pronta e com custo zero, a rota existia, mas em produção devolvia o
token como indefinido (`isProduction ? undefined : token`): criava o token no banco e
ninguém conseguia vê-lo. E nenhuma tela chamava a rota. Na prática o gestor não tinha
como acionar nem como receber o link.

O que foi feito depois, no backend: a rota passou a enviar o link por e-mail para quem
acionou, com o nome do colaborador alvo, aviso de uso único e prazo de validade; invalida
os pedidos anteriores ainda abertos; devolve `mailSent` para a tela informar se o e-mail
saiu; e registra sucesso e falha no log. Coberto por cinco testes de integração,
incluindo o caminho completo até o colaborador entrar com a senha nova, e a recusa para
nível dev.

O que ainda falta para o gestor usar sozinho: um botão na tela de colaboradores que chame
a rota. Sem ele, o acionamento depende do TI executar a chamada manualmente.

Não atende o pedido de autoatendimento, mas resolve o caso de uso operacional sem projeto
de canal novo.

## Recomendação

Opção C agora, Opção B como projeto, Opção A descartada.

Justificativa: o gargalo é o cadastro de telefone, não o canal. Enquanto não houver
telefone confiável e atualizado de cada colaborador, qualquer investimento em WhatsApp ou
SMS fica parado ou, pior, entrega o reset no número errado. A Opção C cobre o caso
operacional imediato com o que já está pronto e testado. A Opção B é o caminho certo
quando o cadastro existir, e o código curto é mais seguro que o link neste canal pelo
mesmo custo de desenvolvimento.

## O que precisa ser feito para a Opção B

Em ordem de dependência. Os três primeiros itens não são de tecnologia e travam todo o
resto.

### Antes de escrever código

1. Decidir o provedor e aprovar o custo. WhatsApp exige API oficial (Meta Cloud API
   direto ou por um parceiro BSP) com template de autenticação aprovado, e cobra por
   mensagem. SMS exige gateway, também por mensagem. Sem definição de provedor e de
   orçamento não há o que implementar.
2. Definir a base legal e a política de dados do telefone (LGPD). Telefone de
   colaborador é dado pessoal: finalidade declarada, quem pode ver, prazo de retenção,
   registro em auditoria de quem consultou ou alterou.
3. Coletar e manter os telefones. Definir quem preenche, quem valida e com que
   frequência é conferido. Número desatualizado neste fluxo significa mandar o acesso
   para quem não é mais o dono da linha.

### Backend

4. Campo de telefone no modelo `User`, com migration reversível, opcional (nem todo
   colaborador terá), guardado em formato E.164 e normalizado na entrada.
5. Módulo de envio no mesmo formato do `mailer.ts`: uma função que informa se o canal
   está habilitado e uma que envia e nunca lança exceção, para que falha de provedor não
   derrube o fluxo que a originou. Credenciais só por variável de ambiente.
6. Código de uso único de 6 dígitos vinculado ao token existente, com validade curta
   (10 minutos), limite de tentativas e invalidação após o uso ou após estourar as
   tentativas. Guardado como hash, igual ao token.
7. Endpoint de reenvio por outro canal, acionado pelo usuário, mantendo a resposta neutra
   de sempre, sem revelar se a conta existe nem qual número foi usado.
8. Envio automático pelo canal alternativo quando o e-mail falhar, aproveitando o ponto
   do código que hoje só registra o WARN.
9. Enfileirar o envio na infra BullMQ que já existe, com retry: provedor externo falha, e
   perder silenciosamente uma mensagem paga é pior que falhar visivelmente.
10. Rate limit próprio, mais apertado que o do e-mail, contado também por número de
    destino e não só por IP. Sem isso a rota se torna ferramenta de incomodar
    colaborador e de gastar orçamento de mensagem.
11. Auditoria registrando o canal usado, sem gravar o número completo nem o código.
12. Log de sucesso e de falha por canal. Esta lição é recente: no reset por e-mail, o
    sucesso não era registrado e isso travou o diagnóstico de um envio que não chegava.

### Frontend

13. Campo de telefone na tela de administração de colaboradores, e no perfil próprio.
14. Na tela de login, depois de pedir a redefinição, oferecer "não recebi o e-mail" com a
    opção do outro canal, e a tela para digitar o código de 6 dígitos.

### Qualidade

15. Testes de integração cobrindo: canal alternativo quando o e-mail falha, reenvio
    pedido pelo usuário, código expirado, código errado dentro e acima do limite de
    tentativas, resposta neutra preservada, e rate limit por destino.

## Riscos

| Risco | Consequência | Mitigação |
| --- | --- | --- |
| Telefone desatualizado no cadastro | redefinição entregue a quem não é mais o titular da linha | conferência periódica do cadastro; manter e-mail como canal principal |
| Troca fraudulenta de chip (SIM swap) | atacante recebe o código e assume a conta | código curto com validade de 10 minutos; não usar este canal para conta de nível CEO |
| Mensagem visível em tela de bloqueio ou aparelho compartilhado | acesso obtido por quem está por perto | código em vez de link; texto sem identificar o sistema além do necessário |
| Custo por mensagem e rota pública | conta de mensageria consumida por disparo em massa | rate limit por IP e por destino; alerta de volume anormal |
| Dependência de provedor externo | canal de reserva indisponível justamente quando o e-mail falhou | fila com retry; manter a Opção C como saída manual |
| Telefone como dado pessoal | exposição indevida e risco de LGPD | base legal definida, acesso restrito, auditoria de consulta e alteração |

## Impacto esperado

Reduz o acionamento do TI para desbloquear acesso e diminui o tempo que o colaborador
fica parado quando o e-mail corporativo é justamente o que não está funcionando. O ganho
é operacional, não financeiro, e só se materializa se o cadastro de telefone estiver
correto.

## Próximo passo

Uma decisão sua, antes de qualquer estimativa: existe orçamento e responsável para
provedor de mensagem e para manter o cadastro de telefone dos colaboradores atualizado.
Com sim, o próximo passo é escolher o provedor e eu detalho o plano de implementação por
fases. Com não, a Opção C cobre a necessidade hoje e o assunto fica registrado aqui.
