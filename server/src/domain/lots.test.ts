import { describe, expect, it } from 'vitest';
import { allocateLots, lastUnits, lotCapacity, settleLots, turnLot, typeLotsView, type Lot } from './lots';

const NOW = new Date('2026-11-01T12:00:00Z');
const at = (iso: string) => new Date(iso);
let n = 0;
function lot(o: Partial<Lot> & Pick<Lot, 'position'>): Lot {
  return {
    id: `l${o.position}-${++n}`,
    name: `${o.position}º lote`,
    priceCents: 10000 + o.position * 2000,
    quantity: 100,
    carriedIn: 0,
    passedOut: 0,
    discarded: 0,
    quantitySold: 0,
    salesStartAt: null,
    salesEndAt: null,
    leftoverPolicy: 'passar',
    status: 'aguardando',
    closedAt: null,
    closeReason: null,
    ...o,
  };
}
const none = new Map<string, number>();
const byId = (lots: Lot[], id: string) => lots.find(l => l.id === id)!;

describe('lotes: virada (0013, 15/10/2026)', () => {
  it('por esgotamento: o lote à venda esgota (vendidos + reservas) e o próximo abre', () => {
    const a = lot({ position: 1, status: 'a_venda', quantitySold: 90 });
    const b = lot({ position: 2 });
    const r = settleLots([a, b], new Map([[a.id, 10]]), NOW);
    expect(byId(r.lots, a.id)).toMatchObject({ status: 'encerrado', closeReason: 'esgotado', closedAt: NOW });
    expect(byId(r.lots, b.id).status).toBe('a_venda');
    expect(r.changes).toEqual([
      { kind: 'encerrar', lotId: a.id, reason: 'esgotado', leftover: 0, leftoverTo: null, toLotId: null },
      { kind: 'abrir', lotId: b.id },
    ]);
  });

  it('sem próximo lote, o último não encerra por esgotar (o tipo fica esgotado e volta se uma reserva vencer)', () => {
    const a = lot({ position: 1, status: 'a_venda', quantitySold: 100 });
    expect(settleLots([a], none, NOW).changes).toEqual([]);
    expect(typeLotsView([a], none, NOW, 0)).toMatchObject({ current: { available: 0 }, hasNext: false, anyLeft: true });
  });

  it('por data: o fim do lote passou; a sobra passa para o próximo, ou é descartada', () => {
    const end = at('2026-11-01T11:00:00Z');
    const pass = settleLots(
      [lot({ position: 1, status: 'a_venda', quantitySold: 60, salesEndAt: end }), lot({ position: 2, quantity: 50 })],
      none,
      NOW,
    );
    const [p1, p2] = pass.lots;
    expect(p1).toMatchObject({ status: 'encerrado', closeReason: 'data', passedOut: 40 });
    expect(p2).toMatchObject({ status: 'a_venda', carriedIn: 40 });
    expect(lotCapacity(p2!)).toBe(90);
    expect(pass.changes[0]).toMatchObject({ kind: 'encerrar', reason: 'data', leftover: 40, leftoverTo: 'proximo', toLotId: p2!.id });

    const drop = settleLots(
      [
        lot({ position: 1, status: 'a_venda', quantitySold: 60, salesEndAt: end, leftoverPolicy: 'descartar' }),
        lot({ position: 2, quantity: 50 }),
      ],
      none,
      NOW,
    );
    expect(drop.lots[0]).toMatchObject({ status: 'encerrado', discarded: 40, passedOut: 0 });
    expect(drop.lots[1]).toMatchObject({ status: 'a_venda', carriedIn: 0 });
  });

  it('reservas do lote que vira continuam nele (preço preso); a sobra é só o que não foi vendido nem reservado', () => {
    const a = lot({ position: 1, status: 'a_venda', quantitySold: 50, salesEndAt: at('2026-11-01T11:00:00Z') });
    const b = lot({ position: 2 });
    const r = settleLots([a, b], new Map([[a.id, 30]]), NOW);
    expect(byId(r.lots, a.id).passedOut).toBe(20);
    expect(byId(r.lots, b.id).carriedIn).toBe(20);
  });

  it('reserva que vence depois da virada devolve as unidades ao lote à venda', () => {
    // Lote 1 encerrado com 30 reservadas (sobra já passou); as reservas venceram: não contam mais.
    const a = lot({ position: 1, status: 'encerrado', closedAt: NOW, closeReason: 'esgotado', quantitySold: 70 });
    const b = lot({ position: 2, status: 'a_venda', quantitySold: 10 });
    const r = settleLots([a, b], none, NOW);
    expect(byId(r.lots, a.id).passedOut).toBe(30);
    expect(byId(r.lots, b.id).carriedIn).toBe(30);
    expect(r.changes).toEqual([{ kind: 'devolver', fromLotId: a.id, toLotId: b.id, units: 30 }]);
    // Repetir não move de novo.
    expect(settleLots(r.lots, none, NOW).changes).toEqual([]);
  });

  it('próximo lote com início no futuro: "em breve" até a data, e abre sozinho nela', () => {
    const start = at('2026-11-02T00:00:00Z');
    const lots = [
      lot({ position: 1, status: 'a_venda', quantitySold: 100 }),
      lot({ position: 2, salesStartAt: start }),
    ];
    const before = settleLots(lots, none, NOW);
    expect(before.lots.map(l => l.status)).toEqual(['encerrado', 'aguardando']);
    expect(typeLotsView(lots, none, NOW, 100)).toMatchObject({ current: null, waitingStart: true, hasNext: true });
    expect(settleLots(before.lots, none, start).lots[1]!.status).toBe('a_venda');
  });

  it('lote que aguardava e cujo fim passou sem abrir encerra pela data, e a quantidade dele segue a regra', () => {
    const lots = [
      lot({ position: 1, status: 'encerrado', closedAt: NOW, closeReason: 'manual', quantitySold: 100 }),
      lot({ position: 2, salesStartAt: at('2026-10-01T00:00:00Z'), salesEndAt: at('2026-10-31T00:00:00Z') }),
      lot({ position: 3 }),
    ];
    const r = settleLots(lots, none, NOW);
    expect(r.lots.map(l => l.status)).toEqual(['encerrado', 'encerrado', 'a_venda']);
    expect(r.lots[2]!.carriedIn).toBe(100);
  });

  it('virada manual: encerra com a escolha da sobra e abre o próximo; sem lote à venda, nada', () => {
    const a = lot({ position: 1, status: 'a_venda', quantitySold: 20 });
    const b = lot({ position: 2 });
    const pass = turnLot([a, b], new Map([[a.id, 5]]), NOW, 'passar')!;
    expect(byId(pass.lots, a.id)).toMatchObject({ status: 'encerrado', closeReason: 'manual', passedOut: 75 });
    expect(byId(pass.lots, b.id)).toMatchObject({ status: 'a_venda', carriedIn: 75 });
    const drop = turnLot([a, b], new Map([[a.id, 5]]), NOW, 'descartar')!;
    expect(byId(drop.lots, a.id).discarded).toBe(75);
    expect(byId(drop.lots, b.id).carriedIn).toBe(0);
    // Último lote: encerra e o tipo para de vender.
    const last = turnLot([lot({ position: 1, status: 'a_venda' })], none, NOW, 'passar')!;
    expect(last.lots[0]).toMatchObject({ status: 'encerrado', discarded: 100 });
    expect(typeLotsView(last.lots, none, NOW, 100)).toMatchObject({ current: null, anyLeft: false });
    expect(turnLot(last.lots, none, NOW, 'passar')).toBeNull();
  });
});

describe('lotes: compra dividida e teto do tipo', () => {
  it('cabe no lote à venda: tudo dele, pelo preço dele', () => {
    const a = lot({ position: 1, status: 'a_venda', priceCents: 12000 });
    const r = allocateLots([a, lot({ position: 2 })], none, NOW, 3, 200);
    expect(r).toMatchObject({ ok: true, parts: [{ lotId: a.id, quantity: 3, unitPriceCents: 12000 }] });
  });

  it('não cabe: o restante sai do próximo lote, pelo preço dele, e o lote esgotado vira na hora', () => {
    const a = lot({ position: 1, status: 'a_venda', priceCents: 12000, quantitySold: 98 });
    const b = lot({ position: 2, priceCents: 14000 });
    const r = allocateLots([a, b], none, NOW, 4, 200);
    if (!r.ok) throw new Error('deveria caber');
    expect(r.parts).toEqual([
      { lotId: a.id, quantity: 2, unitPriceCents: 12000 },
      { lotId: b.id, quantity: 2, unitPriceCents: 14000 },
    ]);
    expect(r.lots.map(l => l.status)).toEqual(['encerrado', 'a_venda']);
    expect(r.reserved.get(b.id)).toBe(2);
  });

  it('o lote à venda esgota com esta compra e há próximo: vira logo depois de reservar', () => {
    const a = lot({ position: 1, status: 'a_venda', quantitySold: 96 });
    const r = allocateLots([a, lot({ position: 2 })], none, NOW, 4, 200);
    if (!r.ok) throw new Error('deveria caber');
    expect(r.parts).toHaveLength(1);
    expect(r.lots.map(l => l.status)).toEqual(['encerrado', 'a_venda']);
  });

  it('o próximo lote ainda não começou, ou não existe: só leva o que resta, e diz quanto', () => {
    const a = lot({ position: 1, status: 'a_venda', quantitySold: 98 });
    const later = lot({ position: 2, salesStartAt: at('2026-12-01T00:00:00Z') });
    expect(allocateLots([a, later], none, NOW, 4, 200)).toEqual({ ok: false, available: 2 });
    expect(allocateLots([a], none, NOW, 4, 200)).toEqual({ ok: false, available: 2 });
  });

  it('o teto do tipo corta antes dos lotes (nunca vende além da capacidade do tipo)', () => {
    const a = lot({ position: 1, status: 'a_venda' });
    expect(allocateLots([a], none, NOW, 5, 3)).toEqual({ ok: false, available: 3 });
    expect(allocateLots([a], none, NOW, 3, 3)).toMatchObject({ ok: true });
  });

  it('últimas unidades: menos de 10, ou menos de 10% do lote', () => {
    expect(lastUnits(9, 50)).toBe(true);
    expect(lastUnits(10, 50)).toBe(false);
    expect(lastUnits(99, 1000)).toBe(true);
    expect(lastUnits(100, 1000)).toBe(false);
    expect(lastUnits(0, 50)).toBe(false);
  });
});
