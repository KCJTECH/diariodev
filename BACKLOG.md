# Backlog — gerado por deploy.sh

> Atualizado em 2026-08-07 14:28:48 na versão v0.0.2.
> Redigido por IA (gpt-4o-mini) a partir das pendências dos docs e dos marcadores do código.

## Alta
- **Sem backup do banco em produção.** É necessário implementar um sistema de backup para evitar perda de dados (BACKUP_E_RESTAURACAO.md).
- **Sem rotina de retenção.** Implementar `deleteMany` para remover sessões revogadas e eventos de outbox, prevenindo crescimento descontrolado do banco (src/jobs, src/workers).
- **Não existe recuperação de acesso por autoatendimento.** Reintroduzir o fluxo "Esqueci minha senha" para permitir que usuários recuperem acesso sem depender de administradores.

## Media
- Resumo diário: reintroduzir envio de e-mail no resumo, que atualmente só dispara webhook, exigindo a reimplementação do `nodemailer`.
- Banco de desenvolvimento local está desatualizado em relação à VM. Aplicar a migration `20260806120000_busca_sem_acento` para evitar erro 500 em `GET /search`.
- Defeito no botão "Salvar alterações" de Minha conta foi corrigido, mas é necessário garantir que divergências de nome entre o DTO do servidor e o que a tela lê sejam testadas adequadamente.

## Baixa
- Anexos: implementar suporte a provider S3/MinIO, quarentena/ClamAV e streaming para melhorar a gestão de arquivos.
- Aviso ao titular quando um administrador troca a senha dele, para aumentar a transparência nas mudanças de acesso.
- Limpeza de registros de teste no banco, que foram deixados pelos smoke tests, requer consentimento explícito.
