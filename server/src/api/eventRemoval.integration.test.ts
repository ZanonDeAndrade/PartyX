import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { deleteEvent } from '../events/service';
import { createMockGateway } from '../payments/mockGateway';
import { MemoryBannerStorage } from '../providers/bannerStorage';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Excluir e arquivar evento (pedido de 15/10/2026). Exclui de vez só o evento sem pedido (em qualquer situação), ingresso, leitura de
 * portaria e aceite de termo de menor, com tipos e imagens; com qualquer um deles, recusa e o evento pode ser arquivado (fora do site,
 * sem venda nova, com histórico, relatórios e exportações). Só administrador. A conferência é dentro da transação da exclusão: a
 * corrida com um pedido entrando nunca deixa pedido sem evento.
 */
describe.skipIf(!ADMIN_URL)('excluir e arquivar evento (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  let storage: MemoryBannerStorage;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const hash = { value: '' };
  let n = 0;

  async function session(role: 'administrador' | 'validador' | 'cliente' = 'administrador') {
    const i = ++n;
    const email = `${role}${i}@partyx.test`;
    const { rows } = await sql(
      `insert into users (name, email, cpf, password_hash, role) values ($1,$2,$3,$4,$5) returning id`,
      [`Pessoa ${i} Teste`, email, role === 'cliente' ? String(10000000000 + i) : null, hash.value, role],
    );
    let cookie = '';
    let csrf = '';
    const raw = async (method: string, path: string, init: { json?: unknown; form?: FormData } = {}) => {
      const headers: Record<string, string> = { origin: 'http://localhost', 'x-forwarded-for': '203.0.113.7' };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      let body: string | FormData | undefined;
      if (init.json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(init.json);
      } else if (init.form) body = init.form;
      return app.request(`/api${path}`, { method, headers, body });
    };
    const login = await raw('POST', '/auth/login', { json: { email, password: PASSWORD } });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    return {
      id: rows[0].id as string,
      email,
      get: (p: string) => raw('GET', p),
      post: (p: string, json: unknown = {}) => raw('POST', p, { json }),
      put: (p: string, form: FormData) => raw('PUT', p, { form }),
    };
  }
  type Session = Awaited<ReturnType<typeof session>>;
  const json = async <T = any>(res: Response) => (await res.json()) as T;
  const code = async (res: Response) => (await json(res)).erro.codigo as string;

  /** Evento publicado pelo painel, com um tipo à venda e, se pedido, banner (três larguras e a imagem de pré-visualização). */
  async function publishedEvent(a: Session, o: { banner?: boolean; name?: string } = {}) {
    const name = o.name ?? `Festa de Teste ${++n}`;
    const created = await a.post('/admin/events', {
      name,
      startsAt: '2026-12-12T22:00:00-03:00',
      venue: 'Arena Central',
      address: 'Av. Brasil, 1000',
      description: 'Evento de teste, dados fictícios.',
      ageRating: '18 anos',
    });
    expect(created.status).toBe(201);
    const { id, slug } = (await json(created)).event as { id: string; slug: string };
    const type = await a.post(`/admin/events/${id}/ticket-types`, {
      name: 'Pista',
      priceCents: 8000,
      quantityTotal: 100,
      salesStartAt: '2026-10-01T00:00:00-03:00',
      salesEndAt: '2026-12-12T20:00:00-03:00',
    });
    expect(type.status).toBe(201);
    const typeId = (await json(type)).ticketType.id as string;
    if (o.banner) {
      const img = await sharp({ create: { width: 1700, height: 900, channels: 3, background: '#7c3aed' } })
        .jpeg()
        .toBuffer();
      const form = new FormData();
      form.set('file', new File([new Uint8Array(img)], 'banner.jpg', { type: 'image/jpeg' }));
      expect((await a.put(`/admin/events/${id}/banner`, form)).status).toBe(200);
    }
    expect((await a.post(`/admin/events/${id}/publish`)).status).toBe(200);
    return { id, slug, name, typeId };
  }
  const imagesOf = (eventId: string) => [...storage.objects.keys()].filter(k => k.startsWith(`events/${eventId}/`));
  const exists = async (eventId: string) => (await sql('select 1 from events where id = $1', [eventId])).rowCount === 1;
  const buy = (b: Session, e: { slug: string; typeId: string }) =>
    b.post('/orders', { eventSlug: e.slug, items: [{ ticketTypeId: e.typeId, quantity: 1 }] });

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    hash.value = await argon2Hasher.hash(PASSWORD);
    storage = new MemoryBannerStorage();
    app = createApp({
      config: loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none', RESERVATION_MINUTES: '10' }),
      clock,
      auth: {
        db: createDrizzle(testDb.pool),
        hasher: argon2Hasher,
        mailer: new MemoryEmailSender(),
        banners: storage,
        gateway: createMockGateway(clock),
      },
    });
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql(
      'truncate checkins, minor_term_acceptances, payment_events, email_log, tickets, reservations, order_items, orders, ticket_types, events, sessions, login_attempts, audit_log, users cascade',
    );
    clock.set('2026-10-10T15:00:00Z');
    storage.objects.clear();
  });

  it('evento sem pedidos: exclui com o nome digitado, e somem tipos, imagens e a página pública; a trilha guarda quem, id e nome', async () => {
    const a = await session();
    const other = await publishedEvent(a, { banner: true });
    const e = await publishedEvent(a, { banner: true });
    expect(imagesOf(e.id).length).toBeGreaterThanOrEqual(4); // banner, duas versões menores e a imagem de pré-visualização

    const check = await json(await a.get(`/admin/events/${e.id}/removal`));
    expect(check).toEqual({
      deletable: true,
      usage: { orders: 0, tickets: 0, checkins: 0, minorAcceptances: 0 },
      ticketTypes: 1,
      hasBanner: true,
      archived: false,
    });

    // Confirmação forte: sem o nome exato, nada sai.
    const wrong = await a.post(`/admin/events/${e.id}/delete`, { confirmName: 'Festa de Teste' });
    expect(wrong.status).toBe(422);
    expect(await exists(e.id)).toBe(true);

    clock.set('2026-10-10T15:05:00Z');
    const res = await a.post(`/admin/events/${e.id}/delete`, { confirmName: `  ${e.name} ` });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.deleted).toEqual({ id: e.id, name: e.name, ticketTypes: 1 });
    expect(body.imagesRemoved).toBeGreaterThanOrEqual(4);
    expect(body.imagesPending).toBe(false);

    expect(await exists(e.id)).toBe(false);
    expect((await sql('select count(*)::int as n from ticket_types where event_id = $1', [e.id])).rows[0].n).toBe(0);
    expect(imagesOf(e.id)).toEqual([]);
    expect(imagesOf(other.id).length).toBeGreaterThanOrEqual(4); // a pasta do outro evento não é tocada
    expect((await a.get(`/admin/events/${e.id}`)).status).toBe(404);
    expect((await app.request(`/api/public/events/${e.slug}`)).status).toBe(404);

    const { rows } = await sql("select actor_id, entity_id, before_json, after_json, created_at from audit_log where action = 'evento.excluir'");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_id: a.id, entity_id: e.id, after_json: null });
    expect(rows[0].before_json).toMatchObject({ id: e.id, name: e.name, slug: e.slug });
    expect(new Date(rows[0].created_at).toISOString()).toBe('2026-10-10T15:05:00.000Z');
    // Repetir não acha mais o evento.
    expect((await a.post(`/admin/events/${e.id}/delete`, { confirmName: e.name })).status).toBe(404);
  });

  it('evento com pedido (mesmo só expirado) recusa a exclusão e pode ser arquivado; arquivado some do site e para de vender, com histórico', async () => {
    const a = await session();
    const b = await session('cliente');
    const e = await publishedEvent(a, { banner: true });
    const ordered = await buy(b, e);
    expect(ordered.status).toBe(201);
    const orderId = (await json(ordered)).order.id as string;
    await sql("update orders set status = 'expirado' where id = $1", [orderId]);
    await sql("update reservations set status = 'expirada', released_at = now() where order_id = $1", [orderId]);

    const check = await json(await a.get(`/admin/events/${e.id}/removal`));
    expect(check).toMatchObject({ deletable: false, usage: { orders: 1, tickets: 0, checkins: 0, minorAcceptances: 0 } });
    const refused = await a.post(`/admin/events/${e.id}/delete`, { confirmName: e.name });
    expect(refused.status).toBe(409);
    expect((await json(refused)).erro).toMatchObject({ codigo: 'evento_com_registros', detalhes: { orders: 1 } });
    expect(await exists(e.id)).toBe(true);
    expect(imagesOf(e.id).length).toBeGreaterThanOrEqual(4); // nada sai do armazenamento

    // Um pedido pendente, criado antes de arquivar, ainda sem forma de pagamento escolhida.
    const c = await session('cliente');
    const pending = (await json(await buy(c, e))).order.id as string;

    const archived = await a.post(`/admin/events/${e.id}/archive`);
    expect(archived.status).toBe(200);
    expect((await json(archived)).event.archivedAt).toBe('2026-10-10T15:00:00.000Z');

    // Fora da vitrine, da busca, do link público e do PDF em branco.
    const home = await json(await app.request('/api/public/home'));
    expect(JSON.stringify(home)).not.toContain(e.slug);
    const found = await json(await app.request(`/api/public/events?q=${encodeURIComponent(e.name)}`));
    expect(found.events).toEqual([]);
    const page = await app.request(`/api/public/events/${e.slug}`);
    expect(page.status).toBe(404);
    const blank = await app.request(`/api/public/events/${e.slug}/autorizacao-menor.pdf`);
    expect(blank.status).toBe(404);
    expect(await code(blank)).toBe('nao_encontrado');

    // Sem venda nova: nem pedido novo, nem cobrança nova para o pendente.
    const d = await session('cliente');
    const again = await buy(d, e);
    expect(again.status).toBe(409);
    expect(await code(again)).toBe('evento_indisponivel');
    const pay = await c.post(`/orders/${pending}/payment`, { method: 'pix' });
    expect(pay.status).toBe(409);
    expect(await code(pay)).toBe('evento_indisponivel');

    // Histórico: o painel continua listando (com a data), e os relatórios e exportações do evento continuam respondendo.
    const list = (await json(await a.get('/admin/events'))).events as { id: string; archivedAt: string | null }[];
    expect(list.find(x => x.id === e.id)?.archivedAt).toBe('2026-10-10T15:00:00.000Z');
    expect((await a.get(`/admin/events/${e.id}`)).status).toBe(200);
    expect((await a.get(`/admin/events/${e.id}/preview`)).status).toBe(200);
    expect((await a.get(`/admin/events/${e.id}/buyers?page=1`)).status).toBe(200);
    expect((await a.get(`/admin/exports/events/${e.id}/tickets.csv`)).status).toBe(200);
    expect((await a.get('/admin/reports/sales')).status).toBe(200);
    expect((await sql('select count(*)::int as n from orders where event_id = $1', [e.id])).rows[0].n).toBe(2);

    // Ainda não pode ser excluído, e repetir o arquivamento não grava nada novo.
    expect((await json(await a.get(`/admin/events/${e.id}/removal`))).archived).toBe(true);
    expect((await a.post(`/admin/events/${e.id}/archive`)).status).toBe(200);

    // Desarquivar devolve ao site e à venda.
    const back = await a.post(`/admin/events/${e.id}/unarchive`);
    expect(back.status).toBe(200);
    expect((await json(back)).event.archivedAt).toBeNull();
    expect((await app.request(`/api/public/events/${e.slug}`)).status).toBe(200);
    expect((await buy(d, e)).status).toBe(201);

    const trail = await sql(
      "select action, actor_id, entity_id, before_json, after_json from audit_log where action in ('evento.arquivar','evento.desarquivar') order by created_at, action",
    );
    expect(trail.rows.map(r => r.action)).toEqual(['evento.arquivar', 'evento.desarquivar']);
    for (const r of trail.rows) expect(r).toMatchObject({ actor_id: a.id, entity_id: e.id, after_json: { id: e.id, name: e.name } });
    // Sem dados de compradores na trilha.
    const text = JSON.stringify(trail.rows);
    for (const s of [b, c, d]) expect(text).not.toContain(s.email);
  });

  it('leitura de portaria sem pedido também impede a exclusão', async () => {
    const a = await session();
    const v = await session('validador');
    const e = await publishedEvent(a);
    await sql(
      "insert into checkins (event_id, validator_id, result, method, code_presented) values ($1, $2, 'invalido', 'manual', 'XYZ')",
      [e.id, v.id],
    );
    expect(await json(await a.get(`/admin/events/${e.id}/removal`))).toMatchObject({
      deletable: false,
      usage: { orders: 0, checkins: 1 },
    });
    const res = await a.post(`/admin/events/${e.id}/delete`, { confirmName: e.name });
    expect(res.status).toBe(409);
    expect(await exists(e.id)).toBe(true);
  });

  it('o banco recusa apagar evento com uso mesmo por fora do serviço (gatilho e chaves estrangeiras)', async () => {
    const a = await session();
    const b = await session('cliente');
    const e = await publishedEvent(a);
    expect((await buy(b, e)).status).toBe(201);
    await expect(sql('delete from ticket_types where event_id = $1', [e.id])).rejects.toMatchObject({ code: '23001' });
    await expect(sql('delete from events where id = $1', [e.id])).rejects.toMatchObject({ code: '23001' });
    expect(await exists(e.id)).toBe(true);
  });

  it('só o administrador: validador e cliente não consultam, não excluem, não arquivam e não desarquivam', async () => {
    const a = await session();
    const e = await publishedEvent(a);
    for (const role of ['validador', 'cliente'] as const) {
      const s = await session(role);
      expect((await s.get(`/admin/events/${e.id}/removal`)).status).toBe(403);
      expect((await s.post(`/admin/events/${e.id}/delete`, { confirmName: e.name })).status).toBe(403);
      expect((await s.post(`/admin/events/${e.id}/archive`)).status).toBe(403);
      expect((await s.post(`/admin/events/${e.id}/unarchive`)).status).toBe(403);
    }
    // Sem sessão: 401.
    expect((await app.request(`/api/admin/events/${e.id}/removal`)).status).toBe(401);
    expect(await exists(e.id)).toBe(true);
    expect((await sql('select archived_at from events where id = $1', [e.id])).rows[0].archived_at).toBeNull();
  });

  describe('corrida com pedido entrando durante a exclusão', () => {
    it('pedido em andamento segura a exclusão até terminar, e a exclusão é recusada', async () => {
      const a = await session();
      const b = await session('cliente');
      const e = await publishedEvent(a);
      // Outra conexão faz o que o checkout faz: trava o tipo e grava o pedido, sem confirmar ainda.
      const other = await testDb.pool.connect();
      try {
        await other.query('begin');
        await other.query('select id from ticket_types where id = $1 for update', [e.typeId]);
        await other.query('insert into orders (user_id, event_id, total_cents) values ($1, $2, 8000)', [b.id, e.id]);
        let settled = false;
        const removal = deleteEvent({ db: createDrizzle(testDb.pool), clock }, { id: a.id }, e.id, e.name).finally(() => {
          settled = true;
        });
        removal.catch(() => {}); // a rejeição é conferida abaixo
        await sleep(300);
        expect(settled).toBe(false); // esperando a trava do pedido
        await other.query('commit');
        await expect(removal).rejects.toMatchObject({ status: 409, code: 'evento_com_registros' });
      } finally {
        other.release();
      }
      expect(await exists(e.id)).toBe(true);
      expect((await sql('select count(*)::int as n from orders where event_id = $1', [e.id])).rows[0].n).toBe(1);
    });

    it('exclusão em andamento faz o pedido falhar como "evento indisponível", sem deixar pedido nem reserva', async () => {
      const a = await session();
      const b = await session('cliente');
      const e = await publishedEvent(a);
      // Outra conexão faz o que a exclusão faz: trava tipos e evento, apaga, e só então confirma.
      const other = await testDb.pool.connect();
      try {
        await other.query('begin');
        await other.query('select id from ticket_types where event_id = $1 order by id for update', [e.id]);
        await other.query('select id from events where id = $1 for update', [e.id]);
        const order = buy(b, e);
        await sleep(300);
        await other.query('delete from ticket_types where event_id = $1', [e.id]);
        await other.query('delete from events where id = $1', [e.id]);
        await other.query('commit');
        const res = await order;
        expect(res.status).toBe(409);
        expect(await code(res)).toBe('evento_indisponivel');
      } finally {
        other.release();
      }
      expect((await sql('select count(*)::int as n from orders')).rows[0].n).toBe(0);
      expect((await sql('select count(*)::int as n from reservations')).rows[0].n).toBe(0);
    });

    it('rajada: exclusão e compra ao mesmo tempo, 12 vezes; sempre só uma das duas vence, sem impasse nem pedido órfão', async () => {
      const a = await session();
      const deps = { db: createDrizzle(testDb.pool), clock };
      let deleted = 0;
      let bought = 0;
      for (let round = 0; round < 12; round++) {
        const b = await session('cliente');
        const e = await publishedEvent(a);
        const [removal, order] = await Promise.allSettled([
          deleteEvent(deps, { id: a.id }, e.id, e.name),
          buy(b, e),
        ]);
        const orderStatus = order.status === 'fulfilled' ? order.value.status : 0;
        if (removal.status === 'fulfilled') {
          deleted++;
          expect(orderStatus).toBe(409);
          expect(await exists(e.id)).toBe(false);
        } else {
          bought++;
          expect(removal.reason).toMatchObject({ status: 409, code: 'evento_com_registros' });
          expect(orderStatus).toBe(201);
          expect(await exists(e.id)).toBe(true);
        }
      }
      expect(deleted + bought).toBe(12);
      // Nenhum pedido aponta para evento que não existe (a chave estrangeira garante; conferido assim mesmo).
      const orphans = await sql('select count(*)::int as n from orders o where not exists (select 1 from events e where e.id = o.event_id)');
      expect(orphans.rows[0].n).toBe(0);
    }, 60_000);
  });
});
