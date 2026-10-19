import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { processOutbox } from '../mail/outbox';
import { createMockGateway, type MockGateway } from '../payments/mockGateway';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { createTicketIssuer } from '../tickets/issuer';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';

/**
 * Taxa de serviço da PartyX (D-90), de ponta a ponta, com 5% e mínimo 0 gravados como o painel gravaria (a migração deixa 0%): página do evento, resumo,
 * pedido (taxa por ingresso e por lote, guardada no pedido), mudança da taxa com pedido já feito, Pix e cartão com o mesmo total,
 * e-mail de compra, Meus ingressos, painel, relatório de vendas e tarifa do gateway lida pela rotina diária.
 */
describe.skipIf(!ADMIN_URL)('taxa de serviço (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  let mock: MockGateway;
  let mailer: MemoryEmailSender;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  let hash = '';
  let n = 0;
  const config = loadConfig({
    APP_ENV: 'local',
    PAYMENT_GATEWAY: 'none',
    RESERVATION_MINUTES: '30',
    PUBLIC_BASE_URL: 'https://partyx.exemplo.test',
  });
  const json = async <T = any>(res: Response) => (await res.json()) as T;
  const code = async (res: Response) => (await json(res)).erro.codigo as string;

  async function session(role: 'administrador' | 'cliente' = 'cliente') {
    const i = ++n;
    const email = `${role}${i}@partyx.test`;
    await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5)', [
      `Pessoa ${i} Teste`,
      email,
      role === 'cliente' ? String(52000000000 + i) : null,
      hash,
      role,
    ]);
    let cookie = '';
    let csrf = '';
    const raw = (method: string, path: string, body?: unknown) => {
      const headers: Record<string, string> = { origin: 'http://localhost', 'x-forwarded-for': `203.0.113.${i % 250}` };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return app.request(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    };
    const login = await raw('POST', '/auth/login', { email, password: PASSWORD });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    return {
      raw,
      get: (p: string) => raw('GET', p),
      post: (p: string, b: unknown = {}) => raw('POST', p, b),
      put: (p: string, b: unknown) => raw('PUT', p, b),
      patch: (p: string, b: unknown) => raw('PATCH', p, b),
    };
  }
  type Session = Awaited<ReturnType<typeof session>>;

  /** Evento publicado com um tipo, montado pelo painel (o tipo nasce com o "Lote único"; outros lotes são criados). */
  async function setup(a: Session, lots: { price: number; quantity: number }[]) {
    const ev = (
      await json(
        await a.post('/admin/events', {
          name: `Festa da Taxa ${++n}`,
          startsAt: '2026-12-12T22:00:00-03:00',
          venue: 'Arena',
          address: 'Rua 1',
          description: 'Evento de teste, dados fictícios.',
          ageRating: '18 anos',
        }),
      )
    ).event as { id: string; slug: string };
    const type = (
      await json(
        await a.post(`/admin/events/${ev.id}/ticket-types`, {
          name: 'Pista',
          priceCents: lots[0]!.price,
          quantityTotal: lots.reduce((t, l) => t + l.quantity, 0),
          salesStartAt: '2026-10-01T00:00:00-03:00',
          salesEndAt: '2026-12-12T20:00:00-03:00',
        }),
      )
    ).ticketType as { id: string; lots: { id: string }[] };
    if (lots.length > 1) {
      expect((await a.patch(`/admin/lots/${type.lots[0]!.id}`, { quantity: lots[0]!.quantity })).status).toBe(200);
      for (const l of lots.slice(1))
        expect((await a.post(`/admin/ticket-types/${type.id}/lots`, { priceCents: l.price, quantity: l.quantity })).status).toBe(201);
    }
    expect((await a.post(`/admin/events/${ev.id}/publish`)).status).toBe(200);
    return { eventId: ev.id, slug: ev.slug, typeId: type.id };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;
  const items = (s: Setup, quantity: number) => [{ ticketTypeId: s.typeId, quantity }];
  const buy = (b: Session, s: Setup, quantity: number, expectedTotalCents?: number) =>
    b.post('/orders', {
      cancellationAccepted: true,
      cancellationVersion: 'ficticio-0',
      eventSlug: s.slug,
      items: items(s, quantity),
      ...(expectedTotalCents === undefined ? {} : { expectedTotalCents }),
    });
  const orderRow = async (id: string) =>
    (
      await sql(
        'select total_cents, service_fee_cents, service_fee_rate_bps, service_fee_min_cents, gateway_fee_cents, gateway_net_cents from orders where id = $1',
        [id],
      )
    ).rows[0];
  async function pay(b: Session, orderId: string, method: 'pix' | 'cartao' = 'pix') {
    expect((await b.post(`/orders/${orderId}/payment`, { method })).status).toBe(201);
    const paymentId = (await sql('select gateway_payment_id from orders where id = $1', [orderId])).rows[0]
      .gateway_payment_id as string;
    mock.simulate.setStatus(paymentId, 'aprovado');
    const body = JSON.stringify({ id: `evt_${randomBytes(6).toString('hex')}`, paymentId, type: 'payment.approved' });
    const res = await app.request('/api/webhooks/payments', {
      method: 'POST',
      headers: { 'x-mock-signature': mock.simulate.sign(body) },
      body,
    });
    expect(res.status).toBe(200);
  }

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!, { serviceFee: { rateBps: 500, minCents: 0 } });
    hash = await argon2Hasher.hash(PASSWORD);
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql(
      'truncate payment_events, email_log, checkins, tickets, order_item_lots, reservations, order_items, orders, ticket_lots, ticket_types, events, audit_log, sessions, login_attempts, users cascade',
    );
    // O `truncate users cascade` leva junto a linha da taxa (ela aponta para quem mudou por último): volta aos 5% do teste.
    await sql(
      'insert into service_fee_settings (id, rate_bps, min_cents) values (1, 500, 0) on conflict (id) do update set rate_bps = 500, min_cents = 0, updated_by = null',
    );
    clock.set('2026-10-10T15:00:00Z');
    mock = createMockGateway(clock);
    mailer = new MemoryEmailSender();
    app = createApp({
      config,
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer, gateway: mock },
      issueTickets: createTicketIssuer(config.qr),
      jobAuth: { verify: async h => h === 'Bearer ok' },
    });
  });

  it('o banco do teste tem 5% e mínimo 0 (a migração 0017 grava 0%: a produção nasce sem taxa, ver schema.integration.test.ts)', async () => {
    expect((await sql('select rate_bps, min_cents, updated_by from service_fee_settings')).rows).toEqual([
      { rate_bps: 500, min_cents: 0, updated_by: null },
    ]);
  });

  it('página do evento: valor e taxa de cada tipo; formas de pagamento que o checkout aceita (Pix, cartão, à vista)', async () => {
    const s = await setup(await session('administrador'), [{ price: 3000, quantity: 10 }]);
    const { event } = await json(await app.request(`/api/public/events/${s.slug}`));
    expect(event.ticketTypes[0]).toMatchObject({ priceCents: 3000, serviceFeeCents: 158 });
    expect((await json(await app.request('/api/public/site'))).payment).toEqual({ pix: true, card: true, maxInstallments: 1 });
  });

  it('resumo e pedido: R$ 30,00 + R$ 1,58 por ingresso; taxa, porcentagem e mínimo guardados no pedido, no item e no lote', async () => {
    const s = await setup(await session('administrador'), [{ price: 3000, quantity: 10 }]);
    const b = await session();
    const { summary } = await json(await b.post('/checkout/quote', { eventSlug: s.slug, items: items(s, 2) }));
    expect(summary).toMatchObject({ ticketsCents: 6000, serviceFeeCents: 316, totalCents: 6316 });
    const res = await buy(b, s, 2, 6316);
    expect(res.status).toBe(201);
    const { order } = await json(res);
    expect(order).toMatchObject({ ticketsCents: 6000, serviceFeeCents: 316, totalCents: 6316 });
    expect(order.items[0]).toMatchObject({ subtotalCents: 6000, serviceFeeCents: 316 });
    expect(order.items[0].lots).toEqual([expect.objectContaining({ unitPriceCents: 3000, unitServiceFeeCents: 158, quantity: 2 })]);
    expect(await orderRow(order.id)).toMatchObject({
      total_cents: 6316,
      service_fee_cents: 316,
      service_fee_rate_bps: 500,
      service_fee_min_cents: 0,
      gateway_fee_cents: null,
    });
    expect((await sql('select service_fee_cents from order_items where order_id = $1', [order.id])).rows).toEqual([
      { service_fee_cents: 316 },
    ]);
    expect((await sql('select unit_service_fee_cents from order_item_lots where order_id = $1', [order.id])).rows).toEqual([
      { unit_service_fee_cents: 158 },
    ]);
  });

  it('compra dividida entre lotes: cada ingresso paga a taxa do preço do lote dele (R$ 1,58 e R$ 2,11)', async () => {
    const s = await setup(await session('administrador'), [
      { price: 3000, quantity: 1 },
      { price: 4000, quantity: 5 },
    ]);
    const { order } = await json(await buy(await session(), s, 2));
    expect(order).toMatchObject({ ticketsCents: 7000, serviceFeeCents: 158 + 211, totalCents: 7000 + 369 });
    expect(order.items[0].lots.map((l: { unitServiceFeeCents: number }) => l.unitServiceFeeCents)).toEqual([158, 211]);
  });

  it('mudar a taxa no painel não altera o pedido já feito (nem o valor cobrado); o resumo novo usa a nova e o total antigo é recusado', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ price: 3000, quantity: 10 }]);
    const b1 = await session();
    const { order } = await json(await buy(b1, s, 2));
    const changed = await a.put('/admin/settings/service-fee', { rateBps: 1000, minCents: 0 });
    expect(changed.status).toBe(200);
    // O evento está à venda: a resposta traz a contagem (o painel avisa) e a trilha guarda a contagem e o motivo.
    expect((await json(changed)).serviceFee).toMatchObject({
      rateBps: 1000,
      minCents: 0,
      updatedBy: expect.stringMatching(/Teste/),
      eventsOnSale: 1,
    });
    expect((await sql("select before_json, after_json, reason from audit_log where action = 'taxa_servico.alterar'")).rows).toEqual([
      {
        before_json: { rateBps: 500, minCents: 0 },
        after_json: { rateBps: 1000, minCents: 0, eventsOnSale: 1 },
        reason: 'Taxa alterada com 1 evento à venda: vale só para os pedidos feitos a partir deste momento; os pedidos já feitos mantêm a taxa deles.',
      },
    ]);

    // O pedido feito antes continua com a taxa dele, e é esse valor que vai ao gateway.
    expect((await json(await b1.get(`/orders/${order.id}`))).order).toMatchObject({ serviceFeeCents: 316, totalCents: 6316 });
    expect((await b1.post(`/orders/${order.id}/payment`, { method: 'pix' })).status).toBe(201);
    expect(mock.simulate.all().map(p => p.amountCents)).toEqual([6316]);
    expect(await orderRow(order.id)).toMatchObject({ service_fee_cents: 316, service_fee_rate_bps: 500 });

    // 10%: 3000 × 1000 / 9000 = 333,33 → 334 por ingresso.
    const b2 = await session();
    expect((await json(await b2.post('/checkout/quote', { eventSlug: s.slug, items: items(s, 2) }))).summary).toMatchObject({
      serviceFeeCents: 668,
      totalCents: 6668,
    });
    const stale = await buy(b2, s, 2, 6316);
    expect(stale.status).toBe(409);
    expect(await code(stale)).toBe('preco_alterado');
  });

  it('Pix e cartão: o mesmo total (ingressos mais taxa) vai ao gateway', async () => {
    const s = await setup(await session('administrador'), [{ price: 3000, quantity: 10 }]);
    const pix = await session();
    const card = await session();
    const o1 = (await json(await buy(pix, s, 2))).order;
    const o2 = (await json(await buy(card, s, 2))).order;
    expect((await pix.post(`/orders/${o1.id}/payment`, { method: 'pix' })).status).toBe(201);
    expect((await card.post(`/orders/${o2.id}/payment`, { method: 'cartao' })).status).toBe(201);
    expect(
      mock.simulate
        .all()
        .map(p => [p.method, p.amountCents])
        .sort(),
    ).toEqual([
      ['cartao', 6316],
      ['pix', 6316],
    ]);
  });

  it('pago: e-mail de compra com valor dos ingressos, taxa e total; Meus ingressos com o valor e a taxa de cada ingresso', async () => {
    const s = await setup(await session('administrador'), [{ price: 3000, quantity: 10 }]);
    const b = await session();
    const { order } = await json(await buy(b, s, 2));
    await pay(b, order.id);
    await processOutbox({ db: createDrizzle(testDb.pool), clock, mailer, config });
    const mail = mailer.last('compra_confirmada')!;
    expect(mail.text).toMatch(/Valor dos ingressos\W+R\$\s60,00/);
    expect(mail.text).toMatch(/Taxa de serviço\W+R\$\s3,16/);
    expect(mail.text).toMatch(/Total pago\W+R\$\s63,16/);
    expect(mail.text).not.toContain('Mercado Pago cobra');
    const { tickets } = await json(await b.get('/tickets'));
    expect(tickets).toHaveLength(2);
    for (const t of tickets) expect(t).toMatchObject({ priceCents: 3000, serviceFeeCents: 158 });
    const pdf = await b.get(`/orders/${order.id}/tickets.pdf`);
    expect([200, 404]).toContain(pdf.status); // o PDF do pedido (quando a rota existe) é conferido em pdf.test.ts
  });

  it('painel: detalhe do pedido com a taxa, a porcentagem e o reembolso; relatório confere com a taxa; tarifa do gateway pela rotina', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ price: 3000, quantity: 10 }]);
    const b = await session();
    const { order } = await json(await buy(b, s, 2));
    await pay(b, order.id);

    const detail = (await json(await a.get(`/admin/orders/${order.id}`))).order;
    expect(detail).toMatchObject({
      ticketsCents: 6000,
      serviceFeeCents: 316,
      serviceFeeRateBps: 500,
      serviceFeeMinCents: 0,
      totalCents: 6316,
      refundCents: 6316,
      gatewayFeeCents: null,
    });
    expect(detail.items[0]).toMatchObject({ unitPriceCents: 3000, unitServiceFeeCents: 158, serviceFeeCents: 316 });
    for (const t of detail.tickets) expect(t).toMatchObject({ priceCents: 3000, serviceFeeCents: 158 });

    // A rotina diária lê a tarifa do gateway (fictício: Pix 0,99% de 63,16 = 0,63) de pedido pago há mais de 10 minutos.
    clock.set('2026-10-10T15:11:00Z');
    const job = await app.request('/api/internal/jobs/reconcile-payments', { method: 'POST', headers: { authorization: 'Bearer ok' } });
    expect(job.status).toBe(200);
    expect((await json(job)).summary.fees).toEqual({ checked: 1, filled: 1, failed: 0 });
    expect(await orderRow(order.id)).toMatchObject({ gateway_fee_cents: 63, gateway_net_cents: 6253 });

    const report = await json(await a.get('/admin/reports/sales?from=2026-10-01&to=2026-10-31'));
    expect(report.totals).toMatchObject({
      tickets: 2,
      cents: 6000,
      serviceFeeCents: 316,
      chargedCents: 6316,
      gatewayFeeCents: 63,
      gatewayNetCents: 6253,
      ordersWithoutGatewayFee: 0,
    });
    expect(report.reconciliation).toMatchObject({ ok: true, ordersCents: 6316, itemsCents: 6000, serviceFeeCents: 316 });
    expect(report.lines[0]).toMatchObject({ cents: 6000, serviceFeeCents: 316 });
    expect(report.reversals).toMatchObject({ netCents: 6316, grossCents: 6316 });

    const csv = await (await a.get('/admin/exports/sales.csv?from=2026-10-01&to=2026-10-31')).text();
    expect(csv).toContain('Taxa de serviço (R$)');
    expect(csv).toContain('Tarifa do Mercado Pago (R$)');
    expect(csv).toMatch(/TOTAL;;;2;60,00;3,16;63,16/);
  });

  it('configurações: só o administrador vê e muda; limites de 0% a 20% e mínimo até R$ 50,00; 0% esconde a taxa', async () => {
    const a = await session('administrador');
    // Sem evento à venda: a contagem é 0 e a mudança vai para a trilha sem motivo.
    expect((await json(await a.get('/admin/settings/service-fee'))).serviceFee).toMatchObject({ rateBps: 500, minCents: 0, eventsOnSale: 0 });
    expect((await a.put('/admin/settings/service-fee', { rateBps: 500, minCents: 0 })).status).toBe(200);
    expect((await sql("select after_json, reason from audit_log where action = 'taxa_servico.alterar'")).rows).toEqual([
      { after_json: { rateBps: 500, minCents: 0, eventsOnSale: 0 }, reason: null },
    ]);
    const s = await setup(a, [{ price: 3000, quantity: 10 }]);
    const b = await session();
    expect((await b.get('/admin/settings/service-fee')).status).toBe(403);
    expect((await b.put('/admin/settings/service-fee', { rateBps: 0, minCents: 0 })).status).toBe(403);
    expect((await json(await a.get('/admin/settings/service-fee'))).serviceFee).toMatchObject({
      rateBps: 500,
      minCents: 0,
      updatedBy: expect.stringMatching(/Teste/),
      eventsOnSale: 1,
    });
    for (const bad of [
      { rateBps: 2001, minCents: 0 },
      { rateBps: -1, minCents: 0 },
      { rateBps: 500, minCents: 5001 },
      { rateBps: 2.5, minCents: 0 },
    ])
      expect((await a.put('/admin/settings/service-fee', bad)).status, JSON.stringify(bad)).toBe(422);

    expect((await a.put('/admin/settings/service-fee', { rateBps: 0, minCents: 0 })).status).toBe(200);
    const { event } = await json(await app.request(`/api/public/events/${s.slug}`));
    expect(event.ticketTypes[0]).toMatchObject({ priceCents: 3000, serviceFeeCents: 0 });
    const { order } = await json(await buy(b, s, 2));
    expect(order).toMatchObject({ ticketsCents: 6000, serviceFeeCents: 0, totalCents: 6000 });

    // Mínimo maior que a conta: vale o mínimo (R$ 2,00 por ingresso).
    expect((await a.put('/admin/settings/service-fee', { rateBps: 500, minCents: 200 })).status).toBe(200);
    expect((await json(await app.request(`/api/public/events/${s.slug}`))).event.ticketTypes[0].serviceFeeCents).toBe(200);
  });
});
