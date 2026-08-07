# Backlog — gerado por deploy.sh

> Atualizado em 2026-08-07 16:17:15 na versão v0.0.3.
> Redigido por IA (gpt-4o-mini) a partir das pendências dos docs e dos marcadores do código.

## Alta
- **Sem backup do banco em produção.** É necessário implementar um sistema de backup para evitar perda de dados. (BACKUP_E_RESTAURACAO.md)
- **Sem rotina de retenção.** Implementar `deleteMany` para remover sessões revogadas e eventos de outbox, prevenindo crescimento ilimitado do banco. (src/jobs, src/workers)
- **Não existe recuperação de acesso por autoatendimento.** Necessário reintroduzir o fluxo "Esqueci minha senha" para permitir que usuários recuperem acesso sem intervenção de administradores.

## Media
- Resumo diário: o job dispara webhook, e não envia e-mail. Reintroduzir `nodemailer` para enviar e-mails no resumo diário.
- Anexos: implementar suporte a provider S3/MinIO, quarentena/ClamAV e streaming.
- Teste de contrato do payload de webhook e caracterização retroativa do DV.
- Aviso ao titular quando um administrador troca a senha dele.
- Frontend do "Esqueci minha senha" continua chamando rotas que não existem mais. Remover ou atualizar para evitar erros.

## Baixa
- Banco de desenvolvimento local está desatualizado em relação à VM. Aplicar a migration `20260806120000_busca_sem_acento` para garantir funcionalidade correta.
- Limpeza opcional de `_prisma_migrations` que contém resíduos da correção do SQL.
- Verificação do bloco "Trocar de usuário" oculto: confirmar a configuração da flag no servidor.
