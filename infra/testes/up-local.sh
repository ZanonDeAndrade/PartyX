#!/bin/bash
# uso: up.sh SP [extra env...]
SP=$1; shift
cd "/home/arthur-zanon/Área de trabalho/Projetos/PartyX"
URL=$(python3 -c "import json;print(json.load(open('$SP/seed24.json'))['url'])")
env DATABASE_URL=$URL DATABASE_URL_DIRECT=$URL APP_ENV=local PAYMENT_GATEWAY=mock PORT=8099 WEB_DIST_DIR=dist PUBLIC_BASE_URL=http://localhost:8099 TRUSTED_PROXY_HOPS=1 "$@" node --import tsx server/src/index.ts > $SP/server.log 2>&1 &
echo $! > $SP/server.pid
