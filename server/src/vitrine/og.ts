import { formatInEventZone } from '../domain/time';
import type { PublicEventDetail } from './service';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escapa texto para valor de atributo ou conteúdo de tag. Nome e descrição do evento vêm do painel e nunca entram crus no HTML. */
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, ch => ESCAPES[ch]!);

export interface PageMeta {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
}

export const SITE_TITLE = 'PartyX · Ingressos';
export const SITE_DESCRIPTION = 'Compre ingressos para os próximos eventos da PartyX, com Pix ou cartão.';

const REGION = /<!--og:start-->[\s\S]*?<!--og:end-->/;
const isHttpUrl = (u: string) => /^https?:\/\//i.test(u);

/** Bloco de tags para o `<head>`. Sem imagem, o cartão fica simples (sem `og:image`). */
export function metaTags(meta: PageMeta): string {
  const image = meta.imageUrl && isHttpUrl(meta.imageUrl) ? meta.imageUrl : null;
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.url)}" />`,
    `<meta property="og:site_name" content="PartyX" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  ];
  if (image) {
    tags.push(
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    );
  }
  return `<!--og:start-->\n    ${tags.join('\n    ')}\n    <!--og:end-->`;
}

/** Troca a região marcada do `index.html` pelas tags da página. Sem a região, insere antes de `</head>`. */
export function injectMeta(template: string, meta: PageMeta): string {
  const block = metaTags(meta);
  // Função de substituição: `$` no texto do evento não pode virar padrão de substituição.
  if (REGION.test(template)) return template.replace(REGION, () => block);
  return template.replace('</head>', () => `    ${block}\n  </head>`);
}

export function eventMeta(event: PublicEventDetail, baseUrl: string): PageMeta {
  const start = new Date(event.startsAt);
  const date = formatInEventZone(start, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = formatInEventZone(start, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const lead = `${date} às ${time} · ${event.venue}`;
  const body = event.description.replace(/\s+/g, ' ').trim();
  const description = body ? `${lead}. ${body.length > 140 ? `${body.slice(0, 137).trimEnd()}...` : body}` : lead;
  return {
    title: `${event.name} · PartyX`,
    description,
    url: `${baseUrl.replace(/\/$/, '')}/eventos/${event.slug}`,
    imageUrl: event.shareImageUrl ?? undefined,
  };
}
