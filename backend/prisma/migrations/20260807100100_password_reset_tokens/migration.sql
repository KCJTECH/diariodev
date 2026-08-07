-- Recria a tabela de tokens de redefinição de senha, removida em
-- 20260806190000_remove_password_reset. O fluxo volta porque agora o servidor de
-- e-mail é configurável pela tela, que era o requisito original.
--
-- Guarda apenas o hash do token: o valor em claro existe só no link enviado por
-- e-mail. Uso único (used_at) e validade curta (PASSWORD_RESET_TTL_MINUTES).
--
-- Escrito à mão em vez de gerado por `prisma migrate dev` de propósito: o banco
-- tem o índice "activities_tags_gin_idx", criado por SQL bruto na migration
-- inicial e não declarado no schema.prisma, então o gerador o incluiria num
-- DROP INDEX e desfaria a otimização de busca por tags.
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "requested_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

ALTER TABLE "password_reset_tokens"
  DROP CONSTRAINT IF EXISTS "password_reset_tokens_user_id_fkey";

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
