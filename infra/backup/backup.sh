#!/bin/sh
# Backup lógico diário do banco do PartyX para um bucket PRIVADO do Cloud Storage (independente do histórico do Neon).
#
# Entradas (variáveis de ambiente):
#   DATABASE_URL_BACKUP  conexão DIRETA (não a pooled) do papel `partyx_backup` (só leitura). Segredo: nunca é impresso.
#   BACKUP_BUCKET        nome do bucket (sem gs://)
#   ACCESS_TOKEN         opcional: só para rodar fora do Google Cloud; no Cloud Run o token vem do servidor de metadados
#   MIN_DUMP_BYTES       tamanho mínimo aceitável do arquivo (padrão 10240); abaixo disso a cópia é considerada suspeita
#
# Passos: dump -> confere o arquivo (lista o conteúdo) -> manifesto com contagem de linhas -> SHA-256 -> envia -> confere no
# bucket (tamanho e MD5) -> registra o sucesso. Qualquer falha sai com código 1 e registra `backup_falhou` (alerta).
# O log é JSON, uma linha por evento, no formato do Cloud Logging. Nada de segredo ou dado pessoal no log.
set -eu

log() { # severidade, mensagem, campos extras (JSON)
  printf '{"severity":"%s","message":"%s","time":"%s"%s}\n' "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${3:+,$3}"
}
fail() { log ERROR "backup falhou: $1" '"alert":"backup_falhou"'; exit 1; }

: "${DATABASE_URL_BACKUP:?}" "${BACKUP_BUCKET:?}"
# O libpq recusa `sslmode=require` junto de `PGSSLROOTCERT=system` ("weak sslmode require may not be used with sslrootcert=system").
# URL do Neon com `require` sobe para `verify-full` (mais forte: confere o certificado, que é de CA pública). Descoberto na produção.
DATABASE_URL_BACKUP="$(printf '%s' "$DATABASE_URL_BACKUP" | sed 's/sslmode=require/sslmode=verify-full/')"
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-10240}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DIR="$(mktemp -d)"
NAME="partyx-$STAMP"
PREFIX="daily/$(date -u +%Y/%m)"
trap 'rm -rf "$DIR"' EXIT
START="$(date +%s)"

token() {
  if [ -n "${ACCESS_TOKEN:-}" ]; then printf '%s' "$ACCESS_TOKEN"; return; fi
  curl -sS -f -H 'Metadata-Flavor: Google' \
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' | jq -r .access_token
}
enc() { jq -rn --arg s "$1" '$s|@uri'; }

TOKEN="$(token)" || fail "não obteve o token de acesso ao Cloud Storage"
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || fail "token de acesso vazio"

# 1) Dump no formato custom (compactado, restaurável por partes). Sem donos e sem privilégios: a restauração é num banco isolado.
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$DIR/$NAME.dump" "$DATABASE_URL_BACKUP" 2>"$DIR/dump.err" \
  || fail "pg_dump falhou ($(head -c 400 "$DIR/dump.err" | tr -d '"\\' | tr '\n' ' '))"
SIZE="$(wc -c < "$DIR/$NAME.dump" | tr -d ' ')"
[ "$SIZE" -ge "$MIN_DUMP_BYTES" ] || fail "arquivo pequeno demais ($SIZE bytes, mínimo $MIN_DUMP_BYTES)"

# 2) O arquivo precisa ser legível e ter conteúdo: lista as entradas.
ENTRIES="$(pg_restore --list "$DIR/$NAME.dump" 2>/dev/null | grep -c '^[0-9]' || true)"
[ "$ENTRIES" -ge 20 ] || fail "o arquivo não lista o conteúdo esperado ($ENTRIES entradas)"

# 3) Manifesto: contagem de linhas por tabela e migrações aplicadas. Serve de conferência na restauração.
#    (Medido logo antes do dump: tabelas que só crescem devem ter, na restauração, pelo menos estas linhas.)
{
  printf '{"generatedAt":"%s","dump":"%s.dump","server":%s,"migrations":%s,"tables":{' "$STAMP" "$NAME" \
    "$(psql "$DATABASE_URL_BACKUP" -At -c 'show server_version' | jq -R .)" \
    "$(psql "$DATABASE_URL_BACKUP" -At -c 'select count(*) from drizzle.__drizzle_migrations')"
  psql "$DATABASE_URL_BACKUP" -At -F '|' -c "
    select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
      from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1" \
    | awk -F'|' 'BEGIN{first=1}{printf "%s\"%s\":%s", (first?"":","), $1, $2; first=0}'
  printf '}}\n'
} > "$DIR/$NAME.manifest.json" 2>"$DIR/manifest.err" || fail "manifesto não gerado ($(head -c 400 "$DIR/manifest.err" | tr -d '"\\' | tr '\n' ' '))"
jq -e . "$DIR/$NAME.manifest.json" >/dev/null || fail "manifesto inválido"

( cd "$DIR" && sha256sum "$NAME.dump" > "$NAME.dump.sha256" )

# 4) Envio e conferência no bucket (tamanho e MD5 do objeto contra o arquivo local).
upload() { # arquivo local, nome do objeto, tipo
  curl -sS -f -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: $3" --data-binary @"$1" \
    "https://storage.googleapis.com/upload/storage/v1/b/$BACKUP_BUCKET/o?uploadType=media&name=$(enc "$2")" >/dev/null
}
upload "$DIR/$NAME.dump" "$PREFIX/$NAME.dump" application/octet-stream || fail "envio do dump falhou"
upload "$DIR/$NAME.manifest.json" "$PREFIX/$NAME.manifest.json" application/json || fail "envio do manifesto falhou"
upload "$DIR/$NAME.dump.sha256" "$PREFIX/$NAME.dump.sha256" text/plain || fail "envio do SHA-256 falhou"

META="$(curl -sS -f -H "Authorization: Bearer $TOKEN" "https://storage.googleapis.com/storage/v1/b/$BACKUP_BUCKET/o/$(enc "$PREFIX/$NAME.dump")?fields=size,md5Hash")" \
  || fail "não conseguiu conferir o objeto enviado"
LOCAL_MD5="$(openssl md5 -binary "$DIR/$NAME.dump" | base64)"
[ "$(echo "$META" | jq -r .size)" = "$SIZE" ] || fail "tamanho no bucket difere do arquivo local"
[ "$(echo "$META" | jq -r .md5Hash)" = "$LOCAL_MD5" ] || fail "MD5 no bucket difere do arquivo local"

log INFO "backup concluído" "\"alert\":\"backup_ok\",\"object\":\"gs://$BACKUP_BUCKET/$PREFIX/$NAME.dump\",\"bytes\":$SIZE,\"entries\":$ENTRIES,\"seconds\":$(( $(date +%s) - START ))"
