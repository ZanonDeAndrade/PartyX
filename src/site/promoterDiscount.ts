import type { DiscountRule, Promoter } from './api';
import { brl } from './format';

/**
 * Desconto por promoter (D-91), a mesma conta de server/src/domain/promoterDiscount.ts, para a prévia do painel (quem decide o valor
 * cobrado é sempre o servidor). Por ingresso: porcentagem arredondada para BAIXO ao centavo, ou valor fixo limitado ao preço.
 */
export function unitDiscount(priceCents: number, rule: DiscountRule | null): number {
  if (!rule || priceCents <= 0) return 0;
  if (rule.kind === 'percentual') return Math.floor((priceCents * rule.value) / 10_000);
  return Math.min(rule.value, priceCents);
}

/** "12,5%" ou "R$ 3,00". */
export function discountLabel(rule: DiscountRule): string {
  if (rule.kind === 'fixo') return brl(rule.value);
  const whole = Math.trunc(rule.value / 100);
  const decimals = String(rule.value % 100).padStart(2, '0').replace(/0+$/, '');
  return `${whole}${decimals ? `,${decimals}` : ''}%`;
}

/** "12,5" (como o painel digita) → centésimos de ponto percentual, de 1 a 100 com até 2 casas; fora disso, nulo. */
export function percentBpsFromText(text: string): number | null {
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bps >= 100 && bps <= 10_000 ? bps : null;
}

/** "20/10/2026" a partir de "2026-10-20". */
export const dayBr = (day: string) => day.split('-').reverse().join('/');

/** Resumo do desconto para a lista de promoters: "10% em todos os eventos, de 20/10/2026 a 31/10/2026, limite de 50 usos". */
export function discountSummary(p: Promoter, eventName: (id: string) => string | undefined): string | null {
  if (!p.discountKind || p.discountKind === 'nenhum' || p.discountValue == null) return null;
  const parts = [`${discountLabel({ kind: p.discountKind, value: p.discountValue })} por ingresso`];
  if (p.discountScope === 'eventos') {
    const names = (p.discountEventIds ?? []).map(id => eventName(id) ?? 'evento removido');
    parts.push(names.length === 1 ? `só em ${names[0]}` : `em ${names.length} eventos escolhidos`);
  } else parts.push('em todos os eventos');
  if (p.discountStartsOn && p.discountEndsOn) parts.push(`de ${dayBr(p.discountStartsOn)} a ${dayBr(p.discountEndsOn)}`);
  else if (p.discountStartsOn) parts.push(`a partir de ${dayBr(p.discountStartsOn)}`);
  else if (p.discountEndsOn) parts.push(`até ${dayBr(p.discountEndsOn)}`);
  parts.push(p.discountMaxUses ? `limite de ${p.discountMaxUses} uso${p.discountMaxUses === 1 ? '' : 's'}` : 'sem limite de usos');
  return parts.join(', ');
}
