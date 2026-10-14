import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { readTextosState, TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Texto digitado pelo admin ou pelo comprador não quebra o leiaute (pedido de 14/10/2026): descrição de 300 caracteres sem
 * espaço, URL, emojis e quebras de linha; nome do evento, local, tipo, comprador, e-mail e promoter no limite. Em cada tela e
 * largura, falha se houver:
 * - rolagem horizontal da página;
 * - texto que escapa da própria caixa (estoura por cima de outra coisa ou fica cortado por um recorte);
 * - palavra curta partida no meio (preço, data, código, rótulo): sinal de coluna espremida ao lado de um texto longo.
 * Capturas de página inteira em e2e/.run/textos-longos/img (fora do Git).
 */
const R = readTextosState();
const IMG = path.join(TEXTOS_DIR, 'img');
const WIDTHS = [360, 768, 1280] as const;
const BUYER = 'compradora.com.um.endereco.de.email.bem.comprido.para.testar.a.quebra@partyx.test';
const LOGIN = { buyer: BUYER, admin: 'admin@partyx.test', gate: 'portaria@partyx.test' } as const;

interface Screen {
  id: string;
  path: string;
  who?: keyof typeof LOGIN;
  cart?: boolean;
  gateSearch?: boolean;
}
const SCREENS: Screen[] = [
  { id: 'evento', path: '/eventos/texto-longo' },
  { id: 'vitrine', path: '/' },
  { id: 'vitrine-eventos', path: '/eventos' },
  { id: 'busca', path: '/eventos?q=FestaTesteteste' },
  { id: 'checkout', path: '/checkout/texto-longo', who: 'buyer', cart: true },
  { id: 'meus-ingressos', path: '/meus-ingressos', who: 'buyer' },
  { id: 'ingresso', path: `/ingressos/${R.ticketId}`, who: 'buyer' },
  { id: 'minhas-compras', path: '/minhas-compras', who: 'buyer' },
  { id: 'pedido', path: `/pedido/${R.orderId}`, who: 'buyer' },
  { id: 'minha-conta', path: '/minha-conta', who: 'buyer' },
  { id: 'autorizacao', path: `/autorizacao-menor/pedido/${R.orderId}`, who: 'buyer' },
  { id: 'admin-inicio', path: '/admin', who: 'admin' },
  { id: 'admin-eventos', path: '/admin/eventos', who: 'admin' },
  { id: 'admin-evento', path: `/admin/eventos/${R.eventId}`, who: 'admin' },
  { id: 'admin-pedidos', path: '/admin/pedidos', who: 'admin' },
  { id: 'admin-pedido', path: `/admin/pedidos/${R.orderId}`, who: 'admin' },
  { id: 'admin-compradores', path: '/admin/compradores', who: 'admin' },
  { id: 'admin-ingressos', path: '/admin/ingressos', who: 'admin' },
  { id: 'admin-ingresso', path: `/admin/ingressos/${R.ticketId}`, who: 'admin' },
  { id: 'admin-promoters', path: '/admin/promoters', who: 'admin' },
  { id: 'admin-entradas', path: '/admin/entradas', who: 'admin' },
  { id: 'admin-equipe', path: '/admin/equipe', who: 'admin' },
  { id: 'admin-rel-vendas', path: '/admin/relatorios/vendas', who: 'admin' },
  { id: 'admin-rel-promoters', path: '/admin/relatorios/promoters', who: 'admin' },
  { id: 'portaria-eventos', path: '/portaria', who: 'gate' },
  { id: 'portaria-busca', path: `/portaria/${R.eventId}`, who: 'gate', gateSearch: true },
];

/** Roda na página. Devolve os problemas encontrados (vazio = ok). */
function detect() {
  const vw = document.documentElement.clientWidth;
  const name = (el: Element) =>
    el.tagName.toLowerCase() +
    (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const clipped = (el: Element | null) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX !== 'visible' || s.textOverflow === 'ellipsis') return true;
    }
    return false;
  };
  const blockOf = (n: Node) => {
    let box = n.parentElement;
    while (box && getComputedStyle(box).display.startsWith('inline')) box = box.parentElement;
    return box;
  };
  // Escondido para leitor de tela (caixa de 1 px recortada, como o cabeçalho das tabelas no celular) ou decorativo: não aparece.
  const hidden = (box: Element) => {
    const head = box.closest('thead');
    return (
      box.getBoundingClientRect().width <= 2 ||
      (!!head && head.getBoundingClientRect().width <= 2) ||
      !!box.closest('.px-sr, [aria-hidden="true"], .px-intro, svg')
    );
  };
  const issues: string[] = [];
  const scroll = document.documentElement.scrollWidth - vw;
  if (scroll > 0) issues.push(`rolagem horizontal de ${scroll}px`);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    if (!n.textContent?.trim()) continue;
    const box = blockOf(n);
    if (!box || hidden(box)) continue;
    const br = box.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(n);
    let over = 0;
    for (const r of range.getClientRects()) if (r.width > 0) over = Math.max(over, r.right - br.right, br.left - r.left);
    if (over > 2)
      issues.push(`${clipped(box) ? 'cortado' : 'estoura'} ${Math.round(over)}px em ${name(box)}: "${n.textContent.trim().slice(0, 30)}"`);
    for (const m of n.textContent.matchAll(/\S+/g)) {
      if (m[0].length < 3 || m[0].length > 24) continue;
      const rg = document.createRange();
      rg.setStart(n, m.index!);
      rg.setEnd(n, m.index! + m[0].length);
      const tops = new Set([...rg.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top)));
      if (tops.size > 1) issues.push(`partida em ${name(box)}: "${m[0]}"`);
    }
  }
  return [...new Set(issues)];
}

const contexts = new Map<string, BrowserContext>();
async function contextFor(browser: Browser, width: number, who?: keyof typeof LOGIN) {
  const key = `${width}|${who ?? ''}`;
  if (contexts.has(key)) return contexts.get(key)!;
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
  if (who) {
    const p = await ctx.newPage();
    await p.goto(R.base + '/entrar', { waitUntil: 'networkidle' });
    await p.fill('#email', LOGIN[who]);
    await p.fill('#senha', 'festa2026');
    await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/entrar'));
    await p.close();
  }
  contexts.set(key, ctx);
  return ctx;
}
test.afterAll(async () => {
  for (const c of contexts.values()) await c.close();
});

for (const width of WIDTHS)
  for (const s of SCREENS)
    test(`${s.id} a ${width}px`, async ({ browser }) => {
      const ctx = await contextFor(browser, width, s.who);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(String(e)));
      if (s.cart) {
        await page.goto(R.base + '/', { waitUntil: 'domcontentloaded' });
        await page.evaluate(
          typeId => sessionStorage.setItem('px.cart', JSON.stringify({ slug: 'texto-longo', items: [{ ticketTypeId: typeId, quantity: 2 }] })),
          R.typeId,
        );
      }
      await page.goto(R.base + s.path, { waitUntil: 'networkidle' });
      if (s.gateSearch) {
        await page.getByRole('tab', { name: 'Busca manual' }).click();
        await page.fill('#busca', 'Ana');
        await page.getByRole('button', { name: 'Buscar' }).click();
        await page.waitForSelector('.px-hit');
      }
      await page.waitForTimeout(500);
      // A tela certa carregou (sem redirecionar para o login ou para uma página de erro).
      expect(new URL(page.url()).pathname).toBe(s.path.split('?')[0]);
      mkdirSync(IMG, { recursive: true });
      await page.screenshot({ path: path.join(IMG, `${s.id}-${width}.jpg`), fullPage: true, type: 'jpeg', quality: 72 });
      expect(await page.evaluate(detect)).toEqual([]);
      expect(errors).toEqual([]);
      await page.close();
    });
