import PDFDocument from 'pdfkit';
import { formatEventDateTime } from '../domain/time';
import { toLatin1 } from '../tickets/pdf';
import type { Contingency, ContingencyTicket } from './service';

/**
 * Lista impressa da portaria (RF-64, seção 15.1). Contingência física: é papel para conferir nome e código se o sistema cair,
 * não validação offline. Ordem alfabética do comprador, uma caixa para marcar a entrada, CPF mascarado. Cancelados vão
 * numa seção própria, destacada. Cada página repete evento e hora de geração e traz "Página X de Y".
 */
const M = 36;
const ROW = 17;
const COLS = [
  { label: 'OK', x: M, w: 26 },
  { label: 'CÓDIGO', x: M + 26, w: 78 },
  { label: 'COMPRADOR', x: M + 104, w: 210 },
  { label: 'CPF', x: M + 314, w: 82 },
  { label: 'TIPO', x: M + 396, w: 90 },
  { label: 'PEDIDO', x: M + 486, w: 50 },
] as const;

export function renderContingencyPdf(c: Contingency): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: M,
      bufferPages: true,
      info: { Title: toLatin1(`Lista de portaria — ${c.event.name}`), Producer: 'PartyX' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', d => chunks.push(d as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const bottom = doc.page.height - M - 24;
    const generated = formatEventDateTime(c.generatedAt);

    const header = () => {
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(toLatin1(c.event.name), M, M, { width: 523 });
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          toLatin1(
            `${formatEventDateTime(new Date(c.event.startsAt))} · ${c.event.venue} · Lista gerada em ${generated}`,
          ),
          M,
          doc.y,
          { width: 523 },
        );
      doc.moveDown(0.4);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(8);
      for (const col of COLS) doc.text(toLatin1(col.label), col.x, y, { width: col.w });
      doc
        .moveTo(M, y + 11)
        .lineTo(M + 536, y + 11)
        .lineWidth(0.7)
        .stroke('#000');
      doc.y = y + 15;
    };
    const ensure = (h: number) => {
      if (doc.y + h > bottom) {
        doc.addPage();
        header();
      }
    };

    // Capa: resumo antes da lista.
    doc.font('Helvetica-Bold').fontSize(17).text(toLatin1('LISTA DE PORTARIA — CONTINGÊNCIA'), M, M);
    doc.moveDown(0.5).fontSize(14).text(toLatin1(c.event.name));
    doc
      .font('Helvetica')
      .fontSize(10)
      .moveDown(0.3)
      .text(toLatin1(`${formatEventDateTime(new Date(c.event.startsAt))} · ${c.event.venue}, ${c.event.address}`))
      .text(`Lista gerada em ${generated}`);
    doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).text(`Ingressos para liberar: ${c.admit.length}`);
    doc.font('Helvetica').fontSize(10);
    for (const t of c.byType) doc.text(toLatin1(`   ${t.typeName}: ${t.total}`));
    doc.font('Helvetica-Bold').text(`Cancelados (NÃO liberar a entrada): ${c.cancelled.length}`);
    doc
      .moveDown(0.8)
      .font('Helvetica')
      .fontSize(9)
      .text(
        toLatin1(
          'Como usar: com o sistema no ar, valide sempre pelo QR Code. Esta lista é só para conferir nome e código se a internet ou o sistema falhar, e não substitui a validação. Ela é um retrato da hora de geração: ingressos emitidos ou cancelados depois não constam. Marque cada entrada na caixa. Contém dados pessoais (CPF mascarado): guarde em local fechado, não fotografe nem compartilhe, e destrua (picote) depois do evento.',
        ),
        { width: 523 },
      );

    const rows = (list: ContingencyTicket[], cancelled: boolean) => {
      for (const t of list) {
        ensure(ROW);
        const y = doc.y;
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(cancelled ? '#555' : '#000');
        doc
          .rect(COLS[0].x + 4, y + 1, 9, 9)
          .lineWidth(0.7)
          .stroke('#000');
        if (t.status === 'utilizado') doc.text('já usou', COLS[0].x + 14, y + 2, { width: 12, lineBreak: false });
        doc.font('Courier-Bold').text(t.shortCode, COLS[1].x, y + 1, { width: COLS[1].w, lineBreak: false });
        doc.font('Helvetica');
        doc.text(toLatin1(t.holderName), COLS[2].x, y + 1, {
          width: COLS[2].w - 4,
          height: 11,
          ellipsis: true,
          lineBreak: false,
        });
        doc.text(t.cpf ?? '', COLS[3].x, y + 1, { width: COLS[3].w, lineBreak: false });
        doc.text(toLatin1(t.typeName), COLS[4].x, y + 1, {
          width: COLS[4].w - 4,
          height: 11,
          ellipsis: true,
          lineBreak: false,
        });
        doc.text(`PX-${t.orderNumber}`, COLS[5].x, y + 1, { width: COLS[5].w, lineBreak: false });
        doc
          .moveTo(M, y + ROW - 2)
          .lineTo(M + 536, y + ROW - 2)
          .lineWidth(0.2)
          .stroke('#999');
        doc.y = y + ROW;
      }
    };

    doc.addPage();
    header();
    rows(c.admit, false);

    if (c.cancelled.length) {
      ensure(60);
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text('CANCELADOS — NÃO LIBERAR A ENTRADA', M, doc.y);
      doc.moveDown(0.4);
      rows(c.cancelled, true);
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#000')
        .text(
          `Página ${i + 1} de ${range.count} · ${toLatin1(c.event.name)} · CONFIDENCIAL: contém dados pessoais`,
          M,
          doc.page.height - M - 8,
          { width: 523, align: 'center', lineBreak: false },
        );
    }
    doc.end();
  });
}
