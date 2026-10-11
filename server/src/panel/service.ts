import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { writeAudit } from '../db/audit';
import { auditLog, events, orders, paymentEvents, ticketTypes, tickets, users } from '../db/schema';
import { maskCpf } from '../domain/cpf';
import { AppError } from '../domain/errors';
import { dateKeyInEventZone, EVENT_TIMEZONE } from '../domain/time';
import { foldName } from '../gate/service';
import type { Clock } from '../providers/clock';

/**
 * Painel administrativo (RF-55 a RF-57, RF-61, RF-62). Leitura e cancelamento de ingresso.
 * Datas de "dia" e "mês" são do fuso do evento. CPF aparece sempre mascarado.
 *
 * **Vendas = pedidos pagos, pela data original da aprovação (`paid_at`).** Estornados e contestados aparecem separados:
 * um pedido que foi pago e depois estornado continua tendo `paid_at` (a taxa mensal depende disso, Prompt 17), mas não
 * conta como venda ativa. Receita líquida e a conciliação da taxa são do Prompt 17.
 */
export interface PanelDeps {
  db: Db;
  clock: Clock;
}

const TZ = EVENT_TIMEZONE;

export const PAYMENT_SITUATION: Record<string, string> = {
  pendente: 'Aguardando pagamento',
  pago: 'Pago',
  expirado: 'Expirado',
  nao_concluido: 'Não concluído (recusado)',
  cancelado: 'Cancelado',
  estornado: 'Estornado',
  contestado: 'Contestado (chargeback)',
  pago_sem_estoque: 'Pago sem estoque: o cliente deve estornar no gateway',
};

const num = (v: unknown): number => Number(v ?? 0);

// ---------- visão geral (RF-55) ----------

interface Bucket {
  orders: number;
  tickets: number;
  cents: number;
}
const empty = (): Bucket => ({ orders: 0, tickets: 0, cents: 0 });

type Group = { paid: Bucket; refunded: Bucket; contested: Bucket; withoutStock: Bucket };
const emptyGroup = (): Group => ({ paid: empty(), refunded: empty(), contested: empty(), withoutStock: empty() });
const GROUP_OF: Record<string, keyof Group | undefined> = {
  pago: 'paid',
  estornado: 'refunded',
  contestado: 'contested',
  pago_sem_estoque: 'withoutStock',
};

async function salesBy(db: Db, key: 'day' | 'month', value: string): Promise<Group> {
  const fmt = key === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
  const rows = await db.execute<{ status: string; orders: number; tickets: number; cents: string }>(sql`
    select o.status::text as status, count(*)::int as orders,
           coalesce(sum((select count(*) from tickets t where t.order_id = o.id)), 0)::int as tickets,
           coalesce(sum(o.total_cents), 0)::bigint as cents
      from orders o
     where o.paid_at is not null
       and to_char(o.paid_at at time zone ${TZ}, ${fmt}) = ${value}
     group by o.status`);
  const out = emptyGroup();
  for (const r of rows.rows) {
    const g = GROUP_OF[r.status];
    if (g) out[g] = { orders: num(r.orders), tickets: num(r.tickets), cents: num(r.cents) };
  }
  return out;
}

export async function overview(deps: PanelDeps, monthParam?: string) {
  const now = deps.clock.now();
  const today = dateKeyInEventZone(now);
  const month = monthParam ?? today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new AppError(422, 'dados_invalidos', 'Mês inválido.', [{ campo: 'month', mensagem: 'Use AAAA-MM.' }]);
  }

  const [day, monthSales] = await Promise.all([salesBy(deps.db, 'day', today), salesBy(deps.db, 'month', month)]);

  const daily = await deps.db.execute<{ day: string; orders: number; tickets: number; cents: string }>(sql`
    select to_char(o.paid_at at time zone ${TZ}, 'YYYY-MM-DD') as day, count(*)::int as orders,
           coalesce(sum((select count(*) from tickets t where t.order_id = o.id)), 0)::int as tickets,
           coalesce(sum(o.total_cents), 0)::bigint as cents
      from orders o
     where o.status = 'pago' and o.paid_at is not null
       and to_char(o.paid_at at time zone ${TZ}, 'YYYY-MM') = ${month}
     group by 1 order by 1`);

  // Eventos em andamento (publicados): vendidos, reservados agora e o que resta, tipo a tipo.
  const evRows = await deps.db.execute<{
    event_id: string;
    name: string;
    slug: string;
    starts_at: Date;
    type_id: string;
    type_name: string;
    total: number;
    sold: number;
    reserved: number;
    is_active: boolean;
  }>(sql`
    select e.id as event_id, e.name, e.slug, e.starts_at, t.id as type_id, t.name as type_name, t.quantity_total as total,
           t.quantity_sold as sold, t.is_active,
           coalesce((select sum(r.quantity) from reservations r
                      where r.ticket_type_id = t.id and r.status = 'ativa' and r.expires_at > ${now}), 0)::int as reserved
      from events e join ticket_types t on t.event_id = e.id
     where e.status = 'publicado'
     order by e.starts_at, e.id, t.name`);
  const byEvent = new Map<
    string,
    {
      id: string;
      name: string;
      slug: string;
      startsAt: string;
      types: unknown[];
      totals: { capacity: number; sold: number; reserved: number; remaining: number };
    }
  >();
  for (const r of evRows.rows) {
    const ev = byEvent.get(r.event_id) ?? {
      id: r.event_id,
      name: r.name,
      slug: r.slug,
      startsAt: new Date(r.starts_at).toISOString(),
      types: [],
      totals: { capacity: 0, sold: 0, reserved: 0, remaining: 0 },
    };
    const remaining = Math.max(0, num(r.total) - num(r.sold) - num(r.reserved));
    ev.types.push({
      id: r.type_id,
      name: r.type_name,
      capacity: num(r.total),
      sold: num(r.sold),
      reserved: num(r.reserved),
      remaining,
      isActive: r.is_active,
    });
    ev.totals.capacity += num(r.total);
    ev.totals.sold += num(r.sold);
    ev.totals.reserved += num(r.reserved);
    ev.totals.remaining += remaining;
    byEvent.set(r.event_id, ev);
  }

  const alerts = await deps.db.execute<{ n: number }>(sql`
    select (select count(*) from orders where status = 'pago_sem_estoque')::int as n`);

  return {
    today,
    month,
    day,
    monthSales,
    daily: daily.rows.map(d => ({ day: d.day, orders: num(d.orders), tickets: num(d.tickets), cents: num(d.cents) })),
    events: [...byEvent.values()],
    attention: { paidWithoutStock: num(alerts.rows[0]?.n) },
  };
}

// ---------- pedidos (RF-56) ----------

export interface OrderFilter {
  eventId?: string;
  status?: string;
  /** AAAA-MM-DD, no fuso do evento, inclusive. */
  from?: string;
  to?: string;
  q?: string;
  page: number;
  pageSize: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Data que existe de verdade: 2026-02-31 passa no formato e não pode chegar ao banco. */
const isRealDate = (v: string): boolean => {
  if (!DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
export function checkFilter(f: { from?: string; to?: string }) {
  for (const k of ['from', 'to'] as const) {
    if (f[k] !== undefined && !isRealDate(f[k]!)) {
      throw new AppError(422, 'dados_invalidos', 'Data inválida.', [{ campo: k, mensagem: 'Use AAAA-MM-DD.' }]);
    }
  }
  if (f.from && f.to && f.from > f.to) {
    throw new AppError(422, 'dados_invalidos', 'O período está invertido.', [
      { campo: 'to', mensagem: 'A data final precisa ser igual ou depois da inicial.' },
    ]);
  }
}

export async function listOrders(deps: PanelDeps, f: OrderFilter) {
  checkFilter(f);
  const conds = [sql`true`];
  if (f.eventId) conds.push(sql`o.event_id = ${f.eventId}`);
  if (f.status) conds.push(sql`o.status::text = ${f.status}`);
  if (f.from) conds.push(sql`(o.created_at at time zone ${TZ})::date >= ${f.from}::date`);
  if (f.to) conds.push(sql`(o.created_at at time zone ${TZ})::date <= ${f.to}::date`);
  const q = f.q?.trim();
  if (q) {
    const number = /^(?:px-?)?(\d{4,9})$/i.exec(q);
    if (number) conds.push(sql`o.number = ${Number(number[1])}`);
    else if (q.length >= 3) {
      const like = '%' + foldName(q).replace(/[%_\\]/g, '') + '%';
      conds.push(
        sql`(translate(lower(u.name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn') like ${like} or lower(u.email) like ${like})`,
      );
    } else
      throw new AppError(422, 'dados_invalidos', 'A busca é curta demais.', [
        { campo: 'q', mensagem: 'Use pelo menos 3 caracteres ou o número do pedido.' },
      ]);
  }
  const where = sql.join(conds, sql` and `);
  const offset = (f.page - 1) * f.pageSize;
  const rows = await deps.db.execute<Record<string, unknown>>(sql`
    select o.id, o.number, o.status::text as status, o.payment_method::text as payment_method, o.total_cents, o.created_at, o.paid_at,
           e.id as event_id, e.name as event_name, u.name as buyer_name, u.email as buyer_email, u.cpf as buyer_cpf,
           (select count(*) from tickets t where t.order_id = o.id)::int as tickets,
           (select count(*) from tickets t where t.order_id = o.id and t.status = 'cancelado')::int as cancelled,
           p.coupon_code,
           count(*) over()::int as total_rows
      from orders o
      join events e on e.id = o.event_id
      join users u on u.id = o.user_id
      left join promoters p on p.id = o.promoter_id
     where ${where}
     order by o.number desc
     limit ${f.pageSize} offset ${offset}`);
  const total = rows.rows[0] ? num(rows.rows[0].total_rows) : 0;
  return {
    page: f.page,
    pageSize: f.pageSize,
    total,
    orders: rows.rows.map(r => ({
      id: r.id as string,
      number: num(r.number),
      status: r.status as string,
      situation: PAYMENT_SITUATION[r.status as string] ?? (r.status as string),
      paymentMethod: (r.payment_method as string | null) ?? null,
      totalCents: num(r.total_cents),
      createdAt: new Date(r.created_at as string).toISOString(),
      paidAt: r.paid_at ? new Date(r.paid_at as string).toISOString() : null,
      event: { id: r.event_id as string, name: r.event_name as string },
      buyer: {
        name: r.buyer_name as string,
        email: r.buyer_email as string,
        cpf: r.buyer_cpf ? maskCpf(r.buyer_cpf as string) : null,
      },
      tickets: num(r.tickets),
      cancelledTickets: num(r.cancelled),
      coupon: (r.coupon_code as string | null) ?? null,
    })),
  };
}

export async function orderDetail(deps: PanelDeps, orderId: string) {
  const [order] = await deps.db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      gatewayPaymentId: orders.gatewayPaymentId,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      eventId: events.id,
      eventName: events.name,
      buyerId: users.id,
      buyerName: users.name,
      buyerEmail: users.email,
      buyerPhone: users.phone,
      buyerCpf: users.cpf,
    })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');

  const items = await deps.db.execute<{ name: string; quantity: number; unit_price_cents: number }>(sql`
    select t.name, i.quantity, i.unit_price_cents from order_items i join ticket_types t on t.id = i.ticket_type_id
     where i.order_id = ${orderId} order by t.name`);
  const orderTickets = await deps.db
    .select({
      id: tickets.id,
      shortCode: tickets.shortCode,
      status: tickets.status,
      typeName: ticketTypes.name,
      holderName: tickets.holderName,
      usedAt: tickets.usedAt,
      cancelledAt: tickets.cancelledAt,
      cancelReason: tickets.cancelReason,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(eq(tickets.orderId, orderId))
    .orderBy(ticketTypes.name, tickets.unitIndex);

  const ticketIds = orderTickets.map(t => t.id);
  const trail = await deps.db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      at: auditLog.createdAt,
      reason: auditLog.reason,
      actor: users.name,
      after: auditLog.afterJson,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(
      ticketIds.length
        ? sql`(${auditLog.entity} = 'order' and ${auditLog.entityId} = ${orderId}) or (${auditLog.entity} = 'ticket' and ${inArray(auditLog.entityId, ticketIds)})`
        : sql`${auditLog.entity} = 'order' and ${auditLog.entityId} = ${orderId}`,
    )
    .orderBy(auditLog.createdAt);
  const gateway = await deps.db
    .select({
      type: paymentEvents.type,
      receivedAt: paymentEvents.receivedAt,
      processedAt: paymentEvents.processedAt,
      error: paymentEvents.processingError,
      attempts: paymentEvents.attempts,
    })
    .from(paymentEvents)
    .where(eq(paymentEvents.orderId, orderId))
    .orderBy(paymentEvents.receivedAt);

  return {
    id: order.id,
    number: order.number,
    status: order.status,
    situation: PAYMENT_SITUATION[order.status] ?? order.status,
    paymentMethod: order.paymentMethod,
    gatewayPaymentId: order.gatewayPaymentId,
    totalCents: order.totalCents,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    event: { id: order.eventId, name: order.eventName },
    buyer: {
      id: order.buyerId,
      name: order.buyerName,
      email: order.buyerEmail,
      phone: order.buyerPhone,
      cpf: order.buyerCpf ? maskCpf(order.buyerCpf) : null,
    },
    items: items.rows.map(i => ({
      name: i.name,
      quantity: num(i.quantity),
      unitPriceCents: num(i.unit_price_cents),
      subtotalCents: num(i.quantity) * num(i.unit_price_cents),
    })),
    tickets: orderTickets.map(t => ({
      ...t,
      usedAt: t.usedAt?.toISOString() ?? null,
      cancelledAt: t.cancelledAt?.toISOString() ?? null,
    })),
    trail: trail.map(a => ({
      action: a.action,
      entity: a.entity,
      at: a.at.toISOString(),
      actor: a.actor,
      reason: a.reason,
      after: a.after,
    })),
    gatewayEvents: gateway.map(g => ({
      ...g,
      receivedAt: g.receivedAt.toISOString(),
      processedAt: g.processedAt?.toISOString() ?? null,
    })),
  };
}

// ---------- compradores e ingressos por evento (RF-57) ----------

async function assertEvent(db: Db, eventId: string) {
  const [e] = await db
    .select({ id: events.id, name: events.name, status: events.status })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!e) throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
  return e;
}

export async function eventBuyers(deps: PanelDeps, eventId: string, page: number, pageSize: number, q?: string) {
  const event = await assertEvent(deps.db, eventId);
  const like = q && q.trim().length >= 3 ? '%' + foldName(q.trim()).replace(/[%_\\]/g, '') + '%' : null;
  if (q && q.trim() && !like)
    throw new AppError(422, 'dados_invalidos', 'A busca é curta demais.', [
      { campo: 'q', mensagem: 'Use pelo menos 3 caracteres.' },
    ]);
  const rows = await deps.db.execute<Record<string, unknown>>(sql`
    select u.id, u.name, u.email, u.cpf,
           count(distinct o.id)::int as orders,
           count(t.id) filter (where t.status <> 'cancelado')::int as tickets,
           count(t.id) filter (where t.status = 'cancelado')::int as cancelled,
           count(t.id) filter (where t.status = 'utilizado')::int as entered,
           (select coalesce(sum(o2.total_cents), 0) from orders o2 where o2.user_id = u.id and o2.event_id = ${eventId} and o2.status = 'pago')::bigint as paid_cents,
           count(*) over()::int as total_rows
      from orders o
      join users u on u.id = o.user_id
      left join tickets t on t.order_id = o.id
     where o.event_id = ${eventId}
       and o.status in ('pago', 'estornado', 'contestado', 'pago_sem_estoque')
       ${like ? sql`and (translate(lower(u.name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn') like ${like} or lower(u.email) like ${like})` : sql``}
     group by u.id
     order by u.name, u.id
     limit ${pageSize} offset ${(page - 1) * pageSize}`);
  return {
    event: { id: event.id, name: event.name },
    page,
    pageSize,
    total: rows.rows[0] ? num(rows.rows[0].total_rows) : 0,
    buyers: rows.rows.map(r => ({
      id: r.id as string,
      name: r.name as string,
      email: r.email as string,
      cpf: r.cpf ? maskCpf(r.cpf as string) : null,
      orders: num(r.orders),
      tickets: num(r.tickets),
      cancelled: num(r.cancelled),
      entered: num(r.entered),
      paidCents: num(r.paid_cents),
    })),
  };
}

export async function eventTickets(
  deps: PanelDeps,
  eventId: string,
  f: { status?: string; typeId?: string; q?: string; page: number; pageSize: number },
) {
  const event = await assertEvent(deps.db, eventId);
  const conds = [sql`t.event_id = ${eventId}`];
  if (f.status) conds.push(sql`t.status::text = ${f.status}`);
  if (f.typeId) conds.push(sql`t.ticket_type_id = ${f.typeId}`);
  const q = f.q?.trim();
  if (q) {
    if (/^px-/i.test(q)) conds.push(sql`t.short_code like ${q.toUpperCase().replace(/[%_\\]/g, '') + '%'}`);
    else if (q.length >= 3) {
      const like = '%' + foldName(q).replace(/[%_\\]/g, '') + '%';
      conds.push(
        sql`(translate(lower(t.holder_name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn') like ${like} or lower(u.email) like ${like})`,
      );
    } else
      throw new AppError(422, 'dados_invalidos', 'A busca é curta demais.', [
        { campo: 'q', mensagem: 'Use pelo menos 3 caracteres ou o código PX-.' },
      ]);
  }
  const where = sql.join(conds, sql` and `);
  const rows = await deps.db.execute<Record<string, unknown>>(sql`
    select t.id, t.short_code, t.status::text as status, t.holder_name, t.used_at, t.cancelled_at, t.cancel_reason, t.issued_at,
           ty.name as type_name, o.id as order_id, o.number as order_number, o.status::text as order_status,
           u.email as buyer_email, u.cpf as buyer_cpf, v.name as validator_name,
           count(*) over()::int as total_rows
      from tickets t
      join ticket_types ty on ty.id = t.ticket_type_id
      join orders o on o.id = t.order_id
      join users u on u.id = o.user_id
      left join users v on v.id = t.validated_by
     where ${where}
     order by t.holder_name, t.short_code
     limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`);
  return {
    event: { id: event.id, name: event.name },
    page: f.page,
    pageSize: f.pageSize,
    total: rows.rows[0] ? num(rows.rows[0].total_rows) : 0,
    tickets: rows.rows.map(r => ({
      id: r.id as string,
      shortCode: r.short_code as string,
      status: r.status as string,
      typeName: r.type_name as string,
      holderName: r.holder_name as string,
      buyerEmail: r.buyer_email as string,
      buyerCpf: r.buyer_cpf ? maskCpf(r.buyer_cpf as string) : null,
      orderId: r.order_id as string,
      orderNumber: num(r.order_number),
      orderStatus: r.order_status as string,
      issuedAt: new Date(r.issued_at as string).toISOString(),
      usedAt: r.used_at ? new Date(r.used_at as string).toISOString() : null,
      validatorName: (r.validator_name as string | null) ?? null,
      cancelledAt: r.cancelled_at ? new Date(r.cancelled_at as string).toISOString() : null,
      cancelReason: (r.cancel_reason as string | null) ?? null,
    })),
  };
}

// ---------- entradas em tempo real (RF-61) ----------

export async function liveEntries(deps: PanelDeps, eventId: string) {
  const event = await assertEvent(deps.db, eventId);
  const counters = await deps.db.execute<{ type_name: string; entered: number; total: number }>(sql`
    select ty.name as type_name,
           count(*) filter (where t.status = 'utilizado')::int as entered,
           count(*) filter (where t.status in ('valido', 'utilizado'))::int as total
      from tickets t join ticket_types ty on ty.id = t.ticket_type_id
     where t.event_id = ${eventId} group by ty.name order by ty.name`);
  const recent = await deps.db.execute<Record<string, unknown>>(sql`
    select c.created_at, c.result::text as result, c.method::text as method, t.short_code, ty.name as type_name, t.holder_name, v.name as validator_name
      from checkins c
      join users v on v.id = c.validator_id
      left join tickets t on t.id = c.ticket_id
      left join ticket_types ty on ty.id = t.ticket_type_id
     where c.event_id = ${eventId}
     order by c.created_at desc, c.id desc
     limit 30`);
  const attempts = await deps.db.execute<{ result: string; n: number }>(sql`
    select c.result::text as result, count(*)::int as n from checkins c where c.event_id = ${eventId} group by c.result`);
  const byValidator = await deps.db.execute<{ name: string; entered: number }>(sql`
    select v.name, count(*)::int as entered from checkins c join users v on v.id = c.validator_id
     where c.event_id = ${eventId} and c.result = 'valido' group by v.name order by entered desc, v.name`);
  const entered = counters.rows.reduce((t, r) => t + num(r.entered), 0);
  const total = counters.rows.reduce((t, r) => t + num(r.total), 0);
  return {
    event: { id: event.id, name: event.name, status: event.status },
    counter: { entered, total },
    byType: counters.rows.map(r => ({ typeName: r.type_name, entered: num(r.entered), total: num(r.total) })),
    attempts: Object.fromEntries(attempts.rows.map(r => [r.result, num(r.n)])),
    byValidator: byValidator.rows.map(r => ({ name: r.name, entered: num(r.entered) })),
    recent: recent.rows.map(r => ({
      at: new Date(r.created_at as string).toISOString(),
      result: r.result as string,
      method: r.method as string,
      shortCode: (r.short_code as string | null) ?? null,
      typeName: (r.type_name as string | null) ?? null,
      holderName: (r.holder_name as string | null) ?? null,
      validator: r.validator_name as string,
    })),
    serverTime: deps.clock.now().toISOString(),
  };
}

// ---------- cancelamento de ingresso (RF-62) ----------

export interface CancelInput {
  reason: string;
  confirm: boolean;
}

function checkCancel(input: CancelInput) {
  const reason = input.reason.trim();
  const errors: { campo: string; mensagem: string }[] = [];
  if (input.confirm !== true) errors.push({ campo: 'confirm', mensagem: 'Confirme o cancelamento.' });
  if (reason.length < 5) errors.push({ campo: 'reason', mensagem: 'Informe o motivo (pelo menos 5 caracteres).' });
  if (reason.length > 500) errors.push({ campo: 'reason', mensagem: 'Use no máximo 500 caracteres.' });
  if (errors.length) throw new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', errors);
  return reason;
}

export const CANCEL_GUIDANCE =
  'O ingresso foi cancelado na plataforma e a portaria passa a recusá-lo. A PartyX não devolve dinheiro: se houver reembolso, o cliente faz o estorno no painel do gateway. O pedido, o ingresso e a data do pagamento continuam registrados e o ingresso segue contando na taxa mensal. O estoque não é reposto (decisão D-14 pendente).';

/**
 * Cancela ingressos (RF-62). Só ingresso **válido**: um que já entrou não pode ser cancelado (a entrada aconteceu), e o que já
 * está cancelado não muda nada. A marcação é condicional (`WHERE status = 'valido'`), a mesma da portaria, então um
 * cancelamento e uma leitura ao mesmo tempo nunca dão dois resultados: ou entrou, ou foi cancelado.
 * Nada é apagado: pedido, ingresso, `paid_at` e a evidência da taxa ficam. O estoque não é reposto (D-14 pendente).
 */
export async function cancelTickets(
  deps: PanelDeps,
  actor: { id: string },
  scope: { ticketId: string } | { orderId: string },
  input: CancelInput,
) {
  const reason = checkCancel(input);
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const where = 'ticketId' in scope ? eq(tickets.id, scope.ticketId) : eq(tickets.orderId, scope.orderId);
    const targets = await tx
      .select({ id: tickets.id, status: tickets.status, orderId: tickets.orderId, shortCode: tickets.shortCode })
      .from(tickets)
      .where(where)
      .orderBy(tickets.id)
      .for('update');
    if (targets.length === 0)
      throw new AppError(
        404,
        'nao_encontrado',
        'ingresso' in scope ? 'Ingresso não encontrado.' : 'Pedido sem ingressos.',
      );

    const cancelled: string[] = [];
    const alreadyCancelled: string[] = [];
    const used: string[] = [];
    for (const t of targets) {
      if (t.status === 'cancelado') alreadyCancelled.push(t.id);
      else if (t.status === 'utilizado') used.push(t.id);
      else {
        const done = await tx
          .update(tickets)
          .set({ status: 'cancelado', cancelledAt: now, cancelReason: reason })
          .where(and(eq(tickets.id, t.id), eq(tickets.status, 'valido')))
          .returning({ id: tickets.id });
        if (done.length) {
          cancelled.push(t.id);
          await writeAudit(tx, {
            actorId: actor.id,
            action: 'ingresso.cancelar',
            entity: 'ticket',
            entityId: t.id,
            before: { status: 'valido' },
            after: { status: 'cancelado', orderId: t.orderId, shortCode: t.shortCode },
            reason,
            at: now,
          });
        }
      }
    }
    // Pedido inteiro pedido, mas há ingresso já usado: nada é cancelado pela metade sem o administrador saber.
    if ('ticketId' in scope && used.length) {
      throw new AppError(409, 'ingresso_utilizado', 'Este ingresso já foi usado na entrada e não pode ser cancelado.');
    }
    return {
      cancelled: cancelled.length,
      alreadyCancelled: alreadyCancelled.length,
      used: used.length,
      guidance: CANCEL_GUIDANCE,
    };
  });
}
