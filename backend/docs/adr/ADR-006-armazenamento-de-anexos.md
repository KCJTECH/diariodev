# ADR-006: Armazenamento de anexos

## Contexto
Upload seguro de anexos, com download autenticado, sem servir arquivos por caminho
previsível.

## Decisão
Abstração de storage. Implementação local em disco (fora da pasta pública), com chave
interna aleatória, gravação sem sobrescrita e download por endpoint autenticado com
Content-Disposition attachment. Validação por extensão, tipo real (file-type),
bloqueio de executáveis e de conteúdo incompatível, limites de tamanho/quantidade e
checksum.

## Consequências
Seguro e simples para desenvolvimento. Provider S3/MinIO fica como extensão da mesma
abstração. O arquivo é bufferizado para validar e calcular checksum; para arquivos
grandes, streaming seria melhor (item pendente). Antivírus (ClamAV) com quarentena é
uma extensão prevista.
