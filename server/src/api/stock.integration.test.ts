import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { GatewayError, type PaymentGateway } from '../payments/gateway';
import { type JobAuthenticator } from '../payments/jobsAuth';
import { createMockGateway, type MockGateway } from '../payments/mockGateway';
import { runReconciliation } from '../payments/notifications';
import { createTicketIssuer } from '../tickets/issuer';
import { expireOverdue } from '../orders/service';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';

describe.skipIf(!ADMIN_URL)('disputa de estoque e pagamento tardio (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  let mock: MockGateway;
  let hash = '';
  let n = 0;

  const issueTickets = createTicketIssuer(loadConfig({ APP_ENV: 'local' }).qr);

  const fakeJobAuth: JobAuthenticator = { verify: async h => h === 'Bearer token-do-scheduler' };

  const build = (
    gateway: PaymentGateway | undefined,
    extra: { env?: Record<string, string>; jobAuth?: JobAuthenticator | undefined } = {},
  ) =>
    createApp({
      config: loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none', RESERVATION_MINUTES: '10', ...extra.env }),
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender(), gateway },
      jobAuth: 'jobAuth' in extra ? extra.jobAuth : fakeJobAuth,
      issueTickets,
    });
  let app: ReturnType<typeof build>;

  async function user(role: 'cliente' | 'administrador' = 'cliente', target = app) {
    const i = ++n;
    const email = `${role}${i}@partyx.test`;
    await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5)', [
      `Pessoa ${i} Teste`,
      email,
      role === 'cliente' ? String(20000000000 + i) : null,
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
      return target.request(`/api${path}`, {
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
  type Session = Awaited<ReturnType<typeof user>>;

  const json = async <T = any>(res: Response) => (await res.json()) as T;

  async function event(types: { price?: number; total?: number }[] = [{}]) {
    const slug = `evento-${++n}`;
    const id = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values ($1,'Evento Teste','2026-12-12T22:00:00-03:00','Arena','Rua 1','d','Livre','publicado') returning id`,
        [slug],
      )
    ).rows[0].id as string;
    const ids: string[] = [];
    for (const t of types) {
      ids.push(
        (
          await sql(
            `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,$2,$3,$4,'2026-10-01T00:00:00-03:00','2026-12-12T20:00:00-03:00') returning id`,
            [id, `Tipo ${ids.length + 1}`, t.price ?? 8000, t.total ?? 100],
          )
        ).rows[0].id,
      );
    }
    return { id, slug, types: ids };
  }

  /** Notificação do gateway, assinada como o gateway assinaria. */
  const hook = (
    paymentId: string,
    over: { eventId?: string; type?: string; headers?: Record<string, string>; body?: string } = {},
    target = app,
  ) => {
    const body =
      over.body ??
      JSON.stringify({
        id: over.eventId ?? `evt_${randomBytes(6).toString('hex')}`,
        paymentId,
        type: over.type ?? 'payment.updated',
      });
    return target.request('/api/webhooks/payments', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mock-signature': mock.simulate.sign(body),
        'x-forwarded-for': '198.51.100.9',
        ...over.headers,
      },
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
      'truncate payment_events, checkins, tickets, reservations, order_items, orders, ticket_types, events, audit_log, sessions, login_attempts, users cascade',
    );
    clock.set('2026-10-10T15:00:00Z');
    mock = createMockGateway(clock);
    app = build(mock);
  });

  const deps = () => ({ db: createDrizzle(testDb.pool), clock, gateway: mock, issueTickets });
  const statuses: number[] = [];
  const failures: string[] = [];
  const errLines: string[] = [];
  let errSpy: ReturnType<typeof vi.spyOn>;
  const track = async (p: Response | Promise<Response>) => {
    const res = await p;
    statuses.push(res.status);
    if (res.status >= 500) failures.push(`${res.status} ${await res.clone().text()}`);
    return res;
  };

  /** A conta do estoque, lida direto do banco: o que vale é o que está gravado, não o que a API respondeu. */
  async function assertStock(label: string) {
    const now = clock.now();
    const types = (
      await sql(
        `select t.id, t.name, t.quantity_total as total, t.quantity_sold as sold,
                coalesce((select sum(r.quantity) from reservations r where r.ticket_type_id = t.id and r.status = 'ativa' and r.expires_at > $1), 0)::int as held,
                (select count(*) from tickets k where k.ticket_type_id = t.id)::int as issued
           from ticket_types t`,
        [now],
      )
    ).rows;
    for (const t of types) {
      expect(t.sold + t.held, `${label}: vendidos + reservas válidas de ${t.name}`).toBeLessThanOrEqual(t.total);
      expect(t.issued, `${label}: ingressos emitidos = vendidos em ${t.name}`).toBe(t.sold);
    }
    const bad = async (q: string) => (await sql(q)).rows;
    // Pedido pago tem exatamente os ingressos que comprou; pago sem estoque, nenhum.
    expect(
      await bad(
        `select o.id from orders o where o.status = 'pago' and (select count(*) from tickets t where t.order_id = o.id) <> (select sum(quantity) from order_items i where i.order_id = o.id)`,
      ),
      `${label}: pedido pago com ingressos a menos ou a mais`,
    ).toEqual([]);
    expect(
      await bad(
        `select o.id from orders o where o.status in ('pago_sem_estoque','pendente','expirado','nao_concluido','cancelado') and exists (select 1 from tickets t where t.order_id = o.id)`,
      ),
      `${label}: ingresso emitido para pedido que não é pago`,
    ).toEqual([]);
    // Reserva convertida só de pedido pago; reserva ativa e ainda válida só de pedido pendente.
    expect(
      await bad(
        `select r.id from reservations r join orders o on o.id = r.order_id where r.status = 'convertida' and o.status <> 'pago'`,
      ),
      `${label}: reserva convertida de pedido não pago`,
    ).toEqual([]);
    expect(
      await bad(
        `select r.id from reservations r join orders o on o.id = r.order_id where r.status = 'ativa' and r.expires_at > '${now.toISOString()}' and o.status <> 'pendente'`,
      ),
      `${label}: reserva viva de pedido que não está pendente`,
    ).toEqual([]);
    expect(
      await bad(`select code from tickets group by code having count(*) > 1`),
      `${label}: código repetido`,
    ).toEqual([]);
    expect(
      await bad(`select short_code from tickets group by short_code having count(*) > 1`),
      `${label}: código curto repetido`,
    ).toEqual([]);
    expect(
      statuses.filter(s => s >= 500),
      `${label}: respostas 5xx (impasse ou erro): ${failures.join(' | ')} :: ${errLines.filter(l => l.includes('falha ao processar')).join('')} :: ${(await sql('select processing_error from payment_events where processing_error is not null')).rows.map(r => r.processing_error).join(' | ')}`,
    ).toEqual([]);
  }

  const orderOf = async (id: string) => (await sql('select status, paid_at from orders where id = $1', [id])).rows[0];
  const pending = async (s: Session, e: Awaited<ReturnType<typeof event>>, qty: number[]) =>
    track(
      s.post('/orders', {
        eventSlug: e.slug,
        items: qty.map((quantity, i) => ({ ticketTypeId: e.types[i]!, quantity })).filter(i => i.quantity > 0),
      }),
    );
  const startPix = async (s: Session, orderId: string) =>
    track(s.post(`/orders/${orderId}/payment`, { method: 'pix' }));
  const paymentOf = async (orderId: string) =>
    (await sql('select gateway_payment_id from orders where id = $1', [orderId])).rows[0]?.gateway_payment_id as
      string | null;

  beforeEach(() => {
    statuses.length = 0;
    failures.length = 0;
    errLines.length = 0;
    // Registra o que o servidor escreveu em stderr (inclusive o código do erro de uma notificação que falhou).
    errSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(((c: unknown) => (errLines.push(String(c)), true)) as never);
  });
  afterEach(() => errSpy.mockRestore());

  describe('última unidade e vários tipos', () => {
    it('1 unidade, 12 compradores ao mesmo tempo: exatamente um reserva, os outros recebem esgotado, nunca erro', async () => {
      const e = await event([{ total: 1 }]);
      const buyers = await Promise.all(Array.from({ length: 12 }, () => user()));
      const res = await Promise.all(buyers.map(b => pending(b, e, [1])));
      expect(res.filter(r => r.status === 201)).toHaveLength(1);
      expect(res.filter(r => r.status !== 201).every(r => r.status === 409 || r.status === 422)).toBe(true);
      await assertStock('última unidade');
      expect((await sql("select count(*)::int as n from reservations where status = 'ativa'")).rows[0].n).toBe(1);
    });

    it('vários tipos com capacidades pequenas e combinações diferentes: nunca passa de nenhum tipo, tudo ou nada por pedido', async () => {
      const e = await event([{ total: 2 }, { total: 1 }, { total: 3 }]);
      const buyers = await Promise.all(Array.from({ length: 16 }, () => user()));
      const combos = [
        [1, 1, 0],
        [0, 1, 1],
        [2, 0, 1],
        [1, 0, 2],
        [0, 0, 3],
        [1, 1, 1],
      ];
      const res = await Promise.all(buyers.map((b, i) => pending(b, e, combos[i % combos.length]!)));
      await assertStock('combinações');
      // Pedido recusado não deixa reserva parcial: cada reserva viva pertence a um pedido criado (201).
      const created = res.filter(r => r.status === 201).length;
      expect(
        (await sql("select count(distinct order_id)::int as n from reservations where status = 'ativa'")).rows[0].n,
      ).toBe(created);
      for (const t of (
        await sql(
          "select quantity_total as total, (select coalesce(sum(r.quantity),0)::int from reservations r where r.ticket_type_id = t.id and r.status = 'ativa') as held from ticket_types t",
        )
      ).rows)
        expect(t.held).toBeLessThanOrEqual(t.total);
    });

    it('pedido duplicado: o mesmo comprador envia 8 vezes ao mesmo tempo e fica com um pedido pendente e uma reserva', async () => {
      const e = await event([{ total: 10 }]);
      const a = await user();
      await Promise.all(Array.from({ length: 8 }, () => pending(a, e, [3])));
      expect((await sql("select count(*)::int as n from orders where status = 'pendente'")).rows[0].n).toBe(1);
      expect(
        (await sql("select coalesce(sum(quantity),0)::int as n from reservations where status = 'ativa'")).rows[0].n,
      ).toBe(3);
      await assertStock('pedido duplicado');
    });
  });

  describe('abandono, expiração e falha na cobrança', () => {
    it('abandonou: a reserva vence, o estoque volta e outro comprador leva a unidade', async () => {
      const e = await event([{ total: 1 }]);
      const a = await user();
      const b = await user();
      expect((await pending(a, e, [1])).status).toBe(201);
      expect((await pending(b, e, [1])).status).toBe(409);
      clock.advance(11 * 60_000);
      expect((await pending(b, e, [1])).status).toBe(201);
      await assertStock('abandono');
    });

    it('falha ao criar a cobrança: a reserva continua valendo (ninguém fura a fila), e depois de vencer a unidade volta', async () => {
      const e = await event([{ total: 1 }]);
      const a = await user();
      const b = await user();
      const oa = (await json(await pending(a, e, [1]))).order;
      mock.simulate.failNext(new GatewayError('timeout'));
      expect((await a.post(`/orders/${oa.id}/payment`, { method: 'pix' })).status).toBe(503);
      expect((await pending(b, e, [1])).status).toBe(409); // A ainda segura a unidade
      await assertStock('falha na cobrança, reserva viva');
      clock.advance(11 * 60_000);
      expect((await pending(b, e, [1])).status).toBe(201);
      await assertStock('falha na cobrança, depois de vencer');
    });
  });

  describe('pagamento tardio', () => {
    it('Pix aprovado depois de vencer, COM estoque: emite uma vez só mesmo com 6 notificações e 4 conciliações simultâneas', async () => {
      const e = await event([{ total: 3 }]);
      const a = await user();
      const oa = (await json(await pending(a, e, [2]))).order;
      await startPix(a, oa.id);
      const paymentId = (await paymentOf(oa.id))!;
      clock.advance(11 * 60_000);
      mock.simulate.setStatus(paymentId, 'aprovado');
      await Promise.all([
        ...Array.from({ length: 6 }, () => track(hook(paymentId, { eventId: 'evt_igual' }))),
        ...Array.from({ length: 4 }, () => runReconciliation(deps(), { minIntervalSeconds: 0 })),
        expireOverdue({ db: createDrizzle(testDb.pool), clock }),
      ]);
      expect((await orderOf(oa.id)).status).toBe('pago');
      expect((await sql('select count(*)::int as n from tickets where order_id = $1', [oa.id])).rows[0].n).toBe(2);
      expect(
        (await sql("select count(*)::int as n from audit_log where action = 'pagamento.confirmado_tardio'")).rows[0].n,
      ).toBe(1);
      await assertStock('tardio com estoque');
    });

    it('Pix aprovado depois de vencer, SEM estoque: não emite, guarda a data do pagamento, avisa e entra na lista de estorno', async () => {
      const e = await event([{ total: 1 }]);
      const a = await user();
      const b = await user();
      const oa = (await json(await pending(a, e, [1]))).order;
      await startPix(a, oa.id);
      const pa = (await paymentOf(oa.id))!;
      clock.advance(11 * 60_000);
      const ob = (await json(await pending(b, e, [1]))).order;
      await startPix(b, ob.id);
      const pb = (await paymentOf(ob.id))!;
      mock.simulate.setStatus(pb, 'aprovado');
      await hook(pb);
      mock.simulate.setStatus(pa, 'aprovado');
      const err = vi.spyOn(process.stderr, 'write');
      try {
        await Promise.all(Array.from({ length: 5 }, () => track(hook(pa, { eventId: 'evt_tardio' }))));
        expect(err.mock.calls.map(c => String(c[0])).join('')).toContain('"alert":"pago_sem_estoque"');
      } finally {
        err.mockRestore();
      }
      const o = await orderOf(oa.id);
      expect(o.status).toBe('pago_sem_estoque');
      expect(o.paid_at).not.toBeNull();
      expect((await sql('select count(*)::int as n from tickets where order_id = $1', [oa.id])).rows[0].n).toBe(0);
      expect(
        (await sql("select count(*)::int as n from audit_log where action = 'pagamento.sem_estoque'")).rows[0].n,
      ).toBe(1);
      const admin = await user('administrador');
      const list = await json(await admin.get('/admin/payments/exceptions'));
      expect(list.semEstoque.map((x: any) => x.orderId)).toEqual([oa.id]);
      await assertStock('tardio sem estoque');
    });

    it('a última unidade, aprovação tardia de A contra aprovação normal de B, em paralelo, 8 rodadas: só um leva, o outro vira "pago sem estoque"', async () => {
      for (let round = 0; round < 8; round++) {
        const e = await event([{ total: 1 }]);
        const a = await user();
        const b = await user();
        const oa = (await json(await pending(a, e, [1]))).order;
        await startPix(a, oa.id);
        const pa = (await paymentOf(oa.id))!;
        clock.advance(11 * 60_000); // a reserva de A venceu
        const ob = (await json(await pending(b, e, [1]))).order;
        await startPix(b, ob.id);
        const pb = (await paymentOf(ob.id))!;
        mock.simulate.setStatus(pa, 'aprovado');
        mock.simulate.setStatus(pb, 'aprovado');
        const order = round % 2 ? [pa, pb] : [pb, pa];
        await Promise.all(order.map(p => track(hook(p))));
        const sa = (await orderOf(oa.id)).status;
        const sb = (await orderOf(ob.id)).status;
        // B tinha a reserva válida, então B sempre leva a unidade; A, que pagou tarde, fica sem estoque.
        expect([round, sa, sb]).toEqual([round, 'pago_sem_estoque', 'pago']);
        await assertStock(`rodada ${round}`);
        clock.advance(11 * 60_000);
      }
    });
  });

  describe('ordem das travas (sem impasse no banco)', () => {
    it('aprovar o pedido antigo enquanto o mesmo comprador cria um novo que o substitui: 30 rodadas sem impasse nem erro', async () => {
      for (let round = 0; round < 30; round++) {
        const e = await event([{ total: 5 }, { total: 5 }]);
        const a = await user();
        const oa = (await json(await pending(a, e, [1, 1]))).order;
        await startPix(a, oa.id);
        const pa = (await paymentOf(oa.id))!;
        clock.advance(11 * 60_000); // a reserva venceu: o pedido novo pode substituir o antigo
        mock.simulate.setStatus(pa, 'aprovado');
        const [approval, replacement] = await Promise.all([track(hook(pa)), pending(a, e, [1, 1])]);
        expect([round, approval.status]).toEqual([round, 200]);
        expect([201, 409]).toContain(replacement.status);
        await assertStock(`rodada ${round}`);
      }
    }, 120_000);
  });

  describe('rotinas simultâneas e idempotência', () => {
    it('repetir expiração e conciliação em paralelo, muitas vezes, não muda nada depois do primeiro acerto', async () => {
      const e = await event([{ total: 4 }, { total: 2 }]);
      const buyers = await Promise.all(Array.from({ length: 6 }, () => user()));
      const made: { orderId: string; paymentId: string }[] = [];
      for (const [i, b] of buyers.entries()) {
        const r = await pending(b, e, [1, i % 2]);
        if (r.status !== 201) continue;
        const id = (await json(r)).order.id as string;
        await startPix(b, id);
        made.push({ orderId: id, paymentId: (await paymentOf(id))! });
      }
      clock.advance(5 * 60_000);
      for (const m of made.slice(0, 3)) mock.simulate.setStatus(m.paymentId, 'aprovado');
      const settle = () =>
        Promise.all([
          ...Array.from({ length: 4 }, () => runReconciliation(deps(), { minIntervalSeconds: 0 })),
          ...Array.from({ length: 4 }, () => expireOverdue({ db: createDrizzle(testDb.pool), clock })),
          ...made.map(m => track(hook(m.paymentId))),
        ]);
      await settle();
      const snap = async () =>
        JSON.stringify([
          (await sql('select id, status, paid_at from orders order by id')).rows,
          (await sql('select id, quantity_sold from ticket_types order by id')).rows,
          (await sql('select count(*)::int as n from tickets')).rows,
          (await sql('select order_id, ticket_type_id, status from reservations order by order_id, ticket_type_id'))
            .rows,
        ]);
      const first = await snap();
      for (let i = 0; i < 3; i++) await settle();
      expect(await snap()).toBe(first);
      await assertStock('rotinas repetidas');
    });
  });

  describe('rajada aleatória com tudo misturado (semente fixa)', () => {
    it('reservar, pagar, abandonar, aprovar tarde, duplicar notificações e rodar rotinas ao mesmo tempo: o estoque nunca passa da capacidade', async () => {
      const seed = Number(process.env.STOCK_SEED ?? 20261012);
      let s = seed >>> 0;
      const rnd = () => ((s = (s + 0x6d2b79f5) >>> 0), (((s ^ (s >>> 15)) * (1 | s)) >>> 0) / 4294967296);
      const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
      const e = await event([{ total: 3 }, { total: 2 }, { total: 4 }]);
      const buyers = await Promise.all(Array.from({ length: 18 }, () => user()));
      const live = new Map<number, string>(); // comprador -> pedido
      const label = (r: number) => `semente ${seed}, rodada ${r}`;
      for (let round = 0; round < 5; round++) {
        // 1. todos tentam reservar com combinações aleatórias
        await Promise.all(
          buyers.map(async (b, i) => {
            if (rnd() < 0.3) return;
            const qty: number[] = Array.from({ length: 3 }, () => (rnd() < 0.5 ? Math.floor(rnd() * 3) : 0));
            if (qty.reduce((a, b) => a + b, 0) === 0) qty[Math.floor(rnd() * 3)] = 1;
            const r = await pending(b, e, qty);
            if (r.status === 201) live.set(i, (await json(r)).order.id);
          }),
        );
        // 2. parte deles inicia o Pix
        await Promise.all([...live.entries()].filter(() => rnd() < 0.7).map(([i, id]) => startPix(buyers[i]!, id)));
        await assertStock(label(round) + ' após reservar');
        // 3. o relógio anda; alguns pagam (inclusive depois de vencer)
        clock.advance(pick([0, 3 * 60_000, 11 * 60_000]));
        const toApprove: string[] = [];
        for (const id of live.values()) {
          const p = await paymentOf(id);
          if (p && rnd() < 0.6) {
            mock.simulate.setStatus(p, 'aprovado');
            toApprove.push(p);
          }
        }
        // 4. notificações (algumas repetidas), rotinas e novas reservas, tudo junto
        await Promise.all([
          ...toApprove.flatMap(p => (rnd() < 0.4 ? [track(hook(p)), track(hook(p))] : [track(hook(p))])),
          runReconciliation(deps(), { minIntervalSeconds: 0 }),
          runReconciliation(deps(), { minIntervalSeconds: 0 }),
          expireOverdue({ db: createDrizzle(testDb.pool), clock }),
          ...buyers.filter(() => rnd() < 0.25).map(b => pending(b, e, [1, 0, 1])),
        ]);
        await assertStock(label(round) + ' após notificações e rotinas');
        clock.advance(pick([0, 12 * 60_000]));
        live.clear();
        for (const [i, b] of buyers.entries()) {
          const row = (
            await sql(
              "select id from orders where user_id = (select id from users where email = $1) and status = 'pendente'",
              [(await json(await b.get('/auth/me'))).user.email],
            )
          ).rows[0];
          if (row) live.set(i, row.id);
        }
      }
      // Acerto final: as rotinas não acham mais nada a fazer e a conta continua fechada.
      for (let i = 0; i < 3; i++) await runReconciliation(deps(), { minIntervalSeconds: 0 });
      await expireOverdue({ db: createDrizzle(testDb.pool), clock });
      await assertStock(`semente ${seed}, final`);
      const totals = (await sql('select sum(quantity_sold)::int as sold from ticket_types')).rows[0].sold;
      expect(totals).toBeGreaterThan(0); // a rajada realmente vendeu alguma coisa
    }, 180_000);
  });

  describe('barreira do banco', () => {
    it('mesmo escrevendo direto no banco, vendido não passa da capacidade nem fica negativo', async () => {
      const e = await event([{ total: 2 }]);
      await expect(sql('update ticket_types set quantity_sold = 3 where id = $1', [e.types[0]])).rejects.toThrow();
      await expect(sql('update ticket_types set quantity_sold = -1 where id = $1', [e.types[0]])).rejects.toThrow();
      await expect(sql('update ticket_types set quantity_total = 0 where id = $1', [e.types[0]])).rejects.toThrow(); // total precisa ser positivo
      await expect(
        sql('update ticket_types set quantity_total = 1 where id = $1', [e.types[0]]),
      ).resolves.toBeDefined(); // reduzir é permitido
      await expect(sql('update ticket_types set quantity_sold = 2 where id = $1', [e.types[0]])).rejects.toThrow(); // mas vendido acima do novo total, não
    });
  });
});
