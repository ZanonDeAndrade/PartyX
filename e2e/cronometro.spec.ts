import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Cronômetro da página do evento (15/10/2026). Os eventos são gravados direto no banco descartável, com início e fim relativos ao
 * `now()` do banco (mesma máquina do servidor); a contagem mostrada é comparada com o que falta pelo banco, com folga de 2 s.
 */
const R = JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'state.json'), 'utf8')) as { base: string; url: string };
const IMG = path.join(TEXTOS_DIR, '..', 'cronometro', 'img');
let db: pg.Client;
test.beforeAll(async () => {
  db = new pg.Client({ connectionString: R.url });
  await db.connect();
  mkdirSync(IMG, { recursive: true });
});
test.afterAll(async () => {
  await db?.end();
});

interface EventSetup {
  startsIn: string; // intervalo do PostgreSQL a partir de now(): '3 days 4 hours', '-1 hour'
  endsIn?: string | null;
  status?: 'publicado' | 'encerrado';
  enabled?: boolean;
  phrase?: string | null;
  name?: string;
}
/** Evento publicado (ou encerrado), criado ou regravado pelo endereço. Devolve o id. */
async function event(slug: string, o: EventSetup): Promise<string> {
  const { rows } = await db.query(
    `insert into events (slug, name, starts_at, ends_at, venue, address, description, age_rating, status, closed_at,
                         countdown_enabled, countdown_phrase)
     values ($1, $2, now() + $3::interval, case when $4::text is null then null else now() + $4::interval end, 'Clube Comercial',
             'Rua do Acampamento, 500', 'Evento de teste, dados fictícios.', '18 anos', $5::event_status,
             case when $5::text = 'encerrado' then now() end,
             $6, $7)
     on conflict (slug) do update set name = excluded.name, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
       status = excluded.status, closed_at = excluded.closed_at, countdown_enabled = excluded.countdown_enabled,
       countdown_phrase = excluded.countdown_phrase
     returning id`,
    [slug, o.name ?? 'Baile Teen de Verão', o.startsIn, o.endsIn ?? null, o.status ?? 'publicado', o.enabled ?? true, o.phrase ?? null],
  );
  return rows[0].id as string;
}
const remainingByDb = async (slug: string) =>
  (await db.query('select extract(epoch from starts_at - now())::float8 as s from events where slug = $1', [slug])).rows[0]
    .s as number;

async function open(
  browser: Browser,
  slug: string,
  o: { width?: number; offsetMs?: number; motion?: 'reduce' | 'no-preference' } = {},
): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: o.width ?? 360, height: 800 },
    reducedMotion: o.motion ?? 'reduce',
  });
  // A abertura em vídeo só toca na primeira página da sessão: aqui, já vista.
  await ctx.addInitScript(() => sessionStorage.setItem('partyx_intro_seen', '1'));
  if (o.offsetMs)
    // Relógio do aparelho errado: Date (e Date.now) adiantado ou atrasado, desde antes de a página carregar.
    await ctx.addInitScript(offset => {
      const Real = Date;
      class Shifted extends Real {
        constructor(...args: ConstructorParameters<typeof Date>) {
          if (args.length) super(...args);
          else super(Real.now() + offset);
        }
        static now() {
          return Real.now() + offset;
        }
      }
      globalThis.Date = Shifted as DateConstructor;
    }, o.offsetMs);
  const page = await ctx.newPage();
  await page.goto(`${R.base}/eventos/${slug}`, { waitUntil: 'networkidle' });
  return page;
}
/** O que o cronômetro mostra, em segundos. */
async function shownSeconds(page: Page) {
  const [d, h, m, s] = (await page.locator('.px-cd-num').allTextContents()).map(Number);
  return ((d! * 24 + h!) * 60 + m!) * 60 + s!;
}

test('antes do início: frase padrão acima do nome e quatro blocos numa linha a 360 px, com a contagem do servidor', async ({
  browser,
}) => {
  await event('cronometro-antes', { startsIn: '3 days 14 hours 27 minutes 40 seconds', endsIn: '3 days 20 hours' });
  const page = await open(browser, 'cronometro-antes');
  await expect(page.locator('[data-countdown="antes"]')).toBeVisible();
  await expect(page.locator('.px-event-kicker')).toHaveText('Falta pouco para');
  await expect(page.locator('.px-cd-label')).toHaveText(['Dias', 'Horas', 'Min', 'Seg']);
  const nums = await page.locator('.px-cd-num').allTextContents();
  expect(nums.every(n => /^\d{2,}$/.test(n))).toBe(true);
  expect(Math.abs((await shownSeconds(page)) - (await remainingByDb('cronometro-antes')))).toBeLessThanOrEqual(2);
  const layout = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    tops: [...document.querySelectorAll('.px-cd-block')].map(b => Math.round(b.getBoundingClientRect().top)),
  }));
  expect(layout.scroll).toBe(0);
  expect(new Set(layout.tops).size).toBe(1);
  // Leitor de tela: o cronômetro é um timer (não fala sozinho), os blocos ficam escondidos e o texto vai até os minutos.
  await expect(page.locator('[role="timer"] .px-sr')).toHaveText(/^Faltam 3 dias, 14 horas e 2\d minutos\.$/);
  expect(await page.locator('.px-cd-block[aria-hidden="true"]').count()).toBe(4);
  await expect(page.locator('[data-countdown-aviso]')).toHaveText('');
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: path.join(IMG, `antes-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  }
});

test('relógio do aparelho adiantado ou atrasado: a contagem continua a do servidor', async ({ browser }) => {
  await event('cronometro-relogio', { startsIn: '2 days 5 hours 10 minutes', endsIn: '2 days 9 hours' });
  for (const offsetMs of [7 * 3_600_000, -7 * 3_600_000, 3 * 86_400_000, -45 * 60_000]) {
    const page = await open(browser, 'cronometro-relogio', { offsetMs });
    const wrong = await page.evaluate(() => Date.now());
    expect(Math.abs(wrong - Date.now() - offsetMs)).toBeLessThan(5_000); // o aparelho está mesmo errado
    expect(Math.abs((await shownSeconds(page)) - (await remainingByDb('cronometro-relogio'))), `${offsetMs}`).toBeLessThanOrEqual(2);
    await page.context().close();
  }
});

test('vira no zero sozinho, sem recarregar a página, e só essa troca é anunciada', async ({ browser }) => {
  await event('cronometro-zero', { startsIn: '7 seconds', endsIn: '1 hour' });
  const page = await open(browser, 'cronometro-zero');
  await expect(page.locator('[data-countdown="antes"]')).toBeVisible();
  await page.evaluate(() => ((window as unknown as { semRecarregar: boolean }).semRecarregar = true));
  await expect(page.locator('[data-countdown="agora"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.px-live')).toHaveText('Acontecendo agora');
  await expect(page.locator('.px-event-kicker')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { semRecarregar?: boolean }).semRecarregar)).toBe(true);
  await expect(page.locator('[data-countdown-aviso]')).toHaveText('O evento começou: acontecendo agora.');
  await page.screenshot({ path: path.join(IMG, 'agora-360.png') });
});

test('durante: "Acontecendo agora"; depois do fim, sem fim depois de 8 h e encerrado: o cronômetro some', async ({ browser }) => {
  const cases: [string, EventSetup, 'agora' | null][] = [
    ['cronometro-durante', { startsIn: '-1 hour', endsIn: '1 hour' }, 'agora'],
    ['cronometro-sem-fim', { startsIn: '-1 hour', endsIn: null }, 'agora'],
    ['cronometro-depois', { startsIn: '-3 hours', endsIn: '-1 hour' }, null],
    ['cronometro-sem-fim-depois', { startsIn: '-9 hours', endsIn: null }, null],
    ['cronometro-encerrado', { startsIn: '2 days', endsIn: '2 days 5 hours', status: 'encerrado' }, null],
  ];
  for (const [slug, setup, expected] of cases) {
    await event(slug, setup);
    const page = await open(browser, slug);
    await expect(page.locator('.px-event-name')).toBeVisible();
    if (expected) await expect(page.locator(`[data-countdown="${expected}"]`), slug).toBeVisible();
    else await expect(page.locator('[data-countdown]'), slug).toHaveCount(0);
    await expect(page.locator('.px-event-kicker'), slug).toHaveCount(0);
    await page.context().close();
  }
});

test('para com a aba escondida e volta na hora certa ao reaparecer', async ({ browser }) => {
  await event('cronometro-aba', { startsIn: '1 day 2 hours', endsIn: '1 day 6 hours' });
  const page = await open(browser, 'cronometro-aba');
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate(s => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await setVisibility('hidden');
  const frozen = await shownSeconds(page);
  await page.waitForTimeout(3_000);
  expect(await shownSeconds(page)).toBe(frozen); // parado: nenhum segundo andou com a aba escondida
  await setVisibility('visible');
  await expect.poll(() => shownSeconds(page)).toBeLessThanOrEqual(frozen - 3);
  expect(Math.abs((await shownSeconds(page)) - (await remainingByDb('cronometro-aba')))).toBeLessThanOrEqual(2);
});

test('movimento: os números nunca animam; o ponto de "acontecendo agora" só pulsa sem pedido de menos movimento', async ({
  browser,
}) => {
  await event('cronometro-movimento', { startsIn: '-30 minutes', endsIn: '2 hours' });
  await event('cronometro-numeros', { startsIn: '5 hours', endsIn: '9 hours' });
  const still = await open(browser, 'cronometro-movimento', { motion: 'reduce' });
  expect(await still.locator('.px-live-dot').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  const moving = await open(browser, 'cronometro-movimento', { motion: 'no-preference' });
  expect(await moving.locator('.px-live-dot').evaluate(el => getComputedStyle(el).animationName)).toBe('pxlive');
  const numbers = await open(browser, 'cronometro-numeros', { motion: 'no-preference' });
  const style = await numbers.locator('.px-cd-num').first().evaluate(el => {
    const s = getComputedStyle(el);
    return { animation: s.animationName, transition: s.transitionDuration };
  });
  expect(style).toEqual({ animation: 'none', transition: '0s' });
});

test('pelo painel: frase personalizada aparece na página, e "Mostrar cronômetro" desmarcado tira o cronômetro', async ({
  browser,
}) => {
  const id = await event('cronometro-painel', { startsIn: '4 days', endsIn: '4 days 6 hours', name: 'Festa do Painel' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const admin = await ctx.newPage();
  await admin.goto(`${R.base}/entrar`, { waitUntil: 'networkidle' });
  await admin.fill('#email', 'admin@partyx.test');
  await admin.fill('#senha', 'festa2026');
  await admin.click('button[type=submit]');
  await admin.waitForURL(u => !u.pathname.startsWith('/entrar'));

  const edit = async (change: () => Promise<void>) => {
    await admin.goto(`${R.base}/admin/eventos/${id}/editar`, { waitUntil: 'networkidle' });
    await change();
    await admin.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(admin.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled();
    await admin.waitForTimeout(500);
  };
  await edit(async () => {
    await expect(admin.locator('#ev-countdownEnabled')).toBeChecked();
    await expect(admin.locator('#ev-countdownPhrase')).toHaveAttribute('placeholder', 'Falta pouco para');
    await admin.fill('#ev-countdownPhrase', 'Contagem para a festa');
  });
  const custom = await open(browser, 'cronometro-painel');
  await expect(custom.locator('.px-event-kicker')).toHaveText('Contagem para a festa');
  await custom.screenshot({ path: path.join(IMG, 'frase-360.png') });
  await custom.context().close();

  await edit(async () => {
    await admin.locator('#ev-countdownEnabled').uncheck();
    await expect(admin.locator('#ev-countdownPhrase')).toBeDisabled();
  });
  const off = await open(browser, 'cronometro-painel');
  await expect(off.locator('.px-event-name')).toBeVisible();
  await expect(off.locator('[data-countdown]')).toHaveCount(0);
  await expect(off.locator('.px-event-kicker')).toHaveCount(0);
  const row = await db.query('select countdown_enabled, countdown_phrase from events where id = $1', [id]);
  expect(row.rows[0]).toEqual({ countdown_enabled: false, countdown_phrase: 'Contagem para a festa' });
});
