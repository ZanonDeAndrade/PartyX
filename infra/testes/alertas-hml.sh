#!/usr/bin/env bash
# Dispara de propósito, na HOMOLOGAÇÃO, os sinais estorno_parcial e cobranca_duplicada (infra/testes/alertas-hml.mjs).
# Lê do Secret Manager de partyx-hml a URL direta do banco, direto para a variável do processo (nada é impresso). Nunca produção.
set -euo pipefail
cd "$(dirname "$0")/../.."
PROJECT=partyx-hml
REGION=southamerica-east1
E2E_DATABASE_URL="$(gcloud secrets versions access latest --secret=database-url-direct --project="$PROJECT")"
export E2E_DATABASE_URL
DATABASE_URL_DIRECT="$E2E_DATABASE_URL" npm run -s db:env -- check homologacao || { echo "recusado: banco sem a marca de homologação" >&2; exit 1; }
RUN_URL="https://partyx-hml-$(gcloud projects describe "$PROJECT" --format='value(projectNumber)').${REGION}.run.app" \
  PUBLIC_HOST=partyx-hml.web.app node infra/testes/alertas-hml.mjs
