import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { formatInEventZone } from '../domain/time';
import type { TicketDetail } from './service';

/**
 * PDF do ingresso (RF-41, CA-21). Um PDF por ingresso ou um PDF com todos os do pedido, uma página por ingresso, com:
 * evento, data, horário, local, tipo, nome do comprador, código de identificação e o QR Code (desenhado em vetor, nítido em
 * qualquer zoom e na impressão). **Sem CPF** (D-07). Ingresso cancelado sai com a marca CANCELADO e sem QR.
 *
 * Limite: as fontes padrão do PDF cobrem Latin-1 (acentos do português). Caracteres fora disso (emoji, outros alfabetos)
 * viram "?". Para suportá-los seria preciso embutir uma fonte Unicode (ver docs/ingressos.md).
 */

/** Troca por "?" o que a fonte padrão não desenha, para o PDF nunca sair com lixo. */
export function toLatin1(text: string): string {
  const keep = new Set(['–', '—', '‘', '’', '“', '”', '•', '€', '…']);
  return [...text.normalize('NFC')]
    .map(ch => {
      const code = ch.codePointAt(0)!;
      if ((code >= 0x20 && code <= 0xff) || keep.has(ch)) return ch;
      if (code === 0x0a || code === 0x09) return ' ';
      return '?';
    })
    .join('');
}

const PURPLE = '#5B21B6';
const VIOLET = '#7C3AED';
const INK = '#0B0B10';
const MUTED = '#5B5B70';
const LINE = '#C9C9D6';

function drawQr(doc: PDFKit.PDFDocument, payload: string, x: number, y: number, size: number) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const quiet = 4; // faixa branca obrigatória ao redor, para a leitura
  const cell = size / (n + quiet * 2);
  doc.save();
  doc.rect(x, y, size, size).fill('#FFFFFF');
  doc.fillColor('#000000');
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.data[r * n + c])
        doc.rect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.2, cell + 0.2).fill();
    }
  }
  doc.restore();
}

/**
 * Bloco de data da identidade (dia grande e mês), com o canto inferior direito cortado na diagonal do X do logotipo.
 * Só texto e um polígono: imprime bem em preto e branco.
 */
function drawDateBlock(doc: PDFKit.PDFDocument, x: number, y: number, day: string, month: string) {
  const w = 64;
  const h = 72;
  doc.save();
  doc.polygon([x, y], [x + w, y], [x + w, y + h - 14], [x + w - 10, y + h], [x, y + h]).fill(VIOLET);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(30)
    .text(day, x, y + 9, { width: w, align: 'center', lineBreak: false });
  doc.fontSize(12).text(toLatin1(month.toUpperCase()), x, y + 44, { width: w, align: 'center', lineBreak: false });
  doc.restore();
}

/** Altura da faixa do topo e da logo, centralizada na vertical. Faixa fina: o PDF é feito para imprimir. */
const BAND_H = 56;
const LOGO_H = 30;

function page(
  doc: PDFKit.PDFDocument,
  t: TicketDetail,
  position: { index: number; total: number },
  logo: string | undefined,
) {
  const W = doc.page.width;
  const M = 50;
  const start = new Date(t.event.startsAt);
  const date = formatInEventZone(start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = formatInEventZone(start, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const day = formatInEventZone(start, { day: '2-digit' });
  const month = formatInEventZone(start, { month: 'short' }).replace(/\./g, '');

  // Faixa da marca, com o número do pedido à direita.
  doc.rect(0, 0, W, BAND_H).fill(INK);
  if (logo) doc.image(logo, M, (BAND_H - LOGO_H) / 2, { height: LOGO_H });
  else doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text('PartyX', M, 17);
  doc
    .fillColor('#C4B5FD')
    .font('Helvetica')
    .fontSize(10)
    .text(`Pedido PX-${t.orderNumber}`, M, (BAND_H - 10) / 2, { width: W - 2 * M, align: 'right' });

  // Evento: bloco de data e, ao lado, nome, data por extenso, local e classificação.
  const top = BAND_H + 34;
  drawDateBlock(doc, M, top, day, month);
  const tx = M + 82;
  const tw = W - tx - M;
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text(toLatin1(t.event.name), tx, top - 2, { width: tw });
  doc
    .moveDown(0.25)
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(PURPLE)
    .text(toLatin1(`${date}, às ${time}`), tx, undefined, { width: tw });
  doc
    .moveDown(0.15)
    .font('Helvetica')
    .fillColor(INK)
    .fontSize(12)
    .text(toLatin1(`${t.event.venue}, ${t.event.address}`), tx, undefined, { width: tw });
  doc
    .moveDown(0.15)
    .fillColor(MUTED)
    .fontSize(10)
    .text(toLatin1(`Classificação: ${t.event.ageRating}`), tx, undefined, { width: tw });

  // Tipo e comprador (nome em todas as unidades; sem CPF).
  const fields = Math.max(doc.y, top + 72) + 22;
  doc
    .moveTo(M, fields - 10)
    .lineTo(W - M, fields - 10)
    .lineWidth(0.6)
    .stroke(LINE);
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Tipo', M, fields);
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(toLatin1(t.typeName), M, fields + 13, { width: 230 });
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Comprador', 300, fields);
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(toLatin1(t.holderName), 300, fields + 13, { width: W - 300 - M });

  // Picote: linha tracejada com meia-lua nas bordas, separando o canhoto do QR.
  const cut = Math.max(doc.y, fields + 40) + 18;
  doc.save();
  doc
    .moveTo(M, cut)
    .lineTo(W - M, cut)
    .lineWidth(1)
    .dash(5, { space: 4 })
    .stroke(LINE)
    .undash();
  doc.circle(0, cut, 10).lineWidth(1).stroke(LINE);
  doc.circle(W, cut, 10).lineWidth(1).stroke(LINE);
  doc.restore();

  const qrSize = 300;
  const qrY = cut + 26;
  if (t.status === 'cancelado' || !t.qrPayload) {
    doc
      .rect((W - qrSize) / 2, qrY, qrSize, qrSize)
      .lineWidth(2)
      .dash(6, { space: 4 })
      .stroke('#991B1B')
      .undash();
    doc
      .fillColor('#991B1B')
      .font('Helvetica-Bold')
      .fontSize(34)
      .text('CANCELADO', (W - qrSize) / 2, qrY + qrSize / 2 - 20, { width: qrSize, align: 'center' });
  } else {
    drawQr(doc, t.qrPayload, (W - qrSize) / 2, qrY, qrSize);
  }

  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(10)
    .text(toLatin1('Código do ingresso'), M, qrY + qrSize + 14, { width: W - 2 * M, align: 'center' });
  doc
    .fillColor(INK)
    .font('Courier-Bold')
    .fontSize(22)
    .text(t.shortCode, M, qrY + qrSize + 28, { width: W - 2 * M, align: 'center' });

  // Duas linhas separadas: `toLatin1` troca quebra de linha por espaço.
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(10)
    .text(
      toLatin1('Apresente este QR Code na entrada. Cada ingresso vale uma única entrada.'),
      M,
      doc.page.height - 66,
      {
        width: W - 2 * M,
        align: 'center',
      },
    )
    .text(toLatin1(`Pedido PX-${t.orderNumber}, ingresso ${position.index} de ${position.total}.`), M, undefined, {
      width: W - 2 * M,
      align: 'center',
    });
}

/**
 * Gera o PDF em memória. `title` vai nos metadados do arquivo. `logo`: PNG da logo branca com fundo transparente
 * (public/brand/partyx-logo-print.png); sem ela, o nome sai em texto.
 */
export function renderTicketsPdf(list: TicketDetail[], title: string, logo?: Buffer): Promise<Buffer> {
  // Como texto (data URI), o pdfkit embute a imagem uma vez e a reaproveita em todas as páginas.
  const logoSrc = logo ? `data:image/png;base64,${logo.toString('base64')}` : undefined;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      info: { Title: toLatin1(title), Author: 'PartyX', Creator: 'PartyX' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    list.forEach((t, i) => {
      if (i > 0) doc.addPage();
      page(doc, t, { index: i + 1, total: list.length }, logoSrc);
    });
    doc.end();
  });
}
