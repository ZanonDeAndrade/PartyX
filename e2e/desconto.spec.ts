import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { argon2Hasher } from '../server/src/providers/passwordHasher';
import { TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Desconto por promoter (D-91) no navegador, a 360 e 1280 px, com a taxa de serviço de 5% do banco do e2e de texto longo: o
 * administrador cria o promoter com 10% pelo formulário e vê o desconto na lista; o comprador vê a porcentagem da taxa na página do
 * evento, aplica o código no checkout e vê "Desconto (CÓDIGO)" e o total recalculado; um código de valor fixo que zeraria o pedido é
 * recusado com a mensagem combinada; a página do pedido mostra o desconto. Dados fictícios.
 */
const R = JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'state.json'), 'utf8')) as { base: string; url: string };
const IMG = path.join(TEXTOS_DIR, '..', 'desconto', 'img');
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
const norm = (t: string) => t.replace(/\s+/g, ' ');
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();

/** CPF válido a partir de um número (dígitos verificadores calculados). */
function cpfFrom(seed: number): string {
  const base = String(400000000 + seed).slice(-9);
  const digit = (s: string) => {
    const sum = [...s].reduce((t, d, i) => t + Number(d) * (s.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = digit(base);
  return base + d1 + digit(base + d1);
}

async function buyer() {
  const i = Math.floor(Math.random() * 1e6);
  const email = `comprador.${i}@partyx.test`;
  await q("insert into users (name,email,cpf,password_hash,role,birth_date) values ('Bruna Teixeira',$1,$2,$3,'cliente','1994-03-08')", [
    email,
    cpfFrom(i),
    hash,
  ]);
  return email;
}

/** Evento publicado, a 40 dias, com um tipo "Pista" de R$ 30,00 à venda. */
async function event() {
  const slug = `festa-do-codigo-${uniq().toLowerCase()}`;
  const ev = (
    await q(
      `insert into events (slug,name,starts_at,venue,address,description,age_rating,status)
       values ($1,'Festa do Código',now() + interval '40 days','Clube Comercial','Rua do Acampamento, 500','Evento de teste, dados fictícios.','18 anos','publicado')
       returning id`,
      [slug],
    )
  ).rows[0].id as string;
  await q(
    `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at)
     values ($1,'Pista',3000,200,now() - interval '1 day',now() + interval '30 days')`,
    [ev],
  );
  return slug;
}

async function session(browser: Browser, width: number, email: string) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
    ...(width < 600 ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}),
  });
  await ctx.addInitScript(() => {
    (window as unknown as { __partyxSemAbertura?: boolean }).__partyxSemAbertura = true;
  });
  const page = await ctx.newPage();
  await page.goto(`${R.base}/entrar`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#senha', 'festa2026');
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.startsWith('/entrar'));
  return { ctx, page };
}

const noSideScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

for (const width of [360, 1280]) {
  test(`painel a ${width} px: novo promoter com 10% de desconto, e a lista mostra o desconto e os usos`, async ({ browser }) => {
    const code = `DESC${uniq()}`.slice(0, 20);
    const a = await session(browser, width, 'admin@partyx.test');
    await a.page.goto(`${R.base}/admin/promoters`, { waitUntil: 'networkidle' });
    await expect(a.page.getByText('O desconto é opcional', { exact: false })).toBeVisible();
    await a.page.getByRole('button', { name: 'Novo promoter' }).click();
    const dialog = a.page.getByRole('dialog');
    await dialog.locator('#pr-name').fill('Duda Promoter');
    await dialog.locator('#pr-code').fill(code);
    await dialog.getByLabel('Porcentagem sobre o valor de cada ingresso').check();
    await dialog.locator('#pr-dvalue').fill('10');
    await expect(dialog).toContainText('Exemplo: ingresso de R$ 30,00 com desconto de R$ 3,00 fica em R$ 27,00');
    // Limite inválido: a tela explica no campo, sem chamar o servidor.
    await dialog.locator('#pr-dmax').fill('0');
    await dialog.getByRole('button', { name: 'Criar promoter' }).click();
    await expect(dialog.locator('#pr-dmax-erro')).toContainText('Informe um limite de 1 ou mais');
    await dialog.locator('#pr-dmax').fill('50');
    await noSideScroll(a.page);
    await dialog.screenshot({ path: path.join(IMG, `painel-promoter-${width}.png`) });
    await dialog.getByRole('button', { name: 'Criar promoter' }).click();
    await expect(dialog).toBeHidden();
    const card = a.page.locator('li.px-adm-card', { hasText: code });
    await expect(card).toContainText('Desconto: 10% por ingresso, em todos os eventos, limite de 50 usos');
    await expect(card).toContainText('Usos: 0 pagos de 50.');
    const row = (await q('select discount_kind, discount_value, discount_max_uses from promoters where coupon_code = $1', [code])).rows[0];
    expect(row).toEqual({ discount_kind: 'percentual', discount_value: 1000, discount_max_uses: 50 });
    const trail = (await q("select after_json from audit_log where action = 'promoter.criar' order by created_at desc limit 1")).rows[0];
    expect(trail.after_json.discount).toMatchObject({ kind: 'percentual', value: 1000, maxUses: 50 });
    await a.ctx.close();
  });

  test(`checkout a ${width} px: código com desconto, taxa sobre o valor descontado, código que zeraria o pedido recusado`, async ({ browser }) => {
    const slug = await event();
    const ten = `DEZ${uniq()}`.slice(0, 20);
    const all = `TUDO${uniq()}`.slice(0, 20);
    await q("insert into promoters (name,coupon_code,discount_kind,discount_value) values ('Duda',$1,'percentual',1000)", [ten]);
    await q("insert into promoters (name,coupon_code,discount_kind,discount_value) values ('Leo',$1,'fixo',5000)", [all]);
    const b = await session(browser, width, await buyer());
    await b.page.goto(`${R.base}/eventos/${slug}`, { waitUntil: 'networkidle' });
    // Termos 1.5: a porcentagem vigente da taxa aparece na página do evento.
    await expect(b.page.locator('.px-paymethods-fee')).toContainText('Taxa de serviço: 5% do total pago por ingresso');
    await b.page.getByRole('button', { name: 'Mais um Pista' }).first().click();
    await b.page.getByRole('button', { name: 'Continuar' }).first().click();
    await expect(b.page.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
    const aside = b.page.locator('.px-ck-aside');
    // Sem código: R$ 30,00 + taxa de 5% (3000 × 500 / 9500 = 157,9 → R$ 1,58) = R$ 31,58.
    await expect(aside).toContainText('Taxa de serviço (5%)');
    await expect(aside.locator('.px-ck-total')).toContainText('R$ 31,58');

    // Código que zeraria o pedido: recusado com a mensagem combinada, e o resumo continua sem desconto.
    await b.page.locator('#cupom').fill(all);
    await b.page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(b.page.locator('#cupom-erro')).toHaveText('Este código não pode ser usado neste pedido.');
    await expect(aside.locator('.px-ck-total')).toContainText('R$ 31,58');

    // 10%: desconto R$ 3,00; taxa sobre R$ 27,00 = 142,1 → R$ 1,43; total R$ 28,43.
    await b.page.locator('#cupom').fill(ten.toLowerCase());
    await b.page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(b.page.locator('.px-promo-ok')).toContainText(`${ten} aplicado: desconto de 10% em cada ingresso`);
    await expect(aside).toContainText(`Desconto (${ten})`);
    expect(norm(await aside.innerText())).toContain('−R$ 3,00');
    await expect(aside.locator('.px-ck-total')).toContainText('R$ 28,43');
    await expect(b.page.locator('.px-ck-review-lines')).toContainText('com desconto de R$ 3,00');
    await noSideScroll(b.page);
    await b.page.locator('.px-ck-aside, .px-ck-mobbar').first().scrollIntoViewIfNeeded();
    await b.page.screenshot({ path: path.join(IMG, `checkout-desconto-${width}.png`), fullPage: width >= 600 });

    await b.page.getByLabel('Li e aceito a Política de Cancelamento, Troca e Reembolso.').check();
    await b.page.getByRole('button', { name: 'Ir para o pagamento' }).first().click();
    await expect(b.page).toHaveURL(/\/pedido\/[0-9a-f-]{36}$/);
    const orderId = b.page.url().split('/pedido/')[1]!;
    const order = (await q('select coupon_code, discount_kind, discount_cents, service_fee_cents, total_cents from orders where id = $1', [orderId]))
      .rows[0];
    expect(order).toEqual({ coupon_code: ten, discount_kind: 'percentual', discount_cents: 300, service_fee_cents: 143, total_cents: 2843 });
    // A página do pedido (pagamento) mostra o desconto no resumo.
    await expect(b.page.locator('.px-ck-aside')).toContainText(`Desconto (${ten})`);
    await expect(b.page.locator('.px-ck-aside .px-ck-total')).toContainText('R$ 28,43');
    await b.ctx.close();
  });
}
