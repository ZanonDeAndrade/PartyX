/**
 * Taxa de serviço da PartyX (D-90, 18/10/2026): cobrada por ingresso e somada ao valor dele, a mesma para Pix e cartão. O Mercado
 * Pago cobra a tarifa sobre o TOTAL pago, então a taxa é calculada sobre o total, para o valor do ingresso chegar inteiro quando a
 * porcentagem é igual à tarifa: `taxa = valor × r / (1 − r)`, arredondada para CIMA ao centavo e nunca menor que o mínimo.
 * Ex.: R$ 30,00 a 5% → 3000 × 500 / 9500 = 157,89 → R$ 1,58 (total R$ 31,58). Conta em inteiros (centavos e centésimos de ponto
 * percentual), sem ponto flutuante. A mesma conta está em src/site/serviceFee.ts (prévia do painel), com a mesma tabela de testes.
 */
export interface ServiceFeeRule {
  /** Centésimos de ponto percentual: 500 = 5%. */
  rateBps: number;
  minCents: number;
}

/** Limites aceitos no painel (e pela CHECK da tabela). */
export const SERVICE_FEE_LIMITS = { rateBpsMax: 2000, minCentsMax: 5000 } as const;

export const NO_SERVICE_FEE: ServiceFeeRule = { rateBps: 0, minCents: 0 };

/** Taxa de UM ingresso de `priceCents`. */
export function unitServiceFee(priceCents: number, rule: ServiceFeeRule): number {
  const denominator = 10_000 - rule.rateBps;
  const byRate = Math.floor((priceCents * rule.rateBps + denominator - 1) / denominator);
  return Math.max(byRate, rule.minCents);
}

export function validServiceFeeRule(rule: ServiceFeeRule): boolean {
  return (
    Number.isInteger(rule.rateBps) &&
    Number.isInteger(rule.minCents) &&
    rule.rateBps >= 0 &&
    rule.rateBps <= SERVICE_FEE_LIMITS.rateBpsMax &&
    rule.minCents >= 0 &&
    rule.minCents <= SERVICE_FEE_LIMITS.minCentsMax
  );
}
