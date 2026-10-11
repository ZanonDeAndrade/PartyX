import { describe, expect, it } from 'vitest';
import {
  checkSnapshotAgainstOrder,
  intentFor,
  isValidAmount,
  looksLikeCardNumber,
  type GatewayStatus,
} from './payment';

describe('interpretação dos estados do gateway', () => {
  it('cada estado vira uma única intenção', () => {
    const expected: Record<GatewayStatus, string> = {
      pendente: 'aguardar',
      aprovado: 'confirmar',
      recusado: 'recusar',
      expirado: 'expirar',
      cancelado: 'expirar',
      estornado: 'estornar',
      contestado: 'contestar',
    };
    for (const [status, intent] of Object.entries(expected))
      expect(intentFor(status as GatewayStatus), status).toBe(intent);
  });
  it('só "aprovado" leva a confirmar o pedido', () => {
    const all: GatewayStatus[] = [
      'pendente',
      'aprovado',
      'recusado',
      'expirado',
      'cancelado',
      'estornado',
      'contestado',
    ];
    expect(all.filter(s => intentFor(s) === 'confirmar')).toEqual(['aprovado']);
  });
});

describe('valor da cobrança', () => {
  it('aceita só inteiro positivo em centavos até o teto', () => {
    for (const ok of [1, 8000, 15050, 100_000_000]) expect(isValidAmount(ok), String(ok)).toBe(true);
    for (const bad of [0, -1, 80.5, NaN, Infinity, 100_000_001, '8000', null, undefined, 2 ** 53]) {
      expect(isValidAmount(bad), String(bad)).toBe(false);
    }
  });
});

describe('conferência da cobrança com o pedido', () => {
  const order = { id: 'ped-1', totalCents: 16000, paymentMethod: 'pix' as const };
  const good = {
    orderRef: 'ped-1',
    amountCents: 16000,
    currency: 'BRL',
    accountId: 'conta-partyx',
    method: 'pix' as const,
  };
  it('tudo certo passa', () => {
    expect(checkSnapshotAgainstOrder(good, order, 'conta-partyx')).toEqual({ ok: true, mismatches: [] });
  });
  it('aponta cada divergência: pedido, valor, moeda, conta e forma', () => {
    expect(checkSnapshotAgainstOrder({ ...good, orderRef: 'ped-2' }, order, 'conta-partyx').mismatches).toEqual([
      'pedido',
    ]);
    expect(checkSnapshotAgainstOrder({ ...good, amountCents: 100 }, order, 'conta-partyx').mismatches).toEqual([
      'valor',
    ]);
    expect(checkSnapshotAgainstOrder({ ...good, currency: 'USD' }, order, 'conta-partyx').mismatches).toEqual([
      'moeda',
    ]);
    expect(checkSnapshotAgainstOrder({ ...good, accountId: 'conta-outra' }, order, 'conta-partyx').mismatches).toEqual([
      'conta',
    ]);
    expect(checkSnapshotAgainstOrder({ ...good, method: 'cartao' }, order, 'conta-partyx').mismatches).toEqual([
      'metodo',
    ]);
  });
  it('sem conta esperada configurada, não aprova às cegas', () => {
    expect(checkSnapshotAgainstOrder(good, order, null).ok).toBe(false);
    expect(checkSnapshotAgainstOrder({ ...good, accountId: null }, order, null).ok).toBe(false);
  });
  it('valor 1 centavo a menos ou a mais não passa', () => {
    expect(checkSnapshotAgainstOrder({ ...good, amountCents: 15999 }, order, 'conta-partyx').ok).toBe(false);
    expect(checkSnapshotAgainstOrder({ ...good, amountCents: 16001 }, order, 'conta-partyx').ok).toBe(false);
  });
});

describe('reconhecer número de cartão onde só cabe token', () => {
  it('detecta números reais de teste, com ou sem separador', () => {
    for (const pan of [
      '4111111111111111',
      '4111 1111 1111 1111',
      '4111-1111-1111-1111',
      '5555555555554444',
      '378282246310005',
    ]) {
      expect(looksLikeCardNumber(pan), pan).toBe(true);
    }
  });
  it('não confunde token, UUID, telefone ou CPF com cartão', () => {
    for (const ok of [
      'tok_1Nabcdef123456',
      'a3f1c2d4-5b6e-4f70-8a9b-0c1d2e3f4a5b',
      '55998124470',
      '12345678909',
      '4111111111111112',
      '123456789012',
    ]) {
      expect(looksLikeCardNumber(ok), ok).toBe(false);
    }
  });
});
