#!/usr/bin/env bash
# Cloud Scheduler de HOMOLOGAÇÃO: rotina diária de segurança da conciliação (mesmo nome e cabeçalho da produção).
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
JOB="partyx-varredura-diaria"            # mesmo nome da produção (runbooks)
OLD_JOBS="partyx-reconcile-payments partyx-reconcile-pending"   # nomes de versões anteriores deste script: removidos se existirem
SCHEDULE="${SCHEDULE:-0 4 * * *}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://partyx-hml.web.app}"
# Com PUBLIC_HOST_CHECK=true (deploy.sh), chamada direta ao run.app sem X-Forwarded-Host recebe 403, como em produção.
HOST="$(python3 -I -c 'import sys,urllib.parse as u; print(u.urlsplit(sys.argv[1]).netloc)' "$PUBLIC_BASE_URL")"

# A URL com o número do projeto: é a JOBS_AUDIENCE que o deploy.sh grava no serviço (a URL curta do status.url seria recusada).
URL="https://${SERVICE}-$(gcloud projects describe "$PROJECT" --format='value(projectNumber)').${REGION}.run.app"
TARGET="${URL}/api/internal/jobs/reconcile-payments"

if gcloud scheduler jobs describe "$JOB" --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then
  VERB=update
else
  VERB=create
fi
gcloud scheduler jobs "$VERB" http "$JOB" --project="$PROJECT" --location="$REGION" \
  --schedule="$SCHEDULE" --time-zone="America/Sao_Paulo" \
  --uri="$TARGET" --http-method=POST --headers="X-Forwarded-Host=$HOST" \
  --oidc-service-account-email="$SCHED_SA" --oidc-token-audience="$URL" \
  --attempt-deadline=120s --max-retry-attempts=1 --min-backoff=30s
echo "Job $JOB ($VERB, $SCHEDULE) apontando para $TARGET"

for old in $OLD_JOBS; do
  if gcloud scheduler jobs describe "$old" --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then
    gcloud scheduler jobs delete "$old" --project="$PROJECT" --location="$REGION" --quiet
    echo "Removido o job antigo $old."
  fi
done
echo "Conferir: gcloud scheduler jobs run $JOB --project=$PROJECT --location=$REGION  e os logs do serviço (alert=reconciliacao_falhou)."
