import { describe, expect, it } from 'vitest';
import { renderTicketsPdf, ticketPriceText, toLatin1 } from './pdf';
import { HAS_POPPLER, longWord, readPdf } from './pdfTesting';
import type { TicketDetail } from './service';

const ticket = (
  over: Omit<Partial<TicketDetail>, 'event'> & { event?: Partial<TicketDetail['event']> } = {},
): TicketDetail => ({
  id: 'x',
  orderId: 'o',
  orderNumber: 10001,
  typeName: 'Pista',
  holderName: 'José da Conceição',
  shortCode: 'PX-ABCD-2345',
  status: 'valido',
  usedAt: null,
  receivedFrom: null,
  transferUntil: '2026-12-12T23:00:00.000Z',
  minorTermPending: false,
  priceCents: 3000,
  discountCents: 0,
  serviceFeeCents: 158,
  qrPayload: 'PX1.1.' + 'a'.repeat(32) + '.' + 'b'.repeat(24) + '.' + 'c'.repeat(22),
  ...over,
  event: {
    slug: 's',
    name: 'Festa',
    startsAt: '2026-12-13T01:00:00.000Z',
    venue: 'Clube',
    address: 'Rua',
    ageRating: '18 anos',
    allowsMinors: false,
    ...over.event,
  },
});

describe('valor do ingresso no PDF e em Meus ingressos (D-90, D-91)', () => {
  it('desconto e taxa na mesma frase, sem sinal de menos (a fonte é Latin-1)', () => {
    const nb = (t: string) => t.replace(/\s/g, ' ');
    expect(nb(ticketPriceText({ priceCents: 3000, discountCents: 300, serviceFeeCents: 219 }))).toBe(
      'R$ 27,00 (R$ 30,00 com desconto de R$ 3,00) + R$ 2,19 de taxa de serviço',
    );
    expect(nb(ticketPriceText({ priceCents: 3000, discountCents: 0, serviceFeeCents: 244 }))).toBe('R$ 30,00 + R$ 2,44 de taxa de serviço');
    expect(nb(ticketPriceText({ priceCents: 3000, discountCents: 0, serviceFeeCents: 0 }))).toBe('R$ 30,00');
    // Ingresso que ficou em R$ 0,00 pelo desconto: sem taxa.
    expect(nb(ticketPriceText({ priceCents: 1000, discountCents: 1000, serviceFeeCents: 0 }))).toBe('R$ 0,00 (R$ 10,00 com desconto de R$ 10,00)');
    expect(toLatin1(ticketPriceText({ priceCents: 3000, discountCents: 300, serviceFeeCents: 219 }))).not.toContain('?');
  });
});

describe('texto do PDF (fontes padrão, Latin-1)', () => {
  it('emoji sai do texto, com o espaço antes dele; acentos, aspas e travessão ficam; outro alfabeto vira "?"', () => {
    expect(toLatin1('Festa "Açaí" — São João ✨🎉')).toBe('Festa "Açaí" — São João');
    expect(toLatin1('Pista 🎉 VIP')).toBe('Pista VIP');
    expect(toLatin1('Baile 👯‍♀️ 🇧🇷 de Verão 👍🏽')).toBe('Baile de Verão');
    expect(toLatin1('Festa © ® 2026')).toBe('Festa © ® 2026');
    expect(toLatin1('Вечеринка 1')).toBe('????????? 1');
    expect(toLatin1('🎉🎶')).toBe('?'); // só emoji: não deixa o campo vazio
    expect(toLatin1('linha 1\nlinha 2')).toBe('linha 1 linha 2');
  });
});

describe('PDF do ingresso com texto longo', () => {
  it.skipIf(!HAS_POPPLER)('texto comum: tudo numa página, no tamanho de sempre', async () => {
    const pdf = readPdf(await renderTicketsPdf([ticket()], 'Teste'));
    expect(pdf.pages).toBe(1);
    expect(pdf.flat[0]).toContain('Festa');
    expect(pdf.flat[0]).toContain('PX-ABCD-2345');
  });

  it.skipIf(!HAS_POPPLER)('valor do ingresso e taxa de serviço separados (D-90); sem taxa, só o valor', async () => {
    // `flat` é o texto da página sem espaços.
    const com = readPdf(await renderTicketsPdf([ticket()], 'Teste')).flat[0]!;
    expect(com).toContain('ValorR$30,00+R$1,58detaxadeserviço');
    const sem = readPdf(await renderTicketsPdf([ticket({ serviceFeeCents: 0 })], 'Teste')).flat[0]!;
    expect(sem).toContain('ValorR$30,00Titular');
    expect(sem).not.toContain('taxadeserviço');
  });

  it.skipIf(!HAS_POPPLER)(
    'todos os campos no limite e sem espaço (nome 120, local 120, endereço 200, tipo 60, comprador 120): nada cortado, uma página, nada fora da margem e o código acima do rodapé',
    async () => {
      const name = longWord('FestaTesteteste', 120);
      const venue = longWord('ArenaCentraldeEventos', 120);
      const address = longWord('https://www.exemplo.com.br/eventos/', 200);
      const type = longWord('MeiaEntradaEstudante', 60);
      const holder = `Ana ${longWord('Testetesteteste', 115)}`;
      const bytes = await renderTicketsPdf(
        [ticket({ typeName: `${type}`, holderName: `${holder} 🎉`, event: { name: `${name} 🎉`, venue, address } })],
        'Teste',
      );
      const pdf = readPdf(bytes);
      expect(pdf.pages).toBe(1);
      for (const piece of [name, venue, address, type, holder.replace(/\s/g, ''), 'PX-ABCD-2345', 'Cadaingressovaleumaúnicaentrada'])
        expect(pdf.flat[0], piece.slice(0, 30)).toContain(piece);
      for (const w of pdf.words) {
        expect(w.xMax, w.text).toBeLessThanOrEqual(pdf.pageWidth - 40);
        expect(w.yMax, w.text).toBeLessThanOrEqual(pdf.pageHeight);
      }
      const at = (text: string) => pdf.words.find(w => w.text === text)!;
      // O QR fica entre o picote e "Código do ingresso"; o código vem logo abaixo e termina antes do rodapé.
      expect(at('PX-ABCD-2345').yMin).toBeGreaterThan(at('Código').yMax);
      expect(at('PX-ABCD-2345').yMax).toBeLessThan(at('Apresente').yMin);
    },
  );
});
