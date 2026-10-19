#!/usr/bin/env node
// Diagnóstico: o WebKit do Playwright fecha ("Target crashed") ao usar a página do evento? Repete os passos (+, Continuar) com e sem
// "menos movimento", a 1280 e 360 px, contra o servidor LOCAL da suíte. Uso: node auditoria/ferramentas/webkit-repro.mjs <state.json>
import { readFileSync } from 'node:fs';
import { webkit } from '@playwright/test';
const S = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const browser = await webkit.launch();
async function attempt(label, opts, steps) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => { window.__partyxSemAbertura = true; });
  const page = await ctx.newPage();
  const events = [];
  page.on('crash', () => events.push('CRASH'));
  page.on('pageerror', e => events.push('pageerror: ' + e.message.slice(0, 100)));
  page.on('console', m => { if (m.type() === 'error') events.push('console: ' + m.text().slice(0, 80)); });
  try {
    await page.goto(`${S.base}/eventos/${S.events.principal.slug}`);
    await page.waitForLoadState('networkidle');
    for (const st of steps) {
      if (st === 'mais') await page.getByRole('button', { name: 'Mais um VIP', exact: true }).click({ timeout: 8000 });
      if (st === 'continuar') await page.getByRole('button', { name: 'Continuar', exact: true }).filter({ visible: true }).first().click({ timeout: 8000 });
      if (st === 'esperar') await page.waitForTimeout(1500);
      if (st === 'hover') await page.getByRole('button', { name: 'Mais um VIP', exact: true }).hover({ timeout: 8000 });
    }
    await page.waitForTimeout(1200);
    console.log(label, '=> ok, url', page.url().replace(S.base, ''), events.length ? '| eventos: ' + events.join('; ') : '');
  } catch (e) {
    console.log(label, '=> FALHOU:', e.message.split('\n')[0].slice(0, 90), '| eventos:', events.join('; ') || 'nenhum');
  }
  await ctx.close().catch(() => {});
}
const desktop = { viewport: { width: 1280, height: 800 }, locale: 'pt-BR' };
const mobile = { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, locale: 'pt-BR' };
await attempt('1280 normal: mais, continuar', desktop, ['mais', 'esperar', 'continuar']);
await attempt('1280 normal: só mais', desktop, ['mais', 'esperar']);
await attempt('1280 normal: só hover no +', desktop, ['hover', 'esperar']);
await attempt('1280 menos movimento: mais, continuar', { ...desktop, reducedMotion: 'reduce' }, ['mais', 'esperar', 'continuar']);
await attempt('360 normal: mais, continuar', mobile, ['mais', 'esperar', 'continuar']);
await attempt('360 menos movimento: mais, continuar', { ...mobile, reducedMotion: 'reduce' }, ['mais', 'esperar', 'continuar']);
await attempt('1280 normal, segunda vez: mais, continuar', desktop, ['mais', 'esperar', 'continuar']);
await browser.close();
