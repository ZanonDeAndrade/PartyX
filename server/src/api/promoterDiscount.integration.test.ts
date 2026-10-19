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
 * Desconto por promoter (D-91, mudança de escopo aprovada pela PartyX), de ponta a ponta, com a taxa de serviço de 7,5% gravada como o
 * painel gravaria (a taxa é calculada sobre o valor já com desconto): cadastro e trilha, resumo e pedido (desconto por ingresso e por
 * lote, guardado no pedido), valor enviado ao gateway, prazo, alcance, limite de usos (com o pedido pendente segurando um uso e dois
 * pedidos ao mesmo tempo), total zero recusado (opção B), mudança do promoter depois do pedido, comprovantes, painel e relatórios.
 */
describe.skipIf(!ADMIN_URL)('desconto por promoter (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  let mock: MockGateway;
  let mailer: MemoryEmailSender;
  // 12:00 em Brasília: o dia do pedido, no fuso do evento, é 10/10/2026.
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
    const [row] = (
      await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5) returning id', [
        `Pessoa ${i} Teste`,
        email,
        role === 'cliente' ? String(53000000000 + i) : null,
        hash,
        role,
      ])
    ).rows;
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
      id: row.id as string,
      raw,
      get: (p: string) => raw('GET', p),
      post: (p: string, b: unknown = {}) => raw('POST', p, b),
      patch: (p: string, b: unknown) => raw('PATCH', p, b),
    };
  }
  type Session = Awaited<ReturnType<typeof session>>;

  /** Evento publicado com tipos (preço e quantidade), montado pelo painel. */
  async function setup(a: Session, types: { name: string; price: number; quantity?: number }[]) {
    const ev = (
      await json(
        await a.post('/admin/events', {
          name: `Festa do Desconto ${++n}`,
          startsAt: '2026-12-12T22:00:00-03:00',
          venue: 'Arena',
          address: 'Rua 1',
          description: 'Evento de teste, dados fictícios.',
          ageRating: '18 anos',
        }),
      )
    ).event as { id: string; slug: string };
    const ids: Record<string, string> = {};
    for (const t of types) {
      const res = await a.post(`/admin/events/${ev.id}/ticket-types`, {
        name: t.name,
        priceCents: t.price,
        quantityTotal: t.quantity ?? 20,
        salesStartAt: '2026-10-01T00:00:00-03:00',
        salesEndAt: '2026-12-12T20:00:00-03:00',
      });
      expect(res.status).toBe(201);
      ids[t.name] = (await json(res)).ticketType.id;
    }
    expect((await a.post(`/admin/events/${ev.id}/publish`)).status).toBe(200);
    return { eventId: ev.id, slug: ev.slug, types: ids };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;

  async function promoter(a: Session, body: Record<string, unknown>) {
    const res = await a.post('/admin/promoters', { name: 'Duda', couponCode: `DUDA${++n}`, ...body });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
    return (await json(res)).promoter as { id: string; couponCode: string };
  }

  const items = (s: Setup, quantities: Record<string, number>) =>
    Object.entries(quantities).map(([name, quantity]) => ({ ticketTypeId: s.types[name]!, quantity }));
  const quote = (b: Session, s: Setup, q: Record<string, number>, couponCode?: string) =>
    b.post('/checkout/quote', { eventSlug: s.slug, items: items(s, q), couponCode });
  const buy = (b: Session, s: Setup, q: Record<string, number>, couponCode?: string, expectedTotalCents?: number) =>
    b.post('/orders', {
      cancellationAccepted: true,
      cancellationVersion: 'ficticio-0',
      eventSlug: s.slug,
      items: items(s, q),
      couponCode,
      ...(expectedTotalCents === undefined ? {} : { expectedTotalCents }),
    });
  const orderRow = async (id: string) =>
    (
      await sql(
        'select promoter_id, coupon_code, discount_kind, discount_value, discount_cents, service_fee_cents, total_cents from orders where id = $1',
        [id],
      )
    ).rows[0];
  async function pay(b: Session, orderId: string) {
    expect((await b.post(`/orders/${orderId}/payment`, { method: 'pix' })).status).toBe(201);
    const paymentId = (await sql('select gateway_payment_id from orders where id = $1', [orderId])).rows[0].gateway_payment_id as string;
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
    testDb = await createTestDatabase(ADMIN_URL!, { serviceFee: { rateBps: 750, minCents: 0 } });
    hash = await argon2Hasher.hash(PASSWORD);
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql(
      'truncate payment_events, email_log, checkins, tickets, order_item_lots, reservations, order_items, orders, ticket_lots, ticket_types, promoter_discount_events, promoters, events, audit_log, sessions, login_attempts, users cascade',
    );
    await sql(
      'insert into service_fee_settings (id, rate_bps, min_cents) values (1, 750, 0) on conflict (id) do update set rate_bps = 750, min_cents = 0, updated_by = null',
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

  it('painel: cria e edita o desconto com os limites; a trilha registra criação e alteração do desconto; "nenhum" limpa tudo', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ name: 'Pista', price: 3000 }]);
    const bad = async (body: Record<string, unknown>, campo: string) => {
      const res = await a.post('/admin/promoters', { name: 'X', couponCode: `X${++n}XX`, ...body });
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect((await json(res)).erro.detalhes.map((c: { campo: string }) => c.campo)).toContain(campo);
    };
    await bad({ discountKind: 'percentual', discountValue: 50 }, 'discountValue'); // 0,5%
    await bad({ discountKind: 'percentual', discountValue: 10001 }, 'discountValue'); // 100,01%
    await bad({ discountKind: 'fixo', discountValue: 0 }, 'discountValue');
    await bad({ discountKind: 'percentual', discountValue: 1000, discountScope: 'eventos', discountEventIds: [] }, 'discountEventIds');
    await bad(
      { discountKind: 'percentual', discountValue: 1000, discountScope: 'eventos', discountEventIds: ['00000000-0000-4000-8000-000000000000'] },
      'discountEventIds',
    );
    await bad({ discountKind: 'fixo', discountValue: 500, discountStartsOn: '2026-10-20', discountEndsOn: '2026-10-19' }, 'discountEndsOn');
    await bad({ discountKind: 'fixo', discountValue: 500, discountStartsOn: '2026-02-30' }, 'discountStartsOn');
    await bad({ discountKind: 'fixo', discountValue: 500, discountMaxUses: 0 }, 'discountMaxUses');

    const p = await promoter(a, {
      discountKind: 'percentual',
      discountValue: 1250,
      discountScope: 'eventos',
      discountEventIds: [s.eventId],
      discountStartsOn: '2026-10-10',
      discountEndsOn: '2026-10-31',
      discountMaxUses: 50,
    });
    expect(p).toMatchObject({
      discountKind: 'percentual',
      discountValue: 1250,
      discountScope: 'eventos',
      discountEventIds: [s.eventId],
      discountStartsOn: '2026-10-10',
      discountEndsOn: '2026-10-31',
      discountMaxUses: 50,
      discountUses: { paid: 0, pending: 0 },
    });
    const created = (await sql("select after_json from audit_log where action = 'promoter.criar'")).rows[0].after_json;
    expect(created.discount).toEqual({
      kind: 'percentual',
      value: 1250,
      scope: 'eventos',
      eventIds: [s.eventId],
      startsOn: '2026-10-10',
      endsOn: '2026-10-31',
      maxUses: 50,
    });

    // Só o desconto muda: ação própria na trilha, com antes e depois.
    expect((await a.patch(`/admin/promoters/${p.id}`, { discountKind: 'fixo', discountValue: 500 })).status).toBe(200);
    const changed = (await sql("select before_json, after_json from audit_log where action = 'promoter.desconto'")).rows;
    expect(changed).toHaveLength(1);
    expect(changed[0].before_json.discount).toMatchObject({ kind: 'percentual', value: 1250 });
    expect(changed[0].after_json.discount).toMatchObject({ kind: 'fixo', value: 500, scope: 'eventos', maxUses: 50 });
    // Trocar o tipo sem mandar o valor não reaproveita o antigo (porcentagem e centavos não se misturam).
    expect((await a.patch(`/admin/promoters/${p.id}`, { discountKind: 'percentual' })).status).toBe(422);

    // "Nenhum" limpa valor, alcance, eventos, prazo e limite.
    const none = (await json(await a.patch(`/admin/promoters/${p.id}`, { discountKind: 'nenhum' }))).promoter;
    expect(none).toMatchObject({
      discountKind: 'nenhum',
      discountValue: null,
      discountScope: 'todos',
      discountEventIds: [],
      discountStartsOn: null,
      discountEndsOn: null,
      discountMaxUses: null,
    });
    // Só o administrador.
    const b = await session();
    expect((await b.post('/admin/promoters', { name: 'Y', couponCode: 'YYY', discountKind: 'fixo', discountValue: 100 })).status).toBe(403);
  });

  it('resumo e pedido: desconto por ingresso, taxa sobre o valor descontado, total enviado ao gateway; tudo guardado no pedido', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ name: 'Pista', price: 3000 }]);
    const p = await promoter(a, { discountKind: 'percentual', discountValue: 1000 });
    const b = await session();
    const q = await quote(b, s, { Pista: 2 }, p.couponCode.toLowerCase());
    expect(q.status).toBe(200);
    // 10% de R$ 30,00 = R$ 3,00; taxa de 7,5% sobre R$ 27,00 = 218,9 → R$ 2,19; total 2 × (27,00 + 2,19) = R$ 58,38.
    const summary = (await json(q)).summary;
    expect(summary).toMatchObject({
      ticketsCents: 6000,
      discountCents: 600,
      serviceFeeCents: 438,
      serviceFeeRateBps: 750,
      totalCents: 5838,
      coupon: { code: p.couponCode, discount: { kind: 'percentual', value: 1000 }, status: 'desconto' },
    });
    expect(summary.items[0].lots[0]).toMatchObject({ unitPriceCents: 3000, unitDiscountCents: 300, unitServiceFeeCents: 219 });

    const res = await buy(b, s, { Pista: 2 }, p.couponCode, 5838);
    expect(res.status).toBe(201);
    const { order } = await json(res);
    expect(order).toMatchObject({
      ticketsCents: 6000,
      discountCents: 600,
      serviceFeeCents: 438,
      totalCents: 5838,
      coupon: { code: p.couponCode, discount: { kind: 'percentual', value: 1000 } },
    });
    expect(await orderRow(order.id)).toMatchObject({
      promoter_id: p.id,
      coupon_code: p.couponCode,
      discount_kind: 'percentual',
      discount_value: 1000,
      discount_cents: 600,
      service_fee_cents: 438,
      total_cents: 5838,
    });
    expect((await sql('select discount_cents, service_fee_cents from order_items where order_id = $1', [order.id])).rows).toEqual([
      { discount_cents: 600, service_fee_cents: 438 },
    ]);
    expect(
      (await sql('select unit_price_cents, unit_discount_cents, unit_service_fee_cents from order_item_lots where order_id = $1', [order.id]))
        .rows,
    ).toEqual([{ unit_price_cents: 3000, unit_discount_cents: 300, unit_service_fee_cents: 219 }]);
    expect((await b.post(`/orders/${order.id}/payment`, { method: 'pix' })).status).toBe(201);
    expect(mock.simulate.all().map(x => x.amountCents)).toEqual([5838]);
  });

  it('porcentagem com centavos (7,25% de R$ 25,00 = R$ 1,81, para baixo) e valor fixo maior que o preço de um tipo (fica em R$ 0,00, sem taxa)', async () => {
    const a = await session('administrador');
    const s = await setup(a, [
      { name: 'Pista', price: 3000 },
      { name: 'Meia', price: 1000 },
      { name: 'Camarote', price: 2500 },
    ]);
    const pct = await promoter(a, { discountKind: 'percentual', discountValue: 725 });
    const b = await session();
    const one = (await json(await quote(b, s, { Camarote: 1 }, pct.couponCode))).summary;
    // Taxa sobre R$ 23,19: 2319 × 750 / 9250 = 188,03, para cima: R$ 1,89.
    expect(one).toMatchObject({ discountCents: 181, serviceFeeCents: 189 });
    expect(one.totalCents).toBe(2500 - 181 + 189);

    const fixed = await promoter(a, { discountKind: 'fixo', discountValue: 1500 });
    const mix = (await json(await quote(b, s, { Pista: 1, Meia: 2 }, fixed.couponCode))).summary;
    // Pista: 3000 - 1500 = 1500, taxa ceil(1500 × 750 / 9250 = 121,6) = 122. Meia: 1000 - 1000 = 0, sem taxa (nem mínima).
    expect(mix).toMatchObject({ ticketsCents: 5000, discountCents: 3500, serviceFeeCents: 122, totalCents: 1622 });
    const meia = mix.items.find((i: { name: string }) => i.name === 'Meia');
    expect(meia).toMatchObject({ discountCents: 2000, serviceFeeCents: 0 });
    const { order } = await json(await buy(b, s, { Pista: 1, Meia: 2 }, fixed.couponCode, 1622));
    expect(await orderRow(order.id)).toMatchObject({ discount_cents: 3500, total_cents: 1622 });
  });

  it('total zero (opção B): o código é recusado com a mensagem combinada, no resumo e no pedido; nada é gravado', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ name: 'Pista', price: 3000 }]);
    const all = await promoter(a, { discountKind: 'percentual', discountValue: 10000 });
    const big = await promoter(a, { discountKind: 'fixo', discountValue: 5000 });
    const b = await session();
    for (const c of [all.couponCode, big.couponCode]) {
      const q = await quote(b, s, { Pista: 2 }, c);
      expect(q.status).toBe(422);
      const body = await json(q);
      expect(body.erro.codigo).toBe('cupom_recusado');
      expect(body.erro.detalhes).toEqual([{ campo: 'couponCode', mensagem: 'Este código não pode ser usado neste pedido.' }]);
      const o = await buy(b, s, { Pista: 2 }, c);
      expect(o.status).toBe(422);
      expect(await code(o)).toBe('cupom_recusado');
    }
    expect((await sql('select count(*)::int as n from orders')).rows[0].n).toBe(0);
    expect(mock.simulate.all()).toHaveLength(0);
    // Sem o código, o mesmo pedido passa normalmente.
    expect((await buy(b, s, { Pista: 2 })).status).toBe(201);
  });

  it('código válido sem desconto aplicável: fora do prazo, de outro evento ou sem desconto atribui a venda e explica; inativo é recusado', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ name: 'Pista', price: 3000 }]);
    const other = await setup(a, [{ name: 'Pista', price: 3000 }]);
    const later = await promoter(a, { discountKind: 'fixo', discountValue: 500, discountStartsOn: '2026-10-11' });
    const ended = await promoter(a, { discountKind: 'fixo', discountValue: 500, discountEndsOn: '2026-10-09' });
    const elsewhere = await promoter(a, {
      discountKind: 'fixo',
      discountValue: 500,
      discountScope: 'eventos',
      discountEventIds: [other.eventId],
    });
    const plain = await promoter(a, {});
    const b = await session();
    const cases: [string, string, RegExp][] = [
      [later.couponCode, 'fora_do_prazo', /não está valendo hoje/],
      [ended.couponCode, 'fora_do_prazo', /não está valendo hoje/],
      [elsewhere.couponCode, 'outro_evento', /não vale para este evento/],
      [plain.couponCode, 'sem_desconto', /não dá desconto/],
    ];
    for (const [c, status, message] of cases) {
      const summary = (await json(await quote(b, s, { Pista: 1 }, c))).summary;
      expect(summary.coupon).toMatchObject({ code: c, discount: null, status });
      expect(summary.coupon.message).toMatch(message);
      expect(summary).toMatchObject({ discountCents: 0, totalCents: 3244 });
    }
    // No evento escolhido, o mesmo código dá o desconto.
    expect((await json(await quote(b, other, { Pista: 1 }, elsewhere.couponCode))).summary.discountCents).toBe(500);
    // O pedido com código sem desconto continua atribuído ao promoter.
    const { order } = await json(await buy(b, s, { Pista: 1 }, later.couponCode));
    expect(await orderRow(order.id)).toMatchObject({
      promoter_id: later.id,
      coupon_code: later.couponCode,
      discount_kind: null,
      discount_cents: 0,
      total_cents: 3244,
    });
    // No dia de início, o desconto passa a valer (o prazo é pela data do pedido, no fuso do evento: 11/10 00:30 em Brasília).
    clock.set('2026-10-11T03:30:00Z');
    expect((await json(await quote(await session(), s, { Pista: 1 }, later.couponCode))).summary.discountCents).toBe(500);
    // Inativo: recusado, como antes (sessões novas: o relógio avançou mais que a validade delas).
    const a2 = await session('administrador');
    expect((await a2.patch(`/admin/promoters/${plain.id}`, { isActive: false })).status).toBe(200);
    const off = await quote(await session(), s, { Pista: 1 }, plain.couponCode);
    expect(off.status).toBe(422);
    expect(await code(off)).toBe('cupom_invalido');
  });

  it('limite de usos: o pedido pendente segura o uso; vencido, devolve; pago, conta; dois pedidos ao mesmo tempo não passam do limite', async () => {
    let a = await session('administrador');
    const s = await setup(a, [{ name: 'Pista', price: 3000 }]);
    const p = await promoter(a, { discountKind: 'fixo', discountValue: 500, discountMaxUses: 1 });
    const b1 = await session();
    const b2 = await session();
    const first = (await json(await buy(b1, s, { Pista: 1 }, p.couponCode))).order;
    expect(first.discountCents).toBe(500);
    // O pendente segura o uso: o segundo comprador vê "esgotado" e o código só atribui.
    const held = (await json(await quote(b2, s, { Pista: 1 }, p.couponCode))).summary;
    expect(held.coupon).toMatchObject({ status: 'esgotado', discount: null });
    expect(held.coupon.message).toMatch(/limite de usos/);
    let list = (await json(await a.get('/admin/promoters'))).promoters;
    expect(list.find((x: { id: string }) => x.id === p.id).discountUses).toEqual({ paid: 0, pending: 1 });

    // A reserva do primeiro vence: o uso volta.
    clock.set('2026-10-10T15:31:00Z');
    expect((await json(await quote(b2, s, { Pista: 1 }, p.couponCode))).summary.discountCents).toBe(500);
    const second = (await json(await buy(b2, s, { Pista: 1 }, p.couponCode))).order;
    expect(second.discountCents).toBe(500);
    await pay(b2, second.id);
    // A sessão do administrador expira sem uso (30 min): entra de novo depois de o relógio avançar.
    a = await session('administrador');
    list = (await json(await a.get('/admin/promoters'))).promoters;
    expect(list.find((x: { id: string }) => x.id === p.id).discountUses).toEqual({ paid: 1, pending: 0 });
    const b3 = await session();
    expect((await json(await quote(b3, s, { Pista: 1 }, p.couponCode))).summary.coupon.status).toBe('esgotado');

    // Dois pedidos ao mesmo tempo, com limite de 1: só um leva o desconto (a linha do promoter fica trancada na criação).
    const q = await promoter(a, { discountKind: 'fixo', discountValue: 500, discountMaxUses: 1 });
    const [c1, c2] = [await session(), await session()];
    const results = await Promise.all([buy(c1, s, { Pista: 1 }, q.couponCode), buy(c2, s, { Pista: 1 }, q.couponCode)]);
    expect(results.map(r => r.status)).toEqual([201, 201]);
    const orders = await Promise.all(results.map(async r => (await json(r)).order));
    expect(orders.map(o => o.discountCents).sort()).toEqual([0, 500]);
    expect(
      (await sql('select count(*)::int as n from orders where promoter_id = $1 and discount_kind is not null', [q.id])).rows[0].n,
    ).toBe(1);
  });

  it('mudar o promoter depois não altera o pedido; mudar entre o resumo e o pedido recusa com preço alterado', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ name: 'Pista', price: 3000 }]);
    const p = await promoter(a, { discountKind: 'percentual', discountValue: 1000 });
    const b = await session();
    const { order } = await json(await buy(b, s, { Pista: 2 }, p.couponCode));
    expect((await a.patch(`/admin/promoters/${p.id}`, { couponCode: 'NOVOCODIGO', discountValue: 5000 })).status).toBe(200);
    expect((await json(await b.get(`/orders/${order.id}`))).order).toMatchObject({
      discountCents: 600,
      totalCents: 5838,
      coupon: { code: p.couponCode, discount: { kind: 'percentual', value: 1000 } },
    });
    // Resumo com 50%; o painel muda para 20% antes do pedido: o total esperado não bate e o pedido é recusado.
    const b2 = await session();
    const before = (await json(await quote(b2, s, { Pista: 1 }, 'NOVOCODIGO'))).summary;
    expect(before.discountCents).toBe(1500);
    expect((await a.patch(`/admin/promoters/${p.id}`, { discountValue: 2000 })).status).toBe(200);
    const stale = await buy(b2, s, { Pista: 1 }, 'NOVOCODIGO', before.totalCents);
    expect(stale.status).toBe(409);
    expect(await code(stale)).toBe('preco_alterado');
  });

  it('comprovantes, painel e relatórios: e-mail com a linha do desconto, Meus ingressos, reembolso, vendas, ranking, CSV e conciliação', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ name: 'Pista', price: 3000 }]);
    const p = await promoter(a, { discountKind: 'percentual', discountValue: 1000 });
    const b = await session();
    const { order } = await json(await buy(b, s, { Pista: 2 }, p.couponCode));
    await pay(b, order.id);
    const plain = await session();
    const free = (await json(await buy(plain, s, { Pista: 1 }))).order;
    await pay(plain, free.id);

    await processOutbox({ db: createDrizzle(testDb.pool), clock, mailer, config });
    const discounted = mailer.sent.find(m => m.template === 'compra_confirmada' && /Desconto \(/.test(m.text))!;
    expect(discounted.text).toMatch(/Valor dos ingressos\W+R\$\s60,00/);
    expect(discounted.text).toMatch(new RegExp(`Desconto \\(${p.couponCode}\\)\\W+R\\$\\s6,00`));
    expect(discounted.text).toMatch(/Taxa de serviço\W+R\$\s4,38/);
    expect(discounted.text).toMatch(/Total pago\W+R\$\s58,38/);
    // O pedido sem código não tem linha de desconto.
    expect(mailer.sent.filter(m => m.template === 'compra_confirmada' && !/Desconto \(/.test(m.text))).toHaveLength(1);

    const { tickets } = await json(await b.get('/tickets'));
    expect(tickets).toHaveLength(2);
    for (const t of tickets) expect(t).toMatchObject({ priceCents: 3000, discountCents: 300, serviceFeeCents: 219 });

    const detail = (await json(await a.get(`/admin/orders/${order.id}`))).order;
    expect(detail).toMatchObject({
      ticketsCents: 6000,
      discountCents: 600,
      coupon: p.couponCode,
      discount: { kind: 'percentual', value: 1000 },
      serviceFeeCents: 438,
      totalCents: 5838,
      // O estorno devolve o que foi pago.
      refundCents: 5838,
    });
    expect(detail.items[0]).toMatchObject({ unitDiscountCents: 300, discountCents: 600 });
    for (const t of detail.tickets) expect(t).toMatchObject({ priceCents: 3000, discountCents: 300, serviceFeeCents: 219 });
    const ticketId = detail.tickets[0].id;
    expect((await json(await a.get(`/admin/tickets/${ticketId}`))).ticket).toMatchObject({ priceCents: 3000, discountCents: 300 });

    const report = await json(await a.get('/admin/reports/sales?from=2026-10-01&to=2026-10-31'));
    // Pedidos: 5838 (com desconto) + 3244 (sem) = 9082. Ingressos 9000, desconto 600, líquido 8400, taxa 438 + 244 = 682.
    expect(report.totals).toMatchObject({ tickets: 3, cents: 9000, discountCents: 600, netCents: 8400, serviceFeeCents: 682, chargedCents: 9082 });
    expect(report.reconciliation).toMatchObject({ ok: true, ordersCents: 9082, itemsCents: 9000, discountCents: 600, serviceFeeCents: 682 });
    expect(report.lines[0]).toMatchObject({ cents: 9000, discountCents: 600, netCents: 8400 });
    expect(report.lines[0].lots[0]).toMatchObject({ cents: 9000, discountCents: 600, netCents: 8400 });

    const rank = await json(await a.get('/admin/reports/promoters?metric=valor'));
    expect(rank.ranking.find((r: { id: string }) => r.id === p.id)).toMatchObject({
      tickets: 2,
      cents: 6000,
      discountCents: 600,
      netCents: 5400,
      orders: 1,
    });
    const po = await json(await a.get(`/admin/reports/promoters/${p.id}`));
    expect(po.totals).toEqual({ tickets: 2, cents: 6000, discountCents: 600, netCents: 5400 });

    const salesCsv = await (await a.get('/admin/exports/sales.csv?from=2026-10-01&to=2026-10-31')).text();
    expect(salesCsv).toMatch(/TOTAL;;;3;90,00;6,00;84,00;6,82;90,82/);
    const rankCsv = await (await a.get('/admin/exports/promoters.csv')).text();
    expect(rankCsv).toContain('Desconto concedido (R$);Valor líquido (R$)');
    expect(rankCsv).toMatch(new RegExp(`${p.couponCode};Ativo;2;60,00;6,00;54,00;1`));
    const ordersCsv = await (await a.get('/admin/exports/orders.csv')).text();
    expect(ordersCsv).toContain('Desconto (R$)');
    expect(ordersCsv).toMatch(/;60,00;6,00;4,38;58,38/);

    // Lista de promoters: desconto e usos.
    const listed = (await json(await a.get('/admin/promoters'))).promoters.find((x: { id: string }) => x.id === p.id);
    expect(listed).toMatchObject({ discountKind: 'percentual', discountValue: 1000, discountUses: { paid: 1, pending: 0 } });
  });
});
