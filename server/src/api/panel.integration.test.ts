import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { createTicketIssuer, issueForOrder } from '../tickets/issuer';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';

describe.skipIf(!ADMIN_URL)('painel administrativo (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-12-12T15:00:00Z'); // 12:00 em Brasília
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const config = loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none' });
  let app: ReturnType<typeof createApp>;
  let hash = '';
  let n = 0;

  type Role = 'cliente' | 'validador' | 'administrador';
  async function session(role: Role = 'administrador', name?: string) {
    const i = ++n;
    const email = `${role}${i}@exemplo.com`;
    const id = (
      await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5) returning id', [
        name ?? `Pessoa ${role} ${i}`,
        email,
        role === 'cliente' ? String(60000000000 + i) : null,
        hash,
        role,
      ])
    ).rows[0].id as string;
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
    return {
      id,
      email,
      raw,
      get: (p: string) => raw('GET', p),
      post: (p: string, b: unknown = {}) => raw('POST', p, b),
    };
  }
  const json = async <T = any>(res: Response) => (await res.json()) as T;

  async function event(name = 'Noite Neon Verão', status = 'publicado', caps: { Pista?: number; VIP?: number } = {}) {
    const id = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values ($1,$2,'2026-12-20T22:00:00-03:00','Arena','Rua 1','d','Livre',$3) returning id`,
        [`evento-${++n}`, name, status],
      )
    ).rows[0].id as string;
    const mk = async (tname: string, price: number, total: number) =>
      (
        await sql(
          `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,$2,$3,$4,'2026-10-01T00:00:00-03:00','2026-12-20T20:00:00-03:00') returning id`,
          [id, tname, price, total],
        )
      ).rows[0].id as string;
    return {
      id,
      name,
      types: { Pista: await mk('Pista', 8000, caps.Pista ?? 100), VIP: await mk('VIP', 20000, caps.VIP ?? 50) },
    };
  }

  /** Pedido direto no banco, no estado e na data pedidos, com ingressos pelo emissor de verdade quando pago. */
  async function order(
    e: Awaited<ReturnType<typeof event>>,
    o: {
      buyer?: { name?: string; email?: string; cpf?: string };
      status?: string;
      paidAt?: string | null;
      createdAt?: string;
      items?: [keyof typeof e.types, number][];
      coupon?: string;
    } = {},
  ) {
    const i = ++n;
    const name = o.buyer?.name ?? 'Marina Costa';
    const email = o.buyer?.email ?? `comprador${i}@exemplo.com`;
    const userId = (
      await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5) returning id', [
        name,
        email,
        o.buyer?.cpf ?? String(70000000000 + i),
        hash,
        'cliente',
      ])
    ).rows[0].id as string;
    const items = o.items ?? [['Pista', 2]];
    const prices = { Pista: 8000, VIP: 20000 };
    const total = items.reduce((t, [k, q]) => t + q * prices[k], 0);
    const status = o.status ?? 'pago';
    const paidAt =
      status === 'pendente' || status === 'expirado' || status === 'nao_concluido'
        ? null
        : (o.paidAt ?? '2026-12-12T15:00:00Z');
    let promoterId: string | null = null;
    if (o.coupon)
      promoterId = (
        await sql(
          "insert into promoters (name, coupon_code) values ('Promoter', $1) on conflict (coupon_code) do update set name = excluded.name returning id",
          [o.coupon],
        )
      ).rows[0].id;
    const orderId = (
      await sql(
        `insert into orders (user_id,event_id,total_cents,status,paid_at,payment_method,created_at,promoter_id,gateway_payment_id) values ($1,$2,$3,$4,$5,'pix',$6,$7,$8) returning id`,
        [userId, e.id, total, status, paidAt, o.createdAt ?? paidAt ?? '2026-12-12T14:00:00Z', promoterId, `gw_${i}`],
      )
    ).rows[0].id as string;
    const orderItems: { orderItemId: string; ticketTypeId: string; quantity: number }[] = [];
    for (const [k, q] of items) {
      const itemId = (
        await sql(
          `insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,$4,$5) returning id`,
          [orderId, e.id, e.types[k], q, prices[k]],
        )
      ).rows[0].id as string;
      orderItems.push({ orderItemId: itemId, ticketTypeId: e.types[k], quantity: q });
    }
    if (status === 'pago' || status === 'estornado' || status === 'contestado') {
      await createDrizzle(testDb.pool).transaction(tx =>
        issueForOrder(tx, config.qr, { id: orderId, userId, eventId: e.id, items: orderItems }),
      );
      if (status !== 'pago')
        await sql(
          "update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'estorno' where order_id = $1",
          [orderId],
        );
      await sql('update ticket_types set quantity_sold = quantity_sold + $2 where id = $1', [
        orderItems[0]!.ticketTypeId,
        items.reduce((t, [, q]) => t + q, 0),
      ]);
    }
    const tix = (
      await sql(
        'select t.id, t.short_code, t.qr_payload from tickets t join ticket_types y on y.id = t.ticket_type_id where t.order_id = $1 order by y.name, t.unit_index',
        [orderId],
      )
    ).rows as { id: string; short_code: string; qr_payload: string }[];
    return { id: orderId, userId, email, name, tickets: tix, total };
  }

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    hash = await argon2Hasher.hash(PASSWORD);
    app = createApp({
      config,
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender() },
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
    clock.set('2026-12-12T15:00:00Z');
  });

  describe('acesso', () => {
    it('só administrador: visitante 401, cliente e validador 403, em todas as rotas; nada vaza nem muda', async () => {
      const e = await event();
      const o = await order(e);
      const client = await session('cliente');
      const staff = await session('validador');
      const routes: [string, string, unknown?][] = [
        ['GET', '/admin/overview'],
        ['GET', '/admin/orders'],
        ['GET', `/admin/orders/${o.id}`],
        ['GET', `/admin/events/${e.id}/buyers`],
        ['GET', `/admin/events/${e.id}/tickets`],
        ['GET', `/admin/events/${e.id}/entries`],
        ['POST', `/admin/tickets/${o.tickets[0]!.id}/cancel`, { reason: 'motivo válido', confirm: true }],
        ['POST', `/admin/orders/${o.id}/cancel-tickets`, { reason: 'motivo válido', confirm: true }],
      ];
      for (const [m, p, body] of routes) {
        const anon = await app.request(`/api${p}`, {
          method: m,
          headers: { origin: 'http://localhost', 'content-type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        expect([p, anon.status]).toEqual([p, 401]);
        expect([p, (await client.raw(m, p, body)).status]).toEqual([p, 403]);
        expect([p, (await staff.raw(m, p, body)).status]).toEqual([p, 403]);
      }
      expect((await sql("select count(*)::int as n from tickets where status = 'cancelado'")).rows[0].n).toBe(0);
    });

    it('respostas do painel nunca vão para cache compartilhado', async () => {
      const adm = await session();
      for (const p of ['/admin/overview', '/admin/orders'])
        expect((await adm.get(p)).headers.get('cache-control')).toBe('private, no-store');
    });
  });

  describe('visão geral (RF-55)', () => {
    it('vendas do dia e do mês no fuso do evento: 23h30 de Brasília ainda é o dia anterior, e a virada do mês respeita o fuso', async () => {
      const e = await event();
      await order(e, { paidAt: '2026-12-12T15:00:00Z' }); // 12/12 12h00 BRT: hoje
      await order(e, { paidAt: '2026-12-12T02:30:00Z' }); // 11/12 23h30 BRT: ontem
      await order(e, { paidAt: '2026-12-01T02:00:00Z' }); // 30/11 23h00 BRT: mês anterior
      await order(e, { paidAt: '2026-12-01T03:30:00Z' }); // 01/12 00h30 BRT: este mês
      const adm = await session();
      const ov = await json(await adm.get('/admin/overview'));
      expect(ov).toMatchObject({ today: '2026-12-12', month: '2026-12' });
      expect(ov.day.paid).toEqual({ orders: 1, tickets: 2, cents: 16000 });
      expect(ov.monthSales.paid).toEqual({ orders: 3, tickets: 6, cents: 48000 }); // hoje, ontem e 01/12 00h30
      const nov = await json(await adm.get('/admin/overview?month=2026-11'));
      expect(nov.monthSales.paid.orders).toBe(1);
      expect(ov.daily.map((d: any) => [d.day, d.orders])).toEqual([
        ['2026-12-01', 1],
        ['2026-12-11', 1],
        ['2026-12-12', 1],
      ]);
    });

    it('pago, estornado, contestado e pago sem estoque ficam separados; pendente e expirado não são venda', async () => {
      const e = await event();
      await order(e, { status: 'pago' });
      await order(e, { status: 'estornado', items: [['Pista', 1]] });
      await order(e, { status: 'contestado', items: [['VIP', 1]] });
      await order(e, { status: 'pago_sem_estoque', items: [['Pista', 3]] });
      await order(e, { status: 'pendente' });
      await order(e, { status: 'expirado' });
      await order(e, { status: 'nao_concluido' });
      const adm = await session();
      const ov = await json(await adm.get('/admin/overview'));
      expect(ov.day.paid).toEqual({ orders: 1, tickets: 2, cents: 16000 });
      expect(ov.day.refunded).toEqual({ orders: 1, tickets: 1, cents: 8000 });
      expect(ov.day.contested).toEqual({ orders: 1, tickets: 1, cents: 20000 });
      expect(ov.day.withoutStock).toEqual({ orders: 1, tickets: 0, cents: 24000 });
      expect(ov.attention.paidWithoutStock).toBe(1);
    });

    it('eventos em andamento com o que resta, tipo a tipo: capacidade − vendidos − reservas ainda válidas', async () => {
      const e = await event('Evento Ativo', 'publicado', { Pista: 10, VIP: 5 });
      await event('Rascunho', 'rascunho');
      await event('Encerrado', 'encerrado');
      await order(e, { items: [['Pista', 3]] }); // vendidos: 3
      const buyer = (await order(e, { status: 'pendente', items: [['Pista', 2]] })).id;
      await sql(
        "insert into reservations (order_id,ticket_type_id,quantity,expires_at,status) values ($1,$2,2,'2026-12-12T15:05:00Z','ativa')",
        [buyer, e.types.Pista],
      ); // reserva válida
      const old = (await order(e, { status: 'pendente', items: [['Pista', 1]] })).id;
      await sql(
        "insert into reservations (order_id,ticket_type_id,quantity,expires_at,status) values ($1,$2,1,'2026-12-12T14:00:00Z','ativa')",
        [old, e.types.Pista],
      ); // vencida: não conta
      const adm = await session();
      const ov = await json(await adm.get('/admin/overview'));
      expect(ov.events).toHaveLength(1);
      const ev = ov.events[0];
      expect(ev.name).toBe('Evento Ativo');
      const pista = ev.types.find((t: any) => t.name === 'Pista');
      expect(pista).toMatchObject({ capacity: 10, sold: 3, reserved: 2, remaining: 5 });
      expect(ev.totals).toEqual({ capacity: 15, sold: 3, reserved: 2, remaining: 10 });
    });

    it('mês inválido é recusado', async () => {
      const adm = await session();
      for (const m of ['2026-13', '2026-1', 'dezembro', '2026-12-01'])
        expect((await adm.get(`/admin/overview?month=${m}`)).status, m).toBe(422);
    });
  });

  describe('pedidos (RF-56)', () => {
    async function seed() {
      const a = await event('Evento A');
      const b = await event('Evento B');
      const o1 = await order(a, {
        buyer: { name: 'Ana Souza', email: 'ana@exemplo.com', cpf: '52998224725' },
        status: 'pago',
        createdAt: '2026-12-10T12:00:00Z',
        paidAt: '2026-12-10T12:05:00Z',
        coupon: 'JOAO10',
      });
      const o2 = await order(a, {
        buyer: { name: 'José da Conceição', email: 'jose@exemplo.com' },
        status: 'expirado',
        createdAt: '2026-12-11T12:00:00Z',
      });
      const o3 = await order(b, {
        buyer: { name: 'Beatriz Lopes', email: 'bia@exemplo.com' },
        status: 'estornado',
        createdAt: '2026-12-12T02:30:00Z',
        paidAt: '2026-12-12T02:35:00Z',
        items: [['Pista', 1]],
      });
      const o4 = await order(b, {
        buyer: { name: 'Carlos Dias', email: 'carlos@exemplo.com' },
        status: 'contestado',
        createdAt: '2026-12-12T13:00:00Z',
        paidAt: '2026-12-12T13:05:00Z',
        items: [['VIP', 1]],
      });
      return { a, b, o1, o2, o3, o4, adm: await session() };
    }

    it('lista tudo do mais novo ao mais antigo, com a situação de cada pagamento', async () => {
      const { adm } = await seed();
      const r = await json(await adm.get('/admin/orders'));
      expect(r.total).toBe(4);
      const nn = r.orders.map((o: any) => o.number);
      expect([...nn].sort((x, y) => y - x)).toEqual(nn); // do mais novo ao mais antigo
      const by = Object.fromEntries(r.orders.map((o: any) => [o.status, o.situation]));
      expect(by).toMatchObject({
        pago: 'Pago',
        expirado: 'Expirado',
        estornado: 'Estornado',
        contestado: 'Contestado (chargeback)',
      });
    });

    it('filtra por evento, por status e pelas duas coisas', async () => {
      const { a, b, adm } = await seed();
      expect((await json(await adm.get(`/admin/orders?eventId=${a.id}`))).total).toBe(2);
      expect((await json(await adm.get(`/admin/orders?eventId=${b.id}`))).total).toBe(2);
      expect(
        (await json(await adm.get('/admin/orders?status=estornado'))).orders.map((o: any) => o.buyer.name),
      ).toEqual(['Beatriz Lopes']);
      expect(
        (await json(await adm.get(`/admin/orders?eventId=${b.id}&status=contestado`))).orders.map(
          (o: any) => o.buyer.name,
        ),
      ).toEqual(['Carlos Dias']);
      expect((await json(await adm.get(`/admin/orders?eventId=${a.id}&status=contestado`))).total).toBe(0);
    });

    it('filtra por período no fuso do evento, com as duas pontas incluídas (23h30 de Brasília ainda é o dia anterior)', async () => {
      const { adm } = await seed();
      // o3 foi criado em 12/12 02:30 UTC = 11/12 23:30 BRT.
      const day11 = await json(await adm.get('/admin/orders?from=2026-12-11&to=2026-12-11'));
      expect(day11.orders.map((o: any) => o.buyer.name).sort()).toEqual(['Beatriz Lopes', 'José da Conceição']);
      const day12 = await json(await adm.get('/admin/orders?from=2026-12-12&to=2026-12-12'));
      expect(day12.orders.map((o: any) => o.buyer.name)).toEqual(['Carlos Dias']);
      expect((await json(await adm.get('/admin/orders?from=2026-12-10&to=2026-12-12'))).total).toBe(4);
      expect((await json(await adm.get('/admin/orders?from=2026-12-13'))).total).toBe(0);
      expect((await json(await adm.get('/admin/orders?to=2026-12-09'))).total).toBe(0);
    });

    it('busca por número do pedido (PX-10005, 10005) e por nome ou e-mail, sem acento', async () => {
      const { adm } = await seed();
      const byNumber = await json(await adm.get('/admin/orders?q=PX-10003'));
      expect(byNumber.orders.map((o: any) => o.number)).toEqual([10003]);
      expect((await json(await adm.get('/admin/orders?q=10003'))).total).toBe(1);
      expect((await json(await adm.get('/admin/orders?q=10099'))).total).toBe(0);
      expect((await json(await adm.get('/admin/orders?q=conceicao'))).orders.map((o: any) => o.buyer.name)).toEqual([
        'José da Conceição',
      ]);
      expect((await json(await adm.get('/admin/orders?q=BIA@'))).total).toBe(1);
    });

    it('CPF sempre mascarado, cupom do promoter e contagem de ingressos cancelados', async () => {
      const { adm, o1 } = await seed();
      await sql("update tickets set status = 'cancelado', cancelled_at = now() where id = $1", [o1.tickets[0]!.id]);
      const r = await json(await adm.get('/admin/orders?q=ana@exemplo'));
      const ana = r.orders[0];
      expect(ana.buyer.cpf).toBe('***.982.247-**');
      expect(JSON.stringify(r)).not.toMatch(/52998224725|529\.982/);
      expect(ana).toMatchObject({ coupon: 'JOAO10', tickets: 2, cancelledTickets: 1 });
    });

    it('paginação: total, páginas e limite de tamanho', async () => {
      const e = await event();
      for (let i = 0; i < 7; i++) await order(e);
      const adm = await session();
      const p1 = await json(await adm.get('/admin/orders?pageSize=3&page=1'));
      const p3 = await json(await adm.get('/admin/orders?pageSize=3&page=3'));
      expect([p1.total, p1.orders.length, p3.orders.length]).toEqual([7, 3, 1]);
      const seen = new Set(
        [...p1.orders, ...(await json(await adm.get('/admin/orders?pageSize=3&page=2'))).orders, ...p3.orders].map(
          (o: any) => o.id,
        ),
      );
      expect(seen.size).toBe(7);
      for (const bad of ['pageSize=101', 'pageSize=0', 'page=0', 'page=x'])
        expect((await adm.get(`/admin/orders?${bad}`)).status, bad).toBe(422);
    });

    it('filtros inválidos são recusados com o campo', async () => {
      const adm = await session();
      for (const q of [
        'status=qualquer',
        'eventId=nao-uuid',
        'from=12/12/2026',
        'from=2026-12-12&to=2026-12-01',
        'q=ab',
        'from=2026-02-31',
      ]) {
        expect((await adm.get(`/admin/orders?${q}`)).status, q).toBe(422);
      }
      // Tentativa de injeção no texto da busca é só texto.
      expect((await adm.get('/admin/orders?q=' + encodeURIComponent("'; drop table orders; --"))).status).toBe(200);
      expect((await sql('select count(*)::int as n from users')).rows[0].n).toBeGreaterThan(0);
    });

    it('detalhe do pedido: itens, ingressos, comprador, forma de pagamento e id no gateway; 404 para o que não existe', async () => {
      const e = await event();
      const o = await order(e, {
        items: [
          ['Pista', 2],
          ['VIP', 1],
        ],
        buyer: { cpf: '52998224725' },
      });
      const adm = await session();
      const d = (await json(await adm.get(`/admin/orders/${o.id}`))).order;
      expect(d).toMatchObject({
        number: 10001,
        status: 'pago',
        situation: 'Pago',
        paymentMethod: 'pix',
        totalCents: 36000,
      });
      expect(d.items.map((i: any) => [i.name, i.quantity, i.subtotalCents])).toEqual([
        ['Pista', 2, 16000],
        ['VIP', 1, 20000],
      ]);
      expect(d.tickets).toHaveLength(3);
      expect(d.buyer.cpf).toBe('***.982.247-**');
      expect(d.gatewayPaymentId).toMatch(/^gw_/);
      expect((await adm.get(`/admin/orders/${crypto.randomUUID()}`)).status).toBe(404);
      expect((await adm.get('/admin/orders/nao-uuid')).status).toBe(404);
    });
  });

  describe('compradores e ingressos por evento (RF-57)', () => {
    it('compradores do evento: só quem tem pedido pago (ou estornado, contestado, sem estoque), com os números de cada um', async () => {
      const e = await event('Evento A');
      const other = await event('Evento B');
      const ana = await order(e, {
        buyer: { name: 'Ana Souza', email: 'ana@exemplo.com', cpf: '52998224725' },
        items: [
          ['Pista', 2],
          ['VIP', 1],
        ],
      });
      await order(e, { status: 'pendente' });
      await order(e, { status: 'expirado' });
      await order(other, { buyer: { name: 'Beatriz Lopes' } });
      await sql("update tickets set status = 'cancelado', cancelled_at = now() where id = $1", [ana.tickets[0]!.id]);
      const adm = await session();
      const r = await json(await adm.get(`/admin/events/${e.id}/buyers`));
      expect(r.total).toBe(1);
      expect(r.buyers[0]).toMatchObject({
        name: 'Ana Souza',
        cpf: '***.982.247-**',
        orders: 1,
        tickets: 2,
        cancelled: 1,
        entered: 0,
        paidCents: 36000,
      });
      expect(JSON.stringify(r)).not.toMatch(/52998224725/);
      expect((await json(await adm.get(`/admin/events/${e.id}/buyers?q=souz`))).total).toBe(1);
      expect((await json(await adm.get(`/admin/events/${e.id}/buyers?q=zzz`))).total).toBe(0);
      expect((await adm.get(`/admin/events/${e.id}/buyers?q=ab`)).status).toBe(422);
      expect((await adm.get(`/admin/events/${crypto.randomUUID()}/buyers`)).status).toBe(404);
    });

    it('ingressos emitidos: filtros por situação, tipo e busca, com quem validou e o motivo do cancelamento', async () => {
      const e = await event();
      const o = await order(e, {
        buyer: { name: 'Marina Costa', email: 'marina@exemplo.com' },
        items: [
          ['Pista', 2],
          ['VIP', 1],
        ],
      });
      const val = await session('validador', 'Carlos Portaria');
      await sql("update tickets set status = 'utilizado', used_at = now(), validated_by = $2 where id = $1", [
        o.tickets[0]!.id,
        val.id,
      ]);
      await sql(
        "update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'pedido do cliente' where id = $1",
        [o.tickets[1]!.id],
      );
      const adm = await session();
      const all = await json(await adm.get(`/admin/events/${e.id}/tickets`));
      expect(all.total).toBe(3);
      const used = (await json(await adm.get(`/admin/events/${e.id}/tickets?status=utilizado`))).tickets[0];
      expect(used).toMatchObject({
        shortCode: o.tickets[0]!.short_code,
        validatorName: 'Carlos Portaria',
        typeName: 'Pista',
      });
      const cancelled = (await json(await adm.get(`/admin/events/${e.id}/tickets?status=cancelado`))).tickets[0];
      expect(cancelled).toMatchObject({ cancelReason: 'pedido do cliente' });
      expect((await json(await adm.get(`/admin/events/${e.id}/tickets?typeId=${e.types.VIP}`))).total).toBe(1);
      expect(
        (await json(await adm.get(`/admin/events/${e.id}/tickets?q=${o.tickets[2]!.short_code}`))).tickets[0].id,
      ).toBe(o.tickets[2]!.id);
      expect((await json(await adm.get(`/admin/events/${e.id}/tickets?q=marina@`))).total).toBe(3);
      for (const bad of ['status=x', 'typeId=nao-uuid', 'q=ab'])
        expect((await adm.get(`/admin/events/${e.id}/tickets?${bad}`)).status, bad).toBe(422);
      expect(JSON.stringify(all)).not.toContain(o.tickets[0]!.qr_payload); // nem o QR nem o código secreto saem em lista
    });
  });

  describe('entradas em tempo real (RF-61)', () => {
    it('reflete cada leitura da portaria na hora: contador, tipo, validador, resultado e tentativas', async () => {
      const e = await event();
      const o = await order(e, {
        items: [
          ['Pista', 2],
          ['VIP', 1],
        ],
      });
      const v1 = await session('validador', 'Carlos Portaria');
      const v2 = await session('validador', 'Dani Entrada');
      const adm = await session();
      const read = async () => json(await adm.get(`/admin/events/${e.id}/entries`));

      expect((await read()).counter).toEqual({ entered: 0, total: 3 });
      clock.advance(1000);
      await v1.post('/gate/scan', { eventId: e.id, qr: o.tickets[0]!.qr_payload });
      let r = await read();
      expect(r.counter).toEqual({ entered: 1, total: 3 });
      expect(r.recent[0]).toMatchObject({
        result: 'valido',
        method: 'camera',
        typeName: 'Pista',
        validator: 'Carlos Portaria',
      });

      clock.advance(1000);
      await v2.post('/gate/scan', { eventId: e.id, qr: o.tickets[0]!.qr_payload }); // amarelo
      clock.advance(1000);
      await v2.post('/gate/scan', { eventId: e.id, qr: o.tickets[2]!.qr_payload }); // VIP
      clock.advance(1000);
      await v2.post('/gate/scan', { eventId: e.id, qr: 'PX1.1.lixo' }); // inválido
      r = await read();
      expect(r.counter).toEqual({ entered: 2, total: 3 });
      expect(r.byType).toEqual([
        { typeName: 'Pista', entered: 1, total: 2 },
        { typeName: 'VIP', entered: 1, total: 1 },
      ]);
      expect(r.attempts).toEqual({ valido: 2, ja_utilizado: 1, invalido: 1 });
      expect(r.byValidator).toEqual([
        { name: 'Carlos Portaria', entered: 1 },
        { name: 'Dani Entrada', entered: 1 },
      ]);
      expect(r.recent).toHaveLength(4);
      expect(r.recent[0].result).toBe('invalido'); // o mais recente primeiro
      expect(r.recent[0].shortCode).toBeNull();
      expect(JSON.stringify(r)).not.toContain(o.tickets[0]!.qr_payload);
      expect(new Date(r.serverTime).toISOString()).toBe(r.serverTime);
    });
  });

  describe('cancelamento de ingresso (RF-62)', () => {
    it('exige confirmação e motivo; sem eles nada muda', async () => {
      const e = await event();
      const o = await order(e);
      const adm = await session();
      const t = o.tickets[0]!.id;
      for (const body of [
        { reason: 'motivo válido', confirm: false },
        { reason: 'ok', confirm: true },
        { reason: '   ', confirm: true },
        { reason: 'x'.repeat(601), confirm: true },
        { confirm: true },
        { reason: 'motivo válido' },
      ]) {
        const res = await adm.post(`/admin/tickets/${t}/cancel`, body);
        expect([JSON.stringify(body).slice(0, 40), res.status]).toEqual([JSON.stringify(body).slice(0, 40), 422]);
      }
      expect((await sql('select status from tickets where id = $1', [t])).rows[0].status).toBe('valido');
      expect((await sql("select count(*)::int as n from audit_log where action = 'ingresso.cancelar'")).rows[0].n).toBe(
        0,
      );
    });

    it('cancela, grava a trilha (autor, momento, motivo, antes e depois) e não apaga nem repõe nada', async () => {
      const e = await event();
      const o = await order(e, { items: [['Pista', 3]], paidAt: '2026-12-10T12:00:00Z' });
      const adm = await session('administrador', 'Admin Teste');
      const before = {
        orders: (await sql('select count(*)::int as n from orders')).rows[0].n,
        items: (await sql('select count(*)::int as n from order_items')).rows[0].n,
        tickets: (await sql('select count(*)::int as n from tickets')).rows[0].n,
        paid: (await sql('select paid_at, status, total_cents from orders where id = $1', [o.id])).rows[0],
        sold: (await sql('select quantity_sold from ticket_types where id = $1', [e.types.Pista])).rows[0]
          .quantity_sold,
      };
      const res = await adm.post(`/admin/tickets/${o.tickets[0]!.id}/cancel`, {
        reason: 'Pedido do comprador, reembolso feito no gateway',
        confirm: true,
      });
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body).toMatchObject({ cancelled: 1, alreadyCancelled: 0, used: 0 });
      expect(body.guidance).toMatch(/cliente faz o estorno no painel do gateway/);

      const t = (await sql('select status, cancelled_at, cancel_reason from tickets where id = $1', [o.tickets[0]!.id]))
        .rows[0];
      expect(t.status).toBe('cancelado');
      expect(new Date(t.cancelled_at).toISOString()).toBe('2026-12-12T15:00:00.000Z');
      expect(t.cancel_reason).toBe('Pedido do comprador, reembolso feito no gateway');

      const audit = (
        await sql(
          "select actor_id, entity, entity_id, reason, before_json, after_json, created_at from audit_log where action = 'ingresso.cancelar'",
        )
      ).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actor_id: adm.id,
        entity: 'ticket',
        entity_id: o.tickets[0]!.id,
        reason: 'Pedido do comprador, reembolso feito no gateway',
        before_json: { status: 'valido' },
      });
      expect(audit[0].after_json).toMatchObject({
        status: 'cancelado',
        orderId: o.id,
        shortCode: o.tickets[0]!.short_code,
      });

      // Nada apagado, nada reposto: pedido, itens, ingressos, paid_at e o contador de vendidos ficam como estavam.
      expect({
        orders: (await sql('select count(*)::int as n from orders')).rows[0].n,
        items: (await sql('select count(*)::int as n from order_items')).rows[0].n,
        tickets: (await sql('select count(*)::int as n from tickets')).rows[0].n,
        paid: (await sql('select paid_at, status, total_cents from orders where id = $1', [o.id])).rows[0],
        sold: (await sql('select quantity_sold from ticket_types where id = $1', [e.types.Pista])).rows[0]
          .quantity_sold,
      }).toEqual(before);
    });

    it('depois de cancelado, a portaria recusa (vermelho), o comprador vê "cancelado" sem QR, e o contador de ingressos cai', async () => {
      const e = await event();
      const o = await order(e, { items: [['Pista', 2]] });
      const adm = await session();
      const val = await session('validador');
      expect(
        (await adm.post(`/admin/tickets/${o.tickets[0]!.id}/cancel`, { reason: 'fraude confirmada', confirm: true }))
          .status,
      ).toBe(200);

      const scan = await json(await val.post('/gate/scan', { eventId: e.id, qr: o.tickets[0]!.qr_payload }));
      expect(scan).toMatchObject({
        result: 'cancelado',
        message: 'Ingresso cancelado',
        counter: { entered: 0, total: 1 },
      });
      expect((await json(await val.post('/gate/scan', { eventId: e.id, qr: o.tickets[1]!.qr_payload }))).result).toBe(
        'valido',
      ); // o outro segue valendo

      const buyer = await login(o.email);
      const detail = (await json(await buyer.get(`/tickets/${o.tickets[0]!.id}`))).ticket;
      expect(detail).toMatchObject({ status: 'cancelado', qrPayload: null });
      const live = await json(await adm.get(`/admin/events/${e.id}/entries`));
      expect(live.counter).toEqual({ entered: 1, total: 1 });
      expect(live.attempts).toMatchObject({ cancelado: 1, valido: 1 });
    });

    async function login(email: string) {
      let cookie = '';
      let csrf = '';
      const raw = (method: string, path: string, body?: unknown) =>
        app.request(`/api${path}`, {
          method,
          headers: {
            origin: 'http://localhost',
            ...(cookie ? { cookie } : {}),
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      cookie = (await raw('POST', '/auth/login', { email, password: PASSWORD })).headers
        .get('set-cookie')!
        .split(';')[0]!;
      csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
      return { get: (p: string) => raw('GET', p) };
    }

    it('cancelar de novo é inofensivo: responde ok, não duplica a trilha nem muda o motivo', async () => {
      const e = await event();
      const o = await order(e);
      const adm = await session();
      await adm.post(`/admin/tickets/${o.tickets[0]!.id}/cancel`, { reason: 'primeiro motivo', confirm: true });
      const again = await json(
        await adm.post(`/admin/tickets/${o.tickets[0]!.id}/cancel`, { reason: 'outro motivo', confirm: true }),
      );
      expect(again).toMatchObject({ cancelled: 0, alreadyCancelled: 1 });
      expect((await sql("select count(*)::int as n from audit_log where action = 'ingresso.cancelar'")).rows[0].n).toBe(
        1,
      );
      expect(
        (await sql('select cancel_reason from tickets where id = $1', [o.tickets[0]!.id])).rows[0].cancel_reason,
      ).toBe('primeiro motivo');
    });

    it('ingresso que já entrou não pode ser cancelado (409), e continua utilizado', async () => {
      const e = await event();
      const o = await order(e);
      const val = await session('validador');
      await val.post('/gate/scan', { eventId: e.id, qr: o.tickets[0]!.qr_payload });
      const adm = await session();
      const res = await adm.post(`/admin/tickets/${o.tickets[0]!.id}/cancel`, {
        reason: 'motivo válido',
        confirm: true,
      });
      expect([res.status, (await json(res)).erro.codigo]).toEqual([409, 'ingresso_utilizado']);
      expect((await sql('select status from tickets where id = $1', [o.tickets[0]!.id])).rows[0].status).toBe(
        'utilizado',
      );
      expect((await sql("select count(*)::int as n from audit_log where action = 'ingresso.cancelar'")).rows[0].n).toBe(
        0,
      );
    });

    it('cancelar o pedido inteiro: cancela os válidos, relata os que já entraram e deixa uma linha de trilha por ingresso', async () => {
      const e = await event();
      const o = await order(e, { items: [['Pista', 3]] });
      const val = await session('validador');
      await val.post('/gate/scan', { eventId: e.id, qr: o.tickets[0]!.qr_payload });
      const adm = await session();
      const res = await json(
        await adm.post(`/admin/orders/${o.id}/cancel-tickets`, { reason: 'cancelamento do pedido', confirm: true }),
      );
      expect(res).toMatchObject({ cancelled: 2, alreadyCancelled: 0, used: 1 });
      expect(
        (await sql('select status from tickets where order_id = $1 order by unit_index', [o.id])).rows.map(
          r => r.status,
        ),
      ).toEqual(['utilizado', 'cancelado', 'cancelado']);
      expect((await sql("select count(*)::int as n from audit_log where action = 'ingresso.cancelar'")).rows[0].n).toBe(
        2,
      );
      const detail = (await json(await adm.get(`/admin/orders/${o.id}`))).order;
      expect(detail.status).toBe('pago'); // o pedido não muda: o estorno financeiro é do cliente, no gateway
      expect(detail.trail.filter((t: any) => t.action === 'ingresso.cancelar')).toHaveLength(2);
      expect(detail.trail[0]).toMatchObject({ reason: 'cancelamento do pedido' });
      expect(
        (
          await adm.post(`/admin/orders/${crypto.randomUUID()}/cancel-tickets`, {
            reason: 'motivo válido',
            confirm: true,
          })
        ).status,
      ).toBe(404);
    });

    it('cancelamento e leitura ao mesmo tempo: ou o ingresso entrou, ou foi cancelado, nunca os dois', async () => {
      const e = await event();
      const adm = await session();
      const val = await session('validador');
      let entered = 0;
      let cancelled = 0;
      for (let round = 0; round < 20; round++) {
        const o = await order(e, { items: [['Pista', 1]] });
        const t = o.tickets[0]!;
        const [c, s] = await Promise.all([
          adm.post(`/admin/tickets/${t.id}/cancel`, { reason: 'concorrência de teste', confirm: true }),
          val.post('/gate/scan', { eventId: e.id, qr: t.qr_payload }),
        ]);
        const scan = (await json(s)).result;
        const final = (await sql('select status from tickets where id = $1', [t.id])).rows[0].status as string;
        if (final === 'utilizado') {
          entered++;
          expect([c.status, scan], `rodada ${round}`).toEqual([409, 'valido']);
        } else {
          cancelled++;
          expect([c.status, scan, final], `rodada ${round}`).toEqual([200, 'cancelado', 'cancelado']);
        }
      }
      expect(entered + cancelled).toBe(20);
    });

    it('ingresso inexistente 404; identificador inválido 404; perfis sem permissão não cancelam', async () => {
      const e = await event();
      const o = await order(e);
      const adm = await session();
      const staff = await session('validador');
      expect(
        (await adm.post(`/admin/tickets/${crypto.randomUUID()}/cancel`, { reason: 'motivo válido', confirm: true }))
          .status,
      ).toBe(404);
      expect(
        (await adm.post('/admin/tickets/nao-uuid/cancel', { reason: 'motivo válido', confirm: true })).status,
      ).toBe(404);
      expect(
        (await staff.post(`/admin/tickets/${o.tickets[0]!.id}/cancel`, { reason: 'motivo válido', confirm: true }))
          .status,
      ).toBe(403);
      expect((await sql('select status from tickets where id = $1', [o.tickets[0]!.id])).rows[0].status).toBe('valido');
    });

    it('a data original do pagamento segue valendo para a taxa depois do cancelamento (evidência da taxa)', async () => {
      const e = await event();
      const o = await order(e, { items: [['Pista', 2]], paidAt: '2026-11-30T12:00:00Z' });
      const adm = await session();
      await adm.post(`/admin/orders/${o.id}/cancel-tickets`, { reason: 'cancelamento do pedido', confirm: true });
      const row = (
        await sql(
          "select count(t.id)::int as emitidos from orders o join tickets t on t.order_id = o.id where to_char(o.paid_at at time zone 'America/Sao_Paulo','YYYY-MM') = '2026-11'",
        )
      ).rows[0];
      expect(row.emitidos).toBe(2); // continuam emitidos (e contados) em novembro, mesmo cancelados
    });
  });

  describe('compradores, ingresso e promoter (ADM09, ADM12, ADM13, ADM15)', () => {
    it('lista de compradores: busca por nome sem acento, e-mail e CPF completo; CPF sempre mascarado', async () => {
      const e = await event();
      await order(e, { buyer: { name: 'Márcia Lopes', email: 'marcia@exemplo.com', cpf: '52998224725' } });
      await order(e, { buyer: { name: 'João Pedro', email: 'joao@exemplo.com' } });
      const adm = await session();
      const all = await json(await adm.get('/admin/buyers'));
      expect(all.total).toBe(2);
      expect(all.buyers.every((b: { cpf: string }) => /^\*\*\*\.\d{3}\.\d{3}-\*\*$/.test(b.cpf))).toBe(true);
      const names = async (q: string) =>
        (await json(await adm.get(`/admin/buyers?q=${encodeURIComponent(q)}`))).buyers.map(
          (b: { name: string }) => b.name,
        );
      expect(await names('marcia')).toEqual(['Márcia Lopes']);
      expect(await names('joao@')).toEqual(['João Pedro']);
      expect(await names('529.982.247-25')).toEqual(['Márcia Lopes']);
      expect((await adm.get('/admin/buyers?q=ab')).status).toBe(422);
      const m = all.buyers.find((b: { name: string }) => b.name === 'Márcia Lopes');
      expect(m).toMatchObject({ orders: 1, tickets: 2 });
    });

    it('detalhe do comprador: dados, pedidos, ingressos e correções (sem os valores antigos); CPF completo só sob demanda, na trilha', async () => {
      const e = await event('Festa Detalhe');
      const o = await order(e, { buyer: { name: 'Márcia Lopes', email: 'marcia@exemplo.com', cpf: '52998224725' } });
      const adm = await session();
      const d = await json(await adm.get(`/admin/buyers/${o.userId}`));
      expect(d.buyer).toMatchObject({ name: 'Márcia Lopes', email: 'marcia@exemplo.com', cpf: '***.982.247-**' });
      expect(d.orders).toHaveLength(1);
      expect(d.orders[0]).toMatchObject({ id: o.id, status: 'pago', units: 2, event: { name: 'Festa Detalhe' } });
      expect(d.tickets).toHaveLength(2);
      expect(JSON.stringify(d)).not.toContain('52998224725');

      // Correção de e-mail pelo administrador (rota já existente), com motivo: aparece no histórico sem os valores.
      const fix = await adm.raw('PATCH', `/admin/users/${o.userId}/identity`, {
        email: 'marcia.lopes@exemplo.com',
        reason: 'Pedido da compradora por e-mail',
      });
      expect(fix.status).toBe(200);
      const d2 = await json(await adm.get(`/admin/buyers/${o.userId}`));
      expect(d2.buyer.email).toBe('marcia.lopes@exemplo.com');
      expect(d2.corrections).toHaveLength(1);
      expect(d2.corrections[0]).toMatchObject({ fields: ['email'], reason: 'Pedido da compradora por e-mail' });
      expect(JSON.stringify(d2.corrections)).not.toContain('marcia@exemplo.com');

      const shown = await adm.post(`/admin/buyers/${o.userId}/cpf`);
      expect(await json(shown)).toEqual({ cpf: '52998224725' });
      const trail = (
        await sql(
          "select actor_id, before_json, after_json from audit_log where action = 'usuario.cpf_visualizado' and entity_id = $1",
          [o.userId],
        )
      ).rows;
      expect(trail).toHaveLength(1);
      expect(trail[0].actor_id).toBe(adm.id);
      expect(JSON.stringify(trail[0])).not.toContain('52998224725');

      // Membro da equipe não é "comprador".
      expect((await adm.get(`/admin/buyers/${adm.id}`)).status).toBe(404);
    });

    it('detalhe do ingresso: tipo, evento, pedido, comprador mascarado, entrada e cancelamento com autor e data; sem código nem QR', async () => {
      const e = await event('Festa Ingresso');
      const o = await order(e, { items: [['VIP', 2]], buyer: { cpf: '52998224725' } });
      const adm = await session('administrador', 'Ana Admin');
      const v = await session('validador', 'Carlos Portaria');
      await v.post('/gate/scan', { eventId: e.id, qr: o.tickets[0]!.qr_payload });
      clock.advance(60_000);
      await adm.post(`/admin/tickets/${o.tickets[1]!.id}/cancel`, { reason: 'Pedido do comprador', confirm: true });

      const used = await json(await adm.get(`/admin/tickets/${o.tickets[0]!.id}`));
      expect(used.ticket).toMatchObject({
        status: 'utilizado',
        typeName: 'VIP',
        event: { name: 'Festa Ingresso' },
        order: { id: o.id },
        buyer: { cpf: '***.982.247-**' },
        entry: { validator: 'Carlos Portaria' },
        cancellation: null,
      });
      expect(used.attempts).toEqual([expect.objectContaining({ result: 'valido', validator: 'Carlos Portaria' })]);
      const text = JSON.stringify(used);
      expect(text).not.toContain(o.tickets[0]!.qr_payload);
      expect(text).not.toContain('52998224725');

      const cancelled = await json(await adm.get(`/admin/tickets/${o.tickets[1]!.id}`));
      expect(cancelled.ticket.status).toBe('cancelado');
      expect(cancelled.ticket.cancellation).toMatchObject({ reason: 'Pedido do comprador', by: 'Ana Admin' });
      expect(cancelled.ticket.cancellation.at).toBe(clock.now().toISOString());
      expect((await adm.get(`/admin/tickets/${crypto.randomUUID()}`)).status).toBe(404);
    });

    it('exportação das vendas de um promoter, com os filtros da tela e na trilha', async () => {
      const e = await event('Festa Promoter');
      await order(e, { coupon: 'MARINA10', items: [['Pista', 3]] });
      await order(e, { coupon: 'OUTRO10', items: [['Pista', 1]] });
      const adm = await session();
      const pid = (await sql("select id from promoters where coupon_code = 'MARINA10'")).rows[0].id;
      const res = await adm.get(`/admin/exports/promoters/${pid}/orders.csv?eventId=${e.id}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="vendas-promoter_marina10/);
      const csv = await res.text();
      expect(csv).toContain('Festa Promoter');
      expect(csv).toMatch(/Total;;;3;240,00/);
      expect(csv).toContain('Sem desconto e sem comissão');
      expect(csv).not.toContain('OUTRO10');
      expect(
        (await sql("select count(*)::int as n from audit_log where action = 'exportacao.vendas_promoter'")).rows[0].n,
      ).toBe(1);
    });

    it('validador recebe 403 em cada rota nova (e cliente também)', async () => {
      const e = await event();
      const o = await order(e);
      const pid = (await sql("insert into promoters (name, coupon_code) values ('P', 'PROMO1') returning id")).rows[0]
        .id;
      for (const role of ['validador', 'cliente'] as const) {
        const s = await session(role);
        const calls = [
          s.get('/admin/buyers'),
          s.get(`/admin/buyers/${o.userId}`),
          s.post(`/admin/buyers/${o.userId}/cpf`),
          s.get(`/admin/tickets/${o.tickets[0]!.id}`),
          s.get(`/admin/exports/promoters/${pid}/orders.csv`),
          s.get(`/admin/reports/promoters/${pid}`),
          s.get('/admin/promoters'),
          s.get('/admin/team'),
          s.get(`/admin/events/${e.id}/entries`),
        ];
        expect(
          (await Promise.all(calls)).map(r => r.status),
          role,
        ).toEqual(Array(calls.length).fill(403));
      }
      expect(
        (await sql("select count(*)::int as n from audit_log where action = 'usuario.cpf_visualizado'")).rows[0].n,
      ).toBe(0);
    });
  });
});
