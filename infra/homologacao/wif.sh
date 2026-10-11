#!/usr/bin/env bash
# Liga o GitHub Actions à conta de deploy SEM chave de serviço (Workload Identity Federation).
# Uso: REPO=dono/nome ./infra/homologacao/wif.sh
# Não foi executado ainda: o repositório no GitHub não existe. Depois de rodar, defina no GitHub, em
# Settings > Environments > homologacao > Variables: GCP_WIF_PROVIDER e GCP_DEPLOY_SA (valores impressos no fim).
set -euo pipefail
: "${REPO:?defina REPO=dono/nome}"
PROJECT="${PROJECT:-partyx-hml}"
POOL="github"; PROVIDER="partyx"
DEPLOY_SA="partyx-deploy@$PROJECT.iam.gserviceaccount.com"
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"

gcloud iam workload-identity-pools describe "$POOL" --project="$PROJECT" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create "$POOL" --project="$PROJECT" --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$PROJECT" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project="$PROJECT" --location=global --workload-identity-pool="$POOL" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/develop'"

# Só a branch develop deste repositório assume a conta de deploy.
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --project="$PROJECT" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO"

# Papéis mínimos para build, migração e deploy.
for role in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/storage.objectAdmin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$DEPLOY_SA" --role="$role" --condition=None >/dev/null
done
for sa in "partyx-app@$PROJECT.iam.gserviceaccount.com" "$DEPLOY_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$sa" --project="$PROJECT" --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser >/dev/null
done

echo "GCP_WIF_PROVIDER=projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo "GCP_DEPLOY_SA=$DEPLOY_SA"
