import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, orders, ticketTypes, tickets } from '../db/schema';
import { AppError } from '../domain/errors';
import { verifyQr, type QrKeys } from '../domain/ticketCode';

/** Dados do evento que o comprador vê no ingresso. */
export interface TicketEvent {
  slug: string;
  name: string;
  startsAt: string;
  venue: string;
  address: string;
  ageRating: string;
}

/** Item de lista: **sem** o código secreto e sem o conteúdo do QR (nunca aparecem em lista). */
export interface TicketSummary {
  id: string;
  orderId: string;
  orderNumber: number;
  event: TicketEvent;
  typeName: string;
  holderName: string;
  shortCode: string;
  status: 'valido' | 'utilizado' | 'cancelado';
  usedAt: string | null;
}

/** Detalhe: inclui o conteúdo do QR, **só** para ingresso válido ou já usado (cancelado não mostra QR). */
export interface TicketDetail extends TicketSummary {
  qrPayload: string | null;
}

const columns = {
  id: tickets.id,
  orderId: tickets.orderId,
  orderNumber: orders.number,
  holderName: tickets.holderName,
  shortCode: tickets.shortCode,
  status: tickets.status,
  usedAt: tickets.usedAt,
  qrPayload: tickets.qrPayload,
  unitIndex: tickets.unitIndex,
  typeName: ticketTypes.name,
  slug: events.slug,
  eventName: events.name,
  startsAt: events.startsAt,
  venue: events.venue,
  address: events.address,
  ageRating: events.ageRating,
};

type Row = {
  id: string;
  orderId: string;
  orderNumber: number;
  holderName: string;
  shortCode: string;
  status: 'valido' | 'utilizado' | 'cancelado';
  usedAt: Date | null;
  qrPayload: string;
  typeName: string;
  slug: string;
  eventName: string;
  startsAt: Date;
  venue: string;
  address: string;
  ageRating: string;
};

const summary = (r: Row): TicketSummary => ({
  id: r.id,
  orderId: r.orderId,
  orderNumber: r.orderNumber,
  event: {
    slug: r.slug,
    name: r.eventName,
    startsAt: r.startsAt.toISOString(),
    venue: r.venue,
    address: r.address,
    ageRating: r.ageRating,
  },
  typeName: r.typeName,
  holderName: r.holderName,
  shortCode: r.shortCode,
  status: r.status,
  usedAt: r.usedAt?.toISOString() ?? null,
});

const base = (db: Db) =>
  db
    .select(columns)
    .from(tickets)
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .innerJoin(events, eq(events.id, tickets.eventId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId));

/** Meus ingressos (RF-42): só os do próprio comprador, do evento mais próximo ao mais distante. */
export async function listMyTickets(db: Db, userId: string): Promise<TicketSummary[]> {
  const rows = await base(db)
    .where(eq(orders.userId, userId))
    .orderBy(asc(events.startsAt), desc(orders.number), asc(tickets.unitIndex));
  return (rows as Row[]).map(summary);
}

/** Um ingresso do comprador. De outro usuário: 404, como se não existisse. */
export async function getMyTicket(db: Db, userId: string, ticketId: string): Promise<TicketDetail> {
  const [row] = await base(db)
    .where(and(eq(tickets.id, ticketId), eq(orders.userId, userId)))
    .limit(1);
  if (!row) throw new AppError(404, 'nao_encontrado', 'Ingresso não encontrado.');
  const r = row as Row;
  return { ...summary(r), qrPayload: r.status === 'cancelado' ? null : r.qrPayload };
}

/** Todos os ingressos de um pedido do comprador, na ordem das unidades. Pedido de outro: 404. */
export async function getMyOrderTickets(db: Db, userId: string, orderId: string): Promise<TicketDetail[]> {
  const [own] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  if (!own) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');
  const rows = await base(db)
    .where(eq(tickets.orderId, orderId))
    .orderBy(asc(ticketTypes.name), asc(tickets.unitIndex));
  return (rows as Row[]).map(r => ({ ...summary(r), qrPayload: r.status === 'cancelado' ? null : r.qrPayload }));
}

export type QrLookup =
  | {
      ok: true;
      ticket: {
        id: string;
        eventId: string;
        status: 'valido' | 'utilizado' | 'cancelado';
        typeName: string;
        holderName: string;
        shortCode: string;
        usedAt: Date | null;
      };
    }
  | { ok: false; reason: 'formato' | 'versao_desconhecida' | 'assinatura' | 'desconhecido' };

/**
 * Lê um QR (CA-22): confere a assinatura com a chave da versão indicada, depois procura o ingresso pelo código e confere
 * que o evento do ingresso é o evento assinado. Qualquer caractere alterado dá `ok: false`. É a base da portaria (Prompt 15),
 * que decide a cor da tela e faz a marcação de uso em transação própria.
 */
export async function lookupByQr(deps: { db: Db; keys: QrKeys }, payload: string): Promise<QrLookup> {
  const check = verifyQr(deps.keys, payload);
  if (!check.ok) return check;
  const [row] = await deps.db
    .select({
      id: tickets.id,
      eventId: tickets.eventId,
      status: tickets.status,
      typeName: ticketTypes.name,
      holderName: tickets.holderName,
      shortCode: tickets.shortCode,
      usedAt: tickets.usedAt,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(eq(tickets.code, check.code))
    .limit(1);
  if (!row || row.eventId !== check.eventId) return { ok: false, reason: 'desconhecido' };
  return { ok: true, ticket: row };
}
