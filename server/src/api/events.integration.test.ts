import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryBannerStorage } from '../providers/bannerStorage';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';

describe.skipIf(!ADMIN_URL)('eventos, tipos e promoters (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  let storage: MemoryBannerStorage;
  const clock = createFakeClock('2026-10-01T12:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  let n = 0;

  const makeApp = (withStorage: boolean) =>
    createApp({
      config: loadConfig({ APP_ENV: 'local' }),
      clock,
      auth: {
        db: createDrizzle(testDb.pool),
        hasher: argon2Hasher,
        mailer: new MemoryEmailSender(),
        banners: withStorage ? storage : undefined,
      },
    });

  /** Navegador simulado com sessão e CSRF. */
  async function session(role: 'administrador' | 'validador' | 'cliente' = 'administrador') {
    const i = ++n;
    const email = `${role}${i}@exemplo.com`;
    await sql(`insert into users (name, email, cpf, password_hash, role) values ($1,$2,$3,$4,$5)`, [
      `Pessoa ${i} Teste`,
      email,
      role === 'cliente' ? String(10000000000 + i) : null,
      await argon2Hasher.hash(PASSWORD),
      role,
    ]);
    let cookie = '';
    let csrf = '';
    const raw = async (method: string, path: string, init: { json?: unknown; form?: FormData } = {}, target = app) => {
      const headers: Record<string, string> = { origin: 'http://localhost', 'x-forwarded-for': '203.0.113.7' };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      let body: string | FormData | undefined;
      if (init.json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(init.json);
      } else if (init.form) body = init.form;
      return target.request(`/api${path}`, { method, headers, body });
    };
    const login = await raw('POST', '/auth/login', { json: { email, password: PASSWORD } });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    return {
      raw,
      get: (p: string) => raw('GET', p),
      post: (p: string, json: unknown = {}) => raw('POST', p, { json }),
      patch: (p: string, json: unknown) => raw('PATCH', p, { json }),
      put: (p: string, form: FormData) => raw('PUT', p, { form }),
      del: (p: string) => raw('DELETE', p),
    };
  }
  type Session = Awaited<ReturnType<typeof session>>;

  const json = async <T = any>(res: Response) => (await res.json()) as T;
  const errorCode = async (res: Response) => (await json(res)).erro.codigo as string;
  const fieldsOf = async (res: Response) => ((await json(res)).erro.detalhes as { campo: string }[]).map(d => d.campo);

  const eventBody = (o: Record<string, unknown> = {}) => ({
    name: 'Festa Neon 2026',
    startsAt: '2026-12-12T22:00:00-03:00',
    venue: 'Arena Central',
    address: 'Av. Brasil, 1000, Santa Maria - RS',
    description: 'Evento de teste, dados fictícios.',
    attractions: ['DJ Exemplo', 'Banda Fictícia'],
    ageRating: '18 anos',
    ...o,
  });
  const typeBody = (o: Record<string, unknown> = {}) => ({
    name: 'Pista',
    priceCents: 8000,
    quantityTotal: 100,
    salesStartAt: '2026-10-01T00:00:00-03:00',
    salesEndAt: '2026-12-12T20:00:00-03:00',
    ...o,
  });

  async function newEvent(a: Session, o: Record<string, unknown> = {}) {
    const res = await a.post('/admin/events', eventBody(o));
    expect(res.status).toBe(201);
    return (await json(res)).event as { id: string; slug: string; status: string };
  }
  async function newType(a: Session, eventId: string, o: Record<string, unknown> = {}) {
    const res = await a.post(`/admin/events/${eventId}/ticket-types`, typeBody(o));
    expect(res.status).toBe(201);
    return (await json(res)).ticketType as { id: string };
  }
  async function image(width = 1200, height = 700, format: 'jpeg' | 'png' = 'jpeg') {
    return sharp({ create: { width, height, channels: 3, background: '#ff3366' } })
      .toFormat(format)
      .toBuffer();
  }
  const upload = (file: Buffer | string, name = 'banner.jpg', type = 'image/jpeg') => {
    const form = new FormData();
    if (file !== '') form.set('file', new File([new Uint8Array(Buffer.from(file))], name, { type }));
    return form;
  };

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    storage = new MemoryBannerStorage();
    app = makeApp(true);
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql(
      'truncate reservations, order_items, orders, ticket_types, events, promoters, sessions, login_attempts, audit_log, users cascade',
    );
    clock.set('2026-10-01T12:00:00Z');
    storage.objects.clear();
  });

  describe('eventos (RF-11, RF-12, RF-19)', () => {
    it('cria em rascunho com todos os campos, gera o endereço e registra a auditoria', async () => {
      const a = await session();
      const event = await newEvent(a);
      expect(event).toMatchObject({ slug: 'festa-neon-2026', status: 'rascunho' });
      const got = await json(await a.get(`/admin/events/${event.id}`));
      expect(got.event).toMatchObject({
        name: 'Festa Neon 2026',
        venue: 'Arena Central',
        ageRating: '18 anos',
        attractions: ['DJ Exemplo', 'Banda Fictícia'],
        isFeatured: false,
        startsAt: '2026-12-13T01:00:00.000Z',
      });
      const audit = await sql('select action, actor_id from audit_log where entity_id = $1', [event.id]);
      expect(audit.rows.map(r => r.action)).toEqual(['evento.criar']);
      expect(audit.rows[0].actor_id).not.toBeNull();
    });

    it('nome repetido ganha sufixo no endereço; endereço escolhido repetido é recusado', async () => {
      const a = await session();
      const e1 = await newEvent(a);
      const e2 = await newEvent(a);
      expect([e1.slug, e2.slug]).toEqual(['festa-neon-2026', 'festa-neon-2026-2']);
      const dup = await a.post('/admin/events', eventBody({ slug: 'festa-neon-2026' }));
      expect(dup.status).toBe(422);
      expect(await fieldsOf(dup)).toEqual(['slug']);
      expect((await a.post('/admin/events', eventBody({ slug: 'Com Espaço' }))).status).toBe(422);
    });

    it('duas criações simultâneas com o mesmo nome geram endereços diferentes', async () => {
      const a = await session();
      const res = await Promise.all(Array.from({ length: 6 }, () => a.post('/admin/events', eventBody())));
      expect(res.map(r => r.status)).toEqual(Array(6).fill(201));
      const slugs = (await Promise.all(res.map(r => json(r)))).map(r => r.event.slug);
      expect(new Set(slugs).size).toBe(6);
    });

    it('valida campos obrigatórios, classificação, data e tamanho', async () => {
      const a = await session();
      const bad = await a.post('/admin/events', { name: '  ', startsAt: 'ontem', ageRating: '99' });
      expect(bad.status).toBe(422);
      const noVenue = await a.post('/admin/events', eventBody({ venue: '  ', address: '' }));
      expect((await fieldsOf(noVenue)).sort()).toEqual(['address', 'venue']);
      expect((await a.post('/admin/events', eventBody({ ageRating: '21 anos' }))).status).toBe(422);
      expect((await a.post('/admin/events', eventBody({ name: 'x'.repeat(121) }))).status).toBe(422);
      expect((await a.post('/admin/events', eventBody({ startsAt: '2026-12-12 22:00' }))).status).toBe(422); // sem fuso
      expect((await sql('select count(*)::int as n from events')).rows[0].n).toBe(0);
    });

    it('edita campos parciais e guarda antes e depois; o endereço (slug) não muda', async () => {
      const a = await session();
      const e = await newEvent(a);
      const res = await a.patch(`/admin/events/${e.id}`, {
        name: 'Festa Neon Remix',
        isFeatured: true,
        attractions: [],
      });
      expect(res.status).toBe(200);
      const { event } = await json(res);
      expect(event).toMatchObject({
        name: 'Festa Neon Remix',
        slug: 'festa-neon-2026',
        isFeatured: true,
        attractions: [],
      });
      const audit = await sql("select before_json, after_json from audit_log where action = 'evento.editar'");
      expect(audit.rows[0].before_json.name).toBe('Festa Neon 2026');
      expect(audit.rows[0].after_json.name).toBe('Festa Neon Remix');
      expect((await a.patch(`/admin/events/${e.id}`, { ageRating: 'XX' })).status).toBe(422);
      expect((await a.patch(`/admin/events/${crypto.randomUUID()}`, { name: 'Outro Nome' })).status).toBe(404);
    });

    it('publicar exige data futura e ao menos um tipo ativo (CA-07)', async () => {
      const a = await session();
      const e = await newEvent(a);
      const noType = await a.post(`/admin/events/${e.id}/publish`);
      expect(noType.status).toBe(422);
      expect(await fieldsOf(noType)).toEqual(['ticketTypes']);

      const t = await newType(a, e.id, { isActive: false });
      expect((await a.post(`/admin/events/${e.id}/publish`)).status).toBe(422); // só há tipo inativo

      await a.patch(`/admin/ticket-types/${t.id}`, { isActive: true });
      // Data já passada: ajustada direto no banco (o relógio não pode andar sem derrubar a sessão de 30 min da equipe).
      await sql("update events set starts_at = '2026-09-01T00:00:00Z' where id = $1", [e.id]);
      expect(await fieldsOf(await a.post(`/admin/events/${e.id}/publish`))).toEqual(['startsAt']);
      await sql("update events set starts_at = '2026-12-13T01:00:00Z' where id = $1", [e.id]);

      const ok = await a.post(`/admin/events/${e.id}/publish`);
      expect(ok.status).toBe(200);
      expect((await json(ok)).event.status).toBe('publicado');
      expect((await a.post(`/admin/events/${e.id}/publish`)).status).toBe(409);
    });

    it('publicações simultâneas resultam em uma só mudança de estado', async () => {
      const a = await session();
      const e = await newEvent(a);
      await newType(a, e.id);
      const res = await Promise.all(Array.from({ length: 5 }, () => a.post(`/admin/events/${e.id}/publish`)));
      expect(res.map(r => r.status).sort()).toEqual([200, 409, 409, 409, 409]);
      expect((await sql("select count(*)::int as n from audit_log where action = 'evento.publicar'")).rows[0].n).toBe(
        1,
      );
    });

    it('encerrar: só publicado, tira o destaque e congela o evento (CA-11)', async () => {
      const a = await session();
      const e = await newEvent(a, { isFeatured: true });
      await newType(a, e.id);
      expect((await a.post(`/admin/events/${e.id}/close`)).status).toBe(409); // rascunho não encerra
      await a.post(`/admin/events/${e.id}/publish`);
      const closed = await a.post(`/admin/events/${e.id}/close`);
      expect(closed.status).toBe(200);
      expect((await json(closed)).event).toMatchObject({ status: 'encerrado', isFeatured: false });

      expect((await a.post(`/admin/events/${e.id}/close`)).status).toBe(409);
      expect((await a.post(`/admin/events/${e.id}/publish`)).status).toBe(409); // sem reabrir
      expect(await errorCode(await a.patch(`/admin/events/${e.id}`, { name: 'Novo Nome' }))).toBe('evento_encerrado');
      expect(await errorCode(await a.post(`/admin/events/${e.id}/ticket-types`, typeBody({ name: 'VIP' })))).toBe(
        'evento_encerrado',
      );
      expect(await errorCode(await a.put(`/admin/events/${e.id}/banner`, upload(await image())))).toBe(
        'evento_encerrado',
      );
      // Nada se perde: o evento continua consultável.
      expect((await a.get(`/admin/events/${e.id}`)).status).toBe(200);
    });

    it('lista todos os eventos, inclusive rascunho e encerrado, do mais próximo ao mais antigo', async () => {
      const a = await session();
      await newEvent(a, { name: 'Primeiro Evento', startsAt: '2026-11-01T22:00:00-03:00' });
      await newEvent(a, { name: 'Segundo Evento', startsAt: '2026-12-01T22:00:00-03:00' });
      const { events } = await json(await a.get('/admin/events'));
      expect(events.map((e: { name: string }) => e.name)).toEqual(['Segundo Evento', 'Primeiro Evento']);
    });
  });

  describe('tipos de ingresso (RF-14, RF-15, RF-16)', () => {
    it('cria com preço em centavos, quantidade e período', async () => {
      const a = await session();
      const e = await newEvent(a);
      const res = await a.post(
        `/admin/events/${e.id}/ticket-types`,
        typeBody({ name: 'VIP', priceCents: 15050, quantityTotal: 30 }),
      );
      expect(res.status).toBe(201);
      expect((await json(res)).ticketType).toMatchObject({
        name: 'VIP',
        priceCents: 15050,
        quantityTotal: 30,
        quantitySold: 0,
        isActive: true,
        available: 30,
        salesState: 'a_venda',
      });
    });

    it('recusa preço zero, negativo, decimal e acima do limite; quantidade inválida', async () => {
      const a = await session();
      const e = await newEvent(a);
      const post = (o: Record<string, unknown>) => a.post(`/admin/events/${e.id}/ticket-types`, typeBody(o));
      for (const priceCents of [0, -100, 80.5, 10_000_001]) {
        expect((await post({ priceCents })).status, String(priceCents)).toBe(422);
      }
      for (const quantityTotal of [0, -1, 2.5, 100_001]) {
        expect((await post({ quantityTotal })).status, String(quantityTotal)).toBe(422);
      }
      expect((await post({ priceCents: '80' })).status).toBe(422);
      expect((await sql('select count(*)::int as n from ticket_types')).rows[0].n).toBe(0);
    });

    it('o fim das vendas precisa ser depois do início, na criação e na edição', async () => {
      const a = await session();
      const e = await newEvent(a);
      const same = typeBody({ salesEndAt: '2026-10-01T00:00:00-03:00' });
      expect(await fieldsOf(await a.post(`/admin/events/${e.id}/ticket-types`, same))).toEqual(['salesEndAt']);
      const t = await newType(a, e.id);
      expect((await a.patch(`/admin/ticket-types/${t.id}`, { salesEndAt: '2026-09-01T00:00:00-03:00' })).status).toBe(
        422,
      );
      expect((await a.patch(`/admin/ticket-types/${t.id}`, { salesEndAt: '2026-12-01T00:00:00-03:00' })).status).toBe(
        200,
      );
    });

    it('nome repetido no mesmo evento é recusado; em outro evento é permitido', async () => {
      const a = await session();
      const e1 = await newEvent(a);
      const e2 = await newEvent(a);
      await newType(a, e1.id, { name: 'Pista' });
      expect((await a.post(`/admin/events/${e1.id}/ticket-types`, typeBody({ name: 'Pista' }))).status).toBe(422);
      expect((await a.post(`/admin/events/${e2.id}/ticket-types`, typeBody({ name: 'Pista' }))).status).toBe(201);
    });

    it('mostra "em breve", "à venda" e "encerrada" conforme o período (CA-08)', async () => {
      const a = await session();
      const e = await newEvent(a);
      await newType(a, e.id, {
        name: 'Lote 1',
        salesStartAt: '2026-09-01T00:00:00-03:00',
        salesEndAt: '2026-09-30T00:00:00-03:00',
      });
      await newType(a, e.id, {
        name: 'Lote 2',
        salesStartAt: '2026-10-01T00:00:00-03:00',
        salesEndAt: '2026-10-31T00:00:00-03:00',
      });
      await newType(a, e.id, {
        name: 'Lote 3',
        salesStartAt: '2026-11-01T00:00:00-03:00',
        salesEndAt: '2026-11-30T00:00:00-03:00',
      });
      const { ticketTypes } = await json(await a.get(`/admin/events/${e.id}`));
      const state = Object.fromEntries(
        ticketTypes.map((t: { name: string; salesState: string }) => [t.name, t.salesState]),
      );
      expect(state).toEqual({ 'Lote 1': 'encerrada', 'Lote 2': 'a_venda', 'Lote 3': 'em_breve' });
    });

    it('ativa e desativa a qualquer momento, mesmo com vendas (RF-16)', async () => {
      const a = await session();
      const e = await newEvent(a);
      const t = await newType(a, e.id);
      await sql('update ticket_types set quantity_sold = 10 where id = $1', [t.id]);
      const off = await a.patch(`/admin/ticket-types/${t.id}`, { isActive: false });
      expect((await json(off)).ticketType).toMatchObject({
        isActive: false,
        salesState: 'indisponivel',
        quantitySold: 10,
      });
      const on = await a.patch(`/admin/ticket-types/${t.id}`, { isActive: true });
      expect((await json(on)).ticketType.salesState).toBe('a_venda');
    });

    it('mostra esgotado quando a última unidade é vendida (CA-09)', async () => {
      const a = await session();
      const e = await newEvent(a);
      const t = await newType(a, e.id, { quantityTotal: 5 });
      await sql('update ticket_types set quantity_sold = 5 where id = $1', [t.id]);
      const { ticketTypes } = await json(await a.get(`/admin/events/${e.id}`));
      expect(ticketTypes[0]).toMatchObject({ salesState: 'esgotado', available: 0 });
    });

    it('aceita mudar preço e período depois de haver vendas, e registra a mudança', async () => {
      const a = await session();
      const e = await newEvent(a);
      const t = await newType(a, e.id);
      await sql('update ticket_types set quantity_sold = 10 where id = $1', [t.id]);
      expect((await a.patch(`/admin/ticket-types/${t.id}`, { priceCents: 9000 })).status).toBe(200);
      const audit = await sql("select before_json, after_json from audit_log where action = 'ingresso_tipo.editar'");
      expect([audit.rows[0].before_json.priceCents, audit.rows[0].after_json.priceCents]).toEqual([8000, 9000]);
    });
  });

  describe('capacidade (RF-17)', () => {
    /** Cria pedido, item e reserva direto no banco, como a reserva do Prompt 09 fará. */
    async function reserve(eventId: string, typeId: string, quantity: number, expiresAt: string, status = 'ativa') {
      const user = (await sql('select id from users limit 1')).rows[0].id;
      const order = (
        await sql(`insert into orders (user_id, event_id, total_cents) values ($1,$2,$3) returning id`, [
          user,
          eventId,
          quantity * 8000,
        ])
      ).rows[0].id;
      await sql(
        `insert into order_items (order_id, event_id, ticket_type_id, quantity, unit_price_cents) values ($1,$2,$3,$4,8000)`,
        [order, eventId, typeId, quantity],
      );
      await sql(
        `insert into reservations (order_id, ticket_type_id, quantity, expires_at, status) values ($1,$2,$3,$4,$5)`,
        [order, typeId, quantity, expiresAt, status],
      );
    }

    it('não deixa a capacidade ficar abaixo de vendidos mais reservas válidas', async () => {
      const a = await session();
      const e = await newEvent(a);
      const t = await newType(a, e.id, { quantityTotal: 100 });
      await sql('update ticket_types set quantity_sold = 10 where id = $1', [t.id]);
      await reserve(e.id, t.id, 5, '2026-10-01T12:10:00Z');

      const low = await a.patch(`/admin/ticket-types/${t.id}`, { quantityTotal: 14 });
      expect(low.status).toBe(409);
      const err = (await json(low)).erro;
      expect(err.codigo).toBe('capacidade_abaixo_do_comprometido');
      expect(err.detalhes).toEqual({ vendidos: 10, reservados: 5, minimo: 15 });
      expect((await sql('select quantity_total from ticket_types where id = $1', [t.id])).rows[0].quantity_total).toBe(
        100,
      );

      const exact = await a.patch(`/admin/ticket-types/${t.id}`, { quantityTotal: 15 });
      expect(exact.status).toBe(200);
      expect((await json(exact)).ticketType).toMatchObject({ quantityTotal: 15, available: 0, quantityReserved: 5 });
    });

    it('reserva vencida, liberada ou convertida não conta como comprometida', async () => {
      const a = await session();
      const e = await newEvent(a);
      const t = await newType(a, e.id, { quantityTotal: 100 });
      await sql('update ticket_types set quantity_sold = 10 where id = $1', [t.id]);
      await reserve(e.id, t.id, 20, '2026-10-01T11:00:00Z'); // venceu antes de "agora"
      const { ticketType } = await json(await a.patch(`/admin/ticket-types/${t.id}`, { quantityTotal: 10 }));
      expect(ticketType).toMatchObject({ quantityTotal: 10, quantityReserved: 0 });
    });

    it('aumentar a capacidade sempre é permitido', async () => {
      const a = await session();
      const e = await newEvent(a);
      const t = await newType(a, e.id, { quantityTotal: 10 });
      expect((await a.patch(`/admin/ticket-types/${t.id}`, { quantityTotal: 5000 })).status).toBe(200);
    });

    it('a edição espera a reserva em curso e a conta já a inclui (trava da linha do tipo)', async () => {
      const a = await session();
      const e = await newEvent(a);
      const t = await newType(a, e.id, { quantityTotal: 50 });
      const user = (await sql('select id from users limit 1')).rows[0].id;
      const client = await testDb.pool.connect();
      try {
        // Reserva "em andamento": trancou a linha do tipo e ainda não confirmou, como fará o Prompt 09.
        await client.query('begin');
        await client.query('select id from ticket_types where id = $1 for update', [t.id]);
        let settled = false;
        const edit = a.patch(`/admin/ticket-types/${t.id}`, { quantityTotal: 10 }).then(r => {
          settled = true;
          return r;
        });
        await new Promise(r => setTimeout(r, 400));
        expect(settled).toBe(false); // a edição está esperando a trava

        const order = (
          await client.query('insert into orders (user_id, event_id, total_cents) values ($1,$2,160000) returning id', [
            user,
            e.id,
          ])
        ).rows[0].id;
        await client.query(
          'insert into order_items (order_id, event_id, ticket_type_id, quantity, unit_price_cents) values ($1,$2,$3,20,8000)',
          [order, e.id, t.id],
        );
        await client.query(
          "insert into reservations (order_id, ticket_type_id, quantity, expires_at) values ($1,$2,20,'2026-10-01T12:10:00Z')",
          [order, t.id],
        );
        await client.query('commit');

        const res = await edit;
        expect(res.status).toBe(409); // enxergou as 20 reservadas e recusou reduzir para 10
        expect((await json(res)).erro.detalhes).toMatchObject({ reservados: 20, minimo: 20 });
      } finally {
        client.release();
      }
    });

    it('edição concorrente com reserva: o total nunca fica abaixo do comprometido', async () => {
      const a = await session();
      const e = await newEvent(a);
      const t = await newType(a, e.id, { quantityTotal: 50 });
      await sql('update ticket_types set quantity_sold = 20 where id = $1', [t.id]);
      // Várias reduções ao mesmo tempo: nenhuma pode passar de 20 vendidos.
      const res = await Promise.all(
        [10, 15, 19, 20, 25, 30].map(q => a.patch(`/admin/ticket-types/${t.id}`, { quantityTotal: q })),
      );
      expect(res.map(r => r.status).sort()).toContain(200);
      const row = (await sql('select quantity_total, quantity_sold from ticket_types where id = $1', [t.id])).rows[0];
      expect(row.quantity_total).toBeGreaterThanOrEqual(row.quantity_sold);
    });
  });

  describe('promoters (RF-18, CA-10)', () => {
    it('cria com código em maiúsculas, sem desconto nem comissão', async () => {
      const a = await session();
      const res = await a.post('/admin/promoters', {
        name: 'João Promoter',
        couponCode: 'joao10',
        phone: '(55) 99812-4470',
      });
      expect(res.status).toBe(201);
      const { promoter } = await json(res);
      expect(promoter).toMatchObject({ couponCode: 'JOAO10', isActive: true, phone: '55998124470' });
      expect(Object.keys(promoter).sort()).toEqual(['couponCode', 'createdAt', 'id', 'isActive', 'name', 'phone']);
    });

    it('dois promoters não podem ter o mesmo código, nem variando maiúsculas (CA-10)', async () => {
      const a = await session();
      await a.post('/admin/promoters', { name: 'João Promoter', couponCode: 'JOAO10' });
      const dup = await a.post('/admin/promoters', { name: 'Maria Promoter', couponCode: 'joao10' });
      expect(dup.status).toBe(422);
      expect(await fieldsOf(dup)).toEqual(['couponCode']);
      expect((await sql('select count(*)::int as n from promoters')).rows[0].n).toBe(1);
    });

    it('criações simultâneas do mesmo código resultam em um só promoter', async () => {
      const a = await session();
      const res = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          a.post('/admin/promoters', { name: `Promoter ${i}`, couponCode: 'FESTA26' }),
        ),
      );
      expect(res.map(r => r.status).sort()).toEqual([201, 422, 422, 422, 422, 422]);
    });

    it('recusa código inválido: curto, longo, acento, espaço, símbolo', async () => {
      const a = await session();
      for (const couponCode of ['AB', 'A'.repeat(21), 'JOÃO10', 'JOAO 10', 'JOAO-10', '']) {
        expect((await a.post('/admin/promoters', { name: 'Fulano', couponCode })).status, couponCode).toBe(422);
      }
      expect((await a.post('/admin/promoters', { name: '', couponCode: 'VALIDO1' })).status).toBe(422);
      expect((await a.post('/admin/promoters', { name: 'Fulano', couponCode: 'VALIDO1', phone: '123' })).status).toBe(
        422,
      );
    });

    it('edita, desativa e reativa; trocar para código de outro é recusado; manter o próprio é aceito', async () => {
      const a = await session();
      const p1 = (await json(await a.post('/admin/promoters', { name: 'João Promoter', couponCode: 'JOAO10' })))
        .promoter;
      await a.post('/admin/promoters', { name: 'Maria Promoter', couponCode: 'MARIA10' });
      expect((await a.patch(`/admin/promoters/${p1.id}`, { couponCode: 'MARIA10' })).status).toBe(422);
      expect((await a.patch(`/admin/promoters/${p1.id}`, { couponCode: 'JOAO10', name: 'João Silva' })).status).toBe(
        200,
      );
      const off = await a.patch(`/admin/promoters/${p1.id}`, { isActive: false });
      expect((await json(off)).promoter.isActive).toBe(false);
      expect((await a.patch(`/admin/promoters/${p1.id}`, { isActive: true })).status).toBe(200);
      const actions = await sql("select action from audit_log where entity = 'promoter' order by created_at, id");
      expect(actions.rows.map(r => r.action)).toContain('promoter.desativar');
      expect((await a.patch(`/admin/promoters/${crypto.randomUUID()}`, { name: 'Fulano Teste' })).status).toBe(404);
    });

    it('a lista traz todos, inclusive desativados', async () => {
      const a = await session();
      await a.post('/admin/promoters', { name: 'Ana Promoter', couponCode: 'ANA10', isActive: false });
      await a.post('/admin/promoters', { name: 'Bia Promoter', couponCode: 'BIA10' });
      const { promoters } = await json(await a.get('/admin/promoters'));
      expect(promoters.map((p: { couponCode: string }) => p.couponCode)).toEqual(['ANA10', 'BIA10']);
    });
  });

  describe('banner (RF-13)', () => {
    it('valida, redimensiona, grava no armazenamento com nome gerado e guarda a URL', async () => {
      const a = await session();
      const e = await newEvent(a);
      const res = await a.put(`/admin/events/${e.id}/banner`, upload(await image(3000, 1500)));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.banner).toMatchObject({ width: 1600, height: 800 });
      // Banner, pré-visualização e as versões menores (640 e 1080 px) para o celular.
      expect(storage.objects.size).toBe(4);
      const [name, obj] = [...storage.objects].find(([k]) => /\/[0-9a-f]{32}\.webp$/.test(k))!;
      expect(name).toMatch(new RegExp(`^events/${e.id}/[0-9a-f]{32}\\.webp$`));
      expect(obj.contentType).toBe('image/webp');
      expect(body.event.bannerUrl).toBe(`https://banners.exemplo.test/${name}`);
      expect((await sharp(obj.data).metadata()).format).toBe('webp');
      for (const w of [640, 1080]) {
        const variant = storage.objects.get(name.replace(/\.webp$/, `-w${w}.webp`))!;
        expect(variant.contentType).toBe('image/webp');
        expect((await sharp(variant.data).metadata()).width).toBe(w);
      }
      expect(body.event.bannerWidths).toEqual([640, 1080, 1600]);
    });

    it('imagem menor que 1080 px não é ampliada: só a versão de 640 px', async () => {
      const a = await session();
      const e = await newEvent(a);
      const body = await json(await a.put(`/admin/events/${e.id}/banner`, upload(await image(900, 500))));
      expect(body.event.bannerWidths).toEqual([640, 900]);
      expect([...storage.objects.keys()].filter(k => /-w\d+\.webp$/.test(k))).toHaveLength(1);
      const removed = await json(await a.del(`/admin/events/${e.id}/banner`));
      expect(removed.event).toMatchObject({ bannerUrl: null, bannerWidths: [] });
    });

    it('o nome do arquivo e o tipo enviados pelo navegador não entram no caminho gravado', async () => {
      const a = await session();
      const e = await newEvent(a);
      const res = await a.put(
        `/admin/events/${e.id}/banner`,
        upload(await image(), '../../../etc/passwd.png', 'text/html'),
      );
      expect(res.status).toBe(200);
      for (const name of storage.objects.keys())
        expect(name).toMatch(/^events\/[0-9a-f-]{36}\/[0-9a-f]{32}(\.webp|-og\.jpg|-w\d+\.webp)$/);
    });

    it('repetir o mesmo arquivo não cria objeto novo; arquivo diferente cria e a URL muda', async () => {
      const a = await session();
      const e = await newEvent(a);
      const first = await json(await a.put(`/admin/events/${e.id}/banner`, upload(await image(1200, 700))));
      const again = await json(await a.put(`/admin/events/${e.id}/banner`, upload(await image(1200, 700))));
      expect(again.event.bannerUrl).toBe(first.event.bannerUrl);
      expect(storage.objects.size).toBe(4); // banner, pré-visualização, 640 e 1080 px
      const other = await json(
        await a.put(`/admin/events/${e.id}/banner`, upload(await image(1300, 700, 'png'), 'b.png', 'image/png')),
      );
      expect(other.event.bannerUrl).not.toBe(first.event.bannerUrl);
      expect(storage.objects.size).toBe(8);
    });

    it('recusa arquivo que não é imagem aceita, mesmo com tipo e extensão de imagem', async () => {
      const a = await session();
      const e = await newEvent(a);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><script>alert(1)</script></svg>';
      expect(await errorCode(await a.put(`/admin/events/${e.id}/banner`, upload(svg, 'x.png', 'image/png')))).toBe(
        'formato_invalido',
      );
      expect(
        await errorCode(await a.put(`/admin/events/${e.id}/banner`, upload('texto qualquer', 'x.jpg', 'image/jpeg'))),
      ).toBe('imagem_invalida');
      expect(await errorCode(await a.put(`/admin/events/${e.id}/banner`, upload(await image(400, 200))))).toBe(
        'imagem_pequena',
      );
      expect(await errorCode(await a.put(`/admin/events/${e.id}/banner`, upload('')))).toBe('arquivo_ausente');
      expect(storage.objects.size).toBe(0);
      expect((await sql('select banner_url from events where id = $1', [e.id])).rows[0].banner_url).toBeNull();
    });

    it('recusa acima de 5 MB com 413', async () => {
      const a = await session();
      const e = await newEvent(a);
      const res = await a.put(`/admin/events/${e.id}/banner`, upload(Buffer.alloc(5 * 1024 * 1024 + 10, 7)));
      expect(res.status).toBe(413);
      expect(await errorCode(res)).toBe('arquivo_grande');
      const huge = await a.put(`/admin/events/${e.id}/banner`, upload(Buffer.alloc(7 * 1024 * 1024, 7)));
      expect(huge.status).toBe(413);
      expect(storage.objects.size).toBe(0);
    });

    it('sem armazenamento configurado responde 503 e não grava nada', async () => {
      const a = await session();
      const e = await newEvent(a);
      const noStorage = makeApp(false);
      const res = await a.raw('PUT', `/admin/events/${e.id}/banner`, { form: upload(await image()) }, noStorage);
      expect(res.status).toBe(503);
      expect(await errorCode(res)).toBe('armazenamento_indisponivel');
    });

    it('evento inexistente: 404 sem processar a imagem; corpo não multipart: 4xx', async () => {
      const a = await session();
      expect((await a.put(`/admin/events/${crypto.randomUUID()}/banner`, upload(await image()))).status).toBe(404);
      const e = await newEvent(a);
      const notForm = await a.raw('PUT', `/admin/events/${e.id}/banner`, { json: { file: 'x' } });
      expect(notForm.status).toBeGreaterThanOrEqual(400);
      expect(notForm.status).toBeLessThan(500);
    });

    it('remover o banner limpa a URL e registra; validador e cliente não enviam banner', async () => {
      const a = await session();
      const e = await newEvent(a);
      await a.put(`/admin/events/${e.id}/banner`, upload(await image()));
      const del = await a.del(`/admin/events/${e.id}/banner`);
      expect((await json(del)).event.bannerUrl).toBeNull();
      const actions = await sql('select action from audit_log where entity_id = $1 order by created_at, id', [e.id]);
      expect(actions.rows.map(r => r.action).sort()).toEqual([
        'evento.banner',
        'evento.banner_remover',
        'evento.criar',
      ]);

      for (const role of ['validador', 'cliente'] as const) {
        const other = await session(role);
        const res = await other.put(`/admin/events/${e.id}/banner`, upload(await image()));
        expect(res.status, role).toBe(403);
      }
      // Só os 4 arquivos do envio do administrador (banner, pré-visualização, 640 e 1080 px): os perfis recusados não gravam nada.
      expect(storage.objects.size).toBe(4);
    });
  });

  describe('permissões', () => {
    it('validador e cliente não conseguem criar, editar, publicar nem cadastrar promoter', async () => {
      const admin = await session();
      const e = await newEvent(admin);
      const t = await newType(admin, e.id);
      for (const role of ['validador', 'cliente'] as const) {
        const s = await session(role);
        const calls = [
          s.post('/admin/events', eventBody()),
          s.patch(`/admin/events/${e.id}`, { name: 'Invadido Aqui' }),
          s.post(`/admin/events/${e.id}/publish`),
          s.post(`/admin/events/${e.id}/close`),
          s.post(`/admin/events/${e.id}/ticket-types`, typeBody({ name: 'X' })),
          s.patch(`/admin/ticket-types/${t.id}`, { priceCents: 1 }),
          s.post('/admin/promoters', { name: 'Fulano', couponCode: 'HACK1' }),
          s.get('/admin/events'),
          s.get('/admin/promoters'),
        ];
        expect(
          (await Promise.all(calls)).map(r => r.status),
          role,
        ).toEqual(Array(calls.length).fill(403));
      }
      expect((await sql('select name from events')).rows[0].name).toBe('Festa Neon 2026');
    });

    it('regras do formulário e pré-visualização também são só do administrador', async () => {
      const admin = await session();
      const e = await newEvent(admin);
      for (const role of ['validador', 'cliente'] as const) {
        const s = await session(role);
        expect((await s.get('/admin/events/meta')).status, role).toBe(403);
        expect((await s.get(`/admin/events/${e.id}/preview`)).status, role).toBe(403);
        expect((await s.del(`/admin/events/${e.id}/banner`)).status, role).toBe(403);
      }
      expect((await app.request('/api/admin/events/meta')).status).toBe(401);
    });
  });

  describe('painel de eventos (ADM02 a ADM06): fluxo completo e apoio à interface', () => {
    const pub = async (path: string) => app.request(`/api/public${path}`);
    const publicSlugs = async () => {
      const list = (await json(await pub('/events'))).events as { slug: string }[];
      const home = await json(await pub('/home'));
      return {
        list: list.map(x => x.slug),
        home: [...home.featured, ...home.upcoming].map((x: { slug: string }) => x.slug),
      };
    };

    it('criar rascunho, 3 tipos com períodos diferentes, publicar, aparecer na vitrine, encerrar e sumir da listagem', async () => {
      const admin = await session();
      // 1) Rascunho: não existe para o público, nem pela busca nem pelo link.
      const e = await newEvent(admin, { name: 'Baile do Fechamento', isFeatured: true });
      expect(e.status).toBe('rascunho');
      expect((await publicSlugs()).list).not.toContain(e.slug);
      expect((await pub(`/events/${e.slug}`)).status).toBe(404);
      // Publicar sem tipo é recusado, com o campo que falta.
      const early = await admin.post(`/admin/events/${e.id}/publish`);
      expect(early.status).toBe(422);
      expect(await fieldsOf(early)).toEqual(['ticketTypes']);

      // 2) Três tipos com períodos diferentes (agora: 01/10/2026 12h UTC).
      await newType(admin, e.id, {
        name: '1º lote',
        priceCents: 6000,
        quantityTotal: 50,
        salesStartAt: '2026-09-20T00:00:00-03:00',
        salesEndAt: '2026-09-30T23:59:00-03:00',
      });
      await newType(admin, e.id, {
        name: '2º lote',
        priceCents: 8000,
        quantityTotal: 100,
        salesStartAt: '2026-10-01T00:00:00-03:00',
        salesEndAt: '2026-12-12T20:00:00-03:00',
      });
      await newType(admin, e.id, {
        name: 'Camarote',
        priceCents: 25000,
        quantityTotal: 20,
        salesStartAt: '2026-11-01T10:00:00-03:00',
        salesEndAt: '2026-12-12T20:00:00-03:00',
      });
      const detail = await json(await admin.get(`/admin/events/${e.id}`));
      expect(detail.ticketTypes.map((t: { name: string; salesState: string }) => [t.name, t.salesState])).toEqual([
        ['1º lote', 'encerrada'],
        ['2º lote', 'a_venda'],
        ['Camarote', 'em_breve'],
      ]);
      // Vendidos e reservados vêm separados, e disponíveis = capacidade - vendidos - reservados.
      expect(detail.ticketTypes[1]).toMatchObject({
        quantityTotal: 100,
        quantitySold: 0,
        quantityReserved: 0,
        available: 100,
      });

      // Pré-visualização do rascunho: mesma página pública, nada à venda, e o público continua sem acesso.
      const preview = (await json(await admin.get(`/admin/events/${e.id}/preview`))).event;
      expect(preview).toMatchObject({ slug: e.slug, name: 'Baile do Fechamento', status: 'rascunho' });
      expect(preview.ticketTypes).toHaveLength(3);
      expect(preview.ticketTypes.every((t: { canBuy: boolean }) => t.canBuy === false)).toBe(true);
      expect((await pub(`/events/${e.slug}`)).status).toBe(404);

      // 3) Publicar: aparece na listagem, na página inicial (destaque) e no link, com os três tipos e seus estados.
      expect((await admin.post(`/admin/events/${e.id}/publish`)).status).toBe(200);
      const after = await publicSlugs();
      expect(after.list).toContain(e.slug);
      expect(after.home).toContain(e.slug);
      const page = (await json(await pub(`/events/${e.slug}`))).event;
      expect(
        page.ticketTypes.map((t: { name: string; state: string; canBuy: boolean }) => [t.name, t.state, t.canBuy]),
      ).toEqual([
        ['1º lote', 'encerrada', false],
        ['2º lote', 'a_venda', true],
        ['Camarote', 'em_breve', false],
      ]);

      // 4) Encerrar: some da listagem e da página inicial; o link continua, como encerrado; nada é cancelado.
      const closing = await admin.post(`/admin/events/${e.id}/close`);
      expect(closing.status).toBe(200);
      expect((await json(closing)).event.closedAt).toBe(clock.now().toISOString()); // usado pela portaria (D-79)
      const closed = await publicSlugs();
      expect(closed.list).not.toContain(e.slug);
      expect(closed.home).not.toContain(e.slug);
      const ended = (await json(await pub(`/events/${e.slug}`))).event;
      expect(ended.sale.kind).toBe('ended');
      expect(ended.ticketTypes.every((t: { canBuy: boolean }) => !t.canBuy)).toBe(true);
      // No painel continua listado, como encerrado, e não aceita mais edição nem tipo novo.
      const adminList = (await json(await admin.get('/admin/events'))).events as { id: string; status: string }[];
      expect(adminList.find(x => x.id === e.id)?.status).toBe('encerrado');
      expect((await admin.patch(`/admin/events/${e.id}`, { name: 'Outro Nome' })).status).toBe(409);
      expect((await admin.post(`/admin/events/${e.id}/ticket-types`, typeBody({ name: 'Extra' }))).status).toBe(409);

      // Trilha: criação, três tipos, publicação e encerramento, todos com o administrador.
      const trail = (
        await sql(
          `select action, actor_id is not null as by_admin from audit_log where action like 'evento.%' or action like 'ingresso_tipo.%' order by created_at, action`,
        )
      ).rows;
      expect(trail.map(r => r.action).sort()).toEqual(
        [
          'evento.criar',
          'evento.encerrar',
          'evento.publicar',
          'ingresso_tipo.criar',
          'ingresso_tipo.criar',
          'ingresso_tipo.criar',
        ].sort(),
      );
      expect(trail.every(r => r.by_admin)).toBe(true);
    });

    it('regras para o formulário vêm do servidor: banner, classificações, limites, reserva e limite por compra', async () => {
      const admin = await session();
      const meta = await json(await admin.get('/admin/events/meta'));
      expect(meta.banner).toMatchObject({
        maxBytes: 5 * 1024 * 1024,
        minWidth: 600,
        formats: ['image/jpeg', 'image/png', 'image/webp'],
        available: true,
      });
      expect(meta.ageRatings).toContain('18 anos');
      expect(meta.limits).toMatchObject({ priceMaxCents: 10_000_000, quantityMax: 100_000, typeNameMax: 60 });
      expect(meta.reservationMinutes).toBe(10);
      expect(meta.gateWindow).toEqual({ beforeHours: 12, afterHours: 24 });
      expect(meta.maxTicketsPerOrder).toBe(6);
      // Sem armazenamento configurado, a tela sabe que o banner está indisponível.
      const noStorage = makeApp(false);
      const res = await admin.raw('GET', '/admin/events/meta', {}, noStorage);
      expect((await json(res)).banner.available).toBe(false);
    });

    it('pré-visualização de evento inexistente ou id inválido: 404', async () => {
      const admin = await session();
      expect((await admin.get('/admin/events/00000000-0000-4000-8000-000000000000/preview')).status).toBe(404);
      expect((await admin.get('/admin/events/nao-e-id/preview')).status).toBe(404);
    });

    it('ativar e desativar um tipo ficam na trilha com ação própria; editar continua "editar"', async () => {
      const admin = await session();
      const e = await newEvent(admin);
      const t = await newType(admin, e.id);
      for (const change of [{ isActive: false }, { isActive: true }, { priceCents: 9000 }]) {
        clock.advance(1000);
        expect((await admin.patch(`/admin/ticket-types/${t.id}`, change)).status).toBe(200);
      }
      const actions = (
        await sql(`select action from audit_log where entity = 'ticket_type' order by created_at, action`)
      ).rows.map(r => r.action);
      expect(actions.slice(1)).toEqual(['ingresso_tipo.desativar', 'ingresso_tipo.ativar', 'ingresso_tipo.editar']);
    });

    it('capacidade abaixo de vendidos + reservas: 409 com os números para a tela explicar', async () => {
      const admin = await session();
      const e = await newEvent(admin);
      const t = await newType(admin, e.id, { quantityTotal: 10 });
      await sql(`update ticket_types set quantity_sold = 4 where id = $1`, [t.id]);
      const res = await admin.patch(`/admin/ticket-types/${t.id}`, { quantityTotal: 3 });
      expect(res.status).toBe(409);
      const body = await json(res);
      expect(body.erro.codigo).toBe('capacidade_abaixo_do_comprometido');
      expect(body.erro.mensagem).toMatch(/não pode ser menor que 4: 4 vendidos e 0 reservados/);
      expect(body.erro.detalhes).toEqual({ vendidos: 4, reservados: 0, minimo: 4 });
    });

    it('"Encerrar vendas agora": checkout recusa, vitrine mostra vendas encerradas, portaria segue aberta, trilha registra', async () => {
      const admin = await session();
      const e = await newEvent(admin, { name: 'Festa Hoje' });
      const open = await newType(admin, e.id, { name: 'Pista' }); // à venda agora
      await newType(admin, e.id, {
        name: 'Camarote',
        salesStartAt: '2026-11-01T10:00:00-03:00',
        salesEndAt: '2026-12-12T20:00:00-03:00',
      }); // em breve
      const off = await newType(admin, e.id, { name: 'Antigo' });
      await admin.patch(`/admin/ticket-types/${off.id}`, { isActive: false });
      expect((await admin.post(`/admin/events/${e.id}/publish`)).status).toBe(200);

      // Uma compradora já reservou antes do encerramento das vendas.
      const early = await session('cliente');
      const reserved = await early.post('/orders', {
        eventSlug: e.slug,
        items: [{ ticketTypeId: open.id, quantity: 1 }],
      });
      expect(reserved.status).toBe(201);

      clock.advance(60_000);
      const res = await admin.post(`/admin/events/${e.id}/stop-sales`);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.typesClosed).toBe(2); // Pista e Camarote; o inativo fica como está
      expect(body.event.status).toBe('publicado'); // sem estado novo

      const types = (await json(await admin.get(`/admin/events/${e.id}`))).ticketTypes as {
        name: string;
        salesState: string;
        salesStartAt: string;
        salesEndAt: string;
      }[];
      const now = clock.now().toISOString();
      const byName = Object.fromEntries(types.map(t => [t.name, t]));
      expect(byName.Pista).toMatchObject({ salesState: 'encerrada', salesEndAt: now });
      expect(byName.Camarote).toMatchObject({ salesState: 'encerrada', salesEndAt: now });
      expect(new Date(byName.Camarote!.salesStartAt) < new Date(now)).toBe(true); // fim depois do início, sempre
      expect(byName.Antigo).toMatchObject({ salesState: 'indisponivel', salesEndAt: '2026-12-12T23:00:00.000Z' });

      // Checkout recusa qualquer compra nova, com o motivo por tipo.
      const late = await session('cliente');
      const refused = await late.post('/orders', {
        eventSlug: e.slug,
        items: [{ ticketTypeId: open.id, quantity: 1 }],
      });
      expect(refused.status).toBe(409);
      const err = (await json(refused)).erro;
      expect(err.codigo).toBe('estoque_alterado');
      expect(err.detalhes.itens[0]).toMatchObject({
        motivo: 'encerrada',
        mensagem: 'As vendas deste ingresso foram encerradas.',
      });

      // Vitrine: a página continua no ar, com vendas encerradas e nada à venda.
      const page = (await json(await pub(`/events/${e.slug}`))).event;
      expect(page.sale).toMatchObject({ kind: 'closed', label: 'Vendas encerradas' });
      expect(page.ticketTypes.every((t: { canBuy: boolean }) => !t.canBuy)).toBe(true);
      expect(page.ticketTypes.find((t: { name: string }) => t.name === 'Pista').state).toBe('encerrada');

      // Portaria segue aberta (o evento continua publicado).
      const v = await session('validador');
      const gate = (await json(await v.get('/gate/events'))).events as { id: string; salesClosed: boolean }[];
      expect(gate.find(g => g.id === e.id)).toMatchObject({ salesClosed: false });

      // Trilha: uma linha, com antes e depois de cada tipo alterado e o administrador.
      const trail = (
        await sql(
          "select actor_id, before_json, after_json, reason from audit_log where action = 'evento.encerrar_vendas' and entity_id = $1",
          [e.id],
        )
      ).rows;
      expect(trail).toHaveLength(1);
      expect(trail[0].actor_id).toBeTruthy();
      expect(trail[0].after_json.tipos.map((t: { nome: string; fim: string }) => [t.nome, t.fim]).sort()).toEqual([
        ['Camarote', now],
        ['Pista', now],
      ]);
      expect(trail[0].before_json.tipos.find((t: { nome: string }) => t.nome === 'Pista').fim).toBe(
        '2026-12-12T23:00:00.000Z',
      );

      // Repetir não muda nada nem duplica a trilha; reabrir é editar o período de um tipo.
      expect((await json(await admin.post(`/admin/events/${e.id}/stop-sales`))).typesClosed).toBe(0);
      expect(
        (await sql("select count(*)::int as n from audit_log where action = 'evento.encerrar_vendas'")).rows[0].n,
      ).toBe(1);
      await admin.patch(`/admin/ticket-types/${open.id}`, { salesEndAt: '2026-12-12T20:00:00-03:00' });
      const again = await late.post('/orders', { eventSlug: e.slug, items: [{ ticketTypeId: open.id, quantity: 1 }] });
      expect(again.status).toBe(201);
    });

    it('"Encerrar vendas agora" só vale para evento publicado e só para o administrador', async () => {
      const admin = await session();
      const draft = await newEvent(admin);
      const r = await admin.post(`/admin/events/${draft.id}/stop-sales`);
      expect([r.status, (await json(r)).erro.codigo]).toEqual([409, 'estado_invalido']);
      for (const role of ['validador', 'cliente'] as const) {
        const s = await session(role);
        expect((await s.post(`/admin/events/${draft.id}/stop-sales`)).status, role).toBe(403);
      }
      expect((await admin.post('/admin/events/00000000-0000-4000-8000-000000000000/stop-sales')).status).toBe(404);
    });

    it('preço zero continua recusado (sem cortesia nem ingresso gratuito)', async () => {
      const admin = await session();
      const e = await newEvent(admin);
      const res = await admin.post(`/admin/events/${e.id}/ticket-types`, typeBody({ priceCents: 0 }));
      expect(res.status).toBe(422);
      expect(await fieldsOf(res)).toEqual(['priceCents']);
    });
  });
});
