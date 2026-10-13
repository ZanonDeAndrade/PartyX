#!/usr/bin/env bash
# Roteiro 11.2 (Playwright) contra a HOMOLOGAÇÃO, com o Mercado Pago de TESTE. Nunca produção.
# Uso: infra/testes/roteiro-hml.sh [base=https://partyx-hml.web.app]
# Lê do Secret Manager de partyx-hml, direto para variáveis do processo (nada é impresso): a URL direta do banco (conferências e
# o adiantamento do prazo do item 7) e a do SMTP (caixa de captura Ethereal, lida por IMAP nos itens 2 e 12).
# As credenciais de teste do Mercado Pago vêm do .env.local e precisam ser as mesmas gravadas na homologação
# (scripts/setup-mp-credentials-homologacao.sh): o roteiro assina as notificações com a assinatura secreta.
# Evidências em docs/evidencias/roteiro-11-2/homologacao-sandbox/.
set -euo pipefail
cd "$(dirname "$0")/../.."
PROJECT=partyx-hml
BASE="${1:-https://partyx-hml.web.app}"
case "$BASE" in https://partyx-hml.web.app | https://partyx-hml-*.run.app) ;; *) echo "recusado: base fora da homologação: $BASE" >&2; exit 2 ;; esac

E2E_DATABASE_URL="$(gcloud secrets versions access latest --secret=database-url-direct --project="$PROJECT")"
E2E_SMTP_URL="$(gcloud secrets versions access latest --secret=smtp-url --project="$PROJECT")"
export E2E_DATABASE_URL E2E_SMTP_URL
DATABASE_URL_DIRECT="$E2E_DATABASE_URL" npm run -s db:env -- check homologacao \
  || { echo "recusado: o banco não tem a marca de homologação" >&2; exit 1; }

E2E_BASE_URL="$BASE" npm run e2e:roteiro:sandbox
