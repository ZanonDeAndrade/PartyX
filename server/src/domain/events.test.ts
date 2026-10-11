import { describe, expect, it } from 'vitest';
import { availableQuantity, isCouponCodeValid, normalizeCouponCode, salesState, slugify } from './events';

describe('slugify', () => {
  it('tira acentos e símbolos e junta com hífen', () => {
    expect(slugify('Festa Neon: Edição Verão 2026!')).toBe('festa-neon-edicao-verao-2026');
    expect(slugify('  São João do   Zé  ')).toBe('sao-joao-do-ze');
  });
  it('nome sem caractere aproveitável vira "evento" e o tamanho é limitado', () => {
    expect(slugify('!!!')).toBe('evento');
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
  it('sempre cabe na restrição do banco', () => {
    for (const n of ['Ação & Reação', '--x--', 'ÀÉÎÕÜ 123', 'Rock in Rio / 2026']) {
      expect(slugify(n)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('código do promoter', () => {
  it('minúsculas viram maiúsculas; acento, espaço e símbolo são recusados', () => {
    expect(normalizeCouponCode(' joao10 ')).toBe('JOAO10');
    expect(isCouponCodeValid('JOAO10')).toBe(true);
    for (const bad of ['AB', 'JOÃO', 'A B', 'JOAO-10', 'A'.repeat(21), '', 'JOAO_1']) {
      expect(isCouponCodeValid(bad), bad).toBe(false);
    }
    expect(isCouponCodeValid('A'.repeat(20))).toBe(true);
  });
});

describe('estado de venda do tipo (CA-08, CA-09)', () => {
  const base = {
    isActive: true,
    salesStartAt: new Date('2026-10-01T00:00:00Z'),
    salesEndAt: new Date('2026-10-20T00:00:00Z'),
    quantityTotal: 100,
    quantitySold: 0,
    quantityReserved: 0,
  };
  const at = (iso: string, over = {}) => salesState({ ...base, ...over }, new Date(iso));

  it('antes do início: em breve; depois do fim: encerrada; dentro: à venda', () => {
    expect(at('2026-09-30T23:59:59Z')).toBe('em_breve');
    expect(at('2026-10-01T00:00:00Z')).toBe('a_venda');
    expect(at('2026-10-19T23:59:59Z')).toBe('a_venda');
    expect(at('2026-10-20T00:00:00Z')).toBe('encerrada');
  });
  it('última unidade vendida: esgotado; só reservada: indisponível por reserva, não esgotado', () => {
    expect(at('2026-10-10T00:00:00Z', { quantitySold: 99 })).toBe('a_venda');
    expect(at('2026-10-10T00:00:00Z', { quantitySold: 100 })).toBe('esgotado');
    expect(at('2026-10-10T00:00:00Z', { quantitySold: 90, quantityReserved: 10 })).toBe('reservado');
    expect(at('2026-10-10T00:00:00Z', { quantitySold: 90, quantityReserved: 9 })).toBe('a_venda');
  });
  it('desativado prevalece sobre qualquer outro estado', () => {
    expect(at('2026-10-10T00:00:00Z', { isActive: false })).toBe('indisponivel');
    expect(at('2026-09-01T00:00:00Z', { isActive: false })).toBe('indisponivel');
  });
  it('quantidade disponível desconta vendidas e reservas e nunca fica negativa', () => {
    expect(availableQuantity({ quantityTotal: 100, quantitySold: 60, quantityReserved: 15 })).toBe(25);
    expect(availableQuantity({ quantityTotal: 10, quantitySold: 10, quantityReserved: 3 })).toBe(0);
  });
});
