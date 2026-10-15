import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createMockGateway, type MockGateway } from '../payments/mockGateway';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { createTicketIssuer } from '../tickets/issuer';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';

/**
 * Lotes por tipo de ingresso (0013, 15/10/2026), pela API: virada por esgotamento, por data e manual; sobra passada e descartada;
 * compra dividida entre lotes; compra simultânea no último ingresso; reserva que vence depois da virada; preço preso na reserva; tipo
 * sem próximo lote; relatório e exportação por lote; regras do painel; tipo sem lote de uma versão anterior.
 */
describe.skipIf(!ADMIN_URL)('lotes por tipo de ingresso (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  let mock: MockGateway;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const hash = { value: '' };
  let n = 0;
  const config = loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none', RESERVATION_MINUTES: '30' });

  async function session(role: 'administrador' | 'validador' | 'cliente' = 'cliente') {
    const i = ++n;
    const email = `${role}${i}@partyx.test`;
    const { rows } = await sql(
      `insert into users (name, email, cpf, password_hash, role) values ($1,$2,$3,$4,$5) returning id`,
      [`Pessoa ${i} Teste`, email, role === 'cliente' ? String(10000000000 + i) : null, hash.value, role],
    );
    let cookie = '';
    let csrf = '';
    const raw = async (method: string, path: string, json?: unknown) => {
      const headers: Record<string, string> = { origin: 'http://localhost', 'x-forwarded-for': '203.0.113.7' };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      if (json !== undefined) headers['content-type'] = 'application/json';
      return app.request(`/api${path}`, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) });
    };
    const login = await raw('POST', '/auth/login', { email, password: PASSWORD });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    return {
      id: rows[0].id as string,
      get: (p: string) => raw('GET', p),
      post: (p: string, json: unknown = {}) => raw('POST', p, json),
      patch: (p: string, json: unknown) => raw('PATCH', p, json),
      del: (p: string) => raw('DELETE', p),
    };
  }
  type Session = Awaited<ReturnType<typeof session>>;
  const json = async <T = any>(res: Response) => (await res.json()) as T;
  const code = async (res: Response) => (await json(res)).erro.codigo as string;

  interface LotSpec {
    price: number;
    quantity: number;
    start?: string;
    end?: string;
    leftover?: 'passar' | 'descartar';
  }
  /** Evento publicado com um tipo em lotes, montado pelo painel (o tipo nasce com o "Lote único"; os outros são criados). */
  async function setup(a: Session, lots: LotSpec[], capacity: number) {
    const ev = (
      await json(
        await a.post('/admin/events', {
          name: `Festa dos Lotes ${++n}`,
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
          quantityTotal: capacity,
          salesStartAt: '2026-10-01T00:00:00-03:00',
          salesEndAt: '2026-12-12T20:00:00-03:00',
        }),
      )
    ).ticketType as { id: string; lots: { id: string }[] };
    const first = type.lots[0]!.id;
    expect(
      (
        await a.patch(`/admin/lots/${first}`, {
          quantity: lots[0]!.quantity,
          salesEndAt: lots[0]!.end ?? null,
          leftoverPolicy: lots[0]!.leftover ?? 'passar',
        })
      ).status,
    ).toBe(200);
    for (const l of lots.slice(1)) {
      const res = await a.post(`/admin/ticket-types/${type.id}/lots`, {
        priceCents: l.price,
        quantity: l.quantity,
        salesStartAt: l.start ?? null,
        salesEndAt: l.end ?? null,
        leftoverPolicy: l.leftover ?? 'passar',
      });
      expect(res.status).toBe(201);
    }
    expect((await a.post(`/admin/events/${ev.id}/publish`)).status).toBe(200);
    const ids = (await sql('select id from ticket_lots where ticket_type_id = $1 order by position', [type.id])).rows.map(
      r => r.id as string,
    );
    return { eventId: ev.id, slug: ev.slug, typeId: type.id, lots: ids };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;
  const buy = (b: Session, s: Setup, quantity: number) =>
    b.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: s.slug, items: [{ ticketTypeId: s.typeId, quantity }] });
  const publicType = async (s: Setup) =>
    (await json(await app.request(`/api/public/events/${s.slug}`))).event.ticketTypes[0] as {
      priceCents: number | null;
      lot: { name: string } | null;
      lotRemaining: number | null;
      lastUnits: boolean;
      nextLot: boolean;
      state: string;
      canBuy: boolean;
      note: string;
    };
  const adminLots = async (a: Session, s: Setup) =>
    (await json(await a.get(`/admin/events/${s.eventId}`))).ticketTypes[0].lots as {
      id: string;
      name: string;
      status: string;
      closeReason: string | null;
      capacity: number;
      sold: number;
      reserved: number;
      available: number;
      carriedIn: number;
      passedOut: number;
      discarded: number;
    }[];
  const dbLots = async (s: Setup) =>
    (
      await sql(
        'select name, status, close_reason, quantity, carried_in, passed_out, discarded, quantity_sold from ticket_lots where ticket_type_id = $1 order by position',
        [s.typeId],
      )
    ).rows;
  async function pay(b: Session, orderId: string) {
    expect((await b.post(`/orders/${orderId}/payment`, { method: 'pix' })).status).toBe(201);
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
    testDb = await createTestDatabase(ADMIN_URL!);
    hash.value = await argon2Hasher.hash(PASSWORD);
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
      'truncate payment_events, email_log, checkins, minor_term_acceptances, tickets, order_item_lots, reservations, order_items, orders, ticket_lots, ticket_types, events, audit_log, sessions, login_attempts, users cascade',
    );
    clock.set('2026-10-10T15:00:00Z');
  });

  it('virada por esgotamento, com a compra dividida entre lotes e o preço de cada lote preso no pedido', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ price: 12000, quantity: 3 }, { price: 14000, quantity: 5 }], 10);
    expect(await publicType(s)).toMatchObject({ priceCents: 12000, lot: { name: '1º lote' }, nextLot: true, lastUnits: true });

    const b1 = await session();
    const first = await buy(b1, s, 2);
    expect(first.status).toBe(201);
    expect((await json(first)).order).toMatchObject({ totalCents: 24000, items: [{ lots: [{ name: '1º lote', quantity: 2 }] }] });
    expect(await publicType(s)).toMatchObject({ priceCents: 12000, lotRemaining: 1, lastUnits: true });

    // Pede 3 com 1 no 1º lote: 1 pelo preço dele e 2 pelo do 2º lote; o 1º esgota e vira na hora.
    const b2 = await session();
    const split = await buy(b2, s, 3);
    expect(split.status).toBe(201);
    const order = (await json(split)).order;
    expect(order.totalCents).toBe(12000 + 2 * 14000);
    expect(order.items[0].lots).toEqual([
      expect.objectContaining({ name: '1º lote', quantity: 1, unitPriceCents: 12000, subtotalCents: 12000 }),
      expect.objectContaining({ name: '2º lote', quantity: 2, unitPriceCents: 14000, subtotalCents: 28000 }),
    ]);
    expect(await dbLots(s)).toMatchObject([
      { status: 'encerrado', close_reason: 'esgotado' },
      { status: 'a_venda' },
    ]);
    expect(await publicType(s)).toMatchObject({ priceCents: 14000, lot: { name: '2º lote' }, nextLot: false });
    // O preço do tipo acompanha o lote à venda (uma versão anterior, numa volta atrás, venderia pelo preço certo).
    expect((await sql('select price_cents from ticket_types where id = $1', [s.typeId])).rows[0].price_cents).toBe(14000);
    const trail = await sql("select actor_id, reason from audit_log where action = 'lote.virar'");
    expect(trail.rows).toEqual([{ actor_id: null, reason: 'Virada automática: o lote esgotou.' }]);
  });

  it('virada por data: a sobra passa para o próximo lote; com "descartar", sai da venda; as reservas ficam no lote delas', async () => {
    for (const leftover of ['passar', 'descartar'] as const) {
      await sql('truncate order_item_lots, reservations, order_items, orders, ticket_lots, ticket_types, events, audit_log cascade');
      clock.set('2026-10-10T15:00:00Z');
      const a = await session('administrador');
      const s = await setup(
        a,
        [
          { price: 12000, quantity: 5, end: '2026-10-10T15:10:00Z', leftover },
          { price: 14000, quantity: 3 },
        ],
        10,
      );
      const b1 = await session();
      expect((await buy(b1, s, 1)).status).toBe(201); // reserva 1 no 1º lote, válida por 30 min
      clock.set('2026-10-10T15:12:00Z');
      // A página já mostra o 2º lote, sem ninguém comprar.
      expect(await publicType(s)).toMatchObject({ priceCents: 14000, lot: { name: '2º lote' } });
      const b2 = await session();
      expect((await buy(b2, s, 1)).status).toBe(201); // grava a virada
      const [l1, l2] = await dbLots(s);
      expect(l1).toMatchObject({ status: 'encerrado', close_reason: 'data' });
      if (leftover === 'passar') {
        expect(l1).toMatchObject({ passed_out: 4, discarded: 0 });
        expect(l2).toMatchObject({ carried_in: 4 });
      } else {
        expect(l1).toMatchObject({ passed_out: 0, discarded: 4 });
        expect(l2).toMatchObject({ carried_in: 0 });
      }
      const views = await adminLots(a, s);
      expect(views[0]).toMatchObject({ reserved: 1, available: 0 }); // a reserva continua no 1º lote, pelo preço dele
      expect(views[1]).toMatchObject({ capacity: leftover === 'passar' ? 7 : 3, reserved: 1 });
    }
  });

  it('virada manual pelo painel: sobra descartada ou passada, na trilha com quem virou; sem próximo, o tipo esgota', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ price: 10000, quantity: 5 }, { price: 12000, quantity: 5 }], 20);
    const turned = await a.post(`/admin/ticket-types/${s.typeId}/turn-lot`, { leftover: 'descartar' });
    expect(turned.status).toBe(200);
    expect((await json(turned)).ticketType.lots.map((l: { status: string }) => l.status)).toEqual(['encerrado', 'a_venda']);
    expect((await dbLots(s))[0]).toMatchObject({ close_reason: 'manual', discarded: 5 });
    const trail = await sql("select actor_id, reason from audit_log where action = 'lote.virar'");
    expect(trail.rows).toEqual([{ actor_id: a.id, reason: 'Virada manual pelo painel.' }]);

    expect((await a.post(`/admin/ticket-types/${s.typeId}/lots`, { priceCents: 15000, quantity: 4 })).status).toBe(201);
    expect((await a.post(`/admin/ticket-types/${s.typeId}/turn-lot`, { leftover: 'passar' })).status).toBe(200);
    const lots = await adminLots(a, s);
    expect(lots[1]).toMatchObject({ status: 'encerrado', passedOut: 5 });
    expect(lots[2]).toMatchObject({ status: 'a_venda', capacity: 9, carriedIn: 5 });

    // Último lote: encerrar faz o tipo parar (esgotado) e a compra é recusada.
    expect((await a.post(`/admin/ticket-types/${s.typeId}/turn-lot`, { leftover: 'passar' })).status).toBe(200);
    expect(await publicType(s)).toMatchObject({ state: 'esgotado', canBuy: false, priceCents: null });
    const refused = await buy(await session(), s, 1);
    expect(refused.status).toBe(409);
    expect((await a.post(`/admin/ticket-types/${s.typeId}/turn-lot`, { leftover: 'passar' })).status).toBe(409);
  });

  it('compra simultânea no último ingresso do lote: um leva o 1º lote e o outro sai do próximo; sem próximo, só um leva', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ price: 10000, quantity: 1 }, { price: 12000, quantity: 5 }], 10);
    const [b1, b2] = [await session(), await session()];
    const results = await Promise.all([buy(b1, s, 1), buy(b2, s, 1)]);
    expect(results.map(r => r.status)).toEqual([201, 201]);
    const totals = (await Promise.all(results.map(r => json(r)))).map(r => r.order.totalCents).sort();
    expect(totals).toEqual([10000, 12000]);
    expect((await adminLots(a, s)).map(l => l.reserved)).toEqual([1, 1]);

    const single = await setup(a, [{ price: 10000, quantity: 1 }], 1);
    const [c1, c2] = [await session(), await session()];
    const race = await Promise.all([buy(c1, single, 1), buy(c2, single, 1)]);
    expect(race.map(r => r.status).sort()).toEqual([201, 409]);
    const reserved = await sql(
      "select coalesce(sum(r.quantity), 0)::int as n from reservations r where r.ticket_type_id = $1 and r.status = 'ativa'",
      [single.typeId],
    );
    expect(reserved.rows[0].n).toBe(1);
  });

  it('reserva que vence depois da virada devolve as unidades ao lote à venda', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ price: 10000, quantity: 2 }, { price: 12000, quantity: 5 }], 10);
    const b1 = await session();
    expect((await buy(b1, s, 2)).status).toBe(201); // esgota o 1º lote: vira para o 2º
    expect((await dbLots(s)).map(l => l.status)).toEqual(['encerrado', 'a_venda']);
    clock.set('2026-10-10T15:31:00Z'); // a reserva de 30 min venceu
    const a2 = await session('administrador');
    const views = await adminLots(a2, s);
    expect(views[0]).toMatchObject({ passedOut: 2, reserved: 0 });
    expect(views[1]).toMatchObject({ capacity: 7, carriedIn: 2, available: 7 });
    expect((await buy(await session(), s, 1)).status).toBe(201); // grava a devolução
    expect((await dbLots(s))[1]).toMatchObject({ carried_in: 2 });
    expect((await sql("select count(*)::int as n from audit_log where action = 'lote.devolver'")).rows[0].n).toBe(1);
  });

  it('preço preso na reserva: quem estava pagando quando o lote virou paga o preço reservado, e o ingresso sai do lote dela', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ price: 10000, quantity: 5 }, { price: 15000, quantity: 5 }], 10);
    const b = await session();
    const order = (await json(await buy(b, s, 2))).order as { id: string; totalCents: number };
    expect(order.totalCents).toBe(20000);
    expect((await a.post(`/admin/ticket-types/${s.typeId}/turn-lot`, { leftover: 'passar' })).status).toBe(200);
    expect(await publicType(s)).toMatchObject({ priceCents: 15000 });
    await pay(b, order.id);
    const paid = await sql('select status, total_cents from orders where id = $1', [order.id]);
    expect(paid.rows[0]).toEqual({ status: 'pago', total_cents: 20000 });
    const tickets = await sql('select lot_id from tickets where order_id = $1', [order.id]);
    expect(tickets.rows.map(t => t.lot_id)).toEqual([s.lots[0], s.lots[0]]);
    expect((await dbLots(s))[0]).toMatchObject({ quantity_sold: 2 });
    const mine = await json(await b.get(`/orders/${order.id}`));
    expect(mine.order.items[0].lots).toEqual([expect.objectContaining({ name: '1º lote', unitPriceCents: 10000 })]);
  });

  it('tipo sem próximo lote fica esgotado depois de vender tudo', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ price: 10000, quantity: 2 }], 2);
    const b = await session();
    const order = (await json(await buy(b, s, 2))).order as { id: string };
    await pay(b, order.id);
    expect(await publicType(s)).toMatchObject({ state: 'esgotado', canBuy: false, nextLot: false });
    const refused = await buy(await session(), s, 1);
    expect(refused.status).toBe(409);
    expect(await code(refused)).toBe('estoque_alterado');
  });

  it('relatório e exportação por lote, com a conciliação certa numa compra dividida (preço médio quebrado)', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ price: 12000, quantity: 1 }, { price: 14050, quantity: 5 }], 6);
    const b = await session();
    const order = (await json(await buy(b, s, 3))).order as { id: string; totalCents: number };
    expect(order.totalCents).toBe(12000 + 2 * 14050); // 40.100; a média por unidade (13.366,67) não é inteira
    await pay(b, order.id);
    const report = await json(await a.get(`/admin/reports/sales?eventId=${s.eventId}`));
    expect(report.lines[0]).toMatchObject({ tickets: 3, cents: 40100 });
    expect(report.lines[0].lots).toEqual([
      expect.objectContaining({ lotName: '1º lote', tickets: 1, cents: 12000 }),
      expect.objectContaining({ lotName: '2º lote', tickets: 2, cents: 28100 }),
    ]);
    expect(report.reconciliation).toMatchObject({ ok: true, ordersCents: 40100, itemsCents: 40100 });
    const csv = await (await a.get(`/admin/exports/sales.csv?eventId=${s.eventId}`)).text();
    expect(csv).toContain('1º lote');
    expect(csv).toContain('2º lote');
    expect(csv).toContain('confere');
    // Ingresso, e-mail e painel mostram "Pista · 2º lote".
    const names = await sql(
      `select case when l.name = 'Lote único' then ty.name else ty.name || ' · ' || l.name end as n
         from tickets t join ticket_types ty on ty.id = t.ticket_type_id join ticket_lots l on l.id = t.lot_id
        where t.order_id = $1 order by t.unit_index`,
      [order.id],
    );
    expect(names.rows.map(r => r.n)).toEqual(['Pista · 1º lote', 'Pista · 2º lote', 'Pista · 2º lote']);
    const panel = await json(await a.get(`/admin/orders/${order.id}`));
    expect(JSON.stringify(panel)).toContain('Pista · 2º lote');
  });

  it('painel: soma dentro da capacidade, preço travado com vendas, apagar só o que aguarda, reordenar, e só administrador', async () => {
    const a = await session('administrador');
    const s = await setup(a, [{ price: 10000, quantity: 4 }], 10);
    const over = await a.post(`/admin/ticket-types/${s.typeId}/lots`, { priceCents: 12000, quantity: 7 });
    expect(over.status).toBe(409);
    expect(await code(over)).toBe('lotes_acima_da_capacidade');
    expect((await a.post(`/admin/ticket-types/${s.typeId}/lots`, { priceCents: 12000, quantity: 3 })).status).toBe(201);
    expect((await a.post(`/admin/ticket-types/${s.typeId}/lots`, { priceCents: 14000, quantity: 3, name: 'Virada' })).status).toBe(
      201,
    );
    // O "Lote único" passou a se chamar "1º lote" quando o segundo foi criado.
    expect((await dbLots(s)).map(l => l.name)).toEqual(['1º lote', '2º lote', 'Virada']);

    const b = await session();
    const order = (await json(await buy(b, s, 1))).order as { id: string };
    await pay(b, order.id);
    const locked = await a.patch(`/admin/lots/${s.lots[0]}`, { priceCents: 11000 });
    expect(locked.status).toBe(409);
    expect(await code(locked)).toBe('lote_com_vendas');
    expect((await a.patch(`/admin/lots/${s.lots[0]}`, { quantity: 0 })).status).toBe(422);
    expect(await code(await a.del(`/admin/lots/${s.lots[0]}`))).toBe('lote_ja_vendeu');
    // Preço do tipo com mais de um lote: muda no lote.
    expect(await code(await a.patch(`/admin/ticket-types/${s.typeId}`, { priceCents: 9000 }))).toBe('preco_no_lote');

    const ids = (await sql('select id from ticket_lots where ticket_type_id = $1 order by position', [s.typeId])).rows.map(
      r => r.id as string,
    );
    expect((await a.post(`/admin/lots/${ids[2]}/move`, { direction: 'subir' })).status).toBe(200);
    expect((await dbLots(s)).map(l => l.name)).toEqual(['1º lote', 'Virada', '2º lote']);
    expect(await code(await a.post(`/admin/lots/${ids[1]}/move`, { direction: 'descer' }))).toBe('ordem_fixa'); // já é o último
    expect((await a.del(`/admin/lots/${ids[2]}`)).status).toBe(200);
    expect(
      (await sql('select name, position from ticket_lots where ticket_type_id = $1 order by position', [s.typeId])).rows,
    ).toEqual([
      { name: '1º lote', position: 1 },
      { name: '2º lote', position: 2 },
    ]);
    const actions = await sql("select action from audit_log where entity = 'ticket_lot' order by created_at, action");
    expect(new Set(actions.rows.map(r => r.action))).toEqual(new Set(['lote.criar', 'lote.editar', 'lote.mover', 'lote.apagar']));

    for (const role of ['validador', 'cliente'] as const) {
      const x = await session(role);
      expect((await x.post(`/admin/ticket-types/${s.typeId}/lots`, { priceCents: 1000, quantity: 1 })).status).toBe(403);
      expect((await x.patch(`/admin/lots/${s.lots[0]}`, { quantity: 9 })).status).toBe(403);
      expect((await x.del(`/admin/lots/${ids[1]}`)).status).toBe(403);
      expect((await x.post(`/admin/ticket-types/${s.typeId}/turn-lot`, { leftover: 'passar' })).status).toBe(403);
    }
  });

  it('tipo sem lote, de uma versão anterior aos lotes: ganha o "Lote único" na primeira compra, sem mudar preço nem capacidade', async () => {
    const ev = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status)
         values ('antigo','Antigo','2026-12-12T22:00:00-03:00','Arena','Rua 1','desc','Livre','publicado') returning id`,
      )
    ).rows[0].id;
    const type = (
      await sql(
        `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at)
         values ($1,'Pista',8000,50,'2026-10-01T00:00:00-03:00','2026-12-12T20:00:00-03:00') returning id`,
        [ev],
      )
    ).rows[0].id;
    expect((await json(await app.request('/api/public/events/antigo'))).event.ticketTypes[0]).toMatchObject({
      priceCents: 8000,
      lot: null,
      canBuy: true,
    });
    const b = await session();
    const res = await b.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: 'antigo', items: [{ ticketTypeId: type, quantity: 2 }] });
    expect(res.status).toBe(201);
    expect((await json(res)).order.totalCents).toBe(16000);
    const lots = await sql('select name, price_cents, quantity, status from ticket_lots where ticket_type_id = $1', [type]);
    expect(lots.rows).toEqual([{ name: 'Lote único', price_cents: 8000, quantity: 50, status: 'a_venda' }]);
  });
});
