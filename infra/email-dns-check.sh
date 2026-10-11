#!/usr/bin/env bash
# Confere SPF, DKIM e DMARC do domínio remetente (D-09). SÓ LEITURA: não altera nada.
# NÃO FOI EXECUTADO contra o domínio do cliente (ainda não existe). Uso:
#   DOMAIN=partyx.com.br DKIM_SELECTOR=<seletor do provedor> ./infra/email-dns-check.sh
# Sai com código 1 se algum item obrigatório faltar.
set -uo pipefail

DOMAIN="${DOMAIN:?defina DOMAIN, ex.: partyx.com.br}"
SELECTOR="${DKIM_SELECTOR:?defina DKIM_SELECTOR (o provedor informa o seletor)}"
FAIL=0
txt() { dig +short +time=5 +tries=2 TXT "$1" 2>/dev/null | tr -d '"' | tr '\n' ' '; }
ok()  { echo "OK    $*"; }
bad() { echo "FALHA $*"; FAIL=1; }
warn(){ echo "AVISO $*"; }

command -v dig >/dev/null || { echo "instale dig (dnsutils)"; exit 2; }

SPF="$(txt "$DOMAIN" | grep -o 'v=spf1[^"]*' || true)"
if [ -z "$SPF" ]; then bad "SPF: nenhum registro TXT começando com v=spf1 em $DOMAIN"
else
  ok "SPF: $SPF"
  echo "$SPF" | grep -qE '(-all|~all)' || bad "SPF: termine com -all (ou ~all durante a implantação)"
  [ "$(txt "$DOMAIN" | grep -o 'v=spf1' | wc -l)" -le 1 ] || bad "SPF: mais de um registro v=spf1 (o resultado é erro permanente)"
  echo "$SPF" | grep -q 'include:' || warn "SPF: nenhum include:; confirme que o provedor de e-mail está autorizado"
fi

DKIM="$(txt "${SELECTOR}._domainkey.${DOMAIN}")"
if echo "$DKIM" | grep -qE 'p=[A-Za-z0-9+/=]{20,}'; then ok "DKIM (${SELECTOR}): chave publicada"
else
  CNAME="$(dig +short +time=5 CNAME "${SELECTOR}._domainkey.${DOMAIN}" 2>/dev/null)"
  [ -n "$CNAME" ] && ok "DKIM (${SELECTOR}): CNAME para $CNAME" || bad "DKIM: nada em ${SELECTOR}._domainkey.${DOMAIN}"
fi

DMARC="$(txt "_dmarc.${DOMAIN}" | grep -o 'v=DMARC1[^"]*' || true)"
if [ -z "$DMARC" ]; then bad "DMARC: nenhum registro em _dmarc.${DOMAIN}"
else
  ok "DMARC: $DMARC"
  echo "$DMARC" | grep -q 'rua=' || warn "DMARC: sem rua= (relatórios agregados); recomendado"
  echo "$DMARC" | grep -qE 'p=(quarantine|reject)' || warn "DMARC: p=none só observa; passe a quarantine/reject depois de conferir os relatórios"
fi

[ "$FAIL" -eq 0 ] && echo "Resultado: SPF, DKIM e DMARC presentes. Falta provar a entrega real (docs/email.md)." || echo "Resultado: faltam itens obrigatórios."
exit "$FAIL"
