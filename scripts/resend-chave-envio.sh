#!/usr/bin/env bash
# Cria no Resend uma chave SÓ DE ENVIO, restrita a UM domínio, e grava o smtp-url do ambiente no Secret Manager, sem mostrar nada.
#
# Uso: bash scripts/resend-chave-envio.sh homologacao     (domínio hml.partyx.com.br, projeto partyx-hml)
#      bash scripts/resend-chave-envio.sh producao        (domínio partyx.com.br, projeto partyx-producao)
#      Rodar num terminal: pede a chave de ACESSO TOTAL com digitação oculta (a mesma do resend-dominios.sh).
#
# O que faz: confere que o domínio do ambiente existe e está VERIFICADO no Resend; cria a chave "partyx-<ambiente>-envio" com
# permissão sending_access e domain_id do domínio; monta smtps://resend:<chave nova>@smtp.resend.com:465; confere a autenticação no
# SMTP; grava uma versão nova de smtp-url no projeto do ambiente e desativa a anterior (não apaga: dá para voltar).
# A chave de acesso total e a chave nova ficam só na memória deste processo. Vale no próximo deploy do ambiente, junto com o
# EMAIL_FROM do arquivo de variáveis. Depois de rodar para os dois ambientes, REVOGUE a chave de acesso total no painel do Resend.
set -euo pipefail
set +x
umask 077
cd "$(dirname "$0")/.."
case "${1:-}" in
  homologacao) DOMAIN=hml.partyx.com.br; PROJECT=partyx-hml ;;
  producao) DOMAIN=partyx.com.br; PROJECT=partyx-producao ;;
  *) echo "uso: bash scripts/resend-chave-envio.sh homologacao|producao" >&2; exit 2 ;;
esac
API=https://api.resend.com
g() { gcloud --project="$PROJECT" --quiet "$@"; }
fail() { echo "erro: $1; nada foi gravado." >&2; exit 1; }

echo "Ambiente: $1 | domínio: $DOMAIN | projeto: $PROJECT"
g secrets describe smtp-url >/dev/null 2>&1 || fail "o segredo smtp-url não existe em $PROJECT"
IFS= read -r -s -p "Chave de API do Resend de ACESSO TOTAL: " FULL
echo >&2
FULL=${FULL//[[:space:]]/}
[[ $FULL == re_* ]] || fail "a chave do Resend começa com re_"

call() { # método, caminho, [corpo JSON]
  local method=$1 path=$2 body=${3:-}
  {
    printf 'header = "Authorization: Bearer %s"\n' "$FULL"
    printf 'header = "Content-Type: application/json"\n'
    printf 'request = "%s"\n' "$method"
    [ -z "$body" ] || printf 'data = "%s"\n' "${body//\"/\\\"}"
  } | curl -sS --max-time 30 -K - "$API$path"
}

info=$(call GET /domains | python3 -I -c '
import json,sys
d=json.load(sys.stdin)
x=next((x for x in d.get("data") or [] if x.get("name")==sys.argv[1]), None)
print("%s %s" % (x["id"], x.get("status")) if x else "")' "$DOMAIN") || fail "a API do Resend recusou a chave"
[ -n "$info" ] || fail "o domínio $DOMAIN não existe no Resend (rode scripts/resend-dominios.sh)"
domain_id=${info%% *}; status=${info##* }
[ "$status" = "verified" ] || fail "o domínio $DOMAIN ainda não está verificado no Resend (estado: $status); crie o DNS e clique em Verify"

# A resposta traz a chave nova uma única vez: fica numa variável e segue direto para o segredo.
NEW=$(call POST /api-keys "{\"name\":\"partyx-$1-envio\",\"permission\":\"sending_access\",\"domain_id\":\"$domain_id\"}" |
  python3 -I -c 'import json,sys; print(json.load(sys.stdin).get("token",""))')
unset FULL
[[ $NEW == re_* ]] || fail "o Resend não devolveu a chave de envio"

SMTP_URL_NEW="smtps://resend:$NEW@smtp.resend.com:465"
unset NEW
SMTP_CHECK_URL="$SMTP_URL_NEW" node -e '
  require("nodemailer").createTransport({ url: process.env.SMTP_CHECK_URL, connectionTimeout: 10000, greetingTimeout: 10000 })
    .verify().then(() => process.exit(0), () => process.exit(1));' || fail "o SMTP do Resend recusou a chave de envio (a chave partyx-$1-envio foi criada no Resend: apague-a no painel)"

old=$(g secrets versions list smtp-url --filter='state=ENABLED' --format='value(name)' 2>/dev/null || true)
printf '%s' "$SMTP_URL_NEW" | g secrets versions add smtp-url --data-file=- >/dev/null
unset SMTP_URL_NEW
for v in $old; do g secrets versions disable "${v##*/}" --secret=smtp-url >/dev/null; done
echo "smtp-url de $PROJECT: ok (chave partyx-$1-envio, só de envio, restrita a $DOMAIN). Versão anterior desativada."
echo "Falta: EMAIL_FROM no arquivo de variáveis do ambiente e o deploy. Quando terminar os dois ambientes, revogue a chave de acesso total."
