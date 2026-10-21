import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { GatewayError, type PaymentGateway } from '../payments/gateway';
import { googleJobAuthenticator, type JobAuthenticator } from '../payments/jobsAuth';
import { createMockGateway, type MockGateway } from '../payments/mockGateway';
import { runReconciliation } from '../payments/notifications';
import type { TicketIssuer } from '../payments/reconcile';
import { MemoryTaskQueue, type TaskQueue } from '../payments/taskQueue';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';
const SHORT = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

describe.skipIf(!ADMIN_URL)('webhook, conciliação e confirmação de pagamento (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  let mock: MockGateway;
  let hash = '';
  let n = 0;
  /** Simula queda do processo no meio da emissão (Prompt 22): lança depois da primeira unidade inserida. */
  let breakIssuer = false;

  /** Emissor de teste: uma linha por unidade, na mesma transação da confirmação. O de verdade é o Prompt 13. */
  const issueTickets: TicketIssuer = async (tx, order) => {
    const [owner] = (await tx.execute(`select name from users where id = '${order.userId}'`)).rows as {
      name: string;
    }[];
    for (const item of order.items) {
      for (let unit = 1; unit <= item.quantity; unit++) {
        if (breakIssuer && unit === 2) throw new Error('queda no meio da emissão');
        const code = randomBytes(18).toString('base64url');
        const pick = () => Array.from({ length: 4 }, () => SHORT[Math.floor(Math.random() * SHORT.length)]).join('');
        await tx.execute(
          `insert into tickets (order_item_id, order_id, ticket_type_id, event_id, unit_index, holder_name, code, short_code, qr_payload)
           select i.id, i.order_id, i.ticket_type_id, i.event_id, ${unit}, '${owner!.name}', '${code}', 'PX-${pick()}-${pick()}', 'qr-${code}'
             from order_items i where i.id = '${item.orderItemId}'`,
        );
      }
    }
  };

  const fakeJobAuth: JobAuthenticator = { verify: async h => h === 'Bearer token-do-scheduler' };
  /** E-mails entregues pelo app (captura em memória). Recriado a cada teste. */
  let mailer = new MemoryEmailSender();

  const build = (
    gateway: PaymentGateway | undefined,
    extra: { env?: Record<string, string>; jobAuth?: JobAuthenticator | undefined; queue?: TaskQueue } = {},
  ) =>
    createApp({
      config: loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none', RESERVATION_MINUTES: '10', ...extra.env }),
      clock,
      auth: {
        db: createDrizzle(testDb.pool),
        hasher: argon2Hasher,
        mailer,
        gateway,
        taskQueue: extra.queue,
      },
      jobAuth: 'jobAuth' in extra ? extra.jobAuth : fakeJobAuth,
      issueTickets,
    });
  let app: ReturnType<typeof build>;

  async function user(role: 'cliente' | 'administrador' | 'validador' = 'cliente', target = app) {
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

  /** Pedido pendente com Pix criado. Devolve o id do pedido e o do pagamento no gateway. */
  async function pay(
    s: Session,
    e: Awaited<ReturnType<typeof event>>,
    qty: number[] = [3],
    method: 'pix' | 'cartao' = 'pix',
  ) {
    const items = qty.map((quantity, i) => ({ ticketTypeId: e.types[i]!, quantity }));
    const created = await s.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: e.slug, items });
    expect(created.status).toBe(201);
    const order = (await json(created)).order as { id: string; totalCents: number };
    expect((await s.post(`/orders/${order.id}/payment`, { method })).status).toBe(201);
    const paymentId = (await sql('select gateway_payment_id from orders where id = $1', [order.id])).rows[0]
      .gateway_payment_id as string;
    return { orderId: order.id, paymentId, totalCents: order.totalCents };
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

  const order = async (id: string) =>
    (await sql('select status, paid_at, payment_method from orders where id = $1', [id])).rows[0];
  const ticketsOf = async (id: string) =>
    (await sql('select status from tickets where order_id = $1', [id])).rows.map(r => r.status as string);
  const sold = async (typeId: string) =>
    (await sql('select quantity_sold from ticket_types where id = $1', [typeId])).rows[0].quantity_sold as number;
  const resvOf = async (id: string) =>
    (await sql('select status from reservations where order_id = $1', [id])).rows.map(r => r.status as string);
  const audit = async (action: string) =>
    (await sql('select entity_id, reason, after_json from audit_log where action = $1', [action])).rows;

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    hash = await argon2Hasher.hash(PASSWORD);
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql(
      'truncate payment_events, checkins, tickets, reservations, order_items, orders, ticket_types, events, audit_log, sessions, login_attempts, job_leases, users cascade',
    );
    clock.set('2026-10-10T15:00:00Z');
    breakIssuer = false;
    mailer = new MemoryEmailSender();
    mock = createMockGateway(clock);
    app = build(mock);
  });

  describe('aprovação (CA-P1, RF-35)', () => {
    it('webhook válido: reconsulta, confere, confirma, conta o estoque e emite um ingresso por unidade', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [3]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const res = await hook(p.paymentId);
      expect([res.status, (await json(res)).status]).toEqual([200, 'processada']);

      const o = await order(p.orderId);
      expect(o.status).toBe('pago');
      expect(new Date(o.paid_at).toISOString()).toBe('2026-10-10T15:00:00.000Z'); // instante da aprovação informado pelo gateway
      expect(await ticketsOf(p.orderId)).toEqual(['valido', 'valido', 'valido']);
      expect(await sold(e.types[0]!)).toBe(3);
      expect(await resvOf(p.orderId)).toEqual(['convertida']);
      expect((await audit('pagamento.confirmado')).length).toBe(1);
      // A tela do comprador vê "pago" sem ação manual.
      expect((await json(await a.get(`/orders/${p.orderId}`))).order.status).toBe('pago');
    });

    it('o webhook sozinho não aprova: se o gateway ainda diz pendente, nada muda', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      const res = await hook(p.paymentId, { type: 'payment.approved' }); // o tipo do evento afirma aprovado; o gateway diz pendente
      expect((await json(res)).outcome).toBe('aguardando');
      expect((await order(p.orderId)).status).toBe('pendente');
      expect(await ticketsOf(p.orderId)).toEqual([]);
      expect(await sold(e.types[0]!)).toBe(0);
    });

    it('a notificação chega sem cookie nem CSRF, mesmo com Origin de outro site (autentica pela assinatura)', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const res = await hook(p.paymentId, { headers: { origin: 'https://gateway.exemplo.test' } });
      expect(res.status).toBe(200);
      expect((await order(p.orderId)).status).toBe('pago');
    });
  });

  describe('atrás da Vercel: webhook com o corpo bruto intacto (docs/operacao/vercel.md)', () => {
    const RUN = 'partyx-391817439013.southamerica-east1.run.app';
    /** Cabeçalhos que o Cloud Run recebe quando a notificação passa pelo rewrite externo da Vercel. */
    const vercel = (forwardedHost = 'partyx.com.br') => ({
      host: RUN,
      'x-forwarded-host': forwardedHost,
      'x-forwarded-for': '54.88.218.97, 76.76.21.142',
      'x-forwarded-proto': 'https',
      'x-vercel-id': 'gru1::abcde-1760464800000-0123456789ab',
    });
    const proxied = () =>
      build(mock, { env: { PUBLIC_BASE_URL: 'https://partyx.com.br', PUBLIC_HOST_CHECK: 'true', TRUSTED_PROXY_HOPS: '2' } });
    /** Corpo com espaços, quebra de linha e acentos: a assinatura vale para estes bytes exatos, não para o JSON reescrito. */
    const rawBody = (paymentId: string) =>
      `{\n  "id": "evt_vercel_1",  "paymentId": "${paymentId}",\n  "type": "payment.updated", "nota": "notificação ✓"\n}`;

    it('pelo domínio público, a assinatura sobre o corpo bruto confere e o pagamento é confirmado', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [2]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const body = rawBody(p.paymentId);
      const res = await hook(p.paymentId, { body, headers: vercel() }, proxied());
      expect([res.status, (await json(res)).status]).toEqual([200, 'processada']);
      expect((await order(p.orderId)).status).toBe('pago');
      expect(await ticketsOf(p.orderId)).toEqual(['valido', 'valido']);
    });

    it('o mesmo conteúdo com outros bytes (JSON reescrito) não passa: prova que a conferência usa o corpo recebido', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const body = rawBody(p.paymentId);
      const res = await proxied().request('/api/webhooks/payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mock-signature': mock.simulate.sign(body), ...vercel() },
        body: JSON.stringify(JSON.parse(body)),
      });
      expect(res.status).toBe(401);
      expect((await order(p.orderId)).status).toBe('pendente');
    });

    it('vindo por outro host (o endereço do projeto na Vercel), a barreira recusa antes de ler a notificação', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const res = await hook(p.paymentId, { body: rawBody(p.paymentId), headers: vercel('partyx-ponte.vercel.app') }, proxied());
      expect(res.status).toBe(403);
      expect((await order(p.orderId)).status).toBe('pendente');
      expect((await sql('select count(*)::int as n from payment_events')).rows[0].n).toBe(0);
    });
  });

  describe('repetição e concorrência (CA-P3)', () => {
    it('o mesmo evento duas vezes: a segunda é "duplicada" e nada se repete', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [3]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const first = await hook(p.paymentId, { eventId: 'evt-igual' });
      const second = await hook(p.paymentId, { eventId: 'evt-igual' });
      expect((await json(first)).status).toBe('processada');
      expect((await json(second)).status).toBe('duplicada');
      expect(await ticketsOf(p.orderId)).toHaveLength(3);
      expect(await sold(e.types[0]!)).toBe(3);
      expect((await sql('select count(*)::int as n from payment_events where signature_valid')).rows[0].n).toBe(1);
    });

    it('eventos diferentes para o mesmo pagamento (criado, aprovado, atualizado) confirmam uma vez só', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [2]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      for (const type of ['payment.created', 'payment.approved', 'payment.updated']) await hook(p.paymentId, { type });
      expect(await ticketsOf(p.orderId)).toHaveLength(2);
      expect(await sold(e.types[0]!)).toBe(2);
      expect((await audit('pagamento.confirmado')).length).toBe(1);
    });

    it('seis entregas simultâneas do mesmo evento e do mesmo pagamento: um pedido pago, um conjunto de ingressos', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [3]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const same = await Promise.all(Array.from({ length: 6 }, () => hook(p.paymentId, { eventId: 'evt-simultaneo' })));
      const other = await Promise.all(Array.from({ length: 4 }, () => hook(p.paymentId)));
      for (const r of [...same, ...other]) expect([200]).toContain(r.status);
      expect((await order(p.orderId)).status).toBe('pago');
      expect(await ticketsOf(p.orderId)).toHaveLength(3);
      expect(await sold(e.types[0]!)).toBe(3);
      expect((await audit('pagamento.confirmado')).length).toBe(1);
    });
  });

  describe('assinatura falsa (CA-P4)', () => {
    it('sem assinatura, errada, com corpo alterado ou vencida: 401, pedido intacto e registro só com metadados', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.setStatus(p.paymentId, 'aprovado'); // até com o gateway dizendo aprovado, a notificação falsa não conta
      const body = JSON.stringify({ id: 'evt-forjado', paymentId: p.paymentId, type: 'payment.approved' });
      const other = createMockGateway(clock);
      const old = Math.floor(clock.now().getTime() / 1000) - 3600;
      const attempts: Record<string, string>[] = [
        {},
        { 'x-mock-signature': 'lixo' },
        { 'x-mock-signature': other.simulate.sign(body) },
        { 'x-mock-signature': mock.simulate.sign(body.replace('evt-forjado', 'outro')) },
        { 'x-mock-signature': mock.simulate.sign(body, old) },
      ];
      for (const headers of attempts) {
        const res = await app.request('/api/webhooks/payments', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body,
        });
        expect(res.status, JSON.stringify(headers)).toBe(401);
        expect((await json(res)).erro.codigo).toBe('assinatura_invalida');
      }
      expect((await order(p.orderId)).status).toBe('pendente');
      expect(await ticketsOf(p.orderId)).toEqual([]);

      const rows = (
        await sql('select signature_valid, gateway_event_id, processed_at, payload_json from payment_events')
      ).rows;
      expect(rows).toHaveLength(5);
      for (const r of rows) {
        expect(r).toMatchObject({ signature_valid: false, gateway_event_id: null, processed_at: null });
        expect(Object.keys(r.payload_json).sort()).toEqual(['bytes', 'cabecalhos', 'motivo', 'sha256']);
      }
      // O corpo e o valor dos cabeçalhos nunca são guardados.
      const all = JSON.stringify(rows);
      expect(all).not.toContain(p.paymentId);
      expect(all).not.toContain('evt-forjado');
      expect(all).not.toContain('lixo');
    });

    it('um evento forjado não "ocupa" o id de um evento verdadeiro', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const body = JSON.stringify({ id: 'evt-real', paymentId: p.paymentId, type: 'payment.approved' });
      await app.request('/api/webhooks/payments', { method: 'POST', body, headers: { 'x-mock-signature': 'forjada' } });
      const real = await hook(p.paymentId, { eventId: 'evt-real' });
      expect((await json(real)).status).toBe('processada');
      expect((await order(p.orderId)).status).toBe('pago');
    });

    it('rajada de notificações inválidas: todas recusadas, mas a gravação tem teto', async () => {
      for (let i = 0; i < 45; i++) {
        const res = await app.request('/api/webhooks/payments', {
          method: 'POST',
          headers: { 'x-forwarded-for': '198.51.100.77' },
          body: `{"i":${i}}`,
        });
        expect(res.status).toBe(401);
      }
      expect((await sql('select count(*)::int as n from payment_events')).rows[0].n).toBeLessThanOrEqual(30);
    });

    it('corpo enorme: 413; sem gateway configurado: 503', async () => {
      const big = await app.request('/api/webhooks/payments', { method: 'POST', body: 'x'.repeat(300 * 1024) });
      expect(big.status).toBe(413);
      const none = build(undefined);
      expect((await none.request('/api/webhooks/payments', { method: 'POST', body: '{}' })).status).toBe(503);
    });
  });

  describe('conferência antes de aprovar', () => {
    for (const [nome, patch, esperado] of [
      ['valor menor', { amountCents: 100 }, 'valor'],
      ['valor 1 centavo a menos', { amountCents: -1 }, 'valor'],
      ['conta de outro recebedor', { accountId: 'conta-do-golpista' }, 'conta'],
      ['pedido diferente', { orderRef: 'outro-pedido' }, 'pedido'],
      ['moeda diferente', { currency: 'USD' }, 'moeda'],
    ] as const) {
      it(`${nome}: não aprova, não emite, registra uma vez e avisa`, async () => {
        const e = await event();
        const a = await user();
        const p = await pay(a, e);
        const patched = 'amountCents' in patch && patch.amountCents === -1 ? { amountCents: p.totalCents - 1 } : patch;
        mock.simulate.tamper(p.paymentId, { ...patched, status: 'aprovado' });
        const res = await hook(p.paymentId);
        expect((await json(res)).outcome).toBe('divergente');
        await hook(p.paymentId); // repetir não duplica a trilha
        expect((await order(p.orderId)).status).toBe('pendente');
        expect(await ticketsOf(p.orderId)).toEqual([]);
        expect(await sold(e.types[0]!)).toBe(0);
        const trail = await audit('pagamento.divergente');
        expect(trail).toHaveLength(1);
        expect(trail[0].reason).toContain(esperado);
      });
    }

    it('o administrador vê a divergência na lista de exceções', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.tamper(p.paymentId, { amountCents: 1, status: 'aprovado' });
      await hook(p.paymentId);
      const admin = await user('administrador');
      const list = await json(await admin.get('/admin/payments/exceptions'));
      expect(list.divergencias[0]).toMatchObject({ orderId: p.orderId, reason: 'valor' });
      expect((await a.get('/admin/payments/exceptions')).status).toBe(403);
    });
  });

  describe('webhook perdido e conciliação agendada', () => {
    it('sem nenhum webhook, a conciliação encontra o pagamento aprovado e confirma', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [2]);
      mock.simulate.setStatus(p.paymentId, 'aprovado'); // gateway aprovou; a notificação nunca chegou
      const summary = await runReconciliation(
        { db: createDrizzle(testDb.pool), clock, gateway: mock, issueTickets },
        { minIntervalSeconds: 0 },
      );
      expect(summary.orders).toMatchObject({ checked: 1, failed: 0, outcomes: { confirmado: 1 } });
      expect((await order(p.orderId)).status).toBe('pago');
      expect(await ticketsOf(p.orderId)).toHaveLength(2);
    });

    it('a rotina HTTP exige o token do Scheduler: sem token 401, token errado 401, correto roda', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const call = (headers: Record<string, string> = {}) =>
        app.request('/api/internal/jobs/reconcile-payments', { method: 'POST', headers });
      expect((await call()).status).toBe(401);
      expect((await call({ authorization: 'Bearer errado' })).status).toBe(401);
      expect((await call({ authorization: 'Basic abc' })).status).toBe(401);
      expect((await order(p.orderId)).status).toBe('pendente'); // nada rodou
      const ok = await call({ authorization: 'Bearer token-do-scheduler' });
      expect(ok.status).toBe(200);
      // A rotina respeita o intervalo mínimo (60 s): o pedido foi criado agora, então ainda não é reconsultado.
      clock.advance(0);
      expect((await json(ok)).status).toBe('ok');
    });

    it('sem configuração das rotinas: 503; o verificador do Google recusa lixo sem lançar erro', async () => {
      const unconfigured = build(mock, { jobAuth: undefined });
      expect(
        (
          await unconfigured.request('/api/internal/jobs/reconcile-payments', {
            method: 'POST',
            headers: { authorization: 'Bearer x' },
          })
        ).status,
      ).toBe(503);
      expect(googleJobAuthenticator({ JOBS_AUDIENCE: undefined, JOBS_CALLER_EMAIL: undefined })).toBeUndefined();
      const g = googleJobAuthenticator({
        JOBS_AUDIENCE: 'https://servico.exemplo.test',
        JOBS_CALLER_EMAIL: 'scheduler@projeto.iam.gserviceaccount.com',
      })!;
      for (const bad of [undefined, '', 'Bearer', 'Bearer lixo.lixo.lixo', 'Bearer a b'])
        expect(await g.verify(bad), String(bad)).toBe(false);
    });

    it('execuções simultâneas: um pedido pago, ingressos uma vez, lotes disjuntos', async () => {
      const e = await event();
      const buyers = await Promise.all(Array.from({ length: 4 }, () => user()));
      const paid = [];
      for (const b of buyers) paid.push(await pay(b, e, [1]));
      for (const p of paid) mock.simulate.setStatus(p.paymentId, 'aprovado');
      const deps = { db: createDrizzle(testDb.pool), clock, gateway: mock, issueTickets };
      const runs = await Promise.all(
        Array.from({ length: 5 }, () => runReconciliation(deps, { minIntervalSeconds: 60 })),
      );
      // Com o intervalo mínimo, cada pedido é reservado por uma única execução.
      expect(runs.reduce((t, r) => t + r.orders.checked, 0)).toBeLessThanOrEqual(0 + 4);
      const again = await runReconciliation(deps, { minIntervalSeconds: 0 });
      const total =
        runs.reduce((t, r) => t + (r.orders.outcomes.confirmado ?? 0), 0) + (again.orders.outcomes.confirmado ?? 0);
      expect(total).toBe(4);
      expect(await sold(e.types[0]!)).toBe(4);
      expect((await sql('select count(*)::int as n from tickets')).rows[0].n).toBe(4);
    });

    it('execuções paralelas sem intervalo (pegando os mesmos pedidos) continuam sem duplicar nada', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [3]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const deps = { db: createDrizzle(testDb.pool), clock, gateway: mock, issueTickets };
      await Promise.all(Array.from({ length: 6 }, () => runReconciliation(deps, { minIntervalSeconds: 0 })));
      expect(await ticketsOf(p.orderId)).toHaveLength(3);
      expect(await sold(e.types[0]!)).toBe(3);
      expect((await audit('pagamento.confirmado')).length).toBe(1);
    });

    it('depois de pago, o pedido deixa de ser reconsultado (some do lote)', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const deps = { db: createDrizzle(testDb.pool), clock, gateway: mock, issueTickets };
      await runReconciliation(deps, { minIntervalSeconds: 0 });
      expect((await runReconciliation(deps, { minIntervalSeconds: 0 })).orders.checked).toBe(0);
    });
  });

  describe('gateway fora do ar', () => {
    it('webhook com consulta falhando: 503 para o gateway tentar de novo, evento fica pendente, nada muda', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      mock.simulate.failNext(new GatewayError('timeout'));
      const res = await hook(p.paymentId, { eventId: 'evt-timeout' });
      expect(res.status).toBe(503);
      expect((await order(p.orderId)).status).toBe('pendente');
      const ev = (
        await sql(
          "select processed_at, attempts, processing_error from payment_events where gateway_event_id = 'evt-timeout'",
        )
      ).rows[0];
      expect(ev).toMatchObject({ processed_at: null, attempts: 1, processing_error: 'gateway_indisponivel' });
    });

    it('a reentrega do mesmo evento e a conciliação recuperam o que falhou', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [2]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      mock.simulate.failNext(new GatewayError('timeout'));
      await hook(p.paymentId, { eventId: 'evt-retry' });
      // O gateway reenvia o mesmo evento: como não foi processado, processa agora.
      const again = await hook(p.paymentId, { eventId: 'evt-retry' });
      expect([again.status, (await json(again)).status]).toEqual([200, 'processada']);
      expect((await order(p.orderId)).status).toBe('pago');
      expect(await ticketsOf(p.orderId)).toHaveLength(2);
    });

    it('sem reentrega, a conciliação reprocessa o evento pendente', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      mock.simulate.failNext(new GatewayError('timeout'));
      await hook(p.paymentId, { eventId: 'evt-job' });
      const summary = await runReconciliation(
        { db: createDrizzle(testDb.pool), clock, gateway: mock, issueTickets },
        { minIntervalSeconds: 0 },
      );
      expect(summary.events).toMatchObject({ tried: 1, done: 1 });
      expect((await order(p.orderId)).status).toBe('pago');
      expect(
        (await sql("select processed_at from payment_events where gateway_event_id = 'evt-job'")).rows[0].processed_at,
      ).not.toBeNull();
    });

    it('falha numa consulta da conciliação não impede as outras', async () => {
      const e = await event();
      const [a, b] = await Promise.all([user(), user()]);
      const p1 = await pay(a, e, [1]);
      const p2 = await pay(b, e, [1]);
      mock.simulate.setStatus(p1.paymentId, 'aprovado');
      mock.simulate.setStatus(p2.paymentId, 'aprovado');
      mock.simulate.failNext(new GatewayError('timeout'));
      const summary = await runReconciliation(
        { db: createDrizzle(testDb.pool), clock, gateway: mock, issueTickets },
        { minIntervalSeconds: 0 },
      );
      expect(summary.orders).toMatchObject({ checked: 2, failed: 1 });
      expect(summary.orders.outcomes.confirmado).toBe(1);
    });

    it('nunca há transação aberta enquanto o gateway é consultado (sem chamada externa dentro do banco)', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const seen: number[] = [];
      const watching: PaymentGateway = Object.assign(Object.create(mock), {
        getPayment: async (id: string) => {
          const r = await sql(
            "select count(*)::int as n from pg_stat_activity where datname = current_database() and state = 'idle in transaction'",
          );
          seen.push(r.rows[0].n);
          return mock.getPayment(id);
        },
      });
      const watched = build(watching);
      expect((await hook(p.paymentId, {}, watched)).status).toBe(200);
      expect(seen).toEqual([0]);
      expect((await order(p.orderId)).status).toBe('pago');
    });
  });

  describe('cartão recusado (CA-P2)', () => {
    it('não gera ingresso e devolve o estoque na hora', async () => {
      const e = await event([{ total: 1 }]);
      const a = await user();
      const b = await user();
      const p = await pay(a, e, [1], 'cartao');
      expect(
        (await b.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: e.slug, items: [{ ticketTypeId: e.types[0], quantity: 1 }] })).status,
      ).toBe(409);
      mock.simulate.setStatus(p.paymentId, 'recusado');
      expect((await json(await hook(p.paymentId))).outcome).toBe('recusado');
      expect((await order(p.orderId)).status).toBe('nao_concluido');
      expect(await ticketsOf(p.orderId)).toEqual([]);
      expect(await resvOf(p.orderId)).toEqual(['liberada']);
      expect(await sold(e.types[0]!)).toBe(0);
      expect(
        (await b.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: e.slug, items: [{ ticketTypeId: e.types[0], quantity: 1 }] })).status,
      ).toBe(201);
      expect((await json(await a.get(`/orders/${p.orderId}`))).order.status).toBe('nao_concluido');
    });

    it('recusa repetida não muda nada; Pix vencido no gateway expira o pedido', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.setStatus(p.paymentId, 'expirado');
      expect((await json(await hook(p.paymentId))).outcome).toBe('expirado');
      expect((await json(await hook(p.paymentId))).outcome).toBe('ignorado');
      expect((await order(p.orderId)).status).toBe('expirado');
      expect(await resvOf(p.orderId)).toEqual(['expirada']);
    });
  });

  describe('aprovação depois de a reserva vencer (seção 10.1, D-13)', () => {
    it('com estoque: emite, conta o estoque e a reserva vira convertida', async () => {
      const e = await event([{ total: 5 }]);
      const a = await user();
      const p = await pay(a, e, [2]);
      clock.advance(11 * 60_000);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      expect((await json(await hook(p.paymentId))).outcome).toBe('confirmado_tardio');
      expect((await order(p.orderId)).status).toBe('pago');
      expect(await ticketsOf(p.orderId)).toHaveLength(2);
      expect(await sold(e.types[0]!)).toBe(2);
      expect(await resvOf(p.orderId)).toEqual(['convertida']);
      expect((await audit('pagamento.confirmado_tardio')).length).toBe(1);
    });

    it('com a rotina de expiração já tendo vencido o pedido: também emite se houver estoque', async () => {
      const e = await event([{ total: 5 }]);
      const a = await user();
      const p = await pay(a, e, [2]);
      clock.advance(11 * 60_000);
      await a.get(`/orders/${p.orderId}`); // acerta o estado para "expirado"
      expect((await order(p.orderId)).status).toBe('expirado');
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      expect((await json(await hook(p.paymentId))).outcome).toBe('confirmado_tardio');
      expect(await ticketsOf(p.orderId)).toHaveLength(2);
    });

    it('sem estoque: não emite, marca "pago sem estoque", guarda paid_at, avisa e lista para o administrador estornar', async () => {
      const e = await event([{ total: 2 }]);
      const a = await user();
      const b = await user();
      const pa = await pay(a, e, [2]);
      clock.advance(11 * 60_000); // a reserva de A venceu
      const pb = await pay(b, e, [2]); // B compra as duas unidades e paga
      mock.simulate.setStatus(pb.paymentId, 'aprovado');
      await hook(pb.paymentId);
      expect(await sold(e.types[0]!)).toBe(2);

      mock.simulate.setStatus(pa.paymentId, 'aprovado'); // A paga tarde, com tudo vendido
      const err = vi.spyOn(process.stderr, 'write');
      let res: Response;
      try {
        res = await hook(pa.paymentId);
        expect((await json(res)).outcome).toBe('sem_estoque');
        const logged = err.mock.calls.map(c => String(c[0])).join('');
        expect(logged).toContain('"alert":"pago_sem_estoque"');
      } finally {
        err.mockRestore();
      }
      const o = await order(pa.orderId);
      expect(o.status).toBe('pago_sem_estoque');
      expect(o.paid_at).not.toBeNull();
      expect(await ticketsOf(pa.orderId)).toEqual([]); // sem QR
      expect(await sold(e.types[0]!)).toBe(2); // não passou da capacidade
      expect((await audit('pagamento.sem_estoque')).length).toBe(1);

      const admin = await user('administrador');
      const list = await json(await admin.get('/admin/payments/exceptions'));
      expect(list.semEstoque).toHaveLength(1);
      expect(list.semEstoque[0]).toMatchObject({ orderId: pa.orderId, totalCents: pa.totalCents });
      expect(list.semEstoque[0].buyerCpf).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
      expect(list.orientacao).toMatch(/cliente estorna/);
    });

    it('tudo ou nada: com um dos tipos esgotado, o pedido todo fica sem estoque, sem emissão parcial', async () => {
      const e = await event([{ total: 5 }, { total: 1 }]);
      const a = await user();
      const b = await user();
      const pa = await pay(a, e, [1, 1]);
      clock.advance(11 * 60_000);
      const pb = await pay(b, e, [0 + 1, 1]); // B leva a última do segundo tipo
      mock.simulate.setStatus(pb.paymentId, 'aprovado');
      await hook(pb.paymentId);
      mock.simulate.setStatus(pa.paymentId, 'aprovado');
      expect((await json(await hook(pa.paymentId))).outcome).toBe('sem_estoque');
      expect(await ticketsOf(pa.orderId)).toEqual([]);
      expect(await sold(e.types[0]!)).toBe(1); // só o de B
    });

    it('corrida: aprovação tardia de A contra a reserva de B pela última unidade nunca vende duas vezes', async () => {
      for (let round = 0; round < 6; round++) {
        const e = await event([{ total: 1 }]);
        const a = await user();
        const b = await user();
        const pa = await pay(a, e, [1]);
        clock.advance(11 * 60_000);
        mock.simulate.setStatus(pa.paymentId, 'aprovado');
        const [late, reserve] = await Promise.all([
          hook(pa.paymentId),
          b.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: e.slug, items: [{ ticketTypeId: e.types[0], quantity: 1 }] }),
        ]);
        expect(late.status).toBe(200);
        const rows = (
          await sql(
            `select t.quantity_sold, coalesce((select sum(r.quantity) from reservations r where r.ticket_type_id = t.id and r.status = 'ativa' and r.expires_at > $2), 0)::int as held
               from ticket_types t where t.id = $1`,
            [e.types[0], clock.now()],
          )
        ).rows[0];
        expect(rows.quantity_sold + rows.held, `rodada ${round}`).toBeLessThanOrEqual(1);
        const aStatus = (await order(pa.orderId)).status;
        // Ou A levou a unidade (e B foi recusado), ou B reservou primeiro (e A ficou sem estoque).
        expect(reserve.status === 201 ? aStatus === 'pago_sem_estoque' : aStatus === 'pago').toBe(true);
        clock.advance(11 * 60_000); // solta a reserva de B para a próxima rodada
      }
    });
  });

  describe('estorno e chargeback (CA-P5, CA-29)', () => {
    async function paidOrder(qty = 3) {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [qty]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      await hook(p.paymentId);
      expect((await order(p.orderId)).status).toBe('pago');
      return { e, a, ...p };
    }

    it('estorno depois de uma transferência (D-87): o pedido e o reembolso continuam de quem comprou; o transferido é cancelado', async () => {
      const p = await paidOrder(2);
      const b = await user();
      const [recipient] = (await sql("select id, email from users where role = 'cliente' order by created_at desc, email desc limit 1"))
        .rows as { id: string; email: string }[];
      await sql("update users set birth_date = '1995-01-01' where id = $1", [recipient!.id]);
      const [first] = (await sql('select id from tickets where order_id = $1 order by unit_index limit 1', [p.orderId])).rows;
      const moved = await p.a.post(`/tickets/${first.id}/transfer`, { destination: recipient!.email, confirm: true });
      expect(moved.status).toBe(200);
      const ownerOf = async () => (await sql('select user_id from orders where id = $1', [p.orderId])).rows[0].user_id as string;
      const buyerId = await ownerOf();
      expect(buyerId).not.toBe(recipient!.id);

      mock.simulate.setStatus(p.paymentId, 'estornado');
      expect((await json(await hook(p.paymentId))).outcome).toBe('estornado');
      // O pedido (e o reembolso, feito pelo gateway no meio de pagamento dele) continua de quem comprou.
      const after = await order(p.orderId);
      expect(after.status).toBe('estornado');
      expect(await ownerOf()).toBe(buyerId);
      // Os dois ingressos do pedido são cancelados, inclusive o que estava com quem recebeu.
      expect(await ticketsOf(p.orderId)).toEqual(['cancelado', 'cancelado']);
      const mine = (await json(await b.get('/tickets'))).tickets as { id: string; status: string }[];
      expect(mine).toEqual([expect.objectContaining({ id: first.id, status: 'cancelado' })]);
      expect((await json(await b.get(`/tickets/${first.id}`))).ticket.qrPayload).toBeNull();
    });

    it('estorno no gateway cancela os ingressos, mantém paid_at e não devolve estoque', async () => {
      const p = await paidOrder(3);
      const before = await order(p.orderId);
      mock.simulate.setStatus(p.paymentId, 'estornado');
      expect((await json(await hook(p.paymentId))).outcome).toBe('estornado');
      const after = await order(p.orderId);
      expect(after.status).toBe('estornado');
      expect(after.paid_at).toEqual(before.paid_at); // a taxa mensal continua contando
      expect(await ticketsOf(p.orderId)).toEqual(['cancelado', 'cancelado', 'cancelado']);
      expect(await sold(p.e.types[0]!)).toBe(3); // reposição depende da decisão D-14: nada é devolvido
      expect(
        (
          await sql(
            "select count(*)::int as n from tickets where cancelled_at is not null and cancel_reason = 'estorno'",
          )
        ).rows[0].n,
      ).toBe(3);
      expect((await audit('pagamento.estornado'))[0].after_json).toMatchObject({
        status: 'estornado',
        ingressosCancelados: 3,
      });
    });

    it('repetir o aviso de estorno não faz nada de novo', async () => {
      const p = await paidOrder(2);
      mock.simulate.setStatus(p.paymentId, 'estornado');
      await hook(p.paymentId);
      expect((await json(await hook(p.paymentId))).outcome).toBe('ignorado');
      expect((await audit('pagamento.estornado')).length).toBe(1);
    });

    it('chargeback: pedido contestado e ingressos cancelados, paid_at preservado', async () => {
      const p = await paidOrder(2);
      const before = await order(p.orderId);
      mock.simulate.setStatus(p.paymentId, 'contestado');
      expect((await json(await hook(p.paymentId))).outcome).toBe('contestado');
      expect((await order(p.orderId)).status).toBe('contestado');
      expect((await order(p.orderId)).paid_at).toEqual(before.paid_at);
      expect(await ticketsOf(p.orderId)).toEqual(['cancelado', 'cancelado']);
      // Depois, o contestado vira estorno.
      mock.simulate.setStatus(p.paymentId, 'estornado');
      expect((await json(await hook(p.paymentId))).outcome).toBe('estornado');
      expect((await order(p.orderId)).status).toBe('estornado');
    });

    it('ingresso já usado na portaria continua "utilizado": a entrada aconteceu', async () => {
      const p = await paidOrder(2);
      const staff = (
        await sql(
          "insert into users (name,email,password_hash,role) values ('Valida Dor','v@x.com',$1,'validador') returning id",
          [hash],
        )
      ).rows[0].id;
      await sql(
        "update tickets set status = 'utilizado', used_at = now(), validated_by = $2 where id = (select id from tickets where order_id = $1 limit 1)",
        [p.orderId, staff],
      );
      mock.simulate.setStatus(p.paymentId, 'estornado');
      await hook(p.paymentId);
      expect((await ticketsOf(p.orderId)).sort()).toEqual(['cancelado', 'utilizado']);
    });

    it('eventos fora de ordem: o aviso antigo de "aprovado" chegando depois do estorno não ressuscita o pedido', async () => {
      const p = await paidOrder(2);
      mock.simulate.setStatus(p.paymentId, 'estornado');
      await hook(p.paymentId, { type: 'payment.refunded' });
      const late = await hook(p.paymentId, { type: 'payment.approved' }); // evento antigo, entregue por último
      expect((await json(late)).outcome).toBe('ignorado');
      expect((await order(p.orderId)).status).toBe('estornado');
      expect(await ticketsOf(p.orderId)).toEqual(['cancelado', 'cancelado']);
    });

    it('estorno de um pedido que nunca foi aprovado aqui: não inventa transição, registra e avisa', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      mock.simulate.setStatus(p.paymentId, 'estornado');
      expect((await json(await hook(p.paymentId))).outcome).toBe('ignorado');
      expect((await order(p.orderId)).status).toBe('pendente');
      expect((await audit('pagamento.estorno_fora_de_fluxo')).length).toBe(1);
    });

    it('pagamento sem estoque que o cliente estornou no gateway vira "estornado"', async () => {
      const e = await event([{ total: 1 }]);
      const a = await user();
      const b = await user();
      const pa = await pay(a, e, [1]);
      clock.advance(11 * 60_000);
      const pb = await pay(b, e, [1]);
      mock.simulate.setStatus(pb.paymentId, 'aprovado');
      await hook(pb.paymentId);
      mock.simulate.setStatus(pa.paymentId, 'aprovado');
      await hook(pa.paymentId);
      expect((await order(pa.orderId)).status).toBe('pago_sem_estoque');
      mock.simulate.setStatus(pa.paymentId, 'estornado');
      await hook(pa.paymentId);
      expect((await order(pa.orderId)).status).toBe('estornado');
      expect((await list(await user('administrador'))).semEstoque).toHaveLength(0);
      async function list(admin: Session) {
        return json(await admin.get('/admin/payments/exceptions'));
      }
    });
  });

  describe('casos difíceis de estorno, chargeback e interrupção (Prompt 22)', () => {
    const adminFee = async (month = '2026-10') => {
      const adm = await user('administrador');
      return json(await adm.get(`/admin/reports/fee?month=${month}`));
    };

    it('queda no meio da emissão: nada fica pela metade e a reentrega conclui (retomada)', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [3]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      breakIssuer = true;
      const res = await hook(p.paymentId, { eventId: 'evt-queda' });
      expect(res.status).toBe(503);
      // A transação inteira voltou: pedido pendente, reserva viva, estoque intacto, nenhum ingresso, nenhum e-mail.
      expect((await order(p.orderId)).status).toBe('pendente');
      expect(await resvOf(p.orderId)).toEqual(['ativa']);
      expect(await sold(e.types[0]!)).toBe(0);
      expect(await ticketsOf(p.orderId)).toHaveLength(0);
      expect(
        (await sql("select count(*)::int as n from email_log where order_id = $1", [p.orderId])).rows[0].n,
      ).toBe(0);
      expect(
        (await sql("select processed_at, attempts from payment_events where gateway_event_id = 'evt-queda'")).rows[0],
      ).toMatchObject({ processed_at: null, attempts: 1 });
      // O processo volta: a reentrega do gateway conclui, uma única vez.
      breakIssuer = false;
      expect((await hook(p.paymentId, { eventId: 'evt-queda' })).status).toBe(200);
      expect((await order(p.orderId)).status).toBe('pago');
      expect(await ticketsOf(p.orderId)).toEqual(['valido', 'valido', 'valido']);
      expect(await sold(e.types[0]!)).toBe(3);
    });

    it('queda no meio da emissão sem reentrega: a conciliação retoma sozinha', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [2]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      breakIssuer = true;
      await hook(p.paymentId, { eventId: 'evt-queda-job' });
      breakIssuer = false;
      await runReconciliation(
        { db: createDrizzle(testDb.pool), clock, gateway: mock, issueTickets },
        { minIntervalSeconds: 0 },
      );
      expect((await order(p.orderId)).status).toBe('pago');
      expect(await ticketsOf(p.orderId)).toHaveLength(2);
    });

    it('estorno e aprovação chegando ao mesmo tempo: o resultado segue o gateway e nada se duplica', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [2]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      await hook(p.paymentId);
      mock.simulate.setStatus(p.paymentId, 'estornado');
      const res = await Promise.all([
        ...Array.from({ length: 4 }, () => hook(p.paymentId, { type: 'payment.refunded' })),
        ...Array.from({ length: 4 }, () => hook(p.paymentId, { type: 'payment.approved' })),
      ]);
      expect(res.every(r => r.status === 200)).toBe(true);
      expect((await order(p.orderId)).status).toBe('estornado');
      expect(await ticketsOf(p.orderId)).toEqual(['cancelado', 'cancelado']);
      expect((await audit('pagamento.estornado')).length).toBe(1);
    });

    it('estorno com valor ou conta divergentes não cancela nada: vai para a revisão', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [2]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      await hook(p.paymentId);
      mock.simulate.setStatus(p.paymentId, 'estornado');
      mock.simulate.tamper(p.paymentId, { amountCents: p.totalCents - 100 }); // devolução parcial, por exemplo
      expect((await json(await hook(p.paymentId))).outcome).toBe('divergente');
      expect((await order(p.orderId)).status).toBe('pago');
      expect(await ticketsOf(p.orderId)).toEqual(['valido', 'valido']);
      expect((await audit('pagamento.divergente')).length).toBe(1);
    });

    it('chargeback de pagamento sem estoque não inventa transição', async () => {
      const e = await event([{ total: 1 }]);
      const [a, b] = await Promise.all([user(), user()]);
      const pa = await pay(a, e, [1]);
      clock.advance(11 * 60_000);
      const pb = await pay(b, e, [1]);
      mock.simulate.setStatus(pb.paymentId, 'aprovado');
      await hook(pb.paymentId);
      mock.simulate.setStatus(pa.paymentId, 'aprovado');
      await hook(pa.paymentId);
      mock.simulate.setStatus(pa.paymentId, 'contestado');
      expect((await json(await hook(pa.paymentId))).outcome).toBe('ignorado');
      expect((await order(pa.orderId)).status).toBe('pago_sem_estoque');
      expect((await audit('pagamento.estorno_fora_de_fluxo')).length).toBe(1);
      expect(await ticketsOf(pa.orderId)).toHaveLength(0);
    });

    it('depois do estorno o estoque continua consumido (D-14) e a venda não reabre sozinha', async () => {
      const e = await event([{ total: 2 }]);
      const [a, b] = await Promise.all([user(), user()]);
      const p = await pay(a, e, [2]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      await hook(p.paymentId);
      mock.simulate.setStatus(p.paymentId, 'estornado');
      await hook(p.paymentId);
      expect(await sold(e.types[0]!)).toBe(2);
      const again = await b.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: e.slug, items: [{ ticketTypeId: e.types[0]!, quantity: 1 }] });
      expect([409, 422]).toContain(again.status);
    });

    it('recusa devolve o estoque, estorno não: a diferença está provada no banco', async () => {
      const e = await event([{ total: 2 }]);
      const [a, b] = await Promise.all([user(), user()]);
      const pa = await pay(a, e, [1]);
      mock.simulate.setStatus(pa.paymentId, 'recusado');
      await hook(pa.paymentId);
      const pb = await pay(b, e, [2]); // as duas unidades estão livres de novo
      mock.simulate.setStatus(pb.paymentId, 'aprovado');
      await hook(pb.paymentId);
      expect(await sold(e.types[0]!)).toBe(2);
    });

    it('a taxa mensal mantém os ingressos de pedidos estornados, contestados e cancelados (CA-29)', async () => {
      const e = await event();
      const [a, b, c, d] = await Promise.all([user(), user(), user(), user()]);
      const pa = await pay(a, e, [2]); // continua pago
      const pb = await pay(b, e, [3]); // estornado
      const pc = await pay(c, e, [1]); // contestado
      const pd = await pay(d, e, [2]); // ingresso cancelado pelo administrador
      for (const p of [pa, pb, pc, pd]) {
        mock.simulate.setStatus(p.paymentId, 'aprovado');
        await hook(p.paymentId);
      }
      const antes = await adminFee();
      expect(antes).toMatchObject({ units: 8, feeCents: 800 });
      mock.simulate.setStatus(pb.paymentId, 'estornado');
      await hook(pb.paymentId);
      mock.simulate.setStatus(pc.paymentId, 'contestado');
      await hook(pc.paymentId);
      await sql(
        "update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'teste' where order_id = $1",
        [pd.orderId],
      );
      const depois = await adminFee();
      expect(depois).toMatchObject({ units: 8, feeCents: 800 });
      const status = Object.fromEntries(depois.byCurrentStatus.map((r: any) => [r.label, r.units]));
      expect(Object.values(status).reduce((s: number, v: any) => s + v, 0)).toBe(8);
      // Mês seguinte: o estorno acontece depois da virada e não move a venda de mês.
      clock.set('2026-11-02T12:00:00Z');
      expect((await adminFee('2026-11')).units).toBe(0);
      expect((await adminFee('2026-10')).units).toBe(8);
    });
  });

  /** A conciliação só pega pedido conferido há mais de 60 s (relógio do banco). Envelhece o carimbo sem passar pelo gatilho. */
  const age = (orderId: string) =>
    sql(
      `set session_replication_role = replica; update orders set updated_at = now() - interval '10 minutes' where id = '${orderId}'; set session_replication_role = origin`,
    );
  const TOKEN = { authorization: 'Bearer token-do-scheduler' };
  const daily = (target = app) =>
    target.request('/api/internal/jobs/reconcile-payments', { method: 'POST', headers: TOKEN });
  /** Captura o que o servidor escreveu no log (stdout e stderr) durante `fn`. */
  async function logsOf(fn: () => Promise<unknown>) {
    const out = vi.spyOn(process.stdout, 'write');
    const err = vi.spyOn(process.stderr, 'write');
    try {
      await fn();
      return [...out.mock.calls, ...err.mock.calls].map(c => String(c[0])).join('');
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  }

  describe('conciliação sob demanda (Cloud Tasks): poucos minutos com a reserva ativa, tardias até 24 h', () => {
    let queue: MemoryTaskQueue;
    let qapp: ReturnType<typeof build>;
    const task = (
      orderId: string,
      attempt: number,
      headers: Record<string, string> = TOKEN,
      target = qapp,
      chargedAt?: string,
    ) =>
      target.request('/api/internal/tasks/reconcile-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ orderId, attempt, ...(chargedAt ? { chargedAt } : {}) }),
      });
    const run = async (orderId: string, attempt: number, chargedAt?: string) =>
      json(await task(orderId, attempt, TOKEN, qapp, chargedAt));
    /** Executa a última tarefa agendada na hora marcada (avança o relógio pela espera), como o Cloud Tasks faria. */
    const runNext = async () => {
      const t = queue.tasks.at(-1)!;
      clock.advance(t.delaySeconds * 1000);
      return run(t.orderId, t.attempt, t.chargedAt);
    };
    beforeEach(() => {
      queue = new MemoryTaskQueue();
      qapp = build(mock, { queue });
    });

    it('criar o pedido não agenda nada; criar a cobrança agenda a 1ª verificação para 1 minuto depois, só daquele pedido', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      const created = await a.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: e.slug, items: [{ ticketTypeId: e.types[0]!, quantity: 2 }] });
      expect(created.status).toBe(201);
      const id = (await json(created)).order.id as string;
      expect(queue.tasks).toEqual([]);
      const charged = clock.now().toISOString();
      expect((await a.post(`/orders/${id}/payment`, { method: 'pix' })).status).toBe(201);
      expect(queue.tasks).toEqual([{ orderId: id, attempt: 1, delaySeconds: 60, chargedAt: charged }]);
      // Repetir o pedido de pagamento (clique duplo) devolve a mesma cobrança e não agenda de novo.
      expect((await a.post(`/orders/${id}/payment`, { method: 'pix' })).status).toBe(201);
      expect(queue.tasks).toHaveLength(1);
    });

    it('a rota só aceita o token das rotinas: sem token, token errado e corpo inválido', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      const p = await pay(a, e, [1]);
      expect((await task(p.orderId, 1, {})).status).toBe(401);
      expect((await task(p.orderId, 1, { authorization: 'Bearer outro' })).status).toBe(401);
      expect((await task(p.orderId, 1, { cookie: 'x=1' })).status).toBe(401);
      for (const bad of [
        { orderId: 'nao-e-uuid', attempt: 1 },
        { orderId: p.orderId, attempt: 0 },
        { orderId: p.orderId, attempt: 12 }, // padrão: 4 iniciais + o limite + 6 tardias = 11
        { orderId: p.orderId, attempt: 1, chargedAt: 'ontem' },
        {},
      ]) {
        const res = await qapp.request('/api/internal/tasks/reconcile-order', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...TOKEN },
          body: JSON.stringify(bad),
        });
        expect(res.status, JSON.stringify(bad)).toBe(422);
      }
      const off = build(mock, { jobAuth: undefined });
      expect((await task(p.orderId, 1, TOKEN, off)).status).toBe(503);
      expect((await order(p.orderId)).status).toBe('pendente'); // nada foi tocado
    });

    it('webhook perdido: a 1ª tarefa (1 min) acha o pagamento aprovado, confirma, emite os ingressos e não reagenda', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      const p = await pay(a, e, [3]);
      mock.simulate.setStatus(p.paymentId, 'aprovado'); // nenhum webhook chegou
      expect(await runNext()).toMatchObject({ status: 'ok', outcome: 'conciliado' });
      expect((await order(p.orderId)).status).toBe('pago');
      expect(await ticketsOf(p.orderId)).toHaveLength(3);
      expect(await sold(e.types[0]!)).toBe(3);
      expect(queue.tasks.filter(t => t.attempt > 1)).toHaveLength(0);
    });

    it('cadência completa sem decisão do gateway: 1, 2, 4, 8 min, limite aos 12 min, tardias até 24 h; revisão manual só no fim', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      const start = clock.now().getTime();
      const p = await pay(a, e, [1]); // Pix criado, ninguém pagou, gateway segue "pendente"
      const seen: [number, number][] = [];
      let logged = '';
      for (let i = 0; i < 10; i++) {
        const t = queue.tasks.at(-1)!;
        logged += await logsOf(async () => expect(await runNext()).toMatchObject({ outcome: 'reagendado' }));
        seen.push([t.attempt, (clock.now().getTime() - start) / 1000]);
        if (t.attempt === 5) {
          // No limite (12 min) o pedido vence, mas NÃO vai para revisão: as tardias seguem verificando.
          expect((await order(p.orderId)).status).toBe('expirado');
          expect(await resvOf(p.orderId)).toEqual(['expirada']);
        }
      }
      expect(seen).toEqual([
        [1, 60],
        [2, 120],
        [3, 240],
        [4, 480],
        [5, 720],
        [6, 900],
        [7, 1800],
        [8, 3600],
        [9, 10800],
        [10, 28800],
      ]);
      expect(await audit('conciliacao.revisao_manual')).toHaveLength(0);
      expect(logged).not.toContain('conciliacao_revisao_manual');
      expect(queue.tasks.at(-1)).toMatchObject({ attempt: 11, delaySeconds: 86400 - 28800 });

      // Última tardia (24 h), gateway ainda sem estado conclusivo: agora sim, revisão manual (trilha e alerta), uma vez.
      const last = await logsOf(async () => expect(await runNext()).toMatchObject({ outcome: 'revisao_manual' }));
      expect((clock.now().getTime() - start) / 1000).toBe(86400);
      expect(last).toContain('"alert":"conciliacao_revisao_manual"');
      expect(queue.tasks).toHaveLength(11); // acabou: nada mais agendado
      const rows = await audit('conciliacao.revisao_manual');
      expect(rows).toHaveLength(1);
      expect(rows[0].entity_id).toBe(p.orderId);
      expect((await order(p.orderId)).status).toBe('expirado'); // nada foi inventado
    });

    it('gateway diz "expirado" numa tardia (estado conclusivo): encerra a sequência, sem revisão', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      const p = await pay(a, e, [1]);
      for (let i = 0; i < 5; i++) await runNext(); // até o limite
      mock.simulate.setStatus(p.paymentId, 'expirado');
      expect(await runNext()).toMatchObject({ outcome: 'conciliado' }); // 15 min
      expect(queue.tasks.at(-1)!.attempt).toBe(6); // nada novo depois dela
      expect(await audit('conciliacao.revisao_manual')).toHaveLength(0);
    });

    it('aprovação tardia achada por uma tarefa tardia (3 h): com estoque emite e encerra a sequência', async () => {
      const e = await event([{ total: 5 }]);
      const a = await user('cliente', qapp);
      const p = await pay(a, e, [2]);
      for (let i = 0; i < 8; i++) await runNext(); // até a de 1 h
      expect((await order(p.orderId)).status).toBe('expirado');
      mock.simulate.setStatus(p.paymentId, 'aprovado'); // aprovou tarde; o webhook se perdeu
      const t = queue.tasks.at(-1)!;
      expect(t.attempt).toBe(9);
      expect(await runNext()).toMatchObject({ outcome: 'conciliado' });
      expect((await order(p.orderId)).status).toBe('pago');
      expect(await ticketsOf(p.orderId)).toHaveLength(2);
      expect((await audit('pagamento.confirmado_tardio')).length).toBe(1);
      expect(queue.tasks.at(-1)).toBe(t); // nenhuma nova tarefa
    });

    it('pedido já em estado final: a tarefa encerra em silêncio (sem log, sem trava, sem agendar), em qualquer tentativa', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      const p = await pay(a, e, [1]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      await hook(p.paymentId, {}, qapp); // o webhook resolveu
      queue.tasks.length = 0;
      for (const attempt of [1, 5, 7, 11]) {
        const logged = await logsOf(async () => expect(await run(p.orderId, attempt)).toEqual({ status: 'ok', outcome: 'ja_resolvido' }));
        expect(logged, `tentativa ${attempt}`).toBe('');
      }
      expect(queue.tasks).toHaveLength(0);
      expect((await sql(`select count(*)::int as n from job_leases where name = $1`, [`reconcile-order:${p.orderId}`])).rows[0].n).toBe(0);
    });

    it('a cadência vem do ambiente: iniciais, margem e tardias configuradas', async () => {
      const custom = build(mock, {
        queue,
        env: {
          RECONCILE_TASK_OFFSETS_SECONDS: '30,90',
          RECONCILE_TASK_MARGIN_SECONDS: '0',
          RECONCILE_LATE_OFFSETS_SECONDS: '3600',
        },
      });
      const e = await event();
      const a = await user('cliente', custom);
      const p = await pay(a, e, [1]);
      expect(queue.tasks).toEqual([expect.objectContaining({ orderId: p.orderId, attempt: 1, delaySeconds: 30 })]);
      const chargedAt = queue.tasks[0]!.chargedAt;
      const step = async () => {
        const t = queue.tasks.at(-1)!;
        clock.advance(t.delaySeconds * 1000);
        return json(await task(p.orderId, t.attempt, TOKEN, custom, chargedAt));
      };
      await step();
      expect(queue.tasks.at(-1)).toMatchObject({ attempt: 2, delaySeconds: 60 });
      await step();
      expect(queue.tasks.at(-1)).toMatchObject({ attempt: 3, delaySeconds: 600 - 90 }); // limite: fim da reserva, margem zero
      await step();
      expect(queue.tasks.at(-1)).toMatchObject({ attempt: 4, delaySeconds: 3600 - 600 }); // única tardia
      expect(await step()).toMatchObject({ outcome: 'revisao_manual' });
      expect((await task(p.orderId, 5, TOKEN, custom)).status).toBe(422); // a tentativa 5 não existe nessa configuração
    });

    it('trava por pedido (job_leases): com outra verificação em andamento encerra sem tocar em nada; trava vencida é retomada e solta', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      const p = await pay(a, e, [1]);
      queue.tasks.length = 0;
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const name = `reconcile-order:${p.orderId}`;
      await sql(`insert into job_leases (name, holder, expires_at) values ($1, 'outra', now() + interval '1 minute')`, [name]);
      expect(await run(p.orderId, 2)).toMatchObject({ outcome: 'em_execucao' });
      expect((await order(p.orderId)).status).toBe('pendente');
      expect(queue.tasks).toHaveLength(0);
      await sql(`update job_leases set expires_at = now() - interval '1 second' where name = $1`, [name]); // a outra caiu
      expect(await run(p.orderId, 2)).toMatchObject({ outcome: 'conciliado' });
      expect((await order(p.orderId)).status).toBe('pago');
      expect((await sql(`select expires_at <= now() as free from job_leases where name = $1`, [name])).rows[0].free).toBe(true);
    });

    it('a mesma tarefa entregue duas vezes não duplica nada (idempotência)', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      const p = await pay(a, e, [2]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      expect(await run(p.orderId, 1)).toMatchObject({ outcome: 'conciliado' });
      expect(await run(p.orderId, 1)).toMatchObject({ outcome: 'ja_resolvido' });
      expect(await ticketsOf(p.orderId)).toHaveLength(2);
      const again = await Promise.all(Array.from({ length: 5 }, () => task(p.orderId, 1)));
      expect(again.every(r => r.status === 200)).toBe(true);
      expect(await ticketsOf(p.orderId)).toHaveLength(2);
    });

    it('seis tarefas simultâneas (iniciais e tardias) do mesmo pedido aprovado: um pedido pago, ingressos uma vez', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      const p = await pay(a, e, [3]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      const res = await Promise.all([1, 2, 5, 6, 9, 11].map(attempt => task(p.orderId, attempt)));
      expect(res.every(r => r.status === 200)).toBe(true);
      const outcomes = (await Promise.all(res.map(r => json(r)))).map(b => b.outcome);
      expect(outcomes.filter(o => o === 'conciliado').length).toBeGreaterThanOrEqual(1);
      expect(await ticketsOf(p.orderId)).toHaveLength(3);
      expect(await sold(e.types[0]!)).toBe(3);
      expect((await audit('pagamento.confirmado')).length).toBe(1);
    });

    it('recusado e expirado no gateway são aplicados pela tarefa e devolvem o estoque', async () => {
      const e = await event([{ total: 2 }]);
      const [a, b] = await Promise.all([user('cliente', qapp), user('cliente', qapp)]);
      const pa = await pay(a, e, [1]);
      mock.simulate.setStatus(pa.paymentId, 'recusado');
      expect(await run(pa.orderId, 1)).toMatchObject({ outcome: 'conciliado' });
      expect((await order(pa.orderId)).status).toBe('nao_concluido');
      const pb = await pay(b, e, [2]); // as duas unidades voltaram
      mock.simulate.setStatus(pb.paymentId, 'expirado');
      expect(await run(pb.orderId, 1)).toMatchObject({ outcome: 'expirado' });
      expect((await order(pb.orderId)).status).toBe('expirado');
      expect(await resvOf(pb.orderId)).toEqual(['expirada']);
    });

    it('tarefa antiga, de pedido sem cobrança: com reserva viva reagenda; com reserva vencida expira e libera o estoque', async () => {
      const e = await event([{ total: 1 }]);
      const a = await user('cliente', qapp);
      const created = await a.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: e.slug, items: [{ ticketTypeId: e.types[0]!, quantity: 1 }] });
      const id = (await json(created)).order.id as string;
      expect(await run(id, 1)).toMatchObject({ outcome: 'reagendado' }); // ainda dentro dos 10 min de reserva
      clock.advance(11 * 60_000);
      expect(await run(id, 2)).toMatchObject({ outcome: 'expirado' });
      expect((await order(id)).status).toBe('expirado');
      expect(await resvOf(id)).toEqual(['expirada']);
    });

    it('gateway fora do ar: 503 para o Cloud Tasks repetir, e a tentativa lógica NÃO é gasta', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      const p = await pay(a, e, [1]);
      queue.tasks.length = 0;
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      mock.simulate.failNext(new GatewayError('timeout'));
      expect((await task(p.orderId, 1)).status).toBe(503);
      expect(queue.tasks).toHaveLength(0);
      expect((await order(p.orderId)).status).toBe('pendente');
      expect(await run(p.orderId, 1)).toMatchObject({ outcome: 'conciliado' }); // a repetição do Cloud Tasks resolve
    });

    it('falha ao agendar na criação da cobrança: a cobrança sai normalmente e a rotina diária confirma depois', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      queue.failNext = true;
      const p = await pay(a, e, [2]);
      expect(queue.tasks).toHaveLength(0); // nenhuma verificação agendada
      mock.simulate.setStatus(p.paymentId, 'aprovado'); // e o webhook se perdeu
      clock.advance(3 * 3_600_000);
      await age(p.orderId);
      const res = await json(await daily(qapp));
      expect(res.summary.orders.outcomes).toMatchObject({ confirmado_tardio: 1 });
      expect((await order(p.orderId)).status).toBe('pago');
      expect(await ticketsOf(p.orderId)).toHaveLength(2);
    });

    it('falha ao agendar no meio da sequência: a tarefa avisa e a rotina diária pega o pedido (aprovação tardia sem estoque incluída)', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      const p = await pay(a, e, [1]);
      queue.failNext = true;
      const t = queue.tasks.at(-1)!;
      clock.advance(t.delaySeconds * 1000);
      const logged = await logsOf(async () =>
        expect(await run(p.orderId, 1, t.chargedAt)).toMatchObject({ outcome: 'sem_agendamento' }),
      );
      expect(logged).toContain('"alert":"fila_conciliacao_falhou"');
      expect(queue.tasks).toHaveLength(1); // a sequência parou
      clock.advance(5 * 3_600_000);
      await a.get(`/orders/${p.orderId}`); // vencido
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      await age(p.orderId);
      expect((await json(await daily(qapp))).summary.orders.checked).toBe(1);
      expect((await order(p.orderId)).status).toBe('pago');
    });

    it('pedido inexistente: encerra sem erro (a tarefa não fica reenfileirada para sempre)', async () => {
      expect(await run('00000000-0000-4000-8000-000000000000', 1)).toMatchObject({ outcome: 'sem_pedido' });
    });

    it('sem gateway configurado: responde "sem_gateway" e não agenda nada', async () => {
      const e = await event();
      const a = await user('cliente', qapp);
      const p = await pay(a, e, [1]);
      const noGateway = build(undefined, { queue });
      const res = await json(await task(p.orderId, 1, TOKEN, noGateway));
      expect(res.status).toBe('sem_gateway');
    });
  });

  describe('rotina diária (04:00): única agenda fixa, rede de segurança', () => {
    it('não existe mais varredura de 5 min: a rota antiga responde 404', async () => {
      const res = await app.request('/api/internal/jobs/reconcile-pending', { method: 'POST', headers: TOKEN });
      expect(res.status).toBe(404);
    });

    it('trava: com outra rotina em andamento responde "em_execucao" sem tocar em nada; trava vencida é retomada e solta no fim', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [1]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      await age(p.orderId);
      await sql(
        `insert into job_leases (name, holder, expires_at) values ('reconcile-daily', 'outra-execucao', now() + interval '2 minutes')`,
      );
      expect(await json(await daily())).toEqual({ status: 'em_execucao' });
      expect((await order(p.orderId)).status).toBe('pendente');
      await sql(`update job_leases set expires_at = now() - interval '1 second' where name = 'reconcile-daily'`);
      expect((await json(await daily())).status).toBe('ok');
      expect((await order(p.orderId)).status).toBe('pago');
      const lease = (await sql(`select expires_at <= now() as free from job_leases where name = 'reconcile-daily'`)).rows[0];
      expect(lease.free).toBe(true);
    });

    it('limpa as travas de pedido vencidas há mais de 2 dias e mantém as recentes', async () => {
      await sql(`insert into job_leases (name, holder, expires_at) values
        ('reconcile-order:antiga', 'x', now() - interval '3 days'),
        ('reconcile-order:recente', 'x', now() - interval '1 hour')`);
      const res = await json(await daily());
      expect(res.leases).toBe(1);
      const names = (await sql(`select name from job_leases order by name`)).rows.map(r => r.name);
      expect(names).toContain('reconcile-order:recente');
      expect(names).not.toContain('reconcile-order:antiga');
    });

    it('rotinas simultâneas: todas respondem 200 e nada se duplica', async () => {
      const e = await event();
      const buyers = [await user(), await user(), await user()];
      const paid = [];
      for (const b of buyers) paid.push(await pay(b, e, [2]));
      for (const p of paid) {
        mock.simulate.setStatus(p.paymentId, 'aprovado');
        await age(p.orderId);
      }
      const res = await Promise.all(Array.from({ length: 5 }, () => daily()));
      expect(res.every(r => r.status === 200)).toBe(true);
      expect(await sold(e.types[0]!)).toBe(6);
      expect((await sql('select count(*)::int as n from tickets')).rows[0].n).toBe(6);
      expect((await audit('pagamento.confirmado')).length).toBe(3);
    });
  });

  describe('pago sem estoque: aviso, painel, comprador e taxa (D-13 e D-54 pendentes: mínimo e reversível)', () => {
    /** A paga tarde, com tudo vendido para B. Devolve os dois pedidos. */
    async function paidWithoutStock(target = app) {
      const e = await event([{ total: 2, price: 9000 }]);
      const a = await user('cliente', target);
      const b = await user('cliente', target);
      const pa = await pay(a, e, [2]);
      clock.advance(11 * 60_000);
      const pb = await pay(b, e, [2]);
      mock.simulate.setStatus(pb.paymentId, 'aprovado');
      await hook(pb.paymentId, {}, target);
      mock.simulate.setStatus(pa.paymentId, 'aprovado');
      return { e, a, pa, pb };
    }
    const emailRows = async (orderId: string) =>
      (
        await sql(
          `select e.user_id, e.status, u.email from email_log e join users u on u.id = e.user_id
            where e.template = 'pagamento_sem_estoque' and e.order_id = $1 order by u.email`,
          [orderId],
        )
      ).rows;

    it('enfileira um e-mail para cada administrador ativo, uma vez, com pedido, comprador, valor, referência e orientação; sem CPF', async () => {
      const adm1 = await user('administrador');
      const adm2 = await user('administrador');
      const inactive = await user('administrador');
      await user('validador');
      const inactiveEmail = (await json(await inactive.get('/auth/me'))).user.email as string;
      await sql('update users set is_active = false where email = $1', [inactiveEmail]);
      const { pa } = await paidWithoutStock();

      expect((await json(await hook(pa.paymentId))).outcome).toBe('sem_estoque');
      await hook(pa.paymentId); // notificação repetida
      const rows = await emailRows(pa.orderId);
      const adminEmails = [
        (await json(await adm1.get('/auth/me'))).user.email,
        (await json(await adm2.get('/auth/me'))).user.email,
      ].sort();
      expect(rows.map(r => r.email)).toEqual(adminEmails); // nem o inativo nem o validador
      expect(rows.every(r => r.status === 'enviado')).toBe(true); // entregue logo, pela fila

      const sent = mailer.sent.filter(m => m.template === 'pagamento_sem_estoque');
      expect(sent.map(m => m.to).sort()).toEqual(adminEmails);
      const msg = sent[0]!;
      const number = (await sql('select number, total_cents from orders where id = $1', [pa.orderId])).rows[0];
      const buyer = (await sql('select u.name, u.email, u.cpf from users u join orders o on o.user_id = u.id where o.id = $1', [pa.orderId])).rows[0];
      expect(msg.subject).toContain('Pagamento recebido sem ingresso disponível');
      expect(msg.subject).toContain(`PX-${number.number}`);
      for (const piece of [
        `PX-${number.number}`,
        buyer.name,
        buyer.email,
        'R$\u00a0180,00', // Intl usa espaço não separável depois do símbolo
        pa.paymentId,
        'o estorno deve ser feito pela PartyX no painel do gateway',
        'A plataforma não estorna automaticamente',
        '/admin/excecoes',
      ])
        expect(msg.text, piece).toContain(piece);
      expect(msg.text).not.toContain(buyer.cpf);
      expect(msg.html).not.toContain(buyer.cpf);
      expect(msg.text).not.toMatch(/—/);
      expect(msg.data).toEqual({ orderNumber: `PX-${number.number}` }); // metadados sem dado do comprador
    });

    it('uma tarefa tardia (3 h) também detecta o caso com o webhook perdido e avisa os administradores', async () => {
      await user('administrador');
      const { pa } = await paidWithoutStock();
      const charged = new Date(clock.now().getTime() - 11 * 60_000).toISOString(); // a cobrança de A foi criada antes de B
      clock.advance(3 * 3_600_000);
      const res = await app.request('/api/internal/tasks/reconcile-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...TOKEN },
        body: JSON.stringify({ orderId: pa.orderId, attempt: 9, chargedAt: charged }),
      });
      expect(await json(res)).toMatchObject({ outcome: 'conciliado' });
      expect((await order(pa.orderId)).status).toBe('pago_sem_estoque');
      expect(await ticketsOf(pa.orderId)).toEqual([]);
      expect(await emailRows(pa.orderId)).toHaveLength(1);
    });

    it('nenhum estorno automático: o pedido fica pago sem estoque, sem ingresso, e o gateway não é chamado para devolver nada', async () => {
      const { pa } = await paidWithoutStock();
      await hook(pa.paymentId);
      expect((await order(pa.orderId)).status).toBe('pago_sem_estoque');
      expect(await ticketsOf(pa.orderId)).toEqual([]);
      // Continua aprovado no gateway: a plataforma não tem (nem chama) operação de estorno; o estorno é da PartyX no gateway.
      expect(mock.simulate.all().find(x => x.gatewayPaymentId === pa.paymentId)?.status).toBe('aprovado');
    });

    it('painel: alerta com contador; marcar como tratado exige motivo, grava na trilha, não muda o pedido e baixa o contador', async () => {
      const admin = await user('administrador');
      const { pa, a } = await paidWithoutStock();
      await hook(pa.paymentId);

      const before = await json(await admin.get('/admin/overview'));
      expect(before.attention).toEqual({ paidWithoutStock: 1, paidWithoutStockTreated: 0 });
      const list = await json(await admin.get('/admin/payments/exceptions'));
      expect(list.abertos).toBe(1);
      expect(list.semEstoque[0]).toMatchObject({
        orderId: pa.orderId,
        gatewayRef: pa.paymentId,
        totalCents: 18000,
        treated: null,
      });
      expect(list.semEstoque[0].buyerCpf).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);

      const treat = (s: Session, id: string, reason: unknown) =>
        s.post(`/admin/payments/exceptions/${id}/treat`, { reason });
      expect((await treat(admin, pa.orderId, '  ')).status).toBe(422);
      expect((await treat(admin, pa.orderId, 'ok')).status).toBe(422);
      expect((await treat(admin, pa.orderId, 'x'.repeat(601))).status).toBe(422);
      expect((await treat(a, pa.orderId, 'Estornado no gateway')).status).toBe(403); // comprador não
      expect((await treat(admin, 'nao-e-uuid', 'Estornado no gateway')).status).toBe(404);
      const anon = await app.request(`/api/admin/payments/exceptions/${pa.orderId}/treat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ reason: 'Estornado no gateway' }),
      });
      expect(anon.status).toBe(401);
      expect(await audit('pagamento.sem_estoque_tratado')).toHaveLength(0);

      const ok = await treat(admin, pa.orderId, '  Estornado no gateway em 10/10,   protocolo 123  ');
      expect(ok.status).toBe(200);
      const trail = (
        await sql(`select actor_id, reason, before_json, after_json from audit_log where action = 'pagamento.sem_estoque_tratado'`)
      ).rows;
      expect(trail).toHaveLength(1);
      expect(trail[0].actor_id).toBeTruthy();
      expect(trail[0].reason).toBe('Estornado no gateway em 10/10, protocolo 123');
      expect(trail[0].after_json).toMatchObject({ tratado: true, status: 'pago_sem_estoque' });
      expect((await order(pa.orderId)).status).toBe('pago_sem_estoque'); // reversível: nada além da marcação
      expect(await ticketsOf(pa.orderId)).toEqual([]);

      expect((await treat(admin, pa.orderId, 'De novo, por engano')).status).toBe(409);
      expect(await audit('pagamento.sem_estoque_tratado')).toHaveLength(1);
      const after = await json(await admin.get('/admin/overview'));
      expect(after.attention).toEqual({ paidWithoutStock: 0, paidWithoutStockTreated: 1 });
      const list2 = await json(await admin.get('/admin/payments/exceptions'));
      expect(list2.abertos).toBe(0);
      expect(list2.semEstoque[0].treated).toMatchObject({ reason: 'Estornado no gateway em 10/10, protocolo 123' });
    });

    it('só pedido em "pago sem estoque" pode ser marcado; dois administradores ao mesmo tempo gravam uma marcação só', async () => {
      const [admin1, admin2] = [await user('administrador'), await user('administrador')];
      const { pa, pb } = await paidWithoutStock();
      await hook(pa.paymentId);
      expect((await admin1.post(`/admin/payments/exceptions/${pb.orderId}/treat`, { reason: 'Pedido pago normal' })).status).toBe(409);
      const both = await Promise.all(
        [admin1, admin2].map(s => s.post(`/admin/payments/exceptions/${pa.orderId}/treat`, { reason: 'Estornado no gateway' })),
      );
      expect(both.map(r => r.status).sort()).toEqual([200, 409]);
      expect(await audit('pagamento.sem_estoque_tratado')).toHaveLength(1);
    });

    it('comprador: com o contato da PartyX configurado, vê e-mail e WhatsApp; sem configuração, nenhum contato; pedido normal, nunca', async () => {
      const configured = build(mock, {
        env: { PARTYX_SUPPORT_EMAIL: 'atendimento@partyx.example', PARTYX_SUPPORT_WHATSAPP: '+55 11 91234-5678' },
      });
      const one = await paidWithoutStock(configured);
      await hook(one.pa.paymentId, {}, configured);
      const seen = (await json(await one.a.get(`/orders/${one.pa.orderId}`))).order;
      expect(seen.status).toBe('pago_sem_estoque');
      expect(seen.support).toEqual({ email: 'atendimento@partyx.example', whatsapp: '+55 11 91234-5678' });
      const buyerB = (await sql('select user_id from orders where id = $1', [one.pb.orderId])).rows[0].user_id;
      expect(buyerB).toBeTruthy();

      // Sem configuração (o padrão): o servidor não manda contato nenhum; a tela mostra a mensagem neutra, sem prazo.
      const two = await paidWithoutStock(app);
      await hook(two.pa.paymentId);
      const plain = (await json(await two.a.get(`/orders/${two.pa.orderId}`))).order;
      expect(plain.status).toBe('pago_sem_estoque');
      expect(plain.support).toBeNull();
    });

    it('comprador de pedido pago normalmente nunca recebe contato, mesmo configurado', async () => {
      const configured = build(mock, { env: { PARTYX_SUPPORT_EMAIL: 'atendimento@partyx.example' } });
      const e = await event();
      const a = await user('cliente', configured);
      const p = await pay(a, e, [1]);
      mock.simulate.setStatus(p.paymentId, 'aprovado');
      await hook(p.paymentId, {}, configured);
      const seen = (await json(await a.get(`/orders/${p.orderId}`))).order;
      expect(seen.status).toBe('pago');
      expect(seen.support).toBeNull();
    });

    it('taxa (D-54): a fórmula não muda; o caso aparece à parte em "Exceções para análise", com valor, referência e situação', async () => {
      const admin = await user('administrador');
      const { pa, pb } = await paidWithoutStock();
      await hook(pa.paymentId);
      const fee = async () => json(await admin.get('/admin/reports/fee?month=2026-10'));
      const r = await fee();
      expect(r.units).toBe(2); // só os ingressos de B
      expect(r.feeCents).toBe(2 * 100); // 10/10/2026: regra original, R$ 1,00 por ingresso de qualquer forma
      expect(r.exceptions.title).toBe('Exceções para análise');
      expect(r.exceptions.paidWithoutStock).toEqual([
        expect.objectContaining({ orderId: pa.orderId, units: 2, totalCents: 18000, gatewayRef: pa.paymentId, treated: false }),
      ]);
      expect(r.exceptions.totals).toEqual({ orders: 1, units: 2, cents: 18000, open: 1 });
      expect(r.reconciliation.ok).toBe(true);
      await admin.post(`/admin/payments/exceptions/${pa.orderId}/treat`, { reason: 'Estornado no gateway' });
      const r2 = await fee();
      expect(r2.units).toBe(2); // marcar como tratado não mexe na taxa
      expect(r2.exceptions.paidWithoutStock[0].treated).toBe(true);
      expect(r2.exceptions.totals.open).toBe(0);
      expect(pb.orderId).toBeTruthy();
    });
  });

  describe('casos de borda', () => {
    it('pagamento desconhecido: registra o evento como processado com o motivo, sem erro', async () => {
      const res = await hook('pagamento-que-nao-existe', { eventId: 'evt-orfao' });
      expect([res.status, (await json(res)).outcome]).toEqual([200, 'sem_pedido']);
      expect(
        (await sql("select processing_error, processed_at from payment_events where gateway_event_id = 'evt-orfao'"))
          .rows[0],
      ).toMatchObject({ processing_error: 'sem_pedido' });
    });

    it('notificação com corpo sem os campos esperados é recusada como inválida, mesmo assinada', async () => {
      const raw = '{"id":"x"}';
      const res = await app.request('/api/webhooks/payments', {
        method: 'POST',
        headers: { 'x-mock-signature': mock.simulate.sign(raw) },
        body: raw,
      });
      expect(res.status).toBe(401);
    });

    it('o estoque nunca passa da capacidade depois de uma rajada de confirmações', async () => {
      const e = await event([{ total: 4 }]);
      const buyers = await Promise.all(Array.from({ length: 4 }, () => user()));
      const paid = [];
      for (const b of buyers) paid.push(await pay(b, e, [1]));
      for (const p of paid) mock.simulate.setStatus(p.paymentId, 'aprovado');
      await Promise.all(paid.flatMap(p => [hook(p.paymentId), hook(p.paymentId)]));
      expect(await sold(e.types[0]!)).toBe(4);
      expect((await sql('select count(*)::int as n from tickets')).rows[0].n).toBe(4);
      expect((await sql("select count(*)::int as n from orders where status = 'pago'")).rows[0].n).toBe(4);
    });
  });

  describe('simulação local (só local e só com o fictício)', () => {
    it('com o fictício em ambiente local, leva o pedido a "pago" pelo mesmo caminho do webhook', async () => {
      const local = build(mock, { env: { PAYMENT_GATEWAY: 'mock' } });
      const e = await event();
      const a = await user('cliente', local);
      const p = await pay(a, e, [2]);
      const res = await local.request(`/api/dev/mock-gateway/${p.orderId}/aprovado`, { method: 'POST' });
      expect([res.status, (await json(res)).outcome]).toEqual([200, 'confirmado']);
      expect((await order(p.orderId)).status).toBe('pago');
      expect((await sql('select count(*)::int as n from payment_events where signature_valid')).rows[0].n).toBe(1);
    });

    it('sem PAYMENT_GATEWAY=mock, ou fora do local, a rota não existe', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e);
      expect((await app.request(`/api/dev/mock-gateway/${p.orderId}/aprovado`, { method: 'POST' })).status).toBe(404);
      const hml = createApp({
        config: loadConfig({
          APP_ENV: 'homologacao',
          DATABASE_URL: 'postgres://x',
          SESSION_SECRET: 's'.repeat(40),
          QR_HMAC_KEYS: `1:${randomBytes(32).toString('base64url')}`,
        }),
        clock,
        auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender(), gateway: mock },
      });
      expect((await hml.request(`/api/dev/mock-gateway/${p.orderId}/aprovado`, { method: 'POST' })).status).toBe(404);
      expect((await order(p.orderId)).status).toBe('pendente');
    });
  });
});

describe.skipIf(!ADMIN_URL)('simulador de homologação (gateway fictício atrás de administrador)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  let hash = '';
  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    hash = await argon2Hasher.hash(PASSWORD);
  });
  afterAll(async () => {
    await testDb?.drop();
  });

  const appFor = (env: Record<string, string>) => {
    const config = loadConfig({
      PAYMENT_GATEWAY: 'mock',
      DATABASE_URL: 'postgres://x',
      SESSION_SECRET: 's'.repeat(40),
      QR_HMAC_KEYS: `1:${randomBytes(32).toString('base64url')}`,
      ...env,
    });
    const mock = createMockGateway(clock);
    return createApp({
      config,
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender(), gateway: mock },
    });
  };
  const login = async (app: ReturnType<typeof appFor>, role: 'cliente' | 'administrador', n: number) => {
    const email = `${role}${n}@sim.partyx.test`;
    await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5) on conflict do nothing', [`P ${n}`, email, role === 'cliente' ? String(30000000000 + n) : null, hash, role]);
    const raw = (m: string, p: string, b?: unknown, h: Record<string, string> = {}) =>
      app.request(`/api${p}`, { method: m, headers: { origin: 'http://localhost', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...h }, body: b === undefined ? undefined : JSON.stringify(b) });
    const res = await raw('POST', '/auth/login', { email, password: PASSWORD });
    const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
    const csrf = ((await (await raw('GET', '/auth/me', undefined, { cookie })).json()) as { csrfToken: string }).csrfToken;
    return (m: string, p: string, b?: unknown) => raw(m, p, b, { cookie, 'x-csrf-token': csrf });
  };

  it('com a variável, em homologação: só o administrador usa; cliente 403, anônimo 401; devolve o webhook assinado', async () => {
    const app = appFor({ APP_ENV: 'homologacao', HOMOLOGACAO_GATEWAY_FICTICIO: 'true' });
    const id = '00000000-0000-4000-8000-000000000000';
    const anon = await app.request(`/api/admin/dev/mock-gateway/${id}/aprovado`, { method: 'POST', headers: { origin: 'http://localhost' } });
    expect(anon.status).toBe(401);
    const cliente = await login(app, 'cliente', 1);
    expect((await cliente('POST', `/admin/dev/mock-gateway/${id}/aprovado`)).status).toBe(403);
    const admin = await login(app, 'administrador', 1);
    expect((await admin('POST', `/admin/dev/mock-gateway/${id}/aprovado`)).status).toBe(404); // pedido sem cobrança
    expect((await admin('POST', `/admin/dev/mock-gateway/${id}/inexistente`)).status).toBe(422);
  });

  it('sem a variável, ou fora de homologação, a rota NÃO EXISTE (404), mesmo para administrador', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const envs: Record<string, string>[] = [{ APP_ENV: 'local' }, { APP_ENV: 'homologacao', PAYMENT_GATEWAY: 'none' }, { APP_ENV: 'homologacao', HOMOLOGACAO_GATEWAY_FICTICIO: 'false', PAYMENT_GATEWAY: 'none' }];
    for (const env of envs) {
      const app = appFor(env);
      const admin = await login(app, 'administrador', 2);
      expect((await admin('POST', `/admin/dev/mock-gateway/${id}/aprovado`)).status, JSON.stringify(env)).toBe(404);
    }
  });

  it('a rota pública /dev/mock-gateway (sem login) continua existindo só no local', async () => {
    const hml = appFor({ APP_ENV: 'homologacao', HOMOLOGACAO_GATEWAY_FICTICIO: 'true' });
    expect((await hml.request('/api/dev/mock-gateway/x/aprovado', { method: 'POST', headers: { origin: 'http://localhost' } })).status).toBe(404);
  });
});
