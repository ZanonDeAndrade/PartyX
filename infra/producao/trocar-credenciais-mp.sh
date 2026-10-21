#!/usr/bin/env bash
# Troca das credenciais de PRODUÇÃO do Mercado Pago (Access Token, Public Key e assinatura secreta do webhook), para o responsável
# rodar no próprio terminal. Nenhum valor aparece na tela, na linha de comando de outro processo, em arquivo ou no histórico.
#
# Uso: bash infra/producao/trocar-credenciais-mp.sh               (mesma conta: o token precisa ser da conta do MP_COLLECTOR_ID)
#      bash infra/producao/trocar-credenciais-mp.sh --nova-conta  (troca de conta: mostra o id e o apelido da conta nova, pede
#                                                                  "sim" e, no fim, imprime o id para atualizar o MP_COLLECTOR_ID)
#
# Ordem: valida os três valores (formato, conta do token, Public Key na API) e só então grava cada um como versão NOVA no Secret
# Manager de partyx-producao. As versões antigas continuam ativas (desativar só depois de 24 horas sem erro). Sem --nova-conta, conta
# diferente da do MP_COLLECTOR_ID atual para sem gravar nada.
#
# Onde pegar (Suas integrações > aplicação da PartyX):
#   Access Token e Public Key: Produção > Credenciais de produção (APP_USR-), do mesmo par renovado.
#   Assinatura secreta: Webhooks > Configurar notificações > Assinatura secreta (revelada pelo ícone do olho).
set -euo pipefail
set +x
umask 077
export CLOUDSDK_CORE_PROJECT=partyx-producao
ENV_FILE="$(dirname "$0")/env.prod.yaml"

NEW_ACCOUNT=0
case "${1:-}" in
  '') ;;
  --nova-conta) NEW_ACCOUNT=1 ;;
  *) echo "erro: opção desconhecida: $1 (use --nova-conta para credenciais de outra conta); nada foi gravado." >&2; exit 1 ;;
esac

ACCESS='' PUBLIC='' SECRET=''
trap 'ACCESS="" PUBLIC="" SECRET=""; unset ACCESS PUBLIC SECRET' EXIT

fail() { echo "erro: $1; nada foi gravado." >&2; exit 1; }

ask() { # pergunta sem eco; tira espaços e quebras coladas junto
  local value
  IFS= read -r -s -p "$1: " value </dev/tty
  echo >&2
  printf '%s' "${value//[[:space:]]/}"
}

gcloud projects describe partyx-producao --format='value(projectId)' >/dev/null 2>&1 ||
  fail "sem acesso ao projeto partyx-producao no gcloud (rode: gcloud auth login)"
COLLECTOR="$(sed -n 's/^MP_COLLECTOR_ID: *"\{0,1\}\([0-9]\{1,20\}\)"\{0,1\} *$/\1/p' "$ENV_FILE")"
[[ $COLLECTOR =~ ^[0-9]+$ ]] || fail "MP_COLLECTOR_ID não encontrado em $ENV_FILE"

ACCESS="$(ask "Access Token novo (Credenciais de produção)")"
PUBLIC="$(ask "Public Key nova (do mesmo par)")"
SECRET="$(ask "Assinatura secreta nova do webhook (revelada)")"

# Formato
[[ -n $ACCESS && -n $PUBLIC && -n $SECRET ]] || fail "algum valor ficou vazio"
[[ $ACCESS != TEST-* && $PUBLIC != TEST-* ]] || fail "credencial de TESTE (TEST-); em produção só APP_USR-"
[[ $ACCESS == APP_USR-* ]] || fail "o Access Token de produção começa com APP_USR-"
[[ $PUBLIC == APP_USR-* ]] || fail "a Public Key de produção começa com APP_USR-"
[[ $ACCESS != "$PUBLIC" ]] || fail "Access Token e Public Key iguais (colou o mesmo valor duas vezes)"
(export LC_ALL=C; [[ $ACCESS =~ ^APP_USR-[A-Za-z0-9-]{20,190}$ && $PUBLIC =~ ^APP_USR-[A-Za-z0-9-]{20,190}$ ]]) ||
  fail "Access Token ou Public Key em formato não reconhecido"
[[ $SECRET != *•* ]] || fail "a assinatura veio mascarada (••••); revele no painel (ícone do olho) e copie de novo"
(export LC_ALL=C; [[ $SECRET =~ ^[A-Za-z0-9._~+/=-]{16,200}$ ]]) || fail "assinatura secreta em formato não reconhecido"

# Conta do token: GET /users/me, com o token pelo stdin do curl (nunca na linha de comando). Sem --nova-conta, só diz "mesma" ou
# "outra". Com --nova-conta, devolve o id e o apelido (ou o e-mail mascarado) da conta, e nada mais dela.
set +e
account="$(printf 'header = "Authorization: Bearer %s"\n' "$ACCESS" |
  curl -sS --max-time 15 -K - https://api.mercadopago.com/users/me 2>/dev/null |
  COLLECTOR="$COLLECTOR" NEW_ACCOUNT="$NEW_ACCOUNT" python3 -I -c '
import json, os, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(2)
if "id" not in d: sys.exit(2)
if "test_user" in (d.get("tags") or []): sys.exit(3)
if d.get("site_id") != "MLB": sys.exit(4)
same = str(d["id"]) == os.environ["COLLECTOR"]
if os.environ["NEW_ACCOUNT"] != "1": sys.exit(0 if same else 5)
if same: sys.exit(6)
user, _, domain = str(d.get("email") or "").partition("@")
masked = user[:1] + "***@" + domain if user and domain else ""
print("%s\t%s" % (d["id"], d.get("nickname") or masked or "(sem apelido nem e-mail)"))')"
rc=$?
set -e
case $rc in
  0) ;;
  2) fail "a API recusou o Access Token (confira se copiou o de produção inteiro)" ;;
  3) fail "o Access Token é de usuário de teste" ;;
  4) fail "a conta não é do Mercado Pago Brasil" ;;
  5) fail "o Access Token é de OUTRA conta, não a do MP_COLLECTOR_ID atual. Se a troca de conta é esperada, rode com --nova-conta" ;;
  6) fail "o Access Token é da conta ATUAL (a do MP_COLLECTOR_ID); rode sem --nova-conta" ;;
  *) fail "resposta inesperada da API do Mercado Pago" ;;
esac
NEW_ID=''
if [[ $NEW_ACCOUNT == 1 ]]; then
  IFS=$'\t' read -r NEW_ID NEW_NAME <<<"$account"
  [[ $NEW_ID =~ ^[0-9]{1,20}$ ]] || fail "id da conta em formato inesperado"
  echo "Access Token: aceito pela API; conta NOVA do Mercado Pago: id $NEW_ID, $NEW_NAME."
else
  echo "Access Token: aceito pela API; mesma conta do MP_COLLECTOR_ID atual."
fi

# Public Key: a busca pública de formas de pagamento responde 404 "public key not found" para chave inexistente. Confere que a
# chave existe; não prova que é do mesmo par (copie as duas da mesma tela).
code="$(printf 'url = "https://api.mercadopago.com/v1/payment_methods/search?site_id=MLB&public_key=%s"\n' "$PUBLIC" |
  curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -K - 2>/dev/null || true)"
[[ $code == 200 ]] || fail "a API não aceitou a Public Key (HTTP ${code:-sem resposta})"
echo "Public Key: aceita pela API."

if [[ $NEW_ACCOUNT == 1 ]]; then
  read -r -p "É a conta em que a PartyX passa a receber? Gravar as três credenciais dela? (digite sim) " ok </dev/tty
else
  read -r -p "Gravar as três como versão nova no Secret Manager de partyx-producao? (digite sim) " ok </dev/tty
fi
[[ $ok == sim ]] || fail "cancelado"

put() { # nome, valor pelo stdin do gcloud; não desativa a versão anterior
  local name=$1 version
  version="$(printf '%s' "$2" | gcloud secrets versions add "$name" --data-file=- --format='value(name)' 2>/dev/null)" ||
    { echo "erro: falhou ao gravar $name (os anteriores desta lista já foram gravados)." >&2; exit 1; }
  echo "gravado: $name, versão ${version##*/}"
}
put mp-access-token "$ACCESS"
put mp-public-key "$PUBLIC"
put mp-webhook-secret "$SECRET"
echo "Pronto. Nada foi gravado em arquivo. Pode avisar no chat."
[[ $NEW_ACCOUNT == 0 ]] || echo "MP_COLLECTOR_ID da conta nova: $NEW_ID (passe este número no chat para atualizar o env.prod.yaml)."
