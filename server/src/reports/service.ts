import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import { AppError } from '../domain/errors';
import { EVENT_TIMEZONE } from '../domain/time';
import { checkFilter } from '../panel/service';
import { treatedSql } from '../payments/exceptions';

/**
 * Relatórios (RF-58, RF-59, RF-60, CA-19, CA-28 a CA-30). Somente leitura; exportações são do Prompt 18.
 *
 * Bases, todas pela data **original** da aprovação (`paid_at`) no fuso do evento:
 * - **Vendas e promoters:** pedidos com status `pago`.
 * - **Taxa mensal (Cl. 6.3):** ingressos **emitidos** cujo pedido teve `paid_at` no mês, **qualquer que seja a situação atual**
 *   do ingresso ou do pedido. Cancelado, reembolsado, estornado e contestado continuam contando, R$ 1,00 cada.
 * Valor sempre em centavos inteiros. Taxas do gateway não entram (D-04).
 */
export const FEE_PER_TICKET_CENTS = 100; // Cláusula 6ª do contrato: R$ 1,00 por ingresso

const TZ = EVENT_TIMEZONE;
const num = (v: unknown): number => Number(v ?? 0);
const iso = (v: unknown): string => new Date(v as string).toISOString();

export interface ReportDeps {
  db: Db;
}

interface Period {
  from?: string;
  to?: string;
}

/** Condição de período sobre `o.paid_at`, no fuso do evento, com as duas pontas incluídas. */
function paidIn(p: Period): SQL[] {
  const out: SQL[] = [sql`o.paid_at is not null`];
  if (p.from) out.push(sql`(o.paid_at at time zone ${TZ})::date >= ${p.from}::date`);
  if (p.to) out.push(sql`(o.paid_at at time zone ${TZ})::date <= ${p.to}::date`);
  return out;
}
const all = (conds: SQL[]): SQL => sql.join(conds, sql` and `);
/**
 * Valor de uma linha do pedido: a soma por lote quando a compra se dividiu entre lotes (0013), porque o preço unitário do item é então a
 * média arredondada; senão, quantidade vezes preço. Mantém a conciliação com os pedidos (CA-28) centavo a centavo.
 */
const ITEM_CENTS = sql`coalesce((select sum(il.quantity * il.unit_price_cents) from order_item_lots il where il.order_item_id = i.id), i.quantity * i.unit_price_cents)`;

// ---------- vendas por evento e por tipo (RF-58, CA-28) ----------

export interface SalesFilter extends Period {
  eventId?: string;
  typeId?: string;
}

export async function salesReport(deps: ReportDeps, f: SalesFilter) {
  checkFilter(f);
  const base: SQL[] = [...paidIn(f)];
  if (f.eventId) base.push(sql`o.event_id = ${f.eventId}`);
  const itemConds: SQL[] = [...base, sql`o.status = 'pago'`];
  if (f.typeId) itemConds.push(sql`i.ticket_type_id = ${f.typeId}`);

  const rows = await deps.db.execute<Record<string, unknown>>(sql`
    select e.id as event_id, e.name as event_name, e.starts_at, ty.id as type_id, ty.name as type_name,
           sum(i.quantity)::int as qty, sum(${ITEM_CENTS})::bigint as cents
      from orders o
      join order_items i on i.order_id = o.id
      join ticket_types ty on ty.id = i.ticket_type_id
      join events e on e.id = o.event_id
     where ${all(itemConds)}
     group by e.id, e.name, e.starts_at, ty.id, ty.name
     order by e.starts_at, e.name, ty.name`);

  // Vendas por lote dentro de cada tipo (0013): quantidade e valor de cada lote, na ordem dos lotes.
  const lotConds: SQL[] = [...base, sql`o.status = 'pago'`];
  if (f.typeId) lotConds.push(sql`il.ticket_type_id = ${f.typeId}`);
  const lotRows = await deps.db.execute<Record<string, unknown>>(sql`
    select il.ticket_type_id as type_id, l.id as lot_id, l.name as lot_name, l.position,
           sum(il.quantity)::int as qty, sum(il.quantity * il.unit_price_cents)::bigint as cents
      from orders o
      join order_item_lots il on il.order_id = o.id
      join ticket_lots l on l.id = il.lot_id
     where ${all(lotConds)}
     group by il.ticket_type_id, l.id, l.name, l.position
     order by l.position`);
  const lotsOf = (typeId: string) =>
    lotRows.rows
      .filter(r => r.type_id === typeId)
      .map(r => ({ lotId: r.lot_id as string, lotName: r.lot_name as string, tickets: num(r.qty), cents: num(r.cents) }));
  const lines = rows.rows.map(r => ({
    eventId: r.event_id as string,
    eventName: r.event_name as string,
    typeId: r.type_id as string,
    typeName: r.type_name as string,
    tickets: num(r.qty),
    cents: num(r.cents),
    lots: lotsOf(r.type_id as string),
  }));
  const byEvent = new Map<string, { eventId: string; eventName: string; tickets: number; cents: number }>();
  for (const l of lines) {
    const e = byEvent.get(l.eventId) ?? { eventId: l.eventId, eventName: l.eventName, tickets: 0, cents: 0 };
    e.tickets += l.tickets;
    e.cents += l.cents;
    byEvent.set(l.eventId, e);
  }
  const totals = { tickets: lines.reduce((t, l) => t + l.tickets, 0), cents: lines.reduce((t, l) => t + l.cents, 0) };

  // Conciliação (CA-28): o total das linhas precisa bater com a soma dos pedidos pagos. Só faz sentido sem filtro de tipo,
  // porque um pedido pode ter vários tipos.
  const orderSum = await deps.db.execute<{ n: number; cents: string }>(sql`
    select count(*)::int as n, coalesce(sum(o.total_cents), 0)::bigint as cents from orders o where ${all([...base, sql`o.status = 'pago'`])}`);
  const ordersCents = num(orderSum.rows[0]?.cents);
  const reconciliation = f.typeId
    ? { ok: null as boolean | null, ordersCents, itemsCents: totals.cents, orders: num(orderSum.rows[0]?.n) }
    : { ok: ordersCents === totals.cents, ordersCents, itemsCents: totals.cents, orders: num(orderSum.rows[0]?.n) };

  // Devoluções e exceções, separadas das vendas: nada disso entra no total acima.
  const other = await deps.db.execute<{ status: string; orders: number; tickets: number; cents: string }>(sql`
    select o.status::text as status, count(*)::int as orders,
           coalesce(sum((select sum(i.quantity) from order_items i where i.order_id = o.id)), 0)::int as tickets,
           coalesce(sum(o.total_cents), 0)::bigint as cents
      from orders o
     where ${all([...base, sql`o.status in ('estornado', 'contestado', 'pago_sem_estoque')`])}
     group by o.status`);
  const bucket = (s: string) => {
    const r = other.rows.find(x => x.status === s);
    return { orders: num(r?.orders), tickets: num(r?.tickets), cents: num(r?.cents) };
  };
  const refunded = bucket('estornado');
  const contested = bucket('contestado');

  const daily = await deps.db.execute<{ day: string; qty: number; cents: string }>(sql`
    select to_char(o.paid_at at time zone ${TZ}, 'YYYY-MM-DD') as day, sum(i.quantity)::int as qty,
           sum(${ITEM_CENTS})::bigint as cents
      from orders o join order_items i on i.order_id = o.id
     where ${all(itemConds)}
     group by 1 order by 1 limit 400`);

  return {
    criterion: 'Pedidos com status Pago, pela data original da aprovação do pagamento, no fuso do evento.',
    period: { from: f.from ?? null, to: f.to ?? null },
    lines,
    byEvent: [...byEvent.values()],
    totals,
    reconciliation,
    daily: daily.rows.map(d => ({ day: d.day, tickets: num(d.qty), cents: num(d.cents) })),
    reversals: {
      refunded,
      contested,
      // Receita líquida = vendas pagas (já sem estornados e contestados). Bruta = líquida + devolvidos/contestados.
      grossCents: totals.cents + refunded.cents + contested.cents,
      netCents: totals.cents,
    },
    exceptions: { paidWithoutStock: bucket('pago_sem_estoque') },
    notes: ['Não inclui taxas do gateway (D-04) nem comissão de promoter.'],
  };
}

// ---------- promoters (RF-59, CA-19, CA-30) ----------

export type RankMetric = 'qtd' | 'valor';

export async function promoterRanking(deps: ReportDeps, f: Period & { eventId?: string; metric: RankMetric }) {
  checkFilter(f);
  const on: SQL[] = [sql`o.promoter_id = p.id`, sql`o.status = 'pago'`, ...paidIn(f)];
  if (f.eventId) on.push(sql`o.event_id = ${f.eventId}`);
  const rows = await deps.db.execute<Record<string, unknown>>(sql`
    select p.id, p.name, p.coupon_code, p.is_active,
           coalesce(sum(i.quantity), 0)::int as qty,
           coalesce(sum(${ITEM_CENTS}), 0)::bigint as cents,
           count(distinct o.id)::int as orders
      from promoters p
      left join orders o on ${all(on)}
      left join order_items i on i.order_id = o.id
     group by p.id`);
  const list = rows.rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    code: r.coupon_code as string,
    isActive: r.is_active as boolean,
    tickets: num(r.qty),
    cents: num(r.cents),
    orders: num(r.orders),
  }));
  const primary = (r: (typeof list)[number]) => (f.metric === 'qtd' ? r.tickets : r.cents);
  const secondary = (r: (typeof list)[number]) => (f.metric === 'qtd' ? r.cents : r.tickets);
  // Do maior para o menor; empate: o outro critério; depois nome (só para a ordem de leitura, a posição é a mesma).
  list.sort(
    (a, b) =>
      primary(b) - primary(a) ||
      secondary(b) - secondary(a) ||
      a.name.localeCompare(b.name, 'pt-BR') ||
      a.id.localeCompare(b.id),
  );
  const ranked = list.map(r => ({
    position:
      1 +
      list.filter(o => primary(o) > primary(r) || (primary(o) === primary(r) && secondary(o) > secondary(r))).length,
    ...r,
  }));

  const none = await deps.db.execute<{ qty: number; cents: string; orders: number }>(sql`
    select coalesce(sum(i.quantity), 0)::int as qty, coalesce(sum(${ITEM_CENTS}), 0)::bigint as cents, count(distinct o.id)::int as orders
      from orders o join order_items i on i.order_id = o.id
     where ${all([sql`o.status = 'pago'`, sql`o.promoter_id is null`, ...paidIn(f), ...(f.eventId ? [sql`o.event_id = ${f.eventId}`] : [])])}`);
  return {
    metric: f.metric,
    criterion:
      'Pedidos com status Pago e código de promoter, pela data original da aprovação. Só contagem: o sistema não calcula nem paga comissão.',
    ranking: ranked,
    withoutPromoter: {
      tickets: num(none.rows[0]?.qty),
      cents: num(none.rows[0]?.cents),
      orders: num(none.rows[0]?.orders),
    },
  };
}

/** Pedidos atribuídos a um promoter (detalhe do ranking). */
export async function promoterOrders(deps: ReportDeps, promoterId: string, f: Period & { eventId?: string }) {
  checkFilter(f);
  const [p] = (
    await deps.db.execute<{ id: string; name: string; coupon_code: string; is_active: boolean }>(
      sql`select id, name, coupon_code, is_active from promoters where id = ${promoterId}`,
    )
  ).rows;
  if (!p) throw new AppError(404, 'nao_encontrado', 'Promoter não encontrado.');
  const conds: SQL[] = [
    sql`o.promoter_id = ${promoterId}`,
    sql`o.status = 'pago'`,
    ...paidIn(f),
    ...(f.eventId ? [sql`o.event_id = ${f.eventId}`] : []),
  ];
  const rows = await deps.db.execute<Record<string, unknown>>(sql`
    select o.id, o.number, o.total_cents, o.paid_at, e.name as event_name,
           (select sum(i.quantity) from order_items i where i.order_id = o.id)::int as qty
      from orders o join events e on e.id = o.event_id
     where ${all(conds)}
     order by o.paid_at desc, o.number desc limit 500`);
  return {
    promoter: { id: p.id, name: p.name, code: p.coupon_code, isActive: p.is_active },
    orders: rows.rows.map(r => ({
      id: r.id as string,
      number: num(r.number),
      eventName: r.event_name as string,
      tickets: num(r.qty),
      cents: num(r.total_cents),
      paidAt: iso(r.paid_at),
    })),
    totals: {
      tickets: rows.rows.reduce((t, r) => t + num(r.qty), 0),
      cents: rows.rows.reduce((t, r) => t + num(r.total_cents), 0),
    },
  };
}

// ---------- taxa mensal (RF-60, CA-29) ----------

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Situação atual do ingresso, no texto do relatório. Todas contam na taxa. */
const CURRENT = sql`case
    when o.status = 'estornado' then 'Cancelado (estorno)'
    when o.status = 'contestado' then 'Cancelado (contestação)'
    when t.status = 'cancelado' then 'Cancelado (administrador)'
    when t.status = 'utilizado' then 'Utilizado'
    else 'Válido' end`;

export async function feeReport(deps: ReportDeps, month: string, page: number, pageSize: number) {
  if (!MONTH.test(month))
    throw new AppError(422, 'dados_invalidos', 'Mês inválido.', [{ campo: 'month', mensagem: 'Use AAAA-MM.' }]);
  const inMonth = sql`o.paid_at is not null and to_char(o.paid_at at time zone ${TZ}, 'YYYY-MM') = ${month}`;

  // Cada ingresso emitido conta uma vez, pelo identificador da unidade, qualquer que seja a situação atual.
  const total = await deps.db.execute<{ units: number; orders: number }>(sql`
    select count(t.id)::int as units, count(distinct o.id)::int as orders
      from tickets t join orders o on o.id = t.order_id where ${inMonth}`);
  const units = num(total.rows[0]?.units);

  const byStatus = await deps.db.execute<{ label: string; units: number }>(sql`
    select ${CURRENT} as label, count(*)::int as units
      from tickets t join orders o on o.id = t.order_id where ${inMonth} group by 1 order by 2 desc, 1`);
  const byEvent = await deps.db.execute<{ id: string; name: string; units: number }>(sql`
    select e.id, e.name, count(t.id)::int as units
      from tickets t join orders o on o.id = t.order_id join events e on e.id = t.event_id
     where ${inMonth} group by e.id, e.name order by e.name`);

  // Conciliação: quantas unidades os itens dos pedidos pagos no mês previam, contra quantos ingressos existem.
  // Pedido pago sem estoque nunca gera ingresso e é exceção para análise, não venda.
  const recon = await deps.db.execute<{ expected: number; orders: number }>(sql`
    select coalesce(sum((select sum(i.quantity) from order_items i where i.order_id = o.id)), 0)::int as expected, count(*)::int as orders
      from orders o where ${inMonth} and o.status in ('pago', 'estornado', 'contestado', 'cancelado')`);
  const expected = num(recon.rows[0]?.expected);
  const noTickets = await deps.db.execute<{ id: string; number: number; status: string; qty: number }>(sql`
    select o.id, o.number, o.status::text as status, (select sum(i.quantity) from order_items i where i.order_id = o.id)::int as qty
      from orders o
     where ${inMonth} and not exists (select 1 from tickets t where t.order_id = o.id)
     order by o.number`);
  const anomalies = noTickets.rows.filter(o => o.status !== 'pago_sem_estoque');
  // Exceções para análise (D-54 pendente): pagamentos aprovados no mês sem ingresso disponível. Ficam FORA da fórmula da taxa, que
  // continua contando só ingressos emitidos; aparecem à parte, com valor, referência no gateway e se o caso já foi tratado.
  const withoutStock = await deps.db.execute<{
    id: string;
    number: number;
    total_cents: number;
    paid_at: Date;
    gateway_payment_id: string | null;
    qty: number;
    treated: boolean;
  }>(sql`
    select o.id, o.number, o.total_cents, o.paid_at, o.gateway_payment_id,
           (select sum(i.quantity) from order_items i where i.order_id = o.id)::int as qty,
           ${treatedSql(sql`o.id`)} as treated
      from orders o
     where ${inMonth} and o.status = 'pago_sem_estoque'
     order by o.paid_at, o.number`);
  const exceptionRows = withoutStock.rows.map(o => ({
    orderId: o.id,
    number: num(o.number),
    units: num(o.qty),
    totalCents: num(o.total_cents),
    paidAt: iso(o.paid_at),
    gatewayRef: o.gateway_payment_id,
    treated: Boolean(o.treated),
  }));

  const revenue = await deps.db.execute<{ status: string; cents: string }>(sql`
    select o.status::text as status, coalesce(sum(o.total_cents), 0)::bigint as cents
      from orders o where ${inMonth} and o.status in ('pago', 'estornado', 'contestado') group by o.status`);
  const rev = (s: string) => num(revenue.rows.find(r => r.status === s)?.cents);

  const detail = await deps.db.execute<Record<string, unknown>>(sql`
    select t.id, t.short_code, o.id as order_id, o.number, e.name as event_name, o.paid_at, ${CURRENT} as current_status,
           count(*) over()::int as total_rows
      from tickets t join orders o on o.id = t.order_id join events e on e.id = t.event_id
     where ${inMonth}
     order by o.paid_at, o.number, t.short_code
     limit ${pageSize} offset ${(page - 1) * pageSize}`);

  const fee = units * FEE_PER_TICKET_CENTS;
  return {
    month,
    criterion:
      'Ingressos vendidos no mês = ingressos emitidos de pedidos aprovados cuja data original de aprovação (paid_at) está no mês, no fuso do evento, independentemente da situação atual do ingresso ou do pedido. Cancelados, reembolsados e estornados continuam contando (Cl. 6.3).',
    feePerTicketCents: FEE_PER_TICKET_CENTS,
    units,
    feeCents: fee,
    originOrders: num(total.rows[0]?.orders),
    byCurrentStatus: byStatus.rows.map(r => ({ label: r.label, units: num(r.units) })),
    byEvent: byEvent.rows.map(r => ({
      eventId: r.id,
      eventName: r.name,
      units: num(r.units),
      feeCents: num(r.units) * FEE_PER_TICKET_CENTS,
    })),
    reconciliation: {
      expectedUnits: expected,
      issuedUnits: units,
      ok: expected === units && anomalies.length === 0,
      // Pedido aprovado no mês sem nenhum ingresso e que NÃO é "pago sem estoque": algo a investigar antes de cobrar.
      anomalies: anomalies.map(o => ({
        orderId: o.id,
        number: num(o.number),
        status: o.status,
        expectedUnits: num(o.qty),
      })),
    },
    exceptions: {
      title: 'Exceções para análise',
      paidWithoutStock: exceptionRows,
      totals: {
        orders: exceptionRows.length,
        units: exceptionRows.reduce((t, o) => t + o.units, 0),
        cents: exceptionRows.reduce((t, o) => t + o.totalCents, 0),
        open: exceptionRows.filter(o => !o.treated).length,
      },
      note: 'Pagamento aprovado sem estoque não gera ingresso e não entra na contagem: é exceção para análise (o cliente estorna no gateway), não venda. O tratamento desses casos na taxa depende da decisão D-54; a fórmula acima não muda.',
    },
    // Receita separada da taxa: a taxa é devida sobre unidades emitidas; a receita líquida exclui o que foi estornado ou contestado.
    revenue: {
      grossCents: rev('pago') + rev('estornado') + rev('contestado'),
      refundedCents: rev('estornado'),
      contestedCents: rev('contestado'),
      netCents: rev('pago'),
    },
    page,
    pageSize,
    total: detail.rows[0] ? num(detail.rows[0].total_rows) : 0,
    units_detail: detail.rows.map(r => ({
      ticketId: r.id as string,
      shortCode: r.short_code as string,
      orderId: r.order_id as string,
      orderNumber: num(r.number),
      eventName: r.event_name as string,
      paidAt: iso(r.paid_at),
      current: r.current_status as string,
    })),
  };
}
