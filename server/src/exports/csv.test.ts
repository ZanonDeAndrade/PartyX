import { describe, expect, it } from 'vitest';
import { BOM, formatMoney, int, money, neutralize, safeFilename, toCsv } from './csv';

/** Leitor de CSV com ponto e vírgula e aspas, para provar que o que sai pode ser lido de volta. */
function parse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') {
      row.push(field);
      field = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += c;
  }
  return rows;
}

describe('CSV para Excel (CA-31)', () => {
  it('começa com BOM UTF-8, usa ponto e vírgula e CRLF', () => {
    const csv = toCsv(['Nome', 'Valor'], [['José', money(1234)]]);
    expect(csv.startsWith(BOM)).toBe(true);
    const bytes = Buffer.from(csv, 'utf8');
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv).toContain('Nome;Valor\r\nJosé;12,34\r\n');
    expect(csv).not.toMatch(/(?<!\r)\n/);
  });

  it('acentos, cedilha e símbolos sobrevivem à ida e volta em UTF-8', () => {
    const names = ['José da Conceição', 'Ângela Müller', 'Zoë “Zé” d’Ávila', 'João Çelik — Ñandú', 'Fernão € 5'];
    const csv = toCsv(
      ['Comprador'],
      names.map(n => [n]),
    );
    const decoded = new TextDecoder('utf-8').decode(Buffer.from(csv, 'utf8')).replace(/^﻿/, '');
    expect(
      parse(decoded)
        .slice(1)
        .map(r => r[0]),
    ).toEqual(names);
    expect(csv).not.toContain('�');
  });

  it('dinheiro sai em reais com vírgula, sem símbolo, a partir de centavos inteiros, e inteiros sem formatação', () => {
    expect([0, 5, 99, 100, 8000, 123456, 100000000, -150].map(formatMoney)).toEqual([
      '0,00',
      '0,05',
      '0,99',
      '1,00',
      '80,00',
      '1234,56',
      '1000000,00',
      '-1,50',
    ]);
    expect(() => formatMoney(10.5)).toThrow();
    expect(() => formatMoney(NaN)).toThrow();
    const csv = toCsv(
      ['Qtd', 'Valor'],
      [
        [int(3), money(24000)],
        [int(-2), money(-500)],
      ],
    );
    expect(parse(csv.slice(1)).slice(1, 3)).toEqual([
      ['3', '240,00'],
      ['-2', '-5,00'],
    ]); // negativo numérico não é "neutralizado"
  });

  it('campo com ponto e vírgula, aspas ou quebra de linha é protegido e volta igual (a quebra vira espaço)', () => {
    const tricky = ['Festa; com ponto e vírgula', 'Ele disse "oi"', 'linha 1\nlinha 2', 'a\r\nb', 'normal'];
    const csv = toCsv(
      ['Texto'],
      tricky.map(t => [t]),
    );
    expect(csv).toContain('"Festa; com ponto e vírgula"');
    expect(csv).toContain('"Ele disse ""oi"""');
    const back = parse(csv.slice(1))
      .slice(1)
      .map(r => r[0]);
    expect(back).toEqual(['Festa; com ponto e vírgula', 'Ele disse "oi"', 'linha 1 linha 2', 'a b', 'normal']);
    expect(parse(csv.slice(1))).toHaveLength(tricky.length + 1); // cabeçalho + linhas: nenhuma linha extra por quebra embutida
  });
});

describe('injeção de fórmula (CWE-1236)', () => {
  const dangerous = [
    '=1+1',
    "=cmd|' /C calc'!A0",
    '+55 (55) 99812-4470',
    '-2+3',
    '@SUM(A1:A9)',
    '\t=1+1',
    '\r=1+1',
    ' =1+1',
    '   +cmd',
    '=HYPERLINK("http://mau.example","clique")',
    '|calc',
    '=IMPORTXML("http://mau.example","//a")',
    '-@',
  ];
  it('todo texto que começaria uma fórmula ganha apóstrofo, e nenhuma célula do arquivo começa com um gatilho', () => {
    const csv = toCsv(
      ['Nome'],
      dangerous.map(d => [d]),
    );
    for (const row of parse(csv.slice(1)).slice(1)) {
      expect(row[0], row[0]).not.toMatch(/^[\s]*[=+\-@|\t\r]/);
      expect(row[0]!.startsWith("'")).toBe(true);
    }
  });
  it('o texto original continua legível depois do apóstrofo', () => {
    expect(neutralize('=1+1')).toBe("'=1+1");
    expect(neutralize('+5511')).toBe("'+5511");
  });
  it('texto comum não é alterado: acento, número solto, hífen no meio, código do ingresso', () => {
    for (const ok of [
      'José',
      '2026-12-12',
      'PX-ABCD-2345',
      'R$ 80,00',
      'a=b',
      'Pista - VIP',
      '***.456.789-**',
      '10:30',
      'Noite Neon Verão',
    ]) {
      expect(neutralize(ok), ok).toBe(ok);
    }
  });
  it('números tipados não passam pela neutralização (negativos continuam números)', () => {
    expect(parse(toCsv(['N'], [[int(-5)]]).slice(1))[1]).toEqual(['-5']);
  });
  it('caracteres de controle são removidos', () => {
    expect(neutralize('a\u0000b\u0007c\u001bd')).toBe('abcd');
  });
  it('um nome malicioso dentro de aspas também é neutralizado', () => {
    const csv = toCsv(['Nome'], [['=1+1; "x"']]);
    expect(csv).toContain(`"'=1+1; ""x"""`);
  });
});

describe('abre no Excel sem reclamar', () => {
  it('recusa montar arquivo cuja primeira coluna se chama ID (o Excel leria como SYLK)', () => {
    expect(() => toCsv(['ID', 'Nome'], [])).toThrow(/SYLK/);
    expect(() => toCsv(['id'], [])).toThrow(/SYLK/);
    expect(() => toCsv(['Pedido', 'ID'], [])).not.toThrow();
  });
  it('linha em branco separa o rodapé da tabela, que continua limpa', () => {
    const csv = toCsv(
      ['A', 'B'],
      [
        ['x', int(1)],
        ['y', int(2)],
      ],
      [
        ['TOTAL', int(3)],
        ['Filtros', 'Evento: X'],
      ],
    );
    const rows = parse(csv.slice(1));
    expect(rows.slice(0, 3)).toEqual([
      ['A', 'B'],
      ['x', '1'],
      ['y', '2'],
    ]);
    expect(rows[3]).toEqual(['']);
    expect(rows.slice(4, 6)).toEqual([
      ['TOTAL', '3'],
      ['Filtros', 'Evento: X'],
    ]);
  });
  it('é determinístico', () => {
    const make = () => toCsv(['A'], [['José'], [money(5)]]);
    expect(make()).toBe(make());
  });
});

describe('nome de arquivo', () => {
  it('sem acento, minúsculo, sem espaço nem caractere perigoso', () => {
    expect(safeFilename('Relatório de Vendas', 'Noite Neon: Verão/2026', '2026-12-01')).toBe(
      'relatorio-de-vendas_noite-neon-verao-2026_2026-12-01',
    );
    expect(safeFilename('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFilename('')).toBe('exportacao');
    expect(safeFilename('a"b\r\nc')).not.toMatch(/["\r\n]/);
  });
});
