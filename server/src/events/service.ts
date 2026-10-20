import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { writeAudit, type Tx } from '../db/audit';
import { events, orderItemLots, promoterDiscountEvents, promoters, reservations, ticketLots, ticketTypes } from '../db/schema';
import { validDiscountRule } from '../domain/promoterDiscount';
import { lotCapacity, lotRemaining, lotSalesState, typeLotsView, type Lot } from '../domain/lots';
import { lotsByType, previewTypes } from './lots';
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
import { checkAccentColor } from '../domain/accent';
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
  endsAt: e.endsAt?.toISOString() ?? null,
  allowsMinors: e.allowsMinors,
  bannerUrl: e.bannerUrl,
  status: e.status,
  isFeatured: e.isFeatured,
  closedAt: e.closedAt?.toISOString() ?? null,
  archivedAt: e.archivedAt?.toISOString() ?? null,
  countdownEnabled: e.countdownEnabled,
  accentColor: e.accentColor,
  isPrivate: e.isPrivate,
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
  /** Fim previsto. Obrigatório quando o evento permite menores (vai na autorização). */
  endsAt?: Date | null;
  /** Permite quem terá 16 ou 17 anos na data do evento, com o termo de autorização (regras de menores, 14/10/2026). */
  allowsMinors?: boolean;
  /** Cronômetro regressivo na página do evento (15/10/2026). Ausente na criação: ligado. */
  countdownEnabled?: boolean;
  /** Cor de destaque da página do evento, `#RRGGBB`; nula ou vazia: o roxo da PartyX (0014). */
  accentColor?: string | null;
  /** Evento privado (D-92, 0019): só compra quem está autorizado na lista. Ausente na criação: aberto a todos. */
  isPrivate?: boolean;
}

/**
 * Regras de menores do evento, conferidas no estado FINAL (o que já está gravado mais o que mudou): fim depois do início, e quem permite
 * menores precisa de horário de fim e classificação abaixo de 18 anos. O banco confere as duas primeiras de novo. A autorização judicial
 * saiu do sistema em 14/10/2026 (D-85 revista).
 */
function checkMinorRules(final: {
  startsAt: Date;
  endsAt: Date | null;
  allowsMinors: boolean;
  ageRating: string;
}) {
  const errors: FieldError[] = [];
  if (final.endsAt && final.endsAt <= final.startsAt)
    errors.push({ campo: 'endsAt', mensagem: 'O fim precisa ser depois do início.' });
  if (final.allowsMinors) {
    if (!final.endsAt)
      errors.push({ campo: 'endsAt', mensagem: 'Informe o horário de fim: ele vai na autorização de menores.' });
    if (final.ageRating === '18 anos')
      errors.push({ campo: 'allowsMinors', mensagem: 'Evento com classificação 18 anos não permite menores.' });
  }
  if (errors.length) throw invalid(errors);
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
  if (input.endsAt !== undefined) {
    if (input.endsAt !== null && (!(input.endsAt instanceof Date) || Number.isNaN(input.endsAt.getTime())))
      errors.push({ campo: 'endsAt', mensagem: 'Informe a data e o horário de fim.' });
    else out.endsAt = input.endsAt;
  }
  if (input.allowsMinors !== undefined) out.allowsMinors = input.allowsMinors;
  if (input.countdownEnabled !== undefined) out.countdownEnabled = input.countdownEnabled;
  if (input.isPrivate !== undefined) out.isPrivate = input.isPrivate;
  if (input.accentColor !== undefined) {
    const color = checkAccentColor(input.accentColor);
    if ('problem' in color) errors.push({ campo: 'accentColor', mensagem: color.problem });
    else out.accentColor = color.value;
  }
  if (errors.length) throw invalid(errors);
  return out;
}

export async function createEvent(deps: EventsDeps, actor: Actor, input: EventInput & { slug?: string }) {
  const data = checkEvent(input, true);
  checkMinorRules({
    startsAt: data.startsAt!,
    endsAt: data.endsAt ?? null,
    allowsMinors: data.allowsMinors ?? false,
    ageRating: data.ageRating!,
  });
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
            endsAt: data.endsAt ?? null,
            allowsMinors: data.allowsMinors ?? false,
            countdownEnabled: data.countdownEnabled ?? true,
            accentColor: data.accentColor ?? null,
            isPrivate: data.isPrivate ?? false,
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
    checkMinorRules({
      startsAt: data.startsAt ?? before.startsAt,
      endsAt: data.endsAt !== undefined ? data.endsAt : before.endsAt,
      allowsMinors: data.allowsMinors ?? before.allowsMinors,
      ageRating: data.ageRating ?? before.ageRating,
    });
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
    // A chave do evento privado (D-92) tem linha própria na trilha. Ligar com vendas em andamento não cancela nada; desligar libera a
    // compra para todos e mantém a lista.
    if (before.isPrivate !== after!.isPrivate)
      await writeAudit(tx, {
        actorId: actor.id,
        action: 'evento.privado',
        entity: 'event',
        entityId: id,
        before: { privado: before.isPrivate },
        after: { privado: after!.isPrivate },
        at: now,
      });
    return after!;
  });
}

/** Troca ou remove o banner. A URL vem do armazenamento, nunca do cliente. */
export async function setEventBanner(
  deps: EventsDeps,
  actor: Actor,
  id: string,
  bannerUrl: string | null,
  /** Larguras em que o banner foi gravado (versões menores e a principal). Vazio ao remover. */
  bannerWidths: number[] = [],
  /** Miniatura em `data:` da capa nova (0015); nula ao remover. */
  bannerPlaceholder: string | null = null,
) {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const before = await lockEvent(tx, id);
    if (before.status === 'encerrado') throw closedError();
    const [after] = await tx
      .update(events)
      .set({
        bannerUrl,
        bannerWidths: bannerUrl ? bannerWidths : [],
        bannerPlaceholder: bannerUrl ? bannerPlaceholder : null,
        updatedAt: now,
      })
      .where(eq(events.id, id))
      .returning();
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
 * Encerrado → publicado (reabrir), só pelo administrador, com motivo obrigatório na trilha (`evento.reabrir`). Limpa `closed_at`,
 * então a portaria volta a abrir o evento como qualquer publicado (D-79). Os tipos de ingresso ficam com o período que tinham:
 * se as vendas já tinham terminado, continuam encerradas até alguém editar o período. O destaque não volta sozinho.
 */
export async function reopenEvent(deps: EventsDeps, actor: Actor, id: string, rawReason: string) {
  const reason = rawReason.trim().replace(/\s+/g, ' ');
  if (reason.length < 5 || reason.length > 500)
    throw invalid([{ campo: 'reason', mensagem: 'Informe o motivo (de 5 a 500 caracteres).' }]);
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const before = await lockEvent(tx, id);
    if (before.status !== 'encerrado') {
      throw new AppError(409, 'estado_invalido', 'Só um evento encerrado pode ser reaberto.');
    }
    const [after] = await tx
      .update(events)
      .set({ status: 'publicado', closedAt: null, updatedAt: now })
      .where(eq(events.id, id))
      .returning();
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'evento.reabrir',
      entity: 'event',
      entityId: id,
      before: eventSnapshot(before),
      after: eventSnapshot(after!),
      reason,
      at: now,
    });
    const [onSale] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(ticketTypes)
      .where(
        and(
          eq(ticketTypes.eventId, id),
          eq(ticketTypes.isActive, true),
          sql`${ticketTypes.salesStartAt} <= ${now}`,
          gt(ticketTypes.salesEndAt, now),
        ),
      );
    return { event: after!, typesOnSale: onSale?.n ?? 0 };
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

// ---------- excluir e arquivar (pedido de 15/10/2026) ----------

/** O que impede apagar um evento. Ingresso e aceite de termo de menor só existem com pedido, mas são contados para a mensagem. */
export interface EventUsage {
  orders: number;
  tickets: number;
  checkins: number;
  minorAcceptances: number;
}
const inUse = (u: EventUsage) => u.orders + u.tickets + u.checkins + u.minorAcceptances > 0;

async function usageOf(db: Db | Tx, id: string): Promise<EventUsage> {
  const rows = await db.execute<{ orders: number; tickets: number; checkins: number; minor_acceptances: number }>(sql`
    select (select count(*) from orders where event_id = ${id})::int as orders,
           (select count(*) from tickets where event_id = ${id})::int as tickets,
           (select count(*) from checkins where event_id = ${id})::int as checkins,
           (select count(*) from minor_term_acceptances m join orders o on o.id = m.order_id where o.event_id = ${id})::int
             as minor_acceptances`);
  const r = rows.rows[0]!;
  return { orders: r.orders, tickets: r.tickets, checkins: r.checkins, minorAcceptances: r.minor_acceptances };
}

/** Para o diálogo do painel: o evento pode ser apagado, ou só arquivado? A decisão final é de `deleteEvent`, dentro da transação. */
export async function removalCheck(deps: EventsDeps, id: string) {
  const [event] = await deps.db
    .select({ name: events.name, bannerUrl: events.bannerUrl, archivedAt: events.archivedAt })
    .from(events)
    .where(eq(events.id, id))
    .limit(1);
  if (!event) throw notFound('Evento');
  const usage = await usageOf(deps.db, id);
  const [types] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(ticketTypes)
    .where(eq(ticketTypes.eventId, id));
  return {
    deletable: !inUse(usage),
    usage,
    ticketTypes: types?.n ?? 0,
    hasBanner: event.bannerUrl !== null,
    archived: event.archivedAt !== null,
  };
}

/**
 * Apaga de vez o evento SEM uso (nenhum pedido, em qualquer situação, nenhum ingresso, nenhuma leitura de portaria e nenhum aceite
 * de termo de menor), com os tipos de ingresso dele. As imagens saem do armazenamento depois, pela rota. A conferência é feita aqui
 * dentro, com as travas: um pedido que esteja entrando termina antes (e a exclusão é recusada) ou espera e não acha mais os tipos.
 * O banco confere de novo (gatilho `events_delete_only_unused` e chaves estrangeiras). Na trilha: quem, quando, id e nome, sem
 * dado de comprador (não há comprador num evento sem pedido).
 */
export async function deleteEvent(deps: EventsDeps, actor: Actor, id: string, confirmName: string) {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    // Mesma ordem de trava do checkout (tipos por id; o pedido novo, ao gravar, trava o evento pela chave estrangeira).
    await tx
      .select({ id: ticketTypes.id })
      .from(ticketTypes)
      .where(eq(ticketTypes.eventId, id))
      .orderBy(asc(ticketTypes.id))
      .for('update');
    const event = await lockEvent(tx, id);
    const usage = await usageOf(tx, id);
    if (inUse(usage)) {
      throw new AppError(
        409,
        'evento_com_registros',
        'Este evento tem pedidos, ingressos ou leituras na portaria e não pode ser excluído. Você pode arquivá-lo.',
        usage,
      );
    }
    if (normalizeName(confirmName) !== normalizeName(event.name)) {
      throw invalid([{ campo: 'confirmName', mensagem: 'Digite o nome do evento exatamente como aparece para confirmar.' }]);
    }
    // Os lotes saem antes dos tipos (0013); num evento sem pedido, nenhum lote foi usado.
    await tx.delete(ticketLots).where(eq(ticketLots.eventId, id));
    const types = await tx
      .delete(ticketTypes)
      .where(eq(ticketTypes.eventId, id))
      .returning({ id: ticketTypes.id, name: ticketTypes.name });
    await tx.delete(events).where(eq(events.id, id));
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'evento.excluir',
      entity: 'event',
      entityId: id,
      before: {
        id,
        name: event.name,
        slug: event.slug,
        status: event.status,
        startsAt: event.startsAt.toISOString(),
        archivedAt: event.archivedAt?.toISOString() ?? null,
        ticketTypes: types.map(t => ({ id: t.id, name: t.name })),
        bannerUrl: event.bannerUrl,
      },
      after: null,
      reason: 'Evento sem pedidos, ingressos, leituras de portaria e aceites de termo de menor, excluído pelo painel.',
      at: now,
    });
    return { id, name: event.name, ticketTypes: types.length };
  });
}

/**
 * Arquivar (some da vitrine, da busca, do link público e da lista padrão do painel; sem compra nova) ou desarquivar. Não mexe no
 * estado nem nos tipos: ao desarquivar, o evento volta como estava. Pedidos, ingressos, portaria, relatórios e exportações não mudam.
 */
export async function setEventArchived(deps: EventsDeps, actor: Actor, id: string, archived: boolean) {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const before = await lockEvent(tx, id);
    if ((before.archivedAt !== null) === archived) return before;
    const [after] = await tx
      .update(events)
      .set({ archivedAt: archived ? now : null, ...(archived ? { isFeatured: false } : {}), updatedAt: now })
      .where(eq(events.id, id))
      .returning();
    await writeAudit(tx, {
      actorId: actor.id,
      action: archived ? 'evento.arquivar' : 'evento.desarquivar',
      entity: 'event',
      entityId: id,
      before: { id, name: before.name, archivedAt: before.archivedAt?.toISOString() ?? null, isFeatured: before.isFeatured },
      after: { id, name: after!.name, archivedAt: after!.archivedAt?.toISOString() ?? null, isFeatured: after!.isFeatured },
      at: now,
    });
    return after!;
  });
}

// ---------- tipos de ingresso (RF-14, RF-15, RF-16, RF-17) ----------

/** Lote no painel (0013): quantidade, recebido, passado adiante, descartado, vendidos, reservados, disponíveis e situação agora. */
export interface LotView {
  id: string;
  position: number;
  name: string;
  priceCents: number;
  quantity: number;
  carriedIn: number;
  passedOut: number;
  discarded: number;
  capacity: number;
  sold: number;
  reserved: number;
  available: number;
  status: Lot['status'];
  closeReason: Lot['closeReason'];
  closedAt: Date | null;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
  leftoverPolicy: Lot['leftoverPolicy'];
  /** Algum pedido (em qualquer situação) usou este lote: não pode ser apagado; com vendas, o preço não muda. */
  hasOrders: boolean;
}

export interface TypeView extends TypeRow {
  quantityReserved: number;
  available: number;
  salesState: ReturnType<typeof salesState>;
  /** Lotes em ordem, já com as viradas devidas agora (sem gravar). */
  lots: LotView[];
}

/** Lotes de um tipo para o painel, a partir do estado acertado agora (`previewTypes`). */
function lotViews(lots: readonly Lot[], reserved: ReadonlyMap<string, number>, typeAvailable: number, used: Set<string>) {
  return lots.map((l): LotView => {
    const r = reserved.get(l.id) ?? 0;
    const free = Math.max(0, lotRemaining(l, r));
    return {
      id: l.id,
      position: l.position,
      name: l.name,
      priceCents: l.priceCents,
      quantity: l.quantity,
      carriedIn: l.carriedIn,
      passedOut: l.passedOut,
      discarded: l.discarded,
      capacity: lotCapacity(l),
      sold: l.quantitySold,
      reserved: r,
      available: l.status === 'encerrado' ? 0 : l.status === 'a_venda' ? Math.min(free, typeAvailable) : free,
      status: l.status,
      closeReason: l.closeReason,
      closedAt: l.closedAt,
      salesStartAt: l.salesStartAt,
      salesEndAt: l.salesEndAt,
      leftoverPolicy: l.leftoverPolicy,
      hasOrders: used.has(l.id),
    };
  });
}

/** Lotes que algum pedido usou. */
export async function lotsWithOrders(db: Db | Tx, typeIds: string[]): Promise<Set<string>> {
  if (typeIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ lotId: orderItemLots.lotId })
    .from(orderItemLots)
    .where(inArray(orderItemLots.ticketTypeId, typeIds));
  return new Set(rows.map(r => r.lotId));
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

function viewType(
  row: TypeRow,
  reserved: number,
  now: Date,
  lots: { lots: readonly Lot[]; reservedByLot: ReadonlyMap<string, number>; used: Set<string> } = {
    lots: [],
    reservedByLot: new Map(),
    used: new Set(),
  },
): TypeView {
  const input = { ...row, quantityReserved: reserved };
  const typeAvailable = availableQuantity(input);
  const view = typeLotsView(lots.lots, lots.reservedByLot, now, typeAvailable);
  return {
    ...row,
    quantityReserved: reserved,
    available: view.lotCount ? (view.current?.available ?? 0) : typeAvailable,
    salesState: lotSalesState(salesState(input, now), view),
    lots: lotViews(lots.lots, lots.reservedByLot, typeAvailable, lots.used),
  };
}

/** Visões dos tipos de um evento, com os lotes acertados agora (sem gravar). */
export async function viewTypes(db: Db | Tx, rows: TypeRow[], now: Date): Promise<TypeView[]> {
  const ids = rows.map(t => t.id);
  const reserved = await reservedByType(db, ids, now);
  const lots = await previewTypes(db, rows, now);
  const used = await lotsWithOrders(db, ids);
  return rows.map(t =>
    viewType(t, reserved.get(t.id) ?? 0, now, {
      lots: lots.byType.get(t.id) ?? [],
      reservedByLot: lots.reserved,
      used,
    }),
  );
}

export interface TypeInput {
  name: string;
  priceCents: number;
  quantityTotal: number;
  salesStartAt: Date;
  salesEndAt: Date;
  isActive?: boolean;
  /** "Últimas unidades deste lote" na página do evento (0013). */
  lastUnitsNotice?: boolean;
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
  if (input.lastUnitsNotice !== undefined) out.lastUnitsNotice = input.lastUnitsNotice;
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
  lastUnitsNotice: t.lastUnitsNotice,
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
          lastUnitsNotice: data.lastUnitsNotice ?? true,
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
      // Todo tipo nasce com um lote (0013): o "Lote único", com o preço e a capacidade do tipo, já à venda. Para vender em lotes,
      // reduza a quantidade dele e crie os próximos.
      await tx.insert(ticketLots).values({
        ticketTypeId: created!.id,
        eventId,
        position: 1,
        name: 'Lote único',
        priceCents: created!.priceCents,
        quantity: created!.quantityTotal,
        status: 'a_venda',
        createdAt: now,
        updatedAt: now,
      });
      return created!;
    });
    return (await viewTypes(deps.db, [row], now))[0]!;
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
      // Lotes (0013): o preço mora no lote, e a capacidade do tipo é o teto da soma deles. Tipo de lote único: o lote acompanha.
      const typeLots = (await lotsByType(tx, [typeId])).get(typeId) ?? [];
      const only = typeLots.length === 1 ? typeLots[0]! : null;
      if (data.priceCents !== undefined && data.priceCents !== before.priceCents) {
        if (typeLots.length > 1)
          throw new AppError(409, 'preco_no_lote', 'Este tipo vende em lotes: mude o preço no lote.');
        if (only && only.quantitySold > 0)
          throw new AppError(
            409,
            'lote_com_vendas',
            'O lote já tem vendas e o preço dele não pode mudar. Crie um novo lote com o preço novo.',
          );
      }
      if (data.quantityTotal !== undefined && typeLots.length > 1) {
        const planned = typeLots.reduce((t, l) => t + l.quantity, 0);
        if (data.quantityTotal < planned)
          throw new AppError(
            409,
            'capacidade_abaixo_dos_lotes',
            `A capacidade não pode ser menor que a soma dos lotes (${planned}). Reduza a quantidade de um lote antes.`,
            { lotes: planned },
          );
      }
      if (only && (data.priceCents !== undefined || data.quantityTotal !== undefined)) {
        await tx
          .update(ticketLots)
          .set({
            ...(data.priceCents !== undefined ? { priceCents: data.priceCents } : {}),
            ...(data.quantityTotal !== undefined ? { quantity: data.quantityTotal } : {}),
            updatedAt: now,
          })
          .where(eq(ticketLots.id, only.id));
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
      return { row: after! };
    });
    return (await viewTypes(deps.db, [result.row], now))[0]!;
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
  return { event, ticketTypes: await viewTypes(deps.db, types, now) };
}

// ---------- promoters (RF-18, CA-10; desconto D-91) ----------

export type PromoterRow = typeof promoters.$inferSelect;
type DiscountKindValue = PromoterRow['discountKind'];

/** Promoter como o painel recebe: a linha, os eventos do desconto e os usos (pedidos pagos e pendentes que seguram um uso). */
export interface PromoterView extends PromoterRow {
  discountEventIds: string[];
  discountUses: { paid: number; pending: number };
}

const promoterSnapshot = (p: PromoterRow, eventIds: string[]) => ({
  name: p.name,
  couponCode: p.couponCode,
  phone: p.phone,
  isActive: p.isActive,
  discount: {
    kind: p.discountKind,
    value: p.discountValue,
    scope: p.discountScope,
    eventIds: [...eventIds].sort(),
    startsOn: p.discountStartsOn,
    endsOn: p.discountEndsOn,
    maxUses: p.discountMaxUses,
  },
});

export interface PromoterInput {
  name: string;
  couponCode: string;
  phone?: string | null;
  isActive?: boolean;
  /** Desconto (D-91). Sem estes campos, o promoter fica (ou continua) como estava; `nenhum` limpa o resto. */
  discountKind?: DiscountKindValue;
  /** Porcentagem em centésimos de ponto percentual (100 a 10000) ou valor fixo em centavos. */
  discountValue?: number | null;
  discountScope?: 'todos' | 'eventos';
  discountEventIds?: string[];
  /** AAAA-MM-DD, dias do fuso do evento, incluídos. */
  discountStartsOn?: string | null;
  discountEndsOn?: string | null;
  discountMaxUses?: number | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: string) => DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d);

function checkPromoter(input: Partial<PromoterInput>, required: boolean) {
  const errors: FieldError[] = [];
  const out: Partial<Pick<PromoterInput, 'name' | 'couponCode' | 'phone' | 'isActive'>> = {};
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
  return { out, errors };
}

const DISCOUNT_KEYS = [
  'discountKind',
  'discountValue',
  'discountScope',
  'discountEventIds',
  'discountStartsOn',
  'discountEndsOn',
  'discountMaxUses',
] as const;
const touchesDiscount = (input: Partial<PromoterInput>) => DISCOUNT_KEYS.some(k => input[k] !== undefined);

interface DiscountFields {
  discountKind: DiscountKindValue;
  discountValue: number | null;
  discountScope: 'todos' | 'eventos';
  discountStartsOn: string | null;
  discountEndsOn: string | null;
  discountMaxUses: number | null;
}

/**
 * Confere o desconto inteiro (D-91), já somado ao que estava gravado (`current`), porque os campos dependem uns dos outros. `nenhum`
 * limpa valor, alcance, eventos, datas e limite. Os eventos escolhidos precisam existir.
 */
async function checkDiscount(
  db: Db | Tx,
  input: Partial<PromoterInput>,
  current: { fields: DiscountFields; eventIds: string[] },
  errors: FieldError[],
): Promise<{ fields: DiscountFields; eventIds: string[] }> {
  const kind = input.discountKind ?? current.fields.discountKind;
  if (!['nenhum', 'percentual', 'fixo'].includes(kind)) {
    errors.push({ campo: 'discountKind', mensagem: 'Escolha: sem desconto, porcentagem ou valor fixo.' });
    return current;
  }
  if (kind === 'nenhum')
    return {
      fields: {
        discountKind: 'nenhum',
        discountValue: null,
        discountScope: 'todos',
        discountStartsOn: null,
        discountEndsOn: null,
        discountMaxUses: null,
      },
      eventIds: [],
    };
  // Trocar o tipo sem mandar o valor não aproveita o valor antigo (porcentagem e centavos não se misturam).
  const value =
    input.discountValue !== undefined ? input.discountValue : kind === current.fields.discountKind ? current.fields.discountValue : null;
  if (value === null || !validDiscountRule({ kind, value }))
    errors.push({
      campo: 'discountValue',
      mensagem:
        kind === 'percentual'
          ? 'Informe uma porcentagem de 1 a 100, com até 2 casas depois da vírgula.'
          : 'Informe um valor de R$ 0,01 a R$ 100.000,00.',
    });
  const scope = input.discountScope ?? current.fields.discountScope;
  if (scope !== 'todos' && scope !== 'eventos') errors.push({ campo: 'discountScope', mensagem: 'Escolha onde o desconto vale.' });
  let eventIds = scope === 'eventos' ? [...new Set(input.discountEventIds ?? current.eventIds)] : [];
  if (scope === 'eventos') {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (eventIds.length === 0) errors.push({ campo: 'discountEventIds', mensagem: 'Escolha ao menos um evento.' });
    else if (eventIds.length > 200 || !eventIds.every(id => uuidRe.test(id)))
      errors.push({ campo: 'discountEventIds', mensagem: 'Algum evento escolhido não existe.' });
    else {
      const found = await db.select({ id: events.id }).from(events).where(inArray(events.id, eventIds));
      if (found.length !== eventIds.length) errors.push({ campo: 'discountEventIds', mensagem: 'Algum evento escolhido não existe.' });
    }
  } else eventIds = [];
  const startsOn = input.discountStartsOn !== undefined ? input.discountStartsOn || null : current.fields.discountStartsOn;
  const endsOn = input.discountEndsOn !== undefined ? input.discountEndsOn || null : current.fields.discountEndsOn;
  if (startsOn !== null && !validDate(startsOn)) errors.push({ campo: 'discountStartsOn', mensagem: 'Informe uma data válida.' });
  if (endsOn !== null && !validDate(endsOn)) errors.push({ campo: 'discountEndsOn', mensagem: 'Informe uma data válida.' });
  if (startsOn && endsOn && validDate(startsOn) && validDate(endsOn) && endsOn < startsOn)
    errors.push({ campo: 'discountEndsOn', mensagem: 'A data de fim precisa ser igual ou depois da de início.' });
  const maxUses = input.discountMaxUses !== undefined ? input.discountMaxUses : current.fields.discountMaxUses;
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1_000_000))
    errors.push({ campo: 'discountMaxUses', mensagem: 'Informe um limite de 1 ou mais, ou deixe vazio para não ter limite.' });
  return {
    fields: { discountKind: kind, discountValue: value, discountScope: scope, discountStartsOn: startsOn, discountEndsOn: endsOn, discountMaxUses: maxUses },
    eventIds,
  };
}

const NO_DISCOUNT: { fields: DiscountFields; eventIds: string[] } = {
  fields: {
    discountKind: 'nenhum',
    discountValue: null,
    discountScope: 'todos',
    discountStartsOn: null,
    discountEndsOn: null,
    discountMaxUses: null,
  },
  eventIds: [],
};

async function discountEventIdsOf(db: Db | Tx, promoterId: string): Promise<string[]> {
  const rows = await db
    .select({ eventId: promoterDiscountEvents.eventId })
    .from(promoterDiscountEvents)
    .where(eq(promoterDiscountEvents.promoterId, promoterId));
  return rows.map(r => r.eventId).sort();
}

async function saveDiscountEvents(tx: Tx, promoterId: string, eventIds: string[]) {
  await tx.delete(promoterDiscountEvents).where(eq(promoterDiscountEvents.promoterId, promoterId));
  if (eventIds.length) await tx.insert(promoterDiscountEvents).values(eventIds.map(eventId => ({ promoterId, eventId })));
}

function promoterConflict(error: unknown): never {
  if (pgError(error).code === '23505') {
    throw invalid([{ campo: 'couponCode', mensagem: 'Este código já é de outro promoter. Escolha outro.' }]);
  }
  throw error;
}

/** Usos do desconto de cada promoter: pedidos com desconto já pagos, e os pendentes que ainda seguram um uso dentro da reserva. */
async function discountUses(db: Db | Tx, now: Date, promoterId?: string) {
  const rows = await db.execute<{ promoter_id: string; paid: number; pending: number }>(sql`
    select o.promoter_id,
           count(*) filter (where o.paid_at is not null)::int as paid,
           count(*) filter (where o.paid_at is null and exists (
             select 1 from reservations r where r.order_id = o.id and r.status = 'ativa' and r.expires_at > ${now}))::int as pending
      from orders o
     where o.discount_kind is not null ${promoterId ? sql`and o.promoter_id = ${promoterId}` : sql``}
     group by o.promoter_id`);
  return new Map(rows.rows.map(r => [r.promoter_id, { paid: r.paid, pending: r.pending }]));
}

async function promoterView(db: Db | Tx, p: PromoterRow, now: Date): Promise<PromoterView> {
  const uses = await discountUses(db, now, p.id);
  return { ...p, discountEventIds: await discountEventIdsOf(db, p.id), discountUses: uses.get(p.id) ?? { paid: 0, pending: 0 } };
}

export async function listPromoters(deps: EventsDeps): Promise<PromoterView[]> {
  const rows = await deps.db.select().from(promoters).orderBy(asc(promoters.name), asc(promoters.id));
  const links = await deps.db.select().from(promoterDiscountEvents);
  const uses = await discountUses(deps.db, deps.clock.now());
  return rows.map(p => ({
    ...p,
    discountEventIds: links
      .filter(l => l.promoterId === p.id)
      .map(l => l.eventId)
      .sort(),
    discountUses: uses.get(p.id) ?? { paid: 0, pending: 0 },
  }));
}

export async function createPromoter(deps: EventsDeps, actor: Actor, input: PromoterInput): Promise<PromoterView> {
  const { out: data, errors } = checkPromoter(input, true);
  const now = deps.clock.now();
  const discount = touchesDiscount(input) ? await checkDiscount(deps.db, input, NO_DISCOUNT, errors) : NO_DISCOUNT;
  if (errors.length) throw invalid(errors);
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
          ...discount.fields,
        })
        .returning();
      await saveDiscountEvents(tx, created!.id, discount.eventIds);
      await writeAudit(tx, {
        actorId: actor.id,
        action: 'promoter.criar',
        entity: 'promoter',
        entityId: created!.id,
        before: null,
        after: promoterSnapshot(created!, discount.eventIds),
        at: now,
      });
      return promoterView(tx, created!, now);
    });
  } catch (error) {
    return promoterConflict(error);
  }
}

/**
 * Edita o promoter. Mudar o desconto vale para os pedidos NOVOS: cada pedido guarda o código e o desconto que recebeu (D-91). A trilha
 * registra o antes e o depois, com o desconto inteiro (`promoter.desconto` quando só o desconto mudou).
 */
export async function updatePromoter(deps: EventsDeps, actor: Actor, id: string, input: Partial<PromoterInput>): Promise<PromoterView> {
  const { out: data, errors } = checkPromoter(input, false);
  const now = deps.clock.now();
  try {
    return await deps.db.transaction(async tx => {
      const [before] = await tx.select().from(promoters).where(eq(promoters.id, id)).limit(1).for('update');
      if (!before) throw notFound('Promoter');
      const beforeEvents = await discountEventIdsOf(tx, id);
      const discount = touchesDiscount(input)
        ? await checkDiscount(
            tx,
            input,
            {
              fields: {
                discountKind: before.discountKind,
                discountValue: before.discountValue,
                discountScope: before.discountScope,
                discountStartsOn: before.discountStartsOn,
                discountEndsOn: before.discountEndsOn,
                discountMaxUses: before.discountMaxUses,
              },
              eventIds: beforeEvents,
            },
            errors,
          )
        : null;
      if (errors.length) throw invalid(errors);
      const [after] = await tx
        .update(promoters)
        .set({ ...data, ...(discount?.fields ?? {}) })
        .where(eq(promoters.id, id))
        .returning();
      const afterEvents = discount ? discount.eventIds : beforeEvents;
      if (discount) await saveDiscountEvents(tx, id, afterEvents);
      const snapBefore = promoterSnapshot(before, beforeEvents);
      const snapAfter = promoterSnapshot(after!, afterEvents);
      const onlyDiscount =
        JSON.stringify(snapBefore.discount) !== JSON.stringify(snapAfter.discount) &&
        JSON.stringify({ ...snapBefore, discount: null }) === JSON.stringify({ ...snapAfter, discount: null });
      await writeAudit(tx, {
        actorId: actor.id,
        action: before.isActive && data.isActive === false ? 'promoter.desativar' : onlyDiscount ? 'promoter.desconto' : 'promoter.editar',
        entity: 'promoter',
        entityId: id,
        before: snapBefore,
        after: snapAfter,
        at: now,
      });
      return promoterView(tx, after!, now);
    });
  } catch (error) {
    return promoterConflict(error);
  }
}
