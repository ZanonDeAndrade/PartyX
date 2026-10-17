import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Busca só pelo cabeçalho (16/10/2026): a vitrine e o início sem o formulário "Nome do evento", "Data" e "Buscar"; a busca do cabeçalho
 * (no celular, atrás da lupa) leva a /eventos?q=, com "Resultados para" e "Limpar busca", ou a mensagem de nenhum evento com o link
 * para todos. Links antigos com `?date=` abrem a lista sem erro: o nome filtra e a data é ignorada.
 */
const R = JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'state.json'), 'utf8')) as { base: string };
const IMG = path.join(TEXTOS_DIR, '..', 'busca', 'img');
test.beforeAll(() => mkdirSync(IMG, { recursive: true }));

async function open(browser: Browser, width: number): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
    ...(width < 600 ? { deviceScaleFactor: 2 } : {}),
  });
  await ctx.addInitScript(() => {
    (window as unknown as { __partyxSemAbertura?: boolean }).__partyxSemAbertura = true;
  });
  return ctx.newPage();
}
const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const cards = (page: Page) => page.locator('#conteudo .px-grid > .px-card');
const field = (page: Page) => page.getByRole('searchbox', { name: 'Buscar evento' });
// O valor é conferido pelo seletor: no celular, com a busca fechada, o campo some da árvore de acessibilidade.
const fieldValue = (page: Page) => page.locator('#px-hsearch input');

/** Abre o campo do cabeçalho: no celular, pela lupa (que mostra o campo por cima da linha e põe o foco nele). */
async function headerSearch(page: Page, width: number, term: string) {
  if (width < 768) {
    await expect(field(page)).toBeHidden();
    await page.getByRole('button', { name: 'Buscar eventos' }).click();
    await expect(page.getByRole('button', { name: 'Buscar eventos' })).toHaveAttribute('aria-expanded', 'true');
    await expect(field(page)).toBeFocused();
  } else {
    await expect(page.getByRole('button', { name: 'Buscar eventos' })).toBeHidden();
    await field(page).click();
  }
  await field(page).fill(term);
  await field(page).press('Enter');
}

for (const width of [360, 1280]) {
  test(`vitrine sem o formulário e busca pelo cabeçalho a ${width} px`, async ({ browser }) => {
    const page = await open(browser, width);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    // Vitrine: sem "Nome do evento", "Data" nem "Buscar" no conteúdo; a lista vem logo abaixo do título.
    await page.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
    const main = page.locator('#conteudo');
    await expect(main.locator('form')).toHaveCount(0);
    await expect(main.getByLabel('Nome do evento')).toHaveCount(0);
    await expect(main.getByLabel('Data')).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Buscar' })).toHaveCount(0);
    await expect(page.locator('.px-search-note')).toHaveCount(0);
    await expect(cards(page).first()).toBeVisible();
    const gap = await page.evaluate(() => {
      const h1 = document.querySelector('#conteudo h1')!.getBoundingClientRect();
      const grid = document.querySelector('#conteudo .px-grid')!.getBoundingClientRect();
      return grid.top - h1.bottom;
    });
    expect(gap).toBeLessThan(80);
    expect(await noSideScroll(page)).toBe(0);
    await page.screenshot({ path: path.join(IMG, `vitrine-${width}.png`) });

    // O início também ficou sem o formulário.
    await page.goto(`${R.base}/`, { waitUntil: 'networkidle' });
    await expect(page.locator('#conteudo form')).toHaveCount(0);

    // Com resultado: parte do nome, sem diferença de maiúsculas.
    await headerSearch(page, width, 'festa');
    await expect(page).toHaveURL(`${R.base}/eventos?q=festa`);
    await expect(page.locator('.px-search-note')).toContainText('Resultados para “festa”');
    await expect(cards(page)).toHaveCount(1);
    await expect(fieldValue(page)).toHaveValue('festa');
    if (width < 768) await expect(fieldValue(page)).toBeHidden();
    expect(await noSideScroll(page)).toBe(0);
    await page.screenshot({ path: path.join(IMG, `busca-com-resultado-${width}.png`) });

    // "Limpar busca" volta à lista inteira e esvazia o campo.
    await page.getByRole('link', { name: 'Limpar busca' }).click();
    await expect(page).toHaveURL(`${R.base}/eventos`);
    await expect(page.locator('.px-search-note')).toHaveCount(0);
    await expect(fieldValue(page)).toHaveValue('');

    // Sem resultado: a mensagem com o termo e o link para todos.
    await headerSearch(page, width, 'Inexistente Xyz');
    await expect(page).toHaveURL(`${R.base}/eventos?q=Inexistente+Xyz`);
    await expect(page.getByRole('heading', { name: 'Nenhum evento encontrado para “Inexistente Xyz”' })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    expect(await noSideScroll(page)).toBe(0);
    await page.screenshot({ path: path.join(IMG, `busca-sem-resultado-${width}.png`) });
    await page.getByRole('link', { name: 'Ver todos os eventos' }).click();
    await expect(page).toHaveURL(`${R.base}/eventos`);
    await expect(cards(page).first()).toBeVisible();
    expect(errors).toEqual([]);
    await page.context().close();
  });
}

test('celular: a lupa abre o campo, que fecha no X, no Esc e ao tocar fora', async ({ browser }) => {
  const page = await open(browser, 360);
  await page.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  const lupa = page.getByRole('button', { name: 'Buscar eventos' });

  await lupa.click();
  await expect(field(page)).toBeFocused();
  // O campo cobre a linha do cabeçalho sem passar da largura da tela.
  const box = (await field(page).locator('xpath=..').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  await field(page).fill('baile');
  await page.screenshot({ path: path.join(IMG, 'lupa-aberta-360.png') });
  await page.getByRole('button', { name: 'Fechar a busca' }).click();
  await expect(field(page)).toBeHidden();
  await expect(lupa).toBeFocused();
  await expect(lupa).toHaveAttribute('aria-expanded', 'false');

  await lupa.click();
  await expect(field(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(field(page)).toBeHidden();
  await expect(lupa).toBeFocused();

  await lupa.click();
  await expect(field(page)).toBeFocused();
  await page.locator('#conteudo h1').click();
  await expect(field(page)).toBeHidden();
  await page.context().close();
});

test('links antigos com ?date= não dão erro: o nome filtra e a data é ignorada', async ({ browser, request }) => {
  // API: a data não é mais validada nem usada (antes, uma data fora do formato dava 422).
  const plain = await request.get(`${R.base}/api/public/events`);
  const withDate = await request.get(`${R.base}/api/public/events?date=2030-01-01`);
  const badDate = await request.get(`${R.base}/api/public/events?date=ontem`);
  expect([plain.status(), withDate.status(), badDate.status()]).toEqual([200, 200, 200]);
  const slugs = async (r: typeof plain) => ((await r.json()) as { events: { slug: string }[] }).events.map(e => e.slug);
  expect(await slugs(withDate)).toEqual(await slugs(plain));
  const named = await request.get(`${R.base}/api/public/events?q=baile&date=2030-01-01`);
  expect(named.status()).toBe(200);
  expect(await slugs(named)).toEqual(['baile-de-verao']);

  const page = await open(browser, 1280);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${R.base}/eventos?date=2030-01-01`, { waitUntil: 'networkidle' });
  await expect(page.locator('.px-search-note')).toHaveCount(0);
  await expect(cards(page).first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.goto(`${R.base}/eventos?q=festa&date=2030-01-01`, { waitUntil: 'networkidle' });
  await expect(page.locator('.px-search-note')).toContainText('Resultados para “festa”');
  await expect(cards(page)).toHaveCount(1);
  await expect(fieldValue(page)).toHaveValue('festa');
  expect(errors).toEqual([]);
  await page.context().close();
});
