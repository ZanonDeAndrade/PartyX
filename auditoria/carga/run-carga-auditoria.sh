#!/bin/bash
# Teste de carga da auditoria (k6), SÓ no servidor local com PostgreSQL de teste e gateway FICTÍCIO. Nunca produção.
# Modelo: evento de 500 ingressos numa cidade pequena. Fase A: abertura das vendas (VISITANTES pessoas nos primeiros minutos por 10 min
# e PEDIDOS_POR_MIN compras por minuto). Fase B: WEBHOOKS notificações em 5 min e LEITURAS leituras na portaria por 3 validadores
# (tempo comprimido em PORTARIA_DURACAO; a quantidade é a do dia do evento). Em seguida, as invariantes do banco.
# Uso: auditoria/carga/run-carga-auditoria.sh [escala=1]   (escala 3 = 900 pessoas, 180 pedidos/min, 1500 webhooks, 1500 leituras, 1500 ingressos)
# Saída: auditoria/.run/carga-<escala>/ (k6 JSON e texto, amostras de recursos, fila de e-mails, invariantes) e docs/relatorios/carga/.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
ESCALA=${1:-1}
PORT=8113
WORK="$ROOT/auditoria/.run/carga-$ESCALA"
OUT="$ROOT/docs/relatorios/carga"
K6_IMAGE=grafana/k6:1.0.0
VISITANTES=$((300 * ESCALA)); PEDIDOS=$((60 * ESCALA)); WEBHOOKS=$((500 * ESCALA)); LEITURAS=$((500 * ESCALA)); COMPRADORES=$((700 * ESCALA + 100))

cd "$ROOT"
: "${TEST_DATABASE_URL:=postgres://partyx:partyx_test_only@127.0.0.1:55432/postgres}"; export TEST_DATABASE_URL
[[ "$TEST_DATABASE_URL" == *neon.tech* ]] && { echo "recusado: Neon" >&2; exit 1; }
[ -f dist/index.html ] || npx vite build
npm run -s build:server

rm -rf "$WORK"; mkdir -p "$WORK/server" "$OUT"; chmod 777 "$WORK"
PARTYX_ALLOW_MISSING_APP_ROLE=1 npx tsx auditoria/carga/seed-carga-auditoria.mts "$WORK/seed.json" "$COMPRADORES" "$ESCALA"
URL=$(node -e "console.log(require('$WORK/seed.json').url)")

# Servidor como no Cloud Run: heap de 320 MB, DB_POOL_MAX=5, empacotado (dist-server).
(cd "$WORK/server" && exec env -i PATH="$PATH" HOME="$HOME" APP_ENV=local NODE_ENV=production PAYMENT_GATEWAY=mock PORT=$PORT \
  DATABASE_URL="$URL" DATABASE_URL_DIRECT="$URL" DB_POOL_MAX=5 WEB_DIST_DIR="$ROOT/dist" PUBLIC_BASE_URL="http://localhost:$PORT" \
  TRUSTED_PROXY_HOPS=1 RESERVATION_MINUTES=30 MAX_TICKETS_PER_ORDER=6 PARTYX_SUPPORT_EMAIL=atendimento@partyx.test \
  node --max-old-space-size=320 "$ROOT/dist-server/index.js" > "$WORK/server.log" 2>&1) &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; kill $SAMPLER 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/api/health" > /dev/null && break; sleep 0.5; done
node auditoria/carga/amostrador.mjs "$URL" "$SERVER" "$WORK/recursos.jsonl" &
SAMPLER=$!

echo "== Fase A: abertura ($VISITANTES pessoas) e pedidos ($PEDIDOS/min) por 10 min"
set +e
docker run --rm --network host -v "$ROOT/auditoria/carga:/scripts:ro" -v "$WORK:/out" \
  -e BASE_URL="http://localhost:$PORT" -e SEED_FILE=/out/seed.json -e VISITANTES="$VISITANTES" -e PEDIDOS_POR_MIN="$PEDIDOS" -e DURACAO=10m \
  "$K6_IMAGE" run --quiet --summary-export=/out/k6-fase-a.json /scripts/fase-a.k6.js 2>&1 | tee "$WORK/k6-fase-a.txt"
A_STATUS=${PIPESTATUS[0]}
set -e
PARTYX_ALLOW_MISSING_APP_ROLE=1 npx tsx auditoria/carga/dump-dados.mts "$WORK/seed.json" "$WORK/dump.json" | tee "$WORK/dump.txt"

echo "== Fase B: $WEBHOOKS webhooks em 5 min e $LEITURAS leituras (3 validadores) em 9 min"
set +e
docker run --rm --network host -v "$ROOT/auditoria/carga:/scripts:ro" -v "$WORK:/out" \
  -e BASE_URL="http://localhost:$PORT" -e SEED_FILE=/out/seed.json -e DUMP_FILE=/out/dump.json -e WEBHOOKS="$WEBHOOKS" -e LEITURAS="$LEITURAS" \
  -e WEBHOOK_DURACAO=5m -e PORTARIA_DURACAO=9m \
  "$K6_IMAGE" run --quiet --summary-export=/out/k6-fase-b.json /scripts/fase-b.k6.js 2>&1 | tee "$WORK/k6-fase-b.txt"
B_STATUS=${PIPESTATUS[0]}
set -e
kill $SAMPLER 2>/dev/null || true

# Fila de e-mails: tempo entre criar e enviar (captura local, sem SMTP), e invariantes.
node -e "
const pg=require('pg'); const p=new pg.Pool({connectionString: process.argv[1], max:1});
p.query(\"select count(*)::int as n, count(*) filter (where status='enviado')::int as enviados, count(*) filter (where status='falhou')::int as falhou, percentile_cont(0.5) within group (order by extract(epoch from (sent_at - created_at))) as p50_s, percentile_cont(0.95) within group (order by extract(epoch from (sent_at - created_at))) as p95_s, max(extract(epoch from (sent_at - created_at))) as max_s from email_log\").then(r=>{require('fs').writeFileSync(process.argv[2], JSON.stringify(r.rows[0])); console.log('fila de e-mails:', JSON.stringify(r.rows[0])); return p.end();});
" "$URL" "$WORK/emails.json"
node auditoria/ferramentas/invariantes.mjs "$URL" | tee "$WORK/invariantes.md" || true
node auditoria/carga/relatorio-carga.mjs "$WORK" "$OUT" "$ESCALA" "$A_STATUS" "$B_STATUS"
echo "fase A k6 exit=$A_STATUS; fase B k6 exit=$B_STATUS"
