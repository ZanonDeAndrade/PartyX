#!/usr/bin/env bash
# Cloud Scheduler de HOMOLOGAÇÃO: conciliação de pagamentos (webhook perdido) e expiração de reservas.
# NÃO FOI EXECUTADO (Prompt 12). Pré-requisitos: `setup.sh` já rodou (cria a conta `partyx-scheduler`) e o serviço está publicado
# com JOBS_AUDIENCE e JOBS_CALLER_EMAIL (ver deploy.sh). Idempotente.
#
# Autenticação: o Scheduler envia um token OIDC assinado pelo Google, em nome de `partyx-scheduler`, com o endereço do serviço como
# audience. O próprio serviço confere assinatura, audience e e-mail (server/src/payments/jobsAuth.ts). Não há segredo compartilhado.
set -euo pipefail

PROJECT="${PROJECT:-partyx-hml}"
REGION="${REGION:-southamerica-east1}"
SERVICE="${SERVICE:-partyx-hml}"
SCHED_SA="partyx-scheduler@${PROJECT}.iam.gserviceaccount.com"
JOB="partyx-reconcile-payments"
# A cada 2 minutos: cobre o Pix de poucos minutos sem pressionar o gateway. Ajustar com o volume (e com o limite de chamadas do gateway).
SCHEDULE="${SCHEDULE:-*/2 * * * *}"

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
TARGET="${URL}/api/internal/jobs/reconcile-payments"

if gcloud scheduler jobs describe "$JOB" --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then
  VERB=update
else
  VERB=create
fi
gcloud scheduler jobs "$VERB" http "$JOB" --project="$PROJECT" --location="$REGION" \
  --schedule="$SCHEDULE" --time-zone="America/Sao_Paulo" \
  --uri="$TARGET" --http-method=POST \
  --oidc-service-account-email="$SCHED_SA" --oidc-token-audience="$URL" \
  --attempt-deadline=120s --max-retry-attempts=1 --min-backoff=30s

echo "Job $JOB ($VERB) apontando para $TARGET"
echo "Conferir: gcloud scheduler jobs run $JOB --project=$PROJECT --location=$REGION  e os logs do serviço (alert=reconciliacao_falhou)."
