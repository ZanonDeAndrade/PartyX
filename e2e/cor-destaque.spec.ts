import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import pg from 'pg';
import { accentPalette } from '../src/site/accent';
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

async function context(browser: Browser, width: number, admin = false, touch = false): Promise<BrowserContext> {
  // `touch`: celular com toque e tela de densidade 2 (o seletor de cor arrastado com o dedo).
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
    ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}),
  });
  await ctx.addInitScript(() => {
    (window as unknown as { __partyxSemAbertura?: boolean }).__partyxSemAbertura = true;
  });
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

/** Toque enviado pelo protocolo do Chromium (dedo de verdade: passa pelos gestos de rolagem do navegador). */
type Touch = 'touchStart' | 'touchMove' | 'touchEnd';
const FORMAT_ERROR = 'Use uma cor no formato #RRGGBB (por exemplo, #7C3AED).';
const HEX = /^#[0-9A-F]{6}$/;

/** Abre a edição do evento no painel; devolve o campo, a prévia (bloco da data) e os controles do seletor. */
async function openField(page: Page, id: string) {
  await page.goto(`${R.base}/admin/eventos/${id}/editar`, { waitUntil: 'networkidle' });
  const field = page.locator('.px-accent-edit');
  await expect(field.locator('legend')).toHaveText('Cor de destaque');
  return {
    field,
    input: page.locator('#ev-accentColor'),
    preview: field.locator('.px-accent-preview .px-stub'),
    square: page.getByRole('slider', { name: 'Saturação e brilho' }),
    hue: page.getByRole('slider', { name: 'Matiz' }),
  };
}

const bg = (l: Locator) => l.evaluate(el => getComputedStyle(el).backgroundColor);
/** Fundo que a prévia e a página usam para a cor: a própria ou, na faixa sem contraste, o tom ajustado (`accent.ts`). */
const fillOf = (hex: string) => hexToRgb(accentPalette(hex)!.fill);
/** No meio do arrasto (antes de soltar): o código é #RRGGBB e a prévia já está nessa cor. Lidos juntos, no mesmo instante. */
const liveMatch = async (page: Page) => {
  const [code, fill] = await page.evaluate(
    ([i, p]) => [(document.querySelector(i) as HTMLInputElement).value, getComputedStyle(document.querySelector(p)!).backgroundColor],
    ['#ev-accentColor', '.px-accent-edit .px-accent-preview .px-stub'] as const,
  );
  return HEX.test(code) && fill === fillOf(code);
};

/** Rola até o cartão do seletor ficar logo abaixo do cabeçalho fixo do painel (toques usam coordenadas da tela). */
const bringPicker = (page: Page) =>
  page.evaluate(() => {
    const card = document.querySelector('.px-color')!;
    window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 84);
  });

/**
 * Fotografa o campo inteiro (seletor e prévia), recortado da página toda: assim o cabeçalho fixo do painel fica no topo da página e
 * não por cima do campo. Mantém a rolagem em que estava.
 */
async function shot(page: Page, field: Locator, name: string, width: number) {
  if (width >= 960) await page.mouse.move(0, 0);
  const y = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await field.boundingBox())!;
  await page.screenshot({ path: path.join(IMG, `${name}-${width}.png`), fullPage: true, clip: box });
  await page.evaluate(top => window.scrollTo(0, top), y);
}

test('painel: seletor embutido com quadrado, barra de matiz, código, cores prontas e voltar ao padrão', async ({ browser }) => {
  const id = await event('cor-painel', null);
  for (const width of [360, 1280]) {
    const touch = width < 600;
    const ctx = await context(browser, width, true, touch);
    const page = await ctx.newPage();
    const { field, input, preview, square, hue } = await openField(page, id);

    // Sem cor própria: campo vazio, o roxo no seletor e na prévia, o roxo marcado nas cores prontas.
    await expect(input).toHaveValue('');
    expect(await bg(preview)).toBe(PURPLE);
    await expect(page.getByRole('button', { name: 'Roxo da PartyX (padrão)' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Voltar ao padrão' })).toBeDisabled();
    await expect(hue).toHaveAttribute('aria-valuetext', /^\d+ graus, roxo$/);
    await expect(square).toHaveAttribute('aria-valuetext', /^Saturação \d+%, brilho \d+%$/);
    // Sem capa salva: a sugestão fica desabilitada, com a orientação.
    await expect(page.getByRole('button', { name: 'Sugerir pela imagem de capa' })).toBeDisabled();
    await expect(field).toContainText('salve o evento com uma imagem de capa');
    await shot(page, field, 'painel-seletor-padrao', width);

    // Cor pronta: o código, a prévia e a marcação acompanham.
    await page.getByRole('button', { name: 'Rosa' }).click();
    await expect(input).toHaveValue('#FF2E93');
    expect(await bg(preview)).toBe('rgb(255, 46, 147)');
    await expect(page.getByRole('button', { name: 'Rosa' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Roxo da PartyX (padrão)' })).toHaveAttribute('aria-pressed', 'false');
    await expect(hue).toHaveAttribute('aria-valuetext', '331 graus, rosa');

    // Arrastar no quadrado: o código e a prévia mudam AO VIVO, antes de soltar; ao soltar, a cor fica.
    await bringPicker(page);
    const box = (await square.boundingBox())!;
    const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
    if (touch) {
      // Dedo de verdade (CDP): o arrasto não pode rolar a página junto.
      const cdp = await ctx.newCDPSession(page);
      const finger = (type: Touch, p?: { x: number; y: number }) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
      const scrollBefore = await page.evaluate(() => window.scrollY);
      await finger('touchStart', at(0.9, 0.1));
      for (let i = 1; i <= 8; i++) await finger('touchMove', at(0.9 - i * 0.08, 0.1 + i * 0.08));
      await expect(input).not.toHaveValue('#FF2E93');
      await expect.poll(() => liveMatch(page)).toBe(true);
      await finger('touchEnd');
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
      // Controle: o mesmo gesto fora do seletor (no rótulo "Cores prontas") rola a página, então o teste enxerga rolagem.
      const lb = (await page.locator('#ev-accent-prontas').boundingBox())!;
      await finger('touchStart', { x: lb.x + 10, y: lb.y + 8 });
      for (let i = 1; i <= 8; i++) await finger('touchMove', { x: lb.x + 10, y: lb.y + 8 - i * 30 });
      await finger('touchEnd');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore);
      await bringPicker(page);
    } else {
      await page.mouse.move(at(0.9, 0.1).x, at(0.9, 0.1).y);
      await page.mouse.down();
      await page.mouse.move(at(0.25, 0.35).x, at(0.25, 0.35).y, { steps: 6 });
      await expect(input).not.toHaveValue('#FF2E93');
      await expect.poll(() => liveMatch(page)).toBe(true);
      const mid = await input.inputValue();
      await page.mouse.move(at(0.6, 0.5).x, at(0.6, 0.5).y, { steps: 4 });
      await expect(input).not.toHaveValue(mid);
      await page.mouse.up();
    }
    const dragged = await input.inputValue();
    expect(dragged).toMatch(HEX);
    expect(await bg(preview)).toBe(fillOf(dragged));
    await expect(page.getByRole('button', { name: 'Rosa' })).toHaveAttribute('aria-pressed', 'false');

    // Arrastar (ou tocar) na barra de matiz, a um terço: verde.
    await bringPicker(page);
    const hb = (await hue.boundingBox())!;
    if (touch) await page.touchscreen.tap(hb.x + hb.width / 3, hb.y + hb.height / 2);
    else await page.mouse.click(hb.x + hb.width / 3, hb.y + hb.height / 2);
    await expect(hue).toHaveAttribute('aria-valuetext', /^1[12]\d graus, verde$/);
    const green = await input.inputValue();
    const [r, g, b] = [1, 3, 5].map(i => parseInt(green.slice(i, i + 2), 16)) as [number, number, number];
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    await shot(page, field, 'painel-seletor-arrastado', width);

    // Teclado: setas movem o seletor (5% no quadrado, 18 graus na barra); a cor vai para o campo ao soltar a tecla.
    await square.focus();
    const sat = Number(/Saturação (\d+)%/.exec((await square.getAttribute('aria-valuetext'))!)![1]);
    const before = await input.inputValue();
    await page.keyboard.press('ArrowLeft');
    await expect(square).toHaveAttribute('aria-valuetext', new RegExp(`^Saturação ${Math.max(0, sat - 5)}%`));
    await expect(input).not.toHaveValue(before);
    await hue.focus();
    const deg = Number(await hue.getAttribute('aria-valuenow'));
    await page.keyboard.press('ArrowRight');
    await expect(hue).toHaveAttribute('aria-valuenow', String(Math.min(360, deg + 18)));

    // Código digitado sem # e em minúsculas: o seletor acompanha enquanto digita; ao sair, fica #RRGGBB maiúsculo.
    await input.fill('3b5bff');
    await expect(hue).toHaveAttribute('aria-valuetext', '230 graus, azul');
    expect(await bg(preview)).toBe('rgb(59, 91, 255)');
    await expect(page.getByRole('button', { name: 'Azul' })).toHaveAttribute('aria-pressed', 'true');
    await input.blur();
    await expect(input).toHaveValue('#3B5BFF');

    // Só incompleto: nenhum erro, nem ao sair do campo (o erro espera o "Salvar").
    await input.fill('#3B5');
    await input.blur();
    await expect(page.locator('#ev-accentColor-erro')).toHaveCount(0);
    // Código que não tem como ser uma cor: erro já enquanto digita; o seletor e a prévia ficam na última cor válida.
    await input.fill('#12G');
    await expect(page.locator('#ev-accentColor-erro')).toHaveText(FORMAT_ERROR);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(hue).toHaveAttribute('aria-valuetext', '230 graus, azul');
    expect(await bg(preview)).toBe('rgb(59, 91, 255)');
    await shot(page, field, 'painel-seletor-invalido', width);
    await input.fill('#FF6B00');
    await expect(page.locator('#ev-accentColor-erro')).toHaveCount(0);

    // Cinza da faixa sem contraste: o aviso continua valendo, com o botão que troca pelo tom ajustado.
    await input.fill('#787878');
    await expect(field.locator('.px-notice-warn')).toContainText('Contraste insuficiente');
    await field.getByRole('button', { name: /^Usar #[0-9A-F]{6} no campo$/ }).click();
    await expect(input).not.toHaveValue('#787878');
    await expect(field.locator('.px-notice-warn')).toHaveCount(0);

    // Voltar ao padrão: campo vazio, roxo no seletor, na prévia e nas cores prontas.
    await page.getByRole('button', { name: 'Voltar ao padrão' }).click();
    await expect(input).toHaveValue('');
    expect(await bg(preview)).toBe(PURPLE);
    await expect(hue).toHaveAttribute('aria-valuetext', /^\d+ graus, roxo$/);
    await expect(page.getByRole('button', { name: 'Roxo da PartyX (padrão)' })).toHaveAttribute('aria-pressed', 'true');
    // A cor pronta do roxo também grava vazio.
    await page.getByRole('button', { name: 'Amarelo' }).click();
    await page.getByRole('button', { name: 'Roxo da PartyX (padrão)' }).click();
    await expect(input).toHaveValue('');

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const card = (await page.locator('.px-color').boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(width);
    await ctx.close();
  }
});

test('painel: conta-gotas só onde o navegador tem (EyeDropper)', async ({ browser }) => {
  const id = await event('cor-conta-gotas', null);
  // Sem a API (Firefox, Safari, celular): o botão não aparece.
  let ctx = await context(browser, 1280, true);
  await ctx.addInitScript(() => {
    delete (window as unknown as { EyeDropper?: unknown }).EyeDropper;
  });
  let page = await ctx.newPage();
  let { input } = await openField(page, id);
  await expect(page.getByRole('button', { name: 'Pegar uma cor da tela' })).toHaveCount(0);
  await ctx.close();

  // Com a API: o botão aparece e a cor pega da tela vai para o campo em #RRGGBB maiúsculo; cancelar (Esc) não muda nada.
  ctx = await context(browser, 1280, true);
  await ctx.addInitScript(() => {
    let calls = 0;
    (window as unknown as { EyeDropper: unknown }).EyeDropper = class {
      open() {
        calls += 1;
        return calls === 1
          ? Promise.resolve({ sRGBHex: '#00e5ff' })
          : Promise.reject(new DOMException('The user canceled the selection.', 'AbortError'));
      }
    };
  });
  page = await ctx.newPage();
  ({ input } = await openField(page, id));
  const drop = page.getByRole('button', { name: 'Pegar uma cor da tela' });
  await drop.click();
  await expect(input).toHaveValue('#00E5FF');
  await expect(page.getByRole('button', { name: 'Ciano' })).toHaveAttribute('aria-pressed', 'true');
  await drop.click();
  await page.waitForTimeout(200);
  await expect(input).toHaveValue('#00E5FF');
  await ctx.close();
});

test('painel: código inválido não salva; a cor salva em #RRGGBB maiúsculo volta ao reabrir e chega à página', async ({
  browser,
}) => {
  const id = await event('cor-salvar', null);
  for (const width of [1280, 360]) {
    const touch = width < 600;
    const ctx = await context(browser, width, true, touch);
    const page = await ctx.newPage();
    const first = await openField(page, id);
    const save = page.getByRole('button', { name: 'Salvar alterações' });
    const saved = page.locator('.px-toast, [role=status]').filter({ hasText: 'Alterações salvas.' }).first();
    const stored = async () => (await db.query('select accent_color from events where id = $1', [id])).rows[0].accent_color;

    // Formato errado: o erro já aparece ao digitar; "Salvar" não envia e volta o foco ao campo.
    const before = await stored();
    const formatError = page.locator('#ev-accentColor-erro');
    await first.input.fill('vermelho');
    await expect(formatError).toHaveText(FORMAT_ERROR);
    await save.click();
    await expect(formatError).toHaveText(FORMAT_ERROR);
    await expect(first.input).toBeFocused();
    expect(await stored()).toBe(before);
    // Só incompleto: sem erro até o "Salvar", que também não envia.
    await first.input.fill('#7C3');
    await expect(formatError).toHaveCount(0);
    await save.click();
    await expect(formatError).toHaveText(FORMAT_ERROR);
    await expect(first.input).toBeFocused();
    expect(await stored()).toBe(before);

    let chosen: string;
    if (!touch) {
      // Digitado em minúsculas, sem #: grava maiúsculo.
      await first.input.fill('ff6b00');
      chosen = '#FF6B00';
    } else {
      // No celular: cor escolhida arrastando com o dedo.
      await first.input.fill('');
      await bringPicker(page);
      const box = (await first.square.boundingBox())!;
      const cdp = await ctx.newCDPSession(page);
      const finger = (type: Touch, x?: number, y?: number) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: y! }] });
      await finger('touchStart', box.x + box.width * 0.8, box.y + box.height * 0.2);
      await finger('touchMove', box.x + box.width * 0.85, box.y + box.height * 0.15);
      await finger('touchEnd');
      await expect(first.input).toHaveValue(HEX);
      chosen = await first.input.inputValue();
    }
    await save.click();
    await expect(saved).toBeVisible();
    expect(await stored()).toBe(chosen);

    // Reabrir: o campo, o seletor e a prévia mostram a cor salva.
    const again = await openField(page, id);
    await expect(again.input).toHaveValue(chosen);
    expect(await bg(again.preview)).toBe(fillOf(chosen));
    if (!touch) {
      await expect(again.hue).toHaveAttribute('aria-valuetext', '25 graus, laranja');
      await expect(page.getByRole('button', { name: 'Laranja' })).toHaveAttribute('aria-pressed', 'true');
    }
    await shot(page, again.field, 'painel-seletor-reaberto', width);

    // Na página pública, a cor salva.
    await page.goto(`${R.base}/eventos/cor-salvar`, { waitUntil: 'networkidle' });
    expect(await css(page, '.px-event-head .px-stub', 'background-color')).toBe(fillOf(chosen));
    await ctx.close();
  }
});
