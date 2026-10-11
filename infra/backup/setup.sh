#!/usr/bin/env bash
# Backup diário do PartyX: imagem, job do Cloud Run, agendamento e alertas. Idempotente. Serve para homologação e produção.
# Uso: PROJECT=<projeto> NOTIFY_EMAIL=<e-mail> [SERVICE_LABEL=partyx] infra/backup/setup.sh
# Pré-requisitos (por ambiente): bucket <PROJECT>-backups (privado, versionado, retenção de 35 dias: criado pelo setup do ambiente) e o
# segredo `database-url-backup` COM VALOR (conexão DIRETA do papel de leitura `partyx_backup`, ver README-DEPLOY.md).
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${PROJECT:?informe PROJECT}"; : "${NOTIFY_EMAIL:?informe NOTIFY_EMAIL}"
REGION="${REGION:-southamerica-east1}"
JOB="partyx-backup"
SCHED_JOB="partyx-backup-diario"
SCHEDULE="${BACKUP_SCHEDULE:-0 3 * * *}"          # 03:00 de São Paulo: fora do horário de venda e de evento
BUCKET="${PROJECT}-backups"
BACKUP_SA="partyx-backup@${PROJECT}.iam.gserviceaccount.com"
SCHED_SA="partyx-scheduler@${PROJECT}.iam.gserviceaccount.com"
TAG="${TAG:-$(date -u +%Y%m%d-%H%M%S)}"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/partyx/partyx-backup:$TAG"
g() { gcloud --project="$PROJECT" "$@"; }
exists() { "$@" >/dev/null 2>&1; }
# Conta de serviço recém-criada demora a ser vista pelo IAM ("does not exist"): repete até 8 vezes, 5 s entre elas.
retry() { local n=0; until "$@"; do n=$((n+1)); [ "$n" -lt 8 ] || return 1; sleep 5; done; }

echo "== Conta de serviço do backup (só lê o segredo do banco e grava no bucket)"
exists g iam service-accounts describe "$BACKUP_SA" || g iam service-accounts create partyx-backup --display-name="Backup diário do banco"
[ -n "$(g secrets versions list database-url-backup --limit=1 --format='value(name)' 2>/dev/null)" ] || {
  echo "O segredo database-url-backup não tem valor. Crie o papel e grave a URL (README-DEPLOY.md, seção Backup)." >&2; exit 1; }
retry g secrets add-iam-policy-binding database-url-backup --member="serviceAccount:$BACKUP_SA" --role=roles/secretmanager.secretAccessor >/dev/null
# objectCreator grava; objectViewer só para CONFERIR o que enviou (tamanho e MD5). Não apaga nem sobrescreve nada.
retry gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$BACKUP_SA" --role=roles/storage.objectCreator >/dev/null
retry gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$BACKUP_SA" --role=roles/storage.objectViewer >/dev/null

echo "== Imagem (Cloud Build; o Artifact Registry mantém só as últimas)"
g builds submit infra/backup --region="$REGION" --tag="$IMAGE" --quiet

echo "== Job do Cloud Run"
verb=create; exists g run jobs describe "$JOB" --region="$REGION" && verb=update
g run jobs "$verb" "$JOB" --region="$REGION" --image="$IMAGE" --service-account="$BACKUP_SA" \
  --set-secrets=DATABASE_URL_BACKUP=database-url-backup:latest --set-env-vars="BACKUP_BUCKET=$BUCKET" \
  --cpu=1 --memory=512Mi --max-retries=1 --task-timeout=900s --quiet

echo "== Agendamento diário autenticado (conta do Scheduler, token OAuth; sem segredo compartilhado)"
g run jobs add-iam-policy-binding "$JOB" --region="$REGION" --member="serviceAccount:$SCHED_SA" --role=roles/run.invoker >/dev/null
uri="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/$JOB:run"
verb=create; exists g scheduler jobs describe "$SCHED_JOB" --location="$REGION" && verb=update
g scheduler jobs "$verb" http "$SCHED_JOB" --location="$REGION" --schedule="$SCHEDULE" --time-zone="America/Sao_Paulo" \
  --uri="$uri" --http-method=POST --oauth-service-account-email="$SCHED_SA" --attempt-deadline=60s --max-retry-attempts=1

echo "== Alertas: falha do backup (log) e AUSÊNCIA de backup bem-sucedido"
CH="$(g alpha monitoring channels list --filter="labels.email_address=\"$NOTIFY_EMAIL\"" --format='value(name)' 2>/dev/null | head -1 || true)"
[ -n "$CH" ] || CH="$(g alpha monitoring channels create --display-name="PartyX operação ($NOTIFY_EMAIL)" --type=email --channel-labels="email_address=$NOTIFY_EMAIL" --format='value(name)')"
for sig in backup_falhou backup_ok; do
  m="partyx_alerta_$sig"
  exists g logging metrics describe "$m" || g logging metrics create "$m" --description="PartyX: $sig" \
    --log-filter="resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$JOB\" AND jsonPayload.alert=\"$sig\""
done
mkpolicy() { # nome, arquivo json
  [ -n "$(g alpha monitoring policies list --filter="displayName=\"$1\"" --format='value(name)')" ] || g alpha monitoring policies create --policy-from-file="$2" >/dev/null
}
cat > "${TMPDIR:-/tmp}/pol-backup-falhou.json" <<JSON
{"displayName":"PartyX: backup_falhou","combiner":"OR","notificationChannels":["$CH"],
 "documentation":{"content":"O job de backup registrou falha. Ver docs/backup.md e docs/operacao/runbooks/restauracao.md.","mimeType":"text/markdown"},
 "conditions":[{"displayName":"backup_falhou apareceu","conditionThreshold":{
   "filter":"metric.type=\"logging.googleapis.com/user/partyx_alerta_backup_falhou\" AND resource.type=\"cloud_run_job\"",
   "comparison":"COMPARISON_GT","thresholdValue":0,"duration":"0s",
   "aggregations":[{"alignmentPeriod":"300s","perSeriesAligner":"ALIGN_SUM"}],"trigger":{"count":1}}}],
 "alertStrategy":{"autoClose":"86400s"}}
JSON
mkpolicy "PartyX: backup_falhou" "${TMPDIR:-/tmp}/pol-backup-falhou.json"
# Ausência de backup bem-sucedido. NÃO usa `conditionAbsent`: o Cloud Monitoring limita essa condição a 23h30, e o backup é de 24 em 24 h,
# então ela dispararia todo dia antes da próxima cópia. Em vez disso: menos de 1 `backup_ok` numa janela de 25 h, tratando "sem dado"
# como alerta. Cobre também o que não chega a gravar log (job que não iniciou, agendamento parado, conta sem permissão).
WINDOW="${BACKUP_WINDOW_SECONDS:-90000}"
cat > "${TMPDIR:-/tmp}/pol-backup-ausente.json" <<JSON
{"displayName":"PartyX: backup ausente","combiner":"OR","notificationChannels":["$CH"],
 "documentation":{"content":"Nenhum backup bem-sucedido na janela de 25 h. Ver docs/backup.md (conferência diária) e rodar infra/operacao/check-backup.sh.","mimeType":"text/markdown"},
 "conditions":[{"displayName":"menos de 1 backup_ok na janela","conditionThreshold":{
   "filter":"metric.type=\"logging.googleapis.com/user/partyx_alerta_backup_ok\" AND resource.type=\"cloud_run_job\"",
   "comparison":"COMPARISON_LT","thresholdValue":1,"duration":"300s",
   "aggregations":[{"alignmentPeriod":"${WINDOW}s","perSeriesAligner":"ALIGN_SUM"}],
   "evaluationMissingData":"EVALUATION_MISSING_DATA_ACTIVE","trigger":{"count":1}}}],
 "alertStrategy":{"autoClose":"86400s"}}
JSON
mkpolicy "PartyX: backup ausente" "${TMPDIR:-/tmp}/pol-backup-ausente.json"
echo "ok: job $JOB, agendamento '$SCHEDULE' (America/Sao_Paulo) e 2 alertas em $PROJECT"
