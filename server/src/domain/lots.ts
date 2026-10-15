/**
 * Lotes por tipo de ingresso (0013, 15/10/2026). Regras puras, sem I/O: quem chama lê os lotes e as reservas com a linha do tipo
 * trancada e grava o resultado na mesma transação. A página pública e o painel usam as mesmas funções só para mostrar, sem gravar.
 *
 * - Cada tipo tem lotes em ordem; só um fica à venda por vez. Encerrado não volta.
 * - Virada automática: o lote à venda encerra quando passa a data de fim dele, ou quando esgota (vendidos mais reservas válidas) e
 *   existe próximo lote. O último lote não encerra por esgotar: o tipo fica "esgotado" e volta a vender se uma reserva vencer.
 * - Na virada, a sobra (o que não foi vendido nem está reservado) passa para o próximo lote ou é descartada, pela regra do lote
 *   (`leftover_policy`; na virada manual, pela escolha no painel).
 * - Reserva que vence num lote já encerrado devolve as unidades ao lote à venda (ou ao próximo que aguarda).
 * - A capacidade do tipo continua sendo o teto, conferida à parte (`availableQuantity` do tipo).
 */

import type { SalesState } from './events';

export type LotStatus = 'aguardando' | 'a_venda' | 'encerrado';
export type LotCloseReason = 'esgotado' | 'data' | 'manual';
export type LotLeftover = 'passar' | 'descartar';

export interface Lot {
  id: string;
  position: number;
  name: string;
  priceCents: number;
  quantity: number;
  carriedIn: number;
  passedOut: number;
  discarded: number;
  quantitySold: number;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
  leftoverPolicy: LotLeftover;
  status: LotStatus;
  closedAt: Date | null;
  closeReason: LotCloseReason | null;
}

/** Quanto o lote pode vender ao todo: a quantidade dele, mais o que recebeu, menos o que passou adiante e o que descartou. */
export const lotCapacity = (l: Pick<Lot, 'quantity' | 'carriedIn' | 'passedOut' | 'discarded'>): number =>
  l.quantity + l.carriedIn - l.passedOut - l.discarded;

/** Quanto ainda dá para reservar no lote. Pode ser negativo (aprovação tardia num lote cujas unidades já tinham voltado). */
export const lotRemaining = (l: Lot, reserved: number): number => lotCapacity(l) - l.quantitySold - reserved;

export type LotChange =
  | {
      kind: 'encerrar';
      lotId: string;
      reason: LotCloseReason;
      /** Unidades que sobraram (nem vendidas nem reservadas) e para onde foram. */
      leftover: number;
      leftoverTo: 'proximo' | 'descarte' | null;
      toLotId: string | null;
    }
  | { kind: 'abrir'; lotId: string }
  | { kind: 'devolver'; fromLotId: string; toLotId: string; units: number };

const byPosition = (a: Lot, b: Lot) => a.position - b.position;
const reservedOf = (reserved: ReadonlyMap<string, number>, l: Lot) => reserved.get(l.id) ?? 0;

function close(
  lots: Lot[],
  lot: Lot,
  reason: LotCloseReason,
  policy: LotLeftover,
  reserved: ReadonlyMap<string, number>,
  now: Date,
): LotChange {
  const next = lots.filter(l => l.status === 'aguardando' && l.position > lot.position).sort(byPosition)[0];
  const leftover = Math.max(0, lotRemaining(lot, reservedOf(reserved, lot)));
  lot.status = 'encerrado';
  lot.closedAt = now;
  lot.closeReason = reason;
  let leftoverTo: 'proximo' | 'descarte' | null = null;
  if (leftover > 0) {
    if (policy === 'passar' && next) {
      lot.passedOut += leftover;
      next.carriedIn += leftover;
      leftoverTo = 'proximo';
    } else {
      lot.discarded += leftover;
      leftoverTo = 'descarte';
    }
  }
  return { kind: 'encerrar', lotId: lot.id, reason, leftover, leftoverTo, toLotId: leftoverTo === 'proximo' ? next!.id : null };
}

/**
 * Aplica as viradas devidas em `now` e devolve o novo estado e o que mudou (para gravar e para a trilha). Não altera a entrada.
 * `reserved`: reservas válidas por lote (vencidas não contam).
 */
export function settleLots(
  input: readonly Lot[],
  reserved: ReadonlyMap<string, number>,
  now: Date,
): { lots: Lot[]; changes: LotChange[] } {
  const lots = input.map(l => ({ ...l })).sort(byPosition);
  const changes: LotChange[] = [];
  for (let guard = 0; guard < lots.length * 4 + 4; guard++) {
    const current = lots.find(l => l.status === 'a_venda');
    const waiting = lots.filter(l => l.status === 'aguardando').sort(byPosition);
    // 1. Unidades livres de lote encerrado (reserva que venceu depois da virada) voltam para o lote à venda, ou o próximo que aguarda.
    const target = current ?? waiting[0];
    if (target) {
      for (const l of lots) {
        if (l.status !== 'encerrado') continue;
        const free = lotRemaining(l, reservedOf(reserved, l));
        if (free <= 0) continue;
        l.passedOut += free;
        target.carriedIn += free;
        changes.push({ kind: 'devolver', fromLotId: l.id, toLotId: target.id, units: free });
      }
    }
    // 2. O lote à venda encerra por data, ou por esgotar quando há próximo.
    if (current) {
      const hasNext = waiting.some(w => w.position > current.position);
      const ended = current.salesEndAt !== null && now >= current.salesEndAt;
      const soldOut = hasNext && lotRemaining(current, reservedOf(reserved, current)) <= 0;
      if (ended || soldOut) {
        changes.push(close(lots, current, ended ? 'data' : 'esgotado', current.leftoverPolicy, reserved, now));
        continue;
      }
      break;
    }
    // 3. Sem lote à venda: abre o próximo que aguarda, se o início dele permitir; se o fim dele já passou, encerra sem abrir.
    const next = waiting[0];
    if (!next) break;
    if (next.salesEndAt !== null && now >= next.salesEndAt) {
      changes.push(close(lots, next, 'data', next.leftoverPolicy, reserved, now));
      continue;
    }
    if (next.salesStartAt === null || now >= next.salesStartAt) {
      next.status = 'a_venda';
      changes.push({ kind: 'abrir', lotId: next.id });
      continue;
    }
    break; // o próximo lote ainda não começou: "Próximo lote: em breve"
  }
  return { lots, changes };
}

/**
 * Virada manual no painel ("Virar para o próximo lote"): encerra o lote à venda com a escolha da sobra (passa ou é descartada) e
 * aplica o resto das regras (abre o próximo, se o início dele permitir). Sem lote à venda, não faz nada.
 */
export function turnLot(
  input: readonly Lot[],
  reserved: ReadonlyMap<string, number>,
  now: Date,
  leftover: LotLeftover,
): { lots: Lot[]; changes: LotChange[] } | null {
  const lots = input.map(l => ({ ...l })).sort(byPosition);
  const current = lots.find(l => l.status === 'a_venda');
  if (!current) return null;
  const first = close(lots, current, 'manual', leftover, reserved, now);
  const rest = settleLots(lots, reserved, now);
  return { lots: rest.lots, changes: [first, ...rest.changes] };
}

export interface AllocationPart {
  lotId: string;
  quantity: number;
  unitPriceCents: number;
}

/**
 * Divide `quantity` unidades de um tipo entre os lotes: primeiro o lote à venda; se ele não bastar, ele esgota, vira, e o restante
 * sai do próximo (pelo preço do próximo), e assim por diante. `typeAvailable` é o teto do tipo (capacidade menos vendidas menos
 * reservas válidas). Sem unidades suficientes, devolve quantas dava para levar agora.
 */
export function allocateLots(
  input: readonly Lot[],
  reserved: ReadonlyMap<string, number>,
  now: Date,
  quantity: number,
  typeAvailable: number,
):
  | { ok: true; parts: AllocationPart[]; lots: Lot[]; changes: LotChange[]; reserved: Map<string, number> }
  | { ok: false; available: number } {
  const res = new Map(reserved);
  let { lots, changes } = settleLots(input, res, now);
  const parts: AllocationPart[] = [];
  let left = Math.min(quantity, Math.max(0, typeAvailable));
  const capped = quantity - left; // o teto do tipo corta antes dos lotes
  for (let guard = 0; guard < lots.length + 1 && left > 0; guard++) {
    const current = lots.find(l => l.status === 'a_venda');
    if (!current) break;
    const take = Math.min(left, Math.max(0, lotRemaining(current, res.get(current.id) ?? 0)));
    if (take > 0) {
      parts.push({ lotId: current.id, quantity: take, unitPriceCents: current.priceCents });
      res.set(current.id, (res.get(current.id) ?? 0) + take);
      left -= take;
    }
    if (left === 0) break;
    const next = settleLots(lots, res, now);
    if (!next.changes.some(c => c.kind === 'encerrar' && c.lotId === current.id)) break; // não virou: não há de onde tirar
    lots = next.lots;
    changes = [...changes, ...next.changes];
  }
  const taken = parts.reduce((t, p) => t + p.quantity, 0);
  if (left > 0 || capped > 0) return { ok: false, available: taken };
  // Depois de reservar: se o lote esgotou e há próximo, já vira (a página mostra o próximo lote na hora).
  const after = settleLots(lots, res, now);
  return { ok: true, parts, lots: after.lots, changes: [...changes, ...after.changes], reserved: res };
}

/** "Últimas unidades deste lote": menos de 10 unidades, ou menos de 10% do lote (o que for maior). */
export const lastUnits = (available: number, capacity: number): boolean =>
  available > 0 && (available < 10 || available < capacity * 0.1);

export interface TypeLotsView {
  /** Lote à venda agora (depois das viradas devidas), ou nulo. */
  current: {
    id: string;
    name: string;
    position: number;
    priceCents: number;
    capacity: number;
    sold: number;
    available: number;
  } | null;
  /** Existe lote que ainda vai abrir. */
  hasNext: boolean;
  /** Sem lote à venda e com um que aguarda a data de início: "Próximo lote: em breve". */
  waitingStart: boolean;
  /** Algum lote ainda pode vender (à venda ou aguardando). Falso: todos encerrados. */
  anyLeft: boolean;
  lotCount: number;
}

/** O que a página e o painel mostram de um tipo com lotes, já com as viradas devidas em `now` (sem gravar nada). */
export function typeLotsView(
  input: readonly Lot[],
  reserved: ReadonlyMap<string, number>,
  now: Date,
  typeAvailable: number,
): TypeLotsView {
  const { lots } = settleLots(input, reserved, now);
  const current = lots.find(l => l.status === 'a_venda') ?? null;
  const waiting = lots.filter(l => l.status === 'aguardando');
  return {
    current: current && {
      id: current.id,
      name: current.name,
      position: current.position,
      priceCents: current.priceCents,
      capacity: lotCapacity(current),
      sold: current.quantitySold,
      available: Math.max(0, Math.min(typeAvailable, lotRemaining(current, reserved.get(current.id) ?? 0))),
    },
    hasNext: current ? waiting.some(w => w.position > current.position) : waiting.length > 0,
    waitingStart: !current && waiting.length > 0,
    anyLeft: Boolean(current) || waiting.length > 0,
    lotCount: lots.length,
  };
}

/**
 * Estado de venda do tipo com lotes: primeiro o do próprio tipo (desativado, fora do período, capacidade vendida) e, dentro dele, o do
 * lote à venda. Sem lote à venda: "em breve" se o próximo ainda vai abrir; senão, esgotado. Lote à venda sem unidade livre: esgotado
 * se tudo foi vendido; "reservado" se há reservas que podem voltar.
 */
export function lotSalesState(base: SalesState, view: TypeLotsView): SalesState {
  if (view.lotCount === 0 || base === 'indisponivel' || base === 'em_breve' || base === 'encerrada' || base === 'esgotado')
    return base;
  if (!view.current) return view.waitingStart ? 'em_breve' : 'esgotado';
  if (view.current.available > 0) return base;
  return view.current.sold >= view.current.capacity ? 'esgotado' : 'reservado';
}
