#!/usr/bin/env bash
# Verificação diária do backup (Anexo II): a cópia do dia existe, é recente e não está vazia. SOMENTE LEITURA.
# Uso: PROJECT=partyx-prod ./infra/operacao/check-backup.sh        (padrão de procura: gs://$PROJECT-backups/)
# Saída: 0 = ok; 1 = FALHA (nenhuma cópia, cópia velha ou vazia); 2 = não deu para verificar (sem acesso).
# Não prova que a cópia RESTAURA: isso é o ensaio trimestral (docs/operacao/runbooks/restauracao.md).
set -uo pipefail
: "${PROJECT:?informe PROJECT}"
BUCKET="${BUCKET:-gs://${PROJECT}-backups}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"     # 24 h de ciclo + 2 h de folga
MIN_BYTES="${MIN_BYTES:-10240}"          # um dump real tem mais que 10 KB; abaixo disso é suspeito

if ! out="$(gcloud storage ls -l --project="$PROJECT" "$BUCKET/**" 2>&1)"; then
  echo "NÃO VERIFICADO: sem acesso ao $BUCKET ($(echo "$out" | head -1))"; exit 2
fi
# Linhas: <bytes>  <data ISO>  <gs://...>. A última linha é o total.
# Só os arquivos de dump contam (o manifesto e o SHA-256 ficam ao lado e são pequenos de propósito).
latest="$(echo "$out" | grep -E '^ *[0-9]+ +[0-9T:-]+Z +gs://.*\.dump$' | sort -k2 | tail -1)"
if [ -z "$latest" ]; then echo "FALHA: nenhuma cópia em $BUCKET"; exit 1; fi
bytes="$(echo "$latest" | awk '{print $1}')"; when="$(echo "$latest" | awk '{print $2}')"; obj="$(echo "$latest" | awk '{print $3}')"
age_h=$(( ( $(date -u +%s) - $(date -u -d "$when" +%s) ) / 3600 ))
echo "Última cópia: $obj | $bytes bytes | $when | ${age_h} h atrás"
rc=0
if [ "$age_h" -gt "$MAX_AGE_HOURS" ]; then echo "FALHA: a última cópia tem ${age_h} h (limite ${MAX_AGE_HOURS} h). O backup diário NÃO rodou."; rc=1; fi
if [ "$bytes" -lt "$MIN_BYTES" ]; then echo "FALHA: a cópia tem só $bytes bytes (mínimo $MIN_BYTES)."; rc=1; fi
[ "$rc" = 0 ] && echo "OK"
exit "$rc"
