import { describe, expect, it } from 'vitest';
import { DISCOUNT_CASES } from '../../server/src/domain/promoterDiscount.cases';
import { dayBr, discountLabel, discountSummary, percentBpsFromText, unitDiscount } from './promoterDiscount';

describe('desconto por promoter na tela (D-91): a mesma conta do servidor', () => {
  it.each(DISCOUNT_CASES)('R$ %i centavos, %s %i: desconto %i', (price, kind, value, expected) => {
    expect(unitDiscount(price, { kind, value })).toBe(expected);
  });

  it('sem regra, sem desconto', () => {
    expect(unitDiscount(3000, null)).toBe(0);
  });

  it('porcentagem como o painel mostra e digita (1 a 100, até 2 casas)', () => {
    expect(discountLabel({ kind: 'percentual', value: 1250 })).toBe('12,5%');
    expect(discountLabel({ kind: 'percentual', value: 725 })).toBe('7,25%');
    expect(discountLabel({ kind: 'percentual', value: 10000 })).toBe('100%');
    expect(discountLabel({ kind: 'fixo', value: 500 }).replace(/\s/g, ' ')).toBe('R$ 5,00');
    expect(percentBpsFromText('12,5')).toBe(1250);
    expect(percentBpsFromText('7.25')).toBe(725);
    expect(percentBpsFromText('100')).toBe(10000);
    expect(percentBpsFromText('1')).toBe(100);
    expect(percentBpsFromText('0,5')).toBeNull();
    expect(percentBpsFromText('100,01')).toBeNull();
    expect(percentBpsFromText('101')).toBeNull();
    expect(percentBpsFromText('7,255')).toBeNull();
    expect(percentBpsFromText('dez')).toBeNull();
  });

  it('resumo da lista de promoters', () => {
    const base = {
      id: 'p',
      name: 'Duda',
      couponCode: 'DUDA',
      phone: null,
      isActive: true,
      createdAt: '2026-10-19T00:00:00Z',
    };
    expect(discountSummary({ ...base, discountKind: 'nenhum' }, () => undefined)).toBeNull();
    expect(
      discountSummary(
        {
          ...base,
          discountKind: 'percentual',
          discountValue: 1000,
          discountScope: 'eventos',
          discountEventIds: ['e1'],
          discountStartsOn: '2026-10-20',
          discountEndsOn: '2026-10-31',
          discountMaxUses: 50,
        },
        id => (id === 'e1' ? 'Festa X' : undefined),
      ),
    ).toBe('10% por ingresso, só em Festa X, de 20/10/2026 a 31/10/2026, limite de 50 usos');
    expect(dayBr('2026-10-20')).toBe('20/10/2026');
  });
});
