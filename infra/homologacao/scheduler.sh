#!/usr/bin/env bash
# Cloud Scheduler de HOMOLOGAÇÃO: varredura de pagamentos pendentes (a cada 5 min) e rotina diária de segurança.
# NÃO FOI EXECUTADO. Pré-requisitos: `setup.sh` já rodou (cria a conta `partyx-scheduler`) e o serviço está publicado
# com JOBS_AUDIENCE e JOBS_CALLER_EMAIL (ver deploy.sh). Idempotente.
#
# Autenticação: o Scheduler envia um token OIDC assinado pelo Google, em nome de `partyx-scheduler`, com o endereço do serviço como
# audience. O próprio serviço confere assinatura, audience e e-mail (server/src/payments/jobsAuth.ts). Não há segredo compartilhado.
#
# Cadência (RF-35, "a cada poucos minutos"): cada cobrança agenda verificações próprias no Cloud Tasks aos 1, 2, 4 e 8 minutos e no fim
# da reserva + margem (RECONCILE_TASK_* no deploy). Depois disso, a VARREDURA abaixo olha os pedidos com cobrança de até 24 h
# (RECONCILE_SWEEP_WINDOW_HOURS). A rotina DIÁRIA continua como rede de segurança (fila de e-mails, pedidos de até 3 dias, ingressos).
# CUSTO: com o Neon em suspensão automática de 5 min, uma varredura a cada 5 min mantém o banco acordado o tempo todo (README-DEPLOY.md, seção 8).
set -euo pipefail

PROJECT="${PROJECT:-partyx-hml}"
REGION="${REGION:-southamerica-east1}"
SERVICE="${SERVICE:-partyx-hml}"
SCHED_SA="partyx-scheduler@${PROJECT}.iam.gserviceaccount.com"
PENDING_JOB="partyx-reconcile-pending"
DAILY_JOB="partyx-reconcile-payments"   # mesmo nome do job antigo (a cada 2 min): passa a rodar uma vez por dia
PENDING_SCHEDULE="${PENDING_SCHEDULE:-*/5 * * * *}"
DAILY_SCHEDULE="${DAILY_SCHEDULE:-0 4 * * *}"

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"

upsert() { # nome, agenda, caminho, prazo
  local verb=create
  gcloud scheduler jobs describe "$1" --project="$PROJECT" --location="$REGION" >/dev/null 2>&1 && verb=update
  gcloud scheduler jobs "$verb" http "$1" --project="$PROJECT" --location="$REGION" \
    --schedule="$2" --time-zone="America/Sao_Paulo" \
    --uri="${URL}$3" --http-method=POST \
    --oidc-service-account-email="$SCHED_SA" --oidc-token-audience="$URL" \
    --attempt-deadline="$4" --max-retry-attempts=1 --min-backoff=30s
  echo "Job $1 ($verb, $2) -> ${URL}$3"
}

# Varredura: a trava em job_leases impede duas ao mesmo tempo; sem retentativa longa, a próxima execução já vem em 5 min.
upsert "$PENDING_JOB" "$PENDING_SCHEDULE" /api/internal/jobs/reconcile-pending 120s
upsert "$DAILY_JOB" "$DAILY_SCHEDULE" /api/internal/jobs/reconcile-payments 120s

echo "Conferir: gcloud scheduler jobs run $PENDING_JOB --project=$PROJECT --location=$REGION  e os logs do serviço (alert=reconciliacao_falhou)."
