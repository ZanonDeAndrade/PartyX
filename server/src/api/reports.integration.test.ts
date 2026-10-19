import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { createMockGateway, type MockGateway } from '../payments/mockGateway';
import { backfillTickets, createTicketIssuer, issueForOrder } from '../tickets/issuer';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';
const PRICE = { Pista: 8000, VIP: 20000 } as const;

describe.skipIf(!ADMIN_URL)('relatórios e taxa mensal (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-12-15T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const config = loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none' });
  let app: ReturnType<typeof createApp>;
  let mock: MockGateway;
  let hash = '';
  let n = 0;

  type Role = 'cliente' | 'validador' | 'administrador';
  async function session(role: Role = 'administrador', name?: string) {
    const i = ++n;
    const email = `${role}${i}@partyx.test`;
    await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5)', [
      name ?? `Pessoa ${role} ${i}`,
      email,
      role === 'cliente' ? String(80000000000 + i) : null,
      hash,
      role,
    ]);
    let cookie = '';
    let csrf = '';
    const raw = (method: string, path: string, body?: unknown) => {
      const headers: Record<string, string> = { origin: 'http://localhost', 'x-forwarded-for': '203.0.113.7' };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return app.request(`/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    };
    const login = await raw('POST', '/auth/login', { email, password: PASSWORD });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    return { raw, get: (p: string) => raw('GET', p), post: (p: string, b: unknown = {}) => raw('POST', p, b) };
  }
  const json = async <T = any>(res: Response) => (await res.json()) as T;

  async function event(name = 'Noite Neon Verão', status = 'publicado') {
    const id = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values ($1,$2,'2026-12-20T22:00:00-03:00','Arena','Rua 1','d','Livre',$3) returning id`,
        [`evento-${++n}`, name, status],
      )
    ).rows[0].id as string;
    const mk = async (tname: 'Pista' | 'VIP') =>
      (
        await sql(
          `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,$2,$3,$4,'2026-10-01T00:00:00-03:00','2026-12-20T20:00:00-03:00') returning id`,
          [id, tname, PRICE[tname], 500],
        )
      ).rows[0].id as string;
    return { id, name, types: { Pista: await mk('Pista'), VIP: await mk('VIP') } };
  }
  async function promoter(code: string, name = `Promoter ${code}`, active = true) {
    return (
      await sql('insert into promoters (name, coupon_code, is_active) values ($1,$2,$3) returning id', [
        name,
        code,
        active,
      ])
    ).rows[0].id as string;
  }

  /** Pedido direto no banco, com ingressos pelo emissor de verdade quando o estado exige. */
  async function order(
    e: Awaited<ReturnType<typeof event>>,
    o: {
      status?: string;
      paidAt?: string;
      items?: [keyof typeof PRICE, number][];
      promoterId?: string;
      noTickets?: boolean;
    } = {},
  ) {
    const i = ++n;
    const userId = (
      await sql("insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,'cliente') returning id", [
        `Comprador ${i}`,
        `comprador${i}@partyx.test`,
        String(90000000000 + i),
        hash,
      ])
    ).rows[0].id as string;
    const items = o.items ?? [['Pista', 2]];
    const total = items.reduce((t, [k, q]) => t + q * PRICE[k], 0);
    const status = o.status ?? 'pago';
    const paidAt = ['pendente', 'expirado', 'nao_concluido'].includes(status)
      ? null
      : (o.paidAt ?? '2026-12-10T15:00:00Z');
    const orderId = (
      await sql(
        `insert into orders (user_id,event_id,total_cents,status,paid_at,payment_method,created_at,promoter_id) values ($1,$2,$3,$4,$5,'pix',$6,$7) returning id`,
        [userId, e.id, total, status, paidAt, paidAt ?? '2026-12-10T14:00:00Z', o.promoterId ?? null],
      )
    ).rows[0].id as string;
    const orderItems: { orderItemId: string; ticketTypeId: string; quantity: number }[] = [];
    for (const [k, q] of items) {
      const itemId = (
        await sql(
          'insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,$4,$5) returning id',
          [orderId, e.id, e.types[k], q, PRICE[k]],
        )
      ).rows[0].id as string;
      orderItems.push({ orderItemId: itemId, ticketTypeId: e.types[k], quantity: q });
    }
    if (['pago', 'estornado', 'contestado'].includes(status) && !o.noTickets) {
      await createDrizzle(testDb.pool).transaction(tx =>
        issueForOrder(tx, config.qr, { id: orderId, userId, eventId: e.id, items: orderItems }),
      );
      if (status !== 'pago')
        await sql(
          "update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'estorno' where order_id = $1",
          [orderId],
        );
    }
    return { id: orderId, userId };
  }

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    hash = await argon2Hasher.hash(PASSWORD);
    mock = createMockGateway(clock);
    app = createApp({
      config,
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender(), gateway: mock },
      issueTickets: createTicketIssuer(config.qr),
    });
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql(
      'truncate payment_events, checkins, tickets, reservations, order_items, orders, ticket_types, events, promoters, email_log, audit_log, sessions, login_attempts, users cascade',
    );
    await sql('alter sequence order_number_seq restart with 10001');
    clock.set('2026-12-15T15:00:00Z');
  });

  describe('acesso', () => {
    it('só administrador: visitante 401, cliente e validador 403, sem cache', async () => {
      const client = await session('cliente');
      const staff = await session('validador');
      const adm = await session();
      for (const p of [
        '/admin/reports/sales',
        '/admin/reports/promoters',
        '/admin/reports/fee',
        `/admin/reports/promoters/${crypto.randomUUID()}`,
      ]) {
        expect([p, (await app.request(`/api${p}`)).status]).toEqual([p, 401]);
        expect([p, (await client.get(p)).status]).toEqual([p, 403]);
        expect([p, (await staff.get(p)).status]).toEqual([p, 403]);
      }
      expect((await adm.get('/admin/reports/fee')).headers.get('cache-control')).toBe('private, no-store');
    });
  });

  describe('vendas por evento e por tipo (RF-58, CA-28)', () => {
    it('o total do relatório bate com a soma dos pedidos pagos', async () => {
      const a = await event('Evento A');
      const b = await event('Evento B');
      const p = await promoter('JOAO10');
      await order(a, {
        items: [
          ['Pista', 2],
          ['VIP', 1],
        ],
      }); // 36000
      await order(a, { items: [['Pista', 3]], promoterId: p }); // 24000
      await order(b, { items: [['VIP', 2]] }); // 40000
      await order(b, { items: [['Pista', 1]] }); // 8000
      // Fora das vendas: nada disso pode entrar.
      await order(a, { status: 'pendente' });
      await order(a, { status: 'expirado' });
      await order(a, { status: 'nao_concluido' });
      const adm = await session();
      const r = await json(await adm.get('/admin/reports/sales'));
      const expected = (await sql("select coalesce(sum(total_cents),0)::int as s from orders where status = 'pago'"))
        .rows[0].s as number;
      expect(expected).toBe(108000);
      // Sem taxa de serviço neste banco (0%, D-90): total cobrado = valor dos ingressos. A tarifa do gateway ainda não foi lida.
      expect(r.totals).toEqual({
        tickets: 9,
        cents: expected,
        serviceFeeCents: 0,
        chargedCents: expected,
        gatewayFeeCents: 0,
        gatewayNetCents: 0,
        ordersWithoutGatewayFee: 4,
      });
      expect(r.reconciliation).toMatchObject({ ok: true, ordersCents: expected, itemsCents: expected, orders: 4 });
      expect(r.byEvent.map((e: any) => [e.eventName, e.tickets, e.cents])).toEqual([
        ['Evento A', 6, 60000],
        ['Evento B', 3, 48000],
      ]);
      const line = (ev: string, t: string) => r.lines.find((l: any) => l.eventName === ev && l.typeName === t);
      expect(line('Evento A', 'Pista')).toMatchObject({ tickets: 5, cents: 40000 });
      expect(line('Evento A', 'VIP')).toMatchObject({ tickets: 1, cents: 20000 });
      expect(line('Evento B', 'VIP')).toMatchObject({ tickets: 2, cents: 40000 });
    });

    it('filtra por evento, por tipo e por período no fuso do evento', async () => {
      const a = await event('Evento A');
      const b = await event('Evento B');
      await order(a, { paidAt: '2026-12-10T15:00:00Z', items: [['Pista', 1]] });
      await order(a, { paidAt: '2026-12-12T02:30:00Z', items: [['VIP', 1]] }); // 11/12 23h30 em Brasília
      await order(b, { paidAt: '2026-12-12T15:00:00Z', items: [['Pista', 2]] });
      const adm = await session();
      const get = async (qs: string) => json(await adm.get(`/admin/reports/sales?${qs}`));
      expect((await get(`eventId=${a.id}`)).totals.cents).toBe(28000);
      expect((await get(`eventId=${b.id}`)).totals.cents).toBe(16000);
      const vip = await get(`typeId=${a.types.VIP}`);
      // Com filtro de tipo, a tarifa do gateway (do pedido inteiro) não se divide: nula.
      expect(vip.totals).toEqual({
        tickets: 1,
        cents: 20000,
        serviceFeeCents: 0,
        chargedCents: 20000,
        gatewayFeeCents: null,
        gatewayNetCents: null,
        ordersWithoutGatewayFee: null,
      });
      expect(vip.reconciliation.ok).toBeNull(); // com filtro de tipo a conciliação por pedido não se aplica
      expect((await get('from=2026-12-11&to=2026-12-11')).totals.cents).toBe(20000); // 23h30 BRT ainda é dia 11
      expect((await get('from=2026-12-12&to=2026-12-12')).totals.cents).toBe(16000);
      expect((await get('from=2026-12-10&to=2026-12-12')).totals.cents).toBe(44000);
      expect((await get('from=2026-12-13')).totals.cents).toBe(0);
    });

    it('estornados, contestados e pagos sem estoque ficam fora do total e aparecem separados; a receita líquida exclui os devolvidos', async () => {
      const e = await event();
      await order(e, { items: [['Pista', 2]] }); // 16000 pago
      await order(e, { status: 'estornado', items: [['Pista', 1]] }); // 8000
      await order(e, { status: 'contestado', items: [['VIP', 1]] }); // 20000
      await order(e, { status: 'pago_sem_estoque', items: [['Pista', 3]] }); // 24000
      const adm = await session();
      const r = await json(await adm.get('/admin/reports/sales'));
      expect(r.totals.cents).toBe(16000);
      expect(r.reversals.refunded).toEqual({ orders: 1, tickets: 1, cents: 8000, serviceFeeCents: 0 });
      expect(r.reversals.contested).toEqual({ orders: 1, tickets: 1, cents: 20000, serviceFeeCents: 0 });
      expect(r.reversals).toMatchObject({ netCents: 16000, grossCents: 44000 });
      expect(r.exceptions.paidWithoutStock).toEqual({ orders: 1, tickets: 3, cents: 24000, serviceFeeCents: 0 });
    });

    it('ingresso cancelado pelo administrador dentro de um pedido ainda pago continua no total (o pedido segue pago até o gateway estornar)', async () => {
      const e = await event();
      const o = await order(e, { items: [['Pista', 2]] });
      const adm = await session();
      const t = (await sql('select id from tickets where order_id = $1 limit 1', [o.id])).rows[0].id;
      await adm.post(`/admin/tickets/${t}/cancel`, { reason: 'cancelamento de teste', confirm: true });
      expect((await json(await adm.get('/admin/reports/sales'))).totals).toMatchObject({ tickets: 2, cents: 16000, chargedCents: 16000 });
    });

    it('a série diária soma o total', async () => {
      const e = await event();
      await order(e, { paidAt: '2026-12-10T15:00:00Z' });
      await order(e, { paidAt: '2026-12-10T18:00:00Z', items: [['VIP', 1]] });
      await order(e, { paidAt: '2026-12-11T15:00:00Z' });
      const adm = await session();
      const r = await json(await adm.get('/admin/reports/sales'));
      expect(r.daily).toEqual([
        { day: '2026-12-10', tickets: 3, cents: 36000, serviceFeeCents: 0 },
        { day: '2026-12-11', tickets: 2, cents: 16000, serviceFeeCents: 0 },
      ]);
      expect(r.daily.reduce((t: number, d: any) => t + d.cents, 0)).toBe(r.totals.cents);
    });

    it('a conciliação acusa quando os itens não somam o valor dos pedidos', async () => {
      const e = await event();
      const o = await order(e, { items: [['Pista', 2]] });
      await sql('update order_items set unit_price_cents = unit_price_cents - 1 where order_id = $1', [o.id]);
      const adm = await session();
      const r = await json(await adm.get('/admin/reports/sales'));
      expect(r.reconciliation).toMatchObject({ ok: false, ordersCents: 16000, itemsCents: 15998 });
    });

    it('filtros inválidos são recusados', async () => {
      const adm = await session();
      for (const qs of [
        'from=12/12/2026',
        'from=2026-02-31',
        'from=2026-12-12&to=2026-12-01',
        'eventId=nao-uuid',
        'typeId=x',
      ]) {
        expect([qs, (await adm.get(`/admin/reports/sales?${qs}`)).status]).toEqual([qs, 422]);
      }
    });
  });

  describe('promoters (RF-59, CA-19, CA-30)', () => {
    /** Compra pela API com o cupom, paga pelo caminho do webhook: o fluxo real, do código ao relatório. */
    async function buyWithCoupon(
      e: Awaited<ReturnType<typeof event>>,
      coupon: string | null,
      qty = 2,
      type: 'Pista' | 'VIP' = 'Pista',
    ) {
      const buyer = await session('cliente');
      const created = await buyer.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0',
        eventSlug: (await sql('select slug from events where id = $1', [e.id])).rows[0].slug,
        items: [{ ticketTypeId: e.types[type], quantity: qty }],
        couponCode: coupon,
      });
      expect(created.status).toBe(201);
      const orderId = (await json(created)).order.id as string;
      expect((await buyer.post(`/orders/${orderId}/payment`, { method: 'pix' })).status).toBe(201);
      const paymentId = (await sql('select gateway_payment_id from orders where id = $1', [orderId])).rows[0]
        .gateway_payment_id as string;
      mock.simulate.setStatus(paymentId, 'aprovado');
      const body = JSON.stringify({ id: `evt_${randomBytes(6).toString('hex')}`, paymentId, type: 'payment.approved' });
      await app.request('/api/webhooks/payments', {
        method: 'POST',
        headers: { 'x-mock-signature': mock.simulate.sign(body) },
        body,
      });
      return orderId;
    }

    it('a venda com cupom aparece no relatório do promoter certo, sem desconto (CA-19)', async () => {
      const e = await event();
      await promoter('JOAO10', 'João Promoter');
      await promoter('MARIA10', 'Maria Promoter');
      await buyWithCoupon(e, 'joao10', 3); // 24000, minúsculas normalizadas
      await buyWithCoupon(e, 'MARIA10', 1, 'VIP'); // 20000
      await buyWithCoupon(e, null, 2); // sem código
      const adm = await session();
      const r = await json(await adm.get('/admin/reports/promoters'));
      const by = Object.fromEntries(r.ranking.map((p: any) => [p.code, p]));
      expect(by.JOAO10).toMatchObject({ name: 'João Promoter', tickets: 3, cents: 24000, orders: 1 }); // valor cheio: cupom não dá desconto
      expect(by.MARIA10).toMatchObject({ tickets: 1, cents: 20000, orders: 1 });
      expect(r.withoutPromoter).toEqual({ tickets: 2, cents: 16000, orders: 1 });
    });

    it('só pedidos pagos contam: pendente, expirado, estornado e contestado não entram', async () => {
      const e = await event();
      const p = await promoter('JOAO10');
      await order(e, { promoterId: p, items: [['Pista', 1]] });
      for (const status of ['pendente', 'expirado', 'nao_concluido', 'estornado', 'contestado', 'pago_sem_estoque'])
        await order(e, { promoterId: p, status });
      const adm = await session();
      const joao = (await json(await adm.get('/admin/reports/promoters'))).ranking[0];
      expect(joao).toMatchObject({ tickets: 1, cents: 8000, orders: 1 });
    });

    it('ordena do maior para o menor, por quantidade ou por valor, com posição e desempate', async () => {
      const e = await event();
      const a = await promoter('AAA', 'Ana');
      const b = await promoter('BBB', 'Bruno');
      const c = await promoter('CCC', 'Carla');
      const d = await promoter('DDD', 'Dani', false);
      await promoter('ZZZ', 'Zero');
      await order(e, { promoterId: a, items: [['Pista', 5]] }); // 5 ing., 40000
      await order(e, { promoterId: b, items: [['VIP', 3]] }); // 3 ing., 60000
      await order(e, { promoterId: c, items: [['Pista', 3]] }); // 3 ing., 24000
      await order(e, { promoterId: d, items: [['Pista', 3]] }); // 3 ing., 24000 (empata com Carla)
      const adm = await session();
      const qtd = (await json(await adm.get('/admin/reports/promoters?metric=qtd'))).ranking;
      expect(qtd.map((r: any) => [r.name, r.tickets, r.position])).toEqual([
        ['Ana', 5, 1],
        ['Bruno', 3, 2],
        ['Carla', 3, 3],
        ['Dani', 3, 3],
        ['Zero', 0, 5],
      ]);
      // Empate em quantidade desempata por valor (Bruno 60000 vence Carla e Dani, 24000); Carla e Dani seguem empatadas.
      const valor = (await json(await adm.get('/admin/reports/promoters?metric=valor'))).ranking;
      expect(valor.map((r: any) => [r.name, r.cents, r.position])).toEqual([
        ['Bruno', 60000, 1],
        ['Ana', 40000, 2],
        ['Carla', 24000, 3],
        ['Dani', 24000, 3],
        ['Zero', 0, 5],
      ]);
      for (const metric of ['qtd', 'valor']) {
        const r = (await json(await adm.get(`/admin/reports/promoters?metric=${metric}`))).ranking;
        const key = metric === 'qtd' ? 'tickets' : 'cents';
        const values = r.map((x: any) => x[key]);
        expect([...values].sort((x, y) => y - x)).toEqual(values); // nunca fora de ordem
      }
      expect(valor.find((r: any) => r.name === 'Dani').isActive).toBe(false);
      expect((await adm.get('/admin/reports/promoters?metric=outro')).status).toBe(422);
    });

    it('filtra por evento e por período, e o detalhe lista os pedidos do promoter', async () => {
      const a = await event('Evento A');
      const b = await event('Evento B');
      const p = await promoter('JOAO10');
      await order(a, { promoterId: p, paidAt: '2026-12-10T15:00:00Z', items: [['Pista', 1]] });
      await order(b, { promoterId: p, paidAt: '2026-12-12T15:00:00Z', items: [['Pista', 2]] });
      await order(b, { promoterId: p, paidAt: '2026-12-12T02:30:00Z', items: [['VIP', 1]] }); // 11/12 em Brasília
      const adm = await session();
      const rank = async (qs: string) => (await json(await adm.get(`/admin/reports/promoters?${qs}`))).ranking[0];
      expect((await rank(`eventId=${a.id}`)).tickets).toBe(1);
      expect((await rank(`eventId=${b.id}`)).tickets).toBe(3);
      expect((await rank('from=2026-12-11&to=2026-12-11')).tickets).toBe(1);
      expect((await rank('from=2026-12-12')).tickets).toBe(2);
      const detail = await json(await adm.get(`/admin/reports/promoters/${p}?eventId=${b.id}`));
      expect(detail.promoter.code).toBe('JOAO10');
      expect(detail.orders).toHaveLength(2);
      expect(detail.totals).toEqual({ tickets: 3, cents: 36000 });
      expect((await adm.get(`/admin/reports/promoters/${crypto.randomUUID()}`)).status).toBe(404);
      expect((await adm.get('/admin/reports/promoters/nao-uuid')).status).toBe(404);
    });
  });

  describe('taxa mensal (RF-60, CA-29)', () => {
    const fee = async (adm: Awaited<ReturnType<typeof session>>, qs = 'month=2026-12') =>
      json(await adm.get(`/admin/reports/fee?${qs}`));

    it('conta ingressos emitidos de pedidos aprovados no mês, R$ 1,00 cada, qualquer que seja a situação atual (CA-29)', async () => {
      const e = await event();
      await order(e, { items: [['Pista', 2]] }); // 2 válidos
      const used = await order(e, { items: [['Pista', 1]] });
      await sql(
        "update tickets set status = 'utilizado', used_at = now(), validated_by = (select id from users limit 1) where order_id = $1",
        [used.id],
      );
      const adminCancelled = await order(e, { items: [['VIP', 2]] });
      await sql(
        "update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'cancelamento' where id = (select id from tickets where order_id = $1 limit 1)",
        [adminCancelled.id],
      );
      await order(e, { status: 'estornado', items: [['Pista', 3]] }); // 3 cancelados por estorno
      await order(e, { status: 'contestado', items: [['Pista', 1]] }); // 1 cancelado por chargeback
      const adm = await session();
      const r = await fee(adm);
      expect(r.units).toBe(2 + 1 + 2 + 3 + 1);
      expect(r).toMatchObject({ feePerTicketCents: 100, feeCents: 900, month: '2026-12' });
      const by = Object.fromEntries(r.byCurrentStatus.map((s: any) => [s.label, s.units]));
      expect(by).toEqual({
        Válido: 3,
        Utilizado: 1,
        'Cancelado (administrador)': 1,
        'Cancelado (estorno)': 3,
        'Cancelado (contestação)': 1,
      });
      expect(r.byCurrentStatus.reduce((t: number, s: any) => t + s.units, 0)).toBe(r.units);
    });

    it('um ingresso vendido e depois cancelado ou estornado continua contando, e a data original do pagamento não muda', async () => {
      const e = await event();
      const o = await order(e, { items: [['Pista', 2]], paidAt: '2026-12-10T15:00:00Z' });
      const adm = await session();
      const before = await fee(adm);
      expect(before.units).toBe(2);
      // Cancelamento pelo painel e depois estorno pelo gateway.
      await adm.post(`/admin/orders/${o.id}/cancel-tickets`, { reason: 'cancelamento de teste', confirm: true });
      await sql("update orders set status = 'estornado' where id = $1", [o.id]);
      const after = await fee(adm);
      expect(after.units).toBe(2);
      expect(after.feeCents).toBe(200);
      expect(
        new Date((await sql('select paid_at from orders where id = $1', [o.id])).rows[0].paid_at).toISOString(),
      ).toBe('2026-12-10T15:00:00.000Z');
      // E nem o banco deixa mudar a data depois de definida (evidência da taxa).
      await expect(sql("update orders set paid_at = '2026-11-01T00:00:00Z' where id = $1", [o.id])).rejects.toThrow(
        /paid_at/,
      );
    });

    it('a virada do mês respeita o fuso do evento, inclusive à meia-noite exata e na virada do ano', async () => {
      const e = await event();
      await order(e, { paidAt: '2026-12-01T02:59:59Z', items: [['Pista', 1]] }); // 30/11 23h59m59s em Brasília: novembro
      await order(e, { paidAt: '2026-12-01T03:00:00Z', items: [['Pista', 2]] }); // 01/12 00h00 em Brasília: dezembro
      await order(e, { paidAt: '2027-01-01T02:59:59Z', items: [['Pista', 4]] }); // 31/12 23h59m59s: dezembro
      await order(e, { paidAt: '2027-01-01T03:00:00Z', items: [['Pista', 8]] }); // 01/01/2027: janeiro
      const adm = await session();
      expect((await fee(adm, 'month=2026-11')).units).toBe(1);
      expect((await fee(adm, 'month=2026-12')).units).toBe(2 + 4);
      expect((await fee(adm, 'month=2027-01')).units).toBe(8);
      expect((await fee(adm, 'month=2026-10')).units).toBe(0);
    });

    it('pagamento aprovado sem estoque não vira venda: fica de fora da contagem e listado como exceção para análise', async () => {
      const e = await event();
      await order(e, { items: [['Pista', 1]] });
      const sem = await order(e, { status: 'pago_sem_estoque', items: [['Pista', 3]] });
      await order(e, { status: 'pendente' });
      await order(e, { status: 'expirado' });
      const adm = await session();
      const r = await fee(adm);
      expect(r.units).toBe(1);
      expect(r.exceptions.title).toBe('Exceções para análise');
      expect(r.exceptions.paidWithoutStock).toEqual([
        {
          orderId: sem.id,
          number: expect.any(Number),
          units: 3,
          totalCents: expect.any(Number),
          paidAt: expect.any(String),
          gatewayRef: null,
          treated: false,
        },
      ]);
      expect(r.exceptions.totals).toMatchObject({ orders: 1, units: 3, open: 1 });
      expect(r.exceptions.note).toMatch(/não gera ingresso/);
      expect(r.exceptions.note).toMatch(/D-54/);
      expect(r.reconciliation.ok).toBe(true); // exceção conhecida não é divergência
    });

    it('conciliação: unidades previstas pelos pedidos contra ingressos existentes; pedido aprovado sem ingresso (e que não é "sem estoque") acusa divergência até ser recuperado', async () => {
      const e = await event();
      await order(e, { items: [['Pista', 2]] });
      const orphan = await order(e, { items: [['Pista', 3]], noTickets: true }); // pago sem nenhum ingresso: não deveria existir
      const adm = await session();
      const r = await fee(adm);
      expect(r.units).toBe(2);
      expect(r.reconciliation).toMatchObject({ expectedUnits: 5, issuedUnits: 2, ok: false });
      expect(r.reconciliation.anomalies).toEqual([
        { orderId: orphan.id, number: expect.any(Number), status: 'pago', expectedUnits: 3 },
      ]);
      // A recuperação emite o que falta, e a conciliação fecha.
      await backfillTickets({ db: createDrizzle(testDb.pool), qr: config.qr });
      const fixed = await fee(adm);
      expect(fixed.units).toBe(5);
      expect(fixed.reconciliation).toMatchObject({ expectedUnits: 5, issuedUnits: 5, ok: true, anomalies: [] });
    });

    it('separa a receita líquida: bruta, estornada, contestada e líquida', async () => {
      const e = await event();
      await order(e, { items: [['Pista', 2]] }); // 16000
      await order(e, { status: 'estornado', items: [['VIP', 1]] }); // 20000
      await order(e, { status: 'contestado', items: [['Pista', 1]] }); // 8000
      await order(e, { status: 'pago_sem_estoque', items: [['Pista', 5]] });
      const adm = await session();
      const r = await fee(adm);
      expect(r.revenue).toEqual({ grossCents: 44000, refundedCents: 20000, contestedCents: 8000, netCents: 16000 });
      expect(r.feeCents).toBe(r.units * 100); // a taxa é por unidade emitida, não sobre a receita
    });

    it('por evento e por situação somam o total de unidades', async () => {
      const a = await event('Evento A');
      const b = await event('Evento B');
      await order(a, { items: [['Pista', 2]] });
      await order(b, { status: 'estornado', items: [['Pista', 3]] });
      const adm = await session();
      const r = await fee(adm);
      expect(r.byEvent).toEqual([
        { eventId: a.id, eventName: 'Evento A', units: 2, feeCents: 200 },
        { eventId: b.id, eventName: 'Evento B', units: 3, feeCents: 300 },
      ]);
      expect(r.byEvent.reduce((t: number, x: any) => t + x.units, 0)).toBe(r.units);
      expect(r.originOrders).toBe(2);
    });

    it('confirmação repetida do gateway não cria unidades novas (cada ingresso conta uma vez)', async () => {
      const e = await event();
      const buyer = await session('cliente');
      const slug = (await sql('select slug from events where id = $1', [e.id])).rows[0].slug;
      const orderId = (
        await json(
          await buyer.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: slug, items: [{ ticketTypeId: e.types.Pista, quantity: 3 }] }),
        )
      ).order.id as string;
      await buyer.post(`/orders/${orderId}/payment`, { method: 'pix' });
      const paymentId = (await sql('select gateway_payment_id from orders where id = $1', [orderId])).rows[0]
        .gateway_payment_id as string;
      mock.simulate.setStatus(paymentId, 'aprovado');
      const hook = () => {
        const body = JSON.stringify({
          id: `evt_${randomBytes(6).toString('hex')}`,
          paymentId,
          type: 'payment.approved',
        });
        return app.request('/api/webhooks/payments', {
          method: 'POST',
          headers: { 'x-mock-signature': mock.simulate.sign(body) },
          body,
        });
      };
      await Promise.all([hook(), hook(), hook()]);
      await hook();
      await backfillTickets({ db: createDrizzle(testDb.pool), qr: config.qr });
      const adm = await session();
      // O pedido foi aprovado "agora" (relógio simulado), em dezembro de 2026.
      const r = await fee(
        adm,
        `month=${(await sql("select to_char(paid_at at time zone 'America/Sao_Paulo','YYYY-MM') as m from orders where id = $1", [orderId])).rows[0].m}`,
      );
      expect(r.units).toBe(3);
      expect(r.feeCents).toBe(300);
    });

    it('detalhe por unidade paginado, em ordem de aprovação, com a situação atual', async () => {
      const e = await event();
      await order(e, { paidAt: '2026-12-10T15:00:00Z', items: [['Pista', 3]] });
      await order(e, { paidAt: '2026-12-11T15:00:00Z', status: 'estornado', items: [['Pista', 2]] });
      const adm = await session();
      const p1 = await fee(adm, 'month=2026-12&pageSize=2&page=1');
      const p3 = await fee(adm, 'month=2026-12&pageSize=2&page=3');
      expect([p1.total, p1.units_detail.length, p3.units_detail.length]).toEqual([5, 2, 1]);
      expect(p1.units_detail[0]).toMatchObject({
        eventName: 'Noite Neon Verão',
        current: 'Válido',
        paidAt: '2026-12-10T15:00:00.000Z',
      });
      expect(p3.units_detail[0].current).toBe('Cancelado (estorno)');
      const all = await fee(adm, 'month=2026-12&pageSize=200');
      expect(new Set(all.units_detail.map((u: any) => u.ticketId)).size).toBe(5);
      expect(JSON.stringify(all)).not.toMatch(/qr_payload|PX1\./); // sem código secreto nem QR no relatório
      expect((await adm.get('/admin/reports/fee?pageSize=201')).status).toBe(422);
    });

    it('mês inválido é recusado; sem mês usa o mês atual no fuso do evento', async () => {
      const e = await event();
      await order(e, { paidAt: '2026-12-10T15:00:00Z', items: [['Pista', 2]] });
      const adm = await session();
      for (const m of ['2026-13', '2026-1', 'dezembro', '2026-12-01', ''])
        expect([m, (await adm.get(`/admin/reports/fee?month=${m}`)).status]).toEqual([m, m === '' ? 200 : 422]);
      expect(await fee(adm, '')).toMatchObject({ month: '2026-12', units: 2 });
      clock.set('2027-01-01T02:30:00Z'); // ainda 31/12 em Brasília
      const adm2 = await session();
      expect((await json(await adm2.get('/admin/reports/fee'))).month).toBe('2026-12');
    });

    it('o mesmo mês dá o mesmo resultado antes e depois de mudanças posteriores nos ingressos', async () => {
      const e = await event();
      const o = await order(e, { items: [['Pista', 3]] });
      const adm = await session();
      const first = await fee(adm);
      await sql("update tickets set status = 'cancelado', cancelled_at = now() where order_id = $1", [o.id]);
      await sql("update orders set status = 'estornado' where id = $1", [o.id]);
      const second = await fee(adm);
      expect([second.units, second.feeCents]).toEqual([first.units, first.feeCents]);
    });
  });
});
