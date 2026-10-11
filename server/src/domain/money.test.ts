import { describe, expect, it } from 'vitest';
import { assertCents, formatBRL, reaisToCents, sumCents } from './money';

describe('dinheiro em centavos', () => {
  it('converte reais em texto para centavos sem usar float', () => {
    expect(reaisToCents('123,45')).toBe(12345);
    expect(reaisToCents('1.234,50')).toBe(123450);
    expect(reaisToCents('80')).toBe(8000);
    expect(reaisToCents('0,5')).toBe(50);
    expect(reaisToCents('19,99')).toBe(1999);
  });

  it('recusa texto que não é valor em reais', () => {
    for (const bad of ['', 'abc', '1,234', '12.34', '-5', '1,2,3']) expect(() => reaisToCents(bad)).toThrow(RangeError);
  });

  it('recusa valores não inteiros como centavos', () => {
    expect(() => assertCents(1.5)).toThrow(RangeError);
    expect(() => assertCents(Number.NaN)).toThrow(RangeError);
    expect(() => assertCents(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });

  it('formata em reais no padrão brasileiro', () => {
    expect(formatBRL(12345).replace(/\s/g, ' ')).toBe('R$ 123,45');
    expect(formatBRL(100).replace(/\s/g, ' ')).toBe('R$ 1,00');
  });

  it('soma sem erro de arredondamento', () => {
    expect(sumCents([10, 20, 30])).toBe(60);
    expect(sumCents([1999, 1999, 1999])).toBe(5997);
    expect(() => sumCents([1, 0.5])).toThrow(RangeError);
  });
});
