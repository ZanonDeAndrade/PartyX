#!/bin/bash
# Lighthouse móvel (4G simulado, CPU 4x mais lenta) nas 5 páginas pedidas, contra o servidor LOCAL da suíte da auditoria.
# Páginas logadas (pedido e Meus ingressos) recebem o cookie de sessão de um comprador da semente por --extra-headers.
# Uso: auditoria/ferramentas/lighthouse-local.sh <base> <slug do evento> <id do pedido> <cookie __session> <pasta de saída>
set -euo pipefail
BASE=$1; SLUG=$2; ORDER=$3; COOKIE=$4; OUT=$5
mkdir -p "$OUT"
run() { # nome, url, extra-headers json
  npx -y lighthouse@13.5.0 "$2" --quiet --chrome-flags="--headless=new --no-sandbox" --form-factor=mobile --screenEmulation.mobile \
    --throttling-method=simulate --throttling.rttMs=150 --throttling.throughputKbps=1600 --throttling.cpuSlowdownMultiplier=4 \
    --only-categories=performance,accessibility,best-practices,seo --output=json --output=html --output-path="$OUT/$1" \
    ${3:+--extra-headers="$3"} > /dev/null 2>&1 || echo "lighthouse falhou em $1"
}
run vitrine "$BASE/"
run evento "$BASE/eventos/$SLUG"
run checkout "$BASE/checkout/$SLUG" "{\"Cookie\":\"__session=$COOKIE\"}"
run pedido "$BASE/pedido/$ORDER" "{\"Cookie\":\"__session=$COOKIE\"}"
run meus-ingressos "$BASE/meus-ingressos" "{\"Cookie\":\"__session=$COOKIE\"}"
node -e '
const fs=require("fs"); const out=process.argv[1];
console.log("| Página | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | CLS | TBT | FCP | Speed Index | Transferido |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const n of ["vitrine","evento","checkout","pedido","meus-ingressos"]) { const f=out+"/"+n+".report.json"; if(!fs.existsSync(f)){console.log("| "+n+" | (sem relatório) |");continue;} const r=JSON.parse(fs.readFileSync(f,"utf8")); const c=r.categories; const a=r.audits; const s=k=>Math.round((c[k]?.score??0)*100); const v=k=>a[k]?.displayValue??""; const kb=Math.round((a["total-byte-weight"]?.numericValue??0)/1024); console.log(`| ${n} | ${s("performance")} | ${s("accessibility")} | ${s("best-practices")} | ${s("seo")} | ${v("largest-contentful-paint")} | ${v("cumulative-layout-shift")} | ${v("total-blocking-time")} | ${v("first-contentful-paint")} | ${v("speed-index")} | ${kb} kB |`); }
' "$OUT"
