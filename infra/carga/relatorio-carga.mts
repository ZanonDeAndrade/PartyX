// Relatório da carga: tempos do k6 (p95 por etapa), erros e a conferência de sobrevenda direto no banco de teste.
// Uso: npx tsx infra/carga/relatorio-carga.mts <pasta-de-trabalho> <pasta-de-saída> <código-de-saída-do-k6> <duração> <visitantes> <compras/min>
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const [WORK, OUT, K6_STATUS, DURACAO, VISITANTES, COMPRAS, HEAP = ''] = process.argv.slice(2) as string[] as [
  string,
  string,
  string,
  string,
  string,
  string,
  string?,
];
const SUFIXO = HEAP ? `-heap${HEAP}` : '';
const seed = JSON.parse(readFileSync(path.join(WORK, 'seed.json'), 'utf8')) as { url: string; typeId: string; capacity: number };
const k6 = JSON.parse(readFileSync(path.join(WORK, 'k6-resumo.json'), 'utf8')) as {
  metrics: Record<string, Record<string, number> & { thresholds?: Record<string, boolean> }>;
};
const m = k6.metrics;
const minutos = /^(\d+)s$/.test(DURACAO) ? Number(DURACAO.slice(0, -1)) / 60 : Number(DURACAO.replace(/m$/, ''));
const ms = (v: number | undefined) => (v === undefined ? 'não medido' : `${v.toFixed(1).replace('.', ',')} ms`);
const count = (name: string) => m[name]?.count ?? 0;

const pool = new pg.Pool({ connectionString: seed.url, max: 2 });
const one = async <T,>(sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0] as T;
const tipo = await one<{ total: number; sold: number; tickets: number; ativas: number }>(
  `select t.quantity_total as total, t.quantity_sold as sold,
          (select count(*) from tickets k where k.ticket_type_id = t.id)::int as tickets,
          (select coalesce(sum(r.quantity), 0) from reservations r
            where r.ticket_type_id = t.id and r.status = 'ativa' and r.expires_at > now())::int as ativas
     from ticket_types t where t.id = $1`,
  [seed.typeId],
);
const pedidos = (
  await pool.query(`select status::text as status, count(*)::int as n from orders group by 1 order by 1`)
).rows as { status: string; n: number }[];
const codigos = await one<{ n: number; distintos: number }>(
  `select count(*)::int as n, count(distinct code)::int as distintos from tickets`,
);
const itens = await one<{ excedentes: number }>(
  `select count(*)::int as excedentes from order_items i
    where (select count(*) from tickets k where k.order_item_id = i.id) > i.quantity`,
);
await pool.end();

const pagos = pedidos.find(p => p.status === 'pago')?.n ?? 0;
const sobrevenda = tipo.sold > tipo.total || tipo.tickets > tipo.total || tipo.sold + tipo.ativas > tipo.total;
const recursos = readFileSync(path.join(WORK, 'recursos.txt'), 'utf8')
  .trim()
  .split('\n')
  .map(l => l.split(' ').map(Number) as [number, number, number])
  .filter(r => r.length === 3 && r.every(Number.isFinite));
let cpuMax = 0;
for (let i = 1; i < recursos.length; i++) {
  const [t1, c1] = recursos[i - 1]!;
  const [t2, c2] = recursos[i]!;
  cpuMax = Math.max(cpuMax, ((c2 - c1) / 100 / (t2 - t1)) * 100);
}
const rssMax = Math.max(...recursos.map(r => r[2])) / 1024;

const etapas: [string, string][] = [
  ['evento_html', 'Página do evento (HTML)'],
  ['evento_api', 'Página do evento (API do evento)'],
  ['compra_1_login', 'Compra 1: login'],
  ['compra_2_pedido_reserva', 'Compra 2: pedido com reserva'],
  ['compra_3_pix', 'Compra 3: Pix'],
  ['compra_4_confirmacao', 'Compra 4: confirmação do gateway (webhook fictício)'],
  ['compra_5_meus_ingressos', 'Compra 5: Meus ingressos'],
];
const thresholdsFailed = Object.entries(m).flatMap(([name, v]) =>
  Object.entries(v.thresholds ?? {})
    // No --summary-export do k6, `true` marca o limite ULTRAPASSADO (reprovado); `false`, aprovado.
    .filter(([, crossed]) => crossed === true)
    .map(([t]) => `${name}: ${t}`),
);
const failedRate = m.http_req_failed?.value ?? 0;
const recusas = count('compras_recusadas_por_estoque');
const concluidas = count('compras_concluidas');
const iniciadas = count('compras_iniciadas');

const out = [
  `# Teste de carga (PDF 11.3): resultado${HEAP ? ` com heap do Node limitado a ${HEAP} MB` : ''}`,
  '',
  `Gerado em ${new Date().toISOString()} por \`infra/carga/run-carga.sh\` (k6 1.0.0 em contêiner). **Ambiente: LOCAL** (um processo Node, ` +
    'PostgreSQL de teste em contêiner na mesma máquina, `DB_POOL_MAX=5` como em homologação e produção), **gateway fictício**. ' +
    '**Não** foi executado em homologação nem em produção: os tempos não incluem rede, Cloud Run, Neon nem o gateway real.' +
    (HEAP ? ` Servidor com \`--max-old-space-size=${HEAP}\`, para aproximar o limite de 512 MiB do Cloud Run.` : ''),
  '',
  '## Configuração',
  '',
  `- ${VISITANTES} usuários virtuais simultâneos na página do evento durante ${DURACAO} (HTML + API do evento, pausa de 1 a 3 s entre visitas).`,
  `- ${COMPRAS} compras por minuto em taxa de chegada constante durante ${DURACAO}: login, pedido com reserva de 2 unidades, Pix, ` +
    'confirmação pelo caminho do webhook (gateway fictício) e Meus ingressos.',
  `- Estoque de propósito menor que a procura: ${seed.capacity} unidades para cerca de ${Math.round(Number(COMPRAS) * minutos * 2)} pedidas, para provar que não há venda acima do estoque.`,
  '',
  '## Resultado',
  '',
  `| Medida | Valor |`,
  `|---|---|`,
  `| Requisições HTTP | ${count('http_reqs')} (${(m.http_reqs?.rate ?? 0).toFixed(1).replace('.', ',')}/s) |`,
  `| Requisições com falha (fora as recusas 409 esperadas) | ${(failedRate * 100).toFixed(2).replace('.', ',')} % |`,
  `| Erros inesperados (status ou conteúdo errado em qualquer etapa) | ${count('erros_inesperados')} |`,
  `| Compras iniciadas | ${iniciadas} |`,
  `| Compras concluídas (2 ingressos na conta) | ${concluidas} |`,
  `| Recusadas por estoque esgotado (409, esperado) | ${recusas} |`,
  `| p95 da compra completa | ${ms(m.compra_completa_ms?.['p(95)'])} |`,
  `| CPU do servidor (pico em janelas de 2 s) | ${cpuMax.toFixed(0)} % de um núcleo |`,
  `| Memória do servidor (pico, RSS) | ${rssMax.toFixed(0)} MB |`,
  `| Limites do k6 (thresholds) | ${thresholdsFailed.length ? `**reprovados:** ${thresholdsFailed.join('; ')}` : 'todos aprovados'} (código de saída ${K6_STATUS}) |`,
  '',
  '### Tempos por etapa',
  '',
  '| Etapa | Requisições | Mediana | p95 | p99 | Máximo |',
  '|---|---|---|---|---|---|',
  ...etapas.map(([tag, label]) => {
    const d = m[`http_req_duration{etapa:${tag}}`];
    return `| ${label} | ${count(`http_reqs{etapa:${tag}}`) || '-'} | ${ms(d?.med)} | ${ms(d?.['p(95)'])} | ${ms(d?.['p(99)'])} | ${ms(d?.max)} |`;
  }),
  '',
  '## Sobrevenda (conferida no banco depois da carga)',
  '',
  '| Conferência | Valor |',
  '|---|---|',
  `| Capacidade do tipo | ${tipo.total} |`,
  `| Vendidos (quantity_sold) | ${tipo.sold} |`,
  `| Ingressos emitidos | ${tipo.tickets} |`,
  `| Reservas ativas restantes | ${tipo.ativas} |`,
  `| Pedidos por situação | ${pedidos.map(p => `${p.status}: ${p.n}`).join(', ')} |`,
  `| Ingressos = 2 × pedidos pagos | ${tipo.tickets === 2 * pagos ? 'sim' : `**não** (${tipo.tickets} para ${pagos} pagos)`} |`,
  `| Códigos de ingresso repetidos | ${codigos.n - codigos.distintos} |`,
  `| Itens com mais ingressos que a quantidade | ${itens.excedentes} |`,
  `| **Houve sobrevenda?** | **${sobrevenda ? 'SIM' : 'Não'}** |`,
  '',
  `Os arquivos \`k6-resumo${SUFIXO}.json\` (métricas exportadas pelo k6) e \`k6-saida${SUFIXO}.txt\` (saída do k6) estão nesta pasta.`,
  '',
];
writeFileSync(path.join(OUT, `resultado${SUFIXO}.md`), out.join('\n'));
console.log(out.join('\n'));
if (sobrevenda) process.exitCode = 1;
