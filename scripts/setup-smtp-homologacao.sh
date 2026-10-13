#!/usr/bin/env bash
# Grava o SMTP de entrega REAL da HOMOLOGAÇÃO (Resend) no segredo smtp-url do partyx-hml, sem mostrar a chave.
# Plano e pré-requisitos (conta, domínio verificado, DNS): docs/operacao/email-homologacao-smtp-real.md.
#
# Uso: bash scripts/setup-smtp-homologacao.sh      (num terminal; a digitação fica oculta)
#      SMTP_HOST, SMTP_PORT e SMTP_USER mudam o provedor (padrão: smtp.resend.com, 465 e "resend").
#
# Monta smtps://<usuário>:<chave>@<host>:<porta>, confere a autenticação no próprio SMTP (sem enviar mensagem) e só então grava.
# A versão anterior do segredo (a caixa de captura) fica DESATIVADA, não apagada: dá para voltar. Vale no próximo deploy.
set -euo pipefail
set +x
umask 077
cd "$(dirname "$0")/.."
PROJECT=${PROJECT:-partyx-hml}
case $PROJECT in *prod*) echo "erro: PROJECT parece de produção: $PROJECT" >&2; exit 1 ;; esac
HOST=${SMTP_HOST:-smtp.resend.com}
PORT=${SMTP_PORT:-465}
USER_NAME=${SMTP_USER:-resend}
g() { gcloud --project="$PROJECT" --quiet "$@"; }
fail() { echo "erro: $1; nada foi gravado." >&2; exit 1; }

IFS= read -r -s -p "Chave de API do provedor (senha do SMTP): " KEY
echo >&2
KEY=${KEY//[[:space:]]/}
[[ -n $KEY ]] || fail "chave vazia"
[[ $KEY != *•* ]] || fail "a chave veio mascarada; copie o valor revelado"

# A URL vai pela variável de ambiente do processo, nunca pela linha de comando. O nodemailer confere usuário e senha (verify).
SMTP_CHECK_URL=$(KEY="$KEY" USER_NAME="$USER_NAME" HOST="$HOST" PORT="$PORT" node -e '
  const { KEY, USER_NAME, HOST, PORT } = process.env;
  process.stdout.write(`${PORT === "465" ? "smtps" : "smtp"}://${encodeURIComponent(USER_NAME)}:${encodeURIComponent(KEY)}@${HOST}:${PORT}`);')
SMTP_CHECK_URL="$SMTP_CHECK_URL" node -e '
  require("nodemailer").createTransport({ url: process.env.SMTP_CHECK_URL, connectionTimeout: 10000, greetingTimeout: 10000 })
    .verify().then(() => process.exit(0), () => process.exit(1));' || fail "o SMTP recusou a autenticação (chave, host ou porta)"

g secrets describe smtp-url >/dev/null 2>&1 || fail "o segredo smtp-url não existe em $PROJECT (infra/homologacao/setup.sh)"
old=$(g secrets versions list smtp-url --filter='state=ENABLED' --format='value(name)' 2>/dev/null || true)
printf '%s' "$SMTP_CHECK_URL" | g secrets versions add smtp-url --data-file=- >/dev/null
for v in $old; do g secrets versions disable "${v##*/}" --secret=smtp-url >/dev/null; done
echo "smtp-url: ok ($HOST:$PORT, usuário $USER_NAME). Versão anterior desativada."
echo "Falta: EMAIL_FROM em infra/homologacao/env.hml.yaml e ./infra/homologacao/deploy.sh."
