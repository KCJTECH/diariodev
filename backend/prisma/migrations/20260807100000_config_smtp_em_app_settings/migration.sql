-- Servidor de e-mail configurável pela tela (aba Integrações), em vez de
-- variáveis de ambiente: quem administra troca o servidor e o remetente sem
-- acesso ao servidor. Guarda host, port, user, fromEmail, enabled e a senha em
-- encryptedSecret (AES-256-GCM, chave derivada de ENCRYPTION_KEY).
--
-- Aditiva e idempotente: coluna nova com default, sem reescrever linha existente.
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "mail" JSONB NOT NULL DEFAULT '{}';
