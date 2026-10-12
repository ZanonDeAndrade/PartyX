#!/bin/bash
# Teste de carga do PDF 11.3 (k6) contra o servidor LOCAL, com PostgreSQL de teste descartável e gateway FICTÍCIO.
# Nunca produção: o script só sobe e mede o servidor local; o k6 recusa qualquer BASE_URL que não seja localhost.
# Uso: infra/carga/run-carga.sh [duração=3m] [visitantes=200] [compras_por_min=50] [capacidade=240]
# Saída: docs/evidencias/carga/resultado.md (p95, erros, sobrevenda) e k6-resumo.json / k6-saida.txt.
# NODE_HEAP_MB=384 limita o heap do Node (perto dos 512 MiB do Cloud Run) e grava os arquivos com o sufixo -heap384.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DURACAO=${1:-3m}
VISITANTES=${2:-200}
COMPRAS=${3:-50}
CAPACIDADE=${4:-240}
PORT=8103
WORK="$ROOT/e2e/.run/carga"
OUT="$ROOT/docs/evidencias/carga"
K6_IMAGE=grafana/k6:1.0.0
SUFIXO=${NODE_HEAP_MB:+-heap$NODE_HEAP_MB}
HEAP_FLAG=${NODE_HEAP_MB:+--max-old-space-size=$NODE_HEAP_MB}

cd "$ROOT"
if [ -z "${TEST_DATABASE_URL:-}" ] && [ -f ./.env.test ]; then set -a; . ./.env.test; set +a; fi
if [ -z "${TEST_DATABASE_URL:-}" ] || [[ "$TEST_DATABASE_URL" == *neon.tech* ]]; then
  echo "recusado: defina TEST_DATABASE_URL do PostgreSQL de teste (npm run db:test:up)" >&2
  exit 1
fi
[ -f dist/index.html ] || npx vite build

rm -rf "$WORK"
mkdir -p "$WORK/server" "$OUT"
chmod 777 "$WORK" # o k6 roda no contêiner com outro usuário e grava o resumo aqui
PARTYX_ALLOW_MISSING_APP_ROLE=1 npx tsx infra/carga/seed-carga.mts "$WORK/seed.json" "$CAPACIDADE" 400
URL=$(node -e "console.log(require('$WORK/seed.json').url)")
SLUG=$(node -e "console.log(require('$WORK/seed.json').slug)")
TYPE_ID=$(node -e "console.log(require('$WORK/seed.json').typeId)")

# Mesmo tamanho de pool de conexões de homologação e produção (DB_POOL_MAX=5 nos scripts de deploy).
(cd "$WORK/server" && exec env -i PATH="$PATH" HOME="$HOME" APP_ENV=local NODE_ENV=production PAYMENT_GATEWAY=mock PORT=$PORT \
  DATABASE_URL="$URL" DATABASE_URL_DIRECT="$URL" DB_POOL_MAX=5 WEB_DIST_DIR="$ROOT/dist" PUBLIC_BASE_URL="http://localhost:$PORT" \
  TRUSTED_PROXY_HOPS=1 RESERVATION_MINUTES=30 PARTYX_SUPPORT_EMAIL=atendimento@exemplo.com \
  node $HEAP_FLAG --import "$ROOT/node_modules/tsx/dist/loader.mjs" "$ROOT/server/src/index.ts" > "$WORK/server.log" 2>&1) &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; kill $SAMPLER 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/api/health" > /dev/null && break; sleep 0.5; done
NODE_PID=$SERVER

# CPU (tiques acumulados de usuário + sistema, /proc) e memória (RSS em KB) do servidor a cada 2 s, durante a carga.
(while kill -0 "$NODE_PID" 2>/dev/null; do
  echo "$(date +%s.%N) $(awk '{print $14+$15}' /proc/$NODE_PID/stat) $(ps -o rss= -p "$NODE_PID")"
  sleep 2
done) > "$WORK/recursos.txt" &
SAMPLER=$!

set +e
docker run --rm --network host -v "$ROOT/infra/carga:/scripts:ro" -v "$WORK:/out" \
  -e BASE_URL="http://localhost:$PORT" -e SLUG="$SLUG" -e TYPE_ID="$TYPE_ID" -e DURACAO="$DURACAO" \
  -e VISITANTES="$VISITANTES" -e COMPRAS_POR_MIN="$COMPRAS" \
  "$K6_IMAGE" run --quiet --summary-export=/out/k6-resumo.json /scripts/carga.k6.js 2>&1 | tee "$WORK/k6-saida.txt"
K6_STATUS=${PIPESTATUS[0]}
set -e
kill $SAMPLER 2>/dev/null || true

npx tsx infra/carga/relatorio-carga.mts "$WORK" "$OUT" "$K6_STATUS" "$DURACAO" "$VISITANTES" "$COMPRAS" "${NODE_HEAP_MB:-}"
cp "$WORK/k6-resumo.json" "$OUT/k6-resumo$SUFIXO.json"
grep -v "^time=" "$WORK/k6-saida.txt" > "$OUT/k6-saida$SUFIXO.txt" || true
exit "$K6_STATUS"
