import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { argon2Hasher } from '../server/src/providers/passwordHasher';
import { TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Evento privado com lista de autorizados (D-92) no navegador, a 360, 390 e 1280 px. O administrador liga a chave na edição do evento,
 * cadastra uma pessoa e cola uma lista na aba Acesso (CPF mascarado); quem não está logado vê "Entrar para solicitar acesso", entra e
 * volta para o evento; logado, solicita com um toque e vê "Solicitação enviada"; a página Solicitações aprova e a compra libera; a
 * recusa mostra "Solicitação não aprovada". Dados fictícios.
 */
const R = JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'state.json'), 'utf8')) as { base: string; url: string };
const IMG = path.join(TEXTOS_DIR, '..', 'acesso', 'img');
let db: pg.Pool;
let hash = '';
test.beforeAll(async () => {
  db = new pg.Pool({ connectionString: R.url, max: 2 });
  hash = await argon2Hasher.hash('festa2026');
  mkdirSync(IMG, { recursive: true });
});
test.afterAll(async () => {
  await db?.end();
});
const q = (text: string, params: unknown[] = []) => db.query(text, params);
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

function cpfFrom(seed: number): string {
  const base = String(500000000 + seed).slice(-9);
  const digit = (s: string) => {
    const sum = [...s].reduce((t, d, i) => t + Number(d) * (s.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = digit(base);
  return base + d1 + digit(base + d1);
}

async function buyer(name = 'Bruna Teixeira') {
  const i = Math.floor(Math.random() * 1e6);
  const email = `privado.${i}@partyx.test`;
  const cpf = cpfFrom(i);
  await q(
    "insert into users (name,email,cpf,password_hash,role,birth_date) values ($1,$2,$3,$4,'cliente','1994-03-08')",
    [name, email, cpf, hash],
  );
  return { email, cpf };
}

/** Evento publicado a 40 dias, com "Pista" de R$ 30,00 à venda. */
async function event(isPrivate: boolean, name = 'Festa Fechada') {
  const slug = `festa-fechada-${uniq()}`;
  const id = (
    await q(
      `insert into events (slug,name,starts_at,venue,address,description,age_rating,status,is_private)
       values ($1,$2,now() + interval '40 days','Clube Comercial','Rua do Acampamento, 500','Evento de teste, dados fictícios.','18 anos','publicado',$3)
       returning id`,
      [slug, name, isPrivate],
    )
  ).rows[0].id as string;
  await q(
    `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at)
     values ($1,'Pista',3000,200,now() - interval '1 day',now() + interval '30 days')`,
    [id],
  );
  return { id, slug };
}

async function context(browser: Browser, width: number) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
    ...(width < 600 ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}),
  });
  await ctx.addInitScript(() => {
    (window as unknown as { __partyxSemAbertura?: boolean }).__partyxSemAbertura = true;
  });
  return ctx;
}
async function login(page: Page, email: string) {
  await page.fill('#email', email);
  await page.fill('#senha', 'festa2026');
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.startsWith('/entrar'));
}
async function session(browser: Browser, width: number, email: string) {
  const ctx = await context(browser, width);
  const page = await ctx.newPage();
  await page.goto(`${R.base}/entrar`, { waitUntil: 'networkidle' });
  await login(page, email);
  return { ctx, page };
}
const noSideScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
const side = (page: Page) => page.locator('.px-event-side');
/** Captura da página inteira, do topo, depois das animações de entrada (as infinitas, como a do cronômetro, não contam). */
async function shot(page: Page, name: string, width: number) {
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await Promise.all(
      document
        .getAnimations()
        .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => undefined)),
    );
  });
  await page.screenshot({ path: path.join(IMG, `${name}-${width}.png`), fullPage: true });
}

for (const width of [360, 390, 1280]) {
  test(`painel a ${width} px: chave "Evento privado", aba Acesso com pessoa, lista colada e CPF mascarado`, async ({
    browser,
  }) => {
    const ev = await event(false, 'Festa do Painel');
    const cpf = cpfFrom(Math.floor(Math.random() * 1e6));
    const a = await session(browser, width, 'admin@partyx.test');
    await a.page.goto(`${R.base}/admin/eventos/${ev.id}/editar`, { waitUntil: 'networkidle' });
    const sw = a.page.getByRole('switch', { name: 'Evento privado' });
    await expect(sw).not.toBeChecked();
    await sw.check();
    await a.page.getByRole('switch', { name: 'Evento privado' }).scrollIntoViewIfNeeded();
    await a.page
      .locator('fieldset', { hasText: 'Quem pode comprar' })
      .screenshot({ path: path.join(IMG, `painel-chave-${width}.png`) });
    await a.page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(a.page.getByText('Alterações salvas.')).toBeVisible();
    expect((await q('select is_private from events where id = $1', [ev.id])).rows[0].is_private).toBe(true);

    await a.page.goto(`${R.base}/admin/eventos/${ev.id}?aba=acesso`, { waitUntil: 'networkidle' });
    await expect(a.page.getByText('Evento privado.', { exact: false })).toBeVisible();
    await a.page.locator('#acesso-cpf').fill(cpf);
    await a.page.locator('#acesso-nome').fill('Carla Nunes');
    await a.page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await expect(a.page.getByText('Pessoa autorizada.')).toBeVisible();
    await a.page.getByText('Colar uma lista').click();
    await a.page
      .locator('#acesso-lista')
      .fill(['Diego Alves; diego@partyx.test', 'eva@partyx.test', 'sem contato nenhum'].join('\n'));
    await a.page.getByRole('button', { name: 'Importar' }).click();
    await expect(a.page.getByText('2 adicionadas')).toBeVisible();
    await expect(a.page.getByText('Linha 3:', { exact: false })).toBeVisible();
    const table = a.page.locator('.px-access-table');
    await expect(table).toContainText('Carla Nunes');
    await expect(table).toContainText(`***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`);
    await expect(table).not.toContainText(cpf);
    await expect(table).toContainText('Cadastrada pelo painel');
    await noSideScroll(a.page);
    await shot(a.page, 'painel-acesso', width);

    await a.page.locator('#acesso-q').fill('diego');
    await a.page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await a.ctx.close();
  });

  test(`página do evento a ${width} px: entrar, solicitar, enviada, aprovada pelo painel e compra liberada`, async ({
    browser,
  }) => {
    const ev = await event(true);
    const person = await buyer();
    const ctx = await context(browser, width);
    const page = await ctx.newPage();

    // Vitrine e busca: o selo aparece; o cartão leva a "Ver evento".
    await page.goto(`${R.base}/eventos?q=${encodeURIComponent('Festa Fechada')}`, { waitUntil: 'networkidle' });
    const card = page.locator('li.px-card', { has: page.locator(`a[href="/eventos/${ev.slug}"]`) });
    await expect(card).toContainText('Evento privado');
    await expect(card).toContainText('Ver evento');
    await card.screenshot({ path: path.join(IMG, `vitrine-selo-${width}.png`) });

    // Sem login.
    await page.goto(`${R.base}/eventos/${ev.slug}`, { waitUntil: 'networkidle' });
    await expect(page.locator('.px-event-private')).toContainText('Evento privado');
    await expect(side(page)).toContainText('Pista');
    await expect(side(page).getByRole('group', { name: /Quantidade/ })).toHaveCount(0);
    // O botão aparece no painel lateral e, no celular, também na barra fixa: o primeiro é o do painel.
    const enter = side(page).getByRole('link', { name: 'Entrar para solicitar acesso' }).first();
    await expect(enter).toBeVisible();
    await noSideScroll(page);
    await shot(page, 'evento-sem-login', width);
    await enter.click();
    await page.waitForURL(u => u.pathname === '/entrar');
    expect(new URL(page.url()).searchParams.get('voltar')).toBe(`/eventos/${ev.slug}`);
    await login(page, person.email);
    await page.waitForURL(u => u.pathname === `/eventos/${ev.slug}`);

    // Logado, fora da lista: um toque.
    const ask = side(page).getByRole('button', { name: 'Solicitar acesso a este evento' }).first();
    await expect(ask).toBeVisible();
    await shot(page, 'evento-solicitar', width);
    await ask.click();
    await expect(side(page)).toContainText('Solicitação enviada.');
    await expect(side(page)).toContainText('Você recebe um e-mail quando for aprovada.');
    await noSideScroll(page);
    await shot(page, 'evento-enviada', width);
    const row = (
      await q(
        'select a.status::text as status, a.origin::text as origin from event_access a join events e on e.id = a.event_id where e.slug = $1',
        [ev.slug],
      )
    ).rows[0];
    expect(row).toEqual({ status: 'pendente', origin: 'solicitacao' });

    // Painel: menu com contador, página Solicitações, aprovar.
    const a = await session(browser, width, 'admin@partyx.test');
    await a.page.goto(`${R.base}/admin/solicitacoes`, { waitUntil: 'networkidle' });
    const reqRow = a.page
      .locator('.px-access-table tbody tr', { hasText: 'Bruna Teixeira' })
      .filter({ hasText: 'Festa Fechada' })
      .first();
    await expect(reqRow).toBeVisible();
    await expect(reqRow).toContainText(`***.${person.cpf.slice(3, 6)}.${person.cpf.slice(6, 9)}-**`);
    await noSideScroll(a.page);
    await shot(a.page, 'painel-solicitacoes', width);
    await reqRow.getByRole('button', { name: 'Aprovar' }).click();
    await expect(a.page.getByText('Pessoa autorizada.')).toBeVisible();
    await a.ctx.close();

    await page.reload({ waitUntil: 'networkidle' });
    await expect(side(page)).toContainText('Sua conta está autorizada para este evento privado.');
    await side(page).getByRole('button', { name: 'Mais um Pista' }).click();
    await expect(side(page).getByRole('button', { name: 'Continuar' }).first()).toBeEnabled();
    await shot(page, 'evento-autorizada', width);
    await ctx.close();
  });

  test(`página do evento a ${width} px: solicitação recusada`, async ({ browser }) => {
    const ev = await event(true, 'Festa Recusada');
    const person = await buyer('Fábio Moraes');
    const user = (await q('select id from users where email = $1', [person.email])).rows[0].id;
    await q(
      "insert into event_access (event_id,user_id,status,origin,decided_at,note) values ($1,$2,'recusada','solicitacao',now(),'Lista fechada')",
      [ev.id, user],
    );
    const s = await session(browser, width, person.email);
    await s.page.goto(`${R.base}/eventos/${ev.slug}`, { waitUntil: 'networkidle' });
    await expect(side(s.page)).toContainText('Solicitação não aprovada');
    await expect(side(s.page).getByRole('button', { name: 'Solicitar acesso a este evento' })).toHaveCount(0);
    await expect(side(s.page)).not.toContainText('Lista fechada'); // a observação é só do painel
    await noSideScroll(s.page);
    await shot(s.page, 'evento-recusada', width);
    await s.ctx.close();
  });
}
