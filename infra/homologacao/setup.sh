#!/usr/bin/env bash
# Infraestrutura de HOMOLOGAÇÃO do PartyX no Google Cloud. Idempotente: pode rodar de novo.
# Pré-requisitos: gcloud logado, projeto criado e com faturamento. Nenhum segredo é impresso.
set -euo pipefail

PROJECT="${PROJECT:-partyx-hml}"
REGION="${REGION:-southamerica-east1}"   # São Paulo: público e Neon (aws-sa-east-1) próximos
BILLING_ACCOUNT="${BILLING_ACCOUNT:-0158D3-9C1431-A0ABCF}"
BUDGET_BRL="${BUDGET_BRL:-150}"
REPO="partyx"
BANNERS="${PROJECT}-banners"
BACKUPS="${PROJECT}-backups"
APP_SA="partyx-app"
SCHED_SA="partyx-scheduler"
TASKS_SA="partyx-tasks"
QUEUE="partyx-conciliacao"
CI_SA="partyx-deploy"

g() { gcloud --project="$PROJECT" "$@"; }
exists() { "$@" >/dev/null 2>&1; }

echo "== APIs"
g services enable run.googleapis.com cloudtasks.googleapis.com secretmanager.googleapis.com storage.googleapis.com \
  cloudscheduler.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  logging.googleapis.com monitoring.googleapis.com iam.googleapis.com \
  cloudresourcemanager.googleapis.com billingbudgets.googleapis.com iamcredentials.googleapis.com

echo "== Artifact Registry"
exists g artifacts repositories describe "$REPO" --location="$REGION" || \
  g artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" \
    --description="Imagens do PartyX" --labels=app=partyx,env=homologacao

# Mantém só as 5 imagens mais recentes e apaga as com mais de 7 dias (controle de custo).
g artifacts repositories set-cleanup-policies "$REPO" --location="$REGION" --policy="$(dirname "$0")/artifact-cleanup.json" --no-dry-run

echo "== Contas de serviço (menor privilégio)"
for sa in "$APP_SA:Runtime do Cloud Run" "$SCHED_SA:Cloud Scheduler chama rotinas autenticadas" "$CI_SA:Deploy pela CI" "$TASKS_SA:Entrega das tarefas do Cloud Tasks"; do
  id="${sa%%:*}"; name="${sa#*:}"
  exists g iam service-accounts describe "$id@$PROJECT.iam.gserviceaccount.com" || \
    g iam service-accounts create "$id" --display-name="$name"
done

echo "== Cloud Tasks: fila de conciliação e de reenvio de e-mail"
if ! exists g tasks queues describe "$QUEUE" --location="$REGION"; then
  g tasks queues create "$QUEUE" --location="$REGION" --max-attempts=3 --min-backoff=30s --max-backoff=300s \
    --max-dispatches-per-second=5 --max-concurrent-dispatches=5
fi
g tasks queues add-iam-policy-binding "$QUEUE" --location="$REGION" --member="serviceAccount:$APP_SA@$PROJECT.iam.gserviceaccount.com" --role=roles/cloudtasks.enqueuer >/dev/null
g iam service-accounts add-iam-policy-binding "$TASKS_SA@$PROJECT.iam.gserviceaccount.com" \
  --member="serviceAccount:$APP_SA@$PROJECT.iam.gserviceaccount.com" --role=roles/iam.serviceAccountUser >/dev/null

echo "== Buckets"
if ! exists gcloud storage buckets describe "gs://$BANNERS" --project="$PROJECT"; then
  gcloud storage buckets create "gs://$BANNERS" --project="$PROJECT" --location="$REGION" \
    --uniform-bucket-level-access --default-storage-class=STANDARD
fi
gcloud storage buckets update "gs://$BANNERS" --versioning --update-labels=app=partyx,env=homologacao
if ! exists gcloud storage buckets describe "gs://$BACKUPS" --project="$PROJECT"; then
  gcloud storage buckets create "gs://$BACKUPS" --project="$PROJECT" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention --default-storage-class=NEARLINE
fi
gcloud storage buckets update "gs://$BACKUPS" --versioning --update-labels=app=partyx,env=homologacao
# Backup: mantém 35 dias (mínimo exigido: 7). Versões antigas e não atuais saem depois de 35 dias.
cat > /tmp/partyx-backup-lifecycle.json <<JSON
{"rule":[{"action":{"type":"Delete"},"condition":{"age":35}}]}
JSON
gcloud storage buckets update "gs://$BACKUPS" --lifecycle-file=/tmp/partyx-backup-lifecycle.json

echo "== Permissões nos buckets"
# Banners: leitura pública (URLs públicas só de leitura); escrita só do runtime.
gcloud storage buckets add-iam-policy-binding "gs://$BANNERS" --member=allUsers --role=roles/storage.objectViewer >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$BANNERS" \
  --member="serviceAccount:$APP_SA@$PROJECT.iam.gserviceaccount.com" --role=roles/storage.objectCreator >/dev/null
# Mínimo privilégio (Prompt 07): o runtime só cria objetos. Os nomes dos banners são o hash do conteúdo, então nunca é preciso
# sobrescrever ou apagar; a versão antiga fica no versionamento do bucket. Remove o papel amplo de execuções anteriores.
gcloud storage buckets remove-iam-policy-binding "gs://$BANNERS" \
  --member="serviceAccount:$APP_SA@$PROJECT.iam.gserviceaccount.com" --role=roles/storage.objectAdmin >/dev/null 2>&1 || true
# Backups: privado. Só quem grava a cópia (runtime) cria objetos; ninguém é público.
gcloud storage buckets add-iam-policy-binding "gs://$BACKUPS" \
  --member="serviceAccount:$APP_SA@$PROJECT.iam.gserviceaccount.com" --role=roles/storage.objectCreator >/dev/null

echo "== Segredos gerados aqui (valores nunca impressos)"
mk_secret() { # nome, comando que gera o valor
  local name="$1"; shift
  exists g secrets describe "$name" || g secrets create "$name" --replication-policy=user-managed --locations="$REGION" --labels=app=partyx,env=homologacao
  if [ -z "$(g secrets versions list "$name" --limit=1 --format='value(name)')" ]; then
    "$@" | g secrets versions add "$name" --data-file=- >/dev/null
  fi
  g secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:$APP_SA@$PROJECT.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor >/dev/null
}
mk_secret session-secret openssl rand -base64 48
# QR_HMAC_KEYS exige "versão:chave" em base64url (o antigo qr-hmac-key-v1 estava em base64 comum e não era aceito pelo código).
mk_secret qr-hmac-keys bash -c "printf '1:%s' \"\$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n')\""

# Turnstile em homologação: por padrão a chave de TESTE da Cloudflare (pública na documentação deles, aceita qualquer token). Para a chave real, defina TURNSTILE_SECRET_VALUE.
mk_secret turnstile-secret printf %s "${TURNSTILE_SECRET_VALUE:-1x0000000000000000000000000000000AA}"

echo "== Segredos que dependem de terceiros (criados vazios; valor entra depois)"
# database-url (papel limitado da aplicação): lida pelo runtime.
# database-url-direct (dono do banco, para migrações): lida SÓ pela conta de deploy. O runtime nunca vê.
for name in database-url database-url-direct smtp-url; do
  exists g secrets describe "$name" || g secrets create "$name" --replication-policy=user-managed --locations="$REGION" --labels=app=partyx,env=homologacao
done
g secrets add-iam-policy-binding database-url \
  --member="serviceAccount:$APP_SA@$PROJECT.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor >/dev/null
g secrets add-iam-policy-binding database-url-direct \
  --member="serviceAccount:$CI_SA@$PROJECT.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor >/dev/null
g secrets add-iam-policy-binding smtp-url \
  --member="serviceAccount:$APP_SA@$PROJECT.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor >/dev/null

echo "== Orçamento e alertas (R\$ $BUDGET_BRL/mês)"
if ! gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" --format='value(displayName)' | grep -qx "partyx-hml"; then
  gcloud billing budgets create --billing-account="$BILLING_ACCOUNT" --display-name="partyx-hml" \
    --budget-amount="${BUDGET_BRL}BRL" --filter-projects="projects/$(g projects describe "$PROJECT" --format='value(projectNumber)')" \
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
fi
echo "ok"
