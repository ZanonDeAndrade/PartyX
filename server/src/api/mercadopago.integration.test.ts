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
import { runReconciliation } from '../payments/notifications';
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
    if ((init?.method ?? 'GET') === 'GET' && url.pathname === '/v1/orders') {
      // Busca: o Mercado Pago exige o período; aqui só a referência importa.
      if (!url.searchParams.get('begin_date') || !url.searchParams.get('end_date'))
        return json(400, { errors: [{ code: 'missing_required_params' }] });
      const ref = url.searchParams.get('external_reference');
      const data = [...orders.values()].filter(o => !ref || o.external_reference === ref);
      return json(200, { data, paging: { total: String(data.length), total_pages: '1', offset: '0', limit: '50' } });
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
  /** Order criada fora da plataforma (para simular a resposta de criação perdida), já no estado pedido. */
  function external(ref: string, amount: string, status: string, method: { id: string; type: string }) {
    const id = `ORDTST01${randomBytes(12).toString('hex').toUpperCase()}`;
    const order: any = {
      id,
      external_reference: ref,
      total_amount: amount,
      currency: 'BRL',
      user_id: COLLECTOR,
      transactions: { payments: [{ id: `PAY01${id.slice(8)}`, amount, payment_method: method }] },
    };
    set(order, status, status === 'processed' ? 'accredited' : 'waiting_transfer');
    orders.set(id, order);
    return id;
  }
  /** A próxima criação chega ao Mercado Pago, mas a resposta se perde (nas duas tentativas do adaptador). */
  let loseResponses = 0;
  const lossyFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const res = await fetchImpl(input, init);
    if (loseResponses > 0 && init?.method === 'POST') {
      loseResponses--;
      throw Object.assign(new Error('tempo esgotado'), { name: 'TimeoutError' });
    }
    return res;
  }) as typeof fetch;
  return {
    fetchImpl: lossyFetch,
    loseNextCreation: () => {
      loseResponses = 2;
    },
    external,
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

  async function buyer(target = app, role: 'cliente' | 'administrador' = 'cliente') {
    const i = ++n;
    const email = `mp${i}@partyx.test`;
    await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5)', [
      `Maria ${i} Fictícia`,
      email,
      String(30000000000 + i),
      hash,
      role,
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

  it('resposta da criação perdida e nova tentativa com token novo (409): acha a cobrança e não cobra de novo', async () => {
    const s = await buyer();
    const e = await event();
    const id = await newOrder(s, e, 1);
    mp.loseNextCreation();
    expect((await s.post(`/orders/${id}/payment`, card('tok-aprovado'))).status).toBe(503);
    expect(await orderRow(id)).toMatchObject({ status: 'pendente', gateway_payment_id: null, payment_attempt: 0 });
    // Token novo, mesma chave: 409 no Mercado Pago. Antes, era "recusa" e abria tentativa nova (segunda cobrança).
    const retry = await s.post(`/orders/${id}/payment`, card('tok-aprovado-2'));
    expect(retry.status).toBe(201);
    expect(((await retry.json()) as any).payment).toMatchObject({ status: 'aprovado' });
    expect(mp.created).toHaveLength(1); // uma única order criada
    expect(await orderRow(id)).toMatchObject({ status: 'pago', payment_attempt: 0 });
    expect(await ticketQrs(id)).toHaveLength(1);
  });

  it('409 sem a cobrança aparecer na busca: pede para esperar, sem tentativa nova', async () => {
    const s = await buyer();
    const e = await event();
    const id = await newOrder(s, e, 1);
    mp.loseNextCreation();
    expect((await s.post(`/orders/${id}/payment`, card('tok-aprovado'))).status).toBe(503);
    const lost = [...mp.orders.keys()][0]!;
    mp.orders.get(lost).external_reference = 'ainda-nao-indexada';
    const res = await s.post(`/orders/${id}/payment`, card('tok-aprovado-2'));
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).erro.codigo).toBe('pagamento_em_verificacao');
    expect(await orderRow(id)).toMatchObject({ status: 'pendente', gateway_payment_id: null, payment_attempt: 0 });
    mp.orders.get(lost).external_reference = id;
    expect((await s.post(`/orders/${id}/payment`, card('tok-aprovado-3'))).status).toBe(201);
    expect(mp.created).toHaveLength(1);
    expect(await orderRow(id)).toMatchObject({ status: 'pago' });
  });

  it('cobrança órfã: vinculada pelo webhook se conferir; valor errado não vincula; segunda cobrança vira alerta', async () => {
    const s = await buyer();
    const e = await event();
    const pix = { id: 'pix', type: 'bank_transfer' };
    // a) Órfã correta: vincula e emite.
    const a = await newOrder(s, e, 1);
    const ga = mp.external(a, '80.00', 'processed', pix);
    expect(await (await notify(ga, 'order.processed')).json()).toMatchObject({ outcome: 'confirmado' });
    expect(await orderRow(a)).toMatchObject({ status: 'pago', gateway_payment_id: ga });
    expect(await ticketQrs(a)).toHaveLength(1);
    // b) Valor errado: não vincula; divergência na trilha.
    const b = await newOrder(s, e, 1);
    const gb = mp.external(b, '1.00', 'processed', pix);
    expect(await (await notify(gb, 'order.processed')).json()).toMatchObject({ outcome: 'divergente' });
    expect(await orderRow(b)).toMatchObject({ status: 'pendente', gateway_payment_id: null });
    // c) Segunda cobrança aprovada para o pedido já pago: nada emitido, trilha uma vez.
    const gc = mp.external(a, '80.00', 'processed', pix);
    expect(await (await notify(gc, 'order.processed')).json()).toMatchObject({ outcome: 'cobranca_duplicada' });
    expect(await (await notify(gc, 'order.updated')).json()).toMatchObject({ outcome: 'cobranca_duplicada' });
    expect(await orderRow(a)).toMatchObject({ gateway_payment_id: ga });
    expect(await ticketQrs(a)).toHaveLength(1);
    const trail = await sql("select count(*)::int as n from audit_log where action = 'pagamento.cobranca_duplicada'");
    expect(trail.rows[0].n).toBe(1);
    // d) Referência que não é pedido: nada.
    const gd = mp.external('nao-e-pedido', '80.00', 'processed', pix);
    expect(await (await notify(gd, 'order.processed')).json()).toMatchObject({ outcome: 'sem_pedido' });
  });

  it('cobrança em dobro aparece em Exceções e é marcada como tratada com motivo, sem mudar pedido nem ingressos (D-83)', async () => {
    const s = await buyer();
    const adm = await buyer(app, 'administrador');
    const e = await event();
    const pix = { id: 'pix', type: 'bank_transfer' };
    const id = await newOrder(s, e, 2);
    const ga = mp.external(id, '160.00', 'processed', pix);
    expect(await (await notify(ga, 'order.processed')).json()).toMatchObject({ outcome: 'confirmado' });
    const gd = mp.external(id, '160.00', 'processed', pix);
    expect(await (await notify(gd, 'order.processed')).json()).toMatchObject({ outcome: 'cobranca_duplicada' });

    // Comprador não vê Exceções.
    expect((await s.get('/admin/payments/exceptions')).status).toBe(403);
    const list = async () => (await (await adm.get('/admin/payments/exceptions')).json()) as any;
    const before = await list();
    expect(before.duplicadasAbertas).toBe(1);
    const item = before.cobrancasDuplicadas.find((c: any) => c.orderId === id);
    expect(item).toMatchObject({
      totalCents: 16000,
      gatewayRef: ga,
      duplicateRef: gd,
      duplicateStatus: 'aprovado',
      treated: null,
    });
    expect(item.buyerCpf).toMatch(/^\*\*\*\./); // CPF sempre mascarado

    const treat = (charge: string, reason: string) =>
      adm.post(`/admin/payments/exceptions/${id}/duplicates/${charge}/treat`, { reason });
    expect(
      (await s.post(`/admin/payments/exceptions/${id}/duplicates/${gd}/treat`, { reason: 'estornado' })).status,
    ).toBe(403);
    expect((await treat(gd, 'ok')).status).toBe(422); // motivo curto
    expect((await treat(ga, 'cobrança do próprio pedido')).status).toBe(409); // não é a cobrança em dobro
    expect((await treat('nao..valida', 'qualquer motivo')).status).toBe(404);
    const ok = await treat(gd, '  Estornado   no painel do Mercado Pago ');
    expect(ok.status).toBe(200);
    expect((await treat(gd, 'de novo, outro admin')).status).toBe(409);

    const after = await list();
    expect(after.duplicadasAbertas).toBe(0);
    expect(after.cobrancasDuplicadas.find((c: any) => c.orderId === id).treated).toMatchObject({
      reason: 'Estornado no painel do Mercado Pago',
      by: expect.stringContaining('Fictícia'),
    });
    // Só uma linha na trilha: o pedido, a cobrança vinculada e os ingressos não mudam.
    expect(await orderRow(id)).toMatchObject({ status: 'pago', gateway_payment_id: ga });
    expect(await ticketQrs(id)).toHaveLength(2);
    const trail = await sql(
      "select count(*)::int as n from audit_log where action = 'pagamento.cobranca_duplicada_tratada' and entity_id = $1",
      [id],
    );
    expect(trail.rows[0].n).toBe(1);
  });

  it('estorno com o webhook perdido: a rotina diária reconsulta pedidos pagos e cancela; paid_at fica', async () => {
    const s = await buyer();
    const e = await event();
    const id = await newOrder(s, e, 2);
    expect((await s.post(`/orders/${id}/payment`, card('tok-aprovado'))).status).toBe(201);
    const paidAt = (await sql('select paid_at from orders where id = $1', [id])).rows[0].paid_at;
    mp.setStatus((await orderRow(id)).gateway_payment_id, 'refunded', 'refunded');
    const deps = {
      db: createDrizzle(testDb.pool),
      clock,
      gateway: createMercadoPagoGateway({
        accessToken: 'APP_USR-token-ficticio-de-teste-000000',
        publicKey: 'APP_USR-chave-publica-ficticia-0000',
        webhookSecret: SECRET,
        collectorId: COLLECTOR,
        liveMode: false,
        clock,
        http: { fetchImpl: mp.fetchImpl, sleep: async () => {} },
      }),
    };
    // Recém-conferido: a passagem pelos pagos respeita o intervalo (20 h no padrão).
    expect((await runReconciliation(deps)).paid.checked).toBe(0);
    const summary = await runReconciliation(deps, { reversalIntervalSeconds: 0 });
    expect(summary.paid.outcomes).toEqual({ estornado: 1 });
    expect(await orderRow(id)).toMatchObject({ status: 'estornado' });
    expect((await sql('select status from tickets where order_id = $1', [id])).rows.map(r => r.status)).toEqual([
      'cancelado',
      'cancelado',
    ]);
    expect((await sql('select paid_at from orders where id = $1', [id])).rows[0].paid_at).toEqual(paidAt);
  });

  it('estorno parcial no painel (order segue processed, partially_refunded): nada cancelado, trilha e alerta uma vez', async () => {
    const s = await buyer();
    const e = await event();
    const id = await newOrder(s, e, 2);
    expect((await s.post(`/orders/${id}/payment`, card('tok-aprovado'))).status).toBe(201);
    const gid = (await orderRow(id)).gateway_payment_id as string;
    mp.setStatus(gid, 'processed', 'partially_refunded');
    expect(await (await notify(gid, 'order.refunded')).json()).toMatchObject({ outcome: 'ignorado' });
    expect(await (await notify(gid, 'order.updated')).json()).toMatchObject({ outcome: 'ignorado' });
    expect(await orderRow(id)).toMatchObject({ status: 'pago' });
    expect((await sql('select status from tickets where order_id = $1', [id])).rows.map(r => r.status)).toEqual([
      'valido',
      'valido',
    ]);
    const trail = await sql(
      "select count(*)::int as n, max(reason) as reason from audit_log where action = 'pagamento.estorno_parcial' and entity_id = $1",
      [id],
    );
    expect(trail.rows[0].n).toBe(1);
    // D-82: o alerta orienta o cancelamento manual pelo ADM15; nada é cancelado sozinho.
    expect(trail.rows[0].reason).toMatch(/cancele manualmente.*ADM15/);
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
