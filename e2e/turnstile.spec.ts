import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { TS_DIR } from './support/turnstile-setup';

/**
 * Turnstile nas telas: enquanto o token não chega, o botão de envio fica desabilitado com "Verificando…"; com o token, libera. Se o
 * widget falha, o script não carrega ou o token não chega em 10 s, a tela mostra a mensagem e "Tentar de novo", e o botão continua
 * desabilitado. Chaves de TESTE da Cloudflare (1x…AA aprova, 2x…AB bloqueia); o script real da Cloudflare é carregado da internet.
 */
const S = JSON.parse(readFileSync(path.join(TS_DIR, 'state.json'), 'utf8')) as { passa: string; bloqueia: string };
const CF = 'https://challenges.cloudflare.com/**';
const FALHA = /Não foi possível confirmar que você não é um robô/;

async function skipIntro(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __partyxSemAbertura?: boolean }).__partyxSemAbertura = true;
  });
}

for (const [rota, botao] of [
  ['/recuperar-senha', 'Enviar link'],
  ['/criar-conta', 'Criar conta'],
] as const) {
  test(`${rota}: "Verificando…" desabilitado até o token; depois "${botao}" liberado`, async ({ page }) => {
    await skipIntro(page);
    // Segura o script da Cloudflare por 2 s, para o estado intermediário ficar observável.
    await page.route(CF, async r => {
      await new Promise(res => setTimeout(res, 2000));
      await r.continue();
    });
    await page.goto(`${S.passa}${rota}`);
    if (rota === '/recuperar-senha') await page.getByLabel('E-mail').fill('ana@partyx.test');
    const verificando = page.getByRole('button', { name: 'Verificando…' });
    await expect(verificando).toBeVisible();
    await expect(verificando).toBeDisabled();
    await expect(page.getByRole('button', { name: botao, exact: true })).toBeEnabled();
    await expect(page.getByRole('alert').filter({ hasText: FALHA })).toHaveCount(0);
  });
}

test('recuperação: com o token, o envio é aceito pelo servidor (verificação real na Cloudflare, chave de teste)', async ({ page }) => {
  await skipIntro(page);
  await page.goto(`${S.passa}/recuperar-senha`);
  await page.getByLabel('E-mail').fill('ninguem@partyx.test');
  await page.getByRole('button', { name: 'Enviar link', exact: true }).click();
  await expect(page.getByRole('heading').first()).not.toHaveText('Recuperar senha');
  await expect(page.getByRole('alert').filter({ hasText: /robô/ })).toHaveCount(0);
});

test('widget que bloqueia: mensagem clara, "Tentar de novo" e botão desabilitado', async ({ page }) => {
  await skipIntro(page);
  await page.goto(`${S.bloqueia}/recuperar-senha`);
  await page.getByLabel('E-mail').fill('ana@partyx.test');
  await expect(page.getByRole('alert').filter({ hasText: FALHA })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar link', exact: true })).toBeDisabled();
});

test('script da Cloudflare fora do ar: mensagem; "Tentar de novo" com a rede de volta libera o envio', async ({ page }) => {
  await skipIntro(page);
  await page.route(CF, r => r.abort());
  await page.goto(`${S.passa}/recuperar-senha`);
  await page.getByLabel('E-mail').fill('ana@partyx.test');
  await expect(page.getByRole('alert').filter({ hasText: FALHA })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar link', exact: true })).toBeDisabled();
  await page.unroute(CF);
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByRole('alert').filter({ hasText: FALHA })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enviar link', exact: true })).toBeEnabled();
});

test('token que não chega em 10 s: mensagem com "Tentar de novo"', async ({ page }) => {
  await skipIntro(page);
  await page.route(CF, () => {}); // nunca responde
  await page.goto(`${S.passa}/criar-conta`);
  await expect(page.getByRole('button', { name: 'Verificando…' })).toBeDisabled();
  const t0 = Date.now();
  await expect(page.getByRole('alert').filter({ hasText: FALHA })).toBeVisible({ timeout: 15_000 });
  expect(Date.now() - t0).toBeGreaterThan(7_000);
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar conta', exact: true })).toBeDisabled();
});
