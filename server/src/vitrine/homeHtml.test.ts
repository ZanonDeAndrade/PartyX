import { describe, expect, it } from 'vitest';
import { injectHome, safeJson, type HomeData } from './homeHtml';
import type { PublicEventCard } from './service';

const TEMPLATE =
  '<!doctype html><html><head><!-- antes do <body> --><title>t</title></head>\n  <body>\n    <div id="root"></div>\n  </body></html>';

const card = (over: Partial<PublicEventCard> = {}): PublicEventCard => ({
  slug: 'noite',
  name: 'Noite <b>Roxa</b>',
  startsAt: '2026-12-13T01:00:00.000Z',
  venue: 'Galpão "22"',
  ageRating: '18 anos',
  bannerUrl: 'https://banners.exemplo.test/events/x/a.webp',
  bannerSrcSet: null,
  bannerPlaceholder: null,
  isFeatured: true,
  sale: { kind: 'open', label: 'À venda', minPriceCents: 4000, startsAt: null },
  accentColor: null,
  ...over,
});

describe('página inicial com a vitrine no HTML', () => {
  it('JSON seguro dentro de <script>: sem fechamento de tag nem separadores de linha crus', () => {
    const out = safeJson({ a: '</script><script>x</script>', b: 'linha\u2028nova\u2029fim' });
    expect(out).not.toContain('</script>');
    expect(out).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual({ a: '</script><script>x</script>', b: 'linha\u2028nova\u2029fim' });
  });

  it('desenha o destaque já no HTML, com texto escapado, e marca só a etiqueta <body> de verdade', () => {
    const html = injectHome(TEMPLATE, { featured: [card()], upcoming: [card()] });
    expect(html).toContain('<!-- antes do <body> -->');
    expect(html).toContain('<body class="px-site px-dark">');
    expect(html).toContain('<h2 class="px-hero-title"><span>Noite &lt;b&gt;Roxa&lt;/b&gt;</span></h2>');
    expect(html).toContain('<span>Galpão &quot;22&quot;</span>');
    // 01:00 UTC do dia 13 é sábado, 12 de dezembro, 22:00 em São Paulo.
    expect(html).toContain('<span class="px-stub-day">12</span><span class="px-stub-month">dez</span>');
    expect(html).toContain('<b>Sábado, às 22:00</b>');
    expect(html).toMatch(/a partir de <b>R\$\s40,00<\/b>/);
    expect(html).toContain('fetchpriority="high"');
  });

  it('capa com miniatura (0015): a miniatura vai atrás da capa no HTML, como variável CSS escapada', () => {
    const ph = 'data:image/webp;base64,UklGRkgAAABXRUJQ+/=';
    const html = injectHome(TEMPLATE, { featured: [card({ bannerPlaceholder: ph })], upcoming: [] });
    expect(html).toContain(`<div class="px-banner px-hero-media px-banner-ph" style="--px-ph:url(&quot;${ph}&quot;)"><img`);
    // Sem capa, a miniatura não aparece.
    const none = injectHome(TEMPLATE, { featured: [card({ bannerUrl: null, bannerPlaceholder: ph })], upcoming: [] });
    expect(none).not.toContain('px-banner-ph');
  });

  it('sem destaque: só os dados, sem cópia do destaque nem preload', () => {
    const data: HomeData = { featured: [], upcoming: [card({ isFeatured: false })] };
    const html = injectHome(TEMPLATE, data);
    expect(html).toContain('<div id="root"></div>');
    expect(html).not.toContain('rel="preload"');
    expect(html).toContain('<script id="px-home-data" type="application/json">');
  });
});
