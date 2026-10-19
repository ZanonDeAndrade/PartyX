import { describe, expect, it } from 'vitest';
import { SERVICE_FEE_CASES } from './serviceFee.cases';
import { unitServiceFee, validServiceFeeRule } from './serviceFee';

describe('taxa de serviço (D-90): valor × r / (1 − r), para cima ao centavo, nunca abaixo do mínimo', () => {
  it.each(SERVICE_FEE_CASES)('R$ %i centavos a %i (centésimos de ponto), mínimo %i: %i', (price, rateBps, minCents, expected) => {
    expect(unitServiceFee(price, { rateBps, minCents })).toBe(expected);
  });

  it('com a porcentagem igual à tarifa cobrada sobre o total, o valor do ingresso chega inteiro (nunca menos)', () => {
    for (let price = 100; price <= 60_000; price += 37) {
      for (const rateBps of [99, 299, 498, 500]) {
        const total = price + unitServiceFee(price, { rateBps, minCents: 0 });
        // Tarifa sobre o total, arredondada ao centavo para baixo ou para cima: o que sobra nunca fica abaixo do preço.
        expect(total - Math.ceil((total * rateBps) / 10_000), `${price} a ${rateBps}`).toBeGreaterThanOrEqual(price);
        // E a taxa nunca passa da conta exata por mais de 1 centavo.
        expect(unitServiceFee(price, { rateBps, minCents: 0 }) - (price * rateBps) / (10_000 - rateBps)).toBeLessThan(1);
      }
    }
  });

  it('limites do painel: 0% a 20%, mínimo de R$ 0,00 a R$ 50,00, só inteiros', () => {
    expect(validServiceFeeRule({ rateBps: 500, minCents: 0 })).toBe(true);
    expect(validServiceFeeRule({ rateBps: 2000, minCents: 5000 })).toBe(true);
    expect(validServiceFeeRule({ rateBps: 2001, minCents: 0 })).toBe(false);
    expect(validServiceFeeRule({ rateBps: -1, minCents: 0 })).toBe(false);
    expect(validServiceFeeRule({ rateBps: 500, minCents: 5001 })).toBe(false);
    expect(validServiceFeeRule({ rateBps: 2.5, minCents: 0 })).toBe(false);
  });
});
