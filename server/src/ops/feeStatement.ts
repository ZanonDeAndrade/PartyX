import type { Db } from '../db/client';
import { monthKeyInEventZone } from '../domain/time';
import { feeReport } from '../reports/service';
import { formatMoney } from '../exports/csv';

/**
 * Extrato mensal da taxa por ingresso (Anexo II, rotina mensal até o dia 5; Cl. 6.3; D-93). **Só gera o relatório.** Não emite
 * boleto, não cobra, não envia nada a ninguém e não suspende nada: boleto, cobrança e suspensão não fazem parte do escopo
 * automatizado e dependem de decisão humana (docs/operacao/README.md).
 */

/** Mês anterior ao instante informado (AAAA-MM), no fuso do evento. Usado como padrão da rotina do dia 5. */
export function previousMonth(now: Date): string {
  const [y, m] = monthKeyInEventZone(now).split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export async function feeStatement(db: Db, month: string) {
  const report = await feeReport({ db }, month, 1, 1);
  return {
    month: report.month,
    criterion: report.criterion,
    notice: report.notice,
    periods: report.periods,
    units: report.units,
    feeCents: report.feeCents,
    pixUnits: report.pixUnits,
    cardUnits: report.cardUnits,
    otherUnits: report.otherUnits,
    cardUnitsInFee: report.cardUnitsInFee,
    orders: report.originOrders,
    byEvent: report.byEvent,
    byCurrentStatus: report.byCurrentStatus,
    reconciliation: report.reconciliation,
    exceptions: report.exceptions,
    revenue: report.revenue,
  };
}

export type FeeStatement = Awaited<ReturnType<typeof feeStatement>>;

const brl = (cents: number) => `R$ ${formatMoney(cents)}`;

/** Texto do extrato, pronto para conferir e anexar ao boleto que a pessoa responsável emitir. */
export function renderFeeStatement(s: FeeStatement, opts: { generatedAt: Date; monthlyFeeCents?: number }): string {
  const [y, m] = s.month.split('-');
  const lines = [
    `# Extrato da taxa por ingresso: ${m}/${y}`,
    '',
    `Gerado em ${opts.generatedAt.toISOString()}. **Relatório de conferência; não é boleto nem cobrança.**`,
    '',
    `**Critério (Cl. 6.3):** ${s.criterion}`,
    '',
    '**Regra do repasse:**',
    '',
    ...s.notice.map(line => `- ${line}`),
    '',
    '| Item | Valor |',
    '|---|---|',
    `| Ingressos pagos por Pix | ${s.pixUnits} |`,
    `| Ingressos pagos por cartão | ${s.cardUnits} (${s.cardUnitsInFee === 0 ? 'só para informação, sem valor' : `${s.cardUnitsInFee} entram pela regra do período`}) |`,
    ...(s.otherUnits > 0 ? [`| Ingressos com outra forma ou sem forma informada | ${s.otherUnits} |`] : []),
    `| Ingressos no repasse | ${s.units} |`,
    `| Pedidos de origem | ${s.orders} |`,
    `| **Total a repassar** | **${brl(s.feeCents)}** |`,
  ];
  if (opts.monthlyFeeCents !== undefined) {
    lines.push(
      `| Mensalidade (informada na execução; confira no contrato) | ${brl(opts.monthlyFeeCents)} |`,
      `| **Mensalidade + taxa** | **${brl(opts.monthlyFeeCents + s.feeCents)}** |`,
    );
  } else {
    lines.push('| Mensalidade | não informada: some o valor do contrato na emissão do boleto |');
  }
  lines.push(
    '',
    '## Por período',
    '',
    '| Período | Valor por ingresso | Pix | Cartão | No repasse | Valor |',
    '|---|---|---|---|---|---|',
  );
  for (const p of s.periods)
    lines.push(`| ${p.label} | ${brl(p.perTicketCents)} | ${p.pixUnits} | ${p.cardUnits} | ${p.units} | ${brl(p.feeCents)} |`);
  lines.push('', '## Por evento', '', '| Evento | Pix | Cartão | No repasse | Valor |', '|---|---|---|---|---|');
  for (const e of s.byEvent) lines.push(`| ${e.eventName} | ${e.pixUnits} | ${e.cardUnits} | ${e.units} | ${brl(e.feeCents)} |`);
  if (s.byEvent.length === 0) lines.push('| (nenhum) | 0 | 0 | 0 | R$ 0,00 |');
  lines.push('', '## Situação atual dos ingressos no repasse (todas contam)', '', '| Situação | Ingressos |', '|---|---|');
  for (const r of s.byCurrentStatus) lines.push(`| ${r.label} | ${r.units} |`);
  if (s.byCurrentStatus.length === 0) lines.push('| (nenhuma) | 0 |');
  lines.push(
    '',
    '## Conciliação',
    '',
    `Unidades previstas nos itens dos pedidos: ${s.reconciliation.expectedUnits}. Ingressos emitidos: ${s.reconciliation.issuedUnits}. ` +
      (s.reconciliation.ok ? '**Confere.**' : '**NÃO CONFERE: investigar antes de cobrar.**'),
  );
  for (const a of s.reconciliation.anomalies)
    lines.push(`- Pedido ${a.number} (${a.status}) sem ingressos, previstas ${a.expectedUnits} unidades.`);
  lines.push(
    '',
    '## Exceções para análise (não entram na contagem)',
    '',
    s.exceptions.paidWithoutStock.length === 0
      ? 'Nenhum pagamento aprovado sem estoque.'
      : [
          '| Pedido | Unidades | Valor pago | Referência no gateway | Situação |',
          '|---|---|---|---|---|',
          ...s.exceptions.paidWithoutStock.map(
            o =>
              `| ${o.number} | ${o.units} unidade(s) pagas sem estoque | ${brl(o.totalCents)} | ${o.gatewayRef ?? 'não informada'} | ${o.treated ? 'tratado' : 'em aberto'} |`,
          ),
          `| **Total** | ${s.exceptions.totals.units} | ${brl(s.exceptions.totals.cents)} | | ${s.exceptions.totals.open} em aberto |`,
        ].join('\n'),
    '',
    s.exceptions.note,
    '',
    '## Receita dos pedidos (separada da taxa)',
    '',
    `Bruta ${brl(s.revenue.grossCents)}; estornada ${brl(s.revenue.refundedCents)}; contestada ${brl(s.revenue.contestedCents)}; líquida ${brl(s.revenue.netCents)}. Taxas do gateway não entram (D-04).`,
    '',
    'Divergência na taxa deve ser contestada por escrito até o vencimento (Cl. 6.5). Esta ferramenta não envia o extrato a ninguém.',
  );
  return lines.join('\n') + '\n';
}
