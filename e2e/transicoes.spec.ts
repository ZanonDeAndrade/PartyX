import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, request as apiRequest, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import sharp from 'sharp';
import { TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Transições do site (15/10/2026, segunda versão: mais suaves). Eventos gravados direto no banco descartável, com capa enviada pela
 * API (como em produção, para a miniatura existir). Os estilos e tempos conferidos são os do navegador (getComputedStyle e Web
 * Animations). Tokens: entrada de 720 ms com curva cubic-bezier(0.16, 1, 0.3, 1), passo de 100 ms (sobreposição), subida de 8 px e
 * desfoque de 4 px só em texto; capa por troca (700 ms) e zoom de 1,04 para 1 (1200 ms), sem desfoque.
 */
const R = JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'state.json'), 'utf8')) as { base: string; url: string };
const OUT = path.join(TEXTOS_DIR, '..', 'transicoes');
const IMG = path.join(OUT, 'img');
const VIDEO = path.join(OUT, 'video');
let db: pg.Client;

async function event(slug: string, name: string, startsIn = '3 days 4 hours'): Promise<string> {
  const { rows } = await db.query(
    `insert into events (slug, name, starts_at, ends_at, venue, address, description, age_rating, status)
     values ($1, $2, now() + $3::interval, now() + $3::interval + interval '6 hours', 'Clube Comercial',
             'Rua do Acampamento, 500, Santa Maria/RS', 'Evento de teste, dados fictícios.', '18 anos', 'publicado')
     on conflict (slug) do update set name = excluded.name returning id`,
    [slug, name, startsIn],
  );
  const id = rows[0].id as string;
  if (!(await db.query('select 1 from ticket_types where event_id = $1', [id])).rowCount)
    await db.query(
      `insert into ticket_types (event_id, name, price_cents, quantity_total, sales_start_at, sales_end_at)
       values ($1, 'Pista', 8000, 200, now() - interval '1 day', now() + interval '2 days') on conflict do nothing`,
      [id],
    );
  return id;
}

/** Capa fotográfica fictícia (ruído colorido), para a miniatura ter cor e textura. */
const cover = (hue: string) =>
  sharp({ create: { width: 1600, height: 900, channels: 3, background: '#000', noise: { type: 'gaussian', mean: 120, sigma: 45 } } })
    .composite([
      {
        input: Buffer.from(`<svg width="1600" height="900"><rect width="1600" height="900" fill="${hue}" opacity=".55"/></svg>`),
        blend: 'overlay',
      },
    ])
    .jpeg({ quality: 82 })
    .toBuffer();

test.beforeAll(async () => {
  db = new pg.Client({ connectionString: R.url });
  await db.connect();
  mkdirSync(IMG, { recursive: true });
  mkdirSync(VIDEO, { recursive: true });
  const api = await apiRequest.newContext({ baseURL: R.base, extraHTTPHeaders: { origin: R.base } });
  expect((await api.post('/api/auth/login', { data: { email: 'admin@partyx.test', password: 'festa2026' } })).ok()).toBe(true);
  const csrf = ((await (await api.get('/api/auth/me')).json()) as { csrfToken: string }).csrfToken;
  for (const [slug, name, hue, startsIn] of [
    ['transicao-evento', 'Festa de Primavera', '#ff3d7f', '3 days 4 hours'],
    ['transicao-a', 'Noite de Verão', '#3dd6ff', '9 days'],
    ['transicao-b', 'Baile de Outono', '#ffb02e', '16 days'],
    ['transicao-c', 'Festival de Inverno', '#7cff6b', '23 days'],
  ] as const) {
    const id = await event(slug, name, startsIn);
    const has = await db.query('select banner_placeholder from events where id = $1', [id]);
    if (has.rows[0].banner_placeholder) continue;
    const res = await api.put(`/api/admin/events/${id}/banner`, {
      multipart: { file: { name: 'capa.jpg', mimeType: 'image/jpeg', buffer: await cover(hue) } },
      headers: { 'x-csrf-token': csrf },
    });
    expect(res.status(), slug).toBe(200);
  }
  await api.dispose();
});
test.afterAll(async () => {
  await db?.end();
});

async function context(
  browser: Browser,
  o: { width?: number; motion?: 'reduce' | 'no-preference'; video?: boolean; init?: () => void } = {},
): Promise<BrowserContext> {
  const width = o.width ?? 360;
  const ctx = await browser.newContext({
    viewport: { width, height: 800 },
    reducedMotion: o.motion ?? 'no-preference',
    ...(o.video ? { recordVideo: { dir: VIDEO, size: { width, height: 800 } } } : null),
  });
  await ctx.addInitScript(() => {
    sessionStorage.setItem('partyx_intro_seen', '1');
    // Momento em que o conteúdo de verdade da página do evento entra no DOM (o esqueleto usa <p class="px-event-name">), e se o
    // esqueleto chegou a aparecer.
    const w = window as Window & { __headAt?: number; __skeleton?: boolean };
    new MutationObserver(() => {
      if (!w.__headAt && document.querySelector('h1.px-event-name')) w.__headAt = performance.now();
      if (document.querySelector('[aria-label="Carregando evento"]')) w.__skeleton = true;
    }).observe(document, { childList: true, subtree: true });
  });
  if (o.init) await ctx.addInitScript(o.init);
  return ctx;
}

async function login(ctx: BrowserContext, email: string) {
  const page = await ctx.newPage();
  await page.goto(`${R.base}/entrar`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#senha', 'festa2026');
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.startsWith('/entrar'));
  return page;
}

/** A capa chega depois (rede lenta), para a miniatura aparecer. */
const slowCovers = (page: Page, ms = 900) =>
  page.route(/\/api\/media\/events\/.+\.webp$/, async route => {
    await new Promise(r => setTimeout(r, ms));
    await route.continue();
  });

const style = (page: Page, selector: string, props: string[], pseudo?: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, [p, ps]) => Object.fromEntries((p as string[]).map(k => [k, getComputedStyle(el, ps as string | undefined).getPropertyValue(k)])), [
      props,
      pseudo,
    ] as const);

/** Conta as View Transitions iniciadas e as chamadas de Web Animations no conteúdo (alternativa), com a duração pedida. */
const spyTransitions = () => {
  const w = window as Window & { __vt?: number; __fade?: number[] };
  w.__vt = 0;
  w.__fade = [];
  const original = (Document.prototype as unknown as { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  if (original)
    (Document.prototype as unknown as { startViewTransition: unknown }).startViewTransition = function (this: Document, cb: () => void) {
      w.__vt! += 1;
      return original.call(this, cb);
    };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
    if (this.id === 'conteudo') w.__fade!.push(Number((args[1] as KeyframeAnimationOptions | undefined)?.duration ?? 0));
    return animate.apply(this, args);
  };
};

test('página do evento a 360 px: capa por troca e zoom sem desfoque, cascata com sobreposição e barra de compra imediata', async ({
  browser,
}) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await slowCovers(page);
  await page.goto(`${R.base}/eventos/transicao-evento`);
  await page.waitForSelector('h1.px-event-name');

  // Capa: a miniatura (já desfocada pelo servidor, sem filtro na página) por cima; a capa nítida espera em 1,04.
  const banner = page.locator('.px-event-banner[data-cover]');
  await expect(banner).toHaveAttribute('data-cover', 'loading');
  const cover = await style(page, '.px-event-banner[data-cover] .px-banner-cover', ['opacity', 'filter', 'background-image', 'transition-duration']);
  expect(cover).toMatchObject({ opacity: '1', filter: 'none', 'transition-duration': '0.7s' });
  expect(cover['background-image']).toContain('data:image/webp;base64,');
  expect(await style(page, '.px-event-banner[data-cover] img', ['scale', 'transition-duration', 'filter'])).toEqual({
    scale: '1.04',
    'transition-duration': '1.2s',
    filter: 'none',
  });
  // O degradê escuro da base da capa continua (a camada da capa não usa o ::after dela).
  expect((await style(page, '.px-event-banner[data-cover]', ['background-image'], '::after'))['background-image']).toContain('linear-gradient');

  // Barra de compra do celular: na tela desde o primeiro quadro, sem esmaecer; o quadro de ingressos não anima no celular.
  expect(await page.locator('.px-mobbar').evaluate(el => [getComputedStyle(el).opacity, Math.round(el.getBoundingClientRect().bottom)])).toEqual([
    '1',
    800,
  ]);
  expect((await style(page, '.px-event-side', ['animation-name']))['animation-name']).toBe('none');

  // Cascata: data e título (0), cronômetro (1), Quando (2), Onde (3), Classificação (4); 720 ms cada, passo de 100 ms: o seguinte
  // começa quando o anterior ainda está entrando (sobreposição). Curva macia de saída.
  // (Sem o esqueleto, que ainda esmaece por cima durante a troca cruzada.)
  const plan = await page.$$eval(
    '.px-event-head:not(.px-xfade-out *), .px-countdown-row:not(.px-xfade-out *), .px-facts:not(.px-xfade-out *) > div',
    els =>
      els.map(el => {
        const s = getComputedStyle(el);
        return [s.animationName, s.animationDuration, s.animationDelay, s.animationTimingFunction];
      }),
  );
  const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';
  expect(plan).toEqual([
    ['px-enter', '0.72s', '0s', ease],
    ['px-enter', '0.72s', '0.1s', ease],
    ['px-enter', '0.72s', '0.2s', ease],
    ['px-enter', '0.72s', '0.3s', ease],
    ['px-enter', '0.72s', '0.4s', ease],
  ]);
  const timing = await page.evaluate(() => {
    const head = (window as Window & { __headAt?: number }).__headAt!;
    const anims = document.getAnimations().filter(a => (a as CSSAnimation).animationName === 'px-enter');
    const start = Math.min(...anims.map(a => a.startTime as number));
    const end = Math.max(...anims.map(a => (a.startTime as number) + (a.effect!.getComputedTiming().endTime as number)));
    return { span: end - start, firstFrame: start - head };
  });
  expect(timing.span).toBeLessThanOrEqual(1121); // 4 x 100 + 720
  expect(timing.firstFrame).toBeLessThanOrEqual(120);
  // Ponto de partida: 4 px de desfoque, 8 px abaixo e transparente (lido no instante 0 e devolvido em seguida).
  const from = await page.locator('.px-event-head:not(.px-xfade-out *)').evaluate(el => {
    const a = el.getAnimations()[0]!;
    const now = a.currentTime;
    a.pause();
    a.currentTime = 0;
    const s = getComputedStyle(el);
    const out = [s.opacity, s.filter, s.transform];
    a.currentTime = now;
    a.play();
    return out;
  });
  expect(from).toEqual(['0', 'blur(4px)', 'matrix(1, 0, 0, 1, 0, 8)']);

  // A capa nítida chega: a miniatura esmaece e a capa assenta em 1.
  await expect(banner).toHaveAttribute('data-cover', 'ready', { timeout: 5000 });
  await expect.poll(async () => (await style(page, '.px-event-banner[data-cover] .px-banner-cover', ['opacity'])).opacity).toBe('0');
  await expect.poll(async () => (await style(page, '.px-event-banner[data-cover] img', ['scale'])).scale).toBe('1');
  // Nada sobra nos elementos depois da entrada (sem filtro nem transformação permanentes).
  await page.waitForTimeout(1300);
  const left = await page.$$eval('.px-in, .px-in-block', els =>
    els.filter(el => {
      const s = getComputedStyle(el);
      return s.filter !== 'none' || s.transform !== 'none' || s.opacity !== '1';
    }).length,
  );
  expect(left).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await ctx.close();
});

test('"Continuar" não espera animação: escolher e continuar logo na entrada leva à próxima tela na hora', async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto(`${R.base}/eventos/transicao-evento`);
  const plus = page.getByRole('button', { name: 'Mais um Pista' });
  await plus.waitFor();
  await plus.click();
  const t0 = Date.now();
  await page.locator('.px-mobbar button', { hasText: 'Continuar' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/eventos/'));
  expect(Date.now() - t0).toBeLessThan(700);
  await ctx.close();
});

test('entrar pelo cartão: pré-carrega no toque, abre sem esqueleto, capa, título e data acompanham e a página não repete a entrada', async ({
  browser,
}) => {
  const ctx = await context(browser, { init: spyTransitions });
  const page = await ctx.newPage();
  await page.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  const card = page.locator('.px-card').filter({ hasText: 'Noite de Verão' });
  await card.scrollIntoViewIfNeeded();
  // O cartão e a página usam os mesmos nomes de View Transition para capa, título e data.
  expect(await card.locator('.px-card-title').evaluate(el => getComputedStyle(el).viewTransitionName)).toBe('px-titulo-transicao-a');
  expect(await card.locator('.px-stub').evaluate(el => getComputedStyle(el).viewTransitionName)).toBe('px-data-transicao-a');
  // Dedo encosta: os dados do evento e a capa começam a vir antes do clique.
  const fetched = page.waitForRequest(r => r.url().endsWith('/api/public/events/transicao-a'));
  await card.locator('.px-card-link').dispatchEvent('pointerdown');
  await fetched;
  await page.waitForTimeout(400);
  await card.locator('.px-card-link').click();
  await page.waitForURL(/\/eventos\/transicao-a$/);
  await page.waitForSelector('h1.px-event-name');
  expect(await page.evaluate(() => (window as Window & { __skeleton?: boolean }).__skeleton ?? false)).toBe(false);
  expect(await page.evaluate(() => (window as Window & { __vt?: number }).__vt)).toBe(1);
  expect(await page.locator('h1.px-event-name').evaluate(el => getComputedStyle(el).viewTransitionName)).toBe('px-titulo-transicao-a');
  expect(await page.locator('.px-event-banner').evaluate(el => getComputedStyle(el).viewTransitionName)).toBe('px-banner-transicao-a');
  // Vindo pela troca, a página não repete a cascata: o resto esmaece com a troca (450 ms).
  expect(await page.locator('.px-in').count()).toBe(0);
  await ctx.close();
});

test('menos movimento: só esmaecer simples de 250 ms, sem subir, desfocar, crescer, cascata nem View Transition', async ({ browser }) => {
  const ctx = await context(browser, { motion: 'reduce', init: spyTransitions });
  const page = await ctx.newPage();
  await slowCovers(page, 300);
  await page.goto(`${R.base}/eventos/transicao-evento`);
  await page.waitForSelector('h1.px-event-name');
  const plan = await page.$$eval('.px-in:not(.px-xfade-out *)', els => [
    ...new Set(els.map(el => `${getComputedStyle(el).animationName} ${getComputedStyle(el).animationDuration} ${getComputedStyle(el).animationDelay}`)),
  ]);
  expect(plan).toEqual(['px-enter 0.25s 0s']);
  const from = await page.locator('.px-event-head:not(.px-xfade-out *)').evaluate(el => {
    const a = el.getAnimations()[0]!;
    a.pause();
    a.currentTime = 0;
    const s = getComputedStyle(el);
    return [s.opacity, s.filter, s.transform];
  });
  expect(from).toEqual(['0', 'blur(0px)', 'matrix(1, 0, 0, 1, 0, 0)']);
  expect((await style(page, '.px-cd-tick', ['animation-name']))['animation-name']).toBe('none');
  expect(await style(page, '.px-event-banner[data-cover] img', ['scale'])).toEqual({ scale: '1' });
  expect((await style(page, '.px-event-banner[data-cover] .px-banner-cover', ['transition-duration']))['transition-duration']).toBe('0.25s');

  // Vitrine: cartões só esmaecem; troca de página sem View Transition, com esmaecer de 250 ms.
  await page.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  const first = page.locator('.px-grid > .px-card').first();
  await expect(first).not.toHaveAttribute('data-reveal', 'wait');
  await page.locator('.px-card-link').first().click();
  await page.waitForURL(/\/eventos\/.+/);
  expect(await page.evaluate(() => (window as Window & { __vt?: number }).__vt)).toBe(0);
  expect(await page.evaluate(() => (window as Window & { __fade?: number[] }).__fade)).toEqual([250]);
  await ctx.close();
});

test('vitrine a 360 px: cartões sobem e esmaecem (sem desfoque) quando aparecem na tela, só na primeira vez', async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  const cards = page.locator('.px-grid > .px-card');
  expect(await cards.count()).toBeGreaterThanOrEqual(4);
  await expect(cards.first()).not.toHaveAttribute('data-reveal', 'wait');
  const last = cards.last();
  await expect(last).toHaveAttribute('data-reveal', 'wait');
  expect(await last.evaluate(el => getComputedStyle(el).opacity)).toBe('0');
  await last.scrollIntoViewIfNeeded();
  await expect(last).toHaveAttribute('data-reveal', 'in');
  expect(await last.evaluate(el => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])).toEqual(['px-lift', '0.72s']);
  await expect(last).not.toHaveAttribute('data-reveal', /.*/, { timeout: 3000 });

  // Voltar à vitrine: o que já entrou não entra de novo.
  await page.evaluate(() => window.scrollTo(0, 0));
  await cards.first().locator('.px-card-link').click();
  await page.waitForURL(/\/eventos\/.+/);
  await page.goBack();
  await page.waitForSelector('.px-grid > .px-card');
  expect(await page.locator('.px-grid > .px-card').first().getAttribute('data-reveal')).toBeNull();
  await ctx.close();
});

test('esqueleto: mesma altura do conteúdo e troca cruzada (o esqueleto esmaece por cima do conteúdo)', async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  // A API demora: o esqueleto aparece e depois sai por cima do conteúdo.
  await page.route(/\/api\/public\/events(\?.*)?$/, async r => {
    await new Promise(x => setTimeout(x, 900));
    await r.continue();
  });
  await page.goto(`${R.base}/eventos`);
  await page.waitForSelector('.px-grid-skel .px-card');
  const skelHeight = await page.locator('.px-grid-skel .px-card').first().evaluate(el => Math.round(el.getBoundingClientRect().height));
  // Lido de uma vez, no quadro em que a camada aparece (ela dura 420 ms).
  const overlay = await (
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.px-xfade-out');
        const card = document.querySelector('.px-grid:not(.px-grid-skel) > .px-card');
        if (!el || !card) return null;
        const s = getComputedStyle(el);
        return { name: s.animationName, position: s.position, cardHeight: Math.round(card.getBoundingClientRect().height) };
      },
      null,
      { polling: 'raf' },
    )
  ).jsonValue();
  expect(overlay).toMatchObject({ name: 'px-fade-out', position: 'absolute' });
  expect(Math.abs(overlay!.cardHeight - skelHeight)).toBeLessThanOrEqual(2);
  await expect(page.locator('.px-xfade-out')).toHaveCount(0, { timeout: 3000 });

  // Página do evento: a capa do esqueleto tem a mesma altura da capa de verdade.
  await page.route(/\/api\/public\/events\/transicao-evento$/, async r => {
    await new Promise(x => setTimeout(x, 900));
    await r.continue();
  });
  await page.goto(`${R.base}/eventos/transicao-evento`);
  const skelBanner = await page.locator('[aria-label="Carregando evento"] .px-event-banner').evaluate(el => Math.round(el.getBoundingClientRect().height));
  // O bloco da data e o cronômetro do esqueleto são só a forma: sem a cor do evento e sem número visível.
  expect(await page.locator('[aria-label="Carregando evento"] .px-stub').evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual([
    'rgb(21, 21, 30)',
    'rgba(0, 0, 0, 0)',
  ]);
  await page.waitForSelector('h1.px-event-name');
  const banner = await page.locator('.px-event-banner[data-cover]').evaluate(el => Math.round(el.getBoundingClientRect().height));
  expect(banner).toBe(skelBanner);
  await ctx.close();
});

test('abrir o site: fundo escuro desde o primeiro quadro e conteúdo sem esperar o JavaScript; fontes trocam sem mudar de tamanho', async ({
  browser,
}) => {
  // JavaScript atrasado 4 s: a página do evento já é escura; a vitrine mostra o destaque (texto esmaecido em 600 ms, por CSS).
  for (const p of ['/eventos/transicao-evento', '/']) {
    const ctx = await context(browser);
    const page = await ctx.newPage();
    await page.route(/\/assets\/index-.*\.js$/, async r => {
      await new Promise(x => setTimeout(x, 4000));
      await r.continue();
    });
    await page.goto(R.base + p, { waitUntil: 'commit' });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      react: Boolean(document.querySelector('#root main#conteudo')),
      hero: document.querySelector('.px-hero-in') ? getComputedStyle(document.querySelector('.px-hero-in')!).opacity : null,
    }));
    expect(r, p).toMatchObject({ html: 'rgb(11, 11, 16)', body: 'rgb(11, 11, 16)', react: false });
    if (p === '/') expect(r.hero).toBe('1');
    await ctx.close();
  }
  // Na vitrine com o JavaScript em dia, o React continua o esmaecer do HTML do servidor (não recomeça do zero).
  const ctx = await context(browser);
  const home = await ctx.newPage();
  await home.goto(`${R.base}/`, { waitUntil: 'networkidle' });
  await home.waitForTimeout(800);
  expect(await home.locator('.px-hero-in').evaluate(el => [getComputedStyle(el).opacity, el.getAnimations().length])).toEqual(['1', 0]);
  await ctx.close();

  // Fontes atrasadas 2,5 s: o título e a página não mudam de tamanho quando elas chegam (reserva com as mesmas medidas).
  const fonts = await context(browser, {
    init: () => {
      const w = window as Window & { __cls?: number };
      w.__cls = 0;
      new PerformanceObserver(l => {
        for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) w.__cls! += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    },
  });
  const page = await fonts.newPage();
  await page.route(/\.woff2$/, async r => {
    await new Promise(x => setTimeout(x, 2500));
    await r.continue();
  });
  // (Sem esperar o evento "load", que espera as fontes pré-carregadas.)
  await page.goto(`${R.base}/eventos/transicao-evento`, { waitUntil: 'commit' });
  await page.waitForSelector('h1.px-event-name');
  await page.waitForTimeout(300);
  const before = await page.locator('h1.px-event-name').evaluate(el => [Math.round(el.getBoundingClientRect().height), document.fonts.status]);
  await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 8000 });
  await page.waitForTimeout(500);
  const after = await page.locator('h1.px-event-name').evaluate(el => Math.round(el.getBoundingClientRect().height));
  expect(before).toEqual([after, 'loading']);
  expect(await page.evaluate(() => (window as Window & { __cls?: number }).__cls)).toBeLessThan(0.01);
  await fonts.close();
});

test('passar o mouse: cartão sobe 3 px e botão sobe 1 px, em 150 ms; no painel, nada sobe', async ({ browser }) => {
  const ctx = await context(browser, { width: 1280 });
  const page = await ctx.newPage();
  await page.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  const media = page.locator('.px-card-media').first();
  expect(await media.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0.15s');
  await page.waitForTimeout(1500); // a entrada dos cartões termina antes de o mouse chegar
  await page.locator('.px-card-link').first().hover();
  await expect.poll(() => media.evaluate(el => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, -3)');
  await page.goto(`${R.base}/eventos/transicao-evento`, { waitUntil: 'networkidle' });
  const share = page.getByRole('button', { name: 'Compartilhar' });
  // O site rola suave: rolar antes e esperar assentar (e a entrada terminar), senão o ponteiro fica onde o botão estava.
  await share.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await share.hover();
  await expect.poll(() => share.evaluate(el => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, -1)');

  const admin = await login(ctx, 'admin@partyx.test');
  await admin.goto(`${R.base}/admin/eventos`, { waitUntil: 'networkidle' });
  const button = admin.locator('#conteudo .px-btn:visible').first();
  await button.hover();
  await admin.waitForTimeout(250);
  expect(await button.evaluate(el => getComputedStyle(el).transform)).toBe('none');
  await ctx.close();
});

test('troca de página: View Transition de 450 ms no site; sem suporte, esmaecer de 350 ms; o painel não usa View Transition', async ({
  browser,
}) => {
  const ctx = await context(browser, { width: 1280, init: spyTransitions });
  const page = await ctx.newPage();
  await page.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  await page.locator('.px-card-link').first().click();
  await page.waitForURL(/\/eventos\/.+/);
  expect(await page.evaluate(() => (window as Window & { __vt?: number }).__vt)).toBe(1);
  await ctx.close();

  // Navegador sem View Transitions: a página nova esmaece em 350 ms pela Web Animations API.
  const old = await context(browser, {
    width: 1280,
    init: () => {
      delete (Document.prototype as unknown as { startViewTransition?: unknown }).startViewTransition;
    },
  });
  await old.addInitScript(spyTransitions);
  const fallback = await old.newPage();
  await fallback.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  await fallback.locator('.px-card-link').first().click();
  await fallback.waitForURL(/\/eventos\/.+/);
  expect(await fallback.evaluate(() => (window as Window & { __fade?: number[] }).__fade)).toEqual([350]);
  await old.close();

  // Painel: troca na hora, sem View Transition, e só esmaece 180 ms.
  const adm = await context(browser, { width: 1280, init: spyTransitions });
  const admin = await login(adm, 'admin@partyx.test');
  await admin.goto(`${R.base}/admin`, { waitUntil: 'networkidle' });
  await admin.evaluate(() => ((window as Window & { __vt?: number }).__vt = 0));
  await admin.locator('a[href="/admin/eventos"]').first().click();
  await admin.waitForURL(/\/admin\/eventos/);
  expect(await admin.evaluate(() => (window as Window & { __vt?: number }).__vt)).toBe(0);
  expect(await admin.locator('#conteudo').evaluate(el => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])).toEqual([
    'px-fade-in',
    '0.18s',
  ]);
  await adm.close();
});

test('painel: só esmaece (180 ms), sem desfoque nem cascata, inclusive na pré-visualização da página do evento', async ({ browser }) => {
  const ctx = await context(browser, { width: 1280 });
  const admin = await login(ctx, 'admin@partyx.test');
  await admin.goto(`${R.base}/admin`, { waitUntil: 'networkidle' });
  expect(await admin.evaluate(() => document.documentElement.dataset.area)).toBe('admin');
  const anims = await admin.evaluate(() =>
    document
      .getAnimations()
      .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
      .map(a => [(a as CSSAnimation).animationName ?? 'transição', a.effect!.getComputedTiming().duration]),
  );
  for (const [name, duration] of anims) {
    expect(['px-enter', 'px-lift', 'px-roll-in']).not.toContain(name);
    expect(Number(duration)).toBeLessThanOrEqual(200);
  }
  const id = (await db.query("select id from events where slug = 'transicao-evento'")).rows[0].id as string;
  await admin.goto(`${R.base}/admin/eventos/${id}/previa`, { waitUntil: 'networkidle' });
  const plan = await admin.$$eval('.px-in, .px-in-block', els => [
    ...new Set(els.map(el => `${getComputedStyle(el).animationName} ${getComputedStyle(el).animationDuration} ${getComputedStyle(el).animationDelay}`)),
  ]);
  expect(plan).toEqual(['px-fade-in 0.18s 0s']);
  await ctx.close();
});

test('portaria: nada entra animado e o destaque do resultado dura 150 ms', async ({ browser }) => {
  const ctx = await context(browser);
  const gate = await login(ctx, 'portaria@partyx.test');
  await gate.goto(`${R.base}/portaria`, { waitUntil: 'networkidle' });
  expect(await gate.evaluate(() => document.documentElement.dataset.area)).toBe('portaria');
  expect(await gate.locator('.px-in, .px-in-block, [data-reveal]').count()).toBe(0);
  const running = await gate.evaluate(() =>
    document
      .getAnimations()
      .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
      .map(a => (a as CSSAnimation).animationName ?? 'transição'),
  );
  expect(running).toEqual([]);
  const flash = await gate.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'px-gate-result';
    document.body.append(el);
    const s = getComputedStyle(el, '::before');
    const out = [s.animationName, s.animationDuration];
    el.remove();
    return out;
  });
  expect(flash).toEqual(['pxgatepulse', '0.15s']);
  await ctx.close();
});

test('capturas: sequência da entrada da página do evento a 360 px', async ({ browser }) => {
  // Animações pausadas logo na entrada e levadas a cada instante (Web Animations), com a capa ainda chegando.
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await slowCovers(page, 6000);
  await page.goto(`${R.base}/eventos/transicao-evento`);
  await page.waitForSelector('h1.px-event-name');
  await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));
  for (const t of [0, 150, 300, 450, 600, 850, 1150]) {
    await page.evaluate(ms => document.getAnimations().forEach(a => (a.currentTime = ms)), t);
    await page.screenshot({ path: path.join(IMG, `entrada-${String(t).padStart(4, '0')}ms.png`) });
  }
  await page.evaluate(() => document.getAnimations().forEach(a => a.play()));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.reload();
  await expect(page.locator('.px-event-banner[data-cover]')).toHaveAttribute('data-cover', 'ready', { timeout: 8000 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(IMG, 'entrada-final.png') });
  await ctx.close();
});
