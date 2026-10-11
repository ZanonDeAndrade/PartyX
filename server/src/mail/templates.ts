import { escapeHtml } from '../vitrine/og';
import type { EmailTemplate } from '../providers/email';
import { headerSafe } from '../providers/email';

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
}

export interface Composed {
  subject: string;
  text: string;
  html: string;
}

const PURPLE = '#5B21B6';
/** Caminho da logo dos e-mails (gerada por reference/tools/brand-assets.mjs). Exibida a 58×32. */
export const EMAIL_LOGO_PATH = '/brand/partyx-logo-email.png';
const INK = '#0B0B10';
const MUTED = '#5B5B70';

interface Layout {
  preheader: string;
  title: string;
  paragraphs: string[];
  details?: { label: string; value: string }[];
  cta?: { label: string; url: string };
  footnote?: string;
}

function html(l: Layout, ctx: MailContext): string {
  const p = (t: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${INK};">${escapeHtml(t)}</p>`;
  const details = l.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #E4E4EC;border-radius:8px;">${l.details
        .map(
          d =>
            `<tr><td style="padding:10px 14px;font-size:13px;color:${MUTED};width:38%;">${escapeHtml(d.label)}</td><td style="padding:10px 14px;font-size:15px;color:${INK};font-weight:600;">${escapeHtml(d.value)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const cta = l.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="background:${PURPLE};border-radius:8px;"><a href="${escapeHtml(l.cta.url)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;">${escapeHtml(l.cta.label)}</a></td></tr></table>
       <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${MUTED};">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;">${escapeHtml(l.cta.url)}</span></p>`
    : '';
  const foot = l.footnote
    ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(l.footnote)}</p>`
    : '';
  const env = ctx.environmentLabel
    ? `<p style="margin:0 0 8px;font-size:12px;color:#854D0E;background:#FEF3C7;padding:6px 10px;border-radius:6px;">E-mail de teste (${escapeHtml(ctx.environmentLabel)}). Identidade visual provisória.</p>`
    : '';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(l.title)}</title></head>
<body style="margin:0;padding:0;background:#F3F3F8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F3F8;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
<tr><td bgcolor="${INK}" style="background:${INK};padding:18px 28px;"><img src="${escapeHtml(ctx.baseUrl + EMAIL_LOGO_PATH)}" width="58" height="32" alt="PartyX" style="display:block;width:58px;height:32px;border:0;outline:none;text-decoration:none;color:#FFFFFF;font-size:16px;line-height:32px;font-weight:900;font-family:Arial,Helvetica,sans-serif;"></td></tr>
<tr><td style="padding:28px;">
${env}<h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:${INK};">${escapeHtml(l.title)}</h1>
${l.paragraphs.map(p).join('\n')}
${details}${cta}${foot}
<hr style="border:0;border-top:1px solid #E4E4EC;margin:20px 0;">
<p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};">PartyX · Razão social, CNPJ e canais de atendimento: a fornecer pela PartyX.</p>
</td></tr></table></td></tr></table></body></html>`;
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
  if (l.footnote) lines.push(l.footnote, '');
  lines.push('PartyX · Razão social, CNPJ e canais de atendimento: a fornecer pela PartyX.');
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
    ],
    cta: { label: 'Acessar meus ingressos', url: `${ctx.baseUrl}/meus-ingressos` },
    footnote:
      'O botão abre Meus ingressos; é preciso entrar na sua conta para ver os QR Codes. Cancelamentos e reembolsos seguem a Política de Cancelamento da PartyX.',
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

export type { EmailTemplate };
