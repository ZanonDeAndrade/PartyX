/**
 * Desconto por promoter (D-91, 19/10/2026, mudança de escopo aprovada pela PartyX). O código do promoter atribui a venda e, se o
 * promoter tiver desconto, tira um valor de CADA ingresso, sobre o preço do lote dele:
 * - porcentagem (1% a 100%, com até duas casas): `desconto = preço × porcentagem`, arredondado para BAIXO ao centavo (o comprador
 *   nunca ganha mais do que o anunciado). Ex.: 12,5% de R$ 30,00 = R$ 3,75; 7,25% de R$ 25,00 = 181,25 → R$ 1,81.
 * - valor fixo: o menor entre o valor e o preço (o ingresso nunca fica abaixo de R$ 0,00).
 * A taxa de serviço (D-90) é calculada sobre o valor JÁ com desconto; ingresso de R$ 0,00 não tem taxa, nem a mínima.
 * O desconto nunca zera o pedido inteiro (D-91, opção B): nesse caso o código é recusado. Conta em inteiros, sem ponto flutuante.
 */

export type DiscountKind = 'percentual' | 'fixo';

export interface DiscountRule {
  kind: DiscountKind;
  /** Porcentagem em centésimos de ponto percentual (12,5% = 1250) ou valor fixo em centavos. */
  value: number;
}

/** Limites aceitos no painel e pelas CHECK de `promoters` (0018). */
export const DISCOUNT_LIMITS = { percentMinBps: 100, percentMaxBps: 10_000, fixedMinCents: 1, fixedMaxCents: 10_000_000 } as const;

/** Desconto de UM ingresso de `priceCents`. Sem regra, zero. */
export function unitDiscount(priceCents: number, rule: DiscountRule | null): number {
  if (!rule || priceCents <= 0) return 0;
  if (rule.kind === 'percentual') return Math.floor((priceCents * rule.value) / 10_000);
  return Math.min(rule.value, priceCents);
}

export function validDiscountRule(rule: DiscountRule): boolean {
  if (!Number.isInteger(rule.value)) return false;
  return rule.kind === 'percentual'
    ? rule.value >= DISCOUNT_LIMITS.percentMinBps && rule.value <= DISCOUNT_LIMITS.percentMaxBps
    : rule.value >= DISCOUNT_LIMITS.fixedMinCents && rule.value <= DISCOUNT_LIMITS.fixedMaxCents;
}

/** Configuração de desconto de um promoter, como gravada (datas no formato AAAA-MM-DD, dias do fuso do evento, os dois incluídos). */
export interface PromoterDiscountConfig {
  kind: 'nenhum' | DiscountKind;
  value: number | null;
  scope: 'todos' | 'eventos';
  /** Eventos do alcance `eventos`. */
  eventIds: readonly string[];
  startsOn: string | null;
  endsOn: string | null;
  maxUses: number | null;
}

/** Por que um código válido não dá desconto neste pedido. Em todos esses casos o código continua atribuindo a venda (D-91). */
export type NoDiscountReason = 'sem_desconto' | 'fora_do_prazo' | 'esgotado' | 'outro_evento';

export type DiscountCheck = { ok: true; rule: DiscountRule } | { ok: false; reason: NoDiscountReason };

/**
 * O desconto vale para este pedido? `today` é o dia do pedido no fuso do evento (o prazo vale pela criação do pedido); `usesTaken` são
 * os pedidos que já seguram um uso (pagos e pendentes dentro da reserva), contados com a linha do promoter trancada.
 */
export function discountFor(config: PromoterDiscountConfig, eventId: string, today: string, usesTaken: number): DiscountCheck {
  if (config.kind === 'nenhum' || config.value === null) return { ok: false, reason: 'sem_desconto' };
  if (config.scope === 'eventos' && !config.eventIds.includes(eventId)) return { ok: false, reason: 'outro_evento' };
  if ((config.startsOn && today < config.startsOn) || (config.endsOn && today > config.endsOn))
    return { ok: false, reason: 'fora_do_prazo' };
  if (config.maxUses !== null && usesTaken >= config.maxUses) return { ok: false, reason: 'esgotado' };
  return { ok: true, rule: { kind: config.kind, value: config.value } };
}

/** Texto para o comprador quando o código vale só para atribuir a venda. A tela mostra "DUDA aplicado. " antes dele. */
export const NO_DISCOUNT_TEXT: Record<NoDiscountReason, string> = {
  sem_desconto: 'Total inalterado. Este código registra a indicação e não dá desconto.',
  fora_do_prazo: 'Total inalterado. O desconto deste código não está valendo hoje.',
  esgotado: 'Total inalterado. O desconto deste código já atingiu o limite de usos.',
  outro_evento: 'Total inalterado. O desconto deste código não vale para este evento.',
};

/** Recusa do código quando o desconto zeraria o pedido inteiro (D-91, opção B). */
export const ZERO_TOTAL_TEXT = 'Este código não pode ser usado neste pedido.';

/** "12,5%" ou "R$ 3,00" (texto curto, para comprovantes e painel). */
export function describeDiscount(rule: DiscountRule): string {
  if (rule.kind === 'percentual') {
    const whole = Math.floor(rule.value / 100);
    const cents = rule.value % 100;
    return `${whole}${cents ? ',' + String(cents).padStart(2, '0').replace(/0$/, '') : ''}%`;
  }
  const reais = Math.floor(rule.value / 100);
  return `R$ ${reais.toLocaleString('pt-BR')},${String(rule.value % 100).padStart(2, '0')}`;
}
