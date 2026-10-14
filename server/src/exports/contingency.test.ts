import { describe, expect, it } from 'vitest';
import { HAS_POPPLER, longWord, readPdf } from '../tickets/pdfTesting';
import { renderContingencyPdf } from './contingency';
import type { ContingencyTicket } from './service';

const row = (over: Partial<ContingencyTicket>): ContingencyTicket => ({
  shortCode: 'PX-ABCD-2345',
  typeName: 'Pista',
  holderName: 'Carla Menezes',
  cpf: '***.444.777-**',
  orderNumber: 10001,
  status: 'valido',
  usedAt: null,
  buyerMinor: false,
  ...over,
});

describe('lista de contingência da portaria com texto longo', () => {
  it.skipIf(!HAS_POPPLER)(
    'nome do comprador, tipo, evento e local no limite e sem espaço: nada cortado, nada fora da margem, linhas sem sobrepor',
    async () => {
      const event = longWord('FestaTesteteste', 120);
      const venue = longWord('ArenaCentraldeEventos', 120);
      const holder = `Ana ${longWord('Testetesteteste', 115)}`;
      const type = longWord('MeiaEntradaEstudante', 60);
      const admit = [
        row({ holderName: holder, typeName: type, buyerMinor: true, shortCode: 'PX-AAAA-1111' }),
        ...Array.from({ length: 60 }, (_, i) => row({ shortCode: `PX-B${String(i).padStart(3, '0')}-2222`, orderNumber: 10002 + i })),
      ];
      const pdf = readPdf(
        await renderContingencyPdf({
          event: { id: 'e', name: `${event} 🎉`, startsAt: '2026-12-13T02:30:00.000Z', venue, address: 'Rua das Flores, 100' },
          generatedAt: new Date('2026-12-12T20:00:00Z'),
          admit,
          cancelled: [row({ holderName: holder, typeName: type, status: 'cancelado', shortCode: 'PX-CCCC-3333' })],
          byType: [{ typeName: type, total: 61 }],
        }),
      );
      const all = pdf.flat.join('');
      for (const piece of [event, venue, `${holder.replace(/\s/g, '')}(MENOR)`, type, 'CANCELADOS'])
        expect(all, piece.slice(0, 30)).toContain(piece);
      for (const code of ['PX-AAAA-1111', 'PX-B059-2222', 'PX-CCCC-3333']) expect(all).toContain(code);
      for (const w of pdf.words) {
        expect(w.xMax, w.text).toBeLessThanOrEqual(pdf.pageWidth - 30);
        expect(w.yMax, w.text).toBeLessThanOrEqual(pdf.pageHeight - 30);
      }
      // Linha do comprador longo: o código da linha seguinte começa abaixo da última linha do nome.
      const nameEnd = Math.max(...pdf.words.filter(w => w.page === 2 && w.text.includes('Testeteste')).map(w => w.yMax));
      const next = pdf.words.find(w => w.page === 2 && w.text === 'PX-B000-2222')!;
      expect(next.yMin).toBeGreaterThan(nameEnd);
      // Rodapé de cada página em uma linha, sem o nome do evento, e nenhuma página a mais só com o rodapé.
      expect(pdf.pages).toBe(3);
      pdf.flat.forEach((page, i) => expect(page).toContain(`Página${i + 1}de${pdf.pages}·CONFIDENCIAL:contémdadospessoais`));
    },
  );
});
