import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { expireOverdue } from '../orders/service';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';

describe.skipIf(!ADMIN_URL)('carrinho, reserva e estoque (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const build = (env: Record<string, string> = {}) =>
    createApp({
      config: loadConfig({ APP_ENV: 'local', RESERVATION_MINUTES: '10', ...env }),
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender() },
    });
  let app: ReturnType<typeof build>;
  let n = 0;
  const hash = { value: '' };

  /** Navegador simulado de um comprador (ou da equipe) com sessão e CSRF. */
  async function buyer(role: 'cliente' | 'validador' | 'administrador' = 'cliente', target = app) {
    const i = ++n;
    const email = `${role}${i}@partyx.test`;
    const { rows } = await sql(
      `insert into users (name, email, cpf, password_hash, role) values ($1,$2,$3,$4,$5) returning id`,
      [`Pessoa ${i} Teste`, email, role === 'cliente' ? String(10000000000 + i) : null, hash.value, role],
    );
    let cookie = '';
    let csrf = '';
    const raw = (method: string, path: string, json?: unknown) => {
      const headers: Record<string, string> = { origin: 'http://localhost', 'x-forwarded-for': '203.0.113.7' };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      if (json !== undefined) headers['content-type'] = 'application/json';
      return target.request(`/api${path}`, {
        method,
        headers,
        body: json === undefined ? undefined : JSON.stringify(json),
      });
    };
    const login = await raw('POST', '/auth/login', { email, password: PASSWORD });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    const order = (slug: string, items: unknown[], extra: Record<string, unknown> = {}) =>
      raw('POST', '/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: slug, items, ...extra });
    return {
      id: rows[0].id as string,
      raw,
      order,
      get: (p: string) => raw('GET', p),
      post: (p: string, b: unknown = {}) => raw('POST', p, b),
    };
  }

  const json = async <T = any>(res: Response) => (await res.json()) as T;
  const code = async (res: Response) => (await json(res)).erro.codigo as string;

  /** Evento publicado com tipos, direto no banco. */
  async function event(
    o: {
      name?: string;
      status?: string;
      types?: {
        name?: string;
        price?: number;
        total?: number;
        sold?: number;
        start?: string;
        end?: string;
        active?: boolean;
      }[];
    } = {},
  ) {
    const name = o.name ?? `Evento ${++n}`;
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${n}`;
    const id = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values ($1,$2,'2026-12-12T22:00:00-03:00','Arena','Rua 1','desc','Livre',$3) returning id`,
        [slug, name, o.status ?? 'publicado'],
      )
    ).rows[0].id as string;
    const types: string[] = [];
    for (const t of o.types ?? [{}]) {
      types.push(
        (
          await sql(
            `insert into ticket_types (event_id,name,price_cents,quantity_total,quantity_sold,sales_start_at,sales_end_at,is_active) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
            [
              id,
              t.name ?? `Tipo ${types.length + 1}`,
              t.price ?? 8000,
              t.total ?? 100,
              t.sold ?? 0,
              t.start ?? '2026-10-01T00:00:00-03:00',
              t.end ?? '2026-12-12T20:00:00-03:00',
              t.active ?? true,
            ],
          )
        ).rows[0].id,
      );
    }
    return { id, slug, types };
  }
  const item = (ticketTypeId: string, quantity = 1) => ({ ticketTypeId, quantity });

  /** Invariante central: vendidos + reservas válidas nunca passam da capacidade. */
  async function assertNoOversell(eventId: string) {
    const { rows } = await sql(
      `select t.name, t.quantity_total, t.quantity_sold,
              coalesce((select sum(r.quantity) from reservations r where r.ticket_type_id = t.id and r.status = 'ativa' and r.expires_at > $2), 0)::int as reserved
         from ticket_types t where t.event_id = $1`,
      [eventId, clock.now()],
    );
    for (const r of rows) expect(r.quantity_sold + r.reserved, r.name).toBeLessThanOrEqual(r.quantity_total);
    return rows as { quantity_total: number; quantity_sold: number; reserved: number }[];
  }

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    hash.value = await argon2Hasher.hash(PASSWORD);
    app = build();
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql(
      'truncate reservations, order_items, orders, ticket_types, events, promoters, sessions, login_attempts, users cascade',
    );
    clock.set('2026-10-10T15:00:00Z');
  });

  describe('acesso', () => {
    it('exige login, e só o perfil cliente compra', async () => {
      const e = await event();
      const anon = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost' },
        body: '{}',
      });
      expect(anon.status).toBe(401);
      const staff = await buyer('validador');
      expect((await staff.order(e.slug, [item(e.types[0]!)])).status).toBe(403);
      expect((await staff.post('/checkout/quote', { eventSlug: e.slug, items: [item(e.types[0]!)] })).status).toBe(403);
      expect((await sql('select count(*)::int as n from orders')).rows[0].n).toBe(0);
    });

    it('respostas privadas nunca saem com cache público (pedido, conta, painel)', async () => {
      const e = await event();
      const a = await buyer();
      const id = (await json(await a.order(e.slug, [item(e.types[0]!)]))).order.id;
      const admin = await buyer('administrador');
      for (const [who, path] of [
        [a, `/orders/${id}`],
        [a, '/auth/me'],
        [admin, '/admin/events'],
        [admin, '/admin/team'],
      ] as const) {
        const res = await who.get(path);
        expect(res.status, path).toBe(200);
        expect(res.headers.get('cache-control') ?? '', path).not.toMatch(/public|max-age=[1-9]/);
      }
      expect((await a.get(`/orders/${id}`)).headers.get('cache-control')).toBe('private, no-store');
      // Nem a vitrine vai para cache compartilhado: política de produção atrás do Firebase Hosting.
      const open = await app.request('/api/public/events');
      expect(open.headers.get('cache-control')).toBe('private, no-store');
    });

    it('um comprador não enxerga nem cancela o pedido de outro', async () => {
      const e = await event();
      const a = await buyer();
      const b = await buyer();
      const orderId = (await json(await a.order(e.slug, [item(e.types[0]!)]))).order.id;
      expect((await b.get(`/orders/${orderId}`)).status).toBe(404);
      expect((await b.post(`/orders/${orderId}/cancel`)).status).toBe(404);
      expect((await a.get(`/orders/${orderId}`)).status).toBe(200);
      expect((await a.get('/orders/não-é-uuid')).status).toBe(404);
      expect((await sql('select status from orders where id = $1', [orderId])).rows[0].status).toBe('pendente');
    });

    it('vendas fechadas (SALES_OPEN=false) recusam pedidos sem reservar nada', async () => {
      const e = await event();
      const closed = build({ SALES_OPEN: 'false' });
      const b = await buyer('cliente', closed);
      const res = await b.order(e.slug, [item(e.types[0]!)]);
      expect([res.status, await code(res)]).toEqual([503, 'vendas_fechadas']);
      expect((await sql('select count(*)::int as n from reservations')).rows[0].n).toBe(0);
    });
  });

  describe('pedido e reserva (RF-28, RF-32, RF-33)', () => {
    it('cria o pedido pendente, reserva o estoque e devolve o contador pelo relógio do servidor', async () => {
      const e = await event({
        types: [
          { name: 'Pista', price: 8000, total: 10 },
          { name: 'VIP', price: 15050, total: 5 },
        ],
      });
      const a = await buyer();
      const res = await a.order(e.slug, [item(e.types[0]!, 2), item(e.types[1]!, 1)]);
      expect(res.status).toBe(201);
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      const { order } = await json(res);
      expect(order).toMatchObject({
        status: 'pendente',
        totalCents: 2 * 8000 + 15050,
        paymentMethod: null,
        coupon: null,
      });
      expect(order.items.map((i: any) => [i.name, i.quantity, i.unitPriceCents, i.subtotalCents]).sort()).toEqual([
        ['Pista', 2, 8000, 16000],
        ['VIP', 1, 15050, 15050],
      ]);
      expect(order.reservation).toMatchObject({
        status: 'ativa',
        secondsLeft: 600,
        serverNow: '2026-10-10T15:00:00.000Z',
        expiresAt: '2026-10-10T15:10:00.000Z',
      });
      const rows = await assertNoOversell(e.id);
      expect(rows.map(r => r.reserved).sort()).toEqual([1, 2]);
      // Reserva não é venda: nada vendido e nada marcado como pago.
      expect(rows.every(r => r.quantity_sold === 0)).toBe(true);
      expect((await sql('select paid_at from orders')).rows[0].paid_at).toBeNull();
    });

    it('o contador é do servidor: 2 minutos depois restam 480 s', async () => {
      const e = await event();
      const a = await buyer();
      const id = (await json(await a.order(e.slug, [item(e.types[0]!)]))).order.id;
      clock.advance(120_000);
      const { order } = await json(await a.get(`/orders/${id}`));
      expect(order.reservation).toMatchObject({ secondsLeft: 480, serverNow: '2026-10-10T15:02:00.000Z' });
    });

    it('a duração da reserva e o limite por compra vêm da configuração', async () => {
      const e = await event({ types: [{ total: 50 }] });
      const custom = build({ RESERVATION_MINUTES: '15', MAX_TICKETS_PER_ORDER: '2' });
      const a = await buyer('cliente', custom);
      const ok = await json(await a.order(e.slug, [item(e.types[0]!, 2)]));
      expect(ok.order.reservation.expiresAt).toBe('2026-10-10T15:15:00.000Z');
      expect(await code(await a.order(e.slug, [item(e.types[0]!, 3)]))).toBe('limite_por_compra');
    });

    it('o resumo (RF-32) recalcula no servidor e não reserva nem cria pedido', async () => {
      const e = await event({
        types: [
          { name: 'Pista', price: 8000 },
          { name: 'VIP', price: 15000 },
        ],
      });
      const a = await buyer();
      const res = await a.post('/checkout/quote', {
        eventSlug: e.slug,
        items: [item(e.types[0]!, 2), item(e.types[1]!, 1)],
      });
      expect(res.status).toBe(200);
      expect((await json(res)).summary).toMatchObject({
        totalCents: 31000,
        units: 3,
        event: { slug: e.slug },
        coupon: null,
      });
      expect((await sql('select count(*)::int as n from orders')).rows[0].n).toBe(0);
      expect((await sql('select count(*)::int as n from reservations')).rows[0].n).toBe(0);
    });
  });

  describe('limite por compra (CA-15)', () => {
    it('aceita até 6 e recusa 7, também quando a soma passa por vários tipos; nada fica gravado', async () => {
      const e = await event({ types: [{ total: 50 }, { total: 50 }] });
      const a = await buyer();
      expect((await a.order(e.slug, [item(e.types[0]!, 6)])).status).toBe(201);
      const seven = await a.order(e.slug, [item(e.types[0]!, 7)]);
      expect([seven.status, await code(seven)]).toEqual([422, 'limite_por_compra']);
      const split = await a.order(e.slug, [item(e.types[0]!, 4), item(e.types[1]!, 3)]);
      expect([split.status, await code(split)]).toEqual([422, 'limite_por_compra']);
      // O pedido válido anterior segue de pé: a recusa não o derrubou.
      expect((await sql("select count(*)::int as n from orders where status = 'pendente'")).rows[0].n).toBe(1);
      expect(await a.order(e.slug, [item(e.types[0]!, 3), item(e.types[1]!, 3)])).toHaveProperty('status', 201);
    });

    it('recusa quantidade zero, negativa, decimal, texto e tipo repetido', async () => {
      const e = await event();
      const a = await buyer();
      const t = e.types[0]!;
      for (const bad of [
        [item(t, 0)],
        [item(t, -2)],
        [item(t, 1.5)],
        [{ ticketTypeId: t, quantity: '2' }],
        [item(t), item(t)],
        [],
      ]) {
        expect((await a.order(e.slug, bad)).status, JSON.stringify(bad)).toBe(422);
      }
      expect((await a.order(e.slug, [{ ticketTypeId: 'x', quantity: 1 }])).status).toBe(422);
      expect((await sql('select count(*)::int as n from orders')).rows[0].n).toBe(0);
    });
  });

  describe('preço e total só do servidor (adulteração)', () => {
    it('ignora preço, total e desconto enviados pelo navegador', async () => {
      const e = await event({ types: [{ price: 8000 }] });
      const a = await buyer();
      const res = await a.raw('POST', '/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0',
        eventSlug: e.slug,
        items: [{ ticketTypeId: e.types[0], quantity: 2, unitPriceCents: 1, priceCents: 1, price: 0.01 }],
        totalCents: 2,
        total: 2,
        discountCents: 15000,
        status: 'pago',
        userId: crypto.randomUUID(),
      });
      expect(res.status).toBe(201);
      const { order } = await json(res);
      expect(order.totalCents).toBe(16000);
      const row = (await sql('select total_cents, status, paid_at from orders')).rows[0];
      expect(row).toMatchObject({ total_cents: 16000, status: 'pendente', paid_at: null });
      expect((await sql('select unit_price_cents from order_items')).rows[0].unit_price_cents).toBe(8000);
    });

    it('o preço mudou entre a tela e o pedido: avisa com o novo total e não reserva', async () => {
      const e = await event({ types: [{ price: 8000 }] });
      const a = await buyer();
      const shown = (await json(await a.post('/checkout/quote', { eventSlug: e.slug, items: [item(e.types[0]!, 2)] })))
        .summary.totalCents;
      await sql('update ticket_types set price_cents = 9000 where id = $1', [e.types[0]]);
      const res = await a.order(e.slug, [item(e.types[0]!, 2)], { expectedTotalCents: shown });
      const body = await json(res);
      expect([res.status, body.erro.codigo]).toEqual([409, 'preco_alterado']);
      expect(body.erro.detalhes.totalCents).toBe(18000);
      expect((await sql('select count(*)::int as n from reservations')).rows[0].n).toBe(0);
      expect((await a.order(e.slug, [item(e.types[0]!, 2)], { expectedTotalCents: 18000 })).status).toBe(201);
    });

    it('tipo de ingresso de outro evento ou inexistente é recusado', async () => {
      const e1 = await event();
      const e2 = await event();
      const a = await buyer();
      expect((await a.order(e1.slug, [item(e2.types[0]!)])).status).toBe(422);
      expect((await a.order(e1.slug, [item(crypto.randomUUID())])).status).toBe(422);
      expect((await a.order(e1.slug, [item(e1.types[0]!), item(e2.types[0]!)])).status).toBe(422);
      expect((await sql('select count(*)::int as n from reservations')).rows[0].n).toBe(0);
    });
  });

  describe('período, ativação e estado do evento', () => {
    it('em breve, encerrada, desativado e esgotado são recusados com o motivo', async () => {
      const e = await event({
        types: [
          { name: 'Futuro', start: '2026-11-01T00:00:00-03:00', end: '2026-12-01T00:00:00-03:00' },
          { name: 'Passado', start: '2026-09-01T00:00:00-03:00', end: '2026-10-01T00:00:00-03:00' },
          { name: 'Desativado', active: false },
          { name: 'Esgotado', total: 5, sold: 5 },
        ],
      });
      const a = await buyer();
      const reasons: string[] = [];
      for (const t of e.types) {
        const res = await a.order(e.slug, [item(t)]);
        expect(res.status).toBe(409);
        const body = await json(res);
        expect(body.erro.codigo).toBe('estoque_alterado');
        reasons.push(body.erro.detalhes.itens[0].motivo);
      }
      expect(reasons).toEqual(['em_breve', 'encerrada', 'indisponivel', 'esgotado']);
      expect((await sql('select count(*)::int as n from orders')).rows[0].n).toBe(0);
    });

    it('rascunho e encerrado não vendem; evento inexistente também não', async () => {
      const draft = await event({ status: 'rascunho' });
      const closed = await event({ status: 'encerrado' });
      const a = await buyer();
      for (const e of [draft, closed])
        expect(await code(await a.order(e.slug, [item(e.types[0]!)]))).toBe('evento_indisponivel');
      expect(await code(await a.order('nao-existe', [item(crypto.randomUUID())]))).toBe('evento_indisponivel');
    });

    it('um item ruim derruba o pedido inteiro e nenhum outro item fica reservado', async () => {
      const e = await event({ types: [{ total: 10 }, { total: 5, sold: 5 }] });
      const a = await buyer();
      const res = await a.order(e.slug, [item(e.types[0]!, 2), item(e.types[1]!, 1)]);
      expect(res.status).toBe(409);
      expect((await json(res)).erro.detalhes.itens).toHaveLength(1);
      expect((await sql('select count(*)::int as n from reservations')).rows[0].n).toBe(0);
    });
  });

  describe('cupom do promoter (RF-30, RF-31)', () => {
    const promoter = (codeValue: string, active = true) =>
      sql("insert into promoters (name, coupon_code, is_active) values ('Promoter Teste', $1, $2) returning id", [
        codeValue,
        active,
      ]);

    it('vincula a venda ao promoter sem mexer no total, aceitando minúsculas', async () => {
      const e = await event({ types: [{ price: 8000 }] });
      const p = (await promoter('JOAO10')).rows[0].id;
      const a = await buyer();
      const { order } = await json(await a.order(e.slug, [item(e.types[0]!, 2)], { couponCode: ' joao10 ' }));
      expect(order.totalCents).toBe(16000); // sem desconto
      expect(order.coupon).toEqual({ code: 'JOAO10', discount: null }); // promoter sem desconto (D-91): só atribui
      expect((await sql('select promoter_id from orders')).rows[0].promoter_id).toBe(p);
    });

    it('cupom inexistente, desativado ou malformado é recusado com mensagem clara e não reserva', async () => {
      const e = await event();
      await promoter('ATIVO1');
      await promoter('INATIVO', false);
      const a = await buyer();
      for (const couponCode of ['NAOEXISTE', 'INATIVO', 'COM ESPAÇO', "X'; DROP TABLE orders;--"]) {
        const res = await a.order(e.slug, [item(e.types[0]!)], { couponCode });
        const body = await json(res);
        expect([res.status, body.erro.codigo], couponCode).toEqual([422, 'cupom_invalido']);
        expect(body.erro.detalhes[0]).toMatchObject({ campo: 'couponCode' });
      }
      expect((await sql('select count(*)::int as n from reservations')).rows[0].n).toBe(0);
      const quoteBad = await a.post('/checkout/quote', {
        eventSlug: e.slug,
        items: [item(e.types[0]!)],
        couponCode: 'INATIVO',
      });
      expect(quoteBad.status).toBe(422);
    });

    it('cupom em branco ou nulo equivale a sem cupom', async () => {
      const e = await event();
      const a = await buyer();
      for (const couponCode of ['', '  ', null])
        expect((await a.order(e.slug, [item(e.types[0]!)], { couponCode })).status).toBe(201);
    });
  });

  describe('última unidade disputada (CA-16)', () => {
    it('com 1 unidade e 8 compradores ao mesmo tempo, só um reserva', async () => {
      for (let round = 0; round < 4; round++) {
        const e = await event({ types: [{ total: 1 }] });
        const buyers = await Promise.all(Array.from({ length: 8 }, () => buyer()));
        const res = await Promise.all(buyers.map(b => b.order(e.slug, [item(e.types[0]!)])));
        const statuses = res.map(r => r.status).sort();
        expect(statuses, `rodada ${round}`).toEqual([201, 409, 409, 409, 409, 409, 409, 409]);
        for (const r of res.filter(x => x.status === 409)) expect(await code(r)).toBe('estoque_alterado');
        const rows = await assertNoOversell(e.id);
        expect(rows[0]!.reserved).toBe(1);
        expect(
          (
            await sql('select count(*)::int as n from orders o join events ev on ev.id = o.event_id where ev.id = $1', [
              e.id,
            ])
          ).rows[0].n,
        ).toBe(1);
      }
    });

    it('com N unidades e mais compradores que unidades, vende exatamente N', async () => {
      const e = await event({ types: [{ total: 5 }] });
      const buyers = await Promise.all(Array.from({ length: 12 }, () => buyer()));
      const res = await Promise.all(buyers.map(b => b.order(e.slug, [item(e.types[0]!)])));
      expect(res.filter(r => r.status === 201)).toHaveLength(5);
      expect(res.filter(r => r.status === 409)).toHaveLength(7);
      expect((await assertNoOversell(e.id))[0]!.reserved).toBe(5);
    });

    it('pedidos de quantidades diferentes sobre o mesmo tipo nunca passam da capacidade', async () => {
      const e = await event({ types: [{ total: 7 }] });
      const buyers = await Promise.all(Array.from({ length: 10 }, () => buyer()));
      await Promise.all(buyers.map((b, i) => b.order(e.slug, [item(e.types[0]!, (i % 3) + 1)])));
      const [row] = await assertNoOversell(e.id);
      expect(row!.reserved).toBeLessThanOrEqual(7);
      expect(row!.reserved).toBeGreaterThanOrEqual(5); // não deixa sobrar muito: ninguém ficou de fora sem necessidade
    });

    it('compradores que pedem os mesmos tipos em ordens opostas não travam um ao outro', async () => {
      const e = await event({ types: [{ total: 3 }, { total: 3 }] });
      const [t1, t2] = e.types as [string, string];
      const buyers = await Promise.all(Array.from({ length: 8 }, () => buyer()));
      const res = await Promise.all(
        buyers.map((b, i) => b.order(e.slug, i % 2 ? [item(t1), item(t2)] : [item(t2), item(t1)])),
      );
      for (const r of res) expect([201, 409]).toContain(r.status); // nada de 500 por impasse
      expect(res.filter(r => r.status === 201)).toHaveLength(3);
      for (const row of await assertNoOversell(e.id)) expect(row.reserved).toBe(3);
    });

    it('rajada aleatória em vários tipos mantém a conta: reservas = soma dos pedidos pendentes', async () => {
      const e = await event({ types: [{ total: 3 }, { total: 5 }, { total: 2 }] });
      const buyers = await Promise.all(Array.from({ length: 10 }, () => buyer()));
      const pick = (i: number) => {
        const picks = [[0], [1], [2], [0, 1], [1, 2], [0, 2], [0, 1, 2]][i % 7]!;
        return picks.map(k => item(e.types[k]!, (i % 2) + 1));
      };
      const res = await Promise.all(buyers.flatMap((b, i) => [b.order(e.slug, pick(i)), b.order(e.slug, pick(i + 3))]));
      for (const r of res) expect([201, 409]).toContain(r.status);
      const rows = await assertNoOversell(e.id);
      const pending = (
        await sql(
          `select coalesce(sum(i.quantity),0)::int as n from order_items i join orders o on o.id = i.order_id where o.status = 'pendente'`,
        )
      ).rows[0].n;
      expect(rows.reduce((t, r) => t + r.reserved, 0)).toBe(pending);
    });
  });

  describe('um pedido pendente por comprador e evento', () => {
    it('um novo pedido substitui o anterior e libera a reserva dele', async () => {
      const e = await event({ types: [{ total: 4 }] });
      const a = await buyer();
      const first = (await json(await a.order(e.slug, [item(e.types[0]!, 4)]))).order.id;
      // O próprio comprador pode refazer o carrinho com o estoque que ele mesmo segurava.
      const second = await a.order(e.slug, [item(e.types[0]!, 3)]);
      expect(second.status).toBe(201);
      expect((await sql('select status from orders where id = $1', [first])).rows[0].status).toBe('expirado');
      expect((await sql('select status from reservations where order_id = $1', [first])).rows[0].status).toBe(
        'liberada',
      );
      expect((await assertNoOversell(e.id))[0]!.reserved).toBe(3);
    });

    it('dois envios simultâneos do mesmo comprador deixam um único pedido pendente', async () => {
      const e = await event({ types: [{ total: 10 }] });
      const a = await buyer();
      const res = await Promise.all(Array.from({ length: 5 }, () => a.order(e.slug, [item(e.types[0]!, 2)])));
      for (const r of res) expect(r.status).toBe(201);
      expect((await sql("select count(*)::int as n from orders where status = 'pendente'")).rows[0].n).toBe(1);
      expect((await assertNoOversell(e.id))[0]!.reserved).toBe(2);
    });

    it('envios simultâneos do mesmo comprador com tipos diferentes também deixam um só pedido pendente', async () => {
      const e = await event({ types: [{ total: 10 }, { total: 10 }, { total: 10 }] });
      const a = await buyer();
      // Tipos diferentes não disputam a mesma linha trancada: só a trava por comprador impede dois pedidos pendentes.
      const res = await Promise.all(
        e.types.flatMap(t => [a.order(e.slug, [item(t, 2)]), a.order(e.slug, [item(t, 1)])]),
      );
      for (const r of res) expect(r.status).toBe(201);
      expect((await sql("select count(*)::int as n from orders where status = 'pendente'")).rows[0].n).toBe(1);
      const rows = await assertNoOversell(e.id);
      expect(rows.reduce((t, r) => t + r.reserved, 0)).toBeLessThanOrEqual(2);
    });

    it('eventos diferentes têm pedidos independentes', async () => {
      const e1 = await event();
      const e2 = await event();
      const a = await buyer();
      expect((await a.order(e1.slug, [item(e1.types[0]!)])).status).toBe(201);
      expect((await a.order(e2.slug, [item(e2.types[0]!)])).status).toBe(201);
      expect((await sql("select count(*)::int as n from orders where status = 'pendente'")).rows[0].n).toBe(2);
    });

    it('com pagamento já iniciado e reserva viva, não troca o pedido; depois de vencer, libera', async () => {
      const e = await event({ types: [{ total: 5 }] });
      const a = await buyer();
      const id = (await json(await a.order(e.slug, [item(e.types[0]!, 2)]))).order.id;
      await sql("update orders set payment_method = 'pix' where id = $1", [id]);
      const blocked = await a.order(e.slug, [item(e.types[0]!, 1)]);
      expect([blocked.status, await code(blocked)]).toEqual([409, 'pedido_em_andamento']);
      expect(await code(await a.post(`/orders/${id}/cancel`))).toBe('pagamento_iniciado');
      expect((await sql('select status from orders where id = $1', [id])).rows[0].status).toBe('pendente');
      clock.advance(11 * 60_000);
      expect((await a.order(e.slug, [item(e.types[0]!, 1)])).status).toBe(201);
    });
  });

  describe('expiração e devolução do estoque (CA-17)', () => {
    it('reserva vencida devolve o estoque na hora, sem depender da rotina', async () => {
      const e = await event({ types: [{ total: 2 }] });
      const a = await buyer();
      const b = await buyer();
      expect((await a.order(e.slug, [item(e.types[0]!, 2)])).status).toBe(201);
      expect((await b.order(e.slug, [item(e.types[0]!, 1)])).status).toBe(409);
      clock.advance(10 * 60_000 + 1000);
      expect((await b.order(e.slug, [item(e.types[0]!, 2)])).status).toBe(201);
      expect((await assertNoOversell(e.id))[0]!.reserved).toBe(2);
    });

    it('a rotina marca pedido como expirado e reserva como expirada, e repetir não muda nada', async () => {
      const e = await event({ types: [{ total: 5 }] });
      const buyers = await Promise.all([buyer(), buyer(), buyer()]);
      await Promise.all(buyers.map(b => b.order(e.slug, [item(e.types[0]!)])));
      clock.advance(11 * 60_000);
      const deps = { db: createDrizzle(testDb.pool), clock };
      expect(await expireOverdue(deps)).toEqual({ reservations: 3, orders: 3 });
      expect(await expireOverdue(deps)).toEqual({ reservations: 0, orders: 0 });
      expect((await sql("select count(*)::int as n from orders where status = 'expirado'")).rows[0].n).toBe(3);
      expect((await sql("select count(*)::int as n from reservations where status = 'expirada'")).rows[0].n).toBe(3);
      expect((await sql('select count(*)::int as n from reservations where released_at is not null')).rows[0].n).toBe(
        3,
      );
    });

    it('execuções simultâneas da rotina não duplicam nem quebram', async () => {
      const e = await event({ types: [{ total: 9 }] });
      const buyers = await Promise.all(Array.from({ length: 5 }, () => buyer()));
      await Promise.all(buyers.map(b => b.order(e.slug, [item(e.types[0]!)])));
      clock.advance(11 * 60_000);
      const deps = { db: createDrizzle(testDb.pool), clock };
      const results = await Promise.all(Array.from({ length: 6 }, () => expireOverdue(deps)));
      expect(results.reduce((t, r) => t + r.reservations, 0)).toBe(5);
      expect(results.reduce((t, r) => t + r.orders, 0)).toBe(5);
    });

    it('a rotina não toca em reserva ainda válida nem em pedido de outro estado', async () => {
      const e = await event({ types: [{ total: 5 }] });
      const a = await buyer();
      const b = await buyer();
      const idA = (await json(await a.order(e.slug, [item(e.types[0]!)]))).order.id;
      const idB = (await json(await b.order(e.slug, [item(e.types[0]!)]))).order.id;
      // B já foi pago por outro caminho (simulado): a rotina não pode rebaixar para "expirado".
      await sql("update orders set status = 'pago', paid_at = now() where id = $1", [idB]);
      clock.advance(9 * 60_000);
      expect(await expireOverdue({ db: createDrizzle(testDb.pool), clock })).toEqual({ reservations: 0, orders: 0 });
      clock.advance(2 * 60_000);
      const r = await expireOverdue({ db: createDrizzle(testDb.pool), clock });
      expect(r.reservations).toBe(2);
      expect(r.orders).toBe(1);
      expect((await sql('select status from orders where id = $1', [idB])).rows[0].status).toBe('pago');
      expect((await sql('select status from orders where id = $1', [idA])).rows[0].status).toBe('expirado');
    });

    it('consultar o pedido depois do prazo mostra "expirado" e contador zerado', async () => {
      const e = await event();
      const a = await buyer();
      const id = (await json(await a.order(e.slug, [item(e.types[0]!)]))).order.id;
      clock.advance(10 * 60_000);
      const { order } = await json(await a.get(`/orders/${id}`));
      expect(order.status).toBe('expirado');
      expect(order.reservation).toMatchObject({ status: 'expirada', secondsLeft: 0 });
    });
  });

  describe('cancelar antes de pagar', () => {
    it('libera a reserva na hora, e repetir não muda nada', async () => {
      const e = await event({ types: [{ total: 1 }] });
      const a = await buyer();
      const b = await buyer();
      const id = (await json(await a.order(e.slug, [item(e.types[0]!)]))).order.id;
      expect((await b.order(e.slug, [item(e.types[0]!)])).status).toBe(409);
      const res = await a.post(`/orders/${id}/cancel`);
      expect(res.status).toBe(200);
      expect((await json(res)).order).toMatchObject({
        status: 'expirado',
        reservation: { status: 'liberada', secondsLeft: 0 },
      });
      expect((await a.post(`/orders/${id}/cancel`)).status).toBe(200);
      expect((await b.order(e.slug, [item(e.types[0]!)])).status).toBe(201);
    });

    it('pedido pago não é cancelável por esta rota', async () => {
      const e = await event();
      const a = await buyer();
      const id = (await json(await a.order(e.slug, [item(e.types[0]!)]))).order.id;
      await sql("update orders set status = 'pago', paid_at = now() where id = $1", [id]);
      expect(await code(await a.post(`/orders/${id}/cancel`))).toBe('estado_invalido');
    });
  });

  describe('painel de eventos e a reserva real', () => {
    it('não deixa reduzir a capacidade abaixo do que a compra reservou (RF-17)', async () => {
      const e = await event({ types: [{ total: 10 }] });
      const a = await buyer();
      await a.order(e.slug, [item(e.types[0]!, 4)]);
      const admin = await buyer('administrador');
      const low = await admin.raw('PATCH', `/admin/ticket-types/${e.types[0]}`, { quantityTotal: 3 });
      expect([low.status, (await json(low)).erro.detalhes]).toEqual([409, { vendidos: 0, reservados: 4, minimo: 4 }]);
      expect((await admin.raw('PATCH', `/admin/ticket-types/${e.types[0]}`, { quantityTotal: 4 })).status).toBe(200);
      // Com a capacidade no limite, ninguém mais reserva.
      const b = await buyer();
      expect((await b.order(e.slug, [item(e.types[0]!)])).status).toBe(409);
    });
  });
});
