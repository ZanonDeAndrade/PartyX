#!/usr/bin/env bash
# Restaura um backup do PartyX em um banco ISOLADO e confere. NUNCA restaura por cima de um banco em uso.
#
# Uso:  TARGET_URL=<url do banco vazio e isolado> infra/backup/restore.sh <gs://bucket/daily/AAAA/MM/partyx-....dump | latest>
#       Para "latest": PROJECT=<projeto> (procura em gs://$PROJECT-backups/daily/)
#
# Travas: o banco de destino precisa se chamar restore_* (ou teste_*), estar VAZIO e não estar em PROTECTED_HOSTS (lista de hosts
# separados por vírgula, ex.: o host do Neon de produção). O cliente do PostgreSQL (pg_restore) precisa ser da versão do servidor ou maior.
# PG_DOCKER=1 roda psql e pg_restore pela imagem postgres:18-alpine (para quem não tem o cliente do PostgreSQL 18 instalado; usa --network host).
# Saída: 0 = restaurado e todas as verificações OK; 1 = falhou; 2 = uso errado ou trava acionada.
set -euo pipefail
cd "$(dirname "$0")/../.."

SRC="${1:-}"; : "${TARGET_URL:?informe TARGET_URL (banco de destino isolado)}"
# Ferramentas do PostgreSQL: do sistema ou pela imagem oficial (a mesma versão principal do servidor do Neon).
# Destino com sslmode=verify-*: defina PGSSLROOTCERT=system (raízes de confiança do sistema).
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
pgtool() { # ferramenta, argumentos...
  if [ "${PG_DOCKER:-0}" = "1" ]; then docker run --rm --network host -v "$WORK:$WORK" ${PGSSLROOTCERT:+-e PGSSLROOTCERT} postgres:18-alpine "$@"; else "$@"; fi
}
[ -n "$SRC" ] || { echo "informe a cópia (gs://.../partyx-....dump ou latest)" >&2; exit 2; }

DBNAME="$(node -e "const u=new URL(process.env.TARGET_URL);console.log(decodeURIComponent(u.pathname.slice(1)))")"
HOST="$(node -e "console.log(new URL(process.env.TARGET_URL).hostname)")"
case "$DBNAME" in restore_*|teste_*) ;; *) echo "TRAVA: o banco de destino deve se chamar restore_* ou teste_* (recebi '$DBNAME'). Isto impede restaurar sobre produção." >&2; exit 2;; esac
IFS=',' read -ra protected <<< "${PROTECTED_HOSTS:-}"
for h in "${protected[@]:-}"; do [ -z "$h" ] || [ "$h" != "$HOST" ] || { echo "TRAVA: $HOST está em PROTECTED_HOSTS." >&2; exit 2; }; done
TABLES="$(pgtool psql "$TARGET_URL" -At -c "select count(*) from information_schema.tables where table_schema in ('public','drizzle')")"
[ "$TABLES" = "0" ] || { echo "TRAVA: o banco de destino não está vazio ($TABLES tabelas). Use um banco novo." >&2; exit 2; }

if [ "$SRC" = "latest" ]; then
  : "${PROJECT:?informe PROJECT para usar 'latest'}"
  SRC="$(gcloud storage ls -l "gs://${PROJECT}-backups/daily/**" --project="$PROJECT" | grep '\.dump$' | sort -k2 | tail -1 | awk '{print $3}')"
  [ -n "$SRC" ] || { echo "nenhuma cópia encontrada" >&2; exit 1; }
fi
BASE="${SRC%.dump}"
echo "Cópia: $SRC"
START=$(date +%s)
gcloud storage cp "$SRC" "$BASE.manifest.json" "$SRC.sha256" "$WORK/" >/dev/null
F="$WORK/$(basename "$SRC")"
( cd "$WORK" && sha256sum -c "$(basename "$SRC").sha256" ) || { echo "FALHA: SHA-256 não confere: a cópia está corrompida." >&2; exit 1; }
echo "SHA-256 confere. Restaurando em $HOST/$DBNAME ..."
pgtool pg_restore --no-owner --no-privileges --exit-on-error --jobs=2 --dbname="$TARGET_URL" "$F"
echo "Restaurado em $(( $(date +%s) - START )) s. Conferindo..."
DATABASE_URL="$TARGET_URL" npm run -s backup:verify -- "$WORK/$(basename "$BASE").manifest.json"
