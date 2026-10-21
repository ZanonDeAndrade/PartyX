#!/usr/bin/env bash
# Troca das credenciais de PRODUÇÃO do Mercado Pago (Access Token, Public Key e assinatura secreta do webhook), para o responsável
# rodar no próprio terminal. Nenhum valor aparece na tela, na linha de comando de outro processo, em arquivo ou no histórico.
#
# Uso: bash infra/producao/trocar-credenciais-mp.sh
#
# Ordem: valida os três valores (formato, conta do token, Public Key na API) e só então grava cada um como versão NOVA no Secret
# Manager de partyx-producao. As versões antigas continuam ativas (desativar só depois de 24 horas sem erro). Conta diferente da do
# MP_COLLECTOR_ID atual: para sem gravar nada.
#
# Onde pegar (Suas integrações > aplicação da PartyX):
#   Access Token e Public Key: Produção > Credenciais de produção (APP_USR-), do mesmo par renovado.
#   Assinatura secreta: Webhooks > Configurar notificações > Assinatura secreta (revelada pelo ícone do olho).
set -euo pipefail
set +x
umask 077
export CLOUDSDK_CORE_PROJECT=partyx-producao
ENV_FILE="$(dirname "$0")/env.prod.yaml"

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

# Conta do token: GET /users/me, com o token pelo stdin do curl (nunca na linha de comando). Só diz "mesma" ou "outra".
set +e
printf 'header = "Authorization: Bearer %s"\n' "$ACCESS" |
  curl -sS --max-time 15 -K - https://api.mercadopago.com/users/me 2>/dev/null |
  COLLECTOR="$COLLECTOR" python3 -I -c '
import json, os, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(2)
if "id" not in d: sys.exit(2)
if "test_user" in (d.get("tags") or []): sys.exit(3)
if d.get("site_id") != "MLB": sys.exit(4)
sys.exit(0 if str(d["id"]) == os.environ["COLLECTOR"] else 5)'
rc=$?
set -e
case $rc in
  0) echo "Access Token: aceito pela API; mesma conta do MP_COLLECTOR_ID atual." ;;
  2) fail "a API recusou o Access Token (confira se copiou o de produção inteiro)" ;;
  3) fail "o Access Token é de usuário de teste" ;;
  4) fail "a conta não é do Mercado Pago Brasil" ;;
  5) fail "o Access Token é de OUTRA conta, não a do MP_COLLECTOR_ID atual. Pare e avise no chat" ;;
  *) fail "resposta inesperada da API do Mercado Pago" ;;
esac

# Public Key: a busca pública de formas de pagamento responde 404 "public key not found" para chave inexistente. Confere que a
# chave existe; não prova que é do mesmo par (copie as duas da mesma tela).
code="$(printf 'url = "https://api.mercadopago.com/v1/payment_methods/search?site_id=MLB&public_key=%s"\n' "$PUBLIC" |
  curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -K - 2>/dev/null || true)"
[[ $code == 200 ]] || fail "a API não aceitou a Public Key (HTTP ${code:-sem resposta})"
echo "Public Key: aceita pela API."

read -r -p "Gravar as três como versão nova no Secret Manager de partyx-producao? (digite sim) " ok </dev/tty
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
