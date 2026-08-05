#!/usr/bin/env bash
# Restart da API e do worker do Diario Dev em servidor sem systemd.
# Uso, no servidor: bash /caminho/do/projeto/restart.sh
#
# Por que isto e um arquivo, e nao um comando inline por ssh: o pkill -f casa contra
# a linha de comando completa dos processos. Um comando inline via
# `ssh host '... pkill -f dist/src/server.js ... node dist/src/server.js ...'` contem
# o proprio padrao na sua argv, entao o pkill mata a sessao SSH antes de subir os
# processos e a aplicacao fica fora do ar. Isso aconteceu duas vezes em 2026-08-05,
# inclusive com o truque de colchete no padrao, que nao protege porque a linha de
# subida traz o caminho sem colchete. Como script, a argv do shell e so
# "bash restart.sh" e o problema deixa de existir.
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend" || { echo "ERRO: $ROOT/backend nao encontrado"; exit 1; }
mkdir -p "$ROOT/logs"

pkill -f "dist/src/server.js" || true
pkill -f "dist/src/workers/index.js" || true
sleep 2

setsid nohup node dist/src/server.js        > "$ROOT/logs/api.log"    2>&1 < /dev/null &
setsid nohup node dist/src/workers/index.js > "$ROOT/logs/worker.log" 2>&1 < /dev/null &
sleep 6

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if OUT=$(curl -sf -m 3 http://127.0.0.1:3333/health/ready); then
    echo "OK: $OUT"
    echo "api:    $(pgrep -cf 'dist/src/serve[r].js') processo(s)"
    echo "worker: $(pgrep -cf 'dist/src/worker[s]/index.js') processo(s)"
    exit 0
  fi
  sleep 2
done

echo "FALHA: a API nao respondeu em /health/ready. Ultimas linhas do log:"
tail -15 "$ROOT/logs/api.log"
exit 1
