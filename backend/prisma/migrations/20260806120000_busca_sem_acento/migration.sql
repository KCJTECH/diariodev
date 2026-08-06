-- Busca sem acento e por similaridade (§14, §17.13).
--
-- unaccent e pg_trgm são extensões "trusted" no PostgreSQL 13+, então o usuário
-- da aplicação consegue criá-las sem superusuário desde que tenha CREATE no
-- banco. Verificado em 2026-08-06 no servidor de produção com o usuário
-- diariodev_app, em transação revertida: as duas passam.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Função imutável para poder indexar: unaccent() é STABLE por depender do
-- dicionário, e índice de expressão exige IMMUTABLE. Fixar o dicionário
-- 'unaccent' torna o resultado determinístico.
CREATE OR REPLACE FUNCTION dv_norm(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, txt)) $$;

-- Índices trigram sobre o texto normalizado: fazem ILIKE com curinga nas duas
-- pontas usar índice, em vez de varrer a tabela.
CREATE INDEX IF NOT EXISTS idx_activities_title_norm_trgm
  ON activities USING gin (dv_norm(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_activities_desc_norm_trgm
  ON activities USING gin (dv_norm(description) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_title_norm_trgm
  ON tasks USING gin (dv_norm(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_name_norm_trgm
  ON users USING gin (dv_norm(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_projects_name_norm_trgm
  ON projects USING gin (dv_norm(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_categories_name_norm_trgm
  ON categories USING gin (dv_norm(name) gin_trgm_ops);
