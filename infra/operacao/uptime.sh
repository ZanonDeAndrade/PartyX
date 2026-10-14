#!/usr/bin/env bash
# Verificação de disponibilidade (Cloud Monitoring) pelo ENDEREÇO PÚBLICO e alerta por e-mail quando ela falha. Idempotente.
# Uso: PROJECT=<projeto> PUBLIC_BASE_URL=https://<endereço público> NOTIFY_EMAIL=<e-mail> ./infra/operacao/uptime.sh
#
# Confere https://<endereço>/api/health/ready a cada 5 minutos, de três regiões, exigindo 200 e o texto "database":"ok" (site no ar E
# banco respondendo). O alerta abre quando a verificação falha em duas ou mais regiões por 10 minutos, para não avisar por falha de
# uma região só. Custo: as verificações são gratuitas até 1 milhão por mês; a política conta como uma condição de alerta.
# Observação: a verificação mantém o Cloud Run e o Neon acordados a cada 5 minutos (3 requisições leves).
# Também valida o certificado: um certificado vencido ou trocado no intermediário (Vercel ou Firebase) dispara o alerta, assim
# como uma pausa do projeto na Vercel (503 DEPLOYMENT_PAUSED, sem o texto "database":"ok").
# Cada endereço tem a sua verificação (NAME) e a sua política, com o host no nome: dá para manter duas durante uma troca.
set -euo pipefail
: "${PROJECT:?informe PROJECT}"
: "${PUBLIC_BASE_URL:?informe PUBLIC_BASE_URL}"
: "${NOTIFY_EMAIL:?informe NOTIFY_EMAIL}"
NAME="${NAME:-partyx-saude-publica}"
HOST="$(python3 -I -c 'import sys,urllib.parse as u; x=u.urlsplit(sys.argv[1]); assert x.scheme=="https" and x.netloc; print(x.netloc)' "$PUBLIC_BASE_URL")"
POLICY="${POLICY:-PartyX: saúde indisponível ($HOST)}"
g() { gcloud --project="$PROJECT" "$@"; }

CH="$(g alpha monitoring channels list --filter="labels.email_address=\"$NOTIFY_EMAIL\"" --format='value(name)' 2>/dev/null | head -1 || true)"
[ -n "$CH" ] || CH="$(g alpha monitoring channels create --display-name="PartyX operação ($NOTIFY_EMAIL)" --type=email --channel-labels="email_address=$NOTIFY_EMAIL" --format='value(name)')"

CHECK="$(g monitoring uptime list-configs --filter="displayName=\"$NAME\"" --format='value(name)' 2>/dev/null | head -1 || true)"
if [ -z "$CHECK" ]; then
  g monitoring uptime create "$NAME" --resource-type=uptime-url --resource-labels="host=$HOST,project_id=$PROJECT" \
    --protocol=https --path=/api/health/ready --period=5 --timeout=10 --validate-ssl=true \
    --matcher-content='"database":"ok"' --matcher-type=contains-string \
    --regions=usa-virginia,europe,south-america >/dev/null
  CHECK="$(g monitoring uptime list-configs --filter="displayName=\"$NAME\"" --format='value(name)' | head -1)"
fi
CHECK_ID="${CHECK##*/}"
[ -n "$CHECK_ID" ] || { echo "FALHOU: a verificação $NAME não foi encontrada depois de criada." >&2; exit 1; }

if [ -z "$(g alpha monitoring policies list --filter="displayName=\"$POLICY\"" --format='value(name)')" ]; then
  cat > "${TMPDIR:-/tmp}/policy-saude.json" <<JSON
{"displayName":"$POLICY","combiner":"OR","notificationChannels":["$CH"],
 "documentation":{"content":"O endereço público $PUBLIC_BASE_URL/api/health/ready falhou em duas ou mais regiões por 10 minutos. Ver docs/operacao/runbooks/indisponibilidade.md.","mimeType":"text/markdown"},
 "conditions":[{"displayName":"saúde pública falhando","conditionThreshold":{
   "filter":"metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"$CHECK_ID\" AND resource.type=\"uptime_url\"",
   "comparison":"COMPARISON_GT","thresholdValue":1,"duration":"600s",
   "aggregations":[{"alignmentPeriod":"300s","perSeriesAligner":"ALIGN_NEXT_OLDER","crossSeriesReducer":"REDUCE_COUNT_FALSE","groupByFields":["resource.label.host"]}],
   "trigger":{"count":1}}}],
 "alertStrategy":{"autoClose":"86400s"}}
JSON
  g alpha monitoring policies create --policy-from-file="${TMPDIR:-/tmp}/policy-saude.json" >/dev/null
fi
echo "ok: verificação $NAME ($CHECK_ID) em https://$HOST/api/health/ready a cada 5 min e política \"$POLICY\", avisando $NOTIFY_EMAIL"
