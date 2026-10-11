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
