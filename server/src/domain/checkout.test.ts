import { describe, expect, it } from 'vitest';
import { checkShape, planOrder, secondsLeft, type TypeForPlan } from './checkout';
import { approvalOutcome, canTransition, ORDER_TRANSITIONS, type OrderStatus } from './orderState';

const now = new Date('2026-10-10T15:00:00Z');
const type = (id: string, o: Partial<TypeForPlan> = {}): TypeForPlan => ({
  id,
  name: `Tipo ${id}`,
  priceCents: 8000,
  isActive: true,
  salesStartAt: new Date('2026-10-01T00:00:00Z'),
  salesEndAt: new Date('2026-12-01T00:00:00Z'),
  quantityTotal: 10,
  quantitySold: 0,
  quantityReserved: 0,
  ...o,
});
const map = (...ts: TypeForPlan[]) => new Map(ts.map(t => [t.id, t]));

describe('forma do pedido (CA-15)', () => {
  it('aceita até o limite, somando todos os tipos', () => {
    expect(
      checkShape(
        [
          { ticketTypeId: 'a', quantity: 4 },
          { ticketTypeId: 'b', quantity: 2 },
        ],
        6,
      ),
    ).toEqual([]);
    expect(
      checkShape(
        [
          { ticketTypeId: 'a', quantity: 4 },
          { ticketTypeId: 'b', quantity: 3 },
        ],
        6,
      ),
    ).toHaveLength(1);
    expect(checkShape([{ ticketTypeId: 'a', quantity: 7 }], 6)[0]!.message).toMatch(/limite é de 6 ingressos/);
  });
  it('recusa zero, negativo, decimal, vazio e tipo repetido', () => {
    for (const quantity of [0, -1, 1.5, NaN])
      expect(checkShape([{ ticketTypeId: 'a', quantity }], 6).length, String(quantity)).toBeGreaterThan(0);
    expect(checkShape([], 6)).toHaveLength(1);
    expect(
      checkShape(
        [
          { ticketTypeId: 'a', quantity: 1 },
          { ticketTypeId: 'a', quantity: 1 },
        ],
        6,
      ),
    ).toHaveLength(1);
  });
});

describe('planejamento do pedido', () => {
  it('preço e total vêm do banco', () => {
    const plan = planOrder(
      [
        { ticketTypeId: 'a', quantity: 2 },
        { ticketTypeId: 'b', quantity: 1 },
      ],
      map(type('a', { priceCents: 8000 }), type('b', { priceCents: 15050 })),
      new Map(),
      now,
    );
    expect(plan).toMatchObject({ ok: true, totalCents: 31050, units: 3 });
  });
  it('só uma unidade sobrando: pedir duas falha com o disponível; pedir uma passa', () => {
    const types = map(type('a', { quantitySold: 8, quantityReserved: 0 }), type('z', { quantitySold: 9 }));
    expect(planOrder([{ ticketTypeId: 'z', quantity: 2 }], types, new Map(), now)).toEqual({
      ok: false,
      failures: [{ ticketTypeId: 'z', reason: 'quantidade_indisponivel', available: 1 }],
    });
    expect(planOrder([{ ticketTypeId: 'z', quantity: 1 }], types, new Map(), now).ok).toBe(true);
  });
  it('reservas de outros compradores contam; reservado por completo vira "reservado"', () => {
    const t = map(type('a', { quantitySold: 5 }));
    expect(planOrder([{ ticketTypeId: 'a', quantity: 3 }], t, new Map([['a', 3]]), now)).toMatchObject({
      ok: false,
      failures: [{ available: 2 }],
    });
    expect(planOrder([{ ticketTypeId: 'a', quantity: 1 }], t, new Map([['a', 5]]), now)).toMatchObject({
      ok: false,
      failures: [{ reason: 'reservado' }],
    });
  });
  it('fora do período, desativado ou esgotado nunca passa; tipo desconhecido também não', () => {
    const reasons = (t: TypeForPlan) =>
      (planOrder([{ ticketTypeId: t.id, quantity: 1 }], map(t), new Map(), now) as { failures: { reason: string }[] })
        .failures[0]!.reason;
    expect(reasons(type('a', { salesStartAt: new Date('2026-11-01T00:00:00Z') }))).toBe('em_breve');
    expect(reasons(type('a', { salesEndAt: new Date('2026-10-10T15:00:00Z') }))).toBe('encerrada');
    expect(reasons(type('a', { isActive: false }))).toBe('indisponivel');
    expect(reasons(type('a', { quantitySold: 10 }))).toBe('esgotado');
    expect(planOrder([{ ticketTypeId: 'x', quantity: 1 }], new Map(), new Map(), now).ok).toBe(false);
  });
  it('um item ruim derruba o pedido inteiro, listando todos os problemas', () => {
    const plan = planOrder(
      [
        { ticketTypeId: 'a', quantity: 1 },
        { ticketTypeId: 'b', quantity: 1 },
      ],
      map(type('a', { quantitySold: 10 }), type('b', { isActive: false })),
      new Map(),
      now,
    );
    expect(plan.ok).toBe(false);
    expect((plan as { failures: unknown[] }).failures).toHaveLength(2);
  });
});

describe('contador da reserva', () => {
  it('conta pelo relógio recebido e nunca fica negativo', () => {
    expect(secondsLeft(new Date('2026-10-10T15:10:00Z'), now)).toBe(600);
    expect(secondsLeft(new Date('2026-10-10T15:00:00.400Z'), now)).toBe(1);
    expect(secondsLeft(new Date('2026-10-10T14:00:00Z'), now)).toBe(0);
  });
});

describe('estados do pedido e confirmação tardia', () => {
  it('estados finais não têm saída e ninguém volta a "pendente" por engano', () => {
    expect(ORDER_TRANSITIONS.estornado).toEqual([]);
    expect(ORDER_TRANSITIONS.cancelado).toEqual([]);
    for (const from of Object.keys(ORDER_TRANSITIONS) as OrderStatus[]) {
      if (from !== 'nao_concluido') expect(canTransition(from, 'pendente'), from).toBe(false);
    }
    expect(canTransition('nao_concluido', 'pago')).toBe(true);
    expect(canTransition('pendente', 'pago')).toBe(true);
    expect(canTransition('expirado', 'pago_sem_estoque')).toBe(true);
    expect(canTransition('pago_sem_estoque', 'pago')).toBe(false);
  });
  it('aprovação: confirma na reserva válida, emite tarde se houver estoque, senão marca sem estoque', () => {
    const base = { reservationStatus: 'ativa' as const, reservationValid: true, availableNow: 0, needed: 2 };
    expect(approvalOutcome({ ...base, orderStatus: 'pendente' })).toBe('confirmar');
    expect(
      approvalOutcome({
        ...base,
        orderStatus: 'expirado',
        reservationStatus: 'expirada',
        reservationValid: false,
        availableNow: 2,
      }),
    ).toBe('emitir_tardio');
    expect(
      approvalOutcome({
        ...base,
        orderStatus: 'expirado',
        reservationStatus: 'expirada',
        reservationValid: false,
        availableNow: 1,
      }),
    ).toBe('sem_estoque');
    expect(approvalOutcome({ ...base, orderStatus: 'pendente', reservationValid: false, availableNow: 5 })).toBe(
      'emitir_tardio',
    );
  });
  it('notificação repetida em pedido já pago ou final não faz nada', () => {
    for (const orderStatus of ['pago', 'pago_sem_estoque', 'estornado', 'contestado', 'cancelado'] as const) {
      expect(
        approvalOutcome({
          orderStatus,
          reservationStatus: 'convertida',
          reservationValid: false,
          availableNow: 99,
          needed: 1,
        }),
      ).toBe('ignorar');
    }
  });
});
