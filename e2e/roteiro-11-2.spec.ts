import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { devices, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { scanQr } from './support/camera';
import {
  api,
  apiLogin,
  chooseTickets,
  cpfFor,
  expectNoOverflow,
  formatCpf,
  humanReady,
  PASSWORD_BUYER,
  PASSWORD_TEAM,
  prepareContext,
  reserve,
  sql,
  waitForEmail,
} from './support/helpers';
import { mailLinks, waitForMail } from './support/mailbox';
import { payments, type Notification } from './support/payments';
import { readState } from './support/roteiro-setup';
import { ROOT } from './support/server';

/**
 * Roteiro de testes essenciais (PDF, seção 11.2, itens 1 a 20) pela interface, no servidor LOCAL com PostgreSQL de teste.
 * O gateway (sandbox do Mercado Pago ou fictício) é escolhido no setup e aparece no nome de cada evidência e no resumo.
 * Perfis: cliente (compradores), administrador (Carla) e validador (Rafael), e o validador tentando o painel (item 20).
 */
const S = readState();
const pay = payments(S);
const EVID = path.join(ROOT, 'docs/evidencias/roteiro-11-2', S.remote ? 'homologacao-sandbox' : S.gateway);
// Identificadores da rodada: no local, os de sempre; em homologação, sufixados (o banco recebe várias rodadas).
const R = S.run;
const EVENT = R.eventName;
const mail = (who: string) => `${who}.roteiro${R.emailTag}@partyx.test`;
// Capturas e PDF ficam em img/, fora do Git (.gitignore): no repositório só as tabelas (CSV) e o resultado.md.
const IMG = path.join(EVID, 'img');
mkdirSync(IMG, { recursive: true });
const results: { item: number; title: string; notes: string[] }[] = [];
const note = (item: number, text: string) => results.find(r => r.item === item)!.notes.push(text);
const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(IMG, `${name}.jpg`), type: 'jpeg', quality: 70, fullPage: false });

const brl = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d); // AAAA-MM-DD
};

// Compradores fictícios. "APRO" no começo do nome: no ambiente de teste do Mercado Pago o Pix desse pagador é aprovado sozinho.
// Carlos não tem APRO de propósito: o Pix dele fica sem pagar (item 7).
const buyers = {
  ana: { name: 'APRO Ana Souza Fictícia', email: mail('ana'), cpf: cpfFor(7001 + R.cpfOffset), password: PASSWORD_BUYER },
  bruno: { name: 'APRO Bruno Lima Fictício', email: mail('bruno'), cpf: cpfFor(7002 + R.cpfOffset), password: PASSWORD_BUYER },
  carlos: { name: 'Carlos Pendente Fictício', email: mail('carlos'), cpf: cpfFor(7003 + R.cpfOffset), password: PASSWORD_BUYER },
  duda: { name: 'APRO Davi Cupom Fictício', email: mail('davi'), cpf: cpfFor(7004 + R.cpfOffset), password: PASSWORD_BUYER },
  eva: { name: 'APRO Eva Disputa Fictícia', email: mail('eva'), cpf: cpfFor(7005 + R.cpfOffset), password: PASSWORD_BUYER },
  fabio: { name: 'APRO Fábio Disputa Fictício', email: mail('fabio'), cpf: cpfFor(7006 + R.cpfOffset), password: PASSWORD_BUYER },
};
type Buyer = (typeof buyers)[keyof typeof buyers];

// Estado compartilhado entre os itens (rodam em série, na ordem do PDF).
let eventId = '';
let slug = '';
let typeIds: Record<string, string> = {};
const orderOf: Record<string, string> = {};
let pixNotification: Notification | null = null;

let browser: Browser;
const contexts: BrowserContext[] = [];
async function context(opts: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1440, height: 900 }, ...opts });
  await prepareContext(ctx);
  ctx.on('weberror', e => console.log(`[erro na página] ${e.error().message}`));
  contexts.push(ctx);
  return ctx;
}
async function as(who: Buyer | 'admin' | 'validador', opts: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await context(opts);
  const [email, password] =
    who === 'admin'
      ? [R.admin, PASSWORD_TEAM]
      : who === 'validador'
        ? [R.validador, PASSWORD_TEAM]
        : [who.email, who.password];
  await apiLogin(ctx.request, S.base, email, password);
  return { ctx, page: await ctx.newPage() };
}
async function register(b: Buyer) {
  const ctx = await context();
  const lv = (await (await ctx.request.get(`${S.base}/api/legal/versions`)).json()) as { terms: string; privacy: string };
  const r = await api(ctx.request, S.base, 'POST', '/auth/register', {
    name: b.name,
    email: b.email,
    cpf: b.cpf,
    phone: '(11) 98765-4321',
    birthDate: '1995-03-20', // adulto: o roteiro compra para eventos sem menores
    password: b.password,
    acceptedTermsVersion: lv.terms,
    acceptedPrivacyVersion: lv.privacy,
    accept: true,
    // Homologação mantém o Turnstile ligado com a chave de TESTE da Cloudflare: aceita este token fictício da documentação dela.
    ...(S.remote ? { captchaToken: 'XXXX.DUMMY.TOKEN.XXXX' } : {}),
  });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  await ctx.close();
}
const ticketsOf = (orderId: string) =>
  sql<{ id: string; status: string; qr_payload: string; short_code: string; holder_name: string }>(
    S.db,
    `select id, status, qr_payload, short_code, holder_name from tickets where order_id = $1 order by unit_index, id`,
    [orderId],
  );
const orderRow = async (orderId: string) =>
  (
    await sql<{ status: string; paid_at: Date | null; promoter: string | null; total_cents: number }>(
      S.db,
      `select o.status, o.paid_at, p.coupon_code as promoter, o.total_cents
         from orders o left join promoters p on p.id = o.promoter_id where o.id = $1`,
      [orderId],
    )
  )[0]!;
const typeRow = async (name: string) =>
  (
    await sql<{ total: number; sold: number; reserved: number }>(
      S.db,
      `select t.quantity_total as total, t.quantity_sold as sold,
              coalesce((select sum(r.quantity) from reservations r
                         where r.ticket_type_id = t.id and r.status = 'ativa' and r.expires_at > now()), 0)::int as reserved
         from ticket_types t where t.id = $1`,
      [typeIds[name]],
    )
  )[0]!;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ playwright }) => {
  browser = await playwright.chromium.launch();
});
test.afterAll(async () => {
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
  const lines = [
    `# Roteiro 11.2: resultado da rodada (${S.remote ? 'homologação, ' : ''}${S.gateway === 'sandbox' ? 'Mercado Pago, ambiente de teste' : 'gateway fictício'})`,
    '',
    S.remote
      ? `Gerado em ${new Date().toISOString()} pelo Playwright (e2e/roteiro-11-2.spec.ts), contra a HOMOLOGAÇÃO ${S.base}, rodada ${R.id} (dados fictícios sufixados pela rodada, no banco de homologação).`
      : `Gerado em ${new Date().toISOString()} pelo Playwright (e2e/roteiro-11-2.spec.ts), servidor local ${S.base}, banco de teste descartável.`,
    `Gateway: **${pay.label}**.`,
    '',
    '| Item | Verificação | Observações |',
    '|---|---|---|',
    ...results.map(r => `| ${r.item} | ${r.title} | ${r.notes.join('<br>') || ''} |`),
    '',
  ];
  writeFileSync(path.join(EVID, 'resultado.md'), lines.join('\n'));
});

function item(n: number, title: string, fn: () => Promise<void>) {
  test(`${String(n).padStart(2, '0')}. ${title}`, async () => {
    results.push({ item: n, title, notes: [] });
    // Fecha as sessões do item anterior: a captura de falha mostra só as páginas deste item.
    for (const c of contexts.splice(0)) await c.close().catch(() => {});
    await fn();
  });
}

// ------------------------------------------------------------------------------------------------------------------------
item(1, 'Cadastro com CPF válido, inválido e repetido', async () => {
  const ctx = await context();
  const page = await ctx.newPage();
  const fillForm = async (b: { name: string; email: string; cpf: string }) => {
    await page.goto(`${S.base}/criar-conta`);
    await page.getByLabel('Nome completo').fill(b.name);
    await page.getByLabel('E-mail').fill(b.email);
    await page.getByLabel('CPF').fill(b.cpf);
    await page.getByLabel('Telefone com DDD').fill('11987654321');
    await page.locator('#nascimento').fill('1990-05-10'); // obrigatória desde a regra de menores (0009); fictícia, maior de idade
    await page.locator('#senha').fill(buyers.ana.password);
    await page.locator('#aceite').check();
    if (S.remote) await humanReady(page);
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  };
  // Inválido: dígitos verificadores errados.
  await fillForm({ name: 'Inválido Fictício', email: mail('invalido'), cpf: '123.456.789-00' });
  await expect(page.locator('#cpf')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(/CPF/).and(page.locator('.px-error'))).toBeVisible();
  await shot(page, '01-cpf-invalido');
  note(1, `CPF inválido: ${await page.locator('.px-error').first().innerText()}`);
  // Válido.
  await fillForm({ ...buyers.ana, cpf: formatCpf(buyers.ana.cpf) });
  await expect(page.getByRole('heading', { name: 'Conta criada' })).toBeVisible();
  await shot(page, '01-cpf-valido-conta-criada');
  // Repetido: outro e-mail, mesmo CPF (em outra sessão, sem estar conectado).
  await ctx.clearCookies();
  await fillForm({ name: 'Repetido Fictício', email: mail('repetido'), cpf: formatCpf(buyers.ana.cpf) });
  await expect(page.locator('#cpf')).toHaveAttribute('aria-invalid', 'true');
  const msg = await page.locator('.px-error').first().innerText();
  expect(msg).toMatch(/CPF/i);
  await shot(page, '01-cpf-repetido');
  note(1, `CPF repetido: ${msg}`);
  const users = await sql<{ n: number }>(
    S.db,
    `select count(*)::int as n from users where role = 'cliente' and (email = any($1) or cpf = $2)`,
    [[buyers.ana.email, mail('invalido'), mail('repetido')], buyers.ana.cpf],
  );
  expect(users[0]!.n).toBe(1);
  note(1, 'Banco: 1 cliente criado (o inválido e o repetido não criaram conta).');
});

// ------------------------------------------------------------------------------------------------------------------------
item(2, 'Login, logout e recuperação de senha', async () => {
  const ctx = await context();
  const page = await ctx.newPage();
  const login = async (password: string) => {
    await page.goto(`${S.base}/entrar`);
    await page.getByLabel('E-mail').fill(buyers.ana.email);
    await page.locator('#senha, input[type=password]').first().fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  };
  await login('senha-errada-123');
  await expect(page.getByRole('alert').first()).toBeVisible();
  note(2, `Senha errada: ${(await page.getByRole('alert').first().innerText()).trim()}`);
  await login(buyers.ana.password);
  await expect(page).not.toHaveURL(/\/entrar/);
  expect((await ctx.request.get(`${S.base}/api/auth/me`)).status()).toBe(200);
  // Logout pela Minha conta.
  await page.goto(`${S.base}/minha-conta`);
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect.poll(async () => (await ctx.request.get(`${S.base}/api/auth/me`)).status()).toBe(401);
  note(2, 'Login e logout: /api/auth/me 200 depois de entrar e 401 depois de sair.');
  // Recuperação: pedido, e-mail capturado (servidor local ou caixa de captura da homologação), link, nova senha, login com ela.
  const asked = new Date();
  await page.goto(`${S.base}/recuperar-senha`);
  await page.getByLabel('E-mail').fill(buyers.ana.email);
  if (S.remote) await humanReady(page);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByRole('heading').first()).toBeVisible();
  const reset = S.remote
    ? {
        link:
          mailLinks(await waitForMail(buyers.ana.email, /Criar nova senha/, asked), S.base).find(l =>
            l.includes('/redefinir-senha?token='),
          ) ?? null,
      }
    : await waitForEmail(ctx.request, S.base, buyers.ana.email, 'recuperacao_senha');
  expect(reset.link).toContain('/redefinir-senha?token=');
  await page.goto(reset.link!.replace(/^https?:\/\/[^/]+/, S.base));
  const nova = 'novaSenha2026Forte';
  await page.getByLabel('Nova senha', { exact: true }).fill(nova);
  await page.getByLabel('Confirmar nova senha').fill(nova);
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByText(/senha (foi )?alterada/i).first()).toBeVisible();
  await shot(page, '02-senha-redefinida');
  buyers.ana.password = nova;
  await login(nova);
  await expect(page).not.toHaveURL(/\/entrar/);
  // O link vale uma vez só.
  await page.goto(reset.link!.replace(/^https?:\/\/[^/]+/, S.base));
  const reused = page.getByRole('heading', { name: /não é válido|já foi usado|utilizado|expirou/i });
  await expect(reused).toBeVisible();
  note(2, `Recuperação: e-mail recebido (${S.remote ? 'caixa de captura da homologação' : 'captura local'}), senha trocada pelo link, login com a nova senha; link reutilizado: "${(await reused.textContent())?.trim()}".`);
});

// ------------------------------------------------------------------------------------------------------------------------
async function createType(page: Page, t: { name: string; price: string; qty: number; start: string; end: string; endTime?: string }) {
  await page.getByRole('button', { name: 'Novo tipo de ingresso' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Nome', { exact: true }).fill(t.name);
  await dlg.getByLabel('Valor em reais').fill(t.price);
  await dlg.getByLabel('Quantidade total').fill(String(t.qty));
  await dlg.getByLabel('Início das vendas: data').fill(t.start);
  await dlg.getByLabel('Início: horário').fill('00:00');
  await dlg.getByLabel('Fim das vendas: data').fill(t.end);
  await dlg.getByLabel('Fim: horário').fill(t.endTime ?? '20:00');
  await dlg.getByRole('button', { name: 'Criar tipo' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByRole('cell', { name: t.name, exact: true }).or(page.getByText(t.name, { exact: true })).first()).toBeVisible();
}

item(3, 'Criação de evento com três tipos de ingresso e períodos de venda diferentes', async () => {
  const ctx = await context();
  const page = await ctx.newPage();
  await page.goto(`${S.base}/entrar?voltar=/admin`);
  await page.getByLabel('E-mail').fill(R.admin);
  await page.locator('#senha, input[type=password]').first().fill(PASSWORD_TEAM);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(`${S.base}/admin`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto(`${S.base}/admin/eventos/novo`);
  await page.getByLabel('Nome do evento').fill(EVENT);
  await page.getByLabel('Data', { exact: true }).fill(day(15));
  await page.getByLabel('Horário de início').fill('22:00');
  await page.getByLabel('Local', { exact: true }).fill('Galpão Fictício do Roteiro');
  await page.getByLabel('Endereço').fill('Rua dos Testes, 112, São Paulo');
  await page.getByLabel('Descrição').fill('Evento fictício criado pelo roteiro 11.2 automatizado. Nenhum ingresso real.');
  await page.getByLabel('Atrações (uma por linha, opcional)').fill('DJ Fictício\nBanda de Teste');
  await page.getByLabel('Classificação etária').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page).toHaveURL(/\/admin\/eventos\/[0-9a-f-]{36}\?aba=tipos/);
  eventId = /eventos\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  // Três tipos, três períodos: Pista (já à venda até o dia do evento), VIP (à venda só por 7 dias) e 2º lote (começa em 5 dias).
  await createType(page, { name: 'Pista', price: '8000', qty: 100, start: day(-1), end: day(15) });
  await createType(page, { name: 'VIP', price: '15000', qty: 20, start: day(-1), end: day(7), endTime: '23:59' });
  await createType(page, { name: 'Segundo lote', price: '10000', qty: 100, start: day(5), end: day(15) });
  await shot(page, '03-tipos-de-ingresso');
  // Publica.
  await page.getByRole('button', { name: 'Publicar' }).first().click();
  await page.getByRole('button', { name: 'Publicar evento' }).click();
  await expect(page.getByText('Publicado').first()).toBeVisible();
  const ev = (await sql<{ slug: string; status: string }>(S.db, `select slug, status from events where id = $1`, [eventId]))[0]!;
  expect(ev.status).toBe('publicado');
  slug = ev.slug;
  const types = await sql<{ id: string; name: string; sales_start_at: Date; sales_end_at: Date }>(
    S.db,
    `select id, name, sales_start_at, sales_end_at from ticket_types where event_id = $1 order by name`,
    [eventId],
  );
  expect(types).toHaveLength(3);
  expect(new Set(types.map(t => `${t.sales_start_at.toISOString()}|${t.sales_end_at.toISOString()}`)).size).toBe(3);
  typeIds = Object.fromEntries(types.map(t => [t.name, t.id]));
  // Página pública: Pista e VIP à venda; o 2º lote aparece, mas ainda não vende.
  const pub = await (await context()).newPage();
  await pub.goto(`${S.base}/eventos/${slug}`);
  await expect(pub.getByRole('button', { name: 'Mais um Pista', exact: true })).toBeEnabled();
  await expect(pub.getByRole('button', { name: 'Mais um VIP', exact: true })).toBeEnabled();
  await expect(pub.getByRole('button', { name: 'Mais um Segundo lote', exact: true })).toHaveCount(0);
  await expect(pub.locator('.px-type', { hasText: 'Segundo lote' })).toBeVisible();
  note(3, `Segundo lote na página pública: "${(await pub.locator('.px-type', { hasText: 'Segundo lote' }).locator('.px-badge').innerText()).trim()}".`);
  await shot(pub, '03-pagina-publica');
  note(3, `Evento ${slug} publicado pela interface do administrador; 3 tipos com 3 períodos de venda distintos (banco conferido).`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(4, 'Compra de 1 ingresso via Pix aprovado', async () => {
  const { page } = await as(buyers.ana);
  await chooseTickets(page, S.base, slug, { Pista: 1 });
  const id = await reserve(page);
  orderOf.ana = id;
  await pay.startPix(page);
  await shot(page, '04-pix-gerado');
  pixNotification = await pay.approvePix(page, id);
  await expect(page.getByRole('heading', { name: 'Compra confirmada' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Seus ingressos' }).getByRole('listitem')).toHaveCount(1);
  await shot(page, '04-pix-compra-confirmada');
  const o = await orderRow(id);
  expect(o.status).toBe('pago');
  expect(o.paid_at).not.toBeNull();
  expect(await ticketsOf(id)).toHaveLength(1);
  note(4, `Gateway: ${pay.label}. Pedido pago, 1 ingresso emitido.`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(5, 'Compra de 3 ingressos via cartão aprovado', async () => {
  await register(buyers.bruno);
  const { page } = await as(buyers.bruno);
  await chooseTickets(page, S.base, slug, { Pista: 2, VIP: 1 });
  const id = await reserve(page);
  orderOf.bruno = id;
  await pay.payCard(page, id, 'APRO');
  await expect(page.getByRole('heading', { name: 'Compra confirmada' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('list', { name: 'Seus ingressos' }).getByRole('listitem')).toHaveCount(3);
  await shot(page, '05-cartao-compra-confirmada');
  const t = await ticketsOf(id);
  expect(t).toHaveLength(3);
  expect(new Set(t.map(x => x.qr_payload)).size).toBe(3);
  expect((await orderRow(id)).status).toBe('pago');
  note(5, `Gateway: ${pay.label}${S.gateway === 'sandbox' ? ' (Card Payment Brick, titular APRO)' : ''}. 3 ingressos, 3 QR distintos.`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(6, 'Compra com cartão recusado: pedido não pago, estoque liberado', async () => {
  await register(buyers.carlos);
  const { page } = await as(buyers.carlos);
  const before = await typeRow('VIP');
  await chooseTickets(page, S.base, slug, { VIP: 2 });
  const id = await reserve(page);
  expect((await typeRow('VIP')).reserved).toBe(before.reserved + 2);
  await pay.payCard(page, id, 'OTHE');
  await expect(page.getByRole('heading', { name: 'Pagamento não aprovado' })).toBeVisible({ timeout: 60_000 });
  await shot(page, '06-cartao-recusado');
  const o = await orderRow(id);
  expect(o.status).toBe('nao_concluido');
  expect(o.paid_at).toBeNull();
  expect(await ticketsOf(id)).toHaveLength(0);
  const after = await typeRow('VIP');
  expect(after.reserved).toBe(before.reserved);
  expect(after.sold).toBe(before.sold);
  note(6, `Gateway: ${pay.label}${S.gateway === 'sandbox' ? ' (titular OTHE)' : ''}. Pedido "nao_concluido", 0 ingresso, reserva de 2 VIP liberada (reservados ${before.reserved} → ${before.reserved + 2} → ${after.reserved}).`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(7, 'Pix não pago até expirar: estoque liberado', async () => {
  const { page } = await as(buyers.carlos);
  const before = await typeRow('Pista');
  await chooseTickets(page, S.base, slug, { Pista: 2 });
  const id = await reserve(page);
  await pay.startPix(page);
  expect((await typeRow('Pista')).reserved).toBe(before.reserved + 2);
  // A reserva dura 30 min (mínimo do Pix no gateway). Em vez de esperar, o prazo é ADIANTADO no banco de teste: só o relógio muda;
  // a expiração é a do próprio servidor, disparada pela leitura do pedido (a mesma regra da varredura).
  await sql(S.db, `update reservations set expires_at = now() - interval '1 second' where order_id = $1`, [id]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'O prazo para pagamento terminou' })).toBeVisible({ timeout: 30_000 });
  await shot(page, '07-pix-expirado');
  expect((await orderRow(id)).status).toBe('expirado');
  expect(await ticketsOf(id)).toHaveLength(0);
  expect((await typeRow('Pista')).reserved).toBe(before.reserved);
  note(7, `Gateway: ${pay.label}. Prazo da reserva adiantado no banco de teste (não se esperou 30 min). Pedido "expirado", 2 unidades de volta à venda, 0 ingresso.`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(8, 'Compra com cupom de promoter válido e com cupom inválido', async () => {
  await register(buyers.duda);
  const { page } = await as(buyers.duda);
  await chooseTickets(page, S.base, slug, { Pista: 2 });
  const total = await page.locator('.px-ck-aside').innerText();
  for (const [code, why] of [
    ['NAOEXISTE', 'inexistente'],
    [R.leo, 'desativado'],
  ] as const) {
    await page.getByLabel('Código', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Aplicar' }).click();
    const err = page.locator('#cupom-erro');
    await expect(err).toBeVisible();
    note(8, `Código ${why} (${code}): "${(await err.innerText()).trim()}".`);
  }
  await shot(page, '08-cupom-invalido');
  const id = await reserve(page, R.duda);
  orderOf.duda = id;
  await shot(page, '08-cupom-valido-pedido');
  await pay.startPix(page);
  await pay.approvePix(page, id);
  await expect(page.getByRole('heading', { name: 'Compra confirmada' })).toBeVisible({ timeout: 30_000 });
  const o = await orderRow(id);
  expect(o.promoter).toBe(R.duda);
  expect(o.total_cents).toBe(2 * 8000); // sem desconto: o código só atribui a venda
  expect(total).toContain('160,00');
  note(8, `Código ${R.duda} aceito: "aplicado. Total inalterado."; pedido pago atribuído ao promoter ${R.duda} com total R$ 160,00 (sem desconto).`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(9, 'Tentativa de comprar acima do limite por compra', async () => {
  const { ctx, page } = await as(buyers.duda);
  await page.goto(`${S.base}/eventos/${slug}`);
  const plus = page.getByRole('button', { name: 'Mais um Pista', exact: true });
  for (let i = 0; i < 6; i++) await plus.click();
  await expect(plus).toBeDisabled();
  await expect(page.getByRole('group', { name: 'Quantidade de Pista' }).locator('output')).toHaveText('6');
  await expect(page.getByRole('button', { name: 'Mais um VIP', exact: true })).toBeDisabled();
  await shot(page, '09-limite-na-tela');
  // O servidor impõe o limite mesmo com a tela burlada: 7 unidades direto na API.
  const before = await sql<{ n: number }>(S.db, `select count(*)::int as n from orders`);
  const r = await api(ctx.request, S.base, 'POST', '/orders', {
    eventSlug: slug,
    items: [{ ticketTypeId: typeIds.Pista, quantity: 7 }],
    couponCode: null,
  });
  expect(r.status).toBeGreaterThanOrEqual(400);
  expect(r.status).toBeLessThan(500);
  expect((await sql<{ n: number }>(S.db, `select count(*)::int as n from orders`))[0]!.n).toBe(before[0]!.n);
  note(9, `Tela: "+" desativado com 6 (limite). API com 7 unidades: ${r.status} "${r.json?.erro?.mensagem ?? ''}", nenhum pedido criado.`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(10, 'Esgotamento: última unidade disputada por dois compradores', async () => {
  // Um tipo extra com 1 unidade, criado pelo administrador na interface.
  const { page: adm } = await as('admin');
  await adm.goto(`${S.base}/admin/eventos/${eventId}?aba=tipos`);
  await createType(adm, { name: 'Ultima unidade', price: '5000', qty: 1, start: day(-1), end: day(15) });
  typeIds['Ultima unidade'] = (
    await sql<{ id: string }>(S.db, `select id from ticket_types where event_id = $1 and name = 'Ultima unidade'`, [eventId])
  )[0]!.id;
  await register(buyers.eva);
  await register(buyers.fabio);
  const a = await as(buyers.eva);
  const b = await as(buyers.fabio);
  for (const p of [a.page, b.page]) {
    await chooseTickets(p, S.base, slug, { 'Ultima unidade': 1 });
    await expect(p.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
  }
  // Os dois clicam ao mesmo tempo.
  await Promise.all([a.page, b.page].map(p => p.getByRole('button', { name: 'Ir para o pagamento' }).first().click()));
  const won = async (p: Page) => {
    await expect
      .poll(async () => /\/pedido\//.test(p.url()) || (await p.getByRole('alert').count()) > 0, { timeout: 20_000 })
      .toBe(true);
    return /\/pedido\//.test(p.url());
  };
  const [wa, wb] = [await won(a.page), await won(b.page)];
  expect([wa, wb].filter(Boolean)).toHaveLength(1);
  const loser = wa ? b.page : a.page;
  const msg = (await loser.getByRole('alert').first().innerText()).trim();
  await shot(loser, '10-esgotado-perdedor');
  await shot(wa ? a.page : b.page, '10-esgotado-vencedor');
  const t = await typeRow('Ultima unidade');
  expect(t.sold + t.reserved).toBeLessThanOrEqual(t.total);
  expect(t.reserved).toBe(1);
  note(10, `Um comprador reservou a última unidade; o outro viu: "${msg}". Banco: total ${t.total}, vendidos ${t.sold}, reservados ${t.reserved}.`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(11, 'Webhook recebido duas vezes: ingressos não duplicados', async () => {
  const id = orderOf.ana!;
  const before = await ticketsOf(id);
  expect(before).toHaveLength(1);
  if (S.gateway === 'sandbox') {
    // A MESMA notificação do item 4 (mesmo x-request-id, ts, assinatura e corpo) chega de novo, e mais uma nova para a mesma order.
    const again = await pixNotification!.send();
    expect(again.status).toBe(200);
    const fresh = await (await pay.notificationFor(id))!.send();
    expect(fresh.status).toBe(200);
    note(11, `Sandbox: mesma notificação reenviada → ${again.status} ${JSON.stringify(again.body)}; nova notificação da mesma order → ${fresh.status} ${JSON.stringify(fresh.body)}.`);
  } else {
    // Fictício: a confirmação de pagamento chega mais duas vezes pelo caminho do webhook (o simulador monta e assina no servidor).
    const { ctx } = await as(buyers.ana);
    for (let i = 0; i < 2; i++) {
      const r = await api(ctx.request, S.base, 'POST', `/dev/mock-gateway/${id}/aprovado`);
      expect(r.status).toBe(200);
      note(11, `Fictício: confirmação repetida ${i + 1} → ${JSON.stringify(r.json)}.`);
    }
  }
  const after = await ticketsOf(id);
  expect(after.map(t => t.id)).toEqual(before.map(t => t.id));
  const evs = (
    await sql<{ n: number; distintos: number; processados: number }>(
      S.db,
      `select count(*)::int as n, count(distinct gateway_event_id)::int as distintos,
              count(*) filter (where processed_at is not null)::int as processados
         from payment_events where order_id = $1`,
      [id],
    )
  )[0]!;
  expect(evs.n).toBe(evs.distintos); // a repetição idêntica não vira segunda linha
  note(11, `Ingressos do pedido continuam ${after.length} (mesmos ids). Notificações gravadas para o pedido: ${evs.n} (${evs.distintos} ids distintos, ${evs.processados} processadas).`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(12, 'E-mail de confirmação recebido com link para os ingressos', async () => {
  if (S.remote) {
    // Homologação: o e-mail real enviado pelo SMTP do serviço, lido na caixa de captura (Ethereal) por IMAP.
    // Fora do local o assunto leva o prefixo do ambiente ("[HOMOLOGAÇÃO] Compra confirmada · …"): sem âncora no início.
    const m = await waitForMail(buyers.ana.email, /Compra confirmada · /, new Date(Date.now() - 3_600_000));
    const links = mailLinks(m, S.base);
    expect(links.length).toBeGreaterThanOrEqual(1);
    const { page } = await as(buyers.ana);
    await page.setContent(m.html);
    await shot(page, '12-email-de-confirmacao');
    await page.goto(links[0]!);
    await expect(page.locator('main')).toContainText(EVENT);
    await shot(page, '12-link-do-email');
    note(12, `E-mail "${m.subject}" entregue pelo SMTP da homologação e lido na caixa de captura; link ${new URL(links[0]!).pathname} abre os ingressos de Ana.`);
    return;
  }
  // Sem SMTP no ambiente local: o servidor grava cada e-mail enviado (HTML e texto) em .data/emails. É o mesmo conteúdo do envio real.
  const dir = path.join(ROOT, 'e2e/.run/roteiro/server/.data/emails');
  const mine = readdirSync(dir)
    .filter(f => f.endsWith('-compra_confirmada.txt'))
    .filter(f => readFileSync(path.join(dir, f), 'utf8').startsWith(`Para: ${buyers.ana.email}`));
  expect(mine.length).toBeGreaterThanOrEqual(1);
  const txt = readFileSync(path.join(dir, mine[0]!), 'utf8');
  const html = readFileSync(path.join(dir, mine[0]!.replace(/\.txt$/, '.html')), 'utf8');
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]!).filter(h => h.startsWith(S.base));
  expect(links.length).toBeGreaterThanOrEqual(1);
  const { page } = await as(buyers.ana);
  await page.setContent(html);
  await shot(page, '12-email-de-confirmacao');
  await page.goto(links[0]!);
  await expect(page.locator('main')).toContainText(EVENT);
  await shot(page, '12-link-do-email');
  note(12, `E-mail "${/Assunto: (.*)/.exec(txt)?.[1]}" capturado pelo servidor local (sem SMTP real); link ${new URL(links[0]!).pathname} abre os ingressos de Ana.`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(13, 'Download do PDF e exibição no celular', async () => {
  const { page } = await as(buyers.bruno, { ...devices['Pixel 7'] });
  await page.goto(`${S.base}/meus-ingressos`);
  // A lista agrupa os ingressos do pedido; abre o primeiro mostrado.
  await page.locator('a[href^="/ingressos/"]').first().click();
  await expect(page).toHaveURL(/\/ingressos\/[0-9a-f-]{36}$/);
  await expect(page.locator('img[alt*="QR"], canvas, svg[aria-label*="QR"]').first()).toBeVisible();
  await expectNoOverflow(page, 'ingresso no celular');
  await shot(page, '13-ingresso-no-celular');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Baixar PDF' }).click()]);
  const file = path.join(IMG, '13-ingresso.pdf');
  await download.saveAs(file);
  const bytes = readFileSync(file);
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  const text = execFileSync('pdftotext', [file, '-']).toString();
  expect(text).toContain(EVENT);
  expect(text.replace(/\D/g, '')).not.toContain(buyers.bruno.cpf);
  // Miniatura da primeira página, como aparece no visualizador do celular.
  execFileSync('pdftoppm', ['-jpeg', '-r', '60', '-singlefile', file, path.join(IMG, '13-ingresso-pdf')]);
  note(13, `PDF ${bytes.length} bytes, com nome do evento e sem CPF; tela do ingresso no Pixel 7 (emulado) sem rolagem horizontal.`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(14, 'Validação: válido, já utilizado, cancelado, de outro evento, código adulterado', async () => {
  const bt = await ticketsOf(orderOf.bruno!);
  // Um ingresso de outro evento: Ana compra no "Outro Evento E2E".
  const { page } = await as(buyers.ana);
  await chooseTickets(page, S.base, S.otherEvent.slug, { Pista: 1 });
  const otherOrder = await reserve(page);
  await pay.startPix(page);
  await pay.approvePix(page, otherOrder);
  await expect(page.getByRole('heading', { name: 'Compra confirmada' })).toBeVisible({ timeout: 30_000 });
  const other = (await ticketsOf(otherOrder))[0]!;
  // Cancelamento pela API do administrador (o cancelamento pela tela é o item 17).
  const { ctx: admin } = await as('admin');
  const c = await api(admin.request, S.base, 'POST', `/admin/tickets/${bt[1]!.id}/cancel`, {
    reason: 'Roteiro 11.2: caso cancelado',
    confirm: true,
  });
  expect(c.status).toBe(200);
  const adulterated = bt[2]!.qr_payload.slice(0, -2) + (bt[2]!.qr_payload.endsWith('A') ? 'BB' : 'AA');
  const cases: [string, string, ScanTone, string][] = [
    ['valido', bt[0]!.qr_payload, 'ok', 'Válido'],
    ['ja-utilizado', bt[0]!.qr_payload, 'warn', 'Já utilizado'],
    ['cancelado', bt[1]!.qr_payload, 'err', 'Cancelado'],
    ['outro-evento', other.qr_payload, 'err', 'Outro evento'],
    ['adulterado', adulterated, 'err', 'Inválido'],
  ];
  for (const [name, qr, tone, title] of cases) {
    const scan = await scanQr(S.base, eventId, qr, { email: R.validador });
    try {
      await shot(scan.page, `14-portaria-${name}`);
      expect(scan.result!.title).toBe(title);
      expect(scan.result!.tone).toBe(tone);
      note(14, `${title}: tela ${tone === 'ok' ? 'verde' : tone === 'warn' ? 'amarela' : 'vermelha'} (${scan.result!.background}).`);
    } finally {
      await scan.close();
    }
  }
  const used = (await sql<{ status: string }>(S.db, `select status from tickets where id = $1`, [bt[0]!.id]))[0]!;
  expect(used.status).toBe('utilizado');
  note(14, 'Leituras pela câmera SIMULADA do Chromium (vídeo com o QR real), não por aparelho.');
});
type ScanTone = 'ok' | 'warn' | 'err';

// ------------------------------------------------------------------------------------------------------------------------
item(15, 'Busca manual pelo nome e pelo código', async () => {
  const { page } = await as('validador', { ...devices['Pixel 7'] });
  await page.goto(`${S.base}/portaria/${eventId}`);
  await page.getByRole('tab', { name: 'Busca manual' }).click();
  const search = async (q: string) => {
    await page.getByLabel('Código, nome, CPF ou e-mail').fill(q);
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.locator('.px-gate-hits li').first().or(page.locator('.px-gate-empty'))).toBeVisible();
  };
  await search('Bruno Lima');
  const hits = page.locator('.px-gate-hits li');
  await expect(hits).toHaveCount(3);
  const body = await page.locator('main').innerText();
  expect(body.replace(/\D/g, '')).not.toContain(buyers.bruno.cpf);
  const cpfShown = /CPF ([^\n]+)/.exec(await hits.first().innerText())?.[1] ?? '';
  expect(cpfShown).toMatch(/\*/);
  await shot(page, '15-busca-por-nome');
  note(15, `Por nome: 3 ingressos de Bruno (válido, utilizado e cancelado), CPF mascarado "${cpfShown.trim()}".`);
  const t = (await ticketsOf(orderOf.bruno!))[2]!;
  await search(t.short_code);
  await expect(hits).toHaveCount(1);
  await shot(page, '15-busca-por-codigo');
  await hits.first().getByRole('button', { name: 'Confirmar entrada' }).click();
  await expect(page.locator('.px-gate-result .px-gate-title')).toHaveText('Válido');
  expect((await sql<{ status: string }>(S.db, `select status from tickets where id = $1`, [t.id]))[0]!.status).toBe('utilizado');
  note(15, `Por código (${t.short_code}): 1 resultado; entrada confirmada manualmente (verde), ingresso "utilizado".`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(16, 'Contador de entradas e acompanhamento em tempo real no painel', async () => {
  const { page } = await as('admin');
  await page.goto(`${S.base}/admin/entradas?evento=${eventId}`);
  const count = page.locator('.px-gate-count');
  await expect(count).toBeVisible();
  const before = Number(await count.innerText());
  await shot(page, '16-entradas-antes');
  const ana = (await ticketsOf(orderOf.ana!))[0]!;
  const scan = await scanQr(S.base, eventId, ana.qr_payload, { email: R.validador });
  expect(scan.result!.title).toBe('Válido');
  const gateCounter = /Entradas (\d+) de (\d+)/.exec(scan.result!.text.replace(/\s+/g, ' '));
  await scan.close();
  // Sem recarregar a página do painel.
  await expect(count).toHaveText(String(before + 1), { timeout: 30_000 });
  await shot(page, '16-entradas-depois');
  note(16, `Painel: ${before} → ${before + 1} entradas sem recarregar; contador na portaria: ${gateCounter?.[1]} de ${gateCounter?.[2]}.`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(17, 'Cancelamento de ingresso pelo administrador e leitura posterior (vermelho)', async () => {
  const t = (await ticketsOf(orderOf.duda!))[0]!;
  const { page } = await as('admin');
  await page.goto(`${S.base}/admin/ingressos/${t.id}`);
  await page.getByRole('button', { name: 'Cancelar ingresso' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox').first().fill('Roteiro 11.2: pedido do comprador registrado pela PartyX');
  const confirm = dlg.getByRole('checkbox');
  if (await confirm.count()) await confirm.first().check();
  await dlg.getByRole('button', { name: /Cancelar ingresso|Confirmar/ }).last().click();
  await expect(page.getByText(/cancelado/i).first()).toBeVisible();
  await shot(page, '17-cancelado-no-painel');
  expect((await sql<{ status: string }>(S.db, `select status from tickets where id = $1`, [t.id]))[0]!.status).toBe('cancelado');
  const scan = await scanQr(S.base, eventId, t.qr_payload, { email: R.validador });
  try {
    await shot(scan.page, '17-portaria-vermelho');
    expect(scan.result!.title).toBe('Cancelado');
    expect(scan.result!.tone).toBe('err');
    note(17, `Cancelado pela tela do administrador; leitura seguinte: "${scan.result!.title}", tela vermelha (${scan.result!.background}).`);
  } finally {
    await scan.close();
  }
  // Cancelar ingresso não estorna: o pedido continua pago.
  expect((await orderRow(orderOf.duda!)).status).toBe('pago');
});

// ------------------------------------------------------------------------------------------------------------------------
item(18, 'Relatórios: vendas por evento, por tipo, por promoter, mensal da taxa', async () => {
  const { page } = await as('admin');
  // Vendas: ingressos de pedidos pagos, por evento e tipo (cancelar ingresso não desfaz a venda).
  const db = await sql<{ type: string; n: number; cents: number }>(
    S.db,
    `select tt.name as type, count(t.id)::int as n, coalesce(sum(tt.price_cents), 0)::int as cents
       from tickets t join ticket_types tt on tt.id = t.ticket_type_id join orders o on o.id = t.order_id
      where t.event_id = $1 and o.status = 'pago' group by tt.name order by tt.name`,
    [eventId],
  );
  await page.goto(`${S.base}/admin/relatorios/vendas`);
  await page.waitForLoadState('networkidle');
  for (const d of db) {
    const row = page.getByRole('row').filter({ hasText: EVENT }).filter({ hasText: d.type });
    await expect(row.getByRole('cell').nth(2)).toHaveText(String(d.n));
    await expect(row.getByRole('cell').nth(3)).toContainText((d.cents / 100).toFixed(2).replace('.', ','));
  }
  await shot(page, '18-relatorio-vendas');
  note(18, `Vendas por evento e tipo conferem com o banco: ${db.map(d => `${d.type} ${d.n} (R$ ${brl(d.cents)})`).join(', ')}.`);

  await page.goto(`${S.base}/admin/relatorios/promoters`);
  await page.waitForLoadState('networkidle');
  const promo = await sql<{ n: number; cents: number }>(
    S.db,
    `select count(t.id)::int as n, (select sum(total_cents) from orders o2 join promoters p2 on p2.id = o2.promoter_id
                                     where p2.coupon_code = $1 and o2.status = 'pago')::int as cents
       from tickets t join orders o on o.id = t.order_id join promoters p on p.id = o.promoter_id
      where p.coupon_code = $1 and o.status = 'pago'`,
    [R.duda],
  );
  const dudaRow = page.getByRole('row').filter({ hasText: R.duda });
  await expect(dudaRow).toContainText(String(promo[0]!.n));
  await expect(dudaRow).toContainText((promo[0]!.cents / 100).toFixed(2).replace('.', ','));
  await shot(page, '18-relatorio-promoters');
  note(18, `Promoters: ${R.duda} com ${promo[0]!.n} ingressos e R$ ${brl(promo[0]!.cents)} atribuídos (sem desconto); linha "${(await dudaRow.innerText()).replace(/\s+/g, ' ')}".`);

  await page.goto(`${S.base}/admin/relatorios/taxa-mensal`);
  await page.waitForLoadState('networkidle');
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date());
  const fee = await sql<{ n: number; cancelados: number }>(
    S.db,
    `select count(t.id)::int as n, count(t.id) filter (where t.status = 'cancelado')::int as cancelados
       from tickets t join orders o on o.id = t.order_id
      where to_char(o.paid_at at time zone 'America/Sao_Paulo', 'YYYY-MM') = $1`,
    [month],
  );
  const [y, m] = month.split('-');
  const card = page.getByRole('region', { name: 'Ingressos apurados' });
  await expect(card).toContainText(new RegExp(`apurados em ${m}/${y}\\s*${fee[0]!.n}\\s*unidades`));
  expect(fee[0]!.cancelados).toBeGreaterThan(0);
  await shot(page, '18-relatorio-taxa-mensal');
  note(18, `Taxa mensal (${m}/${y}): ${fee[0]!.n} ingressos pelo mês de paid_at, dos quais ${fee[0]!.cancelados} cancelados (continuam contando); a tela mostra o mesmo número.`);
});

// ------------------------------------------------------------------------------------------------------------------------
item(19, 'Exportação de planilhas', async () => {
  const { page } = await as('admin');
  const exports: [string, string][] = [
    ['/admin/relatorios/vendas', 'vendas'],
    ['/admin/relatorios/promoters', 'promoters'],
    ['/admin/relatorios/taxa-mensal', 'taxa-mensal'],
  ];
  for (const [route, name] of exports) {
    await page.goto(`${S.base}${route}`);
    await page.waitForLoadState('networkidle');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar CSV' }).first().click(),
    ]);
    const file = path.join(EVID, `19-${name}.csv`);
    await download.saveAs(file);
    const buf = readFileSync(file);
    // CA-31: abre no Excel com acentos (UTF-8 com BOM) e separador ponto e vírgula.
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = buf.toString('utf8').slice(1);
    const header = text.split(/\r?\n/)[0]!;
    expect(header).toContain(';');
    expect(text.replace(/\D/g, '')).not.toContain(buyers.bruno.cpf);
    note(19, `${download.suggestedFilename()}: BOM UTF-8, ${text.trim().split(/\r?\n/).length} linhas, cabeçalho "${header.slice(0, 90)}".`);
  }
  // Ingressos e compradores do evento (aba do evento).
  for (const [tab, name] of [
    ['Ingressos', 'ingressos-do-evento'],
    ['Compradores', 'compradores-do-evento'],
  ] as const) {
    await page.goto(`${S.base}/admin/eventos/${eventId}`);
    await page.getByRole('tab', { name: tab }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Exportar CSV|Baixar/ }).first().click(),
    ]);
    const file = path.join(EVID, `19-${name}.csv`);
    await download.saveAs(file);
    const buf = readFileSync(file);
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = buf.toString('utf8');
    expect(text).toContain('Fictíci');
    expect(text.replace(/\D/g, '')).not.toContain(buyers.bruno.cpf);
    note(19, `${download.suggestedFilename()}: ${text.trim().split(/\r?\n/).length} linhas, acentos preservados.`);
  }
});

// ------------------------------------------------------------------------------------------------------------------------
item(20, 'Validador tentando acessar o painel administrativo', async () => {
  const { ctx, page } = await as('validador');
  for (const route of ['/admin', '/admin/eventos', '/admin/relatorios/taxa-mensal']) {
    await page.goto(`${S.base}${route}`);
    await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
  }
  await shot(page, '20-validador-no-painel');
  const apiCalls = ['/admin/overview', '/admin/events', `/admin/exports/fee.csv`];
  const statuses = [];
  for (const p of apiCalls) {
    const r = await ctx.request.get(`${S.base}/api${p}`);
    statuses.push(`${p} ${r.status()}`);
    expect(r.status()).toBe(403);
  }
  const cancel = await api(ctx.request, S.base, 'POST', `/admin/tickets/${(await ticketsOf(orderOf.ana!))[0]!.id}/cancel`, {
    reason: 'tentativa indevida',
    confirm: true,
  });
  expect(cancel.status).toBe(403);
  // O validador continua com a portaria.
  await page.goto(`${S.base}/portaria`);
  await expect(page.getByRole('heading', { name: 'Acesso negado' })).toHaveCount(0);
  note(20, `Validador: "Acesso negado" nas telas do painel; API ${statuses.join(', ')}, cancelar ingresso ${cancel.status}. Portaria liberada.`);
  // Cliente: nem painel nem portaria.
  const cli = await as(buyers.ana);
  for (const route of ['/admin', '/portaria']) {
    await cli.page.goto(`${S.base}${route}`);
    await expect(cli.page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
  }
  expect((await cli.ctx.request.get(`${S.base}/api/admin/overview`)).status()).toBe(403);
  await shot(cli.page, '20-cliente-na-portaria');
  note(20, 'Cliente: "Acesso negado" no painel e na portaria; API do painel 403.');
});

// ------------------------------------------------------------------------------------------------------------------------
// Fora da numeração do PDF: a varredura de responsividade (CA-32) roda com o gateway fictício, que não tem o formulário de cartão
// do Mercado Pago. Aqui ele é medido a 360 px, sem enviar o pagamento (nenhuma cobrança criada).
test('CA-32: formulário de cartão do Mercado Pago (Brick) a 360 px', async () => {
  test.skip(S.gateway !== 'sandbox', 'o Card Payment Brick só aparece com o gateway real (sandbox)');
  for (const c of contexts.splice(0)) await c.close().catch(() => {});
  const { page } = await as(buyers.carlos, { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await chooseTickets(page, S.base, slug, { Pista: 1 });
  const id = await reserve(page);
  await page.getByRole('radio', { name: /^Cartão de crédito/ }).click();
  await page.getByRole('button', { name: 'Continuar para o cartão' }).click();
  await expect(page.frameLocator('iframe[name="cardNumber"]').locator('input#cardNumber')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await expectNoOverflow(page, 'Brick a 360 px');
  await page.screenshot({ path: path.join(IMG, 'ca32-brick-360.jpg'), type: 'jpeg', quality: 60, fullPage: true });
  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect.poll(async () => (await orderRow(id)).status).not.toBe('pendente');
});
