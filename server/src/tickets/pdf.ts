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
const INK = '#0B0B10';
const MUTED = '#5B5B70';

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

/** Altura da logo na faixa do topo (70 pt): centralizada na vertical. */
const LOGO_H = 36;

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

  doc.rect(0, 0, W, 70).fill(INK);
  if (logo) doc.image(logo, M, (70 - LOGO_H) / 2, { height: LOGO_H });
  else doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(26).text('PartyX', M, 22);

  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(24)
    .text(toLatin1(t.event.name), M, 100, { width: W - 2 * M });
  doc
    .moveDown(0.4)
    .font('Helvetica')
    .fontSize(14)
    .fillColor(PURPLE)
    .text(toLatin1(`${date} · ${time}`), { width: W - 2 * M });
  doc
    .fillColor(INK)
    .fontSize(13)
    .text(toLatin1(`${t.event.venue} — ${t.event.address}`), { width: W - 2 * M });
  doc
    .fillColor(MUTED)
    .fontSize(11)
    .text(toLatin1(`Classificação: ${t.event.ageRating}`));

  doc.moveDown(1);
  const top = doc.y;
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('TIPO', M, top);
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(toLatin1(t.typeName), M, top + 13, { width: 230 });
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('COMPRADOR', 300, top);
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(toLatin1(t.holderName), 300, top + 13, { width: W - 300 - M });

  const qrSize = 300;
  const qrY = Math.max(doc.y, top + 50) + 25;
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
    .text('CÓDIGO DO INGRESSO', M, qrY + qrSize + 16, { width: W - 2 * M, align: 'center' });
  doc
    .fillColor(INK)
    .font('Courier-Bold')
    .fontSize(22)
    .text(t.shortCode, M, qrY + qrSize + 30, { width: W - 2 * M, align: 'center' });

  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(10)
    .text(
      toLatin1(
        `Apresente este QR Code na entrada. Cada ingresso vale uma única entrada.\nPedido PX-${t.orderNumber} · ingresso ${position.index} de ${position.total}.`,
      ),
      M,
      doc.page.height - 70,
      { width: W - 2 * M, align: 'center' },
    );
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
