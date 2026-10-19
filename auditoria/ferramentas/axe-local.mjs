#!/usr/bin/env node
// Varredura de acessibilidade (axe-core, WCAG 2.1 A e AA) nas páginas do site, da conta, da portaria e do painel, contra o servidor
// LOCAL da suíte da auditoria, a 390 px (celular) e 1280 px. Também confere a navegação por teclado (ordem do foco e foco visível) e
// lista o que um leitor de tela encontra nas telas de compra e do ingresso (nomes acessíveis dos controles).
// Uso: node auditoria/ferramentas/axe-local.mjs <state.json da suíte> <pasta de saída>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const [stateFile, out] = process.argv.slice(2);
const S = JSON.parse(readFileSync(stateFile, 'utf8'));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
async function session(email, password) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR' });
  await ctx.addInitScript(() => { window.__partyxSemAbertura = true; });
  if (email) {
    const r = await ctx.request.post(`${S.base}/api/auth/login`, { data: { email, password }, headers: { origin: S.base } });
    if (!r.ok()) throw new Error(`login ${email}: ${r.status()}`);
  }
  return ctx;
}
const buyer = S.buyers.adulto1;
const order = S.orders.principalPista;
const pages = [
  { name: 'inicio', url: '/', who: null },
  { name: 'eventos', url: '/eventos', who: null },
  { name: 'evento', url: `/eventos/${S.events.principal.slug}`, who: null },
  { name: 'entrar', url: '/entrar', who: null },
  { name: 'criar-conta', url: '/criar-conta', who: null },
  { name: 'recuperar-senha', url: '/recuperar-senha', who: null },
  { name: 'termos', url: '/termos-de-uso', who: null },
  { name: 'checkout', url: `/checkout/${S.events.principal.slug}`, who: 'buyer', prep: 'select' },
  { name: 'pedido', url: `/pedido/${order.id}`, who: 'buyer' },
  { name: 'meus-ingressos', url: '/meus-ingressos', who: 'buyer' },
  { name: 'ingresso', url: `/ingressos/${order.tickets[0].id}`, who: 'buyer' },
  { name: 'ingresso-tela-cheia', url: `/ingressos/${order.tickets[0].id}/tela-cheia`, who: 'buyer' },
  { name: 'transferir', url: `/ingressos/${order.tickets[0].id}/transferir`, who: 'buyer' },
  { name: 'minha-conta', url: '/minha-conta', who: 'buyer' },
  { name: 'minhas-compras', url: '/minhas-compras', who: 'buyer' },
  { name: 'portaria', url: '/portaria', who: 'validador' },
  { name: 'portaria-evento', url: `/portaria/${S.events.principal.id}`, who: 'validador' },
  { name: 'admin', url: '/admin', who: 'admin' },
  { name: 'admin-eventos', url: '/admin/eventos', who: 'admin' },
  { name: 'admin-evento', url: `/admin/eventos/${S.events.principal.id}`, who: 'admin' },
  { name: 'admin-evento-novo', url: '/admin/eventos/novo', who: 'admin' },
  { name: 'admin-pedidos', url: '/admin/pedidos', who: 'admin' },
  { name: 'admin-compradores', url: '/admin/compradores', who: 'admin' },
  { name: 'admin-ingressos', url: '/admin/ingressos', who: 'admin' },
  { name: 'admin-promoters', url: '/admin/promoters', who: 'admin' },
  { name: 'admin-equipe', url: '/admin/equipe', who: 'admin' },
  { name: 'admin-entradas', url: '/admin/entradas', who: 'admin' },
  { name: 'admin-excecoes', url: '/admin/excecoes', who: 'admin' },
  { name: 'admin-relatorio-vendas', url: '/admin/relatorios/vendas', who: 'admin' },
  { name: 'admin-taxa-mensal', url: '/admin/relatorios/taxa-mensal', who: 'admin' },
  { name: 'admin-configuracoes', url: '/admin/configuracoes', who: 'admin' },
];
const creds = { buyer: [buyer.email, buyer.password], validador: [S.team.validador.email, S.team.validador.password], admin: [S.team.admin.email, S.team.admin.password] };
const rows = [];
const details = [];
for (const width of [390, 1280]) {
  for (const p of pages) {
    const ctx = await session(...(p.who ? creds[p.who] : [null, null]));
    const page = await ctx.newPage();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    if (p.prep === 'select') {
      await page.goto(`${S.base}/eventos/${S.events.principal.slug}`);
      await page.getByRole('button', { name: 'Mais um VIP', exact: true }).click();
    }
    await page.goto(`${S.base}${p.url}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    const serious = results.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''));
    rows.push({ page: p.name, width, violations: results.violations.length, serious: serious.length, ids: results.violations.map(v => `${v.id} (${v.impact}, ${v.nodes.length})`) });
    for (const v of results.violations) details.push({ page: p.name, width, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')) });
    // Teclado: Tab por até 25 paradas, anotando o elemento focado e se o foco é visível (outline ou box-shadow).
    if (width === 1280 && ['inicio', 'evento', 'checkout', 'ingresso', 'portaria-evento', 'admin'].includes(p.name)) {
      const stops = [];
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
          const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.getAttribute('placeholder') || el.tagName;
          return { tag: el.tagName.toLowerCase(), name, visible };
        });
        if (!info) break;
        stops.push(info);
      }
      details.push({ page: p.name, width, id: 'teclado', impact: 'info', help: `${stops.length} paradas de Tab; sem foco visível em: ${stops.filter(s => !s.visible).map(s => s.tag + ' ' + s.name).join('; ') || 'nenhuma'}`, nodes: stops.slice(0, 12).map(s => `${s.tag}: ${s.name}`) });
    }
    // Leitor de tela (nomes acessíveis) nas telas de compra e do ingresso.
    if (width === 390 && ['evento', 'checkout', 'pedido', 'ingresso'].includes(p.name)) {
      const names = await page.evaluate(() => [...document.querySelectorAll('button, a, input, select, [role=radio], [role=tab], img')].slice(0, 60).map(el => {
        const tag = el.tagName.toLowerCase();
        const name = el.getAttribute('aria-label') || (tag === 'img' ? el.getAttribute('alt') : null) || (el.labels && el.labels[0]?.textContent?.trim()) || el.textContent?.trim().slice(0, 40) || '';
        return `${tag}${el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : ''}: ${name || '(SEM NOME)'}`;
      }));
      details.push({ page: p.name, width, id: 'leitor-de-tela', impact: 'info', help: `${names.filter(n => n.endsWith('(SEM NOME)')).length} controles sem nome acessível de ${names.length}`, nodes: names.filter(n => n.endsWith('(SEM NOME)')).slice(0, 10) });
    }
    await ctx.close();
  }
}
await browser.close();
const md = ['| Página | Largura | Violações | Sérias ou críticas | Regras |', '|---|---|---|---|---|'];
for (const r of rows) md.push(`| ${r.page} | ${r.width} | ${r.violations} | ${r.serious} | ${r.ids.join(', ') || 'nenhuma'} |`);
md.push('', '## Detalhes', '');
for (const d of details) md.push(`- **${d.page} (${d.width} px) ${d.id}** [${d.impact}]: ${d.help}${d.nodes.length ? ' | ' + d.nodes.map(n => '`' + n.replace(/`/g, '') + '`').join(', ') : ''}`);
writeFileSync(path.join(out, 'axe.md'), md.join('\n') + '\n');
writeFileSync(path.join(out, 'axe.json'), JSON.stringify({ rows, details }, null, 1));
console.log(md.slice(0, rows.length + 2).join('\n'));
