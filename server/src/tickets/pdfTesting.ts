import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Só para testes: lê um PDF com as ferramentas do poppler (pdfinfo, pdftotext) como um leitor faria. Sem elas, os testes que
 * dependem disto são pulados com `it.skipIf(!HAS_POPPLER)` (no CI e na máquina de desenvolvimento elas existem).
 */
export const HAS_POPPLER = spawnSync('pdftotext', ['-v']).status === 0 && spawnSync('pdfinfo', ['-v']).status === 0;

export interface PdfWord {
  page: number;
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface PdfRead {
  pages: number;
  pageWidth: number;
  pageHeight: number;
  /** Texto de cada página na ordem em que foi desenhado, sem espaço nem quebra de linha: um texto quebrado em linhas continua inteiro. */
  flat: string[];
  words: PdfWord[];
}

export function readPdf(bytes: Buffer): PdfRead {
  const dir = mkdtempSync(path.join(tmpdir(), 'px-pdf-'));
  const file = path.join(dir, 'a.pdf');
  writeFileSync(file, bytes);
  const info = spawnSync('pdfinfo', [file], { encoding: 'utf8' }).stdout;
  const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
  const [, w, h] = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info) ?? [];
  const raw = spawnSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' }).stdout;
  const flat = raw
    .split('\f')
    .slice(0, pages)
    .map(p => p.replace(/\s+/g, ''));
  const bbox = spawnSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' }).stdout;
  const words: PdfWord[] = [];
  let page = 0;
  for (const line of bbox.split('\n')) {
    if (line.includes('<page ')) page++;
    const m = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*)<\/word>/.exec(line);
    if (m) words.push({ page, xMin: +m[1]!, yMin: +m[2]!, xMax: +m[3]!, yMax: +m[4]!, text: m[5]! });
  }
  return { pages, pageWidth: Number(w), pageHeight: Number(h), flat, words };
}

/** Texto do tamanho que se pede, repetindo a palavra, sem espaço (o pior caso de quebra). */
export const longWord = (word: string, size: number) => word.repeat(Math.ceil(size / word.length)).slice(0, size);
