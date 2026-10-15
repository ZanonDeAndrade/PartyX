import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { writeAudit, type Tx } from '../db/audit';
import { orderItemLots, reservations, ticketLots, ticketTypes } from '../db/schema';
import { settleLots, type Lot, type LotChange } from '../domain/lots';

/**
 * Lotes por tipo de ingresso no banco (0013, 15/10/2026). As regras ficam em `domain/lots.ts`; aqui só se lê, grava e registra.
 * Toda gravação de lote acontece com a linha do tipo trancada (`FOR UPDATE`), a mesma trava da compra e da confirmação do pagamento:
 * por isso duas compras simultâneas nunca vendem a mais nem viram o mesmo lote duas vezes.
 */

export type LotRow = typeof ticketLots.$inferSelect;
type TypeRow = typeof ticketTypes.$inferSelect;

export const toLot = (r: LotRow): Lot => ({
  id: r.id,
  position: r.position,
  name: r.name,
  priceCents: r.priceCents,
  quantity: r.quantity,
  carriedIn: r.carriedIn,
  passedOut: r.passedOut,
  discarded: r.discarded,
  quantitySold: r.quantitySold,
  salesStartAt: r.salesStartAt,
  salesEndAt: r.salesEndAt,
  leftoverPolicy: r.leftoverPolicy,
  status: r.status,
  closedAt: r.closedAt,
  closeReason: r.closeReason,
});

/**
 * Nome do tipo com o lote, para ingresso, PDF, e-mail e painel: "Pista · 2º lote". O "Lote único" (tipo que não vende em lotes) e o
 * ingresso sem lote (emitido antes dos lotes) mostram só o tipo, como antes. Exige `ticket_lots` na consulta (junção à esquerda).
 */
export const typeWithLotName = sql<string>`case when ${ticketLots.name} is null or ${ticketLots.name} = 'Lote único' then ${ticketTypes.name} else ${ticketTypes.name} || ' · ' || ${ticketLots.name} end`;

/** Lotes de cada tipo, em ordem. */
export async function lotsByType(db: Db | Tx, typeIds: string[]): Promise<Map<string, LotRow[]>> {
  const out = new Map<string, LotRow[]>(typeIds.map(id => [id, []]));
  if (typeIds.length === 0) return out;
  const rows = await db
    .select()
    .from(ticketLots)
    .where(inArray(ticketLots.ticketTypeId, typeIds))
    .orderBy(asc(ticketLots.ticketTypeId), asc(ticketLots.position));
  for (const r of rows) out.get(r.ticketTypeId)!.push(r);
  return out;
}

/** Reservas ativas e dentro do prazo, por lote (vencidas não contam: a unidade já voltou). */
export async function reservedByLot(db: Db | Tx, typeIds: string[], now: Date): Promise<Map<string, number>> {
  if (typeIds.length === 0) return new Map();
  const rows = await db
    .select({ lotId: orderItemLots.lotId, n: sql<number>`coalesce(sum(${orderItemLots.quantity}), 0)::int` })
    .from(orderItemLots)
    .innerJoin(
      reservations,
      and(eq(reservations.orderId, orderItemLots.orderId), eq(reservations.ticketTypeId, orderItemLots.ticketTypeId)),
    )
    .where(
      and(
        inArray(orderItemLots.ticketTypeId, typeIds),
        eq(reservations.status, 'ativa'),
        gt(reservations.expiresAt, now),
      ),
    )
    .groupBy(orderItemLots.lotId);
  return new Map(rows.map(r => [r.lotId, r.n]));
}

/**
 * Tipo sem lote (criado por uma versão anterior aos lotes, numa volta atrás): ganha o "Lote único" com o preço, a capacidade e os
 * vendidos dele, já à venda. Só com a linha do tipo trancada.
 */
async function ensureLots(tx: Tx, types: TypeRow[], have: Map<string, LotRow[]>, now: Date) {
  for (const t of types) {
    if ((have.get(t.id) ?? []).length > 0) continue;
    const [created] = await tx
      .insert(ticketLots)
      .values({
        ticketTypeId: t.id,
        eventId: t.eventId,
        position: 1,
        name: 'Lote único',
        priceCents: t.priceCents,
        quantity: t.quantityTotal,
        quantitySold: t.quantitySold,
        status: 'a_venda',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    have.set(t.id, [created!]);
  }
}

const AUDIT_ACTION: Record<LotChange['kind'], string> = {
  encerrar: 'lote.virar',
  abrir: 'lote.abrir',
  devolver: 'lote.devolver',
};

/**
 * Grava o novo estado dos lotes de um tipo (só o que mudou), espelha no tipo o preço do lote à venda (assim uma versão anterior aos
 * lotes, numa volta atrás, vende pelo preço certo) e registra cada mudança na trilha. `actorId` nulo: virada automática do sistema.
 */
export async function saveLots(
  tx: Tx,
  type: Pick<TypeRow, 'id' | 'priceCents'>,
  before: readonly Lot[],
  after: readonly Lot[],
  changes: readonly LotChange[],
  actorId: string | null,
  now: Date,
) {
  const old = new Map(before.map(l => [l.id, l]));
  for (const l of after) {
    const o = old.get(l.id);
    if (
      o &&
      o.status === l.status &&
      o.carriedIn === l.carriedIn &&
      o.passedOut === l.passedOut &&
      o.discarded === l.discarded
    )
      continue;
    await tx
      .update(ticketLots)
      .set({
        status: l.status,
        closedAt: l.closedAt,
        closeReason: l.closeReason,
        carriedIn: l.carriedIn,
        passedOut: l.passedOut,
        discarded: l.discarded,
        updatedAt: now,
      })
      .where(eq(ticketLots.id, l.id));
  }
  const current = after.find(l => l.status === 'a_venda');
  if (current && current.priceCents !== type.priceCents) {
    await tx.update(ticketTypes).set({ priceCents: current.priceCents, updatedAt: now }).where(eq(ticketTypes.id, type.id));
  }
  const nameOf = new Map(after.map(l => [l.id, l.name]));
  for (const c of changes) {
    const lotId = c.kind === 'devolver' ? c.toLotId : c.lotId;
    await writeAudit(tx, {
      actorId,
      action: AUDIT_ACTION[c.kind],
      entity: 'ticket_lot',
      entityId: lotId,
      before: null,
      after: { ...c, tipoId: type.id, lote: nameOf.get(lotId) ?? null },
      reason:
        c.kind === 'encerrar'
          ? c.reason === 'manual'
            ? 'Virada manual pelo painel.'
            : c.reason === 'data'
              ? 'Virada automática: passou a data de fim do lote.'
              : 'Virada automática: o lote esgotou.'
          : c.kind === 'abrir'
            ? 'Lote aberto para venda.'
            : 'Reservas vencidas de um lote encerrado: unidades devolvidas ao lote à venda.',
      at: now,
    });
  }
}

/**
 * Aplica as viradas devidas em `now` aos tipos dados e grava. **Chamar com as linhas desses tipos já trancadas.** Devolve os lotes
 * acertados por tipo e as reservas válidas por lote, para a compra continuar na mesma transação.
 */
export async function settleTypes(tx: Tx, types: TypeRow[], now: Date) {
  const ids = types.map(t => t.id);
  const rows = await lotsByType(tx, ids);
  await ensureLots(tx, types, rows, now);
  const reserved = await reservedByLot(tx, ids, now);
  const byType = new Map<string, Lot[]>();
  for (const t of types) {
    const before = (rows.get(t.id) ?? []).map(toLot);
    const { lots, changes } = settleLots(before, reserved, now);
    if (changes.length) await saveLots(tx, t, before, lots, changes, null, now);
    byType.set(t.id, lots);
  }
  return { byType, reserved };
}

/** O mesmo cálculo, sem gravar nada (página pública, resumo do checkout, painel): o que valeria agora. */
export async function previewTypes(db: Db | Tx, types: Pick<TypeRow, 'id'>[], now: Date) {
  const ids = types.map(t => t.id);
  const rows = await lotsByType(db, ids);
  const reserved = await reservedByLot(db, ids, now);
  const byType = new Map<string, Lot[]>();
  for (const t of types) byType.set(t.id, settleLots((rows.get(t.id) ?? []).map(toLot), reserved, now).lots);
  return { byType, reserved, rows };
}
