#!/usr/bin/env bash
# Publica a revisão atual em HOMOLOGAÇÃO: build, migração e deploy. A CI roda este mesmo roteiro.
# Ordem importa: a migração roda antes de a nova revisão receber tráfego e só se o build passou.
set -euo pipefail

PROJECT="${PROJECT:-partyx-hml}"
REGION="${REGION:-southamerica-east1}"
SERVICE="${SERVICE:-partyx-hml}"
JOB="partyx-migrate"
TAG="${TAG:-$(date -u +%Y%m%d-%H%M%S)}"
# Endereço público da homologação (links dos e-mails e checagem de origem). Troque pelo domínio quando existir (D-08).
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://partyx-hml.web.app}"   # atrás do Firebase Hosting
IMAGE="$REGION-docker.pkg.dev/$PROJECT/partyx/partyx-api:$TAG"
APP_SA="partyx-app@$PROJECT.iam.gserviceaccount.com"
DEPLOY_SA="partyx-deploy@$PROJECT.iam.gserviceaccount.com"

# Proteção contra ambiente trocado (o inverso da produção): recusa ANTES do build.
case "$PROJECT" in *prod*) echo "Recuso: PROJECT parece de PRODUÇÃO: $PROJECT" >&2; exit 1;; esac
[ "${GATEWAY_ENVIRONMENT:-sandbox}" = "sandbox" ] || { echo "Recuso: credenciais de PRODUÇÃO do gateway em homologação." >&2; exit 1; }
DIRECT="$(gcloud secrets versions access latest --secret=database-url-direct --project="$PROJECT")"
POOLED="$(gcloud secrets versions access latest --secret=database-url --project="$PROJECT")"
( cd "$(dirname "$0")/../.." && DATABASE_URL_DIRECT="$DIRECT" DATABASE_URL_POOLED="$POOLED" npm run -s db:env -- check homologacao ) \
  || { echo "Recuso: o banco apontado NÃO é o de homologação." >&2; exit 1; }

echo "== build $TAG"
gcloud builds submit . --project="$PROJECT" --region="$REGION" \
  --config=infra/homologacao/cloudbuild.yaml --substitutions="_IMAGE=$IMAGE" --quiet

echo "== migração (job com a conexão direta, só a conta de deploy lê o segredo)"
if gcloud run jobs describe "$JOB" --project="$PROJECT" --region="$REGION" >/dev/null 2>&1; then verb=update; else verb=create; fi
gcloud run jobs "$verb" "$JOB" --project="$PROJECT" --region="$REGION" --image="$IMAGE" \
  --service-account="$DEPLOY_SA" --set-secrets=DATABASE_URL_DIRECT=database-url-direct:latest \
  --set-env-vars=APP_ENV=homologacao --command=node --args=dist-server/migrate.js \
  --max-retries=0 --task-timeout=300s --quiet
gcloud run jobs execute "$JOB" --project="$PROJECT" --region="$REGION" --wait

echo "== deploy"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUN_URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"   # audience das tarefas (a URL run.app, não o domínio)
TASKS_SA="partyx-tasks@${PROJECT}.iam.gserviceaccount.com"
SCHED_SA="partyx-scheduler@${PROJECT}.iam.gserviceaccount.com"
vars=(NODE_ENV=production APP_ENV=homologacao ENABLE_PROTOTYPE=true DB_POOL_MAX=5 "TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-2}" "PUBLIC_BASE_URL=$PUBLIC_BASE_URL"
  "BANNER_BUCKET=${PROJECT}-banners" "JOBS_AUDIENCE=$RUN_URL" "JOBS_CALLER_EMAIL=${SCHED_SA},${TASKS_SA}"
  "TASKS_QUEUE=projects/$PROJECT/locations/$REGION/queues/partyx-conciliacao" "TASKS_INVOKER_EMAIL=$TASKS_SA"
  "TURNSTILE_ENABLED=${TURNSTILE_ENABLED:-true}" "TURNSTILE_SITE_KEY=${TURNSTILE_SITE_KEY:-1x00000000000000000000AA}")   # homologação mantém o Turnstile LIGADO, com a chave de TESTE da Cloudflare (aceita qualquer token)
# Homologação SEM sandbox de gateway (D-01 em aberto): HML_GATEWAY_FICTICIO=true liga o adaptador fictício (só administrador usa o simulador).
# O estado do fictício fica na memória: nesse modo, use UMA instância (MIN_INSTANCES=1 MAX_INSTANCES=1).
[ "${HML_GATEWAY_FICTICIO:-false}" != "true" ] || vars+=(PAYMENT_GATEWAY=mock HOMOLOGACAO_GATEWAY_FICTICIO=true)
[ -z "${EMAIL_FROM:-}" ] || vars+=("EMAIL_FROM=$EMAIL_FROM")
# Cadência da conciliação e contato da PartyX: só entram se definidos (os padrões estão no código, server/src/config.ts).
# Textos legais: a imagem leva conteudo-legal/ (fora do Git); sem os arquivos, as páginas mostram o aviso de homologação.
vars+=("LEGAL_CONTENT_DIR=/app/legal" "MAINTENANCE_MODE=${MAINTENANCE_MODE:-false}")
for v in RECONCILE_TASK_OFFSETS_SECONDS RECONCILE_TASK_MARGIN_SECONDS RECONCILE_LATE_OFFSETS_SECONDS RECONCILE_LOCK_SECONDS \
         PARTYX_SUPPORT_EMAIL PARTYX_SUPPORT_WHATSAPP PARTYX_LEGAL_NAME PARTYX_CNPJ PARTYX_ADDRESS PARTYX_SUPPORT_HOURS \
         TERMS_VERSION PRIVACY_VERSION CANCELLATION_VERSION TERMS_DATE PRIVACY_DATE CANCELLATION_DATE EMAIL_REPLY_TO; do
  [ -z "${!v:-}" ] || vars+=("$v=${!v}")
done
joined="$(IFS='#'; echo "${vars[*]}")"
secrets="DATABASE_URL=database-url:latest,SESSION_SECRET=session-secret:latest,QR_HMAC_KEYS=qr-hmac-keys:latest,TURNSTILE_SECRET=turnstile-secret:latest"
[ -z "$(gcloud secrets versions list smtp-url --project="$PROJECT" --limit=1 --format='value(name)' 2>/dev/null)" ] || secrets="$secrets,SMTP_URL=smtp-url:latest"
gcloud run deploy "$SERVICE" --project="$PROJECT" --region="$REGION" --image="$IMAGE" --service-account="$APP_SA" \
  --allow-unauthenticated --port=8080 --cpu=1 --memory=512Mi --concurrency=80 --timeout=60 \
  --min-instances="${MIN_INSTANCES:-0}" --max-instances="${MAX_INSTANCES:-3}" \
  --set-env-vars="^#^${joined}" --set-secrets="$secrets" \
  --labels=app=partyx,env=homologacao --quiet

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
echo "== teste rápido em $URL"
for i in 1 2 3 4 5; do
  if curl -fsS "$URL/api/health/ready" | grep -q '"database":"ok"'; then echo "pronto"; exit 0; fi
  sleep 3
done
echo "FALHOU: /api/health/ready não respondeu com banco ok" >&2
exit 1
