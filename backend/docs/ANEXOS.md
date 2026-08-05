# Anexos

## Endpoints
- POST /api/v1/activities/:id/attachments (multipart, campo file)
- GET /api/v1/attachments/:id (download autenticado)
- DELETE /api/v1/attachments/:id

## Armazenamento
Abstração em src/common/storage. Implementação local em disco (STORAGE_PATH), fora
da pasta pública. A chave interna é aleatória (24 bytes hex), sem entrada do usuário,
evitando path traversal. Gravação com flag wx (não sobrescreve). Provider S3/MinIO é
um item pendente (STORAGE_PROVIDER=s3).

## Validação de segurança
- Extensão em allowlist (imagens, pdf, txt/csv/md/log/json, docx/xlsx/pptx, zip).
- Tipo real detectado por file-type; para binários, o MIME detectado precisa estar na
  lista permitida; para texto, um binário disfarçado é recusado.
- Executáveis e conteúdo incompatível com a extensão sao bloqueados.
- Limite de tamanho (MAX_UPLOAD_BYTES) e de quantidade por atividade
  (MAX_ATTACHMENTS_PER_ACTIVITY).
- Checksum SHA-256; nome original higienizado (basename, sem control/reservados).

## Autorização
Só o autor da atividade anexa e remove. Baixa quem pode ver a atividade: o autor,
gestor+ ou quem participa do projeto. Download com Content-Disposition attachment.

## Auditoria e realtime
Upload e remoção geram registro de auditoria. O upload emite activity.updated na
outbox para o frontend atualizar a lista de anexos.

## Pendências
Provider S3/MinIO, quarentena/antivírus (ClamAV) com estado de quarentena, e streaming
no lugar de bufferizar o arquivo. Upload/download pela tela exige alterar o HTML (§4.3).
