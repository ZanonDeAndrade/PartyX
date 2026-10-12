#!/usr/bin/env bash
# Grava as credenciais de PRODUÇÃO do Mercado Pago direto no Secret Manager do projeto de produção, sem mostrar os valores.
# Nunca grava em arquivo: o .env.local fica só com as credenciais de teste (scripts/setup-mp-credentials.sh).
#
# Uso: bash scripts/setup-mp-credentials-producao.sh   (num terminal; a digitação fica oculta)
#      bash scripts/setup-mp-credentials-producao.sh --so-webhook   (troca só a assinatura secreta)
#      PROJECT=partyx-producao é o padrão; REGION=southamerica-east1 (igual ao infra/producao/deploy.sh).
#
# Onde pegar (painel "Suas integrações" > aplicação da PartyX):
#   MP_ACCESS_TOKEN e MP_PUBLIC_KEY: Produção > Credenciais de produção (prefixo APP_USR-).
#   MP_WEBHOOK_SECRET: Webhooks > Configurar notificações > Assinatura secreta.
#
# Segredos criados: mp-access-token, mp-public-key, mp-webhook-secret (leitura só pela conta de serviço partyx-app).
# Cada nova gravação desativa a versão anterior (versão ativa conta no custo; a desativada pode ser reativada).
set -euo pipefail
set +x
umask 077

PROJECT=${PROJECT:-partyx-producao}
REGION=${REGION:-southamerica-east1}
case $PROJECT in *hml* | *homolog*)
  echo "erro: PROJECT parece de homologação: $PROJECT"
  exit 1
  ;;
esac
LABELS="app=partyx,env=producao"
APP_SA="partyx-app@$PROJECT.iam.gserviceaccount.com"
g() { gcloud --project="$PROJECT" --quiet "$@"; }

ask() {
  local prompt=$1 value
  IFS= read -r -s -p "$prompt: " value
  echo >&2
  value=${value//[[:space:]]/}
  printf '%s' "$value"
}

fail() {
  echo "erro: $1; nada foi gravado."
  exit 1
}

echo "Projeto de destino: $PROJECT"
g projects describe "$PROJECT" --format='value(projectId)' >/dev/null 2>&1 ||
  fail "sem acesso ao projeto $PROJECT no gcloud (rode: gcloud auth login)"

# A assinatura secreta só tem caracteres comuns. Bolinhas (•) indicam que foi copiado o valor mascarado do painel:
# clique no ícone do olho para revelar a assinatura antes de copiar.
check_secret() {
  [[ -n $SECRET ]] || fail "MP_WEBHOOK_SECRET vazio"
  [[ $SECRET != *•* ]] || fail "MP_WEBHOOK_SECRET veio mascarado (••••); revele a assinatura no painel (ícone do olho) e copie de novo"
  (
    export LC_ALL=C
    [[ $SECRET =~ ^[A-Za-z0-9._~+/=-]+$ && ${#SECRET} -ge 16 ]]
  ) || fail "MP_WEBHOOK_SECRET em formato não reconhecido"
}

put() { # nome, valor (pelo stdin do gcloud, nunca na linha de comando)
  local name=$1 value=$2 old
  if ! g secrets describe "$name" >/dev/null 2>&1; then
    g secrets create "$name" --replication-policy=user-managed --locations="$REGION" --labels="$LABELS" >/dev/null
  fi
  old=$(g secrets versions list "$name" --filter='state=ENABLED' --format='value(name)' 2>/dev/null || true)
  printf '%s' "$value" | g secrets versions add "$name" --data-file=- >/dev/null
  for v in $old; do g secrets versions disable "${v##*/}" --secret="$name" >/dev/null; done
  g secrets add-iam-policy-binding "$name" --member="serviceAccount:$APP_SA" \
    --role=roles/secretmanager.secretAccessor >/dev/null
}

# --so-webhook: troca só a assinatura secreta (as credenciais já gravadas ficam como estão).
if [[ ${1:-} == --so-webhook ]]; then
  SECRET=$(ask "MP_WEBHOOK_SECRET (Webhooks > Assinatura secreta, revelada)")
  check_secret
  put mp-webhook-secret "$SECRET"
  echo "MP_WEBHOOK_SECRET: ok"
  echo "Gravado no Secret Manager de $PROJECT (versão anterior desativada). Pode fechar este terminal e avisar no chat."
  exit 0
fi

ACCESS=$(ask "MP_ACCESS_TOKEN (Credenciais de produção > Access Token)")
PUBLIC=$(ask "MP_PUBLIC_KEY (Credenciais de produção > Public Key)")
SECRET=$(ask "MP_WEBHOOK_SECRET (Webhooks > Assinatura secreta, revelada)")

[[ -n $ACCESS && -n $PUBLIC ]] || fail "algum valor ficou vazio"
check_secret
[[ $ACCESS == APP_USR-* ]] || fail "o Access Token de produção começa com APP_USR- (este parece de teste)"
[[ $PUBLIC == APP_USR-* ]] || fail "a Public Key de produção começa com APP_USR- (esta parece de teste)"

# Confere a conta na API (o token vai pelo stdin do curl, nunca na linha de comando). Recusa usuário de teste e conta
# fora do Brasil. Mostra só apelido e id da conta, para você conferir que é a conta da PartyX.
body=$(printf 'header = "Authorization: Bearer %s"\n' "$ACCESS" |
  curl -sS --max-time 15 -K - https://api.mercadopago.com/users/me 2>/dev/null) ||
  fail "não foi possível consultar a API do Mercado Pago"
set +e
account=$(printf '%s' "$body" | python3 -I -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(2)
if "id" not in d:
    sys.exit(2)
if "test_user" in (d.get("tags") or []):
    sys.exit(3)
if d.get("site_id") != "MLB":
    sys.exit(4)
print("%s (id %s)" % (d.get("nickname", "?"), d["id"]))
')
rc=$?
set -e
case $rc in
  0) ;;
  2) fail "a API recusou o Access Token (confira se copiou o de produção inteiro)" ;;
  3) fail "este Access Token é de um usuário de teste, não da conta real" ;;
  4) fail "a conta não é do Mercado Pago Brasil" ;;
  *) fail "resposta inesperada da API" ;;
esac
echo "Conta do Mercado Pago: $account"
read -r -p "É a conta da PartyX que deve receber os pagamentos? (digite sim) " ok
[[ $ok == sim ]] || fail "cancelado"

put mp-access-token "$ACCESS"
put mp-public-key "$PUBLIC"
put mp-webhook-secret "$SECRET"

echo "MP_ACCESS_TOKEN: ok (APP_USR-…${ACCESS: -4})"
echo "MP_PUBLIC_KEY: ok (APP_USR-…${PUBLIC: -4})"
echo "MP_WEBHOOK_SECRET: ok"
echo "Gravados no Secret Manager de $PROJECT. Nada foi gravado em arquivo. Pode fechar este terminal e avisar no chat."
