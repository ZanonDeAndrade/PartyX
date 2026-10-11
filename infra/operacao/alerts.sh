#!/usr/bin/env bash
# Alertas por log (Cloud Monitoring) para os sinais que o código já emite (campo `alert` no log JSON). NÃO FOI EXECUTADO.
# Cria uma métrica baseada em log por sinal e uma política de alerta por e-mail. Idempotente. Cria custo desprezível, mas altera o projeto.
# Uso: PROJECT=<projeto> NOTIFY_EMAIL=<e-mail da equipe> ./infra/operacao/alerts.sh
# Sinais (todos já existem em server/src; ver docs/operacao/README.md para o que fazer em cada um):
#   pago_sem_estoque        crítico para o cliente estornar no gateway
#   webhook_falhou          notificação de pagamento não processada
#   reconciliacao_falhou    a rotina agendada não conseguiu consultar o gateway
#   pagamento_divergente    valor, conta ou pedido diferentes do esperado
#   estorno_fora_de_fluxo   estorno ou chargeback sem aprovação local
#   email_falhou            e-mail transacional não entregue
#   conciliacao_revisao_manual  pedido ainda pendente depois das 3 verificações sob demanda
#   fila_conciliacao_falhou     não foi possível agendar a verificação no Cloud Tasks
#   fila_email_falhou           não foi possível agendar o reenvio de e-mail (a varredura diária cobre)
#   limite_global_atingido      limite GLOBAL de cadastros ou de recuperações de senha por hora atingido (abuso em massa, ou evento: subir o limite)
#   verificacao_humana_indisponivel  a Cloudflare (Turnstile) não respondeu: cadastro e recuperação ficam recusados (falha fechada)
set -euo pipefail
: "${PROJECT:?informe PROJECT}"
: "${NOTIFY_EMAIL:?informe NOTIFY_EMAIL}"
SERVICE="${SERVICE:-partyx}"
g() { gcloud --project="$PROJECT" "$@"; }
exists() { "$@" >/dev/null 2>&1; }

CH="$(g alpha monitoring channels list --filter="labels.email_address=\"$NOTIFY_EMAIL\"" --format='value(name)' 2>/dev/null | head -1 || true)"
if [ -z "$CH" ]; then
  CH="$(g alpha monitoring channels create --display-name="PartyX operação ($NOTIFY_EMAIL)" --type=email --channel-labels="email_address=$NOTIFY_EMAIL" --format='value(name)')"
fi

for sig in pago_sem_estoque webhook_falhou reconciliacao_falhou pagamento_divergente estorno_fora_de_fluxo email_falhou conciliacao_revisao_manual fila_conciliacao_falhou fila_email_falhou verificacao_humana_indisponivel limite_global_atingido; do
  metric="partyx_alerta_${sig}"
  filter="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$SERVICE\" AND jsonPayload.alert=\"$sig\""
  exists g logging metrics describe "$metric" || g logging metrics create "$metric" --description="PartyX: alerta $sig" --log-filter="$filter"
  policy="PartyX: $sig"
  if [ -z "$(g alpha monitoring policies list --filter="displayName=\"$policy\"" --format='value(name)')" ]; then
    cat > "${TMPDIR:-/tmp}/policy-$sig.json" <<JSON
{"displayName":"$policy","combiner":"OR","notificationChannels":["$CH"],
 "documentation":{"content":"Ver docs/operacao/README.md, sinal $sig.","mimeType":"text/markdown"},
 "conditions":[{"displayName":"$sig apareceu","conditionThreshold":{
   "filter":"metric.type=\"logging.googleapis.com/user/$metric\" AND resource.type=\"cloud_run_revision\"",
   "comparison":"COMPARISON_GT","thresholdValue":0,"duration":"0s",
   "aggregations":[{"alignmentPeriod":"300s","perSeriesAligner":"ALIGN_SUM"}],
   "trigger":{"count":1}}}],
 "alertStrategy":{"autoClose":"86400s"}}
JSON
    g alpha monitoring policies create --policy-from-file="${TMPDIR:-/tmp}/policy-$sig.json" >/dev/null
  fi
done
echo "ok: 11 métricas e 11 políticas para $SERVICE em $PROJECT, avisando $NOTIFY_EMAIL"
