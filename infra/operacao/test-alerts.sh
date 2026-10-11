#!/usr/bin/env bash
# Dispara, DE PROPÓSITO, os alertas por log e mostra o que o Cloud Monitoring registrou. Para homologação (nunca em produção).
# Grava no Cloud Logging entradas SINTÉTICAS (marcadas "sintetico": true) com o mesmo recurso e o mesmo campo `alert` que a aplicação
# usa, então exercita o caminho filtro de log -> métrica -> política -> alerta -> e-mail. NÃO prova que a aplicação emite o sinal
# (isso os testes automáticos e os cenários reais cobrem). Uso: PROJECT=partyx-hml SERVICE=partyx-hml infra/operacao/test-alerts.sh [sinal ...]
set -euo pipefail
: "${PROJECT:?}"; : "${SERVICE:?}"
case "$PROJECT" in *prod*) echo "Recuso: não dispare alertas de teste em produção." >&2; exit 1;; esac
REGION="${REGION:-southamerica-east1}"
SIGNALS=("$@"); [ ${#SIGNALS[@]} -gt 0 ] || SIGNALS=(pago_sem_estoque webhook_falhou reconciliacao_falhou pagamento_divergente estorno_fora_de_fluxo email_falhou conciliacao_revisao_manual fila_conciliacao_falhou fila_email_falhou verificacao_humana_indisponivel)
REV="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.latestReadyRevisionName)')"
for sig in "${SIGNALS[@]}"; do
  gcloud logging write partyx-teste-sintetico "{\"message\":\"TESTE SINTÉTICO de alerta ($sig): não é um evento real\",\"alert\":\"$sig\",\"sintetico\":true}" \
    --payload-type=json --severity=ERROR --project="$PROJECT" --monitored-resource-type=cloud_run_revision \
    --monitored-resource-labels="service_name=$SERVICE,revision_name=$REV,location=$REGION,configuration_name=$SERVICE" >/dev/null
  echo "disparado: $sig"
done
