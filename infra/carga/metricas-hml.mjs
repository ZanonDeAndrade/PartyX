// Métricas reais do Cloud Run de HOMOLOGAÇÃO numa janela (Cloud Monitoring, API v3). Somente leitura.
// Uso: GCP_TOKEN=$(gcloud auth print-access-token) node infra/carga/metricas-hml.mjs <início ISO> <fim ISO> [saída.json]
// Imprime uma tabela em Markdown; com o 3º argumento grava também os números em JSON.
import { writeFileSync } from 'node:fs';

const [inicio, fim, saida] = process.argv.slice(2);
const TOKEN = process.env.GCP_TOKEN;
if (!inicio || !fim || !TOKEN) throw new Error('uso: GCP_TOKEN=... node metricas-hml.mjs <início ISO> <fim ISO> [saída.json]');
const PROJECT = 'partyx-hml';
const SERVICE = 'partyx-hml';
const MEM_MIB = Number(process.env.MEMORY_MIB || 512);

async function series(metric, aligner, reducer, { groupBy = [], period = 60 } = {}) {
  const p = new URLSearchParams({
    filter: `metric.type="run.googleapis.com/${metric}" AND resource.labels.service_name="${SERVICE}"`,
    'interval.startTime': inicio,
    'interval.endTime': fim,
    'aggregation.alignmentPeriod': `${period}s`,
    'aggregation.perSeriesAligner': aligner,
    'aggregation.crossSeriesReducer': reducer,
  });
  for (const g of groupBy) p.append('aggregation.groupByFields', g);
  const res = await fetch(`https://monitoring.googleapis.com/v3/projects/${PROJECT}/timeSeries?${p}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`Monitoring ${metric}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).timeSeries ?? [];
}
const values = ts => ts.flatMap(s => s.points.map(p => Number(p.value.doubleValue ?? p.value.int64Value ?? 0)));
const max = ts => Math.max(0, ...values(ts));
const sum = ts => values(ts).reduce((a, b) => a + b, 0);

const out = {
  janela: { inicio, fim },
  latenciaMs: {
    p50: max(await series('request_latencies', 'ALIGN_PERCENTILE_50', 'REDUCE_MAX')),
    p95: max(await series('request_latencies', 'ALIGN_PERCENTILE_95', 'REDUCE_MAX')),
    p99: max(await series('request_latencies', 'ALIGN_PERCENTILE_99', 'REDUCE_MAX')),
  },
  memoria: {
    utilizacaoMaxP99: max(await series('container/memory/utilizations', 'ALIGN_PERCENTILE_99', 'REDUCE_MAX')),
    limiteMiB: MEM_MIB,
  },
  cpuUtilizacaoMaxP99: max(await series('container/cpu/utilizations', 'ALIGN_PERCENTILE_99', 'REDUCE_MAX')),
  instanciasMax: max(await series('container/instance_count', 'ALIGN_MAX', 'REDUCE_SUM')),
  requisicoes: Object.fromEntries(
    (await series('request_count', 'ALIGN_DELTA', 'REDUCE_SUM', { groupBy: ['metric.label.response_code_class'], period: 60 })).map(s => [
      s.metric.labels.response_code_class,
      sum([s]),
    ]),
  ),
};
out.memoria.picoMiB = Math.round(out.memoria.utilizacaoMaxP99 * MEM_MIB);

const pct = x => `${(x * 100).toFixed(0)}%`;
console.log(`| Métrica (Cloud Monitoring, ${inicio} a ${fim}) | Valor |
|---|---|
| Latência do Cloud Run, pior minuto: p50 / p95 / p99 | ${out.latenciaMs.p50.toFixed(0)} / ${out.latenciaMs.p95.toFixed(0)} / ${out.latenciaMs.p99.toFixed(0)} ms |
| Memória, pior minuto (p99 das instâncias) | ${pct(out.memoria.utilizacaoMaxP99)} de ${MEM_MIB} MiB (cerca de ${out.memoria.picoMiB} MiB) |
| CPU, pior minuto (p99 das instâncias) | ${pct(out.cpuUtilizacaoMaxP99)} |
| Instâncias, máximo | ${out.instanciasMax} |
| Requisições por classe de resposta | ${Object.entries(out.requisicoes).map(([k, v]) => `${k}: ${v}`).join(', ') || 'sem dados'} |`);
if (saida) writeFileSync(saida, JSON.stringify(out, null, 1));
