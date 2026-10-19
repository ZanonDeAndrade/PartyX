import { describe, expect, it } from 'vitest';
import { SERVICE_FEE_CASES } from '../../server/src/domain/serviceFee.cases';
import { formatRate, rateBpsFromText, unitServiceFee } from './serviceFee';

describe('taxa de serviço na tela (D-90): a mesma conta do servidor', () => {
  it.each(SERVICE_FEE_CASES)('R$ %i centavos a %i, mínimo %i: %i', (price, rateBps, minCents, expected) => {
    expect(unitServiceFee(price, { rateBps, minCents })).toBe(expected);
  });

  it('porcentagem como o painel mostra e digita', () => {
    expect(formatRate(500)).toBe('5%');
    expect(formatRate(299)).toBe('2,99%');
    expect(formatRate(250)).toBe('2,5%');
    expect(formatRate(0)).toBe('0%');
    expect(rateBpsFromText('5')).toBe(500);
    expect(rateBpsFromText('2,99')).toBe(299);
    expect(rateBpsFromText('2.5')).toBe(250);
    expect(rateBpsFromText(' 0 ')).toBe(0);
    expect(rateBpsFromText('2,999')).toBeNull();
    expect(rateBpsFromText('abc')).toBeNull();
    expect(rateBpsFromText('')).toBeNull();
  });
});
