# Backlog — gerado por deploy.sh

> Atualizado em 2026-08-07 13:55:15 na versão v0.0.1.
> Redigido por IA (gpt-4o-mini) a partir das pendências dos docs e dos marcadores do código.

## Alta
- **Sem backup do banco em produção.** É necessário implementar um sistema de backup para evitar perda de dados críticos. (BACKUP_E_RESTAURACAO.md)
- **Sem rotina de retenção.** Implementar `deleteMany` para remover sessões revogadas e eventos de outbox, evitando crescimento descontrolado do banco. (src/jobs, src/workers)
- **Não existe recuperação de acesso por autoatendimento.** Reintroduzir o fluxo "Esqueci minha senha" para permitir que usuários recuperem suas contas sem depender de administradores. 

## Media
- Resumo diário: reintroduzir o envio de e-mail no resumo diário, que atualmente dispara apenas um webhook.
- Anexos: implementar suporte a provider S3/MinIO, quarentena/ClamAV e streaming para melhorar a gestão de arquivos.
- Banco de desenvolvimento local está desatualizado em relação à VM. Aplicar a migration `20260806120000_busca_sem_acento` para garantir funcionalidade adequada na busca.
- Defeito no botão "Salvar alterações" de Minha conta foi corrigido, mas é necessário garantir que divergências entre DTO e tela sejam testadas adequadamente.
- Verificação do bloco "Trocar de usuário" oculto precisa ser confirmada em produção.

## Baixa
- Limpeza de registros de teste no banco, como categorias e usuários criados durante os smoke tests, requer consentimento explícito.
- Fase 10: documentação final e preenchimento de docs pendentes em `backend/docs/`.
