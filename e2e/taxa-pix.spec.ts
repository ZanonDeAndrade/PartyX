import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import pg from 'pg';
import { loadConfig } from '../server/src/config';
import { createDrizzle } from '../server/src/db/client';
import { argon2Hasher } from '../server/src/providers/passwordHasher';
import { issueForOrder } from '../server/src/tickets/issuer';
import { TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Taxa mensal com a regra por forma de pagamento (D-93) a 360 e 1280 px: outubro de 2026 tem a regra original até 20/10 (todo
 * ingresso entra) e a do aditivo desde 21/10 (só Pix). O aviso do topo mostra os dois períodos; os indicadores mostram o total a
 * repassar, os ingressos por Pix e os por cartão; a tabela por período e o detalhe dizem o que entra. Dados fictícios.
 */
const R = JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'state.json'), 'utf8')) as { base: string; url: string };
const IMG = path.join(TEXTOS_DIR, '..', 'taxa-pix', 'img');
let db: pg.Pool;
const q = (text: string, params: unknown[] = []) => db.query(text, params);

async function seed() {
  const hash = await argon2Hasher.hash('festa2026');
  const ev = (
    await q(
      `insert into events (slug,name,starts_at,venue,address,description,age_rating,status)
       values ('baile-primavera-d93','Baile de Primavera','2026-11-14T23:00:00-03:00','Clube Comercial','Rua do Acampamento, 500',
               'Evento de teste, dados fictícios.','18 anos','publicado') returning id`,
    )
  ).rows[0].id as string;
  const type = (
    await q(
      `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at)
       values ($1,'Pista',3000,300,'2026-10-01T00:00:00-03:00','2026-11-14T20:00:00-03:00') returning id`,
      [ev],
    )
  ).rows[0].id as string;
  const qr = loadConfig({ APP_ENV: 'local' }).qr;
  let i = 0;
  const paid = async (paidAt: string, method: 'pix' | 'cartao', quantity: number, status: 'pago' | 'estornado' = 'pago') => {
    const user = (
      await q("insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,'cliente') returning id", [
        `Comprador D93 ${++i}`,
        `comprador.d93.${i}@partyx.test`,
        String(71000000000 + i),
        hash,
      ])
    ).rows[0].id as string;
    const order = (
      await q(
        `insert into orders (user_id,event_id,total_cents,status,paid_at,payment_method,created_at) values ($1,$2,$3,$4,$5,$6,$5) returning id`,
        [user, ev, 3000 * quantity, status, paidAt, method],
      )
    ).rows[0].id as string;
    const item = (
      await q(
        'insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,$4,3000) returning id',
        [order, ev, type, quantity],
      )
    ).rows[0].id as string;
    await createDrizzle(db).transaction(tx =>
      issueForOrder(tx, qr, { id: order, userId: user, eventId: ev, items: [{ orderItemId: item, ticketTypeId: type, quantity }] }),
    );
    if (status === 'estornado')
      await q("update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'estorno' where order_id = $1", [order]);
  };
  await paid('2026-10-18T22:00:00Z', 'pix', 2); // regra original: entra
  await paid('2026-10-19T23:00:00Z', 'cartao', 1); // regra original: entra
  await paid('2026-10-21T03:00:00Z', 'pix', 3); // 21/10 00:00 em Brasília: regra nova, Pix entra
  await paid('2026-10-22T15:00:00Z', 'cartao', 2); // regra nova: cartão fica de fora
  await paid('2026-10-23T15:00:00Z', 'pix', 1, 'estornado'); // estornado continua contando
}

test.beforeAll(async () => {
  db = new pg.Pool({ connectionString: R.url, max: 2 });
  mkdirSync(IMG, { recursive: true });
  await seed();
});
test.afterAll(async () => {
  await db?.end();
});

async function admin(browser: Browser, width: number) {
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
  await page.fill('#email', 'admin@partyx.test');
  await page.fill('#senha', 'festa2026');
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.startsWith('/entrar'));
  return { ctx, page };
}

test('taxa mensal de outubro/2026 a 360 e 1280 px: aviso com os dois períodos, Pix, cartão e total a repassar', async ({ browser }) => {
  for (const width of [360, 1280]) {
    const { ctx, page } = await admin(browser, width);
    await page.goto(`${R.base}/admin/relatorios/taxa-mensal`, { waitUntil: 'networkidle' });
    await page.locator('#t-mes').fill('2026-10');
    const rule = page.getByRole('note').filter({ hasText: 'Regra do repasse em 10/2026' });
    await expect(rule).toBeVisible();
    await expect(rule).toContainText('De 01/10/2026 a 20/10/2026: R$ 1,00 por ingresso, qualquer forma de pagamento');
    await expect(rule).toContainText(
      'De 21/10/2026 a 31/10/2026: R$ 1,00 por ingresso de pedido pago por Pix; ingressos pagos por cartão não entram no repasse',
    );
    await expect(page.getByRole('region', { name: 'Total a repassar' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ingressos por cartão' })).toContainText('3');
    await expect(page.getByRole('region', { name: 'Ingressos por cartão' })).toContainText('1 entram pela regra do período');
    await expect(page.getByRole('cell', { name: 'De 21/10/2026 a 31/10/2026' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.locator('#t-mes').evaluate(el => (el as HTMLInputElement).blur());
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(IMG, `taxa-mensal-${width}.png`), fullPage: true });
    await ctx.close();
  }
});
