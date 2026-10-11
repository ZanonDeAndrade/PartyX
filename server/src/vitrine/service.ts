import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, ticketTypes } from '../db/schema';
import { availableQuantity, salesState } from '../domain/events';
import { AppError } from '../domain/errors';
import { dateKeyInEventZone } from '../domain/time';
import { eventSale, searchKey, TYPE_LABEL, typeNote, VISIBLE_AFTER_START_MS, type EventSale } from '../domain/vitrine';
import { reservedByType } from '../events/service';
import { bannerSrcSet, shareImageUrl } from '../media/banner';
import type { Clock } from '../providers/clock';

export interface VitrineDeps {
  db: Db;
  clock: Clock;
}

type EventRow = typeof events.$inferSelect;

/** O que a vitrine mostra de um evento na lista. Sem id interno de evento, sem estoque exato. */
export interface PublicEventCard {
  slug: string;
  name: string;
  startsAt: string;
  venue: string;
  ageRating: string;
  bannerUrl: string | null;
  /** Versões do banner por largura (`srcset`), para o celular baixar a menor. Nulo: só `bannerUrl`. */
  bannerSrcSet: string | null;
  isFeatured: boolean;
  sale: { kind: EventSale['kind']; label: string; minPriceCents: number | null; startsAt: string | null };
}

export interface PublicTicketType {
  id: string;
  name: string;
  priceCents: number;
  state: ReturnType<typeof salesState>;
  label: string;
  note: string;
  /** Só `a_venda` permite escolher quantidade. A conferência definitiva é a do checkout. */
  canBuy: boolean;
}

export interface PublicEventDetail extends PublicEventCard {
  address: string;
  description: string;
  attractions: string[];
  /** Imagem 1200x630 para pré-visualização em redes sociais; nula se não houver banner. */
  shareImageUrl: string | null;
  ticketTypes: PublicTicketType[];
}

async function load(deps: VitrineDeps, rows: EventRow[]) {
  const now = deps.clock.now();
  if (rows.length === 0) return { now, byEvent: new Map<string, ReturnType<typeof inputOf>[]>() };
  const types = await deps.db
    .select()
    .from(ticketTypes)
    .where(
      inArray(
        ticketTypes.eventId,
        rows.map(r => r.id),
      ),
    )
    .orderBy(asc(ticketTypes.salesStartAt), asc(ticketTypes.priceCents), asc(ticketTypes.name));
  const reserved = await reservedByType(
    deps.db,
    types.map(t => t.id),
    now,
  );
  const byEvent = new Map<string, ReturnType<typeof inputOf>[]>();
  for (const t of types) {
    const list = byEvent.get(t.eventId) ?? [];
    list.push(inputOf(t, reserved.get(t.id) ?? 0));
    byEvent.set(t.eventId, list);
  }
  return { now, byEvent };
}

function inputOf(t: typeof ticketTypes.$inferSelect, reserved: number) {
  return {
    id: t.id,
    name: t.name,
    priceCents: t.priceCents,
    isActive: t.isActive,
    salesStartAt: t.salesStartAt,
    salesEndAt: t.salesEndAt,
    quantityTotal: t.quantityTotal,
    quantitySold: t.quantitySold,
    quantityReserved: reserved,
  };
}

function card(e: EventRow, types: ReturnType<typeof inputOf>[], now: Date): PublicEventCard & { _sale: EventSale } {
  const sale = eventSale(e.status, types, now);
  return {
    slug: e.slug,
    name: e.name,
    startsAt: e.startsAt.toISOString(),
    venue: e.venue,
    ageRating: e.ageRating,
    bannerUrl: e.bannerUrl,
    bannerSrcSet: bannerSrcSet(e.bannerUrl, e.bannerWidths),
    isFeatured: e.isFeatured,
    sale: {
      kind: sale.kind,
      label: sale.label,
      minPriceCents: sale.minPriceCents ?? null,
      startsAt: sale.startsAt?.toISOString() ?? null,
    },
    _sale: sale,
  };
}
const strip = ({ _sale, ...rest }: ReturnType<typeof card>): PublicEventCard => rest;

/** Eventos publicados e ainda dentro da janela de exibição, do mais próximo ao mais distante. */
async function visibleRows(deps: VitrineDeps) {
  const since = new Date(deps.clock.now().getTime() - VISIBLE_AFTER_START_MS);
  return deps.db
    .select()
    .from(events)
    .where(and(eq(events.status, 'publicado'), gt(events.startsAt, since)))
    .orderBy(asc(events.startsAt), asc(events.id));
}

/** Página inicial (RF-20): destaques e próximos eventos. Eventos sem venda em andamento não entram. */
export async function home(deps: VitrineDeps) {
  const rows = await visibleRows(deps);
  const { now, byEvent } = await load(deps, rows);
  const cards = rows.map(e => card(e, byEvent.get(e.id) ?? [], now)).filter(c => c._sale.kind !== 'closed');
  return {
    featured: cards.filter(c => c.isFeatured && c._sale.kind === 'open').map(strip),
    upcoming: cards.map(strip),
  };
}

export interface SearchInput {
  q?: string;
  /** AAAA-MM-DD, no fuso do evento. */
  date?: string;
}

/**
 * Listagem e busca (RF-21, RF-22, CA-12). A busca ignora acento e maiúsculas e acha por parte do nome.
 * Sem filtro, só entram eventos com venda em andamento ou por começar; com filtro, entram também os esgotados e encerrados as vendas,
 * para quem procura um evento específico encontrar a página dele.
 */
export async function search(deps: VitrineDeps, input: SearchInput) {
  const q = searchKey(input.q ?? '');
  if (q.length > 100)
    throw new AppError(422, 'dados_invalidos', 'A busca é longa demais.', [
      { campo: 'q', mensagem: 'Use até 100 caracteres.' },
    ]);
  if (input.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new AppError(422, 'dados_invalidos', 'Data inválida.', [
      { campo: 'date', mensagem: 'Use o formato AAAA-MM-DD.' },
    ]);
  }
  const filtering = Boolean(q || input.date);
  const rows = await visibleRows(deps);
  const { now, byEvent } = await load(deps, rows);
  const items = rows
    .filter(e => !q || searchKey(e.name).includes(q))
    .filter(e => !input.date || dateKeyInEventZone(e.startsAt) === input.date)
    .map(e => card(e, byEvent.get(e.id) ?? [], now))
    .filter(c => filtering || c._sale.kind !== 'closed')
    .map(strip);
  return { events: items, filtering };
}

/** Página do evento pelo endereço (RF-23, RF-24, RF-25, RF-27). Rascunho não existe para o público; encerrado continua acessível. */
export async function bySlug(deps: VitrineDeps, slug: string): Promise<PublicEventDetail> {
  const [row] = await deps.db.select().from(events).where(eq(events.slug, slug)).limit(1);
  if (!row || row.status === 'rascunho') throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
  return detail(deps, row, false);
}

/**
 * Pré-visualização para o administrador (ADM03): a mesma página pública, montada pelo id e em qualquer estado, inclusive rascunho.
 * Nada fica à venda nela (`canBuy` falso): é só para conferir texto, banner e tipos antes de publicar.
 */
export async function previewById(
  deps: VitrineDeps,
  id: string,
): Promise<PublicEventDetail & { status: EventRow['status'] }> {
  const [row] = await deps.db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!row) throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
  return { ...(await detail(deps, row, true)), status: row.status };
}

async function detail(deps: VitrineDeps, row: EventRow, preview: boolean): Promise<PublicEventDetail> {
  const { now, byEvent } = await load(deps, [row]);
  const types = byEvent.get(row.id) ?? [];
  const base = strip(card(row, types, now));
  const ended = row.status === 'encerrado';
  return {
    ...base,
    address: row.address,
    description: row.description,
    attractions: row.attractions,
    shareImageUrl: row.bannerUrl ? shareImageUrl(row.bannerUrl) : null,
    ticketTypes: types.map(t => {
      // Em evento encerrado nada está à venda, qualquer que seja o período do tipo.
      const state = ended && salesState(t, now) === 'a_venda' ? 'encerrada' : salesState(t, now);
      return {
        id: t.id,
        name: t.name,
        priceCents: t.priceCents,
        state,
        label: TYPE_LABEL[state],
        note: typeNote(state, t),
        canBuy: !preview && state === 'a_venda' && availableQuantity(t) > 0,
      };
    }),
  };
}
