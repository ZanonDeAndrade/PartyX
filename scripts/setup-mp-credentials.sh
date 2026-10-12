#!/usr/bin/env bash
# Grava as credenciais de TESTE do Mercado Pago no .env.local (fora do Git), sem mostrar os valores.
#
# Uso: bash scripts/setup-mp-credentials.sh   (num terminal; a digitação fica oculta)
#      bash scripts/setup-mp-credentials.sh --so-webhook   (troca só a assinatura secreta)
#
# Onde pegar (painel "Suas integrações" > sua aplicação):
#   MP_ACCESS_TOKEN e MP_PUBLIC_KEY: Testes > Credenciais de teste (da sua conta real).
#   MP_WEBHOOK_SECRET: Webhooks > Configurar notificações > Assinatura secreta.
#
# Por que só teste: a etapa 06 é sandbox. A documentação do Card Payment Brick manda testar cartão com as
# "credenciais de teste da sua conta real" (checkout-bricks/integration-test/test-payment-flow). Elas podem começar com TEST-
# ou com APP_USR- (a documentação do Pix de teste diz que o Access Token de teste começa com APP_USR); as de produção também
# começam com APP_USR-. Por isso o script confere na API e compara com a credencial de produção guardada no Secret Manager
# (sem mostrar nenhuma das duas). Nada é gravado se algo falhar.
set -euo pipefail
set +x
umask 077

cd "$(dirname "$0")/.."
ENV_FILE=.env.local

if ! git check-ignore -q "$ENV_FILE"; then
  echo "erro: $ENV_FILE não está no .gitignore; nada foi gravado."
  exit 1
fi

ask() {
  local prompt=$1 value
  IFS= read -r -s -p "$prompt: " value
  echo >&2
  # remove espaços e quebras coladas junto
  value=${value//[[:space:]]/}
  printf '%s' "$value"
}

# --so-webhook: troca só a assinatura secreta no .env.local (as credenciais de teste ficam como estão).
if [[ ${1:-} == --so-webhook ]]; then
  SECRET=$(ask "MP_WEBHOOK_SECRET (Webhooks > Assinatura secreta, revelada)")
  [[ -n $SECRET ]] || fail "MP_WEBHOOK_SECRET vazio"
  [[ $SECRET != *•* ]] || fail "MP_WEBHOOK_SECRET veio mascarado (••••); revele a assinatura no painel (ícone do olho) e copie de novo"
  (
    export LC_ALL=C
    [[ $SECRET =~ ^[A-Za-z0-9._~+/=-]+$ && ${#SECRET} -ge 16 ]]
  ) || fail "MP_WEBHOOK_SECRET em formato não reconhecido"
  [[ -f $ENV_FILE ]] || fail "$ENV_FILE não existe; rode o script sem --so-webhook primeiro"
  tmp=$(mktemp "$ENV_FILE.XXXXXX")
  trap 'rm -f "$tmp"' EXIT
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line == MP_WEBHOOK_SECRET=* ]] || printf '%s\n' "$line"
  done <"$ENV_FILE" >"$tmp"
  printf 'MP_WEBHOOK_SECRET=%s\n' "$SECRET" >>"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
  trap - EXIT
  echo "MP_WEBHOOK_SECRET: ok"
  echo "Gravado em $ENV_FILE (permissão 600). Pode fechar este terminal e avisar no chat."
  exit 0
fi

ACCESS=$(ask "MP_ACCESS_TOKEN (Credenciais de teste > Access Token)")
PUBLIC=$(ask "MP_PUBLIC_KEY (Credenciais de teste > Public Key)")
SECRET=$(ask "MP_WEBHOOK_SECRET (Webhooks > Assinatura secreta)")

fail() {
  echo "erro: $1; nada foi gravado."
  exit 1
}

[[ -n $ACCESS && -n $PUBLIC && -n $SECRET ]] || fail "algum valor ficou vazio"
[[ $SECRET != *•* ]] || fail "MP_WEBHOOK_SECRET veio mascarado (••••); revele a assinatura no painel (ícone do olho) e copie de novo"
(
  export LC_ALL=C
  [[ $SECRET =~ ^[A-Za-z0-9._~+/=-]+$ && ${#SECRET} -ge 16 ]]
) || fail "MP_WEBHOOK_SECRET em formato não reconhecido"

# Classifica uma credencial APP_USR- pela API (GET /users/me; o token vai pelo stdin do curl, nunca na linha de comando; a resposta,
# com dados da conta, não é exibida):
#   - usuário de teste (etiqueta test_user): teste;
#   - conta real: é teste só se for DIFERENTE do token de produção guardado no Secret Manager (as credenciais de teste da conta real
#     também começam com APP_USR-, segundo a documentação). Sem acesso ao Secret Manager não dá para saber: recusa.
classify_app_usr() {
  local body prod_hash this_hash
  body=$(printf 'header = "Authorization: Bearer %s"\n' "$ACCESS" |
    curl -sS --max-time 15 -K - https://api.mercadopago.com/users/me 2>/dev/null) || return 2
  printf '%s' "$body" | python3 -I -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(2)
if "id" not in data or data.get("site_id") != "MLB":
    sys.exit(2)
sys.exit(0 if "test_user" in (data.get("tags") or []) else 1)
' && return 0
  [[ $? == 1 ]] || return 2
  this_hash=$(printf '%s' "$ACCESS" | sha256sum | cut -d' ' -f1)
  prod_hash=$(gcloud --project="${PROJECT:-partyx-producao}" secrets versions access latest --secret=mp-access-token 2>/dev/null |
    sha256sum | cut -d' ' -f1)
  [[ -n $prod_hash && $prod_hash != "$(printf '' | sha256sum | cut -d' ' -f1)" ]] || return 3
  [[ $this_hash != "$prod_hash" ]] && return 4
  return 1
}

case $ACCESS in
  TEST-*) kind=test ;;
  APP_USR-*)
    set +e
    classify_app_usr
    rc=$?
    set -e
    case $rc in
      0) kind=test_user ;;
      4) kind=test ;;
      1)
        echo "credencial de produção detectada"
        fail "use as credenciais de TESTE nesta etapa"
        ;;
      3) fail "não foi possível comparar com a credencial de produção (sem acesso ao Secret Manager); rode gcloud auth login" ;;
      *) fail "não foi possível confirmar na API que a credencial APP_USR- é de teste" ;;
    esac
    ;;
  *) fail "MP_ACCESS_TOKEN em formato não reconhecido (esperado TEST-... ou APP_USR-...)" ;;
esac

case $PUBLIC in
  TEST-* | APP_USR-*) ;;
  *) fail "MP_PUBLIC_KEY em formato não reconhecido" ;;
esac
if [[ ${PUBLIC%%-*} != "${ACCESS%%-*}" ]]; then
  fail "Public Key e Access Token de telas diferentes: use o par da mesma tela"
fi

# Regrava o .env.local sem as três chaves e acrescenta os valores novos (o resto do arquivo fica igual).
tmp=$(mktemp "$ENV_FILE.XXXXXX")
trap 'rm -f "$tmp"' EXIT
if [[ -f $ENV_FILE ]]; then
  while IFS= read -r line || [[ -n $line ]]; do
    case $line in
      MP_ACCESS_TOKEN=* | MP_PUBLIC_KEY=* | MP_WEBHOOK_SECRET=*) ;;
      *) printf '%s\n' "$line" ;;
    esac
  done <"$ENV_FILE" >"$tmp"
fi
{
  printf 'MP_ACCESS_TOKEN=%s\n' "$ACCESS"
  printf 'MP_PUBLIC_KEY=%s\n' "$PUBLIC"
  printf 'MP_WEBHOOK_SECRET=%s\n' "$SECRET"
} >>"$tmp"
chmod 600 "$tmp"
mv "$tmp" "$ENV_FILE"
trap - EXIT
chmod 600 "$ENV_FILE"

prefix=${ACCESS%%-*}
echo "MP_ACCESS_TOKEN: ok ($prefix-…${ACCESS: -4})"
echo "MP_PUBLIC_KEY: ok (${PUBLIC%%-*}-…${PUBLIC: -4})"
echo "MP_WEBHOOK_SECRET: ok"
if [[ $kind == test_user ]]; then
  echo "aviso: credencial de usuário de teste. Para cartão com Brick, a documentação pede as credenciais de teste da conta real."
fi
echo "Gravado em $ENV_FILE (permissão 600). Pode fechar este terminal e avisar no chat."
