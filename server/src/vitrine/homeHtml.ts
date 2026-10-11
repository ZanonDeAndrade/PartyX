import { formatInEventZone } from '../domain/time';
import { escapeHtml } from './og';
import type { PublicEventCard } from './service';

export interface HomeData {
  featured: PublicEventCard[];
  upcoming: PublicEventCard[];
}

/** Id do bloco de dados lido pelo front-end (`src/site/embedded.ts`). */
export const HOME_DATA_ID = 'px-home-data';

/**
 * JSON seguro dentro de `<script>`: todo `<` vira o escape unicode `\u003c` (um nome de evento com `</script>` não fecha a tag) e os separadores
 * de linha U+2028/U+2029 são escapados. O bloco é `type="application/json"`: o navegador não o executa, e a CSP
 * (`script-src 'self'`) não se aplica a ele.
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Página inicial com os dados da vitrine no HTML (LCP): o front-end desenha o destaque sem esperar a API, e o banner do
 * destaque começa a baixar junto com o HTML (`preload` com `fetchpriority="high"`, nas mesmas larguras do `<img>`).
 */
export function injectHome(template: string, data: HomeData): string {
  const tags: string[] = [];
  const featured = data.featured[0];
  if (featured?.bannerUrl && /^https?:\/\//i.test(featured.bannerUrl)) {
    const srcset = featured.bannerSrcSet
      ? ` imagesrcset="${escapeHtml(featured.bannerSrcSet)}" imagesizes="100vw"`
      : '';
    tags.push(
      `<link rel="preload" as="image" href="${escapeHtml(featured.bannerUrl)}"${srcset} fetchpriority="high" />`,
    );
  }
  tags.push(`<script id="${HOME_DATA_ID}" type="application/json">${safeJson(data)}</script>`);
  const head = template.replace('</head>', () => `    ${tags.join('\n    ')}\n  </head>`);
  if (!featured) return head;
  // Cabeçalho e destaque desenhados já no HTML: aparecem sem esperar o JavaScript. O React substitui pelo mesmo conteúdo
  // ao montar (createRoot troca o que houver em #root); elementos trocados não contam como deslocamento de layout.
  // A última ocorrência é a etiqueta de verdade: o `<head>` tem um comentário que cita `<body>`.
  const at = head.lastIndexOf('<body>');
  const withBody = at < 0 ? head : `${head.slice(0, at)}<body class="px-site px-dark">${head.slice(at + 6)}`;
  return withBody.replace('<div id="root"></div>', () => `<div id="root">${heroShell(featured)}</div>`);
}

const brl = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

/**
 * Mesma marcação e classes do destaque de `src/site/pages.tsx` (HomePage) e do cabeçalho de `components.tsx`: ao mudar um,
 * mude o outro, ou o destaque "pula" quando o React assume. Só leitura: sem links ativos nem formulários (aria-hidden).
 */
function heroShell(e: PublicEventCard): string {
  const start = new Date(e.startsAt);
  const day = formatInEventZone(start, { day: '2-digit' });
  const month = formatInEventZone(start, { month: 'short' }).replace(/\./g, '');
  const weekday = formatInEventZone(start, { weekday: 'long' });
  const time = formatInEventZone(start, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const img = e.bannerUrl
    ? `<img src="${escapeHtml(e.bannerUrl)}"${
        e.bannerSrcSet ? ` srcset="${escapeHtml(e.bannerSrcSet)}" sizes="100vw"` : ''
      } alt="" fetchpriority="high" decoding="async" />`
    : '';
  const price =
    e.sale.minPriceCents !== null
      ? `<span class="px-hero-price">a partir de <b>${escapeHtml(brl(e.sale.minPriceCents))}</b></span>`
      : '';
  return [
    '<div aria-hidden="true">',
    '<header class="px-header"><div class="px-wrap px-header-in"><span class="px-logo">',
    '<img src="/brand/partyx-logo.png" width="65" height="36" alt="" /></span></div></header>',
    '<main><section class="px-hero">',
    `<div class="px-banner px-hero-media">${img}</div>`,
    '<div class="px-wrap px-hero-in">',
    '<p class="px-hero-tag">Em destaque</p>',
    `<h2 class="px-hero-title"><span>${escapeHtml(e.name)}</span></h2>`,
    '<div class="px-hero-meta"><span class="px-stub px-stub-lg">',
    `<span class="px-stub-day">${escapeHtml(day)}</span><span class="px-stub-month">${escapeHtml(month)}</span></span>`,
    `<p><b>${escapeHtml(weekday.charAt(0).toUpperCase() + weekday.slice(1))}, às ${escapeHtml(time)}</b>`,
    `<span>${escapeHtml(e.venue)}</span></p></div>`,
    `<div class="px-hero-cta"><span class="px-btn px-btn-pri px-btn-lg">Comprar ingressos</span>${price}</div>`,
    '</div></section></main></div>',
  ].join('');
}
