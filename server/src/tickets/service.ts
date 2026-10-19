import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  events,
  orderItemLots,
  orderItems,
  orders,
  ticketLots,
  ticketTransfers,
  ticketTypes,
  tickets,
  users,
} from '../db/schema';
import { typeWithLotName } from '../events/lots';
import { AppError } from '../domain/errors';
import { maskName } from '../domain/identity';
import { verifyQr, type QrKeys } from '../domain/ticketCode';
import { minorTermPendingSql, TRANSFER_DEADLINE_MS } from './transfer';

/** Dados do evento que o comprador vê no ingresso. */
export interface TicketEvent {
  slug: string;
  name: string;
  startsAt: string;
  venue: string;
  address: string;
  ageRating: string;
  /** Evento que permite menores de 16 e 17 anos: a tela oferece a autorização do pedido. */
  allowsMinors: boolean;
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
  /** Recebido numa transferência (D-87): quem transferiu, mascarado, e quando. Nulo no ingresso que continua com quem comprou. */
  receivedFrom: { name: string; at: string } | null;
  /** Até quando pode ser transferido: 2 horas antes do início do evento. */
  transferUntil: string;
  /** Recebido com 16 ou 17 anos e o Termo de Ciência ainda não aceito: o QR e o PDF esperam o aceite. */
  minorTermPending: boolean;
  /** Preço do lote de onde ele saiu, o desconto do promoter nele (D-91) e a taxa de serviço dele (D-90; zero nos pedidos anteriores). */
  priceCents: number;
  discountCents: number;
  serviceFeeCents: number;
}

/**
 * Detalhe: inclui o conteúdo do QR, **só** para ingresso válido ou já usado (cancelado não mostra QR) e cujo titular não tem o Termo
 * de Ciência pendente.
 */
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
  // "Pista · 2º lote" (0013); "Lote único" e ingresso anterior aos lotes: só o tipo.
  typeName: typeWithLotName,
  slug: events.slug,
  eventName: events.name,
  startsAt: events.startsAt,
  venue: events.venue,
  address: events.address,
  ageRating: events.ageRating,
  allowsMinors: events.allowsMinors,
  buyerId: orders.userId,
  holderUserId: tickets.holderUserId,
  minorTermPending: minorTermPendingSql,
  // Preço e taxa presos no lote do item (0013, 0017). Sem a linha do lote (tipo sem lotes), o do item: sem lote a taxa é a mesma em
  // todas as unidades, então a do item dividida pela quantidade é exata.
  priceCents: sql<number>`coalesce(${orderItemLots.unitPriceCents}, ${orderItems.unitPriceCents})`.mapWith(Number),
  serviceFeeCents: sql<number>`coalesce(${orderItemLots.unitServiceFeeCents}, ${orderItems.serviceFeeCents} / ${orderItems.quantity})`.mapWith(Number),
  discountCents: sql<number>`coalesce(${orderItemLots.unitDiscountCents}, ${orderItems.discountCents} / ${orderItems.quantity})`.mapWith(Number),
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
  allowsMinors: boolean;
  buyerId: string;
  holderUserId: string;
  minorTermPending: boolean;
  priceCents: number;
  serviceFeeCents: number;
  discountCents: number;
};

type Received = Map<string, { name: string; at: string }>;

/** Quem passou cada ingresso recebido para o titular atual (a última transferência para ele), mascarado. */
async function receivedFrom(db: Db, rows: Row[]): Promise<Received> {
  const ids = rows.filter(r => r.holderUserId !== r.buyerId).map(r => r.id);
  const out: Received = new Map();
  if (ids.length === 0) return out;
  const found = await db
    .selectDistinctOn([ticketTransfers.ticketId], {
      ticketId: ticketTransfers.ticketId,
      name: users.name,
      at: ticketTransfers.createdAt,
    })
    .from(ticketTransfers)
    .innerJoin(tickets, and(eq(tickets.id, ticketTransfers.ticketId), eq(tickets.holderUserId, ticketTransfers.toUserId)))
    .innerJoin(users, eq(users.id, ticketTransfers.fromUserId))
    .where(inArray(ticketTransfers.ticketId, ids))
    .orderBy(ticketTransfers.ticketId, desc(ticketTransfers.createdAt));
  for (const f of found) out.set(f.ticketId, { name: maskName(f.name), at: f.at.toISOString() });
  return out;
}

const summary = (r: Row, from?: Received): TicketSummary => ({
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
    allowsMinors: r.allowsMinors,
  },
  typeName: r.typeName,
  holderName: r.holderName,
  shortCode: r.shortCode,
  status: r.status,
  usedAt: r.usedAt?.toISOString() ?? null,
  receivedFrom: from?.get(r.id) ?? null,
  transferUntil: new Date(r.startsAt.getTime() - TRANSFER_DEADLINE_MS).toISOString(),
  minorTermPending: r.minorTermPending,
  priceCents: r.priceCents,
  discountCents: r.discountCents,
  serviceFeeCents: r.serviceFeeCents,
});

/** QR só de ingresso que não está cancelado e cujo titular não tem o Termo de Ciência pendente. */
const qrOf = (r: Row) => (r.status === 'cancelado' || r.minorTermPending ? null : r.qrPayload);

const base = (db: Db) =>
  db
    .select(columns)
    .from(tickets)
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .innerJoin(events, eq(events.id, tickets.eventId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .leftJoin(ticketLots, eq(ticketLots.id, tickets.lotId))
    .innerJoin(orderItems, eq(orderItems.id, tickets.orderItemId))
    .leftJoin(orderItemLots, and(eq(orderItemLots.orderItemId, tickets.orderItemId), eq(orderItemLots.lotId, tickets.lotId)));

/**
 * Meus ingressos (RF-42): os que estão na conta, comprados ou recebidos numa transferência (D-87), do evento mais próximo ao mais
 * distante. O que esta conta transferiu sai daqui.
 */
export async function listMyTickets(db: Db, userId: string): Promise<TicketSummary[]> {
  const rows = (await base(db)
    .where(eq(tickets.holderUserId, userId))
    .orderBy(asc(events.startsAt), desc(orders.number), asc(tickets.unitIndex))) as Row[];
  const from = await receivedFrom(db, rows);
  return rows.map(r => summary(r, from));
}

/** Um ingresso da conta. De outra conta (inclusive o que esta conta transferiu): 404, como se não existisse. */
export async function getMyTicket(db: Db, userId: string, ticketId: string): Promise<TicketDetail> {
  const [row] = await base(db)
    .where(and(eq(tickets.id, ticketId), eq(tickets.holderUserId, userId)))
    .limit(1);
  if (!row) throw new AppError(404, 'nao_encontrado', 'Ingresso não encontrado.');
  const r = row as Row;
  return { ...summary(r, await receivedFrom(db, [r])), qrPayload: qrOf(r) };
}

/**
 * Os ingressos de um pedido do comprador que continuam com ele, na ordem das unidades. Os transferidos ficam de fora (o QR é de
 * outra pessoa; a página do pedido os mostra por `transferredOutOfOrder`). Pedido de outro: 404.
 */
export async function getMyOrderTickets(db: Db, userId: string, orderId: string): Promise<TicketDetail[]> {
  const [own] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  if (!own) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');
  const rows = await base(db)
    .where(and(eq(tickets.orderId, orderId), eq(tickets.holderUserId, userId)))
    .orderBy(asc(ticketTypes.name), asc(tickets.unitIndex));
  return (rows as Row[]).map(r => ({ ...summary(r), qrPayload: qrOf(r) }));
}

/**
 * Ingressos do pedido que saíram da conta do comprador (D-87): para quem ele transferiu, mascarado, e quando. Se o ingresso passou
 * adiante depois, o comprador continua vendo só a pessoa para quem ele transferiu.
 */
export async function transferredOutOfOrder(
  db: Db,
  buyerId: string,
  orderId: string,
): Promise<{ typeName: string; to: string; at: string }[]> {
  const rows = await db
    .selectDistinctOn([tickets.id], {
      ticketId: tickets.id,
      typeName: typeWithLotName,
      to: users.name,
      at: ticketTransfers.createdAt,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .leftJoin(ticketLots, eq(ticketLots.id, tickets.lotId))
    .innerJoin(ticketTransfers, and(eq(ticketTransfers.ticketId, tickets.id), eq(ticketTransfers.fromUserId, buyerId)))
    .innerJoin(users, eq(users.id, ticketTransfers.toUserId))
    .where(and(eq(tickets.orderId, orderId), ne(tickets.holderUserId, buyerId)))
    .orderBy(tickets.id, desc(ticketTransfers.createdAt));
  return rows
    .map(r => ({ typeName: r.typeName as string, to: maskName(r.to), at: r.at.toISOString() }))
    .sort((a, b) => a.at.localeCompare(b.at));
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
