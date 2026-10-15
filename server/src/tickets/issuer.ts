import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import type { Tx } from '../db/audit';
import { orderItemLots, orderItems, orders, ticketLots, tickets, users } from '../db/schema';
import { newShortCode, newTicketCode, signQr, type QrKeys } from '../domain/ticketCode';
import { logger } from '../logger';
import type { TicketIssuer } from '../payments/reconcile';

export interface QrConfig {
  keys: QrKeys;
  currentVersion: number;
}

/** Tentativas de gerar códigos novos se um deles colidir com outro (probabilidade desprezível, mas tratada). */
const COLLISION_RETRIES = 5;

type OrderToIssue = {
  id: string;
  userId: string;
  eventId: string;
  items: { orderItemId: string; ticketTypeId: string; quantity: number }[];
};

/**
 * Emite **um ingresso por unidade** (RF-38) dentro da transação em andamento, com QR distinto por unidade (CA-20).
 *
 * Idempotente: `(order_item_id, unit_index)` é único e o `INSERT` ignora o que já existe, então reprocessar a confirmação,
 * rodar de novo uma rotina ou emitir pela segunda vez nunca duplica. Na emissão, o titular é o comprador, em todas as unidades;
 * depois ele pode transferir cada ingresso (D-87, `transfer.ts`). O CPF **não** entra no ingresso (D-07): só com decisão expressa do
 * cliente.
 */
export async function issueForOrder(tx: Tx, qr: QrConfig, order: OrderToIssue): Promise<number> {
  const [buyer] = await tx.select({ name: users.name }).from(users).where(eq(users.id, order.userId)).limit(1);
  if (!buyer) throw new Error('comprador do pedido não encontrado');
  const existing = await tx
    .select({ orderItemId: tickets.orderItemId, unitIndex: tickets.unitIndex })
    .from(tickets)
    .where(eq(tickets.orderId, order.id));
  const have = new Set(existing.map(t => `${t.orderItemId}:${t.unitIndex}`));
  // Lote de cada unidade (0013): as unidades do item seguem a ordem dos lotes (as primeiras do lote mais antigo). Item sem a divisão
  // por lote (pedido de uma versão anterior) fica sem lote no ingresso.
  const parts = await tx
    .select({ orderItemId: orderItemLots.orderItemId, lotId: orderItemLots.lotId, quantity: orderItemLots.quantity })
    .from(orderItemLots)
    .innerJoin(ticketLots, eq(ticketLots.id, orderItemLots.lotId))
    .where(eq(orderItemLots.orderId, order.id))
    .orderBy(asc(ticketLots.position));
  const lotOfUnit = (orderItemId: string, unit: number): string | null => {
    let upTo = 0;
    for (const p of parts) {
      if (p.orderItemId !== orderItemId) continue;
      upTo += p.quantity;
      if (unit <= upTo) return p.lotId;
    }
    return null;
  };

  let missing = order.items.flatMap(item =>
    Array.from({ length: item.quantity }, (_, i) => ({ item, unit: i + 1 })).filter(
      u => !have.has(`${item.orderItemId}:${u.unit}`),
    ),
  );
  let created = 0;
  for (let attempt = 0; attempt <= COLLISION_RETRIES && missing.length > 0; attempt++) {
    const rows = missing.map(({ item, unit }) => {
      const code = newTicketCode();
      return {
        orderItemId: item.orderItemId,
        orderId: order.id,
        ticketTypeId: item.ticketTypeId,
        eventId: order.eventId,
        unitIndex: unit,
        lotId: lotOfUnit(item.orderItemId, unit),
        holderName: buyer.name,
        holderUserId: order.userId,
        code,
        shortCode: newShortCode(),
        qrPayload: signQr(qr.keys, qr.currentVersion, order.eventId, code),
        qrKeyVersion: qr.currentVersion,
      };
    });
    // Sem alvo no ON CONFLICT: ignora tanto a unidade que já existe (idempotência) quanto uma colisão rara de código.
    const inserted = await tx
      .insert(tickets)
      .values(rows)
      .onConflictDoNothing()
      .returning({ orderItemId: tickets.orderItemId, unitIndex: tickets.unitIndex });
    created += inserted.length;
    const done = new Set(inserted.map(t => `${t.orderItemId}:${t.unitIndex}`));
    missing = missing.filter(m => !done.has(`${m.item.orderItemId}:${m.unit}`));
    if (missing.length > 0) {
      // Faltou algo: ou outra transação emitiu essa unidade agora, ou houve colisão de código. Confere antes de tentar de novo.
      const now = await tx
        .select({ orderItemId: tickets.orderItemId, unitIndex: tickets.unitIndex })
        .from(tickets)
        .where(
          and(
            eq(tickets.orderId, order.id),
            inArray(tickets.orderItemId, [...new Set(missing.map(m => m.item.orderItemId))]),
          ),
        );
      const present = new Set(now.map(t => `${t.orderItemId}:${t.unitIndex}`));
      missing = missing.filter(m => !present.has(`${m.item.orderItemId}:${m.unit}`));
    }
  }
  if (missing.length > 0) throw new Error('não foi possível gerar códigos únicos para todos os ingressos');
  return created;
}

/** Emissor usado na confirmação do pagamento. */
export function createTicketIssuer(qr: QrConfig): TicketIssuer {
  return async (tx, order) => {
    await issueForOrder(tx, qr, order);
  };
}

/**
 * Emite os ingressos que faltam em pedidos já pagos (por exemplo, pagos antes de o emissor existir). Idempotente e seguro
 * em paralelo: cada pedido é trancado e conferido. Pedidos `pago_sem_estoque`, estornados e contestados nunca recebem ingresso.
 */
export async function backfillTickets(
  deps: { db: Db; qr: QrConfig },
  limit = 200,
): Promise<{ orders: number; tickets: number }> {
  const pending = await deps.db.execute<{ id: string }>(sql`
    select o.id from orders o
     where o.status = 'pago'
       and (select coalesce(sum(i.quantity), 0) from order_items i where i.order_id = o.id)
         > (select count(*) from tickets t where t.order_id = o.id)
     order by o.paid_at asc
     limit ${limit}`);
  let ticketsCreated = 0;
  let ordersFixed = 0;
  for (const { id } of pending.rows) {
    const made = await deps.db.transaction(async tx => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1).for('update');
      if (!order || order.status !== 'pago') return 0;
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
      return issueForOrder(tx, deps.qr, {
        id,
        userId: order.userId,
        eventId: order.eventId,
        items: items.map(i => ({ orderItemId: i.id, ticketTypeId: i.ticketTypeId, quantity: i.quantity })),
      });
    });
    if (made > 0) {
      ordersFixed++;
      ticketsCreated += made;
      logger.info('ingressos emitidos por recuperação', { orderId: id, tickets: made });
    }
  }
  return { orders: ordersFixed, tickets: ticketsCreated };
}
