import type { ServiceFeeRule } from './api';

/**
 * Taxa de serviço da PartyX (D-90), a mesma conta de server/src/domain/serviceFee.ts, para a prévia do painel enquanto o valor é
 * digitado (quem decide o valor cobrado é sempre o servidor). Por ingresso: `valor × r / (1 − r)`, arredondada para cima ao centavo e
 * nunca menor que o mínimo. Ex.: R$ 30,00 a 5% → R$ 1,58. Mesma tabela de casos nos testes dos dois lados.
 */
export function unitServiceFee(priceCents: number, rule: ServiceFeeRule): number {
  const denominator = 10_000 - rule.rateBps;
  const byRate = Math.floor((priceCents * rule.rateBps + denominator - 1) / denominator);
  return Math.max(byRate, rule.minCents);
}

/** "5%", "2,99%" (centésimos de ponto percentual, sem zeros sobrando). */
export function formatRate(rateBps: number): string {
  const whole = Math.trunc(rateBps / 100);
  const decimals = String(rateBps % 100).padStart(2, '0').replace(/0+$/, '');
  return `${whole}${decimals ? `,${decimals}` : ''}%`;
}

/** "5" ou "2,99" (como o painel digita) → centésimos de ponto percentual; texto inválido ou com mais de 2 casas: nulo. */
export function rateBpsFromText(text: string): number | null {
  const m = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}
