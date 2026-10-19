import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { argon2Hasher } from '../server/src/providers/passwordHasher';
import { TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Formas de pagamento com logos, a 360, 390 e 1280 px, no tema claro, num evento com cor de destaque: dois cartões brancos (bandeiras e
 * "Cartão de crédito ou débito"; símbolo Pix e "Pagamento instantâneo"), cada logo com o nome no alt, o texto do bloco "Aceitamos ...",
 * altura de 24 px no computador e 20 px no celular (o símbolo Pix fica em 24 px), arquivos do próprio domínio em /assets com hash e
 * cache longo; no checkout, as mesmas logos nos dois botões. Dados fictícios.
 */
const R = JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'state.json'), 'utf8')) as { base: string; url: string };
const IMG = path.join(TEXTOS_DIR, '..', 'formas-pagamento', 'img');
let db: pg.Pool;
let hash = '';
test.beforeAll(async () => {
  db = new pg.Pool({ connectionString: R.url, max: 2 });
  hash = await argon2Hasher.hash('festa2026');
  mkdirSync(IMG, { recursive: true });
});
test.afterAll(async () => {
  await db?.end();
});
const q = (text: string, params: unknown[] = []) => db.query(text, params);
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const ACCEPTED = 'Aceitamos Visa, Mastercard, Elo, American Express e Pix.';

function cpfFrom(seed: number): string {
  const base = String(500000000 + seed).slice(-9);
  const digit = (s: string) => {
    const sum = [...s].reduce((t, d, i) => t + Number(d) * (s.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = digit(base);
  return base + d1 + digit(base + d1);
}

/** Evento publicado com cor de destaque (roxo escuro) e um tipo de R$ 30,00 à venda. */
async function event() {
  const slug = `festa-das-bandeiras-${uniq()}`;
  const ev = (
    await q(
      `insert into events (slug,name,starts_at,venue,address,description,age_rating,status,accent_color)
       values ($1,'Festa das Bandeiras',now() + interval '40 days','Clube Comercial','Rua do Acampamento, 500','Evento de teste, dados fictícios.','18 anos','publicado','#0E7C66')
       returning id`,
      [slug],
    )
  ).rows[0].id as string;
  await q(
    `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at)
     values ($1,'Pista',3000,200,now() - interval '1 day',now() + interval '30 days')`,
    [ev],
  );
  return slug;
}

async function session(browser: Browser, width: number, email?: string) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
    colorScheme: 'light',
    ...(width < 600 ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}),
  });
  await ctx.addInitScript(() => {
    (window as unknown as { __partyxSemAbertura?: boolean }).__partyxSemAbertura = true;
  });
  const page = await ctx.newPage();
  if (email) {
    await page.goto(`${R.base}/entrar`, { waitUntil: 'networkidle' });
    await page.fill('#email', email);
    await page.fill('#senha', 'festa2026');
    await page.click('button[type=submit]');
    await page.waitForURL(u => !u.pathname.startsWith('/entrar'));
  }
  return { ctx, page };
}

/** Alturas (px) das logos dentro de um elemento, depois de carregadas. */
async function heights(page: Page, scope: string) {
  await page.waitForFunction(s => [...document.querySelectorAll<HTMLImageElement>(`${s} img`)].every(i => i.complete && i.naturalWidth > 0), scope);
  return page.$$eval(`${scope} img`, imgs => (imgs as HTMLImageElement[]).map(i => [i.alt, Math.round(i.getBoundingClientRect().height)]));
}

/**
 * Recorte em volta de um elemento. No celular, a janela cresce até a altura da página antes da foto: a barra fixa de baixo fica no
 * fim, em vez de cobrir o bloco (como nas capturas da transferência).
 */
async function shotAround(page: Page, selector: string, file: string, pad: number) {
  const el = page.locator(selector).first();
  const before = page.viewportSize()!;
  if (before.width < 600) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: before.width, height: Math.max(before.height, height + 200) });
  }
  await el.scrollIntoViewIfNeeded();
  const box = (await el.boundingBox())!;
  await page.screenshot({
    path: file,
    clip: {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
      width: Math.min(before.width - Math.max(0, box.x - pad), box.width + pad * 2),
      height: box.height + pad * 2,
    },
  });
  await page.setViewportSize(before);
}

const noSideScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

for (const width of [360, 390, 1280]) {
  const mobile = width < 600;
  test(`página do evento a ${width} px: dois cartões brancos com as logos oficiais do próprio domínio`, async ({ browser }) => {
    const slug = await event();
    const v = await session(browser, width);
    await v.page.goto(`${R.base}/eventos/${slug}`, { waitUntil: 'networkidle' });
    const block = v.page.locator('.px-paymethods');
    await expect(block.locator('.px-sr')).toHaveText(ACCEPTED);
    const cards = block.locator('.px-paycard');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('Cartão de crédito ou débito');
    await expect(cards.nth(0)).not.toContainText(/em até \dx/);
    await expect(cards.nth(1)).toHaveText('Pagamento instantâneo');
    // Fundo branco nos dois cartões, para as cores oficiais.
    for (const bg of await cards.evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor))) expect(bg).toBe('rgb(255, 255, 255)');
    const h = await heights(v.page, '.px-paymethods');
    const brand = mobile ? 20 : 24;
    expect(h).toEqual([
      ['Visa', brand],
      ['Mastercard', brand],
      ['Elo', brand],
      ['American Express', brand],
      ['Pix', 24],
    ]);
    // Pelo menos 8 px entre as bandeiras.
    const gaps = await block.locator('.px-paycard').first().locator('img').evaluateAll(imgs =>
      imgs.slice(1).map((img, i) => img.getBoundingClientRect().left - imgs[i]!.getBoundingClientRect().right),
    );
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(8);
    // Arquivos do próprio domínio, em /assets com hash no nome e cache longo.
    const srcs = await block.locator('img').evaluateAll(imgs => imgs.map(i => (i as HTMLImageElement).src));
    for (const src of srcs) {
      const u = new URL(src);
      expect(u.origin).toBe(new URL(R.base).origin);
      expect(u.pathname).toMatch(/^\/assets\/(visa|mastercard|elo|amex|pix-simbolo)-[A-Za-z0-9_-]{6,}\.(svg|png)$/);
      const res = await v.page.request.get(src);
      expect(res.status()).toBe(200);
      expect(res.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
    }
    await noSideScroll(v.page);
    // Texto à direita das logos nos dois cartões, em qualquer largura.
    for (const c of await cards.all()) {
      const logos = (await c.locator('.px-paylogos').boundingBox())!;
      const text = (await c.locator('.px-paycard-text').boundingBox())!;
      expect(text.x).toBeGreaterThanOrEqual(logos.x + logos.width);
    }
    // Captura do card de ingressos inteiro, com a página e a cor de destaque do evento ao redor.
    await shotAround(v.page, 'aside.px-event-side', path.join(IMG, `evento-${width}.png`), 24);
    await v.ctx.close();
  });

  test(`checkout a ${width} px: as mesmas logos nos botões de cartão e Pix`, async ({ browser }) => {
    const slug = await event();
    const i = Math.floor(Math.random() * 1e6);
    const email = `bandeiras.${i}@partyx.test`;
    await q("insert into users (name,email,cpf,password_hash,role,birth_date) values ('Carla Mendes',$1,$2,$3,'cliente','1992-05-17')", [
      email,
      cpfFrom(i),
      hash,
    ]);
    const b = await session(browser, width, email);
    await b.page.goto(`${R.base}/eventos/${slug}`, { waitUntil: 'networkidle' });
    await b.page.getByRole('button', { name: 'Mais um Pista' }).first().click();
    await b.page.getByRole('button', { name: 'Continuar' }).first().click();
    await b.page.getByLabel('Li e aceito a Política de Cancelamento, Troca e Reembolso.').check();
    await b.page.getByRole('button', { name: 'Ir para o pagamento' }).first().click();
    await expect(b.page.getByRole('heading', { name: 'Como você quer pagar?' })).toBeVisible();
    const pix = b.page.getByRole('radio', { name: /^Pix/ });
    const cardBtn = b.page.getByRole('radio', { name: /Cartão de crédito ou débito/ });
    await expect(pix).toBeVisible();
    await expect(cardBtn).toBeVisible();
    const h = await heights(b.page, '.px-methods');
    const brand = mobile ? 20 : 24;
    expect(h).toEqual([
      ['Pix', 24],
      ['Visa', brand],
      ['Mastercard', brand],
      ['Elo', brand],
      ['American Express', brand],
    ]);
    await noSideScroll(b.page);
    await shotAround(b.page, '.px-methods', path.join(IMG, `checkout-${width}.png`), 16);
    await b.ctx.close();
  });
}
