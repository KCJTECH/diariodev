-- Busca sem acento e por similaridade (§14, §17.13).
--
-- unaccent e pg_trgm são extensões "trusted" no PostgreSQL 13+, então o usuário
-- da aplicação consegue criá-las sem superusuário desde que tenha CREATE no
-- banco. Verificado em 2026-08-06 com diariodev_app, em transação revertida.
--
-- Cada instalação usa um schema diferente: o banco de teste local roda em
-- `public` e a VM em `diariodev`, e o search_path de lá não inclui `public`.
-- Por isso o dicionário NÃO pode ser referenciado com schema fixo: a primeira
-- versão desta migration fixava `public.unaccent` e falhou na VM. O schema é
-- descoberto em tempo de execução.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Função imutável, para poder indexar: unaccent() de um argumento é STABLE,
-- porque depende do search_path, e índice de expressão exige IMMUTABLE. Fixar o
-- dicionário torna o resultado determinístico.
DO $do$
DECLARE
  esquema text;
BEGIN
  SELECT n.nspname INTO esquema
    FROM pg_ts_dict d
    JOIN pg_namespace n ON n.oid = d.dictnamespace
   WHERE d.dictname = 'unaccent'
   LIMIT 1;

  IF esquema IS NULL THEN
    RAISE EXCEPTION 'dicionário unaccent não encontrado após criar a extensão';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION dv_norm(txt text) RETURNS text '
    'LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS '
    '$f$ SELECT lower(%I.unaccent(%L::regdictionary, txt)) $f$',
    esquema, esquema || '.unaccent');
END
$do$;

-- Índices trigram sobre o texto normalizado: fazem LIKE com curinga nas duas
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
