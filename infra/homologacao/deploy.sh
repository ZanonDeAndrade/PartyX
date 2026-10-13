#!/usr/bin/env bash
# Publica a revisão atual em HOMOLOGAÇÃO: build, migração e deploy. A CI roda este mesmo roteiro.
# Ordem importa: a migração roda antes de a nova revisão receber tráfego e só se o build passou.
set -euo pipefail

PROJECT="${PROJECT:-partyx-hml}"
REGION="${REGION:-southamerica-east1}"
SERVICE="${SERVICE:-partyx-hml}"
JOB="partyx-migrate"
TAG="${TAG:-$(date -u +%Y%m%d-%H%M%S)}"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/partyx/partyx-api:$TAG"
APP_SA="partyx-app@$PROJECT.iam.gserviceaccount.com"
DEPLOY_SA="partyx-deploy@$PROJECT.iam.gserviceaccount.com"

# Memória da instância e teto do heap do V8 (docs/operacao/memoria.md). Com 512 MiB, heap de 320 MB deixa cerca de 190 MB para o
# que não é heap (código, buffers, ICU, libvips do banner). Outro tamanho exige NODE_HEAP_MB explícito (ex.: MEMORY=1Gi NODE_HEAP_MB=768).
MEMORY="${MEMORY:-512Mi}"
case "$MEMORY" in 512Mi) NODE_HEAP_MB="${NODE_HEAP_MB:-320}";; *) : "${NODE_HEAP_MB:?com MEMORY=$MEMORY, informe NODE_HEAP_MB}";; esac

# Proteção contra ambiente trocado (o inverso da produção): recusa ANTES do build.
case "$PROJECT" in *prod*) echo "Recuso: PROJECT parece de PRODUÇÃO: $PROJECT" >&2; exit 1;; esac
has_version() { [ -n "$(gcloud secrets versions list "$1" --project="$PROJECT" --filter=state=ENABLED --limit=1 --format='value(name)' 2>/dev/null)" ]; }

# Variáveis NÃO secretas: SÓ do arquivo versionado (--env-vars-file troca todas as do serviço por elas). Segredos: Secret Manager.
# O conferidor recusa formato estranho, nome com cara de segredo, obrigatória vazia e combinação proibida, antes do build.
ENV_FILE="${ENV_FILE:-$(dirname "$0")/env.hml.yaml}"
extra=(); has_version smtp-url && extra+=(EMAIL_FROM)   # com SMTP, o servidor não sobe sem remetente
checked="$(python3 -I "$(dirname "$0")/../env-check.py" "$ENV_FILE" homologacao "${extra[@]}")" || exit 1
eval "$checked"
for v in TURNSTILE_ENABLED TURNSTILE_SITE_KEY; do [ -z "${!v:-}" ] || { echo "Recuso: $v vem do $ENV_FILE, não do ambiente." >&2; exit 1; }; done
PUBLIC_BASE_URL="$ENVF_PUBLIC_BASE_URL"
[ "$ENVF_NODE_OPTIONS" = "--max-old-space-size=$NODE_HEAP_MB" ] \
  || { echo "Recuso: NODE_OPTIONS do $ENV_FILE ($ENVF_NODE_OPTIONS) não combina com MEMORY=$MEMORY (heap $NODE_HEAP_MB MB)." >&2; exit 1; }
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUN_URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"   # audience das tarefas (a URL run.app, não o domínio)
[ "$ENVF_JOBS_AUDIENCE" = "$RUN_URL" ] || { echo "Recuso: JOBS_AUDIENCE do $ENV_FILE difere de $RUN_URL." >&2; exit 1; }
[ "$ENVF_TURNSTILE_ENABLED" != "true" ] || has_version turnstile-secret || { echo "Recuso: Turnstile ligado sem o segredo turnstile-secret." >&2; exit 1; }

case "$ENVF_PAYMENT_GATEWAY" in
  mercadopago)
    for s in mp-access-token mp-public-key mp-webhook-secret; do
      has_version "$s" || { echo "Recuso: o segredo $s precisa ter valor (scripts/setup-mp-credentials-homologacao.sh)." >&2; exit 1; }
    done
    # Só usuário de TESTE do Mercado Pago, e da conta do arquivo. O token vai pelo stdin do curl, nunca na linha de comando nem na saída.
    collector="$(gcloud secrets versions access latest --secret=mp-access-token --project="$PROJECT" \
      | { IFS= read -r t || [ -n "$t" ]; printf 'header = "Authorization: Bearer %s"\n' "$t"; } \
      | curl -sS --max-time 15 -K - https://api.mercadopago.com/users/me \
      | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d["id"] if "test_user" in (d.get("tags") or []) else "")' 2>/dev/null || true)"
    [[ "$collector" =~ ^[0-9]+$ ]] || { echo "Recuso: mp-access-token não é de usuário de TESTE do Mercado Pago (ou a API não respondeu)." >&2; exit 1; }
    [ "$ENVF_MP_COLLECTOR_ID" = "$collector" ] || { echo "Recuso: MP_COLLECTOR_ID do $ENV_FILE difere da conta do token." >&2; exit 1; } ;;
  # O fictício guarda estado na memória: UMA instância. Com o Mercado Pago, escala de 0 a 3 (sem custo parado).
  mock) MIN_INSTANCES="${MIN_INSTANCES:-1}"; MAX_INSTANCES="${MAX_INSTANCES:-1}" ;;
esac
echo "== variáveis de $ENV_FILE conferidas; gateway: $ENVF_PAYMENT_GATEWAY"
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
secrets="DATABASE_URL=database-url:latest,SESSION_SECRET=session-secret:latest,QR_HMAC_KEYS=qr-hmac-keys:latest"
[ "$ENVF_TURNSTILE_ENABLED" != "true" ] || secrets="$secrets,TURNSTILE_SECRET=turnstile-secret:latest"
[ -z "$(gcloud secrets versions list smtp-url --project="$PROJECT" --limit=1 --format='value(name)' 2>/dev/null)" ] || secrets="$secrets,SMTP_URL=smtp-url:latest"
[ "$ENVF_PAYMENT_GATEWAY" != "mercadopago" ] || secrets="$secrets,MP_ACCESS_TOKEN=mp-access-token:latest,MP_PUBLIC_KEY=mp-public-key:latest,MP_WEBHOOK_SECRET=mp-webhook-secret:latest"
gcloud run deploy "$SERVICE" --project="$PROJECT" --region="$REGION" --image="$IMAGE" --service-account="$APP_SA" \
  --allow-unauthenticated --port=8080 --cpu=1 --memory="$MEMORY" --concurrency="${CONCURRENCY:-80}" --timeout=60 \
  --min-instances="${MIN_INSTANCES:-0}" --max-instances="${MAX_INSTANCES:-3}" \
  --env-vars-file="$ENV_FILE" --set-secrets="$secrets" \
  --labels=app=partyx,env=homologacao --quiet

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
echo "== teste rápido em $URL"
ready=false
for i in 1 2 3 4 5; do
  if curl -fsS "$URL/api/health/ready" | grep -q '"database":"ok"'; then ready=true; break; fi
  sleep 3
done
$ready || { echo "FALHOU: /api/health/ready não respondeu com banco ok" >&2; exit 1; }
if [ "$ENVF_PUBLIC_HOST_CHECK" = "true" ]; then
  host="$(python3 -I -c 'import sys,urllib.parse as u; print(u.urlsplit(sys.argv[1]).netloc)' "$PUBLIC_BASE_URL")"
  direct="$(curl -s -o /dev/null -w '%{http_code}' "$URL/")"
  forwarded="$(curl -s -o /dev/null -w '%{http_code}' -H "X-Forwarded-Host: $host" "$URL/")"
  [ "$direct" = "403" ] && [ "$forwarded" = "200" ] \
    || { echo "FALHOU: barreira de Host (run.app sem cabeçalho: $direct, esperado 403; com X-Forwarded-Host: $forwarded, esperado 200)" >&2; exit 1; }
fi
echo "pronto"
