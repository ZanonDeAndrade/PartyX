#!/usr/bin/env bash
# Copia as credenciais de TESTE do Mercado Pago do .env.local (scripts/setup-mp-credentials.sh) para o Secret Manager de HOMOLOGAÇÃO,
# sem mostrar os valores. O roteiro 11.2 contra a homologação assina as notificações com a mesma assinatura secreta, por isso a origem
# é o .env.local e não uma digitação nova.
#
# Uso: bash scripts/setup-mp-credentials-homologacao.sh      (PROJECT=partyx-hml e REGION=southamerica-east1 são o padrão)
#
# Recusa: projeto que pareça de produção, credencial que não seja de usuário de TESTE (consulta /users/me) e valor vazio.
# Segredos: mp-access-token, mp-public-key, mp-webhook-secret (leitura só pela conta partyx-app). Cada gravação desativa a versão
# anterior (versão ativa conta no custo; a desativada pode ser reativada). Nada é gravado se alguma conferência falhar.
set -euo pipefail
set +x
umask 077
cd "$(dirname "$0")/.."
PROJECT=${PROJECT:-partyx-hml}
REGION=${REGION:-southamerica-east1}
case $PROJECT in *prod*) echo "erro: PROJECT parece de produção: $PROJECT" >&2; exit 1 ;; esac
LABELS="app=partyx,env=homologacao"
APP_SA="partyx-app@$PROJECT.iam.gserviceaccount.com"
g() { gcloud --project="$PROJECT" --quiet "$@"; }
fail() { echo "erro: $1; nada foi gravado." >&2; exit 1; }

[ -f .env.local ] || fail ".env.local ausente (rode scripts/setup-mp-credentials.sh)"
# Lê sem `source`: só a linha da variável, sem aspas em volta. Nada é impresso.
value() { sed -n "s/^$1=//p" .env.local | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" | tr -d '\r'; }
ACCESS=$(value MP_ACCESS_TOKEN)
PUBLIC=$(value MP_PUBLIC_KEY)
SECRET=$(value MP_WEBHOOK_SECRET)
[[ -n $ACCESS && -n $PUBLIC && -n $SECRET ]] || fail "MP_ACCESS_TOKEN, MP_PUBLIC_KEY e MP_WEBHOOK_SECRET precisam estar no .env.local"

# Usuário de TESTE do Mercado Pago (o token vai pelo stdin do curl, nunca na linha de comando).
collector=$(printf 'header = "Authorization: Bearer %s"\n' "$ACCESS" |
  curl -sS --max-time 15 -K - https://api.mercadopago.com/users/me |
  python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d["id"] if "test_user" in (d.get("tags") or []) else "")' 2>/dev/null) ||
  fail "não foi possível consultar a API do Mercado Pago"
[[ $collector =~ ^[0-9]+$ ]] || fail "as credenciais do .env.local não são de usuário de TESTE do Mercado Pago"

g projects describe "$PROJECT" --format='value(projectId)' >/dev/null 2>&1 || fail "sem acesso ao projeto $PROJECT"
put() { # nome, valor (pelo stdin do gcloud, nunca na linha de comando)
  local name=$1 value=$2 old
  g secrets describe "$name" >/dev/null 2>&1 ||
    g secrets create "$name" --replication-policy=user-managed --locations="$REGION" --labels="$LABELS" >/dev/null
  old=$(g secrets versions list "$name" --filter='state=ENABLED' --format='value(name)' 2>/dev/null || true)
  printf '%s' "$value" | g secrets versions add "$name" --data-file=- >/dev/null
  for v in $old; do g secrets versions disable "${v##*/}" --secret="$name" >/dev/null; done
  g secrets add-iam-policy-binding "$name" --member="serviceAccount:$APP_SA" --role=roles/secretmanager.secretAccessor >/dev/null
  echo "$name: ok"
}
put mp-access-token "$ACCESS"
put mp-public-key "$PUBLIC"
put mp-webhook-secret "$SECRET"
echo "Conta de teste $collector gravada em $PROJECT. O deploy.sh de homologação liga o Mercado Pago de teste ao encontrar os segredos."
