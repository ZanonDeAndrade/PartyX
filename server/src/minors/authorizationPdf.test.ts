import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { legalDocument } from '../legal/documents';
import { longWord, readPdf } from '../tickets/pdfTesting';
import { renderAuthorizationPdf, splitAuthorizationText } from './authorizationPdf';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const HAS_POPPLER = spawnSync('pdftotext', ['-v']).status === 0 && spawnSync('pdfinfo', ['-v']).status === 0;

describe('Termo de Autorização e Responsabilidade (PDF)', () => {
  it('separa o "Como usar" e as declarações numeradas do arquivo de texto', () => {
    const { howTo, declarations } = splitAuthorizationText([
      { type: 'heading', text: 'Como usar' },
      { type: 'paragraph', text: 'Preencha à mão.' },
      { type: 'heading', text: 'Declarações do responsável' },
      { type: 'paragraph', text: '1. Primeira.' },
      { type: 'paragraph', text: '2. Segunda.' },
    ]);
    expect(howTo).toBe('Preencha à mão.');
    expect(declarations).toEqual(['Primeira.', 'Segunda.']);
  });

  it.skipIf(!HAS_POPPLER)('com o texto publicado em conteudo-legal/: uma página, as 8 declarações e a versão', async () => {
    const config = loadConfig({
      LEGAL_CONTENT_DIR: path.join(ROOT, 'conteudo-legal'),
      MINOR_AUTHORIZATION_VERSION: '1.0',
      MINOR_AUTHORIZATION_DATE: '2026-10-14',
      PARTYX_LEGAL_NAME: '58.471.403 BERNARDO PEIXOTO FORTES BITTENCOURT',
      PARTYX_CNPJ: '58.471.403/0001-07',
      PARTYX_SUPPORT_EMAIL: 'atendimento@partyx.test',
      PARTYX_SUPPORT_WHATSAPP: '+55 55 99156-6900',
      PARTYX_SUPPORT_HOURS: 'de segunda a sexta-feira, em horário comercial',
    });
    const document = legalDocument(config, 'autorizacao-menor');
    expect(document.status).toBe('oficial');
    const bytes = await renderAuthorizationPdf({
      event: {
        // Nome e local longos de propósito: quebram em linhas dentro do campo, sem cortar e sem passar de uma página.
        name: 'Noite Neon Teen Edição Especial de Fim de Ano com Convidados',
        startsAt: new Date('2026-12-13T02:30:00Z'),
        endsAt: new Date('2026-12-13T08:00:00Z'),
        venue: 'Arena Central de Eventos',
        address: 'Avenida Brasil, 1000, Centro, São Gabriel/RS',
        judicialAuthorization: 'Portaria 12/2026 do Juizado da Infância e da Juventude',
      },
      minor: { name: 'Bianca Rocha Teste', birthDate: '2010-05-20' },
      partyx: config.partyx,
      document,
    });
    const dir = mkdtempSync(path.join(tmpdir(), 'px-aut-'));
    const file = path.join(dir, 'a.pdf');
    writeFileSync(file, bytes);
    const pages = Number(/Pages:\s+(\d+)/.exec(spawnSync('pdfinfo', [file], { encoding: 'utf8' }).stdout)?.[1]);
    expect(pages).toBe(1);
    const text = spawnSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ');
    for (let i = 1; i <= 8; i++) expect(text).toContain(`${i}. `);
    for (const piece of [
      'das 23h30 às 5h',
      '12/12/2026',
      '20/05/2010',
      'CNPJ 58.471.403/0001-07',
      'Termo versão 1.0, vigente desde 14/10/2026.',
      'WhatsApp +55 55 99156-6900',
      'de segunda a sexta-feira, em horário comercial',
      'Uso da portaria',
    ])
      expect(text, piece).toContain(piece);
    expect(text).not.toContain('14 anos'); // a idade do texto aprovado é 16 (o modelo antigo dizia 14)
    expect(text).not.toMatch(/exonero/i); // a cláusula de exoneração do modelo antigo foi retirada
    expect(text).not.toContain('Celestino'); // sem endereço publicado, o cabeçalho não leva endereço
    const flat = readPdf(bytes).flat[0]!;
    for (const piece of ['NoiteNeonTeenEdiçãoEspecialdeFimdeAnocomConvidados', 'ArenaCentraldeEventos,AvenidaBrasil,1000,Centro,SãoGabriel/RS'])
      expect(flat).toContain(piece);
  });

  it.skipIf(!HAS_POPPLER)(
    'todos os campos preenchidos no limite e sem espaço (evento 120, local 120 + endereço 200, autorização 120, menor 120): nada cortado nem fora da margem',
    async () => {
      const config = loadConfig({
        LEGAL_CONTENT_DIR: path.join(ROOT, 'conteudo-legal'),
        MINOR_AUTHORIZATION_VERSION: '1.0',
        MINOR_AUTHORIZATION_DATE: '2026-10-14',
        PARTYX_CNPJ: '58.471.403/0001-07',
      });
      const name = longWord('FestaTesteteste', 120);
      const venue = longWord('ArenaCentraldeEventos', 120);
      const address = longWord('https://www.exemplo.com.br/eventos/', 200);
      const judicial = longWord('Portaria12/2026doJuizado', 120);
      const minor = `Bianca ${longWord('Testetesteteste', 113)}`;
      const pdf = readPdf(
        await renderAuthorizationPdf({
          event: {
            name: `${name} 🎉`,
            startsAt: new Date('2026-12-13T02:30:00Z'),
            endsAt: new Date('2026-12-13T08:00:00Z'),
            venue,
            address,
            judicialAuthorization: judicial,
          },
          minor: { name: minor, birthDate: '2010-05-20' },
          partyx: config.partyx,
          document: legalDocument(config, 'autorizacao-menor'),
        }),
      );
      const all = pdf.flat.join('');
      for (const piece of [name, `${venue},${address}`, judicial, minor.replace(/\s/g, ''), 'Usodaportaria'])
        expect(all, piece.slice(0, 30)).toContain(piece);
      for (const w of pdf.words) {
        expect(w.xMax, w.text).toBeLessThanOrEqual(pdf.pageWidth - 40);
        expect(w.yMax, w.text).toBeLessThanOrEqual(pdf.pageHeight);
      }
      // Uma página é o normal; com tudo no limite, a assinatura pode ir para a segunda, nunca para uma terceira.
      expect(pdf.pages).toBeLessThanOrEqual(2);
    },
  );
});
