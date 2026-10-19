#!/usr/bin/env node
// Diagnóstico complementar: a página do evento derruba o WebKit do Playwright; testa com partes do CSS desligadas para apontar a causa.
// Uso: node auditoria/ferramentas/webkit-repro-css.mjs <state.json>
import { readFileSync } from 'node:fs';
import { webkit } from '@playwright/test';
const S = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const browser = await webkit.launch();
const variants = [
  ['sem alteração', ''],
  ['sem filter e backdrop-filter', '* { filter: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }'],
  ['sem transform e transition', '* { transform: none !important; transition: none !important; animation: none !important; }'],
  ['sem view-transition-name', '* { view-transition-name: none !important; }'],
  ['sem mix-blend-mode e mask', '* { mix-blend-mode: normal !important; mask: none !important; -webkit-mask: none !important; }'],
  ['sem position sticky/fixed', '* { position: static !important; }'],
  ['tudo acima', '* { filter: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; transform: none !important; transition: none !important; animation: none !important; view-transition-name: none !important; mix-blend-mode: normal !important; mask: none !important; -webkit-mask: none !important; }'],
];
for (const [label, css] of variants) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' });
  await ctx.addInitScript(() => { window.__partyxSemAbertura = true; });
  const page = await ctx.newPage();
  let crashed = false;
  page.on('crash', () => { crashed = true; });
  try {
    await page.goto(`${S.base}/eventos/${S.events.principal.slug}`);
    if (css) await page.addStyleTag({ content: css });
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Mais um VIP', exact: true }).hover({ timeout: 8000 });
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Mais um VIP', exact: true }).click({ timeout: 8000 });
    await page.waitForTimeout(1500);
    console.log(label, '=>', crashed ? 'CRASH' : 'ok');
  } catch (e) {
    console.log(label, '=> FALHOU', crashed ? '(CRASH)' : '', e.message.split('\n')[0].slice(0, 60));
  }
  await ctx.close().catch(() => {});
}
// Página inicial e página de outra área, para saber se é só a página do evento.
for (const [label, url] of [['início', '/'], ['entrar', '/entrar'], ['eventos (lista)', '/eventos']]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' });
  await ctx.addInitScript(() => { window.__partyxSemAbertura = true; });
  const page = await ctx.newPage();
  let crashed = false;
  page.on('crash', () => { crashed = true; });
  try {
    await page.goto(`${S.base}${url}`);
    await page.waitForLoadState('networkidle');
    await page.mouse.move(400, 400);
    await page.mouse.move(600, 500);
    await page.waitForTimeout(1500);
    console.log(label, '=>', crashed ? 'CRASH' : 'ok');
  } catch (e) {
    console.log(label, '=> FALHOU', crashed ? '(CRASH)' : '', e.message.split('\n')[0].slice(0, 60));
  }
  await ctx.close().catch(() => {});
}
await browser.close();
