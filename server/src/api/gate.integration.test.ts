import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { newTicketCode, signQr } from '../domain/ticketCode';
import { classifyQuery, foldName } from '../gate/service';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { issueForOrder, createTicketIssuer } from '../tickets/issuer';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';

describe.skipIf(!ADMIN_URL)('portaria (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-12-12T22:00:00-03:00');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const config = loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none' });
  let app: ReturnType<typeof createApp>;
  let hash = '';
  let n = 0;

  type Role = 'cliente' | 'validador' | 'administrador';
  async function user(
    role: Role = 'validador',
    name?: string,
    extra: { mustChange?: boolean; cpf?: string; email?: string } = {},
  ) {
    const i = ++n;
    const email = extra.email ?? `${role}${i}@exemplo.com`;
    const id = (
      await sql(
        'insert into users (name,email,cpf,password_hash,role,must_change_password) values ($1,$2,$3,$4,$5,$6) returning id',
        [
          name ?? `Pessoa ${role} ${i}`,
          email,
          role === 'cliente' ? (extra.cpf ?? String(50000000000 + i)) : null,
          hash,
          role,
          extra.mustChange ?? false,
        ],
      )
    ).rows[0].id as string;
    return { id, email };
  }
  async function session(role: Role = 'validador', name?: string, extra: Parameters<typeof user>[2] = {}) {
    const u = await user(role, name, extra);
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
    const login = await raw('POST', '/auth/login', { email: u.email, password: PASSWORD });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    return {
      ...u,
      raw,
      get: (p: string) => raw('GET', p),
      post: (p: string, b: unknown = {}) => raw('POST', p, b),
      scan: (eventId: string, qr: string) => raw('POST', '/gate/scan', { eventId, qr }),
      search: (eventId: string, q: string) => raw('POST', '/gate/search', { eventId, q }),
      admit: (eventId: string, ticketId: string) => raw('POST', '/gate/admit', { eventId, ticketId }),
    };
  }
  const json = async <T = any>(res: Response) => (await res.json()) as T;

  async function event(name = 'Noite Neon Verão', status = 'publicado') {
    const id = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values ($1,$2,'2026-12-12T22:00:00-03:00','Arena Central','Rua 1','d','Livre',$3) returning id`,
        [`evento-${++n}`, name, status],
      )
    ).rows[0].id as string;
    const types = {
      Pista: (
        await sql(
          `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'Pista',8000,500,'2026-10-01T00:00:00-03:00','2026-12-12T20:00:00-03:00') returning id`,
          [id],
        )
      ).rows[0].id as string,
      VIP: (
        await sql(
          `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'VIP',20000,500,'2026-10-01T00:00:00-03:00','2026-12-12T20:00:00-03:00') returning id`,
          [id],
        )
      ).rows[0].id as string,
    };
    return { id, name, types };
  }

  /** Pedido pago com ingressos emitidos pelo emissor de verdade (sem passar pelo gateway). */
  async function buyer(
    e: Awaited<ReturnType<typeof event>>,
    opts: { name?: string; cpf?: string; email?: string; items?: [keyof typeof e.types, number][] } = {},
  ) {
    const u = await user('cliente', opts.name ?? 'Marina Costa', { cpf: opts.cpf, email: opts.email });
    const items = opts.items ?? [['Pista', 1]];
    const total = items.reduce((t, [, q]) => t + q * 8000, 0);
    const order = (
      await sql(
        `insert into orders (user_id,event_id,total_cents,status,paid_at,payment_method) values ($1,$2,$3,'pago',now(),'pix') returning id`,
        [u.id, e.id, total],
      )
    ).rows[0].id as string;
    const orderItems: { orderItemId: string; ticketTypeId: string; quantity: number }[] = [];
    for (const [type, quantity] of items) {
      const itemId = (
        await sql(
          `insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,$4,8000) returning id`,
          [order, e.id, e.types[type], quantity],
        )
      ).rows[0].id as string;
      orderItems.push({ orderItemId: itemId, ticketTypeId: e.types[type], quantity });
    }
    await createDrizzle(testDb.pool).transaction(tx =>
      issueForOrder(tx, config.qr, { id: order, userId: u.id, eventId: e.id, items: orderItems }),
    );
    const rows = (
      await sql(
        'select t.id, t.code, t.short_code, t.qr_payload, t.status from tickets t join ticket_types y on y.id = t.ticket_type_id where t.order_id = $1 order by y.name, t.unit_index',
        [order],
      )
    ).rows;
    return {
      ...u,
      orderId: order,
      tickets: rows as { id: string; code: string; short_code: string; qr_payload: string; status: string }[],
    };
  }
  const checkinsOf = async (ticketId: string) =>
    (
      await sql('select result, method, validator_id from checkins where ticket_id = $1 order by created_at, id', [
        ticketId,
      ])
    ).rows;

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
      'truncate payment_events, checkins, tickets, reservations, order_items, orders, ticket_types, events, email_log, audit_log, sessions, login_attempts, users cascade',
    );
    clock.set('2026-12-12T22:00:00-03:00');
  });

  describe('acesso (RF-44)', () => {
    it('só validador e administrador; sem sessão 401, cliente 403, em todas as rotas', async () => {
      const e = await event();
      const b = await buyer(e);
      const client = await session('cliente');
      const val = await session('validador');
      const adm = await session('administrador');
      const calls: [string, string, unknown?][] = [
        ['GET', '/gate/events'],
        ['GET', `/gate/events/${e.id}/counter`],
        ['POST', '/gate/scan', { eventId: e.id, qr: b.tickets[0]!.qr_payload }],
        ['POST', '/gate/search', { eventId: e.id, q: 'Marina' }],
        ['POST', '/gate/admit', { eventId: e.id, ticketId: b.tickets[0]!.id }],
      ];
      for (const [m, p, body] of calls) {
        const anon = await app.request(`/api${p}`, {
          method: m,
          headers: { 'content-type': 'application/json', origin: 'http://localhost' },
          body: body ? JSON.stringify(body) : undefined,
        });
        expect([p, anon.status]).toEqual([p, 401]);
        expect([p, (await client.raw(m, p, body)).status]).toEqual([p, 403]);
      }
      // Nada foi consumido pelas tentativas negadas.
      expect((await sql('select count(*)::int as n from checkins')).rows[0].n).toBe(0);
      expect((await val.get('/gate/events')).status).toBe(200);
      expect((await adm.get('/gate/events')).status).toBe(200);
      expect((await adm.scan(e.id, b.tickets[0]!.qr_payload)).status).toBe(200);
    });

    it('caminho inexistente sob /gate também é negado ao cliente (nega por padrão)', async () => {
      const client = await session('cliente');
      expect((await client.get('/gate/qualquer-coisa')).status).toBe(403);
    });

    it('com a senha temporária ainda não trocada, a portaria fica bloqueada', async () => {
      const e = await event();
      const v = await session('validador', 'Valida Dor', { mustChange: true });
      const res = await v.get('/gate/events');
      expect([res.status, (await json(res)).erro.codigo]).toEqual([403, 'troca_de_senha_obrigatoria']);
      void e;
    });

    it('respostas da portaria nunca vão para cache', async () => {
      const v = await session();
      expect((await v.get('/gate/events')).headers.get('cache-control')).toBe('private, no-store');
    });
  });

  describe('seleção do evento (RF-45)', () => {
    it('lista só eventos publicados, com o contador de cada um', async () => {
      const a = await event('Evento A');
      await event('Rascunho', 'rascunho');
      await event('Encerrado', 'encerrado');
      const b = await buyer(a, { items: [['Pista', 3]] });
      const v = await session();
      await v.scan(a.id, b.tickets[0]!.qr_payload);
      const { events } = await json(await v.get('/gate/events'));
      expect(events.map((x: any) => [x.name, x.entered, x.total])).toEqual([['Evento A', 1, 3]]);
    });

    it('evento fora do ar (rascunho, encerrado) ou inexistente não abre a portaria', async () => {
      const closed = await event('Encerrado', 'encerrado');
      const draft = await event('Rascunho', 'rascunho');
      const v = await session();
      for (const id of [closed.id, draft.id]) {
        const res = await v.scan(id, 'PX1.1.x');
        expect([res.status, (await json(res)).erro.codigo]).toEqual([409, 'evento_indisponivel']);
      }
      expect((await v.scan(crypto.randomUUID(), 'PX1.1.x')).status).toBe(404);
      expect((await v.get('/gate/events/nao-uuid/counter')).status).toBe(404);
    });
  });

  describe('leitura do QR (RF-46 a RF-51, CA-23)', () => {
    it('primeira leitura verde, segunda amarela com horário e validador da primeira entrada', async () => {
      const e = await event();
      const b = await buyer(e, { name: 'Marina Costa', items: [['VIP', 1]] });
      const v1 = await session('validador', 'Carlos Portaria');
      const v2 = await session('validador', 'Dani Entrada');
      const qr = b.tickets[0]!.qr_payload;

      const first = await json(await v1.scan(e.id, qr));
      expect(first).toMatchObject({
        result: 'valido',
        message: 'Entrada liberada',
        method: 'camera',
        counter: { entered: 1, total: 1 },
      });
      expect(first.ticket).toMatchObject({
        typeName: 'VIP',
        holderName: 'Marina Costa',
        shortCode: b.tickets[0]!.short_code,
      }); // RF-49

      clock.advance(95_000);
      const second = await json(await v2.scan(e.id, qr));
      expect(second).toMatchObject({
        result: 'ja_utilizado',
        message: 'Ingresso já utilizado',
        counter: { entered: 1 },
      });
      expect(second.firstEntry).toEqual({ at: '2026-12-13T01:00:00.000Z', validatorName: 'Carlos Portaria' }); // primeira entrada, não a segunda
      expect(second.ticket.typeName).toBe('VIP');

      const row = (await sql('select status, used_at, validated_by from tickets where id = $1', [b.tickets[0]!.id]))
        .rows[0];
      expect(row).toMatchObject({ status: 'utilizado', validated_by: v1.id });
      expect(new Date(row.used_at).toISOString()).toBe('2026-12-13T01:00:00.000Z');
      expect((await checkinsOf(b.tickets[0]!.id)).map(c => [c.result, c.method, c.validator_id])).toEqual([
        ['valido', 'camera', v1.id],
        ['ja_utilizado', 'camera', v2.id],
      ]);
    });

    it('ler a mesma entrada de novo não altera a primeira marcação (bloqueio após a primeira validação, RF-50)', async () => {
      const e = await event();
      const b = await buyer(e);
      const v = await session();
      await v.scan(e.id, b.tickets[0]!.qr_payload);
      const before = (await sql('select used_at, validated_by from tickets where id = $1', [b.tickets[0]!.id])).rows[0];
      clock.advance(60_000);
      for (let i = 0; i < 4; i++) await v.scan(e.id, b.tickets[0]!.qr_payload);
      expect(
        (await sql('select used_at, validated_by from tickets where id = $1', [b.tickets[0]!.id])).rows[0],
      ).toEqual(before);
      expect((await sql("select count(*)::int as n from checkins where result = 'valido'")).rows[0].n).toBe(1);
    });

    it('a resposta não traz o código secreto, o conteúdo do QR nem CPF', async () => {
      const e = await event();
      const b = await buyer(e, { cpf: '52998224725' });
      const v = await session();
      const text = JSON.stringify([
        await json(await v.scan(e.id, b.tickets[0]!.qr_payload)),
        await json(await v.scan(e.id, b.tickets[0]!.qr_payload)),
      ]);
      expect(text).not.toContain(b.tickets[0]!.code);
      expect(text).not.toContain(b.tickets[0]!.qr_payload);
      expect(text).not.toMatch(/52998224725|529\.982/);
    });
  });

  describe('ingresso cancelado (CA-24)', () => {
    it('aparece vermelho, não entra, e a tentativa fica registrada', async () => {
      const e = await event();
      const b = await buyer(e);
      await sql(
        "update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'estorno' where id = $1",
        [b.tickets[0]!.id],
      );
      const v = await session();
      const res = await json(await v.scan(e.id, b.tickets[0]!.qr_payload));
      expect(res).toMatchObject({
        result: 'cancelado',
        message: 'Ingresso cancelado',
        counter: { entered: 0, total: 0 },
      });
      expect((await sql('select status from tickets where id = $1', [b.tickets[0]!.id])).rows[0].status).toBe(
        'cancelado',
      );
      expect((await checkinsOf(b.tickets[0]!.id)).map(c => c.result)).toEqual(['cancelado']);
    });

    it('cancelado depois de já ter entrado: continua "utilizado" até alguém decidir; cancelado antes de entrar nunca entra', async () => {
      const e = await event();
      const b = await buyer(e, { items: [['Pista', 2]] });
      const v = await session();
      await v.scan(e.id, b.tickets[0]!.qr_payload);
      await sql("update tickets set status = 'cancelado', cancelled_at = now() where id = $1", [b.tickets[1]!.id]);
      expect((await json(await v.scan(e.id, b.tickets[1]!.qr_payload))).result).toBe('cancelado');
      expect((await json(await v.scan(e.id, b.tickets[0]!.qr_payload))).result).toBe('ja_utilizado');
    });
  });

  describe('dois aparelhos ao mesmo tempo (CA-25)', () => {
    it('só um fica verde, em várias rodadas, com validadores diferentes', async () => {
      const e = await event();
      const [v1, v2] = await Promise.all([
        session('validador', 'Carlos Portaria'),
        session('validador', 'Dani Entrada'),
      ]);
      for (let round = 0; round < 20; round++) {
        const b = await buyer(e);
        const qr = b.tickets[0]!.qr_payload;
        const [r1, r2] = await Promise.all([v1.scan(e.id, qr), v2.scan(e.id, qr)]);
        const results = [(await json(r1)).result, (await json(r2)).result].sort();
        expect(results, `rodada ${round}`).toEqual(['ja_utilizado', 'valido']);
        expect(
          (
            await sql("select count(*)::int as n from checkins where ticket_id = $1 and result = 'valido'", [
              b.tickets[0]!.id,
            ])
          ).rows[0].n,
        ).toBe(1);
      }
    });

    it('dez aparelhos no mesmo ingresso: um verde, nove amarelos, contador +1, e todos os amarelos apontam o mesmo primeiro validador', async () => {
      const e = await event();
      const b = await buyer(e);
      const staff = await Promise.all(Array.from({ length: 10 }, (_, i) => session('validador', `Validador ${i}`)));
      const res = await Promise.all(staff.map(s => s.scan(e.id, b.tickets[0]!.qr_payload)));
      const bodies = await Promise.all(res.map(r => json(r)));
      expect(bodies.filter(x => x.result === 'valido')).toHaveLength(1);
      const yellow = bodies.filter(x => x.result === 'ja_utilizado');
      expect(yellow).toHaveLength(9);
      expect(new Set(yellow.map(x => x.firstEntry.validatorName)).size).toBe(1);
      expect((await sql("select count(*)::int as n from tickets where status = 'utilizado'")).rows[0].n).toBe(1);
    });

    it('leitura por câmera e entrada manual simultâneas: só uma vale', async () => {
      const e = await event();
      const b = await buyer(e);
      const [cam, man] = await Promise.all([session(), session()]);
      const [r1, r2] = await Promise.all([cam.scan(e.id, b.tickets[0]!.qr_payload), man.admit(e.id, b.tickets[0]!.id)]);
      expect([(await json(r1)).result, (await json(r2)).result].sort()).toEqual(['ja_utilizado', 'valido']);
      expect((await sql("select count(*)::int as n from checkins where result = 'valido'")).rows[0].n).toBe(1);
    });

    it('o banco também impede duas entradas válidas do mesmo ingresso (último recurso)', async () => {
      const e = await event();
      const b = await buyer(e);
      const v = await user('validador');
      await sql(
        "insert into checkins (ticket_id,event_id,validator_id,result,method) values ($1,$2,$3,'valido','camera')",
        [b.tickets[0]!.id, e.id, v.id],
      );
      await expect(
        sql(
          "insert into checkins (ticket_id,event_id,validator_id,result,method) values ($1,$2,$3,'valido','camera')",
          [b.tickets[0]!.id, e.id, v.id],
        ),
      ).rejects.toThrow(/checkins_one_valid_per_ticket_key/);
    });
  });

  describe('casos difíceis de leitura (Prompt 23)', () => {
    it('validador desativado ou com sessão revogada no meio do evento: a leitura seguinte é negada e nada é marcado', async () => {
      const e = await event();
      const b = await buyer(e, { items: [['Pista', 3]] });
      const v = await session('validador', 'Carlos Portaria');
      expect((await v.scan(e.id, b.tickets[0]!.qr_payload)).status).toBe(200);
      await sql('update users set is_active = false where id = $1', [v.id]);
      expect((await v.scan(e.id, b.tickets[1]!.qr_payload)).status).toBe(401);
      expect((await v.admit(e.id, b.tickets[1]!.id)).status).toBe(401);
      await sql('update users set is_active = true where id = $1', [v.id]);
      await sql('update sessions set revoked_at = now() where user_id = $1', [v.id]);
      expect((await v.scan(e.id, b.tickets[1]!.qr_payload)).status).toBe(401);
      expect((await checkinsOf(b.tickets[1]!.id)).length).toBe(0);
      expect((await sql('select status from tickets where id = $1', [b.tickets[1]!.id])).rows[0].status).toBe('valido');
    });

    it('perfil rebaixado para cliente no meio do evento: a portaria fecha', async () => {
      const e = await event();
      const b = await buyer(e);
      const v = await session('validador');
      await sql("update users set role = 'cliente', cpf = '39053344705' where id = $1", [v.id]);
      const res = await v.scan(e.id, b.tickets[0]!.qr_payload);
      expect([401, 403]).toContain(res.status);
      expect((await checkinsOf(b.tickets[0]!.id)).length).toBe(0);
    });

    it('leitura e cancelamento ao mesmo tempo: o resultado é coerente e nunca há entrada válida num ingresso cancelado antes', async () => {
      const e = await event();
      const v1 = await session('validador', 'Carlos Portaria');
      const v2 = await session('validador', 'Dani Entrada');
      for (let round = 0; round < 15; round++) {
        const b = await buyer(e);
        const id = b.tickets[0]!.id;
        const [r1] = await Promise.all([
          v1.scan(e.id, b.tickets[0]!.qr_payload),
          v2.scan(e.id, b.tickets[0]!.qr_payload),
          sql(
            "update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'teste' where id = $1 and status = 'valido'",
            [id],
          ),
        ]);
        expect(r1.status).toBe(200);
        const final = (await sql('select status from tickets where id = $1', [id])).rows[0].status as string;
        const valid = (await checkinsOf(id)).filter(c => c.result === 'valido').length;
        expect(['utilizado', 'cancelado'], `rodada ${round}`).toContain(final);
        expect(valid, `rodada ${round}`).toBe(final === 'utilizado' ? 1 : 0);
      }
    });

    it('rajada: 24 ingressos lidos por 3 aparelhos, cada um duas vezes, em paralelo: 24 verdes, contador 24', async () => {
      const e = await event();
      const devices = await Promise.all([session(), session(), session()]);
      const batch = await buyer(e, { items: [['Pista', 24]] });
      const calls = batch.tickets.flatMap((t, i) => [
        devices[i % 3]!.scan(e.id, t.qr_payload),
        devices[(i + 1) % 3]!.scan(e.id, t.qr_payload),
      ]);
      const responses = await Promise.all(calls);
      const results = await Promise.all(responses.map(async r => (await json(r)).result as string));
      expect(results.filter(r => r === 'valido')).toHaveLength(24);
      expect(results.filter(r => r === 'ja_utilizado')).toHaveLength(24);
      expect((await json(await devices[0]!.get(`/gate/events/${e.id}/counter`))).counter.entered).toBe(24);
    });

    it('inexistente, adulterado e de outro evento lidos ao mesmo tempo que um válido não atrapalham o válido', async () => {
      const e = await event();
      const other = await event('Outra Festa');
      const mine = await buyer(e);
      const foreign = await buyer(other);
      const v = await session();
      const forged = mine.tickets[0]!.qr_payload.slice(0, -2) + (mine.tickets[0]!.qr_payload.endsWith('AA') ? 'BB' : 'AA');
      const out = await Promise.all([
        v.scan(e.id, forged),
        v.scan(e.id, foreign.tickets[0]!.qr_payload),
        v.scan(e.id, mine.tickets[0]!.qr_payload),
        v.scan(e.id, 'lixo-qualquer'),
      ]);
      expect((await Promise.all(out.map(async r => (await json(r)).result))).sort()).toEqual(
        ['invalido', 'invalido', 'outro_evento', 'valido'],
      );
      expect((await sql('select status from tickets where id = $1', [foreign.tickets[0]!.id])).rows[0].status).toBe(
        'valido',
      );
    });
  });

  describe('contador (RF-53, CA-27)', () => {
    it('sobe uma unidade a cada entrada válida e não muda com amarelo, vermelho ou tentativa inválida', async () => {
      const e = await event();
      const b = await buyer(e, {
        items: [
          ['Pista', 3],
          ['VIP', 1],
        ],
      });
      const v = await session();
      const entered = async () =>
        (await json(await v.get(`/gate/events/${e.id}/counter`))).counter as { entered: number; total: number };
      expect(await entered()).toEqual({ entered: 0, total: 4 });
      for (let i = 0; i < 3; i++) {
        const r = await json(await v.scan(e.id, b.tickets[i]!.qr_payload));
        expect(r.counter.entered).toBe(i + 1); // CA-27
        expect(await entered()).toEqual({ entered: i + 1, total: 4 });
      }
      await v.scan(e.id, b.tickets[0]!.qr_payload); // amarelo
      await v.scan(e.id, 'PX1.1.lixo'); // inválido
      expect(await entered()).toEqual({ entered: 3, total: 4 });
    });

    it('por tipo: Pista e VIP separados', async () => {
      const e = await event();
      const b = await buyer(e, {
        items: [
          ['Pista', 2],
          ['VIP', 1],
        ],
      });
      const v = await session();
      await v.scan(e.id, b.tickets[0]!.qr_payload);
      await v.scan(e.id, b.tickets[2]!.qr_payload);
      const { byType } = await json(await v.get(`/gate/events/${e.id}/counter`));
      expect(byType).toEqual([
        { typeName: 'Pista', entered: 1, total: 2 },
        { typeName: 'VIP', entered: 1, total: 1 },
      ]);
    });

    it('entradas de outros eventos não entram na conta', async () => {
      const e1 = await event('Evento 1');
      const e2 = await event('Evento 2');
      const b1 = await buyer(e1);
      await buyer(e2, { items: [['Pista', 5]] });
      const v = await session();
      await v.scan(e1.id, b1.tickets[0]!.qr_payload);
      expect((await json(await v.get(`/gate/events/${e1.id}/counter`))).counter).toEqual({ entered: 1, total: 1 });
      expect((await json(await v.get(`/gate/events/${e2.id}/counter`))).counter).toEqual({ entered: 0, total: 5 });
    });
  });

  describe('ingresso de outro evento (RF-54)', () => {
    it('recusa com mensagem específica e o nome do evento do ingresso, sem consumir o ingresso', async () => {
      const a = await event('Noite Neon');
      const b = await event('Baile do Zé');
      const buyerB = await buyer(b);
      const v = await session();
      const res = await json(await v.scan(a.id, buyerB.tickets[0]!.qr_payload));
      expect(res).toMatchObject({
        result: 'outro_evento',
        message: 'Ingresso de outro evento',
        otherEvent: { name: 'Baile do Zé' },
        counter: { entered: 0, total: 0 },
      });
      expect((await sql('select status from tickets where id = $1', [buyerB.tickets[0]!.id])).rows[0].status).toBe(
        'valido',
      );
      expect((await checkinsOf(buyerB.tickets[0]!.id)).map(c => c.result)).toEqual(['outro_evento']);
      // No evento certo, entra normalmente.
      expect((await json(await v.scan(b.id, buyerB.tickets[0]!.qr_payload))).result).toBe('valido');
    });
  });

  describe('QR adulterado ou desconhecido (CA-22 na portaria)', () => {
    it('um caractere alterado em qualquer posição: inválido, e o ingresso original segue válido', async () => {
      const e = await event();
      const b = await buyer(e);
      const v = await session();
      const qr = b.tickets[0]!.qr_payload;
      for (let i = 0; i < qr.length; i += 3) {
        const tampered = qr.slice(0, i) + (qr[i] === 'A' ? 'B' : 'A') + qr.slice(i + 1);
        expect((await json(await v.scan(e.id, tampered))).result, `posição ${i}`).toBe('invalido');
      }
      expect((await sql('select status from tickets where id = $1', [b.tickets[0]!.id])).rows[0].status).toBe('valido');
      expect((await json(await v.scan(e.id, qr))).result).toBe('valido');
    });

    it('inválido: código curto, código secreto, texto qualquer e assinatura certa de código que não existe', async () => {
      const e = await event();
      const b = await buyer(e);
      const v = await session();
      for (const bad of [
        b.tickets[0]!.short_code,
        b.tickets[0]!.code,
        'https://exemplo.com',
        'texto qualquer',
        signQr(config.qr.keys, 1, e.id, newTicketCode()),
      ]) {
        const res = await json(await v.scan(e.id, bad));
        expect([bad.slice(0, 12), res.result]).toEqual([bad.slice(0, 12), 'invalido']);
        expect(res.ticket).toBeNull();
      }
      expect((await sql('select status from tickets where id = $1', [b.tickets[0]!.id])).rows[0].status).toBe('valido');
    });

    it('a tentativa inválida é registrada só com o começo do que foi lido, nunca o suficiente para reconstituir um código', async () => {
      const e = await event();
      const b = await buyer(e);
      const v = await session();
      const qr = b.tickets[0]!.qr_payload;
      await v.scan(e.id, qr.slice(0, -1) + (qr.endsWith('A') ? 'B' : 'A')); // quase certo
      const row = (await sql("select code_presented, ticket_id from checkins where result = 'invalido'")).rows[0];
      expect(row.ticket_id).toBeNull();
      expect(row.code_presented.length).toBeLessThanOrEqual(24);
      expect(row.code_presented).not.toContain(b.tickets[0]!.code);
    });

    it('entrada vazia, enorme ou sem evento é recusada na validação', async () => {
      const e = await event();
      const v = await session();
      expect((await v.scan(e.id, '')).status).toBe(422);
      expect((await v.scan(e.id, 'x'.repeat(301))).status).toBe(422);
      expect((await v.post('/gate/scan', { qr: 'PX1.1.x' })).status).toBe(422);
      expect((await v.post('/gate/scan', { eventId: 'nao-uuid', qr: 'PX1.1.x' })).status).toBe(422);
    });
  });

  describe('busca manual (RF-52)', () => {
    async function setup() {
      const e = await event();
      const ana = await buyer(e, { name: 'Ana Souza', cpf: '52998224725', email: 'ana.souza@exemplo.com' });
      const jose = await buyer(e, {
        name: 'José da Conceição',
        cpf: '39053344705',
        email: 'jose@exemplo.com',
        items: [['Pista', 2]],
      });
      const v = await session();
      return { e, ana, jose, v };
    }
    const hits = async (r: Response) => (await json(r)).hits as any[];

    it('acha por nome parcial, sem diferenciar acento nem maiúsculas', async () => {
      const { e, v } = await setup();
      expect((await hits(await v.search(e.id, 'conceicao'))).map(h => h.holderName)).toEqual([
        'José da Conceição',
        'José da Conceição',
      ]);
      expect((await hits(await v.search(e.id, 'JOSÉ'))).length).toBe(2);
      expect((await hits(await v.search(e.id, 'souz'))).map(h => h.holderName)).toEqual(['Ana Souza']);
      expect(await hits(await v.search(e.id, 'zzzz'))).toEqual([]);
    });

    it('acha pelo código curto (inteiro ou começo) e pelo CPF e e-mail completos', async () => {
      const { e, ana, v } = await setup();
      const code = ana.tickets[0]!.short_code;
      expect((await hits(await v.search(e.id, code)))[0]).toMatchObject({
        ticketId: ana.tickets[0]!.id,
        holderName: 'Ana Souza',
        typeName: 'Pista',
        status: 'valido',
      });
      expect((await hits(await v.search(e.id, code.toLowerCase().slice(0, 8)))).length).toBeGreaterThanOrEqual(1);
      expect((await hits(await v.search(e.id, '529.982.247-25')))[0].holderName).toBe('Ana Souza');
      expect((await hits(await v.search(e.id, '52998224725')))[0].holderName).toBe('Ana Souza');
      expect((await hits(await v.search(e.id, 'ANA.SOUZA@exemplo.com')))[0].holderName).toBe('Ana Souza');
    });

    it('acesso limitado: CPF e e-mail só inteiros; consulta curta ou longa recusada', async () => {
      const { e, v } = await setup();
      for (const bad of [
        '529982',
        '529.982',
        '5299822472',
        'ana@',
        '@exemplo.com',
        'ana.souza@exemplo',
        'ab',
        '  ',
        'x'.repeat(101),
        'PX-',
      ]) {
        const res = await v.search(e.id, bad);
        expect([bad.slice(0, 15), res.status]).toEqual([bad.slice(0, 15), 422]);
      }
    });

    it('mostra o CPF mascarado e o e-mail parcialmente oculto, nunca inteiros', async () => {
      const { e, v } = await setup();
      const res = await v.search(e.id, 'Ana Souza');
      const text = JSON.stringify(await json(res));
      expect(text).toContain('***.982.247-**');
      expect(text).toContain('a***');
      expect(text).not.toMatch(/52998224725|529\.982\.247-25|ana\.souza@exemplo\.com/);
    });

    it('só procura no evento selecionado', async () => {
      const { e, v } = await setup();
      const other = await event('Outro evento');
      await buyer(other, { name: 'Ana Souza Outra', cpf: '11144477735', email: 'outra@exemplo.com' });
      expect((await hits(await v.search(e.id, 'Ana'))).map(h => h.holderName)).toEqual(['Ana Souza']);
      expect(await hits(await v.search(e.id, '111.444.777-35'))).toEqual([]);
    });

    it('no máximo 20 resultados', async () => {
      const e = await event();
      const b = await buyer(e, { name: 'Maria Silva', items: [['Pista', 6]] });
      for (let i = 0; i < 3; i++) await buyer(e, { name: `Maria Silva ${i}`, items: [['Pista', 6]] });
      expect(b.tickets).toHaveLength(6);
      const v = await session();
      expect((await hits(await v.search(e.id, 'maria'))).length).toBe(20);
    });

    it('a trilha guarda só o tipo de busca e quantos voltaram, nunca o CPF digitado', async () => {
      const { e, v } = await setup();
      await v.search(e.id, '529.982.247-25');
      await v.search(e.id, 'Ana Souza');
      const out = vi.spyOn(process.stdout, 'write');
      try {
        await v.search(e.id, '390.533.447-05');
        const logged = out.mock.calls.map(c => String(c[0])).join('');
        expect(logged).not.toMatch(/39053344705|390\.533/);
      } finally {
        out.mockRestore();
      }
      const audit = (
        await sql("select actor_id, after_json from audit_log where action = 'portaria.busca' order by created_at, id")
      ).rows;
      expect(audit).toHaveLength(3);
      const seen = audit.map(a => `${a.after_json.tipo}:${a.after_json.resultados}`).sort(); // mesmo instante (relógio fixo): a ordem não é garantida
      expect(seen).toEqual(['cpf:1', 'cpf:2', 'nome:1']);
      expect(JSON.stringify(audit)).not.toMatch(/52998224725|39053344705|Souza/);
      expect(audit[0].actor_id).toBe(v.id);
    });

    it('limite de buscas por minuto por pessoa (contra varredura)', async () => {
      const { e, v } = await setup();
      let blocked = 0;
      for (let i = 0; i < 45; i++) if ((await v.search(e.id, 'Ana Souza')).status === 429) blocked++;
      expect(blocked).toBeGreaterThanOrEqual(5);
      clock.advance(61_000);
      expect((await v.search(e.id, 'Ana Souza')).status).toBe(200);
    });

    it('classificação das consultas (função pura)', () => {
      expect(classifyQuery('529.982.247-25')).toEqual({ kind: 'cpf', value: '52998224725' });
      expect(classifyQuery('px-ab12')).toEqual({ kind: 'codigo', value: 'PX-AB12' });
      expect(classifyQuery('A@B.COM')).toEqual({ kind: 'email', value: 'a@b.com' });
      expect(classifyQuery('José  da   Silva')).toEqual({ kind: 'nome', value: 'jose da silva' });
      expect(classifyQuery('12345')).toBeNull();
      expect(foldName('Conceição ÁÉÍÓÚ Ñ')).toBe('conceicao aeiou n');
    });
  });

  describe('entrada manual (RF-52, RF-51)', () => {
    it('marca a entrada como manual, com validador e horário, e depois o QR do mesmo ingresso já aparece como utilizado', async () => {
      const e = await event();
      const b = await buyer(e);
      const v = await session('validador', 'Carlos Portaria');
      const res = await json(await v.admit(e.id, b.tickets[0]!.id));
      expect(res).toMatchObject({ result: 'valido', method: 'manual', counter: { entered: 1 } });
      expect((await checkinsOf(b.tickets[0]!.id)).map(c => [c.result, c.method])).toEqual([['valido', 'manual']]);
      const again = await json(await v.scan(e.id, b.tickets[0]!.qr_payload));
      expect(again).toMatchObject({ result: 'ja_utilizado', firstEntry: { validatorName: 'Carlos Portaria' } });
    });

    it('ingresso cancelado ou de outro evento não entra pela busca; ingresso inexistente 404', async () => {
      const a = await event('A');
      const other = await event('B');
      const bA = await buyer(a);
      const bB = await buyer(other);
      await sql("update tickets set status = 'cancelado', cancelled_at = now() where id = $1", [bA.tickets[0]!.id]);
      const v = await session();
      expect((await json(await v.admit(a.id, bA.tickets[0]!.id))).result).toBe('cancelado');
      expect((await json(await v.admit(a.id, bB.tickets[0]!.id))).result).toBe('outro_evento');
      expect((await v.admit(a.id, crypto.randomUUID())).status).toBe(404);
      expect((await sql("select count(*)::int as n from tickets where status = 'utilizado'")).rows[0].n).toBe(0);
    });
  });

  describe('limites', () => {
    it('leitura em rajada tem teto por pessoa; passado o minuto, volta', async () => {
      const e = await event();
      const v = await session();
      let blocked = 0;
      for (let i = 0; i < 310; i++) if ((await v.scan(e.id, 'PX1.1.x')).status === 429) blocked++;
      expect(blocked).toBeGreaterThanOrEqual(5);
      clock.advance(61_000);
      expect((await v.scan(e.id, 'PX1.1.x')).status).toBe(200);
    }, 30_000);
  });
});
