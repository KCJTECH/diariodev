# Backup e restauração

## Escopo
Backup do PostgreSQL (dados) e do armazenamento de anexos (STORAGE_PATH ou o bucket
S3/MinIO). Redis é volátil (cache/filas) e não exige backup de dados de negócio.

## Backup do banco
```
pg_dump --format=custom --file=diariodev_YYYYMMDD.dump "postgresql://usuario:senha@host:5432/banco?schema=diariodev"
```
Fazer backup antes de qualquer migration em produção. Guardar em local seguro e
testar a restauração periodicamente.

## Restauração do banco
```
# banco vazio, mesma versão de schema
pg_restore --clean --if-exists --dbname="postgresql://usuario:senha@host:5432/banco" diariodev_YYYYMMDD.dump
```
Após restaurar, conferir prisma migrate status.

## Backup dos anexos
Disco local: copiar o diretório STORAGE_PATH. S3/MinIO: usar replicação/versionamento
do bucket. Os metadados dos anexos ficam no banco (tabela attachments); backup do
banco e do storage devem ser coerentes no tempo.

## Rollback de migration
Preferir rollback lógico (nova migration que reverte) a desfazer manualmente. Para
alterações destrutivas, usar a estratégia expandir, migrar, contrair, mantendo a
compatibilidade durante a transição.

## Recuperação de desastre
1. Restaurar o banco a partir do dump mais recente.
2. Restaurar o storage de anexos.
3. Subir API e worker.
4. Validar /health/ready e um fluxo básico (login, listar atividades).
