import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Abertura (src/intro/abertura.js, 16/10/2026; prazos desde a camada e nomes com hash em 17/10/2026): toca em toda carga de página fora das rotas de tarefa, na volta pelo Voltar e na
 * volta para a aba depois de 1 minuto fora; cai no logo animado em CSS quando o vídeo não toca; some em até 4 s com o fade; um toque
 * pula sem passar para a página. O registro (`__ab`) é montado antes de qualquer script da página: cada mudança de
 * `<html data-px-abertura>` com a hora (performance.now), o primeiro quadro desenhado (de onde contam o 1 s e os 4 s) e quando o
 * vídeo começou e terminou.
 *
 * O bfcache de verdade não acontece no Chromium nem no WebKit do Playwright (o Voltar recarrega a página); a volta restaurada do cache
 * é conferida com a mesma sequência de eventos do navegador (pagehide, aba escondida e visível, pageshow com persisted).
 */
const R = JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'state.json'), 'utf8')) as {
  base: string;
  eventId: string;
  orderId: string;
  ticketId: string;
};
const IMG = path.join(TEXTOS_DIR, '..', 'abertura', 'img');
const LIMITE = 4000;
const FOLGA = 250; // atraso dos timers do navegador
const VIDEO = '**/assets/partyx-intro-*.mp4';
// Igual à regra de src/intro/abertura.js: confere que a volta à aba aconteceu numa rota de tarefa (sem redirecionamento do site).
const TAREFA =
  /^\/(?:(?:admin|portaria|checkout|pedido|ingressos|autorizacao-menor)(?:\/|$)|(?:meus-ingressos|entrar|criar-conta|primeiro-acesso|recuperar-senha|redefinir-senha)\/?$)/;
let slug = '';
/**
 * Página do evento. No WebKit do Playwright (Linux), ela derruba o processo da página com frequência, com ou sem a abertura e também no
 * build publicado (release-2026-10-16b: 15 de 18 aberturas, 16/10/2026); por isso, nesse motor, a lista de eventos no lugar dela.
 * A página do evento continua coberta no Chromium (computador e Android).
 */
const paginaDoEvento = () => (test.info().project.name === 'iphone-webkit' ? '/eventos' : `/eventos/${slug}`);

interface Registro {
  modos: { t: number; v: string | null }[];
  pintura: number | null;
  playing: number | null;
  ended: number | null;
  marcaComBody: boolean | null;
  marcaParede: number | null; // Date.now() da primeira marca (o performance.now do WebKit começa na resposta, não no clique)
  pageshow: boolean[];
}
type W = Window & { __ab: Registro };

test.beforeAll(async ({ request }) => {
  mkdirSync(IMG, { recursive: true });
  const body = (await (await request.get(`${R.base}/api/public/events`)).json()) as unknown;
  const list = (Array.isArray(body) ? body : ((body as { events?: unknown[] }).events ?? [])) as { slug: string }[];
  slug = list[0]!.slug;
  expect(slug).toBeTruthy();
});

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const w = window as unknown as W;
    w.__ab = { modos: [], pintura: null, playing: null, ended: null, marcaComBody: null, marcaParede: null, pageshow: [] };
    requestAnimationFrame(() => (w.__ab.pintura = performance.now()));
    new MutationObserver(() => {
      const v = document.documentElement.getAttribute('data-px-abertura');
      const last = w.__ab.modos[w.__ab.modos.length - 1];
      if (last ? last.v !== v : v !== null) w.__ab.modos.push({ t: performance.now(), v });
      if (v && w.__ab.marcaComBody === null) {
        w.__ab.marcaComBody = !!document.body;
        w.__ab.marcaParede = Date.now();
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-px-abertura'] });
    document.addEventListener('playing', () => (w.__ab.playing ??= performance.now()), true);
    document.addEventListener('ended', () => (w.__ab.ended = performance.now()), true);
    addEventListener('pageshow', e => w.__ab.pageshow.push(e.persisted));
  });
});

const reg = (page: Page) => page.evaluate(() => (window as unknown as W).__ab);
const marca = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-px-abertura'));
const agora = (page: Page) => page.evaluate(() => performance.now());
const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(IMG, `${test.info().project.name}-${name}.png`), animations: 'allow' });

/** Espera a camada sair e devolve o registro, com a hora em que ela saiu e quanto ficou na tela desde o primeiro quadro. */
async function fim(page: Page) {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-px-abertura'), null, { timeout: 8000 });
  const r = await reg(page);
  const saiu = r.modos[r.modos.length - 1]!.t;
  return { ...r, saiu, naTela: saiu - (r.pintura ?? 0) };
}
/** Pula a abertura (Esc) e espera a camada sair. */
async function pular(page: Page) {
  await page.keyboard.press('Escape');
  return fim(page);
}

/** Aba escondida por `ms` (o relógio de parede avança; o resto do tempo não) e de volta, como o navegador avisa. */
async function foraDaAba(page: Page, ms: number) {
  await page.evaluate(ms => {
    const set = (s: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    set('hidden');
    const real = Date.now;
    Date.now = () => real.call(Date) + ms;
    set('visible');
  }, ms);
}

function pedidosDoVideo(page: Page) {
  const urls: string[] = [];
  page.on('request', r => {
    if (/\/assets\/partyx-intro-\w+\.mp4/.test(r.url())) urls.push(r.url());
  });
  return urls;
}

test('primeira carga: a camada vem no HTML, é marcada antes do corpo e o vídeo toca inteiro em até 4 s', async ({ page, request }) => {
  const raw = await (await request.get(`${R.base}/`)).text();
  expect(raw).toContain('id="px-abertura"');
  expect(raw).toMatch(/<video[^>]*class="px-abertura-video"(?![^>]*\ssrc=)[^>]*>/);
  const tag = raw.search(/<script src="\/assets\/abertura-\w+\.js">/);
  expect(tag, 'script com hash no nome').toBeGreaterThan(0);
  expect(tag).toBeLessThan(raw.indexOf('<link rel="stylesheet"'));
  expect(tag).toBeLessThan(raw.indexOf('</head>'));

  const videos = pedidosDoVideo(page);
  await page.goto(`${R.base}/`);
  await page.waitForFunction(() => (window as unknown as W).__ab.playing !== null, null, { timeout: 3000 });
  await page.waitForTimeout(1200);
  if ((await marca(page)) === 'video') await shot(page, 'video');
  const r = await fim(page);
  expect(r.marcaComBody, 'a marca vem antes do <body>: nada da página aparece antes da camada').toBe(false);
  expect(r.modos.map(m => m.v)).toEqual(['video', null]);
  expect(r.playing! - r.pintura!).toBeLessThan(1000);
  expect(r.ended, 'o vídeo chegou ao fim').not.toBeNull();
  expect(r.naTela).toBeLessThanOrEqual(LIMITE + FOLGA);
  expect(videos.length).toBeGreaterThan(0);
  await expect(page.locator('#px-abertura')).toBeHidden();
  expect(await page.evaluate(() => document.getElementById('root')!.inert)).toBe(false);
  expect(await page.locator('.px-abertura-video').getAttribute('src'), 'o vídeo solta o arquivo ao sair').toBeNull();
});

test('script e vídeo da abertura com hash no nome e cache de 1 ano, imutável (o vídeo também em pedaços)', async ({ request }) => {
  const raw = await (await request.get(`${R.base}/`)).text();
  const script = /<script src="(\/assets\/abertura-\w+\.js)">/.exec(raw)![1]!;
  const js = await request.get(R.base + script);
  expect(js.status()).toBe(200);
  expect(js.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  const body = await js.text();
  expect(body, 'sem o endereço de desenvolvimento').not.toContain('/src/intro/');
  const video = /'(\/assets\/partyx-intro-\w+\.mp4)'/.exec(body)![1]!;
  const parte = await request.get(R.base + video, { headers: { Range: 'bytes=0-99' } });
  expect(parte.status()).toBe(206);
  expect(parte.headers()['content-type']).toBe('video/mp4');
  expect(parte.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  expect((await request.get(`${R.base}/intro/partyx-intro.mp4`)).headers()['content-type'], 'o endereço antigo saiu').not.toBe('video/mp4');
});

test('HTML que chega depois de 3 s: a abertura aparece inteira, com o prazo contado de quando ela aparece', async ({ page }) => {
  await page.route(`${R.base}/`, async route => {
    await new Promise(res => setTimeout(res, 3000));
    await route.continue();
  });
  const antes = Date.now();
  await page.goto(`${R.base}/`);
  const r = await fim(page);
  expect(r.marcaParede! - antes, 'a camada só aparece depois de 3 s').toBeGreaterThan(3000);
  expect(r.modos.map(m => m.v)).toEqual(['video', null]);
  expect(r.ended, 'o vídeo chegou ao fim').not.toBeNull();
  expect(r.naTela).toBeLessThanOrEqual(LIMITE + FOLGA);
});

test('a página carrega normalmente por baixo enquanto a abertura está na tela', async ({ page }) => {
  await page.goto(`${R.base}/`);
  await page.waitForFunction(() => document.getElementById('root')!.childElementCount > 0, null, { timeout: 4000 });
  const durante = await page.evaluate(() => ({
    marca: document.documentElement.getAttribute('data-px-abertura'),
    inerte: document.getElementById('root')!.inert,
    api: performance.getEntriesByType('resource').filter(e => e.name.includes('/api/')).length,
    rolagem: getComputedStyle(document.documentElement).overflow,
  }));
  expect(durante.marca, 'a página já está montada com a abertura ainda na tela').toBe('video');
  expect(durante.inerte).toBe(true);
  expect(durante.api, 'as chamadas da página saem durante a abertura').toBeGreaterThan(0);
  expect(durante.rolagem).toBe('hidden');
  await pular(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
});

test('recarregar, nova aba e link vindo de fora: aparece de novo', async ({ page, context }) => {
  await page.goto(`${R.base}/`);
  await expect.poll(() => marca(page)).toBe('video');
  await pular(page);
  await page.reload();
  expect((await reg(page)).modos[0]?.v, 'recarregar').toBe('video');
  await pular(page);

  const outra = await context.newPage();
  await outra.goto(`${R.base}${paginaDoEvento()}`, { referer: 'https://l.instagram.com/' });
  expect((await reg(outra)).modos[0]?.v, 'nova aba, link do Instagram').toBe('video');
  await pular(outra);
  await outra.goto(`${R.base}/eventos`, { referer: 'https://wa.me/' });
  expect((await reg(outra)).modos[0]?.v, 'link do WhatsApp').toBe('video');
  await pular(outra);
  await outra.close();
});

test('Voltar: com recarga e restaurada do cache do navegador (pageshow com persisted)', async ({ page }) => {
  await page.goto(`${R.base}/`);
  await pular(page);
  await page.goto(`${R.base}/termos-de-uso`);
  await pular(page);
  await page.goBack();
  expect(new URL(page.url()).pathname).toBe('/');
  expect((await reg(page)).modos[0]?.v, 'Voltar com recarga').toBe('video');
  await pular(page);

  // Restaurada do cache: a página sai (pagehide), a aba fica escondida alguns segundos e volta já pronta (pageshow persisted).
  const antes = (await reg(page)).modos.length;
  const t = await agora(page);
  await page.evaluate(() => {
    const set = (s: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    set('hidden');
    const real = Date.now;
    Date.now = () => real.call(Date) + 5000;
    set('visible');
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  const r = await fim(page);
  const run = r.modos.slice(antes);
  expect(run.map(m => m.v)).toEqual(['video', null]);
  expect(run[0]!.t - t, 'começa na volta').toBeLessThan(300);
  expect(run[1]!.t - run[0]!.t).toBeLessThanOrEqual(LIMITE + FOLGA);
});

test('volta para a aba: com menos de 1 minuto fora não aparece; com 1 minuto ou mais, aparece', async ({ page }) => {
  await page.goto(`${R.base}${paginaDoEvento()}`);
  await pular(page);
  const n = (await reg(page)).modos.length;

  await foraDaAba(page, 59_000);
  await page.waitForTimeout(500);
  expect((await reg(page)).modos.length, '59 s fora: não aparece').toBe(n);

  await foraDaAba(page, 60_000);
  expect(await marca(page), '1 minuto fora: aparece').toBe('video');
  const r = await fim(page);
  const run = r.modos.slice(n);
  expect(run.map(m => m.v)).toEqual(['video', null]);
  expect(run[1]!.t - run[0]!.t).toBeLessThanOrEqual(LIMITE + FOLGA);

  // Aba escondida com a abertura na tela: ela sai na hora e não volta com menos de 1 minuto.
  await foraDaAba(page, 120_000);
  expect(await marca(page)).toBe('video');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await marca(page)).toBeNull();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(400);
  const depois = await reg(page);
  expect(depois.modos[depois.modos.length - 1]!.v).toBeNull();
});

test('aba aberta em segundo plano: toca quando ela aparece', async ({ page, context }) => {
  await context.addInitScript(() => {
    let s: DocumentVisibilityState = 'hidden';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    (window as unknown as { __mostrar: () => void }).__mostrar = () => {
      s = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  await page.goto(`${R.base}/`);
  await page.waitForTimeout(600);
  expect((await reg(page)).modos, 'escondida: ainda não toca').toEqual([]);
  const t = await agora(page);
  await page.evaluate(() => (window as unknown as { __mostrar: () => void }).__mostrar());
  const r = await fim(page);
  expect(r.modos.map(m => m.v)).toEqual(['video', null]);
  expect(r.modos[0]!.t - t, 'começa quando a aba aparece').toBeLessThan(300);
  expect(r.saiu - r.modos[0]!.t).toBeLessThanOrEqual(LIMITE + FOLGA);
});

test('rotas de tarefa: nunca aparece, nem baixa o vídeo, nem na volta para a aba', async ({ page }) => {
  const videos = pedidosDoVideo(page);
  const rotas = [
    '/admin',
    '/admin/eventos',
    `/admin/eventos/${R.eventId}`,
    '/portaria',
    `/portaria/${R.eventId}`,
    `/checkout/${slug}`,
    `/pedido/${R.orderId}`,
    `/ingressos/${R.ticketId}`,
    `/ingressos/${R.ticketId}/tela-cheia`,
    `/ingressos/${R.ticketId}/transferir`,
    '/meus-ingressos',
    `/autorizacao-menor/pedido/${R.orderId}`,
    '/primeiro-acesso',
    '/entrar',
    '/entrar/',
    '/entrar?voltar=%2Fcheckout%2Fx',
    '/criar-conta',
    '/recuperar-senha',
    '/redefinir-senha?token=abc',
  ];
  for (const rota of rotas) {
    await page.goto(`${R.base}${rota}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    expect((await reg(page)).modos, `${rota}: carga`).toEqual([]);
    const onde = await page.evaluate(() => location.pathname);
    expect(onde, `${rota}: continua numa rota de tarefa (${onde})`).toMatch(TAREFA);
    await foraDaAba(page, 61_000);
    await page.waitForTimeout(300);
    expect((await reg(page)).modos, `${rota}: volta para a aba`).toEqual([]);
    await expect(page.locator('#px-abertura')).toBeHidden();
  }
  expect(videos, 'o vídeo não é baixado nas rotas de tarefa').toEqual([]);
});

test('páginas do site fora da lista: aparece', async ({ page }) => {
  for (const rota of [
    '/',
    '/eventos',
    paginaDoEvento(),
    '/termos-de-uso',
    '/privacidade',
    '/politica-de-cancelamento',
    '/termo-menor',
    '/minha-conta',
    '/minhas-compras',
    '/uma-pagina-que-nao-existe',
  ]) {
    await page.goto(`${R.base}${rota}`, { waitUntil: 'domcontentloaded' });
    expect((await reg(page)).modos[0]?.v, rota).toBe('video');
    await pular(page);
  }
});

test('play() recusado: o logo em SVG com a animação em CSS, sem pular a abertura', async ({ page, context }) => {
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('bloqueado', 'NotAllowedError'));
  });
  await page.goto(`${R.base}/`);
  await expect.poll(() => marca(page)).toBe('css');
  const r0 = await reg(page);
  expect(r0.modos.map(m => m.v)).toEqual(['video', 'css']);
  expect(r0.modos[1]!.t - r0.modos[0]!.t, 'troca logo depois da recusa').toBeLessThan(500);
  await expect(page.locator('.px-abertura-logo')).toBeVisible();
  await expect(page.locator('.px-abertura-video')).toBeHidden();
  expect(await page.locator('.px-abertura-video').getAttribute('src')).toBeNull();
  expect(await page.evaluate(() => document.querySelector('.px-abertura-x')!.getAnimations().length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.querySelector('.px-abertura-party')!.getAnimations().length)).toBeGreaterThan(0);
  await page.waitForTimeout(450);
  await shot(page, 'css-meio');
  await page.waitForTimeout(1000);
  await shot(page, 'css-fim');
  const r = await fim(page);
  expect(r.naTela).toBeLessThanOrEqual(LIMITE + FOLGA);
  expect(r.saiu - r.modos[1]!.t, 'animação de cerca de 1,5 s, o logo parado um instante e o fade').toBeGreaterThan(1500);
});

test('vídeo que não começa em 1 s: cai na animação em CSS', async ({ page }) => {
  await page.route(VIDEO, async route => {
    await new Promise(res => setTimeout(res, 3000));
    await route.continue().catch(() => {});
  });
  await page.goto(`${R.base}/`);
  await expect.poll(() => marca(page), { timeout: 3000 }).toBe('css');
  const r = await fim(page);
  expect(r.modos.map(m => m.v)).toEqual(['video', 'css', null]);
  expect(r.modos[1]!.t - r.pintura!, 'troca 1 s depois de a camada aparecer').toBeGreaterThanOrEqual(950);
  expect(r.modos[1]!.t - r.pintura!).toBeLessThan(1000 + FOLGA);
  expect(r.playing).toBeNull();
  expect(r.naTela).toBeLessThanOrEqual(LIMITE + FOLGA);
});

test('vídeo com meio segundo de atraso: ainda termina inteiro dentro dos 4 s', async ({ page }) => {
  await page.route(VIDEO, async route => {
    await new Promise(res => setTimeout(res, 500));
    await route.continue();
  });
  await page.goto(`${R.base}/`);
  const r = await fim(page);
  expect(r.modos.map(m => m.v)).toEqual(['video', null]);
  expect(r.playing!).toBeGreaterThan(500);
  expect(r.ended, 'o vídeo chegou ao fim').not.toBeNull();
  expect(r.naTela).toBeLessThanOrEqual(LIMITE + FOLGA);
});

test('economia de dados: direto para a animação em CSS, sem baixar o vídeo', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData: true }) });
  });
  const videos = pedidosDoVideo(page);
  await page.goto(`${R.base}/`);
  const r = await fim(page);
  expect(r.modos.map(m => m.v)).toEqual(['css', null]);
  expect(r.naTela).toBeLessThanOrEqual(LIMITE + FOLGA);
  expect(videos).toEqual([]);
});

test('reduzir movimento: o logo parado com um fade curto, sem baixar o vídeo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const videos = pedidosDoVideo(page);
  await page.goto(`${R.base}/`);
  await expect.poll(() => marca(page)).toBe('parado');
  const anim = await page.evaluate(() => ({
    x: document.querySelector('.px-abertura-x')!.getAnimations().length,
    party: document.querySelector('.px-abertura-party')!.getAnimations().length,
    logo: document
      .querySelector('.px-abertura-logo')!
      .getAnimations()
      .map(a => (a as CSSAnimation).animationName),
  }));
  expect(anim.x, 'o X parado').toBe(0);
  expect(anim.party, 'o PARTY parado').toBe(0);
  expect(anim.logo.every(n => n === 'px-abertura-surge'), `só o fade: ${anim.logo.join(', ')}`).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'parado');
  const r = await fim(page);
  expect(r.modos.map(m => m.v)).toEqual(['parado', null]);
  expect(r.naTela, 'cerca de 1,2 s parado e o fade').toBeLessThan(1200 + 300 + FOLGA);
  expect(videos).toEqual([]);
});

async function linkPorBaixo(page: Page) {
  await page.waitForFunction(() => !!document.querySelector('#root a[href]'), null, { timeout: 4000 });
  return page.evaluate(() => {
    for (const a of document.querySelectorAll<HTMLAnchorElement>('#root a[href]')) {
      const b = a.getBoundingClientRect();
      const href = a.getAttribute('href')!;
      if (b.width > 20 && b.height > 20 && b.top > 0 && b.bottom < innerHeight && href !== '/' && href.startsWith('/'))
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, href };
    }
    return null;
  });
}

test('um toque em qualquer lugar pula a abertura, sem passar para o link de baixo', async ({ page }) => {
  await page.goto(`${R.base}/`);
  const alvo = await linkPorBaixo(page);
  expect(alvo, 'um link da página embaixo da camada').not.toBeNull();
  expect(await marca(page)).toBe('video');
  const t = await agora(page);
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(alvo!.x, alvo!.y);
  else await page.mouse.click(alvo!.x, alvo!.y);
  const r = await fim(page);
  expect(r.saiu - t, 'sai logo depois do toque, com o fade').toBeLessThan(700);
  await page.waitForTimeout(800);
  expect(new URL(page.url()).pathname, `o toque não abriu ${alvo!.href}`).toBe('/');
  // Depois da abertura, o mesmo ponto volta a funcionar.
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(alvo!.x, alvo!.y);
  else await page.mouse.click(alvo!.x, alvo!.y);
  await expect.poll(() => new URL(page.url()).pathname).not.toBe('/');
});

test('teclado: Esc pula; no Chromium, o Tab chega direto ao "Pular" (a página por baixo fica inerte)', async ({ page, browserName }) => {
  await page.goto(`${R.base}/`);
  expect(await marca(page)).toBe('video');
  await pular(page);
  await page.reload();
  expect(await marca(page)).toBe('video');
  if (browserName === 'chromium') {
    await page.waitForFunction(() => !!document.querySelector('#root a[href]'));
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Pular abertura' })).toBeFocused();
    await page.keyboard.press('Enter');
    await fim(page);
  } else await pular(page);
});
