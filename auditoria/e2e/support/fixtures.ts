import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test as base, type APIRequestContext, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import {
  acceptPolicy,
  api,
  apiLogin,
  chooseTickets,
  cpfFor,
  expectNoOverflow,
  formatCpf,
  prepareContext,
  reserve,
  sql,
  waitForEmail,
} from '../../../e2e/support/helpers';
import { AUDIT_ROOT, readState, type AuditState, type Buyer } from './state';

export { acceptPolicy, api, apiLogin, chooseTickets, cpfFor, expect, expectNoOverflow, formatCpf, prepareContext, reserve, sql, waitForEmail };
export const S: AuditState = readState();
export const CAPTURAS = path.resolve(AUDIT_ROOT, '../docs/relatorios/capturas');

/** Largura do projeto (chromium-360, webkit-1280...). */
export const widthOf = (info: TestInfo) => Number(/-(\d+)$/.exec(info.project.name)?.[1] ?? 1280);
export const browserOf = (info: TestInfo) => info.project.name.split('-')[0]!;

/** Captura (JPEG) em docs/relatorios/capturas/<pasta>/<nome>-<projeto>.jpg; só nos projetos Chromium, para não multiplicar imagens. */
export async function shot(page: Page, info: TestInfo, folder: string, name: string, opts: { all?: boolean; full?: boolean } = {}) {
  if (!opts.all && browserOf(info) !== 'chromium') return;
  const dir = path.join(CAPTURAS, folder);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}-${info.project.name}.jpg`), type: 'jpeg', quality: 70, fullPage: opts.full ?? false });
}

export const test = base.extend<{ ctx: BrowserContext }>({
  ctx: async ({ context }, use) => {
    await prepareContext(context);
    await use(context);
  },
});

/** Entra pela API com a conta informada e devolve uma página nova do mesmo contexto. */
export async function loginAs(ctx: BrowserContext, who: Buyer | 'admin' | 'validador' | 'validador2'): Promise<Page> {
  const [email, password] = typeof who === 'string' ? [S.team[who].email, S.team[who].password] : [who.email, who.password];
  // O cadastro pela API já abre sessão; com sessão, toda mutação exige o token CSRF. Começa do zero antes de entrar.
  await ctx.clearCookies();
  await apiLogin(ctx.request, S.base, email, password);
  return ctx.newPage();
}

let seq = 0;
/** Cria um comprador novo pela API (adulto por padrão) e devolve as credenciais. */
export async function newBuyer(request: APIRequestContext, opts: { birth?: string; name?: string } = {}): Promise<Buyer> {
  const n = Date.now() % 100_000_000 + ++seq;
  const email = `novo.${n}@auditoria.test`;
  const cpf = cpfFor(n % 900_000_000);
  const legal = (await (await request.get(`${S.base}/api/legal/versions`)).json()) as { terms: string; privacy: string };
  const r = await api(request, S.base, 'POST', '/auth/register', {
    name: opts.name ?? `Novo Comprador ${n} Fictício`,
    email,
    cpf,
    phone: '(11) 98765-4321',
    birthDate: opts.birth ?? '1991-04-04',
    password: 'festa2026Forte',
    acceptedTermsVersion: legal.terms,
    acceptedPrivacyVersion: legal.privacy,
    accept: true,
  });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return { id: r.json?.user?.id ?? '', name: opts.name ?? `Novo Comprador ${n} Fictício`, email, cpf, birth: opts.birth ?? '1991-04-04', password: 'festa2026Forte' };
}

export async function legalVersions(request: APIRequestContext) {
  return (await (await request.get(`${S.base}/api/legal/versions`)).json()) as Record<string, string | null>;
}

/** Pedido pela API, já com a Política aceita. Devolve a resposta inteira (status e json). */
export async function createOrder(request: APIRequestContext, slug: string, items: { ticketTypeId: string; quantity: number }[], extra: Record<string, unknown> = {}) {
  const legal = await legalVersions(request);
  return api(request, S.base, 'POST', '/orders', {
    eventSlug: slug,
    items,
    couponCode: null,
    cancellationAccepted: true,
    cancellationVersion: legal.cancellation ?? legal.cancellationPolicy ?? null,
    ...extra,
  });
}

/** Pedido pago pela API com o gateway fictício (Pix aprovado pelo caminho do webhook). */
export async function buyPaid(request: APIRequestContext, slug: string, items: { ticketTypeId: string; quantity: number }[]) {
  const created = await createOrder(request, slug, items);
  expect(created.status, JSON.stringify(created.json)).toBe(201);
  const orderId = created.json.order.id as string;
  const pay = await api(request, S.base, 'POST', `/orders/${orderId}/payment`, { method: 'pix' });
  expect(pay.status, JSON.stringify(pay.json)).toBe(201);
  await mockStatus(request, orderId, 'aprovado');
  await expect.poll(async () => (await sql<{ status: string }>(S.db, `select status from orders where id = $1`, [orderId]))[0]?.status).toBe('pago');
  const tickets = await sql<{ id: string; short_code: string; qr_payload: string; status: string }>(
    S.db,
    `select id, short_code, qr_payload, status from tickets where order_id = $1 order by unit_index`,
    [orderId],
  );
  return { orderId, tickets };
}

export type MockStatus = 'aprovado' | 'recusado' | 'expirado' | 'cancelado' | 'estornado' | 'contestado';
/** Leva o pagamento fictício do pedido ao estado e entrega a notificação assinada pelo caminho do webhook. */
export async function mockStatus(request: APIRequestContext, orderId: string, status: MockStatus) {
  const res = await request.post(`${S.base}/api/dev/mock-gateway/${orderId}/${status}`);
  const json = await res.json().catch(() => null);
  return { status: res.status(), json };
}

/** Adianta o prazo da reserva no banco de teste (só o relógio muda; a expiração é a do servidor). */
export async function expireReservation(orderId: string) {
  await sql(S.db, `update reservations set expires_at = now() - interval '1 second' where order_id = $1`, [orderId]);
}

export const orderRow = async (orderId: string) =>
  (
    await sql<{ status: string; paid_at: Date | null; total_cents: number; service_fee_cents: number; number: number }>(
      S.db,
      `select status, paid_at, total_cents, service_fee_cents, number from orders where id = $1`,
      [orderId],
    )
  )[0]!;
export const ticketsOf = (orderId: string) =>
  sql<{ id: string; status: string; qr_payload: string; short_code: string; holder_user_id: string }>(
    S.db,
    `select id, status, qr_payload, short_code, holder_user_id from tickets where order_id = $1 order by unit_index`,
    [orderId],
  );
export const typeRow = async (typeId: string) =>
  (
    await sql<{ total: number; sold: number; reserved: number }>(
      S.db,
      `select t.quantity_total as total, t.quantity_sold as sold,
              coalesce((select sum(r.quantity) from reservations r where r.ticket_type_id = t.id and r.status = 'ativa' and r.expires_at > now()), 0)::int as reserved
         from ticket_types t where t.id = $1`,
      [typeId],
    )
  )[0]!;

/** E-mails capturados pelo servidor local (.data/emails): texto e HTML do envio real. */
export function capturedEmails(filter: { to?: string; template?: string } = {}) {
  const dir = path.join(S.serverDir, '.data/emails');
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.txt'));
  } catch {
    return [];
  }
  return files
    .map(f => {
      const txt = readFileSync(path.join(dir, f), 'utf8');
      let html = '';
      try {
        html = readFileSync(path.join(dir, f.replace(/\.txt$/, '.html')), 'utf8');
      } catch {
        html = '';
      }
      const to = /^Para: (.*)$/m.exec(txt)?.[1]?.trim() ?? '';
      const subject = /^Assunto: (.*)$/m.exec(txt)?.[1]?.trim() ?? '';
      const template = /-([a-z_]+)\.txt$/.exec(f)?.[1] ?? '';
      return { file: f, to, subject, template, txt, html };
    })
    .filter(m => (!filter.to || m.to === filter.to) && (!filter.template || m.template === filter.template));
}

export const brl = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
export const day = (offset: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + offset * 86_400_000));
