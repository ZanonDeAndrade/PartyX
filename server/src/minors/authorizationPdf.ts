import PDFDocument from 'pdfkit';
import type { PartyxPublicInfo } from '../config';
import { formatInEventZone } from '../domain/time';
import type { LegalDocument } from '../legal/documents';
import { fitFontSize, toLatin1 } from '../tickets/pdf';

/**
 * Termo de Autorização e Responsabilidade para participação de menor (regras de menores, 14/10/2026). PDF de UMA página no visual do
 * modelo aprovado (`autorizacao-menor-modelo-1.pdf`, revisão de 14/10/2026): cabeçalho com o logo e o CNPJ, título, "Como usar",
 * 1. Evento (preenchido), 2. Menor (preenchido só quando o comprador é menor), 3. Responsável legal (em branco, à mão),
 * 4. Declarações, assinatura, o quadro de uso da portaria e o rodapé com o atendimento e a versão do texto.
 * O TEXTO ("Como usar" e as declarações) vem de `conteudo-legal/autorizacao-menor.txt`, versionado; o código só faz o leiaute.
 * Sem CPF impresso: os documentos são escritos à mão por quem preenche. Sem autorização judicial desde 14/10/2026 (D-85 revista).
 */
export interface AuthorizationInput {
  event: {
    name: string;
    startsAt: Date;
    endsAt: Date;
    venue: string;
    address: string;
  };
  /** Comprador menor: nome e data de nascimento (AAAA-MM-DD). Nulo: campos do menor em branco (acompanhante). */
  minor: { name: string; birthDate: string } | null;
  partyx: PartyxPublicInfo;
  document: Pick<LegalDocument, 'blocks' | 'version' | 'effectiveDate' | 'status'>;
  /** PNG do logo escuro (public/brand/partyx-logo-print-dark.png, 652 x 360). Sem ele, o nome sai em texto. */
  logo?: Buffer;
}

const INK = '#111111';
const MUTED = '#555555';
const RULE = '#9A9A9A';
const BOX_FILL = '#F1F1F1';

const W = 595.28; // A4
const PAGE_H = 841.89;
/** Margem de baixo: o rodapé termina aqui; texto que passasse dela abriria outra página. */
const BOTTOM = 22;
const M = 46;
const CW = W - 2 * M;

const date = (d: Date) => formatInEventZone(d, { day: '2-digit', month: '2-digit', year: 'numeric' });
const hour = (d: Date) => {
  const [h, m] = formatInEventZone(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).split(':');
  // Como no modelo: "das 23h30 às 5h" (sem zero à esquerda na hora).
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
};
const isoToBr = (iso: string) => iso.split('-').reverse().join('/');

/** Separa o texto do arquivo nas duas seções do termo: "Como usar" e as declarações numeradas. */
export function splitAuthorizationText(blocks: LegalDocument['blocks']) {
  let section: 'how' | 'decl' | null = null;
  const how: string[] = [];
  const decl: string[] = [];
  for (const b of blocks) {
    if (b.type === 'heading') {
      const h = b.text.toLowerCase();
      section = h.startsWith('como usar') ? 'how' : h.startsWith('declara') ? 'decl' : null;
      continue;
    }
    if (section === 'how') how.push(b.text);
    else if (section === 'decl') decl.push(b.text.replace(/^\d+\.\s*/, ''));
    else how.push(b.text); // sem seção (texto de homologação): vai no quadro de uso
  }
  return { howTo: how.join(' '), declarations: decl };
}

export function renderAuthorizationPdf(input: AuthorizationInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: BOTTOM - 4, left: M, right: M },
      info: { Title: toLatin1(`Autorização de menor: ${input.event.name}`), Author: 'PartyX' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    draw(doc, input);
    doc.end();
  });
}

function draw(doc: PDFKit.PDFDocument, input: AuthorizationInput) {
  const { event, minor, partyx, document } = input;
  const { howTo, declarations } = splitAuthorizationText(document.blocks);
  let y = 34;

  // Cabeçalho como no modelo: logo à esquerda, CNPJ à direita e uma linha fina embaixo. Sem razão social e sem endereço.
  const LOGO_H = 24;
  if (input.logo) doc.image(input.logo, M, y, { height: LOGO_H });
  else doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text('PARTYX', M, y + 3, { lineBreak: false });
  if (partyx.cnpj)
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8.5)
      .text(`CNPJ ${partyx.cnpj}`, M, y + 2, { width: CW, align: 'right', lineBreak: false });
  y += LOGO_H + 5;
  doc
    .moveTo(M, y)
    .lineTo(M + CW, y)
    .lineWidth(0.6)
    .strokeColor(INK)
    .stroke();
  y += 12;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(13.5);
  doc.text('TERMO DE AUTORIZAÇÃO E RESPONSABILIDADE', M, y, { width: CW, align: 'center' });
  y = doc.y;
  doc.text('PARA PARTICIPAÇÃO DE MENOR DE IDADE EM EVENTO', M, y, { width: CW, align: 'center' });
  y = doc.y + 10;

  // Como usar
  doc.font('Helvetica').fontSize(8.8);
  const howText = toLatin1(`Como usar: ${howTo}`);
  const howH = doc.heightOfString(howText, { width: CW - 16 }) + 12;
  doc.rect(M, y, CW, howH).fillAndStroke(BOX_FILL, RULE);
  doc.fillColor(INK).text(howText, M + 8, y + 6, { width: CW - 16 });
  y += howH + 12;

  const section = (title: string) => {
    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor(INK)
      .text(title, M + 4, y);
    y = doc.y + 3;
  };
  /**
   * Linha de campos: cada um com o rótulo pequeno, o valor (quando há) e a linha de preencher embaixo. Valor longo (nome do evento,
   * local, nome do menor) quebra em linhas, com fonte um pouco menor depois de duas, e a linha cresce para
   * caber: nada sai cortado.
   */
  const fields = (cols: { label: string; value?: string | null; w: number }[], h = 30) => {
    const sized = cols.map(col => {
      const width = CW * col.w - 6;
      if (!col.value) return { ...col, width, text: null, size: 9.6, valueH: 0 };
      const text = toLatin1(col.value);
      const size = fitFontSize(doc, text, 'Helvetica-Bold', [9.6, 8.4, 7.6], width, 2);
      return { ...col, width, text, size, valueH: doc.heightOfString(text, { width }) };
    });
    const rowH = Math.max(h, 11 + Math.max(...sized.map(c => c.valueH)) + 6);
    let x = M;
    for (const col of sized) {
      doc.font('Helvetica').fontSize(7.6).fillColor(MUTED).text(toLatin1(col.label), x, y, { width: col.width });
      if (col.text)
        doc.font('Helvetica-Bold').fontSize(col.size).fillColor(INK).text(col.text, x, y + 11, { width: col.width });
      x += CW * col.w;
    }
    doc
      .moveTo(M, y + rowH - 2)
      .lineTo(M + CW, y + rowH - 2)
      .lineWidth(0.6)
      .strokeColor(RULE)
      .stroke();
    y += rowH + 2;
  };

  section('1. Evento');
  fields([
    { label: 'Nome do evento', value: event.name, w: 0.6 },
    { label: 'Data', value: date(event.startsAt), w: 0.17 },
    { label: 'Horário (das / às)', value: `das ${hour(event.startsAt)} às ${hour(event.endsAt)}`, w: 0.23 },
  ]);
  fields([{ label: 'Local', value: `${event.venue}, ${event.address}`, w: 1 }]);
  y += 6;

  section('2. Menor de idade');
  fields([
    { label: 'Nome completo', value: minor?.name ?? null, w: 0.6 },
    { label: 'Data de nascimento', value: minor ? isoToBr(minor.birthDate) : null, w: 0.17 },
    { label: 'RG ou CPF', w: 0.23 },
  ]);
  fields([
    { label: 'Código do ingresso (PX-XXXX-XXXX)', w: 0.33 },
    { label: 'Telefone do(a) menor', w: 0.67 },
  ]);
  y += 6;

  section('3. Responsável legal');
  fields([
    { label: 'Nome completo', w: 0.6 },
    { label: 'CPF', w: 0.17 },
    { label: 'RG', w: 0.23 },
  ]);
  fields([
    { label: 'Parentesco: ( ) pai ( ) mãe ( ) tutor(a) ou guardião(ã) legal', w: 0.6 },
    { label: 'Telefone para contato durante o evento', w: 0.4 },
  ]);
  fields([{ label: 'Endereço completo', w: 1 }]);
  y += 8;

  section('4. Declarações do responsável');
  doc.font('Helvetica').fontSize(8.8).fillColor(INK);
  declarations.forEach((text, i) => {
    const label = `${i + 1}.`;
    doc.text(label, M + 4, y, { width: 16 });
    doc.text(toLatin1(text), M + 20, y, { width: CW - 22 });
    y = doc.y + 3;
  });

  // Rodapé medido antes: assinatura e quadro da portaria ficam logo acima dele, no pé da página. Atendimento vem da configuração
  // (PARTYX_SUPPORT_*); embaixo, discreta, a versão do texto (o papel fica retido na portaria e mostra qual texto foi assinado).
  const contact = [
    partyx.supportEmail,
    partyx.supportWhatsapp ? `WhatsApp ${partyx.supportWhatsapp}` : null,
    partyx.supportHours ? partyx.supportHours.charAt(0).toLowerCase() + partyx.supportHours.slice(1) : null,
  ].filter(Boolean) as string[];
  const official = document.status === 'oficial' && Boolean(document.version);
  const version = official
    ? `Termo versão ${document.version}${document.effectiveDate ? `, vigente desde ${isoToBr(document.effectiveDate)}` : ''}.`
    : 'AMBIENTE DE HOMOLOGAÇÃO: texto sem valor jurídico.';
  const contactText = contact.length ? toLatin1(`Atendimento PartyX: ${contact.join(' · ')}.`) : null;
  const versionText = toLatin1(version);
  const versionStyle = () =>
    official ? doc.font('Helvetica').fontSize(6.4).fillColor('#8A8A8A') : doc.font('Helvetica-Bold').fontSize(7.4).fillColor(INK);
  doc.font('Helvetica').fontSize(7.4);
  const contactH = contactText ? doc.heightOfString(contactText, { width: CW, align: 'center' }) + 1 : 0;
  versionStyle();
  const footerH = contactH + doc.heightOfString(versionText, { width: CW, align: 'center' });
  const footerY = PAGE_H - BOTTOM - footerH;
  const boxY = footerY - 38;
  const signY = boxY - 30;
  if (y + 18 > signY) {
    // Texto muito maior que o modelo: assinatura, portaria e rodapé vão para a página seguinte, sem cortar nada.
    doc.addPage();
  }

  doc.lineWidth(0.6).strokeColor(INK);
  doc
    .moveTo(M, signY)
    .lineTo(M + CW * 0.42, signY)
    .stroke();
  doc
    .moveTo(M + CW * 0.46, signY)
    .lineTo(M + CW, signY)
    .stroke();
  doc.font('Helvetica').fontSize(7.8).fillColor(MUTED);
  doc.text('Local e data', M, signY + 4, { width: CW * 0.42 });
  doc.text('Assinatura do responsável legal (igual à do documento)', M + CW * 0.46, signY + 4, { width: CW * 0.54 });

  doc.rect(M, boxY, CW, 30).lineWidth(0.6).strokeColor(RULE).stroke();
  doc.fillColor(MUTED).fontSize(7.8);
  doc.text(
    toLatin1(
      'Uso da portaria: ( ) documento original do(a) menor conferido ( ) cópia do documento do responsável anexada',
    ),
    M + 8,
    boxY + 5,
    { width: CW - 16 },
  );
  doc.text('Validador: ________________________________  Hora: ________', M + 8, boxY + 17, { width: CW - 16 });

  if (contactText)
    doc.font('Helvetica').fontSize(7.4).fillColor(MUTED).text(contactText, M, footerY, { width: CW, align: 'center' });
  versionStyle().text(versionText, M, footerY + contactH, { width: CW, align: 'center' });
}
