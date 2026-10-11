import { randomBytes } from 'node:crypto';
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

describe.skipIf(!ADMIN_URL)('segurança e LGPD (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-12-12T15:00:00Z'); // 12:00 em Brasília
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const config = loadConfig({
    APP_ENV: 'homologacao',
    DATABASE_URL: 'postgres://nao-usada',
    SESSION_SECRET: 's'.repeat(40),
    QR_HMAC_KEYS: `1:${randomBytes(32).toString('base64url')}`,
    PUBLIC_BASE_URL: 'http://localhost',
    RETENTION_LOGIN_ATTEMPTS_DAYS: '30',
    RETENTION_SESSIONS_DAYS: '7',
  });
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
    const raw = (method: string, path: string, body?: unknown, extra: Record<string, string> = {}) => {
      const headers: Record<string, string> = {
        origin: 'http://localhost',
        'x-forwarded-for': '203.0.113.7',
        ...extra,
      };
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
      get cookie() {
        return cookie;
      },
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

  describe('cabeçalhos, cookies e CSRF', () => {
    it('CSP restritiva, HSTS, sem enquadramento, câmera só do próprio site', async () => {
      const res = await app.request('/api/health');
      const csp = res.headers.get('content-security-policy')!;
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain('upgrade-insecure-requests');
      expect(res.headers.get('strict-transport-security')).toMatch(/max-age=31536000/);
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('permissions-policy')).toMatch(/camera=\(self\)/);
      expect(res.headers.get('permissions-policy')).toMatch(/microphone=\(\)/);
    });

    it('cookie de sessão: HttpOnly, Secure, SameSite=Lax; o token não aparece no corpo', async () => {
      await sql(
        "insert into users (name,email,cpf,password_hash,role) values ('A','a-ck@exemplo.com','52998224725',$1,'cliente')",
        [hash],
      );
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a-ck@exemplo.com', password: PASSWORD }),
      });
      expect(res.status).toBe(200);
      const cookie = res.headers.get('set-cookie')!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      const token = cookie.split(';')[0]!.split('=')[1]!;
      expect(JSON.stringify(await res.json())).not.toContain(token);
      expect((await sql('select token_hash from sessions')).rows[0].token_hash).not.toBe(token); // só o hash no banco
    });

    it('CSRF: sem token ou com origem de outro site, a mudança é recusada e nada muda', async () => {
      const u = await session('cliente');
      const noToken = await app.request('/api/me', {
        method: 'PATCH',
        headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: u.cookie },
        body: JSON.stringify({ name: 'Invasor', phone: '55999990000' }),
      });
      expect(noToken.status).toBe(403);
      const badOrigin = await u.raw(
        'PATCH',
        '/me',
        { name: 'Invasor', phone: '55999990000' },
        { origin: 'https://evil.example' },
      );
      expect(badOrigin.status).toBe(403);
      expect((await sql('select name from users where id = $1', [u.id])).rows[0].name).not.toBe('Invasor');
    });

    it('corpo JSON acima de 1 MB é recusado (413) antes de ser processado', async () => {
      const big = JSON.stringify({ email: 'x@exemplo.com', password: 'a'.repeat(1_100_000) });
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: big,
      });
      expect(res.status).toBe(413);
    });
  });

  describe('abuso e permissões', () => {
    it('cadastro ignora campo de perfil: ninguém vira administrador pelo corpo da requisição', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Intruso',
          email: 'intruso@exemplo.com',
          cpf: '39053344705',
          phone: '55998124470',
          password: 'festa2026',
          acceptedTermsVersion: config.legal.terms,
          acceptedPrivacyVersion: config.legal.privacy,
          accept: true,
          role: 'administrador',
          isActive: true,
        }),
      });
      expect([201, 422]).toContain(res.status);
      const r = await sql("select role from users where email = 'intruso@exemplo.com'");
      if (r.rows.length) expect(r.rows[0].role).toBe('cliente');
    });

    it('um comprador nunca enxerga pedido, ingresso, PDF ou pagamento de outro (IDOR)', async () => {
      const e = await event();
      const o = await order(e, { buyer: { name: 'Dona do pedido' } });
      const owner = await sql('select email from users where id = $1', [o.userId]);
      expect(owner.rows).toHaveLength(1);
      const other = await session('cliente');
      const t = o.tickets[0]!.id;
      for (const p of [
        `/orders/${o.id}`,
        `/orders/${o.id}/payment`,
        `/orders/${o.id}/tickets`,
        `/orders/${o.id}/tickets/pdf`,
        `/tickets/${t}`,
        `/tickets/${t}/pdf`,
      ]) {
        const res = await other.get(p);
        expect([p, [403, 404].includes(res.status)]).toEqual([p, true]);
        expect(await res.text()).not.toContain('Dona do pedido');
      }
      expect(((await json(await other.get('/orders'))).orders ?? []).length).toBe(0);
      expect(((await json(await other.get('/tickets'))).tickets ?? []).length).toBe(0);
      expect((await other.post(`/orders/${o.id}/cancel`)).status).not.toBe(200);
      expect((await sql('select status from orders where id = $1', [o.id])).rows[0].status).toBe('pago');
    });

    it('entradas com cara de SQL e de HTML não quebram nada nem vazam: busca, filtros e cadastro', async () => {
      const e = await event();
      await order(e, { buyer: { name: '<img src=x onerror=alert(1)>' } });
      const adm = await session();
      for (const q of [
        "' OR 1=1 --",
        "'; drop table users; --",
        '%',
        '_',
        '\\',
        '<script>alert(1)</script>',
        'a'.repeat(300),
      ]) {
        for (const p of [
          `/admin/orders?q=${encodeURIComponent(q)}`,
          `/public/events?q=${encodeURIComponent(q)}`,
          `/admin/events/${e.id}/tickets?q=${encodeURIComponent(q)}`,
        ]) {
          const res = await adm.get(p);
          expect([p, q.slice(0, 12), res.status < 500]).toEqual([p, q.slice(0, 12), true]);
        }
      }
      expect((await sql('select count(*)::int as n from users')).rows[0].n).toBeGreaterThan(0);
      const list = await adm.get('/admin/orders?pageSize=10');
      expect(list.headers.get('content-type')).toMatch(/application\/json/);
      expect(list.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('recuperação de senha: verificar e redefinir token têm limite por IP', async () => {
      let last = 0;
      for (let i = 0; i < 70; i++) {
        const res = await app.request('/api/auth/password/check', {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.9',
          },
          body: JSON.stringify({ token: 'token-que-nao-existe-' + i }),
        });
        last = res.status;
        if (last === 429) break;
      }
      expect(last).toBe(429);
    });

    it('rotinas internas e webhook não aceitam chamada sem autenticação', async () => {
      for (const p of ['/api/internal/jobs/reconcile-payments', '/api/internal/jobs/purge-retention']) {
        const res = await app.request(p, { method: 'POST', headers: { origin: 'http://localhost' } });
        expect([p, [401, 503].includes(res.status)]).toEqual([p, true]);
      }
      const hook = await app.request('/api/webhooks/payments', { method: 'POST', body: '{}' });
      expect([401, 503]).toContain(hook.status);
    });
  });

  describe('direitos do titular (LGPD)', () => {
    async function subject(opts: { future?: boolean; pending?: boolean } = {}) {
      const e = await event();
      const o = await order(e, {
        buyer: { name: 'Marina da Silva', email: 'marina.silva@exemplo.com', cpf: '52998224725' },
      });
      if (opts.pending)
        await order(e, { status: 'pendente', buyer: { name: 'Marina da Silva', email: 'outra@exemplo.com' } });
      await sql(
        'insert into consents (user_id, terms_version, privacy_version, ip, user_agent) values ($1,$2,$3,$4,$5)',
        [o.userId, 'v1', 'v1', '203.0.113.5', 'Navegador X'],
      );
      await sql(
        "insert into sessions (user_id, token_hash, expires_at, ip, user_agent) values ($1,'h1', now() + interval '1 day', '203.0.113.5','Navegador X')",
        [o.userId],
      );
      await sql(
        "insert into login_attempts (email_normalized, ip, succeeded) values ('marina.silva@exemplo.com','203.0.113.5',true)",
      );
      await sql(
        "insert into payment_events (signature_valid, order_id, type, payload_json) values (true,$1,'payment.updated',$2)",
        [
          o.id,
          JSON.stringify({
            status: 'approved',
            amount: 160,
            payer: { email: 'marina.silva@exemplo.com', name: 'Marina' },
            cpf: '52998224725',
          }),
        ],
      );
      void opts.future;
      return { e, o };
    }
    const ack = {
      reference: 'PROTOCOLO-123',
      reason: 'Pedido formal da PartyX em 03/10',
      confirm: true,
      acknowledgeValidTickets: true,
    };

    it('todas as rotas: visitante 401, comprador e validador 403; nada é lido nem alterado', async () => {
      const { o } = await subject();
      const client = await session('cliente');
      const staff = await session('validador');
      const routes: [string, string, unknown?][] = [
        ['GET', '/admin/privacy/subjects?email=marina.silva@exemplo.com'],
        ['GET', `/admin/privacy/subjects/${o.userId}/export?protocolo=P-1`],
        ['POST', `/admin/privacy/subjects/${o.userId}/anonymize`, ack],
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
      expect((await sql('select anonymized_at from users where id = $1', [o.userId])).rows[0].anonymized_at).toBeNull();
      expect((await sql("select count(*)::int as n from audit_log where action like 'privacidade.%'")).rows[0].n).toBe(
        0,
      );
    });

    it('localizar e exportar: dados do titular, sem hashes nem QR; protocolo obrigatório; tudo auditado sem dado pessoal', async () => {
      const { o } = await subject();
      const adm = await session();
      const found = await json(await adm.get('/admin/privacy/subjects?cpf=529.982.247-25'));
      expect(found.subject.id).toBe(o.userId);
      expect((await adm.get('/admin/privacy/subjects?email=nao-existe@exemplo.com')).status).toBe(404);
      expect((await adm.get(`/admin/privacy/subjects/${o.userId}/export`)).status).toBe(422);
      const res = await adm.get(`/admin/privacy/subjects/${o.userId}/export?protocolo=PROTOCOLO-123`);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(res.headers.get('content-disposition')).toMatch(/^attachment/);
      const text = await res.text();
      const data = JSON.parse(text);
      expect(data.subject).toMatchObject({
        name: 'Marina da Silva',
        email: 'marina.silva@exemplo.com',
        cpf: '52998224725',
      });
      expect(data.orders).toHaveLength(1);
      expect(data.orders[0].tickets).toHaveLength(2);
      expect(data.consents[0]).toMatchObject({ termsVersion: 'v1' });
      expect(text).not.toMatch(/password_hash|passwordHash|token_hash|qr_payload|PX1\.|argon2/i);
      const log = (
        await sql(
          "select actor_id, action, entity_id, after_json, reason from audit_log where action like 'privacidade.%' order by created_at",
        )
      ).rows;
      expect(log.map(r => r.action)).toEqual(['privacidade.consulta', 'privacidade.exportacao']);
      for (const r of log) {
        expect(r.actor_id).toBe(adm.id);
        expect(JSON.stringify(r)).not.toMatch(/marina|52998224725|exemplo\.com/i);
      }
    });

    it('anonimizar: remove o dado pessoal e mantém a história financeira; ingressos válidos exigem ciência', async () => {
      const { e, o } = await subject();
      const adm = await session();
      const before = (await sql('select count(*)::int as n, coalesce(sum(total_cents),0)::int as total from orders'))
        .rows[0];

      const semConfirmacao = await adm.post(`/admin/privacy/subjects/${o.userId}/anonymize`, {
        ...ack,
        confirm: false,
      });
      expect(semConfirmacao.status).toBe(422);
      const semCiencia = await adm.post(`/admin/privacy/subjects/${o.userId}/anonymize`, {
        ...ack,
        acknowledgeValidTickets: false,
      });
      expect(semCiencia.status).toBe(409);
      expect((await json(semCiencia)).erro.codigo).toBe('ingressos_validos');
      expect((await sql('select anonymized_at from users where id = $1', [o.userId])).rows[0].anonymized_at).toBeNull();

      const res = await adm.post(`/admin/privacy/subjects/${o.userId}/anonymize`, ack);
      expect(res.status).toBe(200);
      const out = (await json(res)).result;
      expect(out).toMatchObject({ ordersKept: 1, ticketsAnonymized: 2, validFutureTickets: 2 });

      const u = (await sql('select * from users where id = $1', [o.userId])).rows[0];
      expect(u).toMatchObject({ name: 'Titular removido', cpf: null, phone: null, is_active: false });
      expect(u.email).toBe(`removido-${o.userId}@removido.invalid`);
      expect(u.anonymized_at).not.toBeNull();
      expect(
        (await sql('select holder_name from tickets where order_id = $1', [o.id])).rows.map(r => r.holder_name),
      ).toEqual(['Titular removido', 'Titular removido']);
      expect(
        (await sql('select ip, user_agent, terms_version from consents where user_id = $1', [o.userId])).rows[0],
      ).toMatchObject({ ip: null, user_agent: null, terms_version: 'v1' });
      expect((await sql('select count(*)::int as n from sessions where user_id = $1', [o.userId])).rows[0].n).toBe(0);
      expect(
        (await sql("select count(*)::int as n from login_attempts where email_normalized = 'marina.silva@exemplo.com'"))
          .rows[0].n,
      ).toBe(0);
      const payload = JSON.stringify(
        (await sql('select payload_json from payment_events where order_id = $1', [o.id])).rows[0].payload_json,
      );
      expect(payload).not.toMatch(/marina|52998224725/i);
      expect(JSON.parse(payload)).toMatchObject({ status: 'approved', amount: 160 });

      // A história financeira não muda: o pedido, o valor, a data de aprovação e os ingressos continuam.
      expect(
        (await sql('select count(*)::int as n, coalesce(sum(total_cents),0)::int as total from orders')).rows[0],
      ).toEqual(before);
      expect((await sql('select status, paid_at from orders where id = $1', [o.id])).rows[0].status).toBe('pago');
      expect((await sql('select count(*)::int as n from tickets where order_id = $1', [o.id])).rows[0].n).toBe(2);
      const fee = await json(await adm.get('/admin/reports/fee?month=2026-12'));
      expect(fee.units).toBe(2);
      expect(e.id).toBeTruthy();

      // O titular não entra mais, nem recupera acesso pelo e-mail antigo.
      const login = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'marina.silva@exemplo.com', password: PASSWORD }),
      });
      expect(login.status).toBe(401);

      // Nada de dado pessoal na trilha; segunda tentativa é recusada.
      const audit = (
        await sql("select actor_id, after_json, reason from audit_log where action = 'privacidade.anonimizacao'")
      ).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0].actor_id).toBe(adm.id);
      expect(JSON.stringify(audit[0].after_json)).not.toMatch(/marina|52998224725|exemplo/i);
      expect(audit[0].after_json.protocolo).toBe('PROTOCOLO-123');
      expect((await adm.post(`/admin/privacy/subjects/${o.userId}/anonymize`, ack)).status).toBe(409);
    });

    it('recusa: pedido aguardando pagamento, perfil de equipe, protocolo ou motivo ausentes', async () => {
      const { o } = await subject({ pending: true });
      const adm = await session();
      const pend = await sql("select user_id from orders where status = 'pendente'");
      const r1 = await adm.post(`/admin/privacy/subjects/${pend.rows[0].user_id}/anonymize`, ack);
      expect(r1.status).toBe(409);
      expect((await json(r1)).erro.codigo).not.toBe('ja_anonimizado');
      const staff = await session('validador');
      expect((await adm.post(`/admin/privacy/subjects/${staff.id}/anonymize`, ack)).status).toBe(422);
      expect((await adm.post(`/admin/privacy/subjects/${o.userId}/anonymize`, { ...ack, reference: '' })).status).toBe(
        422,
      );
      expect(
        (await adm.post(`/admin/privacy/subjects/${o.userId}/anonymize`, { ...ack, reason: 'curto' })).status,
      ).toBe(422);
      expect(
        (await adm.post(`/admin/privacy/subjects/00000000-0000-4000-8000-000000000000/anonymize`, ack)).status,
      ).toBe(404);
      expect((await sql('select count(*)::int as n from users where anonymized_at is not null')).rows[0].n).toBe(0);
    });

    it('reverter a migração é recusado enquanto houver titular anonimizado', async () => {
      const { o } = await subject();
      const adm = await session();
      await adm.post(`/admin/privacy/subjects/${o.userId}/anonymize`, ack);
      const { readFileSync } = await import('node:fs');
      const down = readFileSync('drizzle/rollback/0003_anonimizacao_lgpd.down.sql', 'utf8');
      await expect(testDb.pool.query(down)).rejects.toThrow(/anonimizados/);
    });
  });

  describe('retenção configurável', () => {
    it('apaga só dado técnico além do prazo; sessão ativa e dados sem prazo configurado ficam', async () => {
      const { purgeExpired } = await import('../privacy/retention');
      const db = createDrizzle(testDb.pool);
      const u = (
        await sql(
          "insert into users (name,email,cpf,password_hash,role) values ('R','r@exemplo.com','11144477735',$1,'cliente') returning id",
          [hash],
        )
      ).rows[0].id as string;
      const ago = (days: number) => new Date(clock.now().getTime() - days * 86_400_000);
      await sql(
        'insert into login_attempts (email_normalized, succeeded, created_at) values ($1,false,$2), ($3,false,$4)',
        ['a@x.com', ago(40), 'b@x.com', ago(5)],
      );
      await sql('insert into sessions (user_id, token_hash, expires_at) values ($1,$2,$3), ($1,$4,$5), ($1,$6,$7)', [
        u,
        'velha',
        ago(20),
        'ativa',
        ago(-1),
        'recente',
        ago(2),
      ]);
      await sql('insert into password_resets (user_id, token_hash, expires_at) values ($1,$2,$3)', [u, 'x', ago(90)]);
      const out = await purgeExpired({ db, clock, config });
      expect(out.skipped).toEqual(['password_resets']);
      const left = (await sql('select token_hash from sessions order by token_hash')).rows.map(r => r.token_hash);
      expect(left).toContain('ativa');
      expect(left).not.toContain('velha');
      expect((await sql('select count(*)::int as n from password_resets')).rows[0].n).toBe(1);
      expect((await sql('select email_normalized from login_attempts')).rows.map(r => r.email_normalized)).toEqual([
        'b@x.com',
      ]);
      expect((await sql('select count(*)::int as n from users')).rows[0].n).toBeGreaterThan(0);
      const none = await purgeExpired({ db, clock, config: { ...config, retention: {} } });
      expect(none).toMatchObject({ loginAttempts: 0, sessions: 0, passwordResets: 0 });
    });
  });
});
