import { describe, expect, it } from 'vitest';
import { eventSale, searchKey, typeNote } from './vitrine';

const now = new Date('2026-10-10T15:00:00Z');
const t = (o: Record<string, unknown> = {}) => ({
  priceCents: 8000,
  isActive: true,
  salesStartAt: new Date('2026-10-01T00:00:00Z'),
  salesEndAt: new Date('2026-10-31T00:00:00Z'),
  quantityTotal: 100,
  quantitySold: 0,
  quantityReserved: 0,
  ...o,
});

describe('situação de venda do evento (RF-21, RF-25)', () => {
  it('à venda mostra o menor preço entre os tipos à venda, ignorando os fora de venda', () => {
    const sale = eventSale(
      'publicado',
      [t({ priceCents: 12000 }), t({ priceCents: 8000 }), t({ priceCents: 1000, isActive: false })],
      now,
    );
    expect(sale).toMatchObject({ kind: 'open', minPriceCents: 8000 });
  });
  it('sem tipo à venda, mas com um por começar: "vendas a partir de" a data mais próxima', () => {
    const sale = eventSale(
      'publicado',
      [
        t({ salesStartAt: new Date('2026-11-05T12:00:00Z'), salesEndAt: new Date('2026-11-30T00:00:00Z') }),
        t({ salesStartAt: new Date('2026-10-20T12:00:00Z'), salesEndAt: new Date('2026-11-30T00:00:00Z') }),
      ],
      now,
    );
    expect(sale).toMatchObject({ kind: 'soon', label: 'Vendas a partir de 20/10' });
  });
  it('tudo vendido: esgotado; só reservas: indisponível no momento; período vencido: encerradas', () => {
    expect(eventSale('publicado', [t({ quantitySold: 100 })], now).kind).toBe('out');
    expect(
      eventSale('publicado', [t({ quantitySold: 100 }), t({ salesEndAt: new Date('2026-10-05T00:00:00Z') })], now).kind,
    ).toBe('out');
    expect(eventSale('publicado', [t({ quantitySold: 90, quantityReserved: 10 })], now).kind).toBe('held');
    expect(eventSale('publicado', [t({ salesEndAt: new Date('2026-10-05T00:00:00Z') })], now).kind).toBe('closed');
    expect(eventSale('publicado', [t({ isActive: false })], now).kind).toBe('closed');
    expect(eventSale('publicado', [], now).kind).toBe('closed');
  });
  it('um tipo à venda vence um esgotado', () => {
    expect(eventSale('publicado', [t({ quantitySold: 100 }), t()], now).kind).toBe('open');
  });
  it('evento encerrado pelo administrador é "ended", qualquer que seja o estoque', () => {
    expect(eventSale('encerrado', [t()], now)).toMatchObject({ kind: 'ended', label: 'Evento encerrado' });
  });
});

describe('textos e busca', () => {
  it('notas no fuso do evento', () => {
    expect(typeNote('a_venda', { salesStartAt: now, salesEndAt: new Date('2026-10-31T02:30:00Z') })).toBe(
      'Vendas até 30/10/2026 23:30.',
    );
  });
  it('busca ignora acento, caixa e espaços repetidos', () => {
    expect(searchKey('  FESTA   Neón ')).toBe('festa neon');
    expect(searchKey('São João').includes(searchKey('sao j'))).toBe(true);
  });
});
