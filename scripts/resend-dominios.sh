#!/usr/bin/env bash
# Cria (ou reaproveita) os domínios de envio no Resend e grava os registros DNS que a API devolver, sem guardar a chave.
#
# Uso: bash scripts/resend-dominios.sh     (num terminal; a digitação da chave fica oculta)
#      DOMINIOS="hml.partyx.com.br partyx.com.br"  REGIAO=sa-east-1  SAIDA=docs/operacao/resend-registros.json  (padrões)
#
# A chave precisa ter permissão de domínios (no painel: API Keys > Full access). Ela fica só na memória deste processo: não é
# gravada em arquivo nem no Secret Manager, e vai ao curl pelo stdin (nunca na linha de comando). Depois de usar, apague-a no painel
# e crie as chaves de ENVIO de cada ambiente (Sending access, restritas ao domínio), que entram pelos scripts de SMTP.
# A saída tem só nomes de domínio e registros DNS públicos (DKIM, SPF e MX de retorno): não é segredo e pode ir para o repositório.
set -euo pipefail
set +x
umask 077
cd "$(dirname "$0")/.."
DOMINIOS=${DOMINIOS:-"hml.partyx.com.br partyx.com.br"}
REGIAO=${REGIAO:-sa-east-1}
SAIDA=${SAIDA:-docs/operacao/resend-registros.json}
API=https://api.resend.com

IFS= read -r -s -p "Chave de API do Resend (com permissão de domínios): " KEY
echo >&2
KEY=${KEY//[[:space:]]/}
[[ $KEY == re_* ]] || { echo "erro: a chave do Resend começa com re_; nada foi feito." >&2; exit 1; }

call() { # método, caminho, [corpo JSON]
  local method=$1 path=$2 body=${3:-}
  {
    printf 'header = "Authorization: Bearer %s"\n' "$KEY"
    printf 'header = "Content-Type: application/json"\n'
    printf 'request = "%s"\n' "$method"
    [ -z "$body" ] || printf 'data = "%s"\n' "${body//\"/\\\"}"
  } | curl -sS --max-time 30 -K - "$API$path"
}

list=$(call GET /domains)
python3 -I -c 'import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if isinstance(d.get("data"), list) else 1)' "$list" \
  || { echo "erro: a API do Resend recusou a chave ou a listagem de domínios (precisa de Full access)." >&2; exit 1; }

result='[]'
for name in $DOMINIOS; do
  id=$(python3 -I -c 'import json,sys; print(next((x["id"] for x in json.loads(sys.argv[1])["data"] if x["name"]==sys.argv[2]), ""))' "$list" "$name")
  if [ -z "$id" ]; then
    created=$(call POST /domains "{\"name\":\"$name\",\"region\":\"$REGIAO\"}")
    id=$(python3 -I -c 'import json,sys; print(json.loads(sys.argv[1]).get("id",""))' "$created")
    [ -n "$id" ] || { echo "erro ao criar $name: $(python3 -I -c 'import json,sys; d=json.loads(sys.argv[1]); print(d.get("message") or d.get("name") or "resposta inesperada")' "$created")" >&2; exit 1; }
    echo "criado: $name ($REGIAO)"
  else
    echo "já existia: $name"
  fi
  detail=$(call GET "/domains/$id")
  result=$(python3 -I -c '
import json,sys
acc=json.loads(sys.argv[1]); d=json.loads(sys.argv[2])
acc.append({"name": d.get("name"), "region": d.get("region"), "status": d.get("status"),
            "records": [{k: r.get(k) for k in ("record","type","name","value","priority","ttl","status")} for r in d.get("records",[])]})
print(json.dumps(acc))' "$result" "$detail")
done
unset KEY

python3 -I -c '
import json,sys
data=json.loads(sys.argv[1])
json.dump({"origem": "API do Resend (GET /domains/{id})", "dominios": data}, open(sys.argv[2],"w"), ensure_ascii=False, indent=1)
for d in data:
    print("\n%s (%s, %s)" % (d["name"], d["region"], d["status"]))
    for r in d["records"]:
        print("  %-5s %-4s %-28s prioridade=%s  %s" % (r["record"], r["type"], r["name"], r.get("priority") or "-", (r["value"] or "")[:70] + ("…" if len(r["value"] or "")>70 else "")))' "$result" "$SAIDA"
echo
echo "Registros gravados em $SAIDA. Avise no chat que rodou; os valores completos estão no arquivo."
