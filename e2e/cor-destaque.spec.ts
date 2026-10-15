import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Cor de destaque do evento (0014). Cada cor tem o próprio evento (gravado direto no banco descartável, com tipo à venda, menores
 * permitidos e cronômetro), para os testes rodarem em paralelo. Os estilos conferidos são os calculados pelo navegador.
 */
const R = JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'state.json'), 'utf8')) as { base: string; url: string };
const IMG = path.join(TEXTOS_DIR, '..', 'cor-destaque', 'img');
const PURPLE = 'rgb(124, 58, 237)';
let db: pg.Client;
test.beforeAll(async () => {
  db = new pg.Client({ connectionString: R.url });
  await db.connect();
  mkdirSync(IMG, { recursive: true });
});
test.afterAll(async () => {
  await db?.end();
});

/** Evento publicado daqui a 3 dias, com um tipo à venda, menores permitidos e a cor pedida (nula: o padrão). */
async function event(slug: string, accent: string | null): Promise<string> {
  const { rows } = await db.query(
    `insert into events (slug, name, starts_at, ends_at, venue, address, description, age_rating, status, allows_minors, accent_color)
     values ($1, 'Festa de Primavera', now() + interval '3 days 4 hours', now() + interval '3 days 10 hours', 'Clube Comercial',
             'Rua do Acampamento, 500, Santa Maria/RS', 'Evento de teste, dados fictícios.', '16 anos', 'publicado', true, $2)
     on conflict (slug) do update set accent_color = excluded.accent_color
     returning id`,
    [slug, accent],
  );
  const id = rows[0].id as string;
  const has = await db.query('select 1 from ticket_types where event_id = $1', [id]);
  if (!has.rowCount)
    await db.query(
      `insert into ticket_types (event_id, name, price_cents, quantity_total, sales_start_at, sales_end_at)
       values ($1, 'Pista', 8000, 200, now() - interval '1 day', now() + interval '2 days')`,
      [id],
    );
  return id;
}

async function context(browser: Browser, width: number, admin = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => sessionStorage.setItem('partyx_intro_seen', '1'));
  if (admin) {
    const page = await ctx.newPage();
    await page.goto(`${R.base}/entrar`, { waitUntil: 'networkidle' });
    await page.fill('#email', 'admin@partyx.test');
    await page.fill('#senha', 'festa2026');
    await page.click('button[type=submit]');
    await page.waitForURL(u => !u.pathname.startsWith('/entrar'));
    await page.close();
  }
  return ctx;
}

const css = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

const hexToRgb = (hex: string) =>
  `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

interface Expected {
  fill: string;
  onFill: string;
  line: string;
  link: string;
  focus: string;
  edge?: string;
}
const COLORS: { name: string; slug: string; accent: string | null; want: Expected }[] = [
  {
    name: 'padrão',
    slug: 'cor-padrao',
    accent: null,
    want: { fill: '#7C3AED', onFill: '#FFFFFF', line: '#7C3AED', link: '#C4B5FD', focus: '#8B5CF6' },
  },
  {
    name: 'verde',
    slug: 'cor-verde',
    accent: '#15803D',
    want: { fill: '#15803D', onFill: '#FFFFFF', line: '#15803D', link: '#178D43', focus: '#15803D' },
  },
  {
    name: 'amarelo',
    slug: 'cor-amarelo',
    accent: '#FACC15',
    want: { fill: '#FACC15', onFill: '#0B0B10', line: '#FACC15', link: '#FACC15', focus: '#B49104', edge: '#B49104' },
  },
  {
    name: 'vermelho',
    slug: 'cor-vermelho',
    accent: '#DC2626',
    want: { fill: '#DC2626', onFill: '#FFFFFF', line: '#DC2626', link: '#E03C3C', focus: '#DC2626' },
  },
];

for (const c of COLORS) {
  test(`página do evento com ${c.name}: destaque na página, roxo da PartyX no cabeçalho, capturas a 360 e 1280 px`, async ({
    browser,
  }) => {
    await event(c.slug, c.accent);
    for (const width of [360, 1280]) {
      const ctx = await context(browser, width, true);
      const page = await ctx.newPage();
      await page.goto(`${R.base}/eventos/${c.slug}`, { waitUntil: 'networkidle' });
      await expect(page.locator('.px-event-name')).toHaveText('Festa de Primavera');

      // Escopo: atributo só com cor própria; as variáveis vêm calculadas (hexadecimal), não o texto gravado.
      const scope = page.locator('.px-event-scope');
      if (c.accent) await expect(scope).toHaveAttribute('data-accent', c.accent);
      else await expect(scope).not.toHaveAttribute('data-accent', /.*/);

      expect(await css(page, '.px-event-head .px-stub', 'background-color')).toBe(hexToRgb(c.want.fill));
      expect(await css(page, '.px-event-head .px-stub', 'color')).toBe(hexToRgb(c.want.onFill));
      expect(await css(page, '.px-cd-block', 'background-color')).toBe(hexToRgb(c.want.fill));
      expect(await css(page, '.px-cd-block', 'color')).toBe(hexToRgb(c.want.onFill));
      expect(await css(page, '.px-facts > div', 'border-left-color')).toBe(hexToRgb(c.want.line));
      expect(await css(page, '.px-event-minor', 'border-left-color')).toBe(hexToRgb(c.want.line));
      expect(await css(page, '.px-event-minor a', 'color')).toBe(hexToRgb(c.want.link));
      const cont = '.px-event-side .px-continue';
      expect(await css(page, cont, 'background-color')).toBe(hexToRgb(c.want.fill));
      expect(await css(page, cont, 'color')).toBe(hexToRgb(c.want.onFill));
      expect(await css(page, cont, 'border-top-color')).toBe(hexToRgb(c.want.edge ?? c.want.fill));

      // Desabilitado (nada escolhido): esmaece e, com cor própria, perde a cor.
      await expect(page.locator(cont)).toBeDisabled();
      expect(await css(page, cont, 'opacity')).toBe('0.45');
      expect(await css(page, cont, 'filter')).toBe(c.accent ? 'saturate(0.15)' : 'none');

      // Cabeçalho e rodapé com as cores da PartyX: o botão "Painel" continua roxo.
      expect(await css(page, '.px-header .px-enter-pri', 'background-color')).toBe(PURPLE);

      // Foco de teclado nos controles da página: anel na cor de foco calculada.
      const plus = page.getByRole('button', { name: 'Mais um Pista' });
      await plus.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(plus).toBeFocused();
      expect(await plus.evaluate(el => getComputedStyle(el).outlineColor)).toBe(hexToRgb(c.want.focus));

      // Com um ingresso escolhido, "Continuar" fica ativo, sem filtro, com a mesma cor.
      await plus.click();
      await expect(page.locator(cont)).toBeEnabled();
      expect(await css(page, cont, 'filter')).toBe('none');
      expect(await css(page, cont, 'opacity')).toBe('1');

      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.mouse.move(0, 0);
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      if (width >= 960) await page.screenshot({ path: path.join(IMG, `pagina-${c.slug}-${width}.png`), fullPage: true });
      else {
        // No celular a barra de compra é fixa: a captura da página inteira a deixaria no meio. Duas telas reais: o topo e o
        // quadro de ingressos logo abaixo do cabeçalho.
        await page.screenshot({ path: path.join(IMG, `pagina-${c.slug}-${width}-topo.png`) });
        await page.evaluate(() => {
          const side = document.querySelector('.px-event-side')!;
          window.scrollTo(0, side.getBoundingClientRect().top + window.scrollY - 80);
        });
        await page.screenshot({ path: path.join(IMG, `pagina-${c.slug}-${width}-compra.png`) });
      }
      await ctx.close();
    }
  });
}

test('vitrine: só o bloco da data do card leva a cor; o resto do card e o cabeçalho ficam com o roxo', async ({ browser }) => {
  await event('cor-card-verde', '#15803D');
  await event('cor-card-padrao', null);
  await db.query("update events set name = 'Festa Verde no Card' where slug = 'cor-card-verde'");
  await db.query("update events set name = 'Festa Roxa no Card' where slug = 'cor-card-padrao'");
  const ctx = await context(browser, 1280);
  const page = await ctx.newPage();
  await page.goto(`${R.base}/eventos`, { waitUntil: 'networkidle' });
  const card = page.locator('.px-card').filter({ hasText: 'Festa Verde no Card' });
  await expect(card).toBeVisible();
  expect(await card.locator('.px-stub').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(21, 128, 61)');
  expect(await card.locator('.px-stub').evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
  // Card de evento sem cor: o roxo.
  const other = page.locator('.px-card').filter({ hasText: 'Festa Roxa no Card' });
  expect(await other.locator('.px-stub').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(PURPLE);
  await card.screenshot({ path: path.join(IMG, 'vitrine-card-verde.png') });
  await ctx.close();
});

test('painel: seletor, hexadecimal, prévia, aviso de contraste, voltar ao padrão e erro de formato', async ({ browser }) => {
  const id = await event('cor-painel', null);
  for (const width of [360, 1280]) {
    const ctx = await context(browser, width, true);
    const page = await ctx.newPage();
    await page.goto(`${R.base}/admin/eventos/${id}/editar`, { waitUntil: 'networkidle' });
    const field = page.locator('.px-accent-edit');
    await expect(field.locator('legend')).toHaveText('Cor de destaque');
    const preview = field.locator('.px-accent-preview .px-stub');
    expect(await preview.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(PURPLE);
    await expect(page.getByRole('button', { name: 'Voltar ao padrão' })).toBeDisabled();
    // Sem capa salva: a sugestão fica desabilitada, com a orientação.
    await expect(page.getByRole('button', { name: 'Sugerir pela imagem de capa' })).toBeDisabled();
    await expect(field).toContainText('salve o evento com uma imagem de capa');

    // Amarelo pelo seletor do sistema: texto escuro, borda no botão, avisos dos tons.
    await field.locator('input[type=color]').fill('#facc15');
    await expect(page.locator('#ev-accentColor')).toHaveValue('#FACC15');
    expect(await preview.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(250, 204, 21)');
    expect(await preview.evaluate(el => getComputedStyle(el).color)).toBe('rgb(11, 11, 16)');
    await expect(field).toContainText('Texto preto sobre a cor');
    await expect(field).toContainText('borda mais escura');
    await field.screenshot({ path: path.join(IMG, `painel-amarelo-${width}.png`) });

    // Cinza da faixa sem contraste: aviso e o botão que troca pelo tom ajustado.
    await page.fill('#ev-accentColor', '#787878');
    await expect(field.locator('.px-notice-warn')).toContainText('Contraste insuficiente');
    await field.getByRole('button', { name: /^Usar #[0-9A-F]{6} no campo$/ }).click();
    await expect(page.locator('#ev-accentColor')).not.toHaveValue('#787878');
    await expect(field.locator('.px-notice-warn')).toHaveCount(0);

    // Verde digitado sem # e em minúsculas: normaliza ao sair do campo.
    await page.fill('#ev-accentColor', '15803d');
    await page.locator('#ev-accentColor').blur();
    await expect(page.locator('#ev-accentColor')).toHaveValue('#15803D');
    expect(await preview.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(21, 128, 61)');
    await field.screenshot({ path: path.join(IMG, `painel-verde-${width}.png`) });

    await page.getByRole('button', { name: 'Voltar ao padrão' }).click();
    await expect(page.locator('#ev-accentColor')).toHaveValue('');
    expect(await preview.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(PURPLE);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await ctx.close();
  }

  // Formato errado não é enviado; a cor válida é salva e chega à página pública.
  const ctx = await context(browser, 1280, true);
  const page = await ctx.newPage();
  await page.goto(`${R.base}/admin/eventos/${id}/editar`, { waitUntil: 'networkidle' });
  await page.fill('#ev-accentColor', 'vermelho');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('#ev-accentColor-erro')).toHaveText('Use uma cor no formato #RRGGBB (por exemplo, #7C3AED).');
  await expect(page.locator('#ev-accentColor')).toBeFocused();
  await page.fill('#ev-accentColor', '#DC2626');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('.px-toast, [role=status]').filter({ hasText: 'Alterações salvas.' }).first()).toBeVisible();
  expect((await db.query('select accent_color from events where id = $1', [id])).rows[0].accent_color).toBe('#DC2626');
  await page.goto(`${R.base}/eventos/cor-painel`, { waitUntil: 'networkidle' });
  expect(await css(page, '.px-event-head .px-stub', 'background-color')).toBe('rgb(220, 38, 38)');
  await ctx.close();
});
