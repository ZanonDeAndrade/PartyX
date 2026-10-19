#!/usr/bin/env node
// Heurísticas de celular no servidor LOCAL da suíte: alvos de toque menores que 44 px, campos de CPF, telefone e data (tipo, teclado
// numérico, máscara ao digitar), botões principais ao alcance do polegar (metade inferior da tela a 390 px), estados vazios e de erro.
// Uso: node auditoria/ferramentas/toque-local.mjs <state.json da suíte> <saida.md>
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [stateFile, out] = process.argv.slice(2);
const S = JSON.parse(readFileSync(stateFile, 'utf8'));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR', ...{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } });
await ctx.addInitScript(() => { window.__partyxSemAbertura = true; });
const page = await ctx.newPage();
const md = [];
async function login(email, password) {
  await ctx.clearCookies();
  const r = await ctx.request.post(`${S.base}/api/auth/login`, { data: { email, password }, headers: { origin: S.base } });
  if (!r.ok()) throw new Error(`login ${email}`);
}
async function smallTargets(name) {
  const items = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=radio], [role=tab], [role=checkbox]')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (r.width < 44 || r.height < 44) {
        const label = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.getAttribute('placeholder') || el.id || el.tagName.toLowerCase();
        out.push({ label, w: Math.round(r.width), h: Math.round(r.height), tag: el.tagName.toLowerCase() });
      }
    }
    return out;
  });
  const bad = items.filter(i => i.h < 24 || i.w < 24);
  md.push(`| ${name} | ${items.length} | ${bad.length} | ${items.slice(0, 8).map(i => `${i.label} (${i.w}×${i.h})`).join('; ')} |`);
}
async function primaryReach(name, selector) {
  const r = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!r) return md.push(`- ${name}: botão principal não encontrado (${selector})`);
  const vh = 844;
  md.push(`- ${name}: botão principal "${selector}" em y=${Math.round(r.y)} (${r.y + r.height <= vh ? 'na primeira tela' : 'abaixo da primeira tela'}; ${r.y >= vh / 2 ? 'metade inferior, ao alcance do polegar' : 'metade superior'}), ${Math.round(r.width)}×${Math.round(r.height)} px`);
}

md.push('## Alvos de toque menores que 44 px (390 px, iPhone simulado)', '', '| Página | Menores que 44 px | Menores que 24 px | Exemplos |', '|---|---|---|---|');
await page.goto(`${S.base}/`); await page.waitForLoadState('networkidle'); await smallTargets('início');
await page.goto(`${S.base}/eventos/${S.events.principal.slug}`); await page.waitForLoadState('networkidle'); await smallTargets('evento');
await page.goto(`${S.base}/criar-conta`); await page.waitForLoadState('networkidle'); await smallTargets('criar conta');
await page.goto(`${S.base}/entrar`); await smallTargets('entrar');
await login(S.buyers.adulto1.email, S.buyers.adulto1.password);
await page.goto(`${S.base}/eventos/${S.events.principal.slug}`); await page.getByRole('button', { name: 'Mais um VIP', exact: true }).click();
await page.getByRole('button', { name: 'Continuar', exact: true }).filter({ visible: true }).first().click(); await page.waitForLoadState('networkidle'); await smallTargets('checkout (revisão)');
await page.goto(`${S.base}/pedido/${S.orders.principalPista.id}`); await page.waitForLoadState('networkidle'); await smallTargets('pedido');
await page.goto(`${S.base}/meus-ingressos`); await page.waitForLoadState('networkidle'); await smallTargets('meus ingressos');
await page.goto(`${S.base}/ingressos/${S.orders.principalPista.tickets[0].id}`); await page.waitForLoadState('networkidle'); await smallTargets('ingresso');
await login(S.team.validador.email, S.team.validador.password);
await page.goto(`${S.base}/portaria/${S.events.principal.id}`); await page.waitForLoadState('networkidle'); await smallTargets('portaria');
await login(S.team.admin.email, S.team.admin.password);
await page.goto(`${S.base}/admin/eventos/${S.events.principal.id}`); await page.waitForLoadState('networkidle'); await smallTargets('admin: evento');
await page.goto(`${S.base}/admin/pedidos`); await page.waitForLoadState('networkidle'); await smallTargets('admin: pedidos');

md.push('', '## Alcance do polegar (botão principal na primeira tela a 390 × 844)', '');
await ctx.clearCookies();
await page.goto(`${S.base}/eventos/${S.events.principal.slug}`); await page.waitForLoadState('networkidle');
await page.getByRole('button', { name: 'Mais um VIP', exact: true }).click();
await primaryReach('evento (após escolher)', 'button:has-text("Continuar")');
await page.goto(`${S.base}/entrar`); await primaryReach('entrar', 'button:has-text("Entrar")');
await page.goto(`${S.base}/criar-conta`); await primaryReach('criar conta', 'button:has-text("Criar conta")');

md.push('', '## Campos de CPF, telefone e data (teclado e máscara)', '');
await page.goto(`${S.base}/criar-conta`);
const fieldInfo = async (label) => {
  const el = page.getByLabel(label, { exact: true }).first();
  const attrs = await el.evaluate(e => ({ type: e.getAttribute('type'), inputmode: e.getAttribute('inputmode'), autocomplete: e.getAttribute('autocomplete'), pattern: e.getAttribute('pattern'), maxlength: e.getAttribute('maxlength') }));
  return { el, attrs };
};
const cpf = await fieldInfo('CPF'); await cpf.el.fill(''); await cpf.el.pressSequentially('12345678909'); const cpfVal = await cpf.el.inputValue();
md.push(`- CPF: type=${cpf.attrs.type}, inputmode=${cpf.attrs.inputmode}, autocomplete=${cpf.attrs.autocomplete}; digitado 12345678909 mostra "${cpfVal}" (${/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(cpfVal) ? 'máscara aplicada' : 'SEM máscara'})`);
const tel = await fieldInfo('Telefone com DDD'); await tel.el.fill(''); await tel.el.pressSequentially('11987654321'); const telVal = await tel.el.inputValue();
md.push(`- Telefone: type=${tel.attrs.type}, inputmode=${tel.attrs.inputmode}, autocomplete=${tel.attrs.autocomplete}; digitado 11987654321 mostra "${telVal}" (${/\(\d{2}\) \d{4,5}-\d{4}/.test(telVal) ? 'máscara aplicada' : 'SEM máscara'})`);
const nasc = await page.locator('#nascimento').evaluate(e => ({ type: e.getAttribute('type'), inputmode: e.getAttribute('inputmode'), min: e.getAttribute('min'), max: e.getAttribute('max'), appearance: getComputedStyle(e).appearance || getComputedStyle(e).webkitAppearance }));
md.push(`- Data de nascimento: type=${nasc.type} (teclado e seletor nativos do iPhone), min=${nasc.min}, max=${nasc.max}, appearance=${nasc.appearance}`);
const email = await fieldInfo('E-mail');
md.push(`- E-mail: type=${email.attrs.type}, inputmode=${email.attrs.inputmode}, autocomplete=${email.attrs.autocomplete}`);

md.push('', '## Estados vazios, de carregamento e de erro', '');
await ctx.clearCookies();
await page.goto(`${S.base}/eventos?q=nadaexiste`); await page.waitForLoadState('networkidle');
md.push(`- Busca sem resultado: "${(await page.locator('main h2').first().innerText().catch(() => '')).trim()}" com link "${(await page.getByRole('link', { name: /Ver todos|Limpar/ }).first().innerText().catch(() => '(sem link)')).trim()}"`);
const fresh = await ctx.request.post(`${S.base}/api/auth/register`, { data: {}, headers: { origin: S.base } }).catch(() => null); void fresh;
await login(S.buyers.adulto5.email, S.buyers.adulto5.password);
await page.goto(`${S.base}/meus-ingressos`); await page.waitForLoadState('networkidle');
md.push(`- Meus ingressos sem compras: "${(await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 220)}"`);
await page.goto(`${S.base}/minhas-compras`); await page.waitForLoadState('networkidle');
md.push(`- Minhas compras sem pedidos: "${(await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 200)}"`);
await ctx.clearCookies();
await page.goto(`${S.base}/entrar`);
await page.getByLabel('E-mail').fill('x@x'); await page.locator('#senha, input[type=password]').first().fill('1'); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForTimeout(800);
const focused = await page.evaluate(() => document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : 'nenhum');
let loginMsg = await page.getByRole('alert').first().innerText().catch(() => '');
if (!loginMsg) loginMsg = await page.locator('.px-error').first().innerText().catch(() => '');
md.push(`- Login com dados errados: mensagem "${loginMsg.trim().slice(0, 120)}"; foco depois do erro em: ${focused}`);
await page.goto(`${S.base}/criar-conta`); await page.getByRole('button', { name: 'Criar conta', exact: true }).click(); await page.waitForTimeout(500);
const focused2 = await page.evaluate(() => document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : 'nenhum');
const errs = await page.locator('.px-error').allInnerTexts();
md.push(`- Cadastro vazio enviado: ${errs.length} mensagens de campo; foco depois do erro em: ${focused2}; primeira mensagem "${(errs[0] ?? '').trim()}"`);
// Carregando: esqueleto com aria-busy?
await page.goto(`${S.base}/eventos/${S.events.principal.slug}`);
const busy = await page.locator('[aria-busy="true"]').count();
md.push(`- Estado de carregamento: ${busy > 0 ? 'esqueleto com aria-busy presente durante a carga' : 'sem aria-busy observado (carga rápida ou sem esqueleto)'}`);
writeFileSync(out, md.join('\n') + '\n');
console.log(md.join('\n'));
await browser.close();
