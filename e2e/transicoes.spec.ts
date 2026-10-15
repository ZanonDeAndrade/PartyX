import { mkdirSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { expect, request as apiRequest, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import sharp from 'sharp';
import { TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Transições do site (15/10/2026). Eventos gravados direto no banco descartável, com capa enviada pela API (como em produção, para
 * a miniatura desfocada existir). Os estilos e tempos conferidos são os do navegador (getComputedStyle e Web Animations).
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
    // Momento em que o conteúdo da página do evento entra no DOM (referência dos 700 ms).
    const w = window as Window & { __headAt?: number };
    new MutationObserver(() => {
      if (!w.__headAt && document.querySelector('.px-event-head')) w.__headAt = performance.now();
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

/** A capa chega 900 ms depois (rede lenta), para a miniatura desfocada aparecer. */
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

test('página do evento a 360 px: capa desfocada que fica nítida, cascata completa em até 700 ms e barra de compra imediata', async ({
  browser,
}) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await slowCovers(page);
  await page.goto(`${R.base}/eventos/transicao-evento`);
  await page.waitForSelector('.px-event-head');

  // Capa: miniatura (data:) desfocada por cima enquanto a nítida não chega.
  const banner = page.locator('.px-event-banner');
  await expect(banner).toHaveAttribute('data-cover', 'loading');
  const over = await style(page, '.px-event-banner', ['opacity', 'filter', 'background-image'], '::after');
  expect(over.opacity).toBe('1');
  expect(over.filter).toBe('blur(16px)');
  expect(over['background-image']).toContain('data:image/webp;base64,');

  // Barra de compra do celular: na tela desde o primeiro quadro, sem esmaecer; o quadro de ingressos não anima no celular.
  expect(await page.locator('.px-mobbar').evaluate(el => [getComputedStyle(el).opacity, Math.round(el.getBoundingClientRect().bottom)])).toEqual([
    '1',
    800,
  ]);
  expect((await style(page, '.px-event-side', ['animation-name']))['animation-name']).toBe('none');

  // Cascata: data e título (0), cronômetro (1), Quando (2), Onde (3), Classificação (4); 400 ms cada, passo de 60 ms.
  const plan = await page.$$eval('.px-event-head, .px-countdown-row, .px-facts > div', els =>
    els.map(el => {
      const s = getComputedStyle(el);
      return [s.animationName, s.animationDuration, s.animationDelay];
    }),
  );
  expect(plan).toEqual([
    ['px-enter', '0.4s', '0s'],
    ['px-enter', '0.4s', '0.06s'],
    ['px-enter', '0.4s', '0.12s'],
    ['px-enter', '0.4s', '0.18s'],
    ['px-enter', '0.4s', '0.24s'],
  ]);

  // A primeira tela fica completa em até 700 ms: as animações dela cabem em 640 ms, e começam no primeiro quadro depois de o conteúdo
  // entrar no DOM (a folga de 60 ms cobre esse quadro mesmo com a máquina de teste carregada).
  const timing = await page.evaluate(() => {
    const head = (window as Window & { __headAt?: number }).__headAt!;
    const anims = document
      .getAnimations()
      .filter(a => (a as CSSAnimation).animationName === 'px-enter')
      .filter(a => ((a.effect as KeyframeEffect).target as Element).getBoundingClientRect().top < window.innerHeight);
    const start = Math.min(...anims.map(a => a.startTime as number));
    const end = Math.max(...anims.map(a => (a.startTime as number) + (a.effect!.getComputedTiming().endTime as number)));
    return { span: end - start, firstFrame: start - head, total: end - head };
  });
  expect(timing.span).toBeLessThanOrEqual(641);
  expect(timing.firstFrame).toBeLessThanOrEqual(120);
  test.info().annotations.push({ type: 'entrada', description: `${Math.round(timing.total)} ms do conteúdo no DOM ao fim da cascata` });
  // Ponto de partida: desfocado 8 px, 12 px abaixo e transparente (lido com a animação levada ao instante 0 e devolvida em seguida).
  const from = await page.locator('.px-event-head').evaluate(el => {
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
  expect(from).toEqual(['0', 'blur(8px)', 'matrix(1, 0, 0, 1, 0, 12)']);

  // A capa nítida chega: a camada desfocada esmaece e some.
  await expect(banner).toHaveAttribute('data-cover', 'ready', { timeout: 5000 });
  await expect.poll(async () => (await style(page, '.px-event-banner', ['opacity'], '::after')).opacity).toBe('0');
  // Nada sobra nos elementos depois da entrada (sem filtro nem transformação permanentes).
  await page.waitForTimeout(800);
  const left = await page.$$eval('.px-in', els =>
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

test('menos movimento: nada anima (entradas, cronômetro, capa, cartões e troca de página)', async ({ browser }) => {
  const ctx = await context(browser, {
    motion: 'reduce',
    init: () => {
      const w = window as Window & { __vt?: number };
      w.__vt = 0;
      const original = (Document.prototype as unknown as { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
      if (original)
        (Document.prototype as unknown as { startViewTransition: unknown }).startViewTransition = function (this: Document, cb: () => void) {
          w.__vt! += 1;
          return original.call(this, cb);
        };
    },
  });
  const page = await ctx.newPage();
  await slowCovers(page, 300);
  await page.goto(`${R.base}/eventos/transicao-evento`);
  await page.waitForSelector('.px-event-head');
  expect(await page.$$eval('.px-in', els => [...new Set(els.map(el => getComputedStyle(el).animationName))])).toEqual(['none']);
  expect((await style(page, '.px-cd-tick', ['animation-name']))['animation-name']).toBe('none');
  // A capa nítida aparece direto (a camada desfocada some sem transição).
  expect((await style(page, '.px-event-banner', ['transition-duration'], '::after'))['transition-duration']).toBe('0s');
  await expect(page.locator('.px-event-banner')).toHaveAttribute('data-cover', 'ready', { timeout: 5000 });
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);

  // Vitrine: os cartões já nascem visíveis; a troca de página é imediata (sem View Transition).
  await page.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  expect(await page.locator('[data-reveal]').count()).toBe(0);
  await page.locator('.px-card-link').first().click();
  await page.waitForURL(/\/eventos\/.+/);
  expect(await page.evaluate(() => (window as Window & { __vt?: number }).__vt)).toBe(0);
  await ctx.close();
});

test('vitrine a 360 px: cartões entram em cascata quando aparecem na tela, só na primeira vez', async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  const cards = page.locator('.px-grid > .px-card');
  expect(await cards.count()).toBeGreaterThanOrEqual(4);
  // O primeiro já entrou (ou está entrando); o último, fora da tela, espera.
  await expect(cards.first()).not.toHaveAttribute('data-reveal', 'wait');
  const last = cards.last();
  await expect(last).toHaveAttribute('data-reveal', 'wait');
  expect(await last.evaluate(el => getComputedStyle(el).opacity)).toBe('0');
  await last.scrollIntoViewIfNeeded();
  await expect(last).toHaveAttribute('data-reveal', 'in');
  expect(await last.evaluate(el => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])).toEqual(['px-enter', '0.4s']);
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

test('passar o mouse: cartão sobe 3 px e botão sobe 1 px, em 150 ms; no painel, nada sobe', async ({ browser }) => {
  const ctx = await context(browser, { width: 1280 });
  const page = await ctx.newPage();
  await page.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  const media = page.locator('.px-card-media').first();
  expect(await media.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0.15s');
  await page.locator('.px-card-link').first().hover();
  await expect.poll(() => media.evaluate(el => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, -3)');
  await page.goto(`${R.base}/eventos/transicao-evento`, { waitUntil: 'networkidle' });
  const share = page.getByRole('button', { name: 'Compartilhar' });
  // O site rola suave: rolar antes e esperar assentar (e a entrada terminar), senão o ponteiro fica onde o botão estava.
  await share.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
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

test('troca de página: View Transition no site; sem suporte, a página nova esmaece; o painel não usa View Transition', async ({
  browser,
}) => {
  const spy = () => {
    const w = window as Window & { __vt?: number };
    w.__vt = 0;
    const original = (Document.prototype as unknown as { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
    if (original)
      (Document.prototype as unknown as { startViewTransition: unknown }).startViewTransition = function (this: Document, cb: () => void) {
        w.__vt! += 1;
        return original.call(this, cb);
      };
  };
  const ctx = await context(browser, { width: 1280, init: spy });
  const page = await ctx.newPage();
  await page.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  await page.locator('.px-card-link').first().click();
  await page.waitForURL(/\/eventos\/.+/);
  expect(await page.evaluate(() => (window as Window & { __vt?: number }).__vt)).toBe(1);
  await ctx.close();

  // Navegador sem View Transitions: a página nova esmaece pela Web Animations API.
  const old = await context(browser, {
    width: 1280,
    init: () => {
      delete (Document.prototype as unknown as { startViewTransition?: unknown }).startViewTransition;
      const w = window as Window & { __fade?: number };
      w.__fade = 0;
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
        if (this.id === 'conteudo') w.__fade! += 1;
        return animate.apply(this, args);
      };
    },
  });
  const fallback = await old.newPage();
  await fallback.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  await fallback.locator('.px-card-link').first().click();
  await fallback.waitForURL(/\/eventos\/.+/);
  expect(await fallback.evaluate(() => (window as Window & { __fade?: number }).__fade)).toBe(1);
  await old.close();

  // Painel: troca na hora, sem View Transition, e só esmaece 180 ms.
  const adm = await context(browser, { width: 1280, init: spy });
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
  // Nenhuma animação do painel passa de 200 ms nem usa desfoque (fora indicadores de carregamento, que só rodam enquanto carrega).
  const anims = await admin.evaluate(() =>
    document
      .getAnimations()
      .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
      .map(a => [(a as CSSAnimation).animationName ?? 'transição', a.effect!.getComputedTiming().duration]),
  );
  for (const [name, duration] of anims) {
    expect(name).not.toBe('px-enter');
    expect(name).not.toBe('px-roll-in');
    expect(Number(duration)).toBeLessThanOrEqual(200);
  }
  const id = (await db.query("select id from events where slug = 'transicao-evento'")).rows[0].id as string;
  await admin.goto(`${R.base}/admin/eventos/${id}/previa`, { waitUntil: 'networkidle' });
  const plan = await admin.$$eval('.px-in', els => [
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
  expect(await gate.locator('.px-in, [data-reveal]').count()).toBe(0);
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

test('capturas: sequência da entrada da página do evento e vídeos a 360 px, com e sem menos movimento', async ({ browser }) => {
  // Sequência: as animações são pausadas logo na entrada e levadas a cada instante (Web Animations), com a capa ainda chegando.
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await slowCovers(page, 4000);
  await page.goto(`${R.base}/eventos/transicao-evento`);
  await page.waitForSelector('.px-event-head');
  await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));
  for (const t of [0, 100, 200, 300, 450, 700]) {
    await page.evaluate(ms => document.getAnimations().forEach(a => (a.currentTime = ms)), t);
    await page.screenshot({ path: path.join(IMG, `entrada-${String(t).padStart(3, '0')}ms.png`) });
  }
  await page.evaluate(() => document.getAnimations().forEach(a => a.play()));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.reload();
  await expect(page.locator('.px-event-banner')).toHaveAttribute('data-cover', 'ready', { timeout: 8000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(IMG, 'entrada-final.png') });
  await ctx.close();

  // Vídeos: entrada da página (capa chegando em 900 ms) e a vitrine rolando; depois, os dois com menos movimento.
  for (const motion of ['no-preference', 'reduce'] as const) {
    const rec = await context(browser, { motion, video: true });
    const p = await rec.newPage();
    await slowCovers(p);
    await p.goto(`${R.base}/eventos/transicao-evento`);
    await p.waitForTimeout(2600);
    await p.goto(`${R.base}/eventos`);
    await p.waitForTimeout(1200);
    for (let i = 0; i < 8; i++) {
      await p.mouse.wheel(0, 320);
      await p.waitForTimeout(450);
    }
    await p.waitForTimeout(800);
    const video = p.video()!;
    await rec.close();
    renameSync(await video.path(), path.join(VIDEO, `entrada-${motion === 'reduce' ? 'menos-movimento' : 'padrao'}-360.webm`));
  }
});
