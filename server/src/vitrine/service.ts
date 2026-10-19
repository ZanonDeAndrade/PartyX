import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, ticketTypes } from '../db/schema';
import { availableQuantity, salesState, type SalesState } from '../domain/events';
import { lastUnits, lotSalesState, typeLotsView, type Lot, type TypeLotsView } from '../domain/lots';
import { previewTypes } from '../events/lots';
import { AppError } from '../domain/errors';
import {
  countdownLiveUntil,
  eventSale,
  searchKey,
  TYPE_LABEL,
  typeNote,
  VISIBLE_AFTER_START_MS,
  type EventSale,
} from '../domain/vitrine';
import { reservedByType } from '../events/service';
import { bannerSrcSet, shareImageUrl } from '../media/banner';
import type { Clock } from '../providers/clock';
import { unitServiceFee } from '../domain/serviceFee';
import { currentServiceFee } from '../settings/serviceFee';

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
  /** Miniatura da capa em `data:` (0015), mostrada desfocada até a capa nítida chegar. Nula: capa anterior ou sem capa. */
  bannerPlaceholder: string | null;
  isFeatured: boolean;
  sale: { kind: EventSale['kind']; label: string; minPriceCents: number | null; startsAt: string | null };
  /** Cor de destaque (`#RRGGBB`) ou nula (o roxo da PartyX). Na vitrine, só o bloco da data usa; na página, o destaque inteiro. */
  accentColor: string | null;
}

export interface PublicTicketType {
  id: string;
  name: string;
  /** Preço do lote à venda. Nulo quando nenhum lote está à venda (o do próximo não aparece antes de ele abrir). */
  priceCents: number | null;
  /** Taxa de serviço de cada ingresso a esse preço (D-90). Zero: a página não mostra taxa. Nula junto com o preço. */
  serviceFeeCents: number | null;
  /** Lote à venda, quando o tipo vende em lotes (mais de um). Tipo de lote único: nulo, como antes dos lotes. */
  lot: { name: string; position: number } | null;
  /** Unidades que ainda restam no lote à venda, quando há próximo lote (para avisar que o excedente sai do próximo). */
  lotRemaining: number | null;
  /** "Últimas unidades deste lote" (se ligado no tipo). */
  lastUnits: boolean;
  /** "Próximo lote: em breve" (sem o preço). */
  nextLot: boolean;
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
  /** Fim previsto, quando informado. */
  endsAt: string | null;
  /**
   * Regras de menores (14/10/2026): `true` = entra quem terá 16 ou 17 anos na data do evento, com o termo de autorização (a página
   * oferece o PDF em branco para acompanhantes); `false` = só 18 anos ou mais na data do evento.
   */
  allowsMinors: boolean;
  /** Imagem 1200x630 para pré-visualização em redes sociais; nula se não houver banner. */
  shareImageUrl: string | null;
  ticketTypes: PublicTicketType[];
  /**
   * Cronômetro até o início (15/10/2026). Nulo: desligado no painel ou evento encerrado. `liveUntil`: até quando a página mostra
   * "Acontecendo agora" (o fim, ou 8 h depois do início sem ele). A página decide antes, durante e depois pela hora do servidor.
   */
  countdown: { liveUntil: string } | null;
  /** Hora do servidor ao montar a resposta. A página conta por ela (diferença para o relógio do aparelho), não só pelo aparelho. */
  /** Porcentagem da taxa de serviço em vigor, em centésimos de ponto percentual (D-90; Termos 1.5). Zero: a página não fala de taxa. */
  serviceFeeRateBps: number;
  serverNow: string;
}

async function load(deps: VitrineDeps, rows: EventRow[]) {
  const now = deps.clock.now();
  if (rows.length === 0) return { now, byEvent: new Map<string, TypeInput[]>() };
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
  // Lotes como valem agora, sem gravar (0013): a página mostra o lote certo mesmo antes de alguém comprar.
  const lots = await previewTypes(deps.db, types, now);
  const byEvent = new Map<string, TypeInput[]>();
  for (const t of types) {
    const list = byEvent.get(t.eventId) ?? [];
    list.push(inputOf(t, reserved.get(t.id) ?? 0, lots.byType.get(t.id) ?? [], lots.reserved, now));
    byEvent.set(t.eventId, list);
  }
  return { now, byEvent };
}

interface TypeInput {
  id: string;
  name: string;
  priceCents: number;
  isActive: boolean;
  salesStartAt: Date;
  salesEndAt: Date;
  quantityTotal: number;
  quantitySold: number;
  quantityReserved: number;
  lastUnitsNotice: boolean;
  /** Estado com os lotes, e a visão dos lotes (0013). */
  state: SalesState;
  lots: TypeLotsView;
  /** Início do próximo lote, quando nenhum está à venda e um aguarda a data: "Vendas a partir de". */
  soonAt?: Date;
}

function inputOf(
  t: typeof ticketTypes.$inferSelect,
  reserved: number,
  lots: readonly Lot[],
  reservedByLot: ReadonlyMap<string, number>,
  now: Date,
): TypeInput {
  const base = {
    id: t.id,
    name: t.name,
    priceCents: t.priceCents,
    isActive: t.isActive,
    salesStartAt: t.salesStartAt,
    salesEndAt: t.salesEndAt,
    quantityTotal: t.quantityTotal,
    quantitySold: t.quantitySold,
    quantityReserved: reserved,
    lastUnitsNotice: t.lastUnitsNotice,
  };
  const view = typeLotsView(lots, reservedByLot, now, availableQuantity(base));
  const waiting = view.waitingStart ? lots.find(l => l.status === 'aguardando') : undefined;
  return {
    ...base,
    priceCents: view.current?.priceCents ?? t.priceCents,
    state: lotSalesState(salesState(base, now), view),
    lots: view,
    soonAt: waiting?.salesStartAt ?? undefined,
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
    bannerPlaceholder: e.bannerUrl ? e.bannerPlaceholder : null,
    isFeatured: e.isFeatured,
    accentColor: e.accentColor,
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

/** Eventos publicados, não arquivados e ainda dentro da janela de exibição, do mais próximo ao mais distante. */
async function visibleRows(deps: VitrineDeps) {
  const since = new Date(deps.clock.now().getTime() - VISIBLE_AFTER_START_MS);
  return deps.db
    .select()
    .from(events)
    .where(and(eq(events.status, 'publicado'), isNull(events.archivedAt), gt(events.startsAt, since)))
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
}

/**
 * Listagem e busca por nome (RF-21, RF-22, CA-12), a busca do cabeçalho. Ignora acento e maiúsculas e acha por parte do nome. A busca
 * por data saiu em 16/10/2026 (a vitrine ficou só com a busca do cabeçalho); um `date` vindo de link antigo é ignorado pela rota.
 * Sem filtro, só entram eventos com venda em andamento ou por começar; com filtro, entram também os esgotados e encerrados as vendas,
 * para quem procura um evento específico encontrar a página dele.
 */
export async function search(deps: VitrineDeps, input: SearchInput) {
  const q = searchKey(input.q ?? '');
  if (q.length > 100)
    throw new AppError(422, 'dados_invalidos', 'A busca é longa demais.', [
      { campo: 'q', mensagem: 'Use até 100 caracteres.' },
    ]);
  const filtering = Boolean(q);
  const rows = await visibleRows(deps);
  const { now, byEvent } = await load(deps, rows);
  const items = rows
    .filter(e => !q || searchKey(e.name).includes(q))
    .map(e => card(e, byEvent.get(e.id) ?? [], now))
    .filter(c => filtering || c._sale.kind !== 'closed')
    .map(strip);
  return { events: items, filtering };
}

/**
 * Página do evento pelo endereço (RF-23, RF-24, RF-25, RF-27). Rascunho e arquivado não existem para o público (404, sem nada do evento
 * na prévia das redes sociais); encerrado continua acessível.
 */
export async function bySlug(deps: VitrineDeps, slug: string): Promise<PublicEventDetail> {
  const [row] = await deps.db.select().from(events).where(eq(events.slug, slug)).limit(1);
  if (!row || row.status === 'rascunho' || row.archivedAt) throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
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
  const fee = await currentServiceFee(deps.db);
  const base = strip(card(row, types, now));
  const ended = row.status === 'encerrado';
  return {
    ...base,
    address: row.address,
    description: row.description,
    attractions: row.attractions,
    endsAt: row.endsAt?.toISOString() ?? null,
    allowsMinors: row.allowsMinors,
    shareImageUrl: row.bannerUrl ? shareImageUrl(row.bannerUrl) : null,
    countdown:
      row.countdownEnabled && !ended
        ? {
            liveUntil: countdownLiveUntil(row.startsAt, row.endsAt).toISOString(),
          }
        : null,
    serverNow: now.toISOString(),
    serviceFeeRateBps: fee.rateBps,
    ticketTypes: types.map(t => {
      // Em evento encerrado nada está à venda, qualquer que seja o período do tipo.
      const state = ended && t.state === 'a_venda' ? 'encerrada' : t.state;
      const current = t.lots.current;
      const inLots = t.lots.lotCount > 0;
      const available = inLots ? (current?.available ?? 0) : availableQuantity(t);
      // Nenhum lote à venda e um aguardando a data: "Próximo lote: em breve", sem o preço dele.
      const betweenLots = inLots && !current && t.lots.waitingStart && state === 'em_breve';
      const priceCents = inLots ? (current?.priceCents ?? null) : t.priceCents;
      return {
        id: t.id,
        name: t.name,
        priceCents,
        serviceFeeCents: priceCents === null ? null : unitServiceFee(priceCents, fee),
        lot: current && t.lots.lotCount > 1 ? { name: current.name, position: current.position } : null,
        lotRemaining: current && t.lots.hasNext && state === 'a_venda' ? available : null,
        lastUnits: Boolean(current && t.lastUnitsNotice && state === 'a_venda' && lastUnits(available, current.capacity)),
        nextLot: state === 'a_venda' && t.lots.hasNext,
        state,
        label: TYPE_LABEL[state],
        note: betweenLots ? 'Próximo lote: em breve.' : typeNote(state, t),
        canBuy: !preview && state === 'a_venda' && available > 0,
      };
    }),
  };
}
