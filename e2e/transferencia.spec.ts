import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { loadConfig } from '../server/src/config';
import { createDrizzle } from '../server/src/db/client';
import { argon2Hasher } from '../server/src/providers/passwordHasher';
import { issueForOrder } from '../server/src/tickets/issuer';
import { TEXTOS_DIR } from './support/textos-longos-setup';

/**
 * Transferência de ingresso (D-87) no navegador, a 360 e 1280 px: quem transfere confere o nome mascarado e confirma; o ingresso sai
 * de Meus ingressos dele e aparece para quem recebe, com "Recebido de"; a página do pedido mostra "Transferido para"; quem recebe com
 * 17 anos vê o Termo de Ciência no lugar do QR; o painel desfaz com motivo; o checkout pede a caixa da Política.
 */
const R = JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'state.json'), 'utf8')) as { base: string; url: string };
const IMG = path.join(TEXTOS_DIR, '..', 'transferencia', 'img');
let db: pg.Pool;
let hash = '';
let n = 0;
test.beforeAll(async () => {
  db = new pg.Pool({ connectionString: R.url, max: 2 });
  hash = await argon2Hasher.hash('festa2026');
  mkdirSync(IMG, { recursive: true });
});
test.afterAll(async () => {
  await db?.end();
});
const q = (text: string, params: unknown[] = []) => db.query(text, params);

/** CPF válido a partir de um número (dígitos verificadores calculados). */
function cpfFrom(seed: number): string {
  const base = String(300000000 + seed).slice(-9);
  const digit = (s: string) => {
    const sum = [...s].reduce((t, d, i) => t + Number(d) * (s.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = digit(base);
  return base + d1 + digit(base + d1);
}

async function account(name: string, birthDate: string) {
  const i = ++n + Math.floor(Math.random() * 100000);
  const email = `${name.split(' ')[0]!.toLowerCase()}.${i}@partyx.test`;
  const id = (
    await q('insert into users (name,email,cpf,password_hash,role,birth_date) values ($1,$2,$3,$4,$5,$6) returning id', [
      name,
      email,
      cpfFrom(i * 7),
      hash,
      'cliente',
      birthDate,
    ])
  ).rows[0].id as string;
  return { id, email, name };
}

/** Evento com menores permitidos, a 50 dias, e um pedido pago de `quantity` ingressos de quem compra. */
async function paidOrder(buyer: { id: string }, quantity: number) {
  const slug = `festa-primavera-${++n}-${Math.floor(Math.random() * 1e6)}`;
  const ev = (
    await q(
      `insert into events (slug,name,starts_at,ends_at,venue,address,description,age_rating,status,allows_minors)
       values ($1,'Festa de Primavera',now() + interval '50 days',now() + interval '50 days 6 hours','Clube Comercial',
               'Rua do Acampamento, 500, Santa Maria/RS','Evento de teste, dados fictícios.','16 anos','publicado',true)
       returning id`,
      [slug],
    )
  ).rows[0].id as string;
  const type = (
    await q(
      `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at)
       values ($1,'Pista',8000,200,now() - interval '1 day',now() + interval '40 days') returning id`,
      [ev],
    )
  ).rows[0].id as string;
  const order = (
    await q(
      `insert into orders (user_id,event_id,total_cents,status,paid_at,payment_method) values ($1,$2,$3,'pago',now(),'pix') returning id`,
      [buyer.id, ev, 8000 * quantity],
    )
  ).rows[0].id as string;
  const item = (
    await q(
      'insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,$4,8000) returning id',
      [order, ev, type, quantity],
    )
  ).rows[0].id as string;
  await createDrizzle(db).transaction(tx =>
    issueForOrder(tx, loadConfig({ APP_ENV: 'local' }).qr, {
      id: order,
      userId: buyer.id,
      eventId: ev,
      items: [{ orderItemId: item, ticketTypeId: type, quantity }],
    }),
  );
  const tickets = (await q('select id from tickets where order_id = $1 order by unit_index', [order])).rows.map(r => r.id as string);
  return { slug, ev, type, order, tickets };
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
/**
 * Página inteira. No celular, a janela cresce até a altura do conteúdo antes da foto: a barra fixa de abas fica no fim, como numa
 * tela comprida, em vez de cobrir o meio da página (como faria a captura de página inteira).
 */
async function shot(page: Page, name: string, width: number) {
  const file = path.join(IMG, `${name}-${width}.png`);
  if (width >= 600) return page.screenshot({ path: file, fullPage: true });
  const before = page.viewportSize()!;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: before.width, height: Math.max(before.height, height) });
  await page.screenshot({ path: file });
  await page.setViewportSize(before);
}

for (const width of [360, 1280]) {
  test(`transferir a ${width} px: conferência, confirmação, os dois lados de Meus ingressos e o pedido`, async ({ browser }) => {
    const buyer = await account('Beatriz Almeida Rocha', '1995-04-12');
    const friend = await account('Carlos Eduardo da Silva Lima', '1993-09-30');
    const sale = await paidOrder(buyer, 2);

    const a = await session(browser, width, buyer.email);
    await a.page.goto(`${R.base}/meus-ingressos`, { waitUntil: 'networkidle' });
    await expect(a.page.getByRole('heading', { name: 'Festa de Primavera' })).toBeVisible();
    await shot(a.page, 'meus-ingressos-antes', width);

    // Ingresso: botão Transferir e o prazo.
    await a.page.goto(`${R.base}/ingressos/${sale.tickets[0]}`, { waitUntil: 'networkidle' });
    await expect(a.page.getByText('Para passar o ingresso a outra pessoa, use Transferir até')).toBeVisible();
    await a.page.getByRole('link', { name: 'Transferir' }).click();
    await expect(a.page.getByRole('heading', { name: 'Transferir ingresso' })).toBeVisible();
    const field = a.page.getByLabel('E-mail ou CPF de quem vai receber');

    // Destino inexistente: mensagem da conta não encontrada; formato errado: erro no campo.
    await field.fill('ninguem@partyx.test');
    await a.page.getByRole('button', { name: 'Continuar' }).click();
    await expect(a.page.getByRole('alert')).toContainText('Não encontramos uma conta de cliente com esse e-mail ou CPF');
    await field.fill('123');
    await a.page.getByRole('button', { name: 'Continuar' }).click();
    await expect(a.page.locator('#tf-destino-erro')).toHaveText('Confira o CPF.');

    await field.fill(friend.email);
    await shot(a.page, 'transferir-destino', width);
    await a.page.getByRole('button', { name: 'Continuar' }).click();
    // Só o nome mascarado.
    await expect(a.page.locator('.px-tf-who')).toHaveText('Transferir para Carlos E. S. L.?');
    await expect(a.page.getByText('Carlos Eduardo')).toHaveCount(0);
    await noSideScroll(a.page);
    await shot(a.page, 'transferir-confirmar', width);
    await a.page.getByRole('button', { name: 'Confirmar transferência' }).click();
    await expect(a.page.getByRole('heading', { name: 'Ingresso transferido' })).toBeVisible();
    await expect(a.page.locator('.px-tf-done')).toContainText('transferido para Carlos E. S. L.');
    await shot(a.page, 'transferir-feito', width);

    // Quem transferiu: um ingresso a menos; o pedido mostra o transferido.
    await a.page.goto(`${R.base}/meus-ingressos`, { waitUntil: 'networkidle' });
    await expect(a.page.locator('.px-me-ticket')).toHaveCount(1);
    await noSideScroll(a.page);
    await shot(a.page, 'meus-ingressos-quem-transferiu', width);
    await a.page.goto(`${R.base}/pedido/${sale.order}`, { waitUntil: 'networkidle' });
    await expect(a.page.locator('.px-ck-transferred')).toContainText('Transferido para Carlos E. S. L.');
    await shot(a.page, 'pedido-com-transferido', width);
    // O ingresso transferido não abre mais para quem transferiu.
    await a.page.goto(`${R.base}/ingressos/${sale.tickets[0]}`, { waitUntil: 'networkidle' });
    await expect(a.page.getByText('Ingresso não encontrado')).toBeVisible();
    await a.ctx.close();

    // Quem recebeu: o ingresso com "Recebido de" e o QR.
    const b = await session(browser, width, friend.email);
    await b.page.goto(`${R.base}/meus-ingressos`, { waitUntil: 'networkidle' });
    await expect(b.page.locator('.px-me-ticket')).toHaveCount(1);
    await expect(b.page.locator('.px-me-ticket')).toContainText('Recebido de Beatriz A. R.');
    await noSideScroll(b.page);
    await shot(b.page, 'meus-ingressos-quem-recebeu', width);
    await b.page.locator('.px-me-ticket').click();
    await expect(b.page.getByRole('img', { name: /QR Code do ingresso/ })).toBeVisible();
    await expect(b.page.locator('.px-tk-fields')).toContainText('Recebido de');
    await expect(b.page.locator('.px-tk-fields')).toContainText('Carlos Eduardo da Silva Lima');
    await shot(b.page, 'ingresso-recebido', width);
    await b.ctx.close();
  });
}

test('quem recebe com 17 anos vê o Termo de Ciência no lugar do QR até aceitar (360 px)', async ({ browser }) => {
  const buyer = await account('Beatriz Almeida Rocha', '1995-04-12');
  // 17 anos daqui a 50 dias: nascida há 17 anos e 6 meses.
  const birth = new Date(Date.now() - (17 * 365.25 + 180) * 86400_000).toISOString().slice(0, 10);
  const teen = await account('Júlia Martins Costa', birth);
  const sale = await paidOrder(buyer, 1);
  const a = await session(browser, 1280, buyer.email);
  await a.page.goto(`${R.base}/ingressos/${sale.tickets[0]}/transferir`, { waitUntil: 'networkidle' });
  await a.page.getByLabel('E-mail ou CPF de quem vai receber').fill(teen.email);
  await a.page.getByRole('button', { name: 'Continuar' }).click();
  await expect(a.page.getByText('Se a pessoa tiver 16 ou 17 anos na data do evento')).toBeVisible();
  await a.page.getByRole('button', { name: 'Confirmar transferência' }).click();
  await expect(a.page.getByRole('heading', { name: 'Ingresso transferido' })).toBeVisible();
  await a.ctx.close();

  const t = await session(browser, 360, teen.email);
  await t.page.goto(`${R.base}/ingressos/${sale.tickets[0]}`, { waitUntil: 'networkidle' });
  await expect(t.page.getByRole('heading', { name: 'Aceite o Termo de Ciência para ver o QR Code' })).toBeVisible();
  await expect(t.page.getByRole('img', { name: /QR Code do ingresso/ })).toHaveCount(0);
  await expect(t.page.getByRole('link', { name: 'Baixar PDF' })).toHaveCount(0);
  const accept = t.page.getByRole('button', { name: 'Aceitar e mostrar o QR Code' });
  await expect(accept).toBeDisabled();
  await shot(t.page, 'ingresso-recebido-menor-termo', 360);
  await t.page.getByLabel('Li e aceito o Termo de Ciência para Menores de Idade.').check();
  await accept.click();
  await expect(t.page.getByRole('img', { name: /QR Code do ingresso/ })).toBeVisible();
  // A autorização sai por ingresso, em nome de quem recebeu.
  await t.page.goto(`${R.base}/meus-ingressos`, { waitUntil: 'networkidle' });
  await expect(t.page.getByRole('link', { name: 'Autorização para menores (PDF)' })).toHaveAttribute(
    'href',
    `/api/tickets/${sale.tickets[0]}/autorizacao-menor.pdf`,
  );
  await t.ctx.close();
});

test('painel: histórico das transferências e desfazer com motivo (1280 px)', async ({ browser }) => {
  const buyer = await account('Beatriz Almeida Rocha', '1995-04-12');
  const friend = await account('Carlos Eduardo da Silva Lima', '1993-09-30');
  const sale = await paidOrder(buyer, 1);
  const a = await session(browser, 1280, buyer.email);
  const res = await a.page.request.post(`${R.base}/api/tickets/${sale.tickets[0]}/transfer`, {
    data: { destination: friend.email, confirm: true },
    headers: { 'x-csrf-token': (await (await a.page.request.get(`${R.base}/api/auth/me`)).json()).csrfToken, origin: R.base },
  });
  expect(res.status()).toBe(200);
  await a.ctx.close();

  const admin = await session(browser, 1280, 'admin@partyx.test');
  await admin.page.goto(`${R.base}/admin/ingressos/${sale.tickets[0]}`, { waitUntil: 'networkidle' });
  await expect(admin.page.getByText('Recebeu por transferência')).toBeVisible();
  await expect(admin.page.locator('.px-trail').first()).toContainText('Beatriz Almeida Rocha para Carlos Eduardo da Silva Lima');
  await admin.page.getByRole('button', { name: 'Desfazer última transferência' }).click();
  const dialog = admin.page.getByRole('dialog');
  await expect(dialog).toContainText('O ingresso volta para Beatriz Almeida Rocha');
  const confirm = dialog.getByRole('button', { name: 'Desfazer transferência' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Motivo (fica na trilha de auditoria)').fill('Venda com Pix devolvido, conferida pela PartyX');
  await dialog.getByLabel('Confirmo que a fraude foi comprovada pela PartyX.').check();
  await admin.page.screenshot({ path: path.join(IMG, 'painel-desfazer-1280.png') });
  await confirm.click();
  await expect(admin.page.getByText('Transferência desfeita. O ingresso voltou para Beatriz Almeida Rocha')).toBeVisible();
  await expect(admin.page.locator('.px-trail').first()).toContainText('desfeita por Admin Teste');
  await expect(admin.page.getByRole('button', { name: 'Desfazer última transferência' })).toHaveCount(0);
  await shot(admin.page, 'painel-ingresso-historico', 1280);
  expect((await q('select holder_user_id from tickets where id = $1', [sale.tickets[0]])).rows[0].holder_user_id).toBe(buyer.id);
  await admin.ctx.close();
});

for (const width of [360, 1280]) {
  test(`checkout a ${width} px: "Ir para o pagamento" só com a caixa da Política marcada`, async ({ browser }) => {
    const buyer = await account('Beatriz Almeida Rocha', '1995-04-12');
    const sale = await paidOrder(buyer, 1);
    const a = await session(browser, width, buyer.email);
    await a.page.goto(`${R.base}/eventos/${sale.slug}`, { waitUntil: 'networkidle' });
    await a.page.getByRole('button', { name: 'Mais um Pista' }).first().click();
    await a.page.getByRole('button', { name: 'Continuar' }).first().click();
    await expect(a.page.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
    const pay = a.page.getByRole('button', { name: 'Ir para o pagamento' }).first();
    const box = a.page.getByLabel('Li e aceito a Política de Cancelamento, Troca e Reembolso.');
    await expect(box).toBeEnabled();
    await expect(box).not.toBeChecked();
    await expect(pay).toBeDisabled();
    await expect(a.page.locator('#aceite-politica-dica')).toContainText('Não há reembolso por desistência');
    await noSideScroll(a.page);
    await a.page.locator('.px-ck-policy').scrollIntoViewIfNeeded();
    await a.page.screenshot({ path: path.join(IMG, `checkout-politica-${width}.png`) });
    await box.check();
    await expect(pay).toBeEnabled();
    await pay.click();
    await expect(a.page).toHaveURL(/\/pedido\/[0-9a-f-]{36}$/);
    const orderId = a.page.url().split('/pedido/')[1]!;
    const acc = (await q('select policy_version, host(ip) as ip, user_agent from cancellation_acceptances where order_id = $1', [orderId]))
      .rows;
    expect(acc).toHaveLength(1);
    expect(acc[0].policy_version).toBeTruthy();
    expect(acc[0].user_agent).toBeTruthy();
    await a.ctx.close();
  });
}
