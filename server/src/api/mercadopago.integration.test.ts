import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { createMercadoPagoGateway } from '../payments/mercadopago';
import { createTicketIssuer } from '../tickets/issuer';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';
const COLLECTOR = '123456789';
const SECRET = 'segredo-de-teste-do-webhook-0123456789abcdef';

/**
 * Mercado Pago FALSO, no formato da API de Orders (respostas como as da documentação e do ambiente de teste). Decide o resultado
 * pelo token do cartão: `tok-aprovado` aprova, `tok-recusado` devolve 402 com a order `failed`, `tok-invalido` devolve 400.
 * Guarda as chaves de idempotência como o Mercado Pago: mesma chave e mesmo corpo devolvem a mesma order; corpo diferente, 409.
 */
function fakeMercadoPago() {
  const orders = new Map<string, any>();
  const keys = new Map<string, { body: string; id: string; status: number }>();
  const created: { key: string; body: any }[] = [];
  let failNext: 'rede' | null = null;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    if (failNext === 'rede') {
      failNext = null;
      throw new TypeError('fetch failed');
    }
    const url = new URL(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (init?.method === 'POST' && url.pathname === '/v1/orders') {
      const raw = String(init.body);
      const key = headers['X-Idempotency-Key']!;
      const seen = keys.get(key);
      if (seen) {
        if (seen.body !== raw) return json(409, { errors: [{ code: 'idempotency_key_already_used' }] });
        return json(
          seen.status,
          seen.status === 402 ? { errors: [{ code: 'failed' }], data: orders.get(seen.id) } : orders.get(seen.id),
        );
      }
      const body = JSON.parse(raw);
      created.push({ key, body });
      const tx = body.transactions.payments[0];
      const pm = tx.payment_method;
      if (pm.token === 'tok-invalido') return json(400, { errors: [{ code: 'property_value' }] });
      const id = `ORDTST01${randomBytes(12).toString('hex').toUpperCase()}`;
      const order: any = {
        id,
        type: 'online',
        external_reference: body.external_reference,
        total_amount: body.total_amount,
        currency: 'BRL',
        user_id: COLLECTOR,
        status: 'action_required',
        status_detail: 'waiting_transfer',
        transactions: {
          payments: [
            {
              id: `PAY01${id.slice(8)}`,
              amount: tx.amount,
              status: 'action_required',
              status_detail: 'waiting_transfer',
              payment_method: { id: pm.id, type: pm.type },
            },
          ],
        },
      };
      let status = 201;
      if (pm.id === 'pix') {
        const seconds = Number(/^PT(\d+)S$/.exec(tx.expiration_time)![1]);
        Object.assign(order.transactions.payments[0], {
          date_of_expiration: new Date(Date.parse('2026-10-10T15:00:00Z') + seconds * 1000).toISOString(),
        });
        Object.assign(order.transactions.payments[0].payment_method, {
          qr_code: '00020126580014br.gov.bcb.pix0136ficticio5204000053039865802BR6304ABCD',
          qr_code_base64: 'iVBORw0KGgo' + 'A'.repeat(120),
        });
      } else if (pm.token === 'tok-aprovado') {
        set(order, 'processed', 'accredited');
      } else if (pm.token === 'tok-recusado') {
        set(order, 'failed', 'insufficient_amount');
        status = 402;
      }
      orders.set(id, order);
      keys.set(key, { body: raw, id, status });
      return json(status, status === 402 ? { errors: [{ code: 'failed' }], data: order } : order);
    }
    const m = /^\/v1\/orders\/(ORD[A-Z0-9]+)$/.exec(url.pathname);
    if ((init?.method ?? 'GET') === 'GET' && m) {
      const order = orders.get(m[1]!);
      return order ? json(200, order) : json(404, { errors: [{ code: 'not_found' }] });
    }
    return json(404, {});
  }) as typeof fetch;

  function set(order: any, status: string, detail: string) {
    order.status = status;
    order.status_detail = status === 'failed' ? 'failed' : detail;
    order.transactions.payments[0].status = status;
    order.transactions.payments[0].status_detail = detail;
  }
  return {
    fetchImpl,
    created,
    orders,
    setStatus: (id: string, status: string, detail: string) => set(orders.get(id), status, detail),
    patch: (id: string, patch: Record<string, unknown>) => Object.assign(orders.get(id), patch),
    failNextWithNetwork: () => {
      failNext = 'rede';
    },
  };
}

describe.skipIf(!ADMIN_URL)('Mercado Pago (API de Orders) de ponta a ponta, com o gateway falso (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  let hash = '';
  let n = 0;
  let mp: ReturnType<typeof fakeMercadoPago>;

  const build = (env: Record<string, string> = {}) => {
    const config = loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none', ...env });
    const gateway = createMercadoPagoGateway({
      accessToken: 'APP_USR-token-ficticio-de-teste-000000',
      publicKey: 'APP_USR-chave-publica-ficticia-0000',
      webhookSecret: SECRET,
      collectorId: COLLECTOR,
      liveMode: false,
      clock,
      http: { fetchImpl: mp.fetchImpl, sleep: async () => {} },
    });
    return createApp({
      config,
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender(), gateway },
      issueTickets: createTicketIssuer(config.qr),
    });
  };
  let app: ReturnType<typeof build>;

  async function buyer(target = app) {
    const i = ++n;
    const email = `mp${i}@exemplo.com`;
    await sql("insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,'cliente')", [
      `Maria ${i} Fictícia`,
      email,
      String(30000000000 + i),
      hash,
    ]);
    let cookie = '';
    let csrf = '';
    const raw = (method: string, path: string, body?: unknown) => {
      const headers: Record<string, string> = { origin: 'http://localhost', 'x-forwarded-for': '203.0.113.8' };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return target.request(`/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    };
    const login = await raw('POST', '/auth/login', { email, password: PASSWORD });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    return { get: (p: string) => raw('GET', p), post: (p: string, b: unknown = {}) => raw('POST', p, b) };
  }

  async function event(total = 10) {
    const slug = `mp-${++n}`;
    const id = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values ($1,'Evento MP','2026-12-12T22:00:00-03:00','Arena','Rua 1','d','Livre','publicado') returning id`,
        [slug],
      )
    ).rows[0].id as string;
    const type = (
      await sql(
        `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'Pista',8000,$2,'2026-10-01T00:00:00-03:00','2026-12-12T20:00:00-03:00') returning id`,
        [id, total],
      )
    ).rows[0].id as string;
    return { slug, type };
  }

  async function newOrder(s: Awaited<ReturnType<typeof buyer>>, e: { slug: string; type: string }, quantity: number) {
    const res = await s.post('/orders', { eventSlug: e.slug, items: [{ ticketTypeId: e.type, quantity }] });
    expect(res.status).toBe(201);
    return ((await res.json()) as { order: { id: string } }).order.id;
  }
  const card = (token: string) => ({
    method: 'cartao',
    cardToken: token,
    paymentMethodId: 'master',
    paymentTypeId: 'credit_card',
    installments: 1,
  });
  const orderRow = async (id: string) =>
    (
      await sql(
        `select o.status, o.gateway_payment_id, o.decline_reason, o.gateway_status_detail, o.payment_attempt,
                (select status from reservations r where r.order_id = o.id limit 1) as reserva
           from orders o where o.id = $1`,
        [id],
      )
    ).rows[0];
  const ticketQrs = async (id: string) =>
    (await sql('select qr_payload from tickets where order_id = $1', [id])).rows.map(r => r.qr_payload as string);

  /** Notificação como o Mercado Pago envia (tópico order), assinada com a assinatura secreta da aplicação. */
  const notify = (gid: string, action: string, over: { secret?: string; ts?: number } = {}) => {
    const ts = String(Math.floor((over.ts ?? clock.now().getTime()) / 1000));
    const rid = randomBytes(8).toString('hex');
    const v1 = createHmac('sha256', over.secret ?? SECRET)
      .update(`id:${gid.toLowerCase()};request-id:${rid};ts:${ts};`)
      .digest('hex');
    const body = JSON.stringify({
      action,
      type: 'order',
      data: { id: gid },
      date_created: `${ts}-${action}`,
      live_mode: false,
    });
    return app.request(`/api/webhooks/payments?data.id=${gid}&type=order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid },
      body,
    });
  };

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    hash = await argon2Hasher.hash(PASSWORD);
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql(
      'truncate payment_events, checkins, tickets, reservations, order_items, orders, ticket_types, events, audit_log, sessions, login_attempts, job_leases, users cascade',
    );
    clock.set('2026-10-10T15:00:00Z');
    mp = fakeMercadoPago();
    app = build();
  });

  it('cartão aprovado com 3 unidades: pedido pago na hora, 3 ingressos com 3 QR distintos (CA-P1, CA-20)', async () => {
    const s = await buyer();
    const e = await event();
    const id = await newOrder(s, e, 3);
    const res = await s.post(`/orders/${id}/payment`, card('tok-aprovado'));
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).payment).toMatchObject({
      method: 'cartao',
      status: 'aprovado',
      declineReason: null,
    });
    expect(await orderRow(id)).toMatchObject({ status: 'pago', reserva: 'convertida' });
    const qrs = await ticketQrs(id);
    expect(qrs).toHaveLength(3);
    expect(new Set(qrs).size).toBe(3);
    // O servidor manda só token, bandeira, tipo e parcelas; o pagador de teste é o da documentação; nada de dado de cartão.
    const sent = mp.created[0]!.body;
    expect(sent.transactions.payments[0].payment_method).toEqual({
      id: 'master',
      type: 'credit_card',
      token: 'tok-aprovado',
      installments: 1,
    });
    expect(sent.payer.email).toBe('test@testuser.com');
    expect(sent.total_amount).toBe('240.00');
    expect(sent.external_reference).toBe(id);
  });

  it('cartão recusado: pedido não pago, motivo guardado, estoque liberado (CA-P2)', async () => {
    const s = await buyer();
    const e = await event(2);
    const id = await newOrder(s, e, 2);
    const res = await s.post(`/orders/${id}/payment`, card('tok-recusado'));
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).payment).toMatchObject({
      status: 'recusado',
      declineReason: 'saldo_insuficiente',
    });
    expect(await orderRow(id)).toMatchObject({
      status: 'nao_concluido',
      decline_reason: 'saldo_insuficiente',
      gateway_status_detail: 'insufficient_amount',
      reserva: 'liberada',
    });
    expect(await ticketQrs(id)).toHaveLength(0);
    const view = (await (await s.get(`/orders/${id}`)).json()) as any;
    expect(view.order.declineReason).toBe('saldo_insuficiente');
    expect(JSON.stringify(view)).not.toContain('insufficient_amount');
    // O estoque voltou: outra pessoa compra as 2 unidades.
    const other = await buyer();
    await newOrder(other, e, 2);
  });

  it('idempotência: falha de rede repete a mesma chave; recusa na criação abre tentativa nova com chave nova', async () => {
    const s = await buyer();
    const e = await event();
    const id = await newOrder(s, e, 1);
    // 1) O gateway recusa criar (token inválido): nada é cobrado, o pedido segue pendente e a tentativa sobe.
    const bad = await s.post(`/orders/${id}/payment`, card('tok-invalido'));
    expect(bad.status).toBe(422);
    expect(await orderRow(id)).toMatchObject({ status: 'pendente', gateway_payment_id: null, payment_attempt: 1 });
    // 2) Nova tentativa: chave nova. A primeira chamada cai na rede e o adaptador repete com a MESMA chave.
    mp.failNextWithNetwork();
    const ok = await s.post(`/orders/${id}/payment`, card('tok-aprovado'));
    expect(ok.status).toBe(201);
    const keys = mp.created.map(c => c.key);
    expect(keys).toEqual([`order:${id}:cartao`, `order:${id}:cartao:1`]);
    expect(await orderRow(id)).toMatchObject({ status: 'pago' });
  });

  it('Pix: vencimento dentro dos limites do gateway; aprovação pelo webhook assinado, com reconsulta; repetição não duplica', async () => {
    const s = await buyer();
    const e = await event();
    const id = await newOrder(s, e, 2);
    const res = await s.post(`/orders/${id}/payment`, { method: 'pix' });
    expect(res.status).toBe(201);
    const payment = ((await res.json()) as any).payment;
    expect(payment.pix.copyPaste).toMatch(/^000201/);
    expect(payment.pix.qrCodeImage).toMatch(/^data:image\/png;base64,/);
    // Reserva de 30 min (D-03); o Pix vence no mínimo do gateway (30 min) mais a folga de 1 min.
    expect(mp.created[0]!.body.transactions.payments[0].expiration_time).toBe('PT1860S');
    const gid = (await orderRow(id)).gateway_payment_id as string;
    mp.setStatus(gid, 'processed', 'accredited');
    const first = await notify(gid, 'order.processed');
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ status: 'processada', outcome: 'confirmado' });
    expect(await orderRow(id)).toMatchObject({ status: 'pago' });
    expect(await ticketQrs(id)).toHaveLength(2);
    const again = await notify(gid, 'order.processed');
    expect(await again.json()).toMatchObject({ status: 'duplicada' });
    expect(await ticketQrs(id)).toHaveLength(2);
  });

  it('Pix vencido no gateway: pedido expirado e estoque devolvido (CA-17)', async () => {
    const s = await buyer();
    const e = await event(2);
    const id = await newOrder(s, e, 2);
    expect((await s.post(`/orders/${id}/payment`, { method: 'pix' })).status).toBe(201);
    const gid = (await orderRow(id)).gateway_payment_id as string;
    mp.setStatus(gid, 'expired', 'expired');
    expect(await (await notify(gid, 'order.expired')).json()).toMatchObject({ outcome: 'expirado' });
    expect(await orderRow(id)).toMatchObject({ status: 'expirado', reserva: 'expirada' });
    await newOrder(await buyer(), e, 2);
  });

  it('assinatura inválida, ts fora da tolerância ou ausente: 401 e só metadados gravados (CA-P4)', async () => {
    const s = await buyer();
    const e = await event();
    const id = await newOrder(s, e, 1);
    expect((await s.post(`/orders/${id}/payment`, { method: 'pix' })).status).toBe(201);
    const gid = (await orderRow(id)).gateway_payment_id as string;
    mp.setStatus(gid, 'processed', 'accredited');
    expect((await notify(gid, 'order.processed', { secret: 'outro-segredo-qualquer-0000' })).status).toBe(401);
    expect((await notify(gid, 'order.processed', { ts: clock.now().getTime() - 10 * 60_000 })).status).toBe(401);
    const missing = await app.request(`/api/webhooks/payments?data.id=${gid}&type=order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(missing.status).toBe(401);
    expect(await orderRow(id)).toMatchObject({ status: 'pendente' });
    const rows = (await sql("select payload_json from payment_events where type = 'invalido' order by received_at"))
      .rows;
    expect(rows.map(r => r.payload_json.motivo)).toEqual([
      'assinatura_invalida',
      'fora_do_prazo',
      'assinatura_ausente',
    ]);
    expect(JSON.stringify(rows)).not.toContain(gid);
  });

  it('notificação autêntica do painel ("Simular notificação", id fictício): 200 e ignorada', async () => {
    const res = await notify('123456', 'order.processed');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ignorada' });
  });

  it('divergência na reconsulta (valor ou conta): não aprova e registra (CA-P3)', async () => {
    const s = await buyer();
    const e = await event();
    const id = await newOrder(s, e, 1);
    expect((await s.post(`/orders/${id}/payment`, { method: 'pix' })).status).toBe(201);
    const gid = (await orderRow(id)).gateway_payment_id as string;
    mp.setStatus(gid, 'processed', 'accredited');
    mp.patch(gid, { total_amount: '1.00' });
    expect(await (await notify(gid, 'order.processed')).json()).toMatchObject({ outcome: 'divergente' });
    mp.patch(gid, { total_amount: '80.00', user_id: '999999999' });
    expect(await (await notify(gid, 'order.updated')).json()).toMatchObject({ outcome: 'divergente' });
    expect(await orderRow(id)).toMatchObject({ status: 'pendente' });
    const audit = (
      await sql("select reason from audit_log where action = 'pagamento.divergente' and entity_id = $1", [id])
    ).rows;
    expect(audit.map(r => r.reason).sort()).toEqual(['conta', 'valor']);
  });

  it('contestação (order.charged_back): pedido contestado e ingressos cancelados', async () => {
    const s = await buyer();
    const e = await event();
    const id = await newOrder(s, e, 2);
    expect((await s.post(`/orders/${id}/payment`, card('tok-aprovado'))).status).toBe(201);
    const gid = (await orderRow(id)).gateway_payment_id as string;
    mp.setStatus(gid, 'charged_back', 'settled');
    expect(await (await notify(gid, 'order.charged_back')).json()).toMatchObject({ outcome: 'contestado' });
    expect(await orderRow(id)).toMatchObject({ status: 'contestado' });
    expect((await sql('select status from tickets where order_id = $1', [id])).rows.map(r => r.status)).toEqual([
      'cancelado',
      'cancelado',
    ]);
  });

  it('dado de cartão no corpo continua recusado antes de qualquer chamada ao gateway', async () => {
    const s = await buyer();
    const e = await event();
    const id = await newOrder(s, e, 1);
    const res = await s.post(`/orders/${id}/payment`, { ...card('tok-aprovado'), cardNumber: '5480832801033311' });
    expect(res.status).toBe(422);
    expect(mp.created).toHaveLength(0);
  });

  it('reserva menor que o mínimo do Pix no gateway: Pix fora das opções e recusado no servidor', async () => {
    app = build({ RESERVATION_MINUTES: '10' });
    const s = await buyer();
    const opts = (await (await s.get('/payments/options')).json()) as any;
    expect(opts.options).toEqual({
      provider: 'mercadopago',
      cardMode: 'token',
      publicKey: 'APP_USR-chave-publica-ficticia-0000',
      maxInstallments: 1,
      pixAvailable: false,
    });
    const e = await event();
    const id = await newOrder(s, e, 1);
    const res = await s.post(`/orders/${id}/payment`, { method: 'pix' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).erro.codigo).toBe('pix_indisponivel');
    expect(mp.created).toHaveLength(0);
  });
});
