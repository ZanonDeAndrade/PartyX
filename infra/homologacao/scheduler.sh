#!/usr/bin/env bash
# Cloud Scheduler de HOMOLOGAÇÃO: rotina diária de segurança da conciliação. NÃO FOI EXECUTADO.
# Pré-requisitos: `setup.sh` já rodou (cria a conta `partyx-scheduler`) e o serviço está publicado com JOBS_AUDIENCE e
# JOBS_CALLER_EMAIL (ver deploy.sh). Idempotente.
#
# Autenticação: o Scheduler envia um token OIDC assinado pelo Google, em nome de `partyx-scheduler`, com o endereço do serviço como
# audience. O próprio serviço confere assinatura, audience e e-mail (server/src/payments/jobsAuth.ts). Não há segredo compartilhado.
#
# Cadência (D-78): a conciliação "a cada poucos minutos" e a da aprovação tardia são tarefas POR PEDIDO no Cloud Tasks, contadas da
# cobrança (1, 2, 4, 8 min, fim da reserva + margem, e 15 min, 30 min, 1 h, 3 h, 8 h, 24 h; RECONCILE_* no deploy). Aqui fica só a
# rotina DIÁRIA: fila de e-mails, pedidos de até 3 dias (inclusive os que perderam as tarefas) e ingressos que faltarem.
set -euo pipefail

PROJECT="${PROJECT:-partyx-hml}"
REGION="${REGION:-southamerica-east1}"
SERVICE="${SERVICE:-partyx-hml}"
SCHED_SA="partyx-scheduler@${PROJECT}.iam.gserviceaccount.com"
JOB="partyx-reconcile-payments"          # mesmo nome do job antigo (a cada 2 min): passa a rodar uma vez por dia
OLD_PENDING_JOB="partyx-reconcile-pending"   # varredura de 5 min de uma versão anterior deste script: removida
SCHEDULE="${SCHEDULE:-0 4 * * *}"

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
echo "Job $JOB ($VERB, $SCHEDULE) apontando para $TARGET"

if gcloud scheduler jobs describe "$OLD_PENDING_JOB" --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs delete "$OLD_PENDING_JOB" --project="$PROJECT" --location="$REGION" --quiet
  echo "Removido o job $OLD_PENDING_JOB (varredura de 5 min)."
fi
echo "Conferir: gcloud scheduler jobs run $JOB --project=$PROJECT --location=$REGION  e os logs do serviço (alert=reconciliacao_falhou)."
