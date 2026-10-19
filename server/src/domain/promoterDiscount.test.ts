import { describe, expect, it } from 'vitest';
import { DISCOUNT_CASES } from './promoterDiscount.cases';
import { describeDiscount, discountFor, unitDiscount, validDiscountRule, type PromoterDiscountConfig } from './promoterDiscount';
import { unitAmounts, planOrder } from './checkout';

describe('desconto por promoter (D-91): conta por ingresso', () => {
  it.each(DISCOUNT_CASES)('R$ %i centavos, %s %i: desconto %i', (price, kind, value, expected) => {
    expect(unitDiscount(price, { kind, value })).toBe(expected);
  });

  it('sem regra ou preço zero: sem desconto', () => {
    expect(unitDiscount(3000, null)).toBe(0);
    expect(unitDiscount(0, { kind: 'fixo', value: 500 })).toBe(0);
  });

  it('limites: porcentagem de 1% a 100% com até 2 casas; valor fixo de R$ 0,01 a R$ 100.000,00', () => {
    expect(validDiscountRule({ kind: 'percentual', value: 100 })).toBe(true);
    expect(validDiscountRule({ kind: 'percentual', value: 10000 })).toBe(true);
    expect(validDiscountRule({ kind: 'percentual', value: 99 })).toBe(false);
    expect(validDiscountRule({ kind: 'percentual', value: 10001 })).toBe(false);
    expect(validDiscountRule({ kind: 'percentual', value: 12.5 })).toBe(false);
    expect(validDiscountRule({ kind: 'fixo', value: 1 })).toBe(true);
    expect(validDiscountRule({ kind: 'fixo', value: 0 })).toBe(false);
    expect(validDiscountRule({ kind: 'fixo', value: 10_000_001 })).toBe(false);
  });

  it('texto curto do desconto', () => {
    expect(describeDiscount({ kind: 'percentual', value: 1250 })).toBe('12,5%');
    expect(describeDiscount({ kind: 'percentual', value: 1205 })).toBe('12,05%');
    expect(describeDiscount({ kind: 'percentual', value: 1000 })).toBe('10%');
    expect(describeDiscount({ kind: 'fixo', value: 350 })).toBe('R$ 3,50');
  });
});

describe('quando o desconto vale (prazo pela data do pedido, alcance, limite de usos)', () => {
  const config = (over: Partial<PromoterDiscountConfig> = {}): PromoterDiscountConfig => ({
    kind: 'percentual',
    value: 1000,
    scope: 'todos',
    eventIds: [],
    startsOn: null,
    endsOn: null,
    maxUses: null,
    ...over,
  });
  it('sem desconto configurado', () => {
    expect(discountFor(config({ kind: 'nenhum', value: null }), 'e', '2026-10-20', 0)).toEqual({ ok: false, reason: 'sem_desconto' });
  });
  it('todos os eventos e sem limites: vale', () => {
    expect(discountFor(config(), 'e', '2026-10-20', 999)).toEqual({ ok: true, rule: { kind: 'percentual', value: 1000 } });
  });
  it('eventos escolhidos: só neles', () => {
    expect(discountFor(config({ scope: 'eventos', eventIds: ['a'] }), 'a', '2026-10-20', 0).ok).toBe(true);
    expect(discountFor(config({ scope: 'eventos', eventIds: ['a'] }), 'b', '2026-10-20', 0)).toEqual({ ok: false, reason: 'outro_evento' });
  });
  it('prazo: primeiro e último dia incluídos', () => {
    const c = config({ startsOn: '2026-10-20', endsOn: '2026-10-31' });
    expect(discountFor(c, 'e', '2026-10-19', 0)).toEqual({ ok: false, reason: 'fora_do_prazo' });
    expect(discountFor(c, 'e', '2026-10-20', 0).ok).toBe(true);
    expect(discountFor(c, 'e', '2026-10-31', 0).ok).toBe(true);
    expect(discountFor(c, 'e', '2026-11-01', 0)).toEqual({ ok: false, reason: 'fora_do_prazo' });
  });
  it('limite de usos: o último uso ainda vale; depois, esgotado', () => {
    expect(discountFor(config({ maxUses: 2 }), 'e', '2026-10-20', 1).ok).toBe(true);
    expect(discountFor(config({ maxUses: 2 }), 'e', '2026-10-20', 2)).toEqual({ ok: false, reason: 'esgotado' });
  });
});

describe('desconto com a taxa de serviço (D-90): a taxa é calculada sobre o valor já com desconto', () => {
  const fee = { rateBps: 750, minCents: 0 };
  it('R$ 30,00 com 10% e taxa de 7,5%: desconto R$ 3,00, taxa sobre R$ 27,00 = R$ 2,19', () => {
    // 2700 × 750 / 9250 = 218,9 → 219.
    expect(unitAmounts(3000, fee, { kind: 'percentual', value: 1000 })).toEqual({ discountCents: 300, serviceFeeCents: 219 });
  });
  it('sem desconto, a taxa de sempre (R$ 30,00 a 7,5% = R$ 2,44)', () => {
    expect(unitAmounts(3000, fee, null)).toEqual({ discountCents: 0, serviceFeeCents: 244 });
  });
  it('ingresso em R$ 0,00 não tem taxa, nem a mínima', () => {
    expect(unitAmounts(3000, { rateBps: 750, minCents: 200 }, { kind: 'fixo', value: 5000 })).toEqual({
      discountCents: 3000,
      serviceFeeCents: 0,
    });
  });
  it('plano do pedido: total = ingressos - desconto + taxa, por tipo', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const t = (id: string, priceCents: number) => ({
      id,
      name: id,
      priceCents,
      isActive: true,
      salesStartAt: new Date('2026-10-01T00:00:00Z'),
      salesEndAt: new Date('2026-12-01T00:00:00Z'),
      quantityTotal: 100,
      quantitySold: 0,
      quantityReserved: 0,
    });
    const types = new Map([
      ['a', t('a', 3000)],
      ['b', t('b', 1000)],
    ]);
    const plan = planOrder(
      [
        { ticketTypeId: 'a', quantity: 2 },
        { ticketTypeId: 'b', quantity: 1 },
      ],
      types,
      new Map(),
      now,
      undefined,
      fee,
      { kind: 'fixo', value: 1500 },
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // a: 2 × (3000 - 1500) = 3000, taxa 2 × ceil(1500 × 750 / 9250 = 121,6) = 2 × 122; b: 1000 - 1000 = 0, sem taxa.
    expect(plan).toMatchObject({ ticketsCents: 7000, discountCents: 4000, serviceFeeCents: 244, totalCents: 3244 });
    expect(plan.lines.map(l => [l.discountCents, l.serviceFeeCents])).toEqual([
      [3000, 244],
      [1000, 0],
    ]);
  });
});
