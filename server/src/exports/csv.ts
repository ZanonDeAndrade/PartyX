/**
 * CSV para Excel brasileiro (RF-63, CA-31). Formato documentado em `docs/exportacoes.md`:
 *
 * - **Codificação UTF-8 com BOM** (os 3 bytes `EF BB BF` no início): é o que faz o Excel ler acentos e `ç` corretamente
 *   sem pedir importação.
 * - **Delimitador ponto e vírgula (`;`)**: o Excel configurado em português usa vírgula como separador decimal e, por isso,
 *   espera `;` entre as colunas. Com `,` o arquivo abriria numa coluna só.
 * - Fim de linha CRLF; campo com `;`, aspas ou quebra de linha vai entre aspas, com aspas duplicadas.
 * - **Números de verdade**: inteiros sem formatação e dinheiro com vírgula decimal e sem símbolo (`1234,50`), para somar e
 *   ordenar na planilha. Nunca ponto flutuante: a conversão parte de centavos inteiros.
 * - **Texto neutralizado contra injeção de fórmula** (CWE-1236): texto que começaria uma fórmula no Excel ou no LibreOffice
 *   (`=`, `+`, `-`, `@`, tabulação, retorno de carro) ganha um apóstrofo na frente. Números não são afetados.
 * - Nenhuma célula começa com "ID" maiúsculo (o Excel confunde com o formato SYLK e recusa o arquivo).
 */

export type Cell = string | { n: number } | { cents: number } | null | undefined;

/** Inteiro como número da planilha. */
export const int = (n: number): Cell => ({ n });
/** Valor em centavos como dinheiro da planilha (`1234,50`). */
export const money = (cents: number): Cell => ({ cents });

const FORMULA_START = /^[\s\u0000-\u001f]*[=+\-@|]/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Texto seguro: sem controle estranho, sem quebra de linha e sem poder virar fórmula. */
export function neutralize(text: string): string {
  let t = text
    .normalize('NFC')
    .replace(/[\r\n]+/g, ' ')
    .replace(CONTROL, '');
  if (t.startsWith('\t')) t = t.replace(/^\t+/, ' ');
  if (FORMULA_START.test(t) || /^[\s]*\t/.test(t)) t = `'${t}`;
  // "ID" no começo do arquivo é lido como SYLK pelo Excel; um espaço antes evita isso sem mudar o sentido.
  return t;
}

export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError('valor em centavos precisa ser inteiro');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

function render(cell: Cell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'string') return neutralize(cell);
  if ('n' in cell) {
    if (!Number.isSafeInteger(cell.n)) throw new RangeError('inteiro inválido');
    return String(cell.n);
  }
  return formatMoney(cell.cents);
}

const DELIMITER = ';';
function quote(field: string): string {
  return /[;"\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}

export const BOM = '﻿';

/**
 * Monta o arquivo. `rows` entra como está; `footer` vem depois de uma linha em branco (totais, filtros, data), para a tabela
 * principal ficar limpa para filtrar e somar. A primeira célula do arquivo nunca é "ID".
 */
export function toCsv(header: string[], rows: Cell[][], footer: Cell[][] = []): string {
  const first = header[0] ?? '';
  if (/^ID$/i.test(first.trim())) throw new Error('a primeira coluna não pode se chamar "ID" (o Excel lê como SYLK)');
  const line = (cells: Cell[]) => cells.map(c => quote(render(c))).join(DELIMITER);
  const out = [line(header), ...rows.map(line)];
  if (footer.length) out.push('', ...footer.map(line));
  return BOM + out.join('\r\n') + '\r\n';
}

/** Nome de arquivo seguro, sem a extensão: sem acento, minúsculo, só letras, números e hífen (nada de ponto: nem `..`). */
export function safeFilename(...parts: string[]): string {
  return (
    parts
      .map(p =>
        p
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, ''),
      )
      .filter(Boolean)
      .join('_')
      .slice(0, 120) || 'exportacao'
  );
}
