import { availableQuantity, salesState, type SalesInput, type SalesState } from './events';

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

export interface PlannedLine {
  ticketTypeId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export type Plan =
  { ok: true; lines: PlannedLine[]; totalCents: number; units: number } | { ok: false; failures: ItemFailure[] };

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
 * Planeja o pedido a partir do que está no banco. **Preço e total saem daqui, nunca do navegador.**
 * `reservedByType` já descarta reservas vencidas. O chamador precisa ter trancado as linhas dos tipos.
 */
export function planOrder(
  items: readonly RequestedItem[],
  types: ReadonlyMap<string, TypeForPlan>,
  reservedByType: ReadonlyMap<string, number>,
  now: Date,
): Plan {
  const failures: ItemFailure[] = [];
  const lines: PlannedLine[] = [];
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
    });
  }
  if (failures.length) return { ok: false, failures };
  return {
    ok: true,
    lines,
    totalCents: lines.reduce((t, l) => t + l.subtotalCents, 0),
    units: lines.reduce((t, l) => t + l.quantity, 0),
  };
}

/** Segundos que faltam para vencer, pelo relógio do servidor. Nunca negativo. */
export const secondsLeft = (expiresAt: Date, now: Date): number =>
  Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
