import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { legalDocument } from '../legal/documents';
import { longWord, readPdf } from '../tickets/pdfTesting';
import { renderAuthorizationPdf, splitAuthorizationText } from './authorizationPdf';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const HAS_POPPLER = spawnSync('pdftotext', ['-v']).status === 0 && spawnSync('pdfinfo', ['-v']).status === 0;
const LOGO = readFileSync(path.join(ROOT, 'public/brand/partyx-logo-print-dark.png'));
/** Imagens embutidas no PDF (pdfimages -list): largura e altura em pixels. A máscara de transparência do PNG não conta. */
const images = (file: string) =>
  spawnSync('pdfimages', ['-list', file], { encoding: 'utf8' })
    .stdout.split('\n')
    .slice(2)
    .map(l => l.trim().split(/\s+/))
    .filter(cols => cols[2] === 'image')
    .map(cols => [Number(cols[3]), Number(cols[4])]);

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

  it.skipIf(!HAS_POPPLER)('com o texto publicado em conteudo-legal/: uma página, cabeçalho com logo e CNPJ, as 8 declarações, atendimento e versão', async () => {
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
      },
      minor: { name: 'Bianca Rocha Teste', birthDate: '2010-05-20' },
      partyx: config.partyx,
      document,
      logo: LOGO,
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
      // Rodapé do modelo, montado das variáveis PARTYX_SUPPORT_* (nada fixo no código).
      'Atendimento PartyX: atendimento@partyx.test · WhatsApp +55 55 99156-6900 · de segunda a sexta-feira, em horário comercial.',
      'Uso da portaria',
    ])
      expect(text, piece).toContain(piece);
    // Cabeçalho do modelo de 14/10/2026: logo (o arquivo de impressão, 652 x 360) e CNPJ; sem razão social, sem endereço e sem o
    // campo da autorização judicial, que saiu do sistema.
    expect(images(file)).toEqual([[652, 360]]);
    expect(text).not.toContain('BERNARDO');
    expect(text).not.toMatch(/judicial|alvará/i);
    expect(text).not.toContain('14 anos'); // a idade do texto aprovado é 16 (o modelo antigo dizia 14)
    expect(text).not.toMatch(/exonero/i); // a cláusula de exoneração do modelo antigo foi retirada
    expect(text).not.toContain('Celestino'); // sem endereço publicado, o cabeçalho não leva endereço
    const flat = readPdf(bytes).flat[0]!;
    for (const piece of ['NoiteNeonTeenEdiçãoEspecialdeFimdeAnocomConvidados', 'ArenaCentraldeEventos,AvenidaBrasil,1000,Centro,SãoGabriel/RS'])
      expect(flat).toContain(piece);
  });

  it.skipIf(!HAS_POPPLER)(
    'todos os campos preenchidos no limite e sem espaço (evento 120, local 120 + endereço 200, menor 120): uma página, nada cortado nem fora da margem',
    async () => {
      const config = loadConfig({
        LEGAL_CONTENT_DIR: path.join(ROOT, 'conteudo-legal'),
        MINOR_AUTHORIZATION_VERSION: '1.0',
        MINOR_AUTHORIZATION_DATE: '2026-10-14',
        PARTYX_CNPJ: '58.471.403/0001-07',
        PARTYX_SUPPORT_EMAIL: 'partyx992@gmail.com',
        PARTYX_SUPPORT_WHATSAPP: '+55 55 99156-6900',
        PARTYX_SUPPORT_HOURS: 'de segunda a sexta-feira, em horário comercial',
      });
      const name = longWord('FestaTesteteste', 120);
      const venue = longWord('ArenaCentraldeEventos', 120);
      const address = longWord('https://www.exemplo.com.br/eventos/', 200);
      const minor = `Bianca ${longWord('Testetesteteste', 113)}`;
      const pdf = readPdf(
        await renderAuthorizationPdf({
          event: {
            name: `${name} 🎉`,
            startsAt: new Date('2026-12-13T02:30:00Z'),
            endsAt: new Date('2026-12-13T08:00:00Z'),
            venue,
            address,
          },
          minor: { name: minor, birthDate: '2010-05-20' },
          partyx: config.partyx,
          document: legalDocument(config, 'autorizacao-menor'),
          logo: LOGO,
        }),
      );
      const all = pdf.flat.join('');
      for (const piece of [name, `${venue},${address}`, minor.replace(/\s/g, ''), 'Usodaportaria', 'Termoversão1.0', 'AtendimentoPartyX:partyx992@gmail.com'])
        expect(all, piece.slice(0, 30)).toContain(piece);
      for (const w of pdf.words) {
        expect(w.xMax, w.text).toBeLessThanOrEqual(pdf.pageWidth - 40);
        expect(w.yMax, w.text).toBeLessThanOrEqual(pdf.pageHeight);
      }
      // Uma página sempre (pedido de 14/10/2026), mesmo com tudo no limite.
      expect(pdf.pages).toBe(1);
    },
  );
});
