import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { writeAudit, type Tx } from '../db/audit';
import { events, promoters, reservations, ticketTypes } from '../db/schema';
import {
  AGE_RATINGS,
  availableQuantity,
  isCouponCodeValid,
  normalizeCouponCode,
  salesState,
  slugify,
  type AgeRating,
} from '../domain/events';
import { AppError } from '../domain/errors';
import { normalizeName, isPhoneValid, normalizePhone } from '../domain/identity';
import type { Clock } from '../providers/clock';

export interface EventsDeps {
  db: Db;
  clock: Clock;
}
export interface Actor {
  id: string;
}
export interface FieldError {
  campo: string;
  mensagem: string;
}

const invalid = (errors: FieldError[]) =>
  new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', errors);
const notFound = (what: string) => new AppError(404, 'nao_encontrado', `${what} não encontrado.`);

function pgError(error: unknown): { code?: string; constraint?: string } {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return { code: e?.code ?? e?.cause?.code, constraint: e?.constraint ?? e?.cause?.constraint };
}

export const LIMITS = {
  nameMax: 120,
  textMax: 5000,
  attractionsMax: 30,
  attractionMax: 80,
  priceMaxCents: 10_000_000,
  quantityMax: 100_000,
  typeNameMax: 60,
} as const;

// ---------- eventos (RF-11, RF-12, RF-19) ----------

export type EventRow = typeof events.$inferSelect;
type TypeRow = typeof ticketTypes.$inferSelect;

const eventSnapshot = (e: EventRow) => ({
  slug: e.slug,
  name: e.name,
  startsAt: e.startsAt.toISOString(),
  venue: e.venue,
  address: e.address,
  description: e.description,
  attractions: e.attractions,
  ageRating: e.ageRating,
  bannerUrl: e.bannerUrl,
  status: e.status,
  isFeatured: e.isFeatured,
  closedAt: e.closedAt?.toISOString() ?? null,
});

export interface EventInput {
  name: string;
  startsAt: Date;
  venue: string;
  address: string;
  description: string;
  attractions?: string[];
  ageRating: AgeRating;
  isFeatured?: boolean;
}

function checkEvent(input: Partial<EventInput>, required: boolean) {
  const errors: FieldError[] = [];
  const out: Partial<Omit<EventInput, 'startsAt'>> & { startsAt?: Date } = {};
  const text = (key: 'name' | 'venue' | 'address' | 'description', label: string, max: number) => {
    const raw = input[key];
    if (raw === undefined && !required) return;
    const value = normalizeName(raw ?? '');
    if (!value) errors.push({ campo: key, mensagem: `Informe ${label}.` });
    else if (value.length > max) errors.push({ campo: key, mensagem: `Use no máximo ${max} caracteres.` });
    else out[key] = key === 'description' ? (raw ?? '').trim() : value;
  };
  text('name', 'o nome do evento', LIMITS.nameMax);
  text('venue', 'o local', LIMITS.nameMax);
  text('address', 'o endereço', 200);
  text('description', 'a descrição', LIMITS.textMax);
  if (input.startsAt !== undefined || required) {
    if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) {
      errors.push({ campo: 'startsAt', mensagem: 'Informe a data e o horário.' });
    } else out.startsAt = input.startsAt;
  }
  if (input.ageRating !== undefined || required) {
    if (!AGE_RATINGS.includes(input.ageRating as AgeRating)) {
      errors.push({ campo: 'ageRating', mensagem: 'Escolha uma classificação etária.' });
    } else out.ageRating = input.ageRating;
  }
  if (input.attractions !== undefined) {
    const list = input.attractions.map(a => normalizeName(a)).filter(Boolean);
    if (list.length > LIMITS.attractionsMax || list.some(a => a.length > LIMITS.attractionMax)) {
      errors.push({ campo: 'attractions', mensagem: 'Muitas atrações ou nome muito longo.' });
    } else out.attractions = list;
  }
  if (input.isFeatured !== undefined) out.isFeatured = input.isFeatured;
  if (errors.length) throw invalid(errors);
  return out;
}

export async function createEvent(deps: EventsDeps, actor: Actor, input: EventInput & { slug?: string }) {
  const data = checkEvent(input, true);
  const now = deps.clock.now();
  const explicit = input.slug !== undefined;
  const base = explicit ? input.slug!.trim() : slugify(data.name!);
  if (explicit && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(base)) {
    throw invalid([{ campo: 'slug', mensagem: 'Use letras minúsculas, números e hífens.' }]);
  }
  // Slug repetido: o banco decide (índice único). Endereço gerado ganha sufixo; endereço escolhido é recusado.
  for (let attempt = 1; attempt <= 20; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    try {
      return await deps.db.transaction(async tx => {
        const [created] = await tx
          .insert(events)
          .values({
            slug,
            name: data.name!,
            startsAt: data.startsAt!,
            venue: data.venue!,
            address: data.address!,
            description: data.description!,
            attractions: data.attractions ?? [],
            ageRating: data.ageRating!,
            isFeatured: data.isFeatured ?? false,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        await writeAudit(tx, {
          actorId: actor.id,
          action: 'evento.criar',
          entity: 'event',
          entityId: created!.id,
          before: null,
          after: eventSnapshot(created!),
          at: now,
        });
        return created!;
      });
    } catch (error) {
      if (pgError(error).code === '23505' && pgError(error).constraint === 'events_slug_key') {
        if (explicit) throw invalid([{ campo: 'slug', mensagem: 'Este endereço já está em uso.' }]);
        continue;
      }
      throw error;
    }
  }
  throw new AppError(409, 'slug_indisponivel', 'Não foi possível gerar o endereço do evento. Informe outro nome.');
}

async function lockEvent(tx: Tx, id: string): Promise<EventRow> {
  const [row] = await tx.select().from(events).where(eq(events.id, id)).limit(1).for('update');
  if (!row) throw notFound('Evento');
  return row;
}

const closedError = () =>
  new AppError(409, 'evento_encerrado', 'Este evento está encerrado e não pode mais ser alterado.');

export async function updateEvent(deps: EventsDeps, actor: Actor, id: string, input: Partial<EventInput>) {
  const data = checkEvent(input, false);
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const before = await lockEvent(tx, id);
    if (before.status === 'encerrado') throw closedError();
    const [after] = await tx
      .update(events)
      .set({ ...data, updatedAt: now })
      .where(eq(events.id, id))
      .returning();
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'evento.editar',
      entity: 'event',
      entityId: id,
      before: eventSnapshot(before),
      after: eventSnapshot(after!),
      at: now,
    });
    return after!;
  });
}

/** Troca ou remove o banner. A URL vem do armazenamento, nunca do cliente. */
export async function setEventBanner(deps: EventsDeps, actor: Actor, id: string, bannerUrl: string | null) {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const before = await lockEvent(tx, id);
    if (before.status === 'encerrado') throw closedError();
    const [after] = await tx.update(events).set({ bannerUrl, updatedAt: now }).where(eq(events.id, id)).returning();
    await writeAudit(tx, {
      actorId: actor.id,
      action: bannerUrl ? 'evento.banner' : 'evento.banner_remover',
      entity: 'event',
      entityId: id,
      before: { bannerUrl: before.bannerUrl },
      after: { bannerUrl },
      at: now,
    });
    return after!;
  });
}

export async function eventExists(deps: EventsDeps, id: string) {
  const [row] = await deps.db.select({ status: events.status }).from(events).where(eq(events.id, id)).limit(1);
  if (!row) throw notFound('Evento');
  if (row.status === 'encerrado') throw closedError();
}

/** Rascunho → publicado (RF-11, CA-07). Exige data futura e ao menos um tipo de ingresso ativo. */
export async function publishEvent(deps: EventsDeps, actor: Actor, id: string) {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const before = await lockEvent(tx, id);
    if (before.status !== 'rascunho') {
      throw new AppError(409, 'estado_invalido', 'Só um evento em rascunho pode ser publicado.');
    }
    const errors: FieldError[] = [];
    if (before.startsAt <= now) errors.push({ campo: 'startsAt', mensagem: 'A data do evento já passou.' });
    const [active] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(ticketTypes)
      .where(and(eq(ticketTypes.eventId, id), eq(ticketTypes.isActive, true)));
    if (!active || active.n === 0) {
      errors.push({ campo: 'ticketTypes', mensagem: 'Cadastre ao menos um tipo de ingresso ativo.' });
    }
    if (errors.length) throw invalid(errors);
    const [after] = await tx
      .update(events)
      .set({ status: 'publicado', updatedAt: now })
      .where(eq(events.id, id))
      .returning();
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'evento.publicar',
      entity: 'event',
      entityId: id,
      before: eventSnapshot(before),
      after: eventSnapshot(after!),
      at: now,
    });
    return after!;
  });
}

/** Publicado → encerrado (RF-11, CA-11). Sem volta: ingressos e pedidos continuam consultáveis. */
export async function closeEvent(deps: EventsDeps, actor: Actor, id: string) {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const before = await lockEvent(tx, id);
    if (before.status !== 'publicado') {
      throw new AppError(409, 'estado_invalido', 'Só um evento publicado pode ser encerrado.');
    }
    const [after] = await tx
      .update(events)
      .set({ status: 'encerrado', isFeatured: false, closedAt: now, updatedAt: now })
      .where(eq(events.id, id))
      .returning();
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'evento.encerrar',
      entity: 'event',
      entityId: id,
      before: eventSnapshot(before),
      after: eventSnapshot(after!),
      at: now,
    });
    return after!;
  });
}

/**
 * "Encerrar vendas agora" (ADM02, ADM04): ninguém mais compra, e o evento continua publicado (a portaria segue funcionando).
 * Sem estado novo: usa o período de vendas que já existe. Todo tipo ATIVO com fim das vendas no futuro passa a terminar agora;
 * se ainda nem tinha começado ("em breve"), o início também vira agora menos um segundo, para respeitar fim > início.
 * Tipos inativos e os já encerrados ficam como estão. Quem já tem reserva em andamento ainda pode concluir o pagamento dela.
 * Uma linha na trilha com o antes e o depois de cada tipo alterado.
 */
export async function stopSalesNow(deps: EventsDeps, actor: Actor, id: string) {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const event = await lockEvent(tx, id);
    if (event.status !== 'publicado') {
      throw new AppError(409, 'estado_invalido', 'Só um evento publicado tem vendas para encerrar.');
    }
    // Mesma ordem de trava da reserva e da edição de capacidade (id), para não haver impasse.
    const open = await tx
      .select()
      .from(ticketTypes)
      .where(and(eq(ticketTypes.eventId, id), eq(ticketTypes.isActive, true), gt(ticketTypes.salesEndAt, now)))
      .orderBy(asc(ticketTypes.id))
      .for('update');
    const changes: {
      id: string;
      name: string;
      before: { inicio: string; fim: string };
      after: { inicio: string; fim: string };
    }[] = [];
    for (const t of open) {
      const start = t.salesStartAt < now ? t.salesStartAt : new Date(now.getTime() - 1000);
      await tx
        .update(ticketTypes)
        .set({ salesStartAt: start, salesEndAt: now, updatedAt: now })
        .where(eq(ticketTypes.id, t.id));
      changes.push({
        id: t.id,
        name: t.name,
        before: { inicio: t.salesStartAt.toISOString(), fim: t.salesEndAt.toISOString() },
        after: { inicio: start.toISOString(), fim: now.toISOString() },
      });
    }
    if (changes.length) {
      await writeAudit(tx, {
        actorId: actor.id,
        action: 'evento.encerrar_vendas',
        entity: 'event',
        entityId: id,
        before: { tipos: changes.map(c => ({ id: c.id, nome: c.name, ...c.before })) },
        after: { tipos: changes.map(c => ({ id: c.id, nome: c.name, ...c.after })) },
        reason: 'Vendas encerradas agora pelo painel; o evento continua publicado e a portaria segue funcionando.',
        at: now,
      });
    }
    return { event, typesClosed: changes.length };
  });
}

// ---------- tipos de ingresso (RF-14, RF-15, RF-16, RF-17) ----------

export interface TypeView extends TypeRow {
  quantityReserved: number;
  available: number;
  salesState: ReturnType<typeof salesState>;
}

/** Soma das reservas ativas e dentro do prazo, por tipo. */
export async function reservedByType(db: Db | Tx, typeIds: string[], now: Date): Promise<Map<string, number>> {
  if (typeIds.length === 0) return new Map();
  const rows = await db
    .select({ id: reservations.ticketTypeId, n: sql<number>`coalesce(sum(${reservations.quantity}), 0)::int` })
    .from(reservations)
    .where(
      and(
        inArray(reservations.ticketTypeId, typeIds),
        eq(reservations.status, 'ativa'),
        gt(reservations.expiresAt, now),
      ),
    )
    .groupBy(reservations.ticketTypeId);
  return new Map(rows.map(r => [r.id, r.n]));
}

function viewType(row: TypeRow, reserved: number, now: Date): TypeView {
  const input = { ...row, quantityReserved: reserved };
  return {
    ...row,
    quantityReserved: reserved,
    available: availableQuantity(input),
    salesState: salesState(input, now),
  };
}

export interface TypeInput {
  name: string;
  priceCents: number;
  quantityTotal: number;
  salesStartAt: Date;
  salesEndAt: Date;
  isActive?: boolean;
}

function checkType(input: Partial<TypeInput>, required: boolean) {
  const errors: FieldError[] = [];
  const out: Partial<TypeInput> = {};
  if (input.name !== undefined || required) {
    const name = normalizeName(input.name ?? '');
    if (!name) errors.push({ campo: 'name', mensagem: 'Informe o nome do tipo de ingresso.' });
    else if (name.length > LIMITS.typeNameMax) errors.push({ campo: 'name', mensagem: 'Use no máximo 60 caracteres.' });
    else out.name = name;
  }
  if (input.priceCents !== undefined || required) {
    const p = input.priceCents;
    // Valor sempre em centavos inteiros. Zero é proibido: ingresso gratuito e cortesia estão fora do escopo.
    if (!Number.isInteger(p) || p! < 1 || p! > LIMITS.priceMaxCents) {
      errors.push({ campo: 'priceCents', mensagem: 'Informe um valor maior que zero, em centavos.' });
    } else out.priceCents = p;
  }
  if (input.quantityTotal !== undefined || required) {
    const q = input.quantityTotal;
    if (!Number.isInteger(q) || q! < 1 || q! > LIMITS.quantityMax) {
      errors.push({ campo: 'quantityTotal', mensagem: 'Informe uma quantidade de 1 a 100.000.' });
    } else out.quantityTotal = q;
  }
  for (const key of ['salesStartAt', 'salesEndAt'] as const) {
    const v = input[key];
    if (v === undefined && !required) continue;
    if (!(v instanceof Date) || Number.isNaN(v.getTime())) {
      errors.push({ campo: key, mensagem: 'Informe a data e o horário.' });
    } else out[key] = v;
  }
  if (input.isActive !== undefined) out.isActive = input.isActive;
  if (errors.length) throw invalid(errors);
  return out;
}

const typeSnapshot = (t: TypeRow) => ({
  name: t.name,
  priceCents: t.priceCents,
  quantityTotal: t.quantityTotal,
  quantitySold: t.quantitySold,
  salesStartAt: t.salesStartAt.toISOString(),
  salesEndAt: t.salesEndAt.toISOString(),
  isActive: t.isActive,
});

function typeConflict(error: unknown): never {
  if (pgError(error).code === '23505') {
    throw invalid([{ campo: 'name', mensagem: 'Já existe um tipo de ingresso com este nome neste evento.' }]);
  }
  throw error;
}

export async function createTicketType(deps: EventsDeps, actor: Actor, eventId: string, input: TypeInput) {
  const data = checkType(input, true);
  if (data.salesEndAt! <= data.salesStartAt!) {
    throw invalid([{ campo: 'salesEndAt', mensagem: 'O fim das vendas precisa ser depois do início.' }]);
  }
  const now = deps.clock.now();
  try {
    const row = await deps.db.transaction(async tx => {
      const event = await lockEvent(tx, eventId);
      if (event.status === 'encerrado') throw closedError();
      const [created] = await tx
        .insert(ticketTypes)
        .values({
          eventId,
          name: data.name!,
          priceCents: data.priceCents!,
          quantityTotal: data.quantityTotal!,
          salesStartAt: data.salesStartAt!,
          salesEndAt: data.salesEndAt!,
          isActive: data.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await writeAudit(tx, {
        actorId: actor.id,
        action: 'ingresso_tipo.criar',
        entity: 'ticket_type',
        entityId: created!.id,
        before: null,
        after: typeSnapshot(created!),
        at: now,
      });
      return created!;
    });
    return viewType(row, 0, now);
  } catch (error) {
    return typeConflict(error);
  }
}

/**
 * Edita um tipo. A capacidade nunca cai abaixo de vendidos mais reservas válidas: a linha do tipo fica
 * trancada (mesmo bloqueio da reserva, Prompt 09), então uma reserva em curso não escapa da conta.
 */
export async function updateTicketType(deps: EventsDeps, actor: Actor, typeId: string, input: Partial<TypeInput>) {
  const data = checkType(input, false);
  const now = deps.clock.now();
  try {
    const result = await deps.db.transaction(async tx => {
      const [before] = await tx.select().from(ticketTypes).where(eq(ticketTypes.id, typeId)).limit(1).for('update');
      if (!before) throw notFound('Tipo de ingresso');
      const [event] = await tx.select({ status: events.status }).from(events).where(eq(events.id, before.eventId));
      if (event?.status === 'encerrado') throw closedError();

      const start = data.salesStartAt ?? before.salesStartAt;
      const end = data.salesEndAt ?? before.salesEndAt;
      if (end <= start)
        throw invalid([{ campo: 'salesEndAt', mensagem: 'O fim das vendas precisa ser depois do início.' }]);

      const reserved = (await reservedByType(tx, [typeId], now)).get(typeId) ?? 0;
      if (data.quantityTotal !== undefined) {
        const committed = before.quantitySold + reserved;
        if (data.quantityTotal < committed) {
          throw new AppError(
            409,
            'capacidade_abaixo_do_comprometido',
            `A capacidade não pode ser menor que ${committed}: ${before.quantitySold} vendidos e ${reserved} reservados.`,
            { vendidos: before.quantitySold, reservados: reserved, minimo: committed },
          );
        }
      }
      const [after] = await tx
        .update(ticketTypes)
        .set({ ...data, updatedAt: now })
        .where(eq(ticketTypes.id, typeId))
        .returning();
      // Ativar e desativar ganham ação própria na trilha (são as mudanças que tiram ou põem o tipo à venda na hora).
      const toggled = before.isActive !== after!.isActive;
      await writeAudit(tx, {
        actorId: actor.id,
        action: toggled
          ? after!.isActive
            ? 'ingresso_tipo.ativar'
            : 'ingresso_tipo.desativar'
          : 'ingresso_tipo.editar',
        entity: 'ticket_type',
        entityId: typeId,
        before: typeSnapshot(before),
        after: typeSnapshot(after!),
        at: now,
      });
      return { row: after!, reserved };
    });
    return viewType(result.row, result.reserved, now);
  } catch (error) {
    return typeConflict(error);
  }
}

// ---------- consultas do painel ----------

export async function listEvents(deps: EventsDeps) {
  return deps.db.select().from(events).orderBy(desc(events.startsAt), asc(events.id));
}

export async function getEvent(deps: EventsDeps, id: string) {
  const now = deps.clock.now();
  const [event] = await deps.db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!event) throw notFound('Evento');
  const types = await deps.db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.eventId, id))
    .orderBy(asc(ticketTypes.salesStartAt), asc(ticketTypes.name));
  const reserved = await reservedByType(
    deps.db,
    types.map(t => t.id),
    now,
  );
  return { event, ticketTypes: types.map(t => viewType(t, reserved.get(t.id) ?? 0, now)) };
}

// ---------- promoters (RF-18, CA-10) ----------

export type PromoterRow = typeof promoters.$inferSelect;
const promoterSnapshot = (p: PromoterRow) => ({
  name: p.name,
  couponCode: p.couponCode,
  phone: p.phone,
  isActive: p.isActive,
});

export interface PromoterInput {
  name: string;
  couponCode: string;
  phone?: string | null;
  isActive?: boolean;
}

function checkPromoter(input: Partial<PromoterInput>, required: boolean) {
  const errors: FieldError[] = [];
  const out: Partial<PromoterInput> = {};
  if (input.name !== undefined || required) {
    const name = normalizeName(input.name ?? '');
    if (!name || name.length > 80)
      errors.push({ campo: 'name', mensagem: 'Informe o nome do promoter (até 80 caracteres).' });
    else out.name = name;
  }
  if (input.couponCode !== undefined || required) {
    const code = normalizeCouponCode(input.couponCode ?? '');
    if (!isCouponCodeValid(code)) {
      errors.push({ campo: 'couponCode', mensagem: 'Use de 3 a 20 letras ou números, sem acento, espaço ou símbolo.' });
    } else out.couponCode = code;
  }
  if (input.phone !== undefined) {
    const phone = input.phone === null || input.phone.trim() === '' ? null : normalizePhone(input.phone);
    if (phone !== null && !isPhoneValid(phone))
      errors.push({ campo: 'phone', mensagem: 'Informe o telefone com DDD.' });
    else out.phone = phone;
  }
  if (input.isActive !== undefined) out.isActive = input.isActive;
  if (errors.length) throw invalid(errors);
  return out;
}

function promoterConflict(error: unknown): never {
  if (pgError(error).code === '23505') {
    throw invalid([{ campo: 'couponCode', mensagem: 'Este código já é de outro promoter. Escolha outro.' }]);
  }
  throw error;
}

export async function listPromoters(deps: EventsDeps) {
  return deps.db.select().from(promoters).orderBy(asc(promoters.name), asc(promoters.id));
}

export async function createPromoter(deps: EventsDeps, actor: Actor, input: PromoterInput) {
  const data = checkPromoter(input, true);
  const now = deps.clock.now();
  try {
    return await deps.db.transaction(async tx => {
      const [created] = await tx
        .insert(promoters)
        .values({
          name: data.name!,
          couponCode: data.couponCode!,
          phone: data.phone ?? null,
          isActive: data.isActive ?? true,
          createdAt: now,
        })
        .returning();
      await writeAudit(tx, {
        actorId: actor.id,
        action: 'promoter.criar',
        entity: 'promoter',
        entityId: created!.id,
        before: null,
        after: promoterSnapshot(created!),
        at: now,
      });
      return created!;
    });
  } catch (error) {
    return promoterConflict(error);
  }
}

export async function updatePromoter(deps: EventsDeps, actor: Actor, id: string, input: Partial<PromoterInput>) {
  const data = checkPromoter(input, false);
  const now = deps.clock.now();
  try {
    return await deps.db.transaction(async tx => {
      const [before] = await tx.select().from(promoters).where(eq(promoters.id, id)).limit(1).for('update');
      if (!before) throw notFound('Promoter');
      const [after] = await tx.update(promoters).set(data).where(eq(promoters.id, id)).returning();
      await writeAudit(tx, {
        actorId: actor.id,
        action: before.isActive && data.isActive === false ? 'promoter.desativar' : 'promoter.editar',
        entity: 'promoter',
        entityId: id,
        before: promoterSnapshot(before),
        after: promoterSnapshot(after!),
        at: now,
      });
      return after!;
    });
  } catch (error) {
    return promoterConflict(error);
  }
}
