-- Filtro de projeto por integração: a integração só dispara para eventos dos
-- projetos escolhidos (ex.: um webhook que só interessa ao projeto de RH).
-- Lista vazia mantém o comportamento atual, todos os projetos, para não alterar
-- as integrações que já existem.
--
-- Aditiva. Escrita à mão porque o gerador do Prisma incluiria um DROP INDEX de
-- "activities_tags_gin_idx", criado por SQL na migration inicial e não declarado
-- no schema; ver 20260807100100_password_reset_tokens.
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "project_ids" UUID[] DEFAULT ARRAY[]::UUID[];
