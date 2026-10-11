#!/bin/bash
# Sobe o servidor LOCAL com dados fictícios para as capturas de UI (docs/ui). Nunca aponta para o Neon.
# Uso: infra/ui/up-ui.sh <pasta-de-trabalho> <pasta-do-build-do-front-end>
# O servidor roda com a pasta de trabalho como diretório atual: e-mails e banners fictícios ficam em <pasta>/.data,
# sem misturar com o .data do projeto. Para parar: kill $(cat <pasta>/server.pid)
set -euo pipefail
SP=$(realpath "$1")
DIST=$(realpath "$2")
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
mkdir -p "$SP/run"
cd "$ROOT"
PARTYX_ALLOW_MISSING_APP_ROLE=1 npx tsx infra/ui/seed-ui.mts "$SP"
URL=$(node -e "console.log(require('$SP/seed-ui.json').url)")
cd "$SP/run"
env DATABASE_URL="$URL" DATABASE_URL_DIRECT="$URL" APP_ENV=local PAYMENT_GATEWAY=mock PORT=8099 WEB_DIST_DIR="$DIST" \
  PUBLIC_BASE_URL=http://localhost:8099 TRUSTED_PROXY_HOPS=1 RESERVATION_MINUTES=60 \
  PARTYX_SUPPORT_EMAIL=atendimento@exemplo.com PARTYX_SUPPORT_WHATSAPP="+55 11 90000-0000" \
  node --import "$ROOT/node_modules/tsx/dist/loader.mjs" "$ROOT/server/src/index.ts" > "$SP/server.log" 2>&1 &
echo $! > "$SP/server.pid"
for _ in $(seq 1 60); do
  curl -sf http://localhost:8099/api/health > /dev/null && break
  sleep 0.5
done
cd "$ROOT"
BASE_URL=http://localhost:8099 npx tsx infra/ui/flows-ui.mts "$SP"
