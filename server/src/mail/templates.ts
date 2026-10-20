import { escapeHtml } from '../vitrine/og';
import type { EmailTemplate } from '../providers/email';
import { headerSafe } from '../providers/email';
import type { PartyxPublicInfo } from '../config';

/**
 * Composição dos e-mails (RF-36, RF-67): assunto, texto e HTML. Funções puras. Textos do design (E01, E02, E03).
 *
 * - **Só link, sem anexo e sem QR:** o QR de um ingresso é credencial. O e-mail leva ao Meus ingressos, onde é preciso entrar.
 * - Todo valor que vem do banco (nome, evento, local) é escapado no HTML e limpo de quebras de linha no assunto.
 * - O HTML usa tabela e estilos em linha (compatível com os clientes de e-mail) e sempre acompanha a versão em texto.
 * - Identidade visual **provisória** até a aprovação do cliente (Prompt 19): cores do protótipo. O logotipo já é o original:
 *   uma imagem pública e igual para todos (`/brand/partyx-logo-email.png`, URL absoluta, com o fundo da marca embutido), nunca
 *   anexo nem imagem por destinatário. Com imagens bloqueadas, aparece o texto alternativo "PartyX" em branco.
 */

export interface MailContext {
  /** Endereço público do site, sem barra final. */
  baseUrl: string;
  /** Em homologação e local o assunto ganha um prefixo para ninguém confundir com e-mail de produção. */
  environmentLabel: string | null;
  /** Dados e contatos públicos DA PARTYX (configuração `PARTYX_*`), para o rodapé. Ausentes: rodapé sem eles. */
  partyx?: PartyxPublicInfo;
}

export interface Composed {
  subject: string;
  text: string;
  html: string;
}

const PURPLE = '#5B21B6';
/** Roxo de ação do site: texto branco 5,7:1. */
const VIOLET = '#7C3AED';
/** Caminho da logo dos e-mails (gerada por reference/tools/brand-assets.mjs). Exibida a 58×32. */
export const EMAIL_LOGO_PATH = '/brand/partyx-logo-email.png';
const INK = '#0B0B10';
const MUTED = '#5B5B6E';
const LINE = '#E4E4EC';
const FONT = 'Arial,Helvetica,sans-serif';

/**
 * Rodapé com os dados e contatos públicos da PartyX, só os que vierem da configuração (D-16). Nunca o contato da contratada. Fora de
 * produção, o que faltar aparece como "a fornecer"; em produção, o item ausente é omitido (sem texto inventado).
 */
export function footerLines(ctx: MailContext): string[] {
  const p = ctx.partyx;
  const testing = ctx.environmentLabel !== null;
  const identity = ['PartyX', p?.legalName, p?.cnpj ? `CNPJ ${p.cnpj}` : null].filter(Boolean).join(' · ');
  const contacts = [
    p?.supportEmail ? `e-mail ${p.supportEmail}` : null,
    p?.supportWhatsapp ? `WhatsApp ${p.supportWhatsapp}` : null,
  ].filter(Boolean);
  const lines = [identity];
  if (p?.address) lines.push(p.address);
  if (contacts.length)
    lines.push(`Atendimento da PartyX: ${contacts.join(' · ')}${p?.supportHours ? ` (${p.supportHours})` : ''}`);
  if (testing && (!p?.legalName || !p?.cnpj)) lines.push('Razão social e CNPJ da PartyX: a fornecer.');
  if (testing && !contacts.length) lines.push('Canais de atendimento da PartyX: a fornecer.');
  return lines;
}

/**
 * Quebra de texto nos blocos com texto digitado (nome do evento, local, tipo, comprador, e-mail, link): palavra longa ou URL
 * quebra em qualquer ponto em vez de alargar a tabela do e-mail. `word-break: break-word` cobre clientes sem `overflow-wrap`.
 */
const WRAP = 'word-break:break-word;overflow-wrap:anywhere;';

interface Layout {
  preheader: string;
  title: string;
  paragraphs: string[];
  details?: { label: string; value: string }[];
  cta?: { label: string; url: string };
  /** Link secundário, depois do botão (ex.: a autorização de menor). Texto e endereço escapados como o resto. */
  link?: { lead: string; label: string; url: string };
  footnote?: string;
}

/**
 * Identidade do site em HTML de e-mail: faixa preta com a logo, linha roxa de destaque, título forte, detalhes em linhas
 * com divisória e botão roxo "à prova de clientes" (célula de tabela com fundo, não CSS de botão). Sem <style>, sem fonte
 * externa, sem imagem além da logo; funciona com imagens bloqueadas e no modo escuro forçado (cores sólidas).
 */
function html(l: Layout, ctx: MailContext): string {
  const p = (t: string) =>
    `<p style="${WRAP}margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.55;color:${INK};">${escapeHtml(t)}</p>`;
  const details = l.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;margin:4px 0 24px;border-collapse:collapse;border-top:2px solid ${INK};">${l.details
        .map(
          d =>
            `<tr><td valign="top" style="${WRAP}padding:11px 12px 11px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:13px;line-height:1.4;color:${MUTED};width:34%;">${escapeHtml(d.label)}</td><td valign="top" style="${WRAP}padding:11px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:15px;line-height:1.4;color:${INK};font-weight:700;">${escapeHtml(d.value)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const cta = l.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td bgcolor="${VIOLET}" style="background:${VIOLET};border-radius:8px;"><a href="${escapeHtml(l.cta.url)}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(l.cta.label)}</a></td></tr></table>
       <p style="${WRAP}margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;color:${PURPLE};">${escapeHtml(l.cta.url)}</span></p>`
    : '';
  const link = l.link
    ? `<p style="${WRAP}margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK};">${escapeHtml(l.link.lead)}<br><a href="${escapeHtml(l.link.url)}" style="color:${PURPLE};font-weight:700;">${escapeHtml(l.link.label)}</a></p>`
    : '';
  const foot = l.footnote
    ? `<p style="${WRAP}margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(l.footnote)}</p>`
    : '';
  const env = ctx.environmentLabel
    ? `<p style="margin:0 0 16px;font-family:${FONT};font-size:12px;color:#854D0E;background:#FEF3C7;padding:8px 12px;border-radius:6px;">E-mail de teste (${escapeHtml(ctx.environmentLabel)}). Identidade visual provisória.</p>`
    : '';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(l.title)}</title></head>
<body style="margin:0;padding:0;background:#F7F7FA;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7FA;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;max-width:560px;background:#FFFFFF;border:1px solid ${LINE};border-radius:12px;overflow:hidden;font-family:${FONT};">
<tr><td bgcolor="${INK}" style="background:${INK};padding:18px 28px;"><img src="${escapeHtml(ctx.baseUrl + EMAIL_LOGO_PATH)}" width="58" height="32" alt="PartyX" style="display:block;width:58px;height:32px;border:0;outline:none;text-decoration:none;color:#FFFFFF;font-size:16px;line-height:32px;font-weight:900;font-family:${FONT};"></td></tr>
<tr><td bgcolor="${VIOLET}" style="background:${VIOLET};height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:32px 28px 28px;">
${env}<h1 style="${WRAP}margin:0 0 18px;font-family:${FONT};font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-0.3px;color:${INK};">${escapeHtml(l.title)}</h1>
${l.paragraphs.map(p).join('\n')}
${details}${cta}${link}${foot}
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid ${LINE};background:#FAFAFC;"><p style="${WRAP}margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};">${footerLines(ctx).map(escapeHtml).join('<br>')}</p></td></tr>
</table></td></tr></table></body></html>`;
}

function text(l: Layout, ctx: MailContext): string {
  const lines = [
    ctx.environmentLabel ? `[E-mail de teste: ${ctx.environmentLabel}]\n` : '',
    l.title,
    '',
    ...l.paragraphs.flatMap(p => [p, '']),
  ];
  if (l.details?.length) lines.push(...l.details.map(d => `${d.label}: ${d.value}`), '');
  if (l.cta) lines.push(`${l.cta.label}:`, l.cta.url, '');
  if (l.link) lines.push(l.link.lead, `${l.link.label}:`, l.link.url, '');
  if (l.footnote) lines.push(l.footnote, '');
  lines.push(...footerLines(ctx));
  return lines.join('\n');
}

const subjectWith = (ctx: MailContext, subject: string) =>
  headerSafe(ctx.environmentLabel ? `[${ctx.environmentLabel}] ${subject}` : subject);

/** E01. Não exige confirmar o e-mail: a conta já funciona (RF-01, CA-01). */
export function composeCadastro(data: { name: string }, ctx: MailContext): Composed {
  const l: Layout = {
    preheader: 'Agora você pode comprar ingressos dos eventos da PartyX.',
    title: `Sua conta foi criada, ${data.name}`,
    paragraphs: [
      'Agora você pode comprar ingressos dos eventos da PartyX e acessar tudo em Meus ingressos. Não é preciso confirmar este e-mail para usar a conta.',
    ],
    cta: { label: 'Ver eventos', url: `${ctx.baseUrl}/eventos` },
    footnote: 'Se você não criou esta conta, fale com o atendimento da PartyX.',
  };
  return { subject: subjectWith(ctx, 'Sua conta PartyX foi criada'), text: text(l, ctx), html: html(l, ctx) };
}

/** E02. O link vale 1 hora e uma vez (RF-05). */
export function composeRecuperacao(data: { name: string; link: string }, ctx: MailContext): Composed {
  const l: Layout = {
    preheader: 'Crie uma nova senha para a sua conta.',
    title: 'Crie uma nova senha',
    paragraphs: [
      `Olá, ${data.name}.`,
      'Recebemos um pedido para redefinir a senha da sua conta. Use o botão abaixo para criar uma nova senha.',
    ],
    cta: { label: 'Criar nova senha', url: data.link },
    footnote:
      'O link vale por 1 hora e só pode ser usado uma vez. Se você não fez este pedido, ignore este e-mail: sua senha continua a mesma.',
  };
  return { subject: subjectWith(ctx, 'Criar nova senha na PartyX'), text: text(l, ctx), html: html(l, ctx) };
}

export interface PurchaseData {
  name: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  orderNumber: string;
  units: string;
  paidAt: string;
  lines: string[];
  /** Valor dos ingressos (sem a taxa de serviço), já formatado. */
  ticketsAmount: string;
  /** Desconto do promoter (D-91): "Desconto (DUDA)" e "−R$ 3,00". Nulo ou ausente sem desconto (a linha não aparece). */
  discount?: { label: string; value: string } | null;
  /** Taxa de serviço do pedido, formatada; nula quando o pedido não tem taxa (a linha não aparece). */
  serviceFee: string | null;
  totalPaid: string;
  /** Evento que permite menores de 16 e 17 anos: endereço da página que baixa a autorização do pedido (exige entrar na conta). */
  minorAuthorizationUrl?: string | null;
}

/** E03. Sem QR e sem anexo: o botão leva a Meus ingressos, onde é preciso entrar na conta (RF-36). */
export function composeCompra(data: PurchaseData, ctx: MailContext): Composed {
  const l: Layout = {
    preheader: `Pedido ${data.orderNumber} confirmado.`,
    title: 'Seus ingressos estão prontos',
    paragraphs: [
      `Pagamento aprovado em ${data.paidAt}. Emitimos ${data.units} em nome de ${data.name}, um para cada unidade, cada um com seu próprio QR Code.`,
    ],
    details: [
      { label: 'Evento', value: data.eventName },
      { label: 'Data', value: `${data.eventDate} às ${data.eventTime}` },
      { label: 'Local', value: data.venue },
      { label: 'Pedido', value: data.orderNumber },
      ...data.lines.map((line, i) => ({ label: i === 0 ? 'Ingressos' : '', value: line })),
      { label: 'Valor dos ingressos', value: data.ticketsAmount },
      ...(data.discount ? [data.discount] : []),
      ...(data.serviceFee ? [{ label: 'Taxa de serviço', value: data.serviceFee }] : []),
      { label: 'Total pago', value: data.totalPaid },
    ],
    cta: { label: 'Acessar meus ingressos', url: `${ctx.baseUrl}/meus-ingressos` },
    ...(data.minorAuthorizationUrl
      ? {
          link: {
            lead: 'Este evento permite a entrada de quem tiver 16 ou 17 anos na data do evento, com o Termo de Autorização e Responsabilidade preenchido e assinado pelo responsável legal, entregue na portaria com a cópia do documento dele.',
            label: 'Baixar o Termo de Autorização e Responsabilidade',
            url: data.minorAuthorizationUrl,
          },
        }
      : {}),
    footnote:
      'O botão abre Meus ingressos; é preciso entrar na sua conta para ver os QR Codes. Cancelamentos, transferências e reembolsos seguem a Política de Cancelamento, Troca e Reembolso da PartyX.',
  };
  return {
    subject: subjectWith(ctx, `Compra confirmada · ${data.eventName} · Pedido ${data.orderNumber}`),
    text: text(l, ctx),
    html: html(l, ctx),
  };
}

export interface PaidWithoutStockData {
  orderNumber: string;
  eventName: string;
  buyerName: string;
  buyerEmail: string;
  amount: string;
  paidAt: string;
  gatewayRef: string;
}

/**
 * Aviso aos administradores ativos: pagamento aprovado depois de a reserva vencer, sem ingresso disponível (seção 10.1).
 * Procedimento **provisório** (D-13 pendente): orienta o estorno pela PartyX no gateway; a plataforma não estorna nem promete prazo.
 * Sem CPF. O botão leva à lista de exceções do painel, onde é preciso entrar como administrador.
 */
export function composePagamentoSemEstoque(data: PaidWithoutStockData, ctx: MailContext): Composed {
  const l: Layout = {
    preheader: `Pedido ${data.orderNumber}: pagamento aprovado sem ingresso emitido.`,
    title: 'Pagamento recebido sem ingresso disponível',
    paragraphs: [
      `O gateway aprovou o pagamento do pedido ${data.orderNumber} depois do fim da reserva, quando as unidades já tinham sido vendidas. Nenhum ingresso foi emitido para este pedido.`,
      'Orientação: o estorno deve ser feito pela PartyX no painel do gateway de pagamento, usando a referência abaixo. A plataforma não estorna automaticamente. Depois de tratar o caso, marque-o como tratado no painel, informando o motivo.',
    ],
    details: [
      { label: 'Pedido', value: data.orderNumber },
      { label: 'Evento', value: data.eventName },
      { label: 'Comprador', value: data.buyerName },
      { label: 'E-mail do comprador', value: data.buyerEmail },
      { label: 'Valor', value: data.amount },
      { label: 'Aprovado em', value: data.paidAt },
      { label: 'Referência no gateway', value: data.gatewayRef },
    ],
    cta: { label: 'Abrir exceções no painel', url: `${ctx.baseUrl}/admin/excecoes` },
    footnote: 'Você recebe este aviso por ser administrador ativo da PartyX.',
  };
  return {
    subject: subjectWith(ctx, `Pagamento recebido sem ingresso disponível · Pedido ${data.orderNumber}`),
    text: text(l, ctx),
    html: html(l, ctx),
  };
}

/**
 * Transferência de ingresso (D-87). Nunca leva QR, código nem PDF: só o evento, o código curto novo (que não é credencial) e o nome
 * da outra pessoa mascarado ("Maria S. O.").
 */
export interface TransferData {
  name: string;
  /** O outro lado, mascarado. */
  other: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  typeName: string;
  shortCode: string;
  at: string;
}

/** Para quem transferiu. */
export function composeTransferenciaEnviada(data: TransferData, ctx: MailContext): Composed {
  const l: Layout = {
    preheader: `Seu ingresso de ${data.eventName} foi transferido para ${data.other}.`,
    title: 'Ingresso transferido',
    paragraphs: [
      `Olá, ${data.name}.`,
      `Você transferiu um ingresso de ${data.eventName} para ${data.other}. O ingresso saiu de Meus ingressos e o QR Code que você tinha deixou de valer, inclusive em capturas de tela, impressões e PDFs.`,
    ],
    details: [
      { label: 'Evento', value: data.eventName },
      { label: 'Data', value: `${data.eventDate} às ${data.eventTime}` },
      { label: 'Ingresso', value: data.typeName },
      { label: 'Transferido em', value: data.at },
    ],
    cta: { label: 'Abrir Meus ingressos', url: `${ctx.baseUrl}/meus-ingressos` },
    footnote:
      'Se você não fez esta transferência, troque sua senha e fale com o atendimento da PartyX o quanto antes. Transferências e reembolsos seguem a Política de Cancelamento, Troca e Reembolso.',
  };
  return {
    subject: subjectWith(ctx, `Ingresso transferido · ${data.eventName}`),
    text: text(l, ctx),
    html: html(l, ctx),
  };
}

/** Para quem recebeu. */
export function composeTransferenciaRecebida(data: TransferData, ctx: MailContext): Composed {
  const l: Layout = {
    preheader: `${data.other} transferiu um ingresso de ${data.eventName} para você.`,
    title: 'Você recebeu um ingresso',
    paragraphs: [
      `Olá, ${data.name}.`,
      `${data.other} transferiu para a sua conta um ingresso de ${data.eventName}. Ele já está em Meus ingressos, com um QR Code novo, em seu nome.`,
    ],
    details: [
      { label: 'Evento', value: data.eventName },
      { label: 'Data', value: `${data.eventDate} às ${data.eventTime}` },
      { label: 'Ingresso', value: data.typeName },
      { label: 'Código', value: data.shortCode },
      { label: 'Recebido em', value: data.at },
    ],
    cta: { label: 'Ver o ingresso', url: `${ctx.baseUrl}/meus-ingressos` },
    footnote:
      'É preciso entrar na sua conta para ver o QR Code. Se você comprou este ingresso de outra pessoa, a PartyX não participa da negociação. Transferências e reembolsos seguem a Política de Cancelamento, Troca e Reembolso.',
  };
  return {
    subject: subjectWith(ctx, `Você recebeu um ingresso · ${data.eventName}`),
    text: text(l, ctx),
    html: html(l, ctx),
  };
}

/** Desfeita pelo administrador (fraude): para os dois lados. `returned`: o ingresso voltou para esta pessoa. */
export function composeTransferenciaDesfeita(data: TransferData & { returned: boolean }, ctx: MailContext): Composed {
  const l: Layout = {
    preheader: `A PartyX desfez uma transferência de ingresso de ${data.eventName}.`,
    title: 'Transferência desfeita',
    paragraphs: [
      `Olá, ${data.name}.`,
      data.returned
        ? `A PartyX desfez a transferência do seu ingresso de ${data.eventName} para ${data.other}. O ingresso voltou para Meus ingressos, com um QR Code novo.`
        : `A PartyX desfez a transferência que ${data.other} fez para você de um ingresso de ${data.eventName}. O ingresso saiu da sua conta e o QR Code deixou de valer.`,
    ],
    details: [
      { label: 'Evento', value: data.eventName },
      { label: 'Data', value: `${data.eventDate} às ${data.eventTime}` },
      { label: 'Ingresso', value: data.typeName },
      { label: 'Desfeita em', value: data.at },
    ],
    cta: { label: 'Abrir Meus ingressos', url: `${ctx.baseUrl}/meus-ingressos` },
    footnote: 'Para entender o motivo, fale com o atendimento da PartyX.',
  };
  return {
    subject: subjectWith(ctx, `Transferência desfeita · ${data.eventName}`),
    text: text(l, ctx),
    html: html(l, ctx),
  };
}

export interface AccessData {
  name: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  slug: string;
}

/** Evento privado (D-92): a solicitação de acesso entrou na fila do organizador. */
export function composeAcessoSolicitado(data: AccessData, ctx: MailContext): Composed {
  const l: Layout = {
    preheader: `Recebemos seu pedido de acesso a ${data.eventName}.`,
    title: 'Solicitação recebida',
    paragraphs: [
      `Olá, ${data.name}.`,
      `Recebemos sua solicitação de acesso ao evento privado ${data.eventName}. O organizador decide quem pode comprar. Você recebe um e-mail quando a solicitação for aprovada.`,
    ],
    details: [
      { label: 'Evento', value: data.eventName },
      { label: 'Data', value: `${data.eventDate} às ${data.eventTime}` },
      { label: 'Local', value: data.venue },
    ],
    cta: { label: 'Ver o evento', url: `${ctx.baseUrl}/eventos/${data.slug}` },
    footnote:
      'A aprovação é decisão do organizador e não há prazo garantido. Uma solicitação não reserva ingresso: a compra só começa depois da aprovação, dentro das vendas do evento.',
  };
  return {
    subject: subjectWith(ctx, `Solicitação recebida · ${data.eventName}`),
    text: text(l, ctx),
    html: html(l, ctx),
  };
}

/** Evento privado (D-92): a solicitação foi aprovada; leva à página do evento, onde a compra fica liberada para a conta. */
export function composeAcessoLiberado(data: AccessData, ctx: MailContext): Composed {
  const l: Layout = {
    preheader: `Sua conta pode comprar ingressos para ${data.eventName}.`,
    title: 'Acesso liberado',
    paragraphs: [
      `Olá, ${data.name}.`,
      `O organizador aprovou sua solicitação para o evento privado ${data.eventName}. Entre na sua conta e compre pela página do evento.`,
    ],
    details: [
      { label: 'Evento', value: data.eventName },
      { label: 'Data', value: `${data.eventDate} às ${data.eventTime}` },
      { label: 'Local', value: data.venue },
    ],
    cta: { label: 'Ir para o evento', url: `${ctx.baseUrl}/eventos/${data.slug}` },
    footnote:
      'A liberação vale só para a sua conta. Os ingressos seguem as vendas, os lotes e a capacidade do evento; a aprovação não reserva ingresso.',
  };
  return {
    subject: subjectWith(ctx, `Acesso liberado · ${data.eventName}`),
    text: text(l, ctx),
    html: html(l, ctx),
  };
}

export type { EmailTemplate };
