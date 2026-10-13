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

# Memória da instância e teto do heap do V8 (docs/operacao/memoria.md). Com 512 MiB, heap de 320 MB deixa cerca de 190 MB para o
# que não é heap (código, buffers, ICU, libvips do banner). Outro tamanho exige NODE_HEAP_MB explícito (ex.: MEMORY=1Gi NODE_HEAP_MB=768).
MEMORY="${MEMORY:-512Mi}"
case "$MEMORY" in 512Mi) NODE_HEAP_MB="${NODE_HEAP_MB:-320}";; *) : "${NODE_HEAP_MB:?com MEMORY=$MEMORY, informe NODE_HEAP_MB}";; esac

# Proteção contra ambiente trocado (o inverso da produção): recusa ANTES do build.
case "$PROJECT" in *prod*) echo "Recuso: PROJECT parece de PRODUÇÃO: $PROJECT" >&2; exit 1;; esac
[ "${GATEWAY_ENVIRONMENT:-sandbox}" = "sandbox" ] || { echo "Recuso: credenciais de PRODUÇÃO do gateway em homologação." >&2; exit 1; }

# Gateway de homologação (PDF 7.1: sandbox). HML_GATEWAY=mercadopago|ficticio|none. Padrão: Mercado Pago de TESTE se os segredos mp-*
# existirem (scripts/setup-mp-credentials-homologacao.sh); o fictício só com HML_GATEWAY=ficticio (ou HML_GATEWAY_FICTICIO=true, nome antigo).
has_version() { [ -n "$(gcloud secrets versions list "$1" --project="$PROJECT" --filter=state=ENABLED --limit=1 --format='value(name)' 2>/dev/null)" ]; }
if [ -z "${HML_GATEWAY:-}" ]; then
  if [ "${HML_GATEWAY_FICTICIO:-false}" = "true" ]; then HML_GATEWAY=ficticio
  elif has_version mp-access-token; then HML_GATEWAY=mercadopago
  else HML_GATEWAY=none; fi
fi
case "$HML_GATEWAY" in
  mercadopago)
    for s in mp-access-token mp-public-key mp-webhook-secret; do
      has_version "$s" || { echo "Recuso: o segredo $s precisa ter valor (scripts/setup-mp-credentials-homologacao.sh)." >&2; exit 1; }
    done
    # Só usuário de TESTE do Mercado Pago. O token vai pelo stdin do curl, nunca na linha de comando nem na saída.
    collector="$(gcloud secrets versions access latest --secret=mp-access-token --project="$PROJECT" \
      | { IFS= read -r t || [ -n "$t" ]; printf 'header = "Authorization: Bearer %s"\n' "$t"; } \
      | curl -sS --max-time 15 -K - https://api.mercadopago.com/users/me \
      | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d["id"] if "test_user" in (d.get("tags") or []) else "")' 2>/dev/null || true)"
    [[ "$collector" =~ ^[0-9]+$ ]] || { echo "Recuso: mp-access-token não é de usuário de TESTE do Mercado Pago (ou a API não respondeu)." >&2; exit 1; }
    [ -z "${MP_COLLECTOR_ID:-}" ] || [ "$MP_COLLECTOR_ID" = "$collector" ] || { echo "Recuso: MP_COLLECTOR_ID difere da conta do token." >&2; exit 1; }
    MP_COLLECTOR_ID="$collector" ;;
  ficticio | none) ;;
  *) echo "HML_GATEWAY inválido: $HML_GATEWAY (mercadopago, ficticio ou none)" >&2; exit 1 ;;
esac
# --set-env-vars troca TODAS as variáveis do serviço: com o segredo smtp-url, o remetente precisa vir aqui (o servidor não sobe sem ele).
# Na homologação: EMAIL_FROM='PartyX Homologação <ingressos@exemplo.com>'. Recusa antes do build, não depois de 5 minutos.
if has_version smtp-url && [ -z "${EMAIL_FROM:-}" ]; then
  echo "Recuso: o segredo smtp-url existe e EMAIL_FROM não foi informado (ex.: EMAIL_FROM='PartyX Homologação <ingressos@exemplo.com>')." >&2
  exit 1
fi
# O fictício guarda estado na memória: UMA instância. Com o Mercado Pago, escala de 0 a 3 (sem custo parado).
if [ "$HML_GATEWAY" = "ficticio" ]; then MIN_INSTANCES="${MIN_INSTANCES:-1}"; MAX_INSTANCES="${MAX_INSTANCES:-1}"; fi
echo "== gateway de homologação: $HML_GATEWAY"
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
vars=(NODE_ENV=production "NODE_OPTIONS=--max-old-space-size=$NODE_HEAP_MB" APP_ENV=homologacao ENABLE_PROTOTYPE=true DB_POOL_MAX=5 "TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-2}" "PUBLIC_BASE_URL=$PUBLIC_BASE_URL"
  "BANNER_BUCKET=${PROJECT}-banners" "JOBS_AUDIENCE=$RUN_URL" "JOBS_CALLER_EMAIL=${SCHED_SA},${TASKS_SA}"
  "TASKS_QUEUE=projects/$PROJECT/locations/$REGION/queues/partyx-conciliacao" "TASKS_INVOKER_EMAIL=$TASKS_SA"
  "TURNSTILE_ENABLED=${TURNSTILE_ENABLED:-true}" "TURNSTILE_SITE_KEY=${TURNSTILE_SITE_KEY:-1x00000000000000000000AA}")   # homologação mantém o Turnstile LIGADO, com a chave de TESTE da Cloudflare (aceita qualquer token)
case "$HML_GATEWAY" in
  ficticio) vars+=(PAYMENT_GATEWAY=mock HOMOLOGACAO_GATEWAY_FICTICIO=true) ;;   # só administrador usa o simulador
  mercadopago) vars+=(PAYMENT_GATEWAY=mercadopago GATEWAY_ENVIRONMENT=sandbox "MP_COLLECTOR_ID=$MP_COLLECTOR_ID") ;;
esac
# Barreira de Host igual à de produção: o teste rápido pelo Hosting prova que o X-Forwarded-Host chega (PUBLIC_HOST_CHECK=false desliga).
vars+=("PUBLIC_HOST_CHECK=${PUBLIC_HOST_CHECK:-true}")
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
[ "$HML_GATEWAY" != "mercadopago" ] || secrets="$secrets,MP_ACCESS_TOKEN=mp-access-token:latest,MP_PUBLIC_KEY=mp-public-key:latest,MP_WEBHOOK_SECRET=mp-webhook-secret:latest"
gcloud run deploy "$SERVICE" --project="$PROJECT" --region="$REGION" --image="$IMAGE" --service-account="$APP_SA" \
  --allow-unauthenticated --port=8080 --cpu=1 --memory="$MEMORY" --concurrency="${CONCURRENCY:-80}" --timeout=60 \
  --min-instances="${MIN_INSTANCES:-0}" --max-instances="${MAX_INSTANCES:-3}" \
  --set-env-vars="^#^${joined}" --set-secrets="$secrets" \
  --labels=app=partyx,env=homologacao --quiet

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
echo "== teste rápido em $URL"
ready=false
for i in 1 2 3 4 5; do
  if curl -fsS "$URL/api/health/ready" | grep -q '"database":"ok"'; then ready=true; break; fi
  sleep 3
done
$ready || { echo "FALHOU: /api/health/ready não respondeu com banco ok" >&2; exit 1; }
if [ "${PUBLIC_HOST_CHECK:-true}" = "true" ]; then
  host="$(python3 -I -c 'import sys,urllib.parse as u; print(u.urlsplit(sys.argv[1]).netloc)' "$PUBLIC_BASE_URL")"
  direct="$(curl -s -o /dev/null -w '%{http_code}' "$URL/")"
  forwarded="$(curl -s -o /dev/null -w '%{http_code}' -H "X-Forwarded-Host: $host" "$URL/")"
  [ "$direct" = "403" ] && [ "$forwarded" = "200" ] \
    || { echo "FALHOU: barreira de Host (run.app sem cabeçalho: $direct, esperado 403; com X-Forwarded-Host: $forwarded, esperado 200)" >&2; exit 1; }
fi
echo "pronto"
