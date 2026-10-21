import { describe, expect, it } from 'vitest';
import { countsInFee, periodLabel, periodNotice, type ContractFeePeriod } from './contractFee';

const plain = (text: string) => text.replace(/ /g, ' ');
const period = (o: Partial<ContractFeePeriod>): ContractFeePeriod => ({
  startsAt: new Date('2026-10-21T03:00:00Z'),
  endsAt: new Date('2026-11-01T03:00:00Z'),
  perTicketCents: 100,
  methods: ['pix'],
  reference: 'Aditivo ao contrato de 21/10/2026, D-93',
  ...o,
});

describe('taxa da contratada por forma de pagamento (D-93)', () => {
  it('entra no repasse só a forma da regra; sem lista, qualquer forma, inclusive não informada', () => {
    expect(countsInFee(['pix'], 'pix')).toBe(true);
    expect(countsInFee(['pix'], 'cartao')).toBe(false);
    expect(countsInFee(['pix'], null)).toBe(false);
    expect(countsInFee(null, 'cartao')).toBe(true);
    expect(countsInFee(null, null)).toBe(true);
    expect(countsInFee(['pix', 'cartao'], 'cartao')).toBe(true);
  });

  it('período em dias quando começa e termina na virada do dia em Brasília; com hora quando não', () => {
    expect(periodLabel(period({}))).toBe('De 21/10/2026 a 31/10/2026');
    expect(periodLabel(period({ startsAt: new Date('2026-10-01T03:00:00Z'), endsAt: new Date('2026-10-21T03:00:00Z') }))).toBe(
      'De 01/10/2026 a 20/10/2026',
    );
    // Uma regra que começasse às 15h00 de Brasília: o período anterior termina às 14h59.
    expect(periodLabel(period({ startsAt: new Date('2026-10-01T03:00:00Z'), endsAt: new Date('2026-10-21T18:00:00Z') }))).toBe(
      'De 01/10/2026 00:00 a 21/10/2026 14:59',
    );
  });

  it('o aviso sai da própria regra: valor, formas que entram, formas que ficam de fora e a referência', () => {
    expect(plain(periodNotice(period({})))).toBe(
      'De 21/10/2026 a 31/10/2026: R$ 1,00 por ingresso de pedido pago por Pix; ingressos pagos por cartão não entram no repasse e aparecem só para informação (Aditivo ao contrato de 21/10/2026, D-93).',
    );
    expect(
      plain(
        periodNotice(
          period({
            startsAt: new Date('2026-10-01T03:00:00Z'),
            endsAt: new Date('2026-10-21T03:00:00Z'),
            methods: null,
            reference: 'Contrato, Cláusula 6ª, regra original',
          }),
        ),
      ),
    ).toBe('De 01/10/2026 a 20/10/2026: R$ 1,00 por ingresso, qualquer forma de pagamento (Contrato, Cláusula 6ª, regra original).');
    expect(plain(periodNotice(period({ perTicketCents: 150, methods: ['pix', 'cartao'], reference: 'Aditivo X' })))).toBe(
      'De 21/10/2026 a 31/10/2026: R$ 1,50 por ingresso de pedido pago por Pix ou cartão (Aditivo X).',
    );
    expect(plain(periodNotice(period({ methods: ['cartao'], reference: 'Aditivo Y' })))).toMatch(
      /de pedido pago por cartão; ingressos pagos por Pix não entram no repasse/,
    );
  });
});
