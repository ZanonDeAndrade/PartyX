#!/bin/bash
# Ensaio de rollback no ambiente LOCAL, cronometrado, seguindo docs/operacao/runbooks/rollback.md:
#  1) "só o código": servidor empacotado (dist-server, a versão nova) no ar; troca para a versão anterior (o mesmo empacotado guardado como
#     "anterior") na mesma porta e mede o tempo até /api/health/ready responder;
#  2) "revisão nova tinha migração": num banco de teste com todas as migrações (inclusive a 0017 da taxa, não comitada), aplica o SQL de
#     reversão drizzle/rollback/0017_taxa_de_servico.down.sql via npm run db:rollback (APP_ENV=local) e mede o tempo; depois reaplica.
#  Em produção os passos equivalentes são `deploy.sh rollback` (update-traffic) e, só com decisão humana, a reversão por SQL.
# Nada toca a nuvem. Uso: auditoria/ferramentas/ensaio-rollback.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd); cd "$ROOT"
: "${TEST_DATABASE_URL:=postgres://partyx:partyx_test_only@127.0.0.1:55432/postgres}"; export TEST_DATABASE_URL
WORK="$ROOT/auditoria/.run/rollback"; rm -rf "$WORK"; mkdir -p "$WORK/anterior" "$WORK/server"
npm run -s build:server
cp -r dist-server "$WORK/anterior/dist-server"   # "revisão anterior" (mesmo código: o ensaio mede o mecanismo e o tempo, não a diferença)
PARTYX_ALLOW_MISSING_APP_ROLE=1 npx tsx auditoria/e2e/support/seed-auditoria.mts "$WORK/seed.json" >/dev/null
URL=$(node -e "console.log(require('$WORK/seed.json').url)")
PORT=8131
start() { # pasta do empacotado
  (cd "$WORK/server" && exec env -i PATH="$PATH" HOME="$HOME" APP_ENV=local NODE_ENV=production PAYMENT_GATEWAY=mock PORT=$PORT DATABASE_URL="$URL" DATABASE_URL_DIRECT="$URL" \
    WEB_DIST_DIR="$ROOT/dist" PUBLIC_BASE_URL="http://localhost:$PORT" TRUSTED_PROXY_HOPS=1 PARTYX_SUPPORT_EMAIL=atendimento@partyx.test node "$1/index.js" > "$WORK/server-$2.log" 2>&1) &
  echo $!
}
ready() { for _ in $(seq 1 120); do curl -sf "http://localhost:$PORT/api/health/ready" | grep -q '"database":"ok"' && return 0; sleep 0.25; done; return 1; }
echo "== 1) rollback só de código"
NEW=$(start "$ROOT/dist-server" nova); ready || { echo "versão nova não subiu"; exit 1; }
T0=$(date +%s%N)
kill "$NEW"; wait "$NEW" 2>/dev/null || true          # encerra a revisão nova (SIGTERM, como o Cloud Run)
OLD=$(start "$WORK/anterior/dist-server" anterior); ready || { echo "versão anterior não subiu"; exit 1; }
T1=$(date +%s%N)
echo "tempo da troca (parar a nova e subir a anterior até /api/health/ready com banco ok): $(( (T1 - T0) / 1000000 )) ms"
curl -s "http://localhost:$PORT/" -o /dev/null -w "página inicial depois do rollback: HTTP %{http_code}\n"
kill "$OLD"; wait "$OLD" 2>/dev/null || true
echo "== 2) rollback de migração (0017, taxa de serviço) num banco de teste"
echo "migrações antes: $(node -e "const pg=require('pg');new pg.Client({connectionString:'$URL'}).connect().then(async c=>{console.log((await c.query('select count(*) from drizzle.__drizzle_migrations')).rows[0].count);await c.end()})")"
T2=$(date +%s%N)
set +e
APP_ENV=local DATABASE_URL="$URL" DATABASE_URL_DIRECT="$URL" PARTYX_ALLOW_MISSING_APP_ROLE=1 npm run -s db:rollback 2>&1 | tail -5
RB=$?
set -e
T3=$(date +%s%N)
echo "db:rollback exit=$RB em $(( (T3 - T2) / 1000000 )) ms"
echo "migrações depois: $(node -e "const pg=require('pg');new pg.Client({connectionString:'$URL'}).connect().then(async c=>{console.log((await c.query('select count(*) from drizzle.__drizzle_migrations')).rows[0].count);await c.end()})")"
echo "== 3) reaplicar a migração"
T4=$(date +%s%N)
APP_ENV=local DATABASE_URL="$URL" DATABASE_URL_DIRECT="$URL" PARTYX_ALLOW_MISSING_APP_ROLE=1 npm run -s db:migrate 2>&1 | tail -3
echo "reaplicação em $(( ($(date +%s%N) - T4) / 1000000 )) ms"
