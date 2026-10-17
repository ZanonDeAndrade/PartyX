import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Sem meia-entrada (16/10/2026): o menu de Documentos, o rodapé e a página do evento não levam mais a "Meia-entrada", e a página antiga
 * vai para os Termos de Uso (301 no servidor; troca de endereço quando o link é seguido dentro do site).
 */
const R = JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'state.json'), 'utf8')) as { base: string };
const IMG = path.join(TEXTOS_DIR, '..', 'documentos', 'img');
test.beforeAll(() => mkdirSync(IMG, { recursive: true }));

for (const width of [360, 1280]) {
  test(`menu de Documentos e rodapé sem "Meia-entrada" a ${width} px`, async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
      ...(width < 600 ? { deviceScaleFactor: 2 } : {}),
    });
    await ctx.addInitScript(() => {
      (window as unknown as { __partyxSemAbertura?: boolean }).__partyxSemAbertura = true;
    });
    const page = await ctx.newPage();
    await page.goto(`${R.base}/termos-de-uso`, { waitUntil: 'networkidle' });
    const docs = page.locator('.px-legal-page nav, .px-legal-page [aria-label*="ocumentos"]').first();
    await expect(docs).toBeVisible();
    await expect(docs.getByRole('link')).toHaveText([
      'Termos de Uso',
      'Política de Privacidade',
      'Cancelamento, troca e reembolso',
      'Termo para menores',
    ]);
    // Em lugar nenhum da página (menu, rodapé, cabeçalho) há link ou item de menu da meia-entrada. (O texto oficial dos Termos, com a
    // frase sobre meia-entrada, não existe neste ambiente de teste: aqui os Termos são o aviso de homologação.)
    await expect(page.locator('a[href*="meia"]')).toHaveCount(0);
    await expect(docs.getByText(/meia/i)).toHaveCount(0);
    await expect(page.locator('footer').getByText(/meia/i)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await docs.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(IMG, `documentos-${width}.png`) });
    // A página do evento também não leva à meia-entrada (o evento de texto longo tem um tipo com "Meia" no nome).
    await page.goto(`${R.base}/eventos/texto-longo`, { waitUntil: 'networkidle' });
    await expect(page.locator('a[href*="meia"]')).toHaveCount(0);
    await ctx.close();
  });
}

test('página antiga: 301 do servidor para /termos-de-uso e, dentro do site, os Termos com o endereço trocado', async ({ browser, request }) => {
  const res = await request.get(`${R.base}/meia-entrada`, { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers()['location']).toBe('/termos-de-uso');
  expect((await request.get(`${R.base}/api/public/legal/meia-entrada`)).status()).toBe(404);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    (window as unknown as { __partyxSemAbertura?: boolean }).__partyxSemAbertura = true;
  });
  const page = await ctx.newPage();
  await page.goto(`${R.base}/meia-entrada`, { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(`${R.base}/termos-de-uso`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Termos de Uso');
  // Link antigo seguido dentro do site (sem passar pelo servidor).
  await page.evaluate(() => {
    window.history.pushState(null, '', '/meia-entrada');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(`${R.base}/termos-de-uso`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Termos de Uso');
  await ctx.close();
});
