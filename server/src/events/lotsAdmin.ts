import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { writeAudit, type Tx } from '../db/audit';
import { events, orderItemLots, ticketLots, ticketTypes } from '../db/schema';
import { AppError } from '../domain/errors';
import { normalizeName } from '../domain/identity';
import { lotCapacity, turnLot, type LotLeftover } from '../domain/lots';
import { lotsByType, reservedByLot, saveLots, settleTypes, toLot, type LotRow } from './lots';
import { LIMITS, viewTypes, type Actor, type EventsDeps, type FieldError } from './service';

/**
 * Lotes no painel (0013, 15/10/2026): criar, editar, apagar, reordenar e virar. Tudo com a linha do tipo trancada (`FOR UPDATE`), a
 * mesma trava da compra, e na trilha de auditoria. Lote com vendas não muda de preço nem sai: só encerra (virando).
 */

const invalid = (errors: FieldError[]) =>
  new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', errors);
const LOT_NAME_MAX = 60;
/** Posição provisória ao trocar dois lotes de lugar (o índice único não aceita duas iguais nem no meio da troca). */
const SWAP_POSITION = 32_000;

type TypeRow = typeof ticketTypes.$inferSelect;

async function lockType(tx: Tx, typeId: string): Promise<TypeRow> {
  const [type] = await tx.select().from(ticketTypes).where(eq(ticketTypes.id, typeId)).limit(1).for('update');
  if (!type) throw new AppError(404, 'nao_encontrado', 'Tipo de ingresso não encontrado.');
  const [event] = await tx.select({ status: events.status }).from(events).where(eq(events.id, type.eventId));
  if (event?.status === 'encerrado')
    throw new AppError(409, 'evento_encerrado', 'Este evento está encerrado e não pode mais ser alterado.');
  return type;
}

/** Tranca o tipo do lote e devolve os dois (o lote lido de novo, já com o tipo trancado). */
async function lockLot(tx: Tx, lotId: string): Promise<{ type: TypeRow; lot: LotRow }> {
  const [found] = await tx.select({ typeId: ticketLots.ticketTypeId }).from(ticketLots).where(eq(ticketLots.id, lotId));
  if (!found) throw new AppError(404, 'nao_encontrado', 'Lote não encontrado.');
  const type = await lockType(tx, found.typeId);
  const [lot] = await tx.select().from(ticketLots).where(eq(ticketLots.id, lotId));
  if (!lot) throw new AppError(404, 'nao_encontrado', 'Lote não encontrado.');
  return { type, lot };
}

export interface LotInput {
  name?: string;
  priceCents: number;
  quantity: number;
  salesStartAt?: Date | null;
  salesEndAt?: Date | null;
  leftoverPolicy?: LotLeftover;
}

function checkLot(input: Partial<LotInput>, required: boolean) {
  const errors: FieldError[] = [];
  const out: Partial<LotInput> = {};
  if (input.name !== undefined) {
    const name = normalizeName(input.name);
    if (name.length > LOT_NAME_MAX) errors.push({ campo: 'name', mensagem: `Use no máximo ${LOT_NAME_MAX} caracteres.` });
    else if (name) out.name = name;
  }
  if (input.priceCents !== undefined || required) {
    const p = input.priceCents;
    if (!Number.isInteger(p) || p! < 1 || p! > LIMITS.priceMaxCents)
      errors.push({ campo: 'priceCents', mensagem: 'Informe um valor maior que zero, em centavos.' });
    else out.priceCents = p;
  }
  if (input.quantity !== undefined || required) {
    const q = input.quantity;
    if (!Number.isInteger(q) || q! < 1 || q! > LIMITS.quantityMax)
      errors.push({ campo: 'quantity', mensagem: 'Informe uma quantidade de 1 a 100.000.' });
    else out.quantity = q;
  }
  for (const key of ['salesStartAt', 'salesEndAt'] as const) {
    const v = input[key];
    if (v === undefined) continue;
    if (v !== null && (!(v instanceof Date) || Number.isNaN(v.getTime())))
      errors.push({ campo: key, mensagem: 'Informe a data e o horário.' });
    else out[key] = v;
  }
  if (input.leftoverPolicy !== undefined) {
    if (input.leftoverPolicy !== 'passar' && input.leftoverPolicy !== 'descartar')
      errors.push({ campo: 'leftoverPolicy', mensagem: 'Escolha se a sobra passa para o próximo lote ou é descartada.' });
    else out.leftoverPolicy = input.leftoverPolicy;
  }
  if (errors.length) throw invalid(errors);
  return out;
}

const lotSnapshot = (l: LotRow) => ({
  tipoId: l.ticketTypeId,
  name: l.name,
  position: l.position,
  priceCents: l.priceCents,
  quantity: l.quantity,
  salesStartAt: l.salesStartAt?.toISOString() ?? null,
  salesEndAt: l.salesEndAt?.toISOString() ?? null,
  leftoverPolicy: l.leftoverPolicy,
  status: l.status,
});

function assertWindow(start: Date | null, end: Date | null) {
  if (start && end && end <= start)
    throw invalid([{ campo: 'salesEndAt', mensagem: 'O fim do lote precisa ser depois do início.' }]);
}

function assertWithinCapacity(type: TypeRow, planned: number) {
  if (planned > type.quantityTotal)
    throw new AppError(
      409,
      'lotes_acima_da_capacidade',
      `A soma dos lotes (${planned}) passaria da capacidade do tipo (${type.quantityTotal}). Aumente a capacidade ou reduza um lote.`,
      { soma: planned, capacidade: type.quantityTotal },
    );
}

async function finish(deps: EventsDeps, typeId: string) {
  const [row] = await deps.db.select().from(ticketTypes).where(eq(ticketTypes.id, typeId));
  return (await viewTypes(deps.db, [row!], deps.clock.now()))[0]!;
}

/** Novo lote no fim da fila (aguardando). Se o tipo tinha só o "Lote único", ele passa a se chamar "1º lote". */
export async function createLot(deps: EventsDeps, actor: Actor, typeId: string, input: LotInput) {
  const data = checkLot(input, true);
  assertWindow(data.salesStartAt ?? null, data.salesEndAt ?? null);
  const now = deps.clock.now();
  await deps.db.transaction(async tx => {
    const type = await lockType(tx, typeId);
    await settleTypes(tx, [type], now);
    const lots = (await lotsByType(tx, [typeId])).get(typeId) ?? [];
    assertWithinCapacity(type, lots.reduce((t, l) => t + l.quantity, 0) + data.quantity!);
    const position = (lots.at(-1)?.position ?? 0) + 1;
    if (lots.length === 1 && lots[0]!.name === 'Lote único') {
      await tx.update(ticketLots).set({ name: '1º lote', updatedAt: now }).where(eq(ticketLots.id, lots[0]!.id));
    }
    const [created] = await tx
      .insert(ticketLots)
      .values({
        ticketTypeId: typeId,
        eventId: type.eventId,
        position,
        name: data.name ?? `${position}º lote`,
        priceCents: data.priceCents!,
        quantity: data.quantity!,
        salesStartAt: data.salesStartAt ?? null,
        salesEndAt: data.salesEndAt ?? null,
        leftoverPolicy: data.leftoverPolicy ?? 'passar',
        status: 'aguardando',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'lote.criar',
      entity: 'ticket_lot',
      entityId: created!.id,
      before: null,
      after: lotSnapshot(created!),
      at: now,
    });
    // Se nenhum lote estava à venda (o último encerrou), o novo pode abrir agora.
    await settleTypes(tx, [type], now);
  });
  return finish(deps, typeId);
}

/** Edita um lote que não encerrou. Com vendas, o preço não muda. A quantidade nunca fica abaixo de vendidos mais reservados. */
export async function updateLot(deps: EventsDeps, actor: Actor, lotId: string, input: Partial<LotInput>) {
  const data = checkLot(input, false);
  const now = deps.clock.now();
  let typeId = '';
  await deps.db.transaction(async tx => {
    const { type, lot } = await lockLot(tx, lotId);
    typeId = type.id;
    if (lot.status === 'encerrado') throw new AppError(409, 'lote_encerrado', 'Este lote já encerrou e não pode mais mudar.');
    if (data.priceCents !== undefined && data.priceCents !== lot.priceCents && lot.quantitySold > 0)
      throw new AppError(
        409,
        'lote_com_vendas',
        'O lote já tem vendas e o preço dele não pode mudar. Crie um novo lote com o preço novo.',
      );
    assertWindow(
      data.salesStartAt !== undefined ? data.salesStartAt : lot.salesStartAt,
      data.salesEndAt !== undefined ? data.salesEndAt : lot.salesEndAt,
    );
    if (data.quantity !== undefined) {
      const reserved = (await reservedByLot(tx, [type.id], now)).get(lot.id) ?? 0;
      const committed = lot.quantitySold + reserved;
      const capacity = lotCapacity({ ...toLot(lot), quantity: data.quantity });
      if (capacity < committed)
        throw new AppError(
          409,
          'quantidade_abaixo_do_comprometido',
          `A quantidade do lote não pode deixar menos que ${committed} unidades: ${lot.quantitySold} vendidas e ${reserved} reservadas.`,
          { vendidos: lot.quantitySold, reservados: reserved },
        );
      const others = ((await lotsByType(tx, [type.id])).get(type.id) ?? []).filter(l => l.id !== lot.id);
      assertWithinCapacity(type, others.reduce((t, l) => t + l.quantity, 0) + data.quantity);
    }
    const [after] = await tx
      .update(ticketLots)
      .set({ ...data, updatedAt: now })
      .where(eq(ticketLots.id, lotId))
      .returning();
    if (after!.status === 'a_venda' && after!.priceCents !== type.priceCents) {
      await tx.update(ticketTypes).set({ priceCents: after!.priceCents, updatedAt: now }).where(eq(ticketTypes.id, type.id));
    }
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'lote.editar',
      entity: 'ticket_lot',
      entityId: lotId,
      before: lotSnapshot(lot),
      after: lotSnapshot(after!),
      at: now,
    });
    // Uma data nova pode já valer agora (fim no passado vira o lote; início no passado abre o próximo).
    await settleTypes(tx, [type], now);
  });
  return finish(deps, typeId);
}

/** Apaga um lote que ainda aguarda e que nenhum pedido usou. Os de depois sobem uma posição. Não apaga o único lote do tipo. */
export async function deleteLot(deps: EventsDeps, actor: Actor, lotId: string) {
  const now = deps.clock.now();
  let typeId = '';
  await deps.db.transaction(async tx => {
    const { type, lot } = await lockLot(tx, lotId);
    typeId = type.id;
    if (lot.status !== 'aguardando')
      throw new AppError(409, 'lote_ja_vendeu', 'Só um lote que ainda não começou a vender pode ser apagado. Os outros só encerram.');
    const [used] = await tx.select({ id: orderItemLots.id }).from(orderItemLots).where(eq(orderItemLots.lotId, lotId)).limit(1);
    if (used) throw new AppError(409, 'lote_com_pedidos', 'Este lote tem pedidos e não pode ser apagado.');
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(ticketLots)
      .where(eq(ticketLots.ticketTypeId, type.id));
    if ((count?.n ?? 0) <= 1) throw new AppError(409, 'ultimo_lote', 'O tipo precisa de ao menos um lote.');
    await tx.delete(ticketLots).where(eq(ticketLots.id, lotId));
    // Os de depois sobem uma posição, em duas etapas (o índice único não aceita duas posições iguais no meio).
    await tx
      .update(ticketLots)
      .set({ position: sql`${ticketLots.position} + ${SWAP_POSITION}` })
      .where(and(eq(ticketLots.ticketTypeId, type.id), gt(ticketLots.position, lot.position)));
    await tx
      .update(ticketLots)
      .set({ position: sql`${ticketLots.position} - ${SWAP_POSITION} - 1`, updatedAt: now })
      .where(and(eq(ticketLots.ticketTypeId, type.id), gt(ticketLots.position, SWAP_POSITION)));
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'lote.apagar',
      entity: 'ticket_lot',
      entityId: lotId,
      before: lotSnapshot(lot),
      after: null,
      at: now,
    });
  });
  return finish(deps, typeId);
}

/** Troca de lugar com o vizinho (só entre lotes que ainda aguardam: a ordem do que já vendeu não muda). */
export async function moveLot(deps: EventsDeps, actor: Actor, lotId: string, direction: 'subir' | 'descer') {
  const now = deps.clock.now();
  let typeId = '';
  await deps.db.transaction(async tx => {
    const { type, lot } = await lockLot(tx, lotId);
    typeId = type.id;
    const lots = ((await lotsByType(tx, [type.id])).get(type.id) ?? []).sort((a, b) => a.position - b.position);
    const i = lots.findIndex(l => l.id === lotId);
    const other = lots[direction === 'subir' ? i - 1 : i + 1];
    if (lot.status !== 'aguardando' || !other || other.status !== 'aguardando')
      throw new AppError(409, 'ordem_fixa', 'Só dá para reordenar lotes que ainda não começaram a vender.');
    await tx.update(ticketLots).set({ position: SWAP_POSITION }).where(eq(ticketLots.id, lot.id));
    await tx.update(ticketLots).set({ position: lot.position, updatedAt: now }).where(eq(ticketLots.id, other.id));
    await tx.update(ticketLots).set({ position: other.position, updatedAt: now }).where(eq(ticketLots.id, lot.id));
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'lote.mover',
      entity: 'ticket_lot',
      entityId: lot.id,
      before: { position: lot.position },
      after: { position: other.position, trocouCom: other.id },
      at: now,
    });
  });
  return finish(deps, typeId);
}

/**
 * "Virar para o próximo lote" (ou, sem próximo, encerrar o lote): encerra o lote à venda com a escolha da sobra e abre o próximo, se
 * o início dele permitir. Quem está pagando uma reserva do lote encerrado continua com o preço dele.
 */
export async function turnTypeLot(deps: EventsDeps, actor: Actor, typeId: string, leftover: LotLeftover) {
  if (leftover !== 'passar' && leftover !== 'descartar')
    throw invalid([{ campo: 'leftover', mensagem: 'Escolha se a sobra passa para o próximo lote ou é descartada.' }]);
  const now = deps.clock.now();
  await deps.db.transaction(async tx => {
    const type = await lockType(tx, typeId);
    const settled = await settleTypes(tx, [type], now);
    const lots = settled.byType.get(typeId) ?? [];
    const turned = turnLot(lots, settled.reserved, now, leftover);
    if (!turned) throw new AppError(409, 'sem_lote_a_venda', 'Nenhum lote está à venda neste tipo agora.');
    const [fresh] = await tx.select().from(ticketTypes).where(eq(ticketTypes.id, typeId));
    await saveLots(tx, fresh!, lots, turned.lots, turned.changes, actor.id, now);
  });
  return finish(deps, typeId);
}

/** Lotes de todos os tipos publicados acertados de uma vez (rotina diária): grava as viradas por data que ninguém disparou. */
export async function settleAllLots(deps: EventsDeps) {
  const now = deps.clock.now();
  const ids = await deps.db
    .select({ id: ticketTypes.id })
    .from(ticketTypes)
    .innerJoin(events, eq(events.id, ticketTypes.eventId))
    .where(eq(events.status, 'publicado'))
    .orderBy(asc(ticketTypes.id));
  let changed = 0;
  for (const { id } of ids) {
    await deps.db.transaction(async tx => {
      const [type] = await tx.select().from(ticketTypes).where(eq(ticketTypes.id, id)).for('update');
      if (!type) return;
      const before = ((await lotsByType(tx, [id])).get(id) ?? []).map(l => `${l.id}:${l.status}:${l.carriedIn}:${l.passedOut}`);
      const after = await settleTypes(tx, [type], now);
      const now2 = (after.byType.get(id) ?? []).map(l => `${l.id}:${l.status}:${l.carriedIn}:${l.passedOut}`);
      if (before.join() !== now2.join()) changed++;
    });
  }
  return { types: ids.length, changed };
}
