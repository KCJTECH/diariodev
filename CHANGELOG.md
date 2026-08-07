## [v0.0.1] - 2026-08-07 (publish)

revisao das permissoes documentada e limpeza do .gitignore apos o deploy.sh sair do repositorio

⚠️ Contrato e integração não rodaram (banco diariodev_test ausente).

## Correções
- Removido o arquivo `deploy.env` do `.gitignore`, que não era mais necessário após a remoção do script `deploy.sh` do repositório, simplificando a gestão de arquivos ignorados.
- Atualização do `.gitignore` para incluir o diretório `backend/.dist-prev/` como artefato do `deploy.sh`, que agora é mantido apenas para rollback, garantindo uma melhor organização dos arquivos.

## Novidades
- Revisão das permissões de usuários documentada em `conversa.md`, com uma análise detalhada das camadas de autorização e a estrutura de níveis de acesso (DEV, GESTOR, CEO), proporcionando maior clareza sobre como as permissões são aplicadas no sistema.
- Inclusão de uma seção em `memoria.md` que resume a revisão das permissões, destacando o estado atual dos usuários e grupos no banco de dados, além da descrição das camadas de autorização.

## Interno
- Documentação atualizada para refletir a revisão das permissões, incluindo detalhes sobre a estrutura de grupos e a lógica de autorização, facilitando a compreensão para desenvolvedores e administradores do sistema.

### Resumo
Nesta versão, foram feitas correções na gestão de arquivos do repositório e uma revisão detalhada das permissões de usuários, que agora estão melhor documentadas. A estrutura de níveis de acesso foi esclarecida, garantindo que todos os usuários entendam suas permissões e limitações dentro do sistema.

_Release notes geradas por IA (gpt-4o-mini); revise antes de divulgar._

# Changelog

Versões publicadas via deploy.sh (semver).

