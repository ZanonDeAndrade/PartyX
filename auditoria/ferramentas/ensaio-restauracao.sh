#!/bin/bash
# Ensaio de restauração: restaura a cópia mais recente do backup de PRODUÇÃO (lida do bucket em modo leitura) num PostgreSQL 18 LOCAL,
# descartável, e roda as 20 verificações do projeto (infra/backup/restore.sh + npm run backup:verify) mais as invariantes da auditoria.
# Nada é escrito na nuvem. O banco local é apagado no fim. Nenhum dado pessoal é impresso.
# Uso: auditoria/ferramentas/ensaio-restauracao.sh [gs://.../partyx-....dump | latest]
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd); cd "$ROOT"
SRC=${1:-latest}
NAME=partyx-restore-ensaio
PORT=55433
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_USER=partyx -e POSTGRES_PASSWORD=ensaio_local -e POSTGRES_DB=restore_auditoria -p 127.0.0.1:$PORT:5432 --tmpfs /var/lib/postgresql postgres:18-alpine >/dev/null
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U partyx >/dev/null 2>&1 && break; sleep 1; done
START=$(date +%s)
TARGET_URL="postgres://partyx:ensaio_local@127.0.0.1:$PORT/restore_auditoria" PG_DOCKER=1 PROJECT=partyx-producao PROTECTED_HOSTS="$(echo "${PROTECTED_HOSTS:-}")" \
  ./infra/backup/restore.sh "$SRC"
echo "restauração e verificações do projeto: $(( $(date +%s) - START )) s"
echo "== invariantes da auditoria no banco restaurado (só leitura)"
node auditoria/ferramentas/invariantes.mjs "postgres://partyx:ensaio_local@127.0.0.1:$PORT/restore_auditoria" || true
echo "== contagens (sem dado pessoal)"
docker exec "$NAME" psql -U partyx -d restore_auditoria -At -c "select 'users='||count(*) from users union all select 'orders='||count(*) from orders union all select 'tickets='||count(*) from tickets union all select 'checkins='||count(*) from checkins union all select 'migracoes='||count(*) from drizzle.__drizzle_migrations"
docker rm -f "$NAME" >/dev/null
echo "banco local do ensaio apagado"
