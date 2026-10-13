#!/bin/bash
# Carga REDUZIDA contra a HOMOLOGAÇÃO (PDF 11.3 em escala menor), só com o Mercado Pago de TESTE. Nunca produção.
# Uso: infra/carga/run-carga-hml.sh [duração=2m] [visitantes=50] [compras_por_min=20] [capacidade=60] [compradores=60]
# - Recusa se o serviço não estiver com PAYMENT_GATEWAY=mercadopago e GATEWAY_ENVIRONMENT=sandbox, ou se o banco não tiver a marca
#   de homologação. Grava no banco de homologação um evento fictício (fora da vitrine) e compradores "APRO", sufixados pela rodada.
# - Visitantes pelo Hosting; compras pelo run.app (IP próprio por usuário virtual). A confirmação é a real: o Mercado Pago de teste
#   aprova o Pix e a conciliação do Cloud Tasks emite os ingressos (sem atalho).
# - Mede: k6 (tempos por etapa), Cloud Monitoring (latência, memória, CPU e instâncias do Cloud Run) e amostras do Neon (conexões e
#   ida e volta de `select 1`). Confere no banco que não houve venda acima do estoque.
# Saída: docs/evidencias/carga/homologacao/<rodada>/ (resultado.md, k6-resumo.json, k6-saida.txt, cloudrun.json, neon.txt).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DURACAO=${1:-2m}
VISITANTES=${2:-50}
COMPRAS=${3:-20}
CAPACIDADE=${4:-60}
COMPRADORES=${5:-60}
PROJECT=partyx-hml
REGION=southamerica-east1
SERVICE=partyx-hml
PUBLIC_HOST=partyx-hml.web.app
K6_IMAGE=grafana/k6:1.0.0
RUN=$(node -e 'console.log(Math.floor(Date.now() / 1000).toString(36).slice(-6))')
WORK="$ROOT/e2e/.run/carga-hml"
OUT="$ROOT/docs/evidencias/carga/homologacao/$RUN"
cd "$ROOT"

envs=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --format='value(spec.template.spec.containers[0].env)')
grep -q "'name': 'PAYMENT_GATEWAY', 'value': 'mercadopago'" <<<"$envs" && grep -q "'name': 'GATEWAY_ENVIRONMENT', 'value': 'sandbox'" <<<"$envs" \
  || { echo "recusado: a homologação precisa estar com o Mercado Pago de TESTE (PAYMENT_GATEWAY=mercadopago, GATEWAY_ENVIRONMENT=sandbox)" >&2; exit 1; }
RUN_URL="https://${SERVICE}-$(gcloud projects describe "$PROJECT" --format='value(projectNumber)').${REGION}.run.app"
E2E_DATABASE_URL="$(gcloud secrets versions access latest --secret=database-url-direct --project="$PROJECT")"
READ_URL="$(gcloud secrets versions access latest --secret=database-url-backup --project="$PROJECT")"
export E2E_DATABASE_URL
DATABASE_URL_DIRECT="$E2E_DATABASE_URL" npm run -s db:env -- check homologacao || { echo "recusado: banco sem a marca de homologação" >&2; exit 1; }

rm -rf "$WORK"; mkdir -p "$WORK" "$OUT"; chmod 777 "$WORK"
E2E_REMOTE_DB="$E2E_DATABASE_URL" E2E_RUN_ID="$RUN" npx tsx infra/carga/seed-carga.mts "$WORK/seed.json" "$CAPACIDADE" "$COMPRADORES"
SLUG=$(node -e "console.log(require('$WORK/seed.json').slug)")
TYPE_ID=$(node -e "console.log(require('$WORK/seed.json').typeId)")
EVENT_ID=$(node -e "console.log(require('$WORK/seed.json').eventId)")

DATABASE_URL="$READ_URL" node infra/carga/amostra-neon.mjs "$WORK/neon.txt" "$WORK/parar" &
SAMPLER=$!
trap 'touch "$WORK/parar"; wait $SAMPLER 2>/dev/null || true' EXIT

INICIO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
set +e
docker run --rm -v "$ROOT/infra/carga:/scripts:ro" -v "$WORK:/out" \
  -e ALVO=homologacao -e BASE_URL="$RUN_URL" -e VISIT_BASE="https://$PUBLIC_HOST" -e PUBLIC_HOST="$PUBLIC_HOST" -e TAG=".$RUN" \
  -e SLUG="$SLUG" -e TYPE_ID="$TYPE_ID" -e DURACAO="$DURACAO" -e VISITANTES="$VISITANTES" -e COMPRAS_POR_MIN="$COMPRAS" \
  "$K6_IMAGE" run --quiet --summary-export=/out/k6-resumo.json /scripts/carga.k6.js 2>&1 | tee "$WORK/k6-saida.txt"
K6_STATUS=${PIPESTATUS[0]}
set -e
FIM=$(date -u +%Y-%m-%dT%H:%M:%SZ)
touch "$WORK/parar"; wait $SAMPLER 2>/dev/null || true

# Estoque e emissão do evento da carga, conferidos no banco.
node --input-type=module -e "
import { createRequire } from 'node:module';
const pg = createRequire(process.cwd() + '/')('pg');
const c = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL }); await c.connect();
const t = (await c.query(\`select quantity_total total, quantity_sold sold,
  coalesce((select sum(quantity) from reservations r where r.ticket_type_id = tt.id and r.status = 'ativa' and r.expires_at > now()), 0)::int reserved,
  (select count(*) from tickets k where k.ticket_type_id = tt.id)::int tickets
  from ticket_types tt where id = \$1\`, ['$TYPE_ID'])).rows[0];
const o = (await c.query(\`select status, count(*)::int n from orders where event_id = \$1 group by status order by status\`, ['$EVENT_ID'])).rows;
await c.end();
const ok = t.sold + t.reserved <= t.total && t.tickets === t.sold;
console.log(JSON.stringify({ ...t, pedidos: Object.fromEntries(o.map(r => [r.status, r.n])), semSobrevenda: ok }));
process.exit(ok ? 0 : 1);
" > "$WORK/banco.json" || echo "ATENÇÃO: conferência de estoque falhou (ver banco.json)" >&2

echo "== aguardando 3 min para o Cloud Monitoring consolidar as métricas"
sleep 180
GCP_TOKEN="$(gcloud auth print-access-token)" node infra/carga/metricas-hml.mjs "$INICIO" "$FIM" "$WORK/cloudrun.json" > "$WORK/cloudrun.md"

cp "$WORK"/{k6-resumo.json,k6-saida.txt,neon.txt,cloudrun.json,cloudrun.md,banco.json} "$OUT/"
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const k = JSON.parse(readFileSync('$OUT/k6-resumo.json', 'utf8')).metrics;
const b = JSON.parse(readFileSync('$OUT/banco.json', 'utf8'));
const n = readFileSync('$OUT/neon.txt', 'utf8').trim().split('\n').slice(1).map(l => l.split(' ').map(Number));
const ms = v => v === undefined ? '-' : Math.round(v) + ' ms';
const etapa = e => k['http_req_duration{etapa:' + e + '}'] ?? {};
const linhas = ['evento_html', 'evento_api', 'compra_1_login', 'compra_2_pedido_reserva', 'compra_3_pix', 'compra_4_confirmacao', 'compra_5_meus_ingressos']
  .map(e => '| ' + e + ' | ' + (k['http_reqs{etapa:' + e + '}']?.count ?? 0) + ' | ' + ms(etapa(e).med) + ' | ' + ms(etapa(e)['p(95)']) + ' | ' + ms(etapa(e).max) + ' |');
const cc = k.compra_completa_ms ?? {};
const max = i => Math.max(...n.map(r => r[i]));
const media = i => (n.reduce((a, r) => a + r[i], 0) / Math.max(1, n.length));
writeFileSync('$OUT/resultado.md', [
  '# Carga reduzida em homologação (rodada $RUN)',
  '',
  'Janela: $INICIO a $FIM. Parâmetros: $DURACAO, $VISITANTES visitantes simultâneos (pelo Hosting), $COMPRAS compras/min (pelo run.app),',
  'estoque de $CAPACIDADE unidades, 2 unidades por compra, Mercado Pago de TESTE (confirmação pela conciliação real do Cloud Tasks).',
  'Status do k6: $K6_STATUS (0 = todos os limites atendidos).',
  '',
  '## k6',
  '',
  '| Etapa | Requisições | Mediana | p95 | Máximo |',
  '|---|---|---|---|---|',
  ...linhas,
  '',
  'Compras: iniciadas ' + (k.compras_iniciadas?.count ?? 0) + ', concluídas ' + (k.compras_concluidas?.count ?? 0) + ', recusadas por estoque ' + (k.compras_recusadas_por_estoque?.count ?? 0) + ', erros inesperados ' + (k.erros_inesperados?.count ?? 0) + '.',
  'Compra completa (login até Meus ingressos, inclui a espera pela conciliação): mediana ' + ms(cc.med) + ', p95 ' + ms(cc['p(95)']) + ', máximo ' + ms(cc.max) + '.',
  'Falhas HTTP: ' + ((k.http_req_failed?.value ?? 0) * 100).toFixed(2) + '%.',
  '',
  '## Cloud Run',
  '',
  readFileSync('$OUT/cloudrun.md', 'utf8').trim(),
  '',
  '## Neon (amostras a cada 5 s, desta máquina)',
  '',
  '| Métrica | Valor |',
  '|---|---|',
  '| Amostras | ' + n.length + ' |',
  '| Conexões no banco, máximo | ' + max(1) + ' |',
  '| Conexões ativas, máximo | ' + max(2) + ' |',
  '| Ida e volta de select 1, média / máximo | ' + media(3).toFixed(0) + ' / ' + max(3).toFixed(0) + ' ms |',
  '',
  '## Estoque no banco',
  '',
  'Total ' + b.total + ', vendidos ' + b.sold + ', reservados ' + b.reserved + ', ingressos emitidos ' + b.tickets + '. Pedidos: ' + JSON.stringify(b.pedidos) + '. Sem venda acima do estoque: ' + (b.semSobrevenda ? 'sim' : '**NÃO**') + '.',
  '',
].join('\n'));
"
echo "Resultado em $OUT/resultado.md (status do k6: $K6_STATUS)"
exit "$K6_STATUS"
