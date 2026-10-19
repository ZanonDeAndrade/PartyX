import { availableQuantity, salesState, type SalesInput, type SalesState } from './events';
import { allocateLots, typeLotsView, type Lot, type LotChange } from './lots';
import { NO_SERVICE_FEE, unitServiceFee, type ServiceFeeRule } from './serviceFee';

/** Regras puras do carrinho e da reserva. Sem I/O: o banco só entra em `orders/service.ts`. */

export interface RequestedItem {
  ticketTypeId: string;
  quantity: number;
}

export interface TypeForPlan extends SalesInput {
  id: string;
  name: string;
  priceCents: number;
}

export type FailureReason = Exclude<SalesState, 'a_venda'> | 'quantidade_indisponivel';

export interface ItemFailure {
  ticketTypeId: string;
  reason: FailureReason;
  /** Quantas unidades ainda podem ser reservadas agora (só em `quantidade_indisponivel`). */
  available?: number;
}

/** Parte de uma linha que sai de um lote, pelo preço dele (0013). Uma linha pode ter mais de uma, quando o lote à venda não bastava. */
export interface PlannedLot {
  lotId: string;
  name: string;
  position: number;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  /** Taxa de serviço de cada ingresso deste lote (D-90), calculada sobre o preço dele. */
  unitServiceFeeCents: number;
}

export interface PlannedLine {
  ticketTypeId: string;
  name: string;
  quantity: number;
  /** Preço de cada unidade; com mais de um lote na linha, a média arredondada (o valor certo é o de cada lote em `lots`). */
  unitPriceCents: number;
  subtotalCents: number;
  /** Taxa de serviço das unidades da linha (soma das taxas por ingresso). */
  serviceFeeCents: number;
  /** De que lote sai cada parte. Vazio só para tipo sem lotes (versão anterior aos lotes). */
  lots: PlannedLot[];
}

/** Lotes dos tipos pedidos, como gravados, e as reservas válidas por lote (0013). */
export interface LotsForPlan {
  byType: ReadonlyMap<string, readonly Lot[]>;
  reservedByLot: ReadonlyMap<string, number>;
}

/** Novo estado dos lotes de um tipo depois desta compra (viradas causadas por ela), para gravar na mesma transação. */
export interface LotUpdate {
  ticketTypeId: string;
  lots: Lot[];
  changes: LotChange[];
}

export type Plan =
  | {
      ok: true;
      lines: PlannedLine[];
      /** Valor dos ingressos, sem a taxa de serviço. */
      ticketsCents: number;
      serviceFeeCents: number;
      /** O que o comprador paga: ingressos mais taxa de serviço. É o valor enviado ao gateway. */
      totalCents: number;
      units: number;
      lotUpdates: LotUpdate[];
    }
  | { ok: false; failures: ItemFailure[] };

export interface ItemProblem {
  field: string;
  message: string;
}

/** Forma do pedido, antes de olhar o estoque: quantidades inteiras positivas, sem tipo repetido, dentro do limite por compra (CA-15). */
export function checkShape(items: readonly RequestedItem[], maxUnits: number): ItemProblem[] {
  const problems: ItemProblem[] = [];
  if (items.length === 0) problems.push({ field: 'items', message: 'Escolha ao menos um ingresso.' });
  const seen = new Set<string>();
  let units = 0;
  for (const [i, item] of items.entries()) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      problems.push({ field: `items.${i}.quantity`, message: 'Informe uma quantidade inteira maior que zero.' });
      continue;
    }
    if (seen.has(item.ticketTypeId)) {
      problems.push({ field: `items.${i}.ticketTypeId`, message: 'Cada tipo de ingresso pode aparecer uma só vez.' });
    }
    seen.add(item.ticketTypeId);
    units += item.quantity;
  }
  if (units > maxUnits) {
    problems.push({
      field: 'items',
      message: `O limite é de ${maxUnits} ${maxUnits === 1 ? 'ingresso' : 'ingressos'} por compra.`,
    });
  }
  return problems;
}

/**
 * Planeja o pedido a partir do que está no banco. **Preço, taxa de serviço e total saem daqui, nunca do navegador.**
 * `reservedByType` já descarta reservas vencidas. O chamador precisa ter trancado as linhas dos tipos. A taxa é por ingresso, sobre o
 * preço do lote de onde ele sai (`fee`, lida no mesmo instante; sem ela, não há taxa).
 */
export function planOrder(
  items: readonly RequestedItem[],
  types: ReadonlyMap<string, TypeForPlan>,
  reservedByType: ReadonlyMap<string, number>,
  now: Date,
  lots?: LotsForPlan,
  fee: ServiceFeeRule = NO_SERVICE_FEE,
): Plan {
  const failures: ItemFailure[] = [];
  const lines: PlannedLine[] = [];
  const lotUpdates: LotUpdate[] = [];
  for (const item of items) {
    const type = types.get(item.ticketTypeId);
    if (!type) {
      failures.push({ ticketTypeId: item.ticketTypeId, reason: 'indisponivel' });
      continue;
    }
    const input = { ...type, quantityReserved: reservedByType.get(type.id) ?? 0 };
    const state = salesState(input, now);
    if (state !== 'a_venda') {
      failures.push({ ticketTypeId: type.id, reason: state });
      continue;
    }
    const available = availableQuantity(input);
    const typeLots = lots?.byType.get(type.id);
    if (lots && typeLots && typeLots.length > 0) {
      // Com lotes: primeiro o lote à venda; se não bastar, o restante sai do próximo, pelo preço dele (0013).
      const alloc = allocateLots(typeLots, lots.reservedByLot, now, item.quantity, available);
      if (!alloc.ok) {
        const view = typeLotsView(typeLots, lots.reservedByLot, now, available);
        failures.push(
          alloc.available > 0
            ? { ticketTypeId: type.id, reason: 'quantidade_indisponivel', available: alloc.available }
            : { ticketTypeId: type.id, reason: view.waitingStart ? 'em_breve' : 'esgotado' },
        );
        continue;
      }
      const lotById = new Map(alloc.lots.map(l => [l.id, l]));
      const parts: PlannedLot[] = alloc.parts.map(p => {
        const l = lotById.get(p.lotId)!;
        return {
          lotId: p.lotId,
          name: l.name,
          position: l.position,
          quantity: p.quantity,
          unitPriceCents: p.unitPriceCents,
          subtotalCents: p.unitPriceCents * p.quantity,
          unitServiceFeeCents: unitServiceFee(p.unitPriceCents, fee),
        };
      });
      const subtotal = parts.reduce((t, p) => t + p.subtotalCents, 0);
      lines.push({
        ticketTypeId: type.id,
        name: type.name,
        quantity: item.quantity,
        unitPriceCents: Math.round(subtotal / item.quantity),
        subtotalCents: subtotal,
        serviceFeeCents: parts.reduce((t, p) => t + p.unitServiceFeeCents * p.quantity, 0),
        lots: parts,
      });
      lotUpdates.push({ ticketTypeId: type.id, lots: alloc.lots, changes: alloc.changes });
      continue;
    }
    if (item.quantity > available) {
      failures.push({ ticketTypeId: type.id, reason: 'quantidade_indisponivel', available });
      continue;
    }
    lines.push({
      ticketTypeId: type.id,
      name: type.name,
      quantity: item.quantity,
      unitPriceCents: type.priceCents,
      subtotalCents: type.priceCents * item.quantity,
      serviceFeeCents: unitServiceFee(type.priceCents, fee) * item.quantity,
      lots: [],
    });
  }
  if (failures.length) return { ok: false, failures };
  const ticketsCents = lines.reduce((t, l) => t + l.subtotalCents, 0);
  const serviceFeeCents = lines.reduce((t, l) => t + l.serviceFeeCents, 0);
  return {
    ok: true,
    lines,
    ticketsCents,
    serviceFeeCents,
    totalCents: ticketsCents + serviceFeeCents,
    units: lines.reduce((t, l) => t + l.quantity, 0),
    lotUpdates,
  };
}

/** Segundos que faltam para vencer, pelo relógio do servidor. Nunca negativo. */
export const secondsLeft = (expiresAt: Date, now: Date): number =>
  Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
