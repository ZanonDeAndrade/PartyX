import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { writeAudit } from '../db/audit';
import { maskCpf, onlyDigits } from '../domain/cpf';
import { transferHistory } from '../tickets/transfer';
import { AppError } from '../domain/errors';
import { foldName } from '../gate/service';
import type { Clock } from '../providers/clock';

/**
 * Compradores (ADM12, ADM13) e ingresso (ADM15) no painel. Só leitura, exceto a visualização do CPF completo, que fica na trilha.
 * CPF sempre mascarado nas respostas; o código secreto e o QR do ingresso nunca saem daqui.
 */
export interface PeopleDeps {
  db: Db;
  clock: Clock;
}

const num = (v: unknown): number => Number(v ?? 0);
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);
const FOLD = sql`'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'`;
const notFound = (what: string) => new AppError(404, 'nao_encontrado', `${what} não encontrado.`);

/**
 * Compradores de todos os eventos (contas de cliente), com busca por nome (sem acento, 3+ letras), e-mail (com @) ou CPF completo
 * (11 dígitos, comparação exata). Paginado.
 */
export async function listBuyers(deps: PeopleDeps, f: { q?: string; page: number; pageSize: number }) {
  const q = f.q?.trim() ?? '';
  let filter = sql``;
  if (q) {
    const digits = onlyDigits(q);
    if (/^[\d.\-\s]+$/.test(q) && digits.length === 11) filter = sql`and u.cpf = ${digits}`;
    else if (q.includes('@'))
      filter = sql`and lower(u.email) like ${'%' + q.toLowerCase().replace(/[%_\\]/g, '') + '%'}`;
    else if (q.length >= 3)
      filter = sql`and translate(lower(u.name), ${FOLD}) like ${'%' + foldName(q).replace(/[%_\\]/g, '') + '%'}`;
    else
      throw new AppError(422, 'dados_invalidos', 'A busca é curta demais.', [
        { campo: 'q', mensagem: 'Use pelo menos 3 letras, um e-mail ou o CPF completo.' },
      ]);
  }
  const rows = await deps.db.execute<Record<string, unknown>>(sql`
    select u.id, u.name, u.email, u.cpf, u.phone, u.is_active, u.anonymized_at,
           (select count(*) from orders o where o.user_id = u.id)::int as orders,
           (select count(*) from tickets t join orders o on o.id = t.order_id where o.user_id = u.id and t.status <> 'cancelado')::int as tickets,
           (select max(o.created_at) from orders o where o.user_id = u.id) as last_order_at,
           count(*) over()::int as total_rows
      from users u
     where u.role = 'cliente' ${filter}
     order by u.name, u.id
     limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`);
  return {
    page: f.page,
    pageSize: f.pageSize,
    total: rows.rows[0] ? num(rows.rows[0].total_rows) : 0,
    buyers: rows.rows.map(r => ({
      id: r.id as string,
      name: r.name as string,
      email: r.email as string,
      cpf: r.cpf ? maskCpf(r.cpf as string) : null,
      phone: (r.phone as string | null) ?? null,
      isActive: Boolean(r.is_active),
      anonymized: Boolean(r.anonymized_at),
      orders: num(r.orders),
      tickets: num(r.tickets),
      lastOrderAt: iso(r.last_order_at),
    })),
  };
}

/** Detalhe do comprador (ADM13): dados, pedidos, ingressos e o histórico de correções de e-mail e CPF (sem os valores). */
export async function buyerDetail(deps: PeopleDeps, id: string) {
  const [u] = (
    await deps.db.execute<Record<string, unknown>>(sql`
      select id, name, email, cpf, phone, is_active, created_at, last_login_at, anonymized_at
        from users where id = ${id} and role = 'cliente'`)
  ).rows;
  if (!u) throw notFound('Comprador');
  const orders = await deps.db.execute<Record<string, unknown>>(sql`
    select o.id, o.number, o.status::text as status, o.total_cents, o.created_at, o.paid_at, o.payment_method::text as payment_method,
           e.id as event_id, e.name as event_name,
           (select coalesce(sum(i.quantity), 0) from order_items i where i.order_id = o.id)::int as units
      from orders o join events e on e.id = o.event_id
     where o.user_id = ${id}
     order by o.created_at desc, o.number desc
     limit 200`);
  const tickets = await deps.db.execute<Record<string, unknown>>(sql`
    select t.id, t.short_code, t.status::text as status, t.used_at, t.cancelled_at, ty.name as type_name,
           e.name as event_name, o.number as order_number
      from tickets t
      join orders o on o.id = t.order_id
      join ticket_types ty on ty.id = t.ticket_type_id
      join events e on e.id = t.event_id
     where o.user_id = ${id}
     order by e.starts_at desc, t.short_code
     limit 500`);
  const corrections = await deps.db.execute<Record<string, unknown>>(sql`
    select a.created_at, a.reason, a.before_json, a.after_json, v.name as actor
      from audit_log a left join users v on v.id = a.actor_id
     where a.action = 'usuario.identidade' and a.entity_id = ${id}
     order by a.created_at desc limit 50`);
  return {
    buyer: {
      id: u.id as string,
      name: u.name as string,
      email: u.email as string,
      cpf: u.cpf ? maskCpf(u.cpf as string) : null,
      phone: (u.phone as string | null) ?? null,
      isActive: Boolean(u.is_active),
      anonymized: Boolean(u.anonymized_at),
      createdAt: iso(u.created_at)!,
      lastLoginAt: iso(u.last_login_at),
    },
    orders: orders.rows.map(o => ({
      id: o.id as string,
      number: num(o.number),
      status: o.status as string,
      totalCents: num(o.total_cents),
      units: num(o.units),
      paymentMethod: (o.payment_method as string | null) ?? null,
      createdAt: iso(o.created_at)!,
      paidAt: iso(o.paid_at),
      event: { id: o.event_id as string, name: o.event_name as string },
    })),
    tickets: tickets.rows.map(t => ({
      id: t.id as string,
      shortCode: t.short_code as string,
      status: t.status as string,
      typeName: t.type_name as string,
      eventName: t.event_name as string,
      orderNumber: num(t.order_number),
      usedAt: iso(t.used_at),
      cancelledAt: iso(t.cancelled_at),
    })),
    // Só quais campos mudaram, quem e por quê: os valores antigos não voltam para a tela.
    corrections: corrections.rows.map(c => {
      const before = (c.before_json ?? {}) as Record<string, unknown>;
      const after = (c.after_json ?? {}) as Record<string, unknown>;
      return {
        at: iso(c.created_at)!,
        actor: (c.actor as string | null) ?? null,
        reason: (c.reason as string | null) ?? '',
        fields: (['email', 'cpf'] as const).filter(k => before[k] !== after[k]),
      };
    }),
  };
}

/**
 * CPF completo do comprador, sob demanda (ADM13: mascarado por padrão). Cada visualização fica na trilha (`usuario.cpf_visualizado`),
 * sem o número. Só para conta de cliente.
 */
export async function revealBuyerCpf(deps: PeopleDeps, actor: { id: string }, id: string) {
  const [u] = (
    await deps.db.execute<{ cpf: string | null }>(sql`select cpf from users where id = ${id} and role = 'cliente'`)
  ).rows;
  if (!u) throw notFound('Comprador');
  if (!u.cpf) throw new AppError(404, 'nao_encontrado', 'Este comprador não tem CPF registrado.');
  await deps.db.transaction(tx =>
    writeAudit(tx, {
      actorId: actor.id,
      action: 'usuario.cpf_visualizado',
      entity: 'user',
      entityId: id,
      before: null,
      after: null,
      reason: 'CPF completo exibido no painel.',
      at: deps.clock.now(),
    }),
  );
  return { cpf: u.cpf };
}

/**
 * Detalhe do ingresso (ADM15): situação, tipo, evento, pedido, comprador (CPF mascarado), entrada (quando e quem validou), cancelamento
 * (quando, motivo e quem cancelou, pela trilha) e as últimas tentativas na portaria. Sem código secreto nem QR.
 */
export async function ticketDetail(deps: PeopleDeps, id: string) {
  const [t] = (
    await deps.db.execute<Record<string, unknown>>(sql`
      select t.id, t.short_code, t.status::text as status, t.holder_name, t.issued_at, t.used_at, t.cancelled_at, t.cancel_reason,
             ty.name as type_name, ty.price_cents, e.id as event_id, e.name as event_name, e.starts_at,
             o.id as order_id, o.number as order_number, o.status::text as order_status, o.paid_at,
             u.id as buyer_id, u.name as buyer_name, u.email as buyer_email, u.cpf as buyer_cpf,
             h.id as holder_id, h.name as holder_account_name, h.email as holder_email, h.cpf as holder_cpf,
             v.name as validator_name
        from tickets t
        join ticket_types ty on ty.id = t.ticket_type_id
        join events e on e.id = t.event_id
        join orders o on o.id = t.order_id
        join users u on u.id = o.user_id
        join users h on h.id = t.holder_user_id
        left join users v on v.id = t.validated_by
       where t.id = ${id}`)
  ).rows;
  if (!t) throw notFound('Ingresso');
  const [cancel] = (
    await deps.db.execute<Record<string, unknown>>(sql`
      select a.created_at, a.reason, v.name as actor
        from audit_log a left join users v on v.id = a.actor_id
       where a.entity = 'ticket' and a.entity_id = ${id} and a.action = 'ingresso.cancelar'
       order by a.created_at desc limit 1`)
  ).rows;
  const attempts = await deps.db.execute<Record<string, unknown>>(sql`
    select c.created_at, c.result::text as result, c.method::text as method, v.name as validator
      from checkins c join users v on v.id = c.validator_id
     where c.ticket_id = ${id}
     order by c.created_at desc, c.id desc limit 20`);
  return {
    ticket: {
      id: t.id as string,
      shortCode: t.short_code as string,
      status: t.status as string,
      holderName: t.holder_name as string,
      typeName: t.type_name as string,
      priceCents: num(t.price_cents),
      issuedAt: iso(t.issued_at)!,
      event: { id: t.event_id as string, name: t.event_name as string, startsAt: iso(t.starts_at)! },
      order: {
        id: t.order_id as string,
        number: num(t.order_number),
        status: t.order_status as string,
        paidAt: iso(t.paid_at),
      },
      buyer: {
        id: t.buyer_id as string,
        name: t.buyer_name as string,
        email: t.buyer_email as string,
        cpf: t.buyer_cpf ? maskCpf(t.buyer_cpf as string) : null,
      },
      // Conta do titular atual (D-87): a mesma do comprador até a primeira transferência.
      holder: {
        id: t.holder_id as string,
        name: t.holder_account_name as string,
        email: t.holder_email as string,
        cpf: t.holder_cpf ? maskCpf(t.holder_cpf as string) : null,
      },
      entry: t.used_at ? { at: iso(t.used_at)!, validator: (t.validator_name as string | null) ?? null } : null,
      cancellation: t.cancelled_at
        ? {
            at: iso(t.cancelled_at)!,
            reason: (t.cancel_reason as string | null) ?? null,
            // Estorno e chargeback cancelam pelo sistema (sem autor); cancelamento pelo painel tem o administrador na trilha.
            by: (cancel?.actor as string | null) ?? null,
          }
        : null,
    },
    attempts: attempts.rows.map(a => ({
      at: iso(a.created_at)!,
      result: a.result as string,
      method: a.method as string,
      validator: a.validator as string,
    })),
    // Transferências (D-87), da mais nova para a mais antiga, com o desfazer do administrador.
    transfers: await transferHistory(deps.db, id),
  };
}
