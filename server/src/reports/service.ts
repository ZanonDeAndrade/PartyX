import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import { countsInFee, periodLabel, periodNotice, type ContractFeePeriod } from '../domain/contractFee';
import { AppError } from '../domain/errors';
import { EVENT_TIMEZONE } from '../domain/time';
import { checkFilter } from '../panel/service';
import { treatedSql } from '../payments/exceptions';

/**
 * Relatórios (RF-58, RF-59, RF-60, CA-19, CA-28 a CA-30). Somente leitura; exportações são do Prompt 18.
 *
 * Bases, todas pela data **original** da aprovação (`paid_at`) no fuso do evento:
 * - **Vendas e promoters:** pedidos com status `pago`.
 * - **Taxa mensal (Cl. 6.3; D-93):** ingressos **emitidos** cujo pedido teve `paid_at` no mês, **qualquer que seja a situação atual**
 *   do ingresso ou do pedido. Cancelado, reembolsado, estornado e contestado continuam contando. O valor por ingresso e as formas de
 *   pagamento que entram são os da regra de `contract_fee_rules` vigente no `paid_at` (desde 21/10/2026, R$ 1,00 só de pedido por Pix).
 * Valor sempre em centavos inteiros. Taxas do gateway não entram (D-04).
 */

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
/** Taxa de serviço da linha (D-90): soma das taxas por ingresso, guardada no item. Zero nos pedidos anteriores à taxa. */
const ITEM_FEE_CENTS = sql`i.service_fee_cents`;
/** Desconto do promoter na linha (D-91): soma dos descontos por ingresso, guardada no item. Zero sem desconto. */
const ITEM_DISCOUNT_CENTS = sql`i.discount_cents`;

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
           sum(i.quantity)::int as qty, sum(${ITEM_CENTS})::bigint as cents, sum(${ITEM_FEE_CENTS})::bigint as fee_cents,
           sum(${ITEM_DISCOUNT_CENTS})::bigint as discount_cents
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
           sum(il.quantity)::int as qty, sum(il.quantity * il.unit_price_cents)::bigint as cents,
           sum(il.quantity * il.unit_service_fee_cents)::bigint as fee_cents,
           sum(il.quantity * il.unit_discount_cents)::bigint as discount_cents
      from orders o
      join order_item_lots il on il.order_id = o.id
      join ticket_lots l on l.id = il.lot_id
     where ${all(lotConds)}
     group by il.ticket_type_id, l.id, l.name, l.position
     order by l.position`);
  const lotsOf = (typeId: string) =>
    lotRows.rows
      .filter(r => r.type_id === typeId)
      .map(r => ({
        lotId: r.lot_id as string,
        lotName: r.lot_name as string,
        tickets: num(r.qty),
        cents: num(r.cents),
        discountCents: num(r.discount_cents),
        netCents: num(r.cents) - num(r.discount_cents),
        serviceFeeCents: num(r.fee_cents),
      }));
  const lines = rows.rows.map(r => ({
    eventId: r.event_id as string,
    eventName: r.event_name as string,
    typeId: r.type_id as string,
    typeName: r.type_name as string,
    tickets: num(r.qty),
    /** Valor dos ingressos pelo preço dos lotes, sem desconto. */
    cents: num(r.cents),
    /** Desconto concedido pelos códigos de promoter (D-91). */
    discountCents: num(r.discount_cents),
    /** Valor líquido dos ingressos: preço menos desconto, sem a taxa de serviço. */
    netCents: num(r.cents) - num(r.discount_cents),
    serviceFeeCents: num(r.fee_cents),
    lots: lotsOf(r.type_id as string),
  }));

  // Tarifa e líquido do Mercado Pago por evento (D-90): são do pagamento, então ficam por pedido, não por tipo. Só pedidos pagos; os
  // ainda sem a tarifa (a rotina diária consulta) entram em `ordersWithoutGatewayFee`.
  const gatewayRows = await deps.db.execute<Record<string, unknown>>(sql`
    select o.event_id, coalesce(sum(o.gateway_fee_cents), 0)::bigint as fee, coalesce(sum(o.gateway_net_cents), 0)::bigint as net,
           count(*) filter (where o.gateway_fee_cents is null)::int as missing
      from orders o
     where ${all([...base, sql`o.status = 'pago'`])}
     group by o.event_id`);
  const gatewayOf = (eventId: string) => {
    const r = gatewayRows.rows.find(x => x.event_id === eventId);
    return { gatewayFeeCents: num(r?.fee), gatewayNetCents: num(r?.net), ordersWithoutGatewayFee: num(r?.missing) };
  };
  const byEvent = new Map<
    string,
    {
      eventId: string;
      eventName: string;
      tickets: number;
      cents: number;
      discountCents: number;
      netCents: number;
      serviceFeeCents: number;
      chargedCents: number;
      gatewayFeeCents: number;
      gatewayNetCents: number;
      ordersWithoutGatewayFee: number;
    }
  >();
  for (const l of lines) {
    const e = byEvent.get(l.eventId) ?? {
      eventId: l.eventId,
      eventName: l.eventName,
      tickets: 0,
      cents: 0,
      discountCents: 0,
      netCents: 0,
      serviceFeeCents: 0,
      chargedCents: 0,
      ...gatewayOf(l.eventId),
    };
    e.tickets += l.tickets;
    e.cents += l.cents;
    e.discountCents += l.discountCents;
    e.netCents = e.cents - e.discountCents;
    e.serviceFeeCents += l.serviceFeeCents;
    e.chargedCents = e.netCents + e.serviceFeeCents;
    byEvent.set(l.eventId, e);
  }
  const ticketsCents = lines.reduce((t, l) => t + l.cents, 0);
  const serviceFeeCents = lines.reduce((t, l) => t + l.serviceFeeCents, 0);
  const discountCents = lines.reduce((t, l) => t + l.discountCents, 0);
  const totals = {
    tickets: lines.reduce((t, l) => t + l.tickets, 0),
    /** Valor dos ingressos pelo preço dos lotes, sem desconto e sem a taxa de serviço. */
    cents: ticketsCents,
    /** Desconto concedido pelos códigos de promoter (D-91). */
    discountCents,
    /** Valor líquido dos ingressos: preço menos desconto. */
    netCents: ticketsCents - discountCents,
    serviceFeeCents,
    /** Ingressos menos desconto mais taxa de serviço: o que os compradores pagaram. */
    chargedCents: ticketsCents - discountCents + serviceFeeCents,
    // Com filtro de tipo, a tarifa (que é do pedido inteiro) não se divide por tipo: nula.
    ...(f.typeId
      ? { gatewayFeeCents: null as number | null, gatewayNetCents: null as number | null, ordersWithoutGatewayFee: null as number | null }
      : {
          gatewayFeeCents: gatewayRows.rows.reduce((t, r) => t + num(r.fee), 0) as number | null,
          gatewayNetCents: gatewayRows.rows.reduce((t, r) => t + num(r.net), 0) as number | null,
          ordersWithoutGatewayFee: gatewayRows.rows.reduce((t, r) => t + num(r.missing), 0) as number | null,
        }),
  };

  // Conciliação (CA-28): ingressos menos desconto (D-91) mais taxa de serviço (D-90) das linhas precisam bater com a soma dos pedidos
  // pagos. Só faz sentido
  // sem filtro de tipo, porque um pedido pode ter vários tipos.
  const orderSum = await deps.db.execute<{ n: number; cents: string }>(sql`
    select count(*)::int as n, coalesce(sum(o.total_cents), 0)::bigint as cents from orders o where ${all([...base, sql`o.status = 'pago'`])}`);
  const ordersCents = num(orderSum.rows[0]?.cents);
  const reconciliation = {
    ok: f.typeId ? (null as boolean | null) : ordersCents === totals.chargedCents,
    ordersCents,
    itemsCents: totals.cents,
    discountCents: totals.discountCents,
    serviceFeeCents: totals.serviceFeeCents,
    orders: num(orderSum.rows[0]?.n),
  };

  // Devoluções e exceções, separadas das vendas: nada disso entra no total acima.
  const other = await deps.db.execute<{ status: string; orders: number; tickets: number; cents: string; fee_cents: string }>(sql`
    select o.status::text as status, count(*)::int as orders,
           coalesce(sum((select sum(i.quantity) from order_items i where i.order_id = o.id)), 0)::int as tickets,
           coalesce(sum(o.total_cents), 0)::bigint as cents, coalesce(sum(o.service_fee_cents), 0)::bigint as fee_cents
      from orders o
     where ${all([...base, sql`o.status in ('estornado', 'contestado', 'pago_sem_estoque')`])}
     group by o.status`);
  const bucket = (s: string) => {
    const r = other.rows.find(x => x.status === s);
    // `cents` é o total pago (com a taxa de serviço): é o que volta num estorno total.
    return { orders: num(r?.orders), tickets: num(r?.tickets), cents: num(r?.cents), serviceFeeCents: num(r?.fee_cents) };
  };
  const refunded = bucket('estornado');
  const contested = bucket('contestado');

  const daily = await deps.db.execute<{ day: string; qty: number; cents: string; fee_cents: string; discount_cents: string }>(sql`
    select to_char(o.paid_at at time zone ${TZ}, 'YYYY-MM-DD') as day, sum(i.quantity)::int as qty,
           sum(${ITEM_CENTS})::bigint as cents, sum(${ITEM_FEE_CENTS})::bigint as fee_cents,
           sum(${ITEM_DISCOUNT_CENTS})::bigint as discount_cents
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
    daily: daily.rows.map(d => ({
      day: d.day,
      tickets: num(d.qty),
      cents: num(d.cents),
      discountCents: num(d.discount_cents),
      serviceFeeCents: num(d.fee_cents),
    })),
    reversals: {
      refunded,
      contested,
      // Receita líquida = o que os compradores pagaram nos pedidos pagos (ingressos e taxa de serviço, já sem estornados e
      // contestados). Bruta = líquida + devolvidos/contestados (o total deles, com a taxa).
      grossCents: totals.chargedCents + refunded.cents + contested.cents,
      netCents: totals.chargedCents,
    },
    exceptions: { paidWithoutStock: bucket('pago_sem_estoque') },
    notes: [
      'Valor dos ingressos pelo preço dos lotes; o desconto dos códigos de promoter, o valor líquido, a taxa de serviço e a tarifa do Mercado Pago têm colunas próprias.',
      'Tarifa do Mercado Pago: lida do Mercado Pago pela rotina diária, por pedido pago; pedido ainda sem tarifa aparece como não informado.',
      'Não inclui comissão de promoter.',
    ],
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
           coalesce(sum(${ITEM_DISCOUNT_CENTS}), 0)::bigint as discount_cents,
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
    /** Valor dos ingressos pelo preço dos lotes. */
    cents: num(r.cents),
    /** Desconto concedido pelo código do promoter (D-91). */
    discountCents: num(r.discount_cents),
    /** Valor líquido: preço menos desconto (é por ele que o ranking "por valor" ordena). */
    netCents: num(r.cents) - num(r.discount_cents),
    orders: num(r.orders),
  }));
  const primary = (r: (typeof list)[number]) => (f.metric === 'qtd' ? r.tickets : r.netCents);
  const secondary = (r: (typeof list)[number]) => (f.metric === 'qtd' ? r.netCents : r.tickets);
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
      'Pedidos com status Pago e código de promoter, pela data original da aprovação. Valor líquido = preço dos ingressos menos o desconto do código. O sistema não calcula nem paga comissão.',
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
    select o.id, o.number, o.total_cents - o.service_fee_cents + o.discount_cents as tickets_cents, o.discount_cents, o.paid_at,
           e.name as event_name,
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
      // Valor atribuído ao promoter: o dos ingressos, sem a taxa de serviço (D-90); desconto (D-91) e líquido ao lado, como no ranking.
      cents: num(r.tickets_cents),
      discountCents: num(r.discount_cents),
      netCents: num(r.tickets_cents) - num(r.discount_cents),
      paidAt: iso(r.paid_at),
    })),
    totals: {
      tickets: rows.rows.reduce((t, r) => t + num(r.qty), 0),
      cents: rows.rows.reduce((t, r) => t + num(r.tickets_cents), 0),
      discountCents: rows.rows.reduce((t, r) => t + num(r.discount_cents), 0),
      netCents: rows.rows.reduce((t, r) => t + num(r.tickets_cents) - num(r.discount_cents), 0),
    },
  };
}

// ---------- taxa mensal (RF-60, CA-29; D-93) ----------

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const CRITERION =
  'Ingressos vendidos no mês = ingressos emitidos de pedidos aprovados cuja data original de aprovação (paid_at) está no mês, no fuso do evento, independentemente da situação atual do ingresso ou do pedido. Cancelados, reembolsados e estornados continuam contando (Cl. 6.3). O valor por ingresso e as formas de pagamento que entram no repasse são os da regra do contrato vigente na data da aprovação (regra de cada período).';

/** Situação atual do ingresso, no texto do relatório. Todas contam na taxa. */
const CURRENT = sql`case
    when u.order_status = 'estornado' then 'Cancelado (estorno)'
    when u.order_status = 'contestado' then 'Cancelado (contestação)'
    when u.ticket_status = 'cancelado' then 'Cancelado (administrador)'
    when u.ticket_status = 'utilizado' then 'Utilizado'
    else 'Válido' end`;

/**
 * Períodos do mês (`p`), um por regra de `contract_fee_rules` vigente nele, de `starts` (incluído) a `ends` (excluído), com a virada do
 * mês no fuso do evento; e os ingressos emitidos de pedidos aprovados no mês (`u`), cada um no período do seu `paid_at`, com a forma de
 * pagamento gravada e se entra no repasse (`counted`).
 */
function feeUnits(month: string): SQL {
  return sql`with bounds as (
      select (${month}::text || '-01')::timestamp at time zone ${TZ} as m_start,
             ((${month}::text || '-01')::date + interval '1 month')::timestamp at time zone ${TZ} as m_end),
    rules as (
      select r.effective_from, lead(r.effective_from) over (order by r.effective_from) as next_from,
             r.per_ticket_cents, r.methods, r.reference
        from contract_fee_rules r),
    p as (
      select (row_number() over (order by r.effective_from))::int as idx,
             greatest(r.effective_from, b.m_start) as starts,
             least(coalesce(r.next_from, 'infinity'::timestamptz), b.m_end) as ends,
             r.per_ticket_cents, r.methods, r.reference
        from rules r cross join bounds b
       where r.effective_from < b.m_end and coalesce(r.next_from, 'infinity'::timestamptz) > b.m_start),
    u as (
      select t.id as ticket_id, t.short_code, t.status::text as ticket_status, t.event_id,
             o.id as order_id, o.number, o.status::text as order_status, o.paid_at, o.payment_method::text as payment_method,
             p.idx, p.per_ticket_cents,
             (p.methods is null or coalesce(o.payment_method = any(p.methods), false)) as counted
        from tickets t
        join orders o on o.id = t.order_id
        join p on o.paid_at >= p.starts and o.paid_at < p.ends)`;
}

type Method = 'pix' | 'cartao';
const method = (v: unknown): Method | null => (v === 'pix' || v === 'cartao' ? v : null);

export async function feeReport(deps: ReportDeps, month: string, page: number, pageSize: number) {
  if (!MONTH.test(month))
    throw new AppError(422, 'dados_invalidos', 'Mês inválido.', [{ campo: 'month', mensagem: 'Use AAAA-MM.' }]);
  const inMonth = sql`o.paid_at is not null and to_char(o.paid_at at time zone ${TZ}, 'YYYY-MM') = ${month}`;
  const units = feeUnits(month);

  // Um período por regra vigente no mês, com os ingressos por forma de pagamento e os que entram no repasse.
  const byPeriod = await deps.db.execute<{
    starts: Date;
    ends: Date;
    per_ticket_cents: number;
    methods: string[] | null;
    reference: string;
    pix: number;
    card: number;
    other: number;
    counted: number;
    m_start: Date;
  }>(sql`${units}
    select (select b.m_start from bounds b) as m_start, p.starts, p.ends, p.per_ticket_cents, p.methods::text[] as methods, p.reference,
           count(u.ticket_id) filter (where u.payment_method = 'pix')::int as pix,
           count(u.ticket_id) filter (where u.payment_method = 'cartao')::int as card,
           count(u.ticket_id) filter (where u.payment_method is null)::int as other,
           count(u.ticket_id) filter (where u.counted)::int as counted
      from p left join u on u.idx = p.idx
     group by p.idx, p.starts, p.ends, p.per_ticket_cents, p.methods, p.reference
     order by p.idx`);
  const periods = byPeriod.rows.map(r => {
    const period: ContractFeePeriod = {
      startsAt: new Date(r.starts),
      endsAt: new Date(r.ends),
      perTicketCents: num(r.per_ticket_cents),
      methods: r.methods === null ? null : r.methods.map(m => method(m)).filter((m): m is Method => m !== null),
      reference: r.reference,
    };
    return {
      startsAt: period.startsAt.toISOString(),
      endsAt: period.endsAt.toISOString(),
      label: periodLabel(period),
      notice: periodNotice(period),
      perTicketCents: period.perTicketCents,
      methods: period.methods,
      reference: period.reference,
      pixUnits: num(r.pix),
      cardUnits: num(r.card),
      otherUnits: num(r.other),
      units: num(r.counted),
      feeCents: num(r.counted) * period.perTicketCents,
      cardInFee: countsInFee(period.methods, 'cartao'),
    };
  });
  // A regra original vale desde 1970 e a tabela só aceita inclusão: um mês sem regra é defeito, não mês sem taxa.
  const monthStart = byPeriod.rows[0] ? new Date(byPeriod.rows[0].m_start).getTime() : Number.NaN;
  if (periods.length === 0 || new Date(periods[0]!.startsAt).getTime() !== monthStart)
    throw new Error(`relatório da taxa: nenhuma regra em contract_fee_rules cobre o início de ${month}`);
  const sum = (f: (p: (typeof periods)[number]) => number) => periods.reduce((t, p) => t + f(p), 0);
  const counted = sum(p => p.units);
  const fee = sum(p => p.feeCents);

  const origin = await deps.db.execute<{ orders: number }>(sql`${units}
    select count(distinct u.order_id)::int as orders from u where u.counted`);

  const byStatus = await deps.db.execute<{ label: string; units: number }>(sql`${units}
    select ${CURRENT} as label, count(*)::int as units from u where u.counted group by 1 order by 2 desc, 1`);
  const byEvent = await deps.db.execute<{
    id: string;
    name: string;
    pix: number;
    card: number;
    other: number;
    counted: number;
    fee: number;
  }>(sql`${units}
    select e.id, e.name,
           count(*) filter (where u.payment_method = 'pix')::int as pix,
           count(*) filter (where u.payment_method = 'cartao')::int as card,
           count(*) filter (where u.payment_method is null)::int as other,
           count(*) filter (where u.counted)::int as counted,
           coalesce(sum(u.per_ticket_cents) filter (where u.counted), 0)::int as fee
      from u join events e on e.id = u.event_id
     group by e.id, e.name order by e.name`);

  // Conciliação: quantas unidades os itens dos pedidos pagos no mês previam, contra quantos ingressos existem (todas as formas).
  // Pedido pago sem estoque nunca gera ingresso e é exceção para análise, não venda.
  const issued = await deps.db.execute<{ units: number }>(sql`
    select count(t.id)::int as units from tickets t join orders o on o.id = t.order_id where ${inMonth}`);
  const issuedUnits = num(issued.rows[0]?.units);
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

  const detail = await deps.db.execute<Record<string, unknown>>(sql`${units}
    select u.ticket_id, u.short_code, u.order_id, u.number, e.name as event_name, u.paid_at, ${CURRENT} as current_status,
           u.payment_method, u.counted, u.per_ticket_cents, count(*) over()::int as total_rows
      from u join events e on e.id = u.event_id
     order by u.paid_at, u.number, u.short_code
     limit ${pageSize} offset ${(page - 1) * pageSize}`);

  return {
    month,
    criterion: CRITERION,
    /** Aviso do topo: uma linha por período, gerada da regra (valor, formas e referência). */
    notice: periods.map(p => p.notice),
    periods,
    /** Ingressos no repasse e total a repassar. */
    units: counted,
    feeCents: fee,
    /** Todos os ingressos emitidos no mês, por forma de pagamento gravada (informação; quem entra é definido pela regra). */
    pixUnits: sum(p => p.pixUnits),
    cardUnits: sum(p => p.cardUnits),
    otherUnits: sum(p => p.otherUnits),
    /** Ingressos pagos por cartão que entram no repasse (só nos períodos cuja regra aceita cartão, como a original). */
    cardUnitsInFee: sum(p => (p.cardInFee ? p.cardUnits : 0)),
    originOrders: num(origin.rows[0]?.orders),
    byCurrentStatus: byStatus.rows.map(r => ({ label: r.label, units: num(r.units) })),
    byEvent: byEvent.rows.map(r => ({
      eventId: r.id,
      eventName: r.name,
      pixUnits: num(r.pix),
      cardUnits: num(r.card),
      otherUnits: num(r.other),
      units: num(r.counted),
      feeCents: num(r.fee),
    })),
    reconciliation: {
      expectedUnits: expected,
      issuedUnits,
      ok: expected === issuedUnits && anomalies.length === 0,
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
      ticketId: r.ticket_id as string,
      shortCode: r.short_code as string,
      orderId: r.order_id as string,
      orderNumber: num(r.number),
      eventName: r.event_name as string,
      paidAt: iso(r.paid_at),
      current: r.current_status as string,
      method: method(r.payment_method),
      inFee: Boolean(r.counted),
      feeCents: r.counted ? num(r.per_ticket_cents) : 0,
    })),
  };
}
