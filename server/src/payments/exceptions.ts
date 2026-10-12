import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import { writeAudit } from '../db/audit';
import { auditLog, events, orders, users } from '../db/schema';
import { maskCpf } from '../domain/cpf';
import { AppError } from '../domain/errors';
import type { Clock } from '../providers/clock';

/**
 * Pagamentos aprovados sem ingresso disponível (`pago_sem_estoque`, seção 10.1). Procedimento **provisório e reversível** enquanto a
 * decisão D-13 estiver pendente:
 *
 * - o caso aparece no painel até um administrador marcá-lo como **tratado**, com motivo obrigatório;
 * - "tratado" é só uma linha na trilha de auditoria (`pagamento.sem_estoque_tratado`): o pedido **não muda de estado**, nada é
 *   estornado, nenhum estoque é mexido e nada no relatório da taxa muda (D-54);
 * - o estorno é feito pela PartyX no painel do gateway. A plataforma não estorna.
 */
export const TREATED_ACTION = 'pagamento.sem_estoque_tratado';

/** O caso já tem marcação de tratado. Usado nas consultas do painel e do relatório. */
export const treatedSql = (orderId: SQL | string) =>
  sql`exists (select 1 from audit_log a where a.action = ${TREATED_ACTION} and a.entity = 'order' and a.entity_id = ${orderId})`;

export interface PaidWithoutStockCase {
  orderId: string;
  number: number;
  totalCents: number;
  paidAt: string | null;
  paymentMethod: 'pix' | 'cartao' | null;
  event: string;
  buyerName: string;
  buyerEmail: string;
  /** Sempre mascarado. */
  buyerCpf: string | null;
  /** Identificador do pagamento no gateway, para o estorno. */
  gatewayRef: string | null;
  treated: { at: string; reason: string; by: string | null } | null;
}

/** Casos de pagamento sem estoque, dos não tratados para os tratados, mais recentes primeiro. */
export async function listPaidWithoutStock(db: Db): Promise<PaidWithoutStockCase[]> {
  const rows = await db
    .select({
      orderId: orders.id,
      number: orders.number,
      totalCents: orders.totalCents,
      paidAt: orders.paidAt,
      paymentMethod: orders.paymentMethod,
      gatewayRef: orders.gatewayPaymentId,
      event: events.name,
      buyerName: users.name,
      buyerEmail: users.email,
      buyerCpf: users.cpf,
    })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.status, 'pago_sem_estoque'))
    .orderBy(desc(orders.paidAt), desc(orders.number));
  const marks = rows.length
    ? await db.execute<{ entity_id: string; created_at: Date; reason: string | null; actor: string | null }>(sql`
        select distinct on (a.entity_id) a.entity_id, a.created_at, a.reason, u.name as actor
          from audit_log a left join users u on u.id = a.actor_id
         where a.action = ${TREATED_ACTION} and a.entity = 'order'
           and a.entity_id in (${sql.join(
             rows.map(r => sql`${r.orderId}`),
             sql`, `,
           )})
         order by a.entity_id, a.created_at`)
    : { rows: [] };
  const byOrder = new Map(marks.rows.map(m => [m.entity_id, m]));
  const cases = rows.map(r => {
    const mark = byOrder.get(r.orderId);
    return {
      ...r,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      buyerCpf: r.buyerCpf ? maskCpf(r.buyerCpf) : null,
      treated: mark
        ? { at: new Date(mark.created_at).toISOString(), reason: mark.reason ?? '', by: mark.actor }
        : null,
    };
  });
  return [...cases.filter(c => !c.treated), ...cases.filter(c => c.treated)];
}

/** Quantos casos ainda não foram marcados como tratados (contador do alerta). */
export async function countUntreated(db: Db): Promise<{ open: number; treated: number }> {
  const res = await db.execute<{ open: number; treated: number }>(sql`
    select count(*) filter (where not ${treatedSql(sql`o.id`)})::int as open,
           count(*) filter (where ${treatedSql(sql`o.id`)})::int as treated
      from orders o where o.status = 'pago_sem_estoque'`);
  return { open: Number(res.rows[0]?.open ?? 0), treated: Number(res.rows[0]?.treated ?? 0) };
}

/**
 * Marca um caso como tratado. Motivo obrigatório (de 5 a 500 caracteres), gravado na trilha com o administrador. Só para pedido em
 * `pago_sem_estoque` e uma vez por pedido (a segunda tentativa responde 409). Não muda o pedido nem estorna nada.
 */
export async function markTreated(
  deps: { db: Db; clock: Clock },
  actor: { id: string },
  orderId: string,
  rawReason: string,
) {
  const reason = rawReason.trim().replace(/\s+/g, ' ');
  if (reason.length < 5 || reason.length > 500)
    throw new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', [
      { campo: 'reason', mensagem: 'Informe o motivo (de 5 a 500 caracteres).' },
    ]);
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    // A trava do pedido serializa dois administradores marcando o mesmo caso ao mesmo tempo.
    const [order] = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
      .for('update');
    if (!order) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');
    if (order.status !== 'pago_sem_estoque')
      throw new AppError(409, 'fora_da_excecao', 'Este pedido não é um pagamento aprovado sem estoque.');
    const [already] = await tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.action, TREATED_ACTION), eq(auditLog.entity, 'order'), eq(auditLog.entityId, orderId)))
      .limit(1);
    if (already) throw new AppError(409, 'ja_tratado', 'Este caso já foi marcado como tratado.');
    await writeAudit(tx, {
      actorId: actor.id,
      action: TREATED_ACTION,
      entity: 'order',
      entityId: orderId,
      before: { status: order.status, tratado: false },
      after: { status: order.status, tratado: true },
      reason,
      at: now,
    });
    return { orderId, treated: { at: now.toISOString(), reason } };
  });
}

/**
 * Cobrança em dobro (D-83): uma segunda cobrança no gateway com a referência de um pedido que já tem a sua. Nada é emitido por ela; a
 * reconciliação grava `pagamento.cobranca_duplicada` (uma vez por cobrança) e alerta. O caso aparece em Exceções até um administrador
 * marcá-lo como tratado, com motivo, depois de a PartyX estornar no gateway. Como no pago sem estoque, "tratado" é só uma linha na
 * trilha (`pagamento.cobranca_duplicada_tratada`, com a cobrança em `after_json`): não estorna, não muda o pedido nem a taxa.
 */
export const DUPLICATE_ACTION = 'pagamento.cobranca_duplicada';
export const DUPLICATE_TREATED_ACTION = 'pagamento.cobranca_duplicada_tratada';

export interface DuplicateChargeCase {
  orderId: string;
  number: number;
  /** Valor do pedido (a cobrança em dobro normalmente tem o mesmo valor; conferir no gateway). */
  totalCents: number;
  event: string;
  buyerName: string;
  buyerEmail: string;
  /** Sempre mascarado. */
  buyerCpf: string | null;
  /** Cobrança que vale para o pedido. */
  gatewayRef: string | null;
  /** Cobrança em dobro, a estornar no gateway. */
  duplicateRef: string;
  /** Situação da cobrança em dobro quando foi detectada (aprovado, pendente, estornado, contestado). */
  duplicateStatus: string | null;
  detectedAt: string;
  treated: { at: string; reason: string; by: string | null } | null;
}

/** Cobranças em dobro, das não tratadas para as tratadas, mais recentes primeiro. */
export async function listDuplicateCharges(db: Db): Promise<DuplicateChargeCase[]> {
  const res = await db.execute<{
    order_id: string;
    number: number;
    total_cents: number;
    event: string;
    buyer_name: string;
    buyer_email: string;
    buyer_cpf: string | null;
    gateway_ref: string | null;
    duplicate_ref: string;
    duplicate_status: string | null;
    detected_at: Date;
    treated_at: Date | null;
    treated_reason: string | null;
    treated_by: string | null;
  }>(sql`
    select o.id as order_id, o.number, o.total_cents, e.name as event, u.name as buyer_name, u.email as buyer_email,
           u.cpf as buyer_cpf, o.gateway_payment_id as gateway_ref, a.after_json->>'outraCobranca' as duplicate_ref,
           a.after_json->>'gatewayStatus' as duplicate_status, a.created_at as detected_at,
           t.created_at as treated_at, t.reason as treated_reason, t.actor as treated_by
      from audit_log a
      join orders o on o.id = a.entity_id
      join events e on e.id = o.event_id
      join users u on u.id = o.user_id
      left join lateral (
        select x.created_at, x.reason, tu.name as actor
          from audit_log x left join users tu on tu.id = x.actor_id
         where x.action = ${DUPLICATE_TREATED_ACTION} and x.entity = 'order' and x.entity_id = a.entity_id
           and x.after_json->>'cobranca' = a.after_json->>'outraCobranca'
         order by x.created_at limit 1
      ) t on true
     where a.action = ${DUPLICATE_ACTION} and a.entity = 'order' and a.after_json->>'outraCobranca' is not null
     order by a.created_at desc
     limit 200`);
  const cases = res.rows.map(r => ({
    orderId: r.order_id,
    number: Number(r.number),
    totalCents: Number(r.total_cents),
    event: r.event,
    buyerName: r.buyer_name,
    buyerEmail: r.buyer_email,
    buyerCpf: r.buyer_cpf ? maskCpf(r.buyer_cpf) : null,
    gatewayRef: r.gateway_ref,
    duplicateRef: r.duplicate_ref,
    duplicateStatus: r.duplicate_status,
    detectedAt: new Date(r.detected_at).toISOString(),
    treated: r.treated_at
      ? { at: new Date(r.treated_at).toISOString(), reason: r.treated_reason ?? '', by: r.treated_by }
      : null,
  }));
  return [...cases.filter(c => !c.treated), ...cases.filter(c => c.treated)];
}

/**
 * Marca uma cobrança em dobro como tratada. Mesmas regras do pago sem estoque: motivo de 5 a 500 caracteres, uma vez por cobrança
 * (a segunda tentativa responde 409), só para cobrança que a reconciliação registrou. Não estorna nem muda o pedido.
 */
export async function markDuplicateTreated(
  deps: { db: Db; clock: Clock },
  actor: { id: string },
  orderId: string,
  chargeId: string,
  rawReason: string,
) {
  const reason = rawReason.trim().replace(/\s+/g, ' ');
  if (reason.length < 5 || reason.length > 500)
    throw new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', [
      { campo: 'reason', mensagem: 'Informe o motivo (de 5 a 500 caracteres).' },
    ]);
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    // A trava do pedido serializa dois administradores marcando a mesma cobrança ao mesmo tempo.
    const [order] = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
      .for('update');
    if (!order) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');
    const known = await tx.execute(sql`
      select 1 from audit_log where action = ${DUPLICATE_ACTION} and entity = 'order' and entity_id = ${orderId}
         and after_json->>'outraCobranca' = ${chargeId} limit 1`);
    if (known.rows.length === 0)
      throw new AppError(409, 'fora_da_excecao', 'Esta cobrança não está registrada como cobrança em dobro deste pedido.');
    const already = await tx.execute(sql`
      select 1 from audit_log where action = ${DUPLICATE_TREATED_ACTION} and entity = 'order' and entity_id = ${orderId}
         and after_json->>'cobranca' = ${chargeId} limit 1`);
    if (already.rows.length > 0) throw new AppError(409, 'ja_tratado', 'Este caso já foi marcado como tratado.');
    await writeAudit(tx, {
      actorId: actor.id,
      action: DUPLICATE_TREATED_ACTION,
      entity: 'order',
      entityId: orderId,
      before: { cobranca: chargeId, tratado: false },
      after: { cobranca: chargeId, tratado: true },
      reason,
      at: now,
    });
    return { orderId, chargeId, treated: { at: now.toISOString(), reason } };
  });
}
