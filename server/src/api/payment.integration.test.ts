import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { GatewayError, GatewayRejectedError, type PaymentGateway } from '../payments/gateway';
import { createMockGateway, type MockGateway } from '../payments/mockGateway';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';
const PAN = '4111111111111111';

describe.skipIf(!ADMIN_URL)('pagamento: checkout e contrato do gateway (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  let mock: MockGateway;
  let hash = '';
  let n = 0;

  const build = (gateway: PaymentGateway | undefined) =>
    createApp({
      config: loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none', RESERVATION_MINUTES: '10' }),
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender(), gateway },
    });
  let app: ReturnType<typeof build>;

  async function user(role: 'cliente' | 'validador' = 'cliente', target = app) {
    const i = ++n;
    const email = `${role}${i}@partyx.test`;
    await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5)', [
      `Pessoa ${i} Teste`,
      email,
      role === 'cliente' ? '12345678909'.slice(0, 11 - String(i).length) + String(i) : null,
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
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
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
  /** Compra do cliente: cria o pedido pendente com reserva. */
  async function pendingOrder(s: Session, e: Awaited<ReturnType<typeof event>>, qty: [number, number?] = [2]) {
    const items = e.types.slice(0, qty.length).map((t, i) => ({ ticketTypeId: t, quantity: qty[i]! }));
    const res = await s.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: e.slug, items });
    expect(res.status).toBe(201);
    return (await json(res)).order as { id: string; totalCents: number; reservation: { expiresAt: string } };
  }
  const code = async (res: Response) => (await json(res)).erro.codigo as string;
  const row = async (orderId: string) =>
    (
      await sql('select status, payment_method, gateway_payment_id, paid_at, total_cents from orders where id = $1', [
        orderId,
      ])
    ).rows[0];

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    hash = await argon2Hasher.hash(PASSWORD);
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql(
      'truncate reservations, order_items, orders, ticket_types, events, promoters, sessions, login_attempts, users cascade',
    );
    clock.set('2026-10-10T15:00:00Z');
    mock = createMockGateway(clock);
    app = build(mock);
  });

  describe('Pix (RF-34)', () => {
    it('cria a cobrança com valor, referência e prazo vindos do pedido, e deixa o pedido pendente', async () => {
      const e = await event([{ price: 8000 }, { price: 15050 }]);
      const a = await user();
      const order = await pendingOrder(a, e, [2, 1]);
      const res = await a.post(`/orders/${order.id}/payment`, { method: 'pix' });
      expect(res.status).toBe(201);
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      const { payment } = await json(res);
      expect(payment).toMatchObject({ method: 'pix', status: 'pendente', redirectUrl: null });
      expect(payment.pix.copyPaste.length).toBeGreaterThan(20);
      // Expira junto com a reserva.
      expect(payment.pix.expiresAt).toBe(order.reservation.expiresAt);

      // O gateway recebeu o valor do banco (2 x 80,00 + 150,50), a referência do pedido e nenhum id interno a mais.
      const [charge] = mock.simulate.all();
      expect(charge).toMatchObject({ amountCents: 31050, orderRef: order.id, currency: 'BRL', method: 'pix' });
      expect(await row(order.id)).toMatchObject({
        status: 'pendente',
        payment_method: 'pix',
        gateway_payment_id: charge!.gatewayPaymentId,
        paid_at: null,
      });
      // A resposta não vaza o id do gateway nem a conta.
      expect(JSON.stringify(payment)).not.toContain(charge!.gatewayPaymentId);
      expect(JSON.stringify(payment)).not.toMatch(/conta-ficticia|accountId/);
    });

    it('repetir ou enviar várias vezes ao mesmo tempo gera uma cobrança só', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      const res = await Promise.all(
        Array.from({ length: 6 }, () => a.post(`/orders/${order.id}/payment`, { method: 'pix' })),
      );
      for (const r of res) expect(r.status).toBe(201);
      expect(mock.simulate.all()).toHaveLength(1);
      const codes = new Set((await Promise.all(res.map(r => json(r)))).map(b => b.payment.pix.copyPaste));
      expect(codes.size).toBe(1);
      expect((await row(order.id)).gateway_payment_id).toBe(mock.simulate.all()[0]!.gatewayPaymentId);
    });

    it('o prazo respeita o limite do provedor: nunca além do que ele aceita (D-03)', async () => {
      const short: PaymentGateway = Object.assign(Object.create(mock), {
        capabilities: { ...mock.capabilities, pixExpiry: { minSeconds: 30, maxSeconds: 120 } },
      });
      const custom = build(short);
      const e = await event();
      const a = await user('cliente', custom);
      const order = await pendingOrder(a, e);
      const { payment } = await json(await a.post(`/orders/${order.id}/payment`, { method: 'pix' }));
      expect(payment.pix.expiresAt).toBe('2026-10-10T15:02:00.000Z'); // 120 s, e não os 10 min da reserva
    });

    it('recarregar a página mostra o mesmo Pix e o estado atual, e consultar nunca aprova o pedido', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      const first = (await json(await a.post(`/orders/${order.id}/payment`, { method: 'pix' }))).payment;
      const again = (await json(await a.get(`/orders/${order.id}/payment`))).payment;
      expect(again.pix.copyPaste).toBe(first.pix.copyPaste);
      // O gateway diz que foi pago. A leitura mostra isso, mas o pedido só muda no fluxo de confirmação do servidor (Prompt 12).
      mock.simulate.setStatus(mock.simulate.all()[0]!.gatewayPaymentId, 'aprovado');
      expect((await json(await a.get(`/orders/${order.id}/payment`))).payment.status).toBe('aprovado');
      expect(await row(order.id)).toMatchObject({ status: 'pendente', paid_at: null });
      expect((await sql('select count(*)::int as n from tickets')).rows[0].n).toBe(0);
    });
  });

  describe('cartão sem dados sensíveis no servidor', () => {
    it('cartão hospedado: devolve para onde levar o comprador, sem pedir nada do cartão', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      const res = await a.post(`/orders/${order.id}/payment`, { method: 'cartao' });
      expect(res.status).toBe(201);
      const { payment } = await json(res);
      expect(payment).toMatchObject({ method: 'cartao', status: 'pendente', pix: null });
      expect(payment.redirectUrl).toMatch(/^https:\/\//);
      expect(await row(order.id)).toMatchObject({ payment_method: 'cartao', status: 'pendente', paid_at: null });
    });

    it('recusa número, validade, CVV e titular, no corpo ou colados num campo qualquer, sem repetir o valor', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      const bodies = [
        { method: 'cartao', number: PAN },
        { method: 'cartao', cardNumber: PAN, cvv: '123' },
        { method: 'cartao', card: { holderName: 'ANA TESTE', expiry: '12/30' } },
        { method: 'cartao', cvc: '123' },
        { method: 'cartao', cardToken: PAN },
        { method: 'cartao', cardToken: '4111 1111 1111 1111' },
        { method: 'cartao', extra: [{ x: PAN }] },
      ];
      for (const body of bodies) {
        const res = await a.post(`/orders/${order.id}/payment`, body);
        const text = await res.text();
        expect([res.status, JSON.parse(text).erro.codigo], JSON.stringify(body)).toEqual([
          422,
          'dado_de_cartao_nao_aceito',
        ]);
        expect(text).not.toContain(PAN);
        expect(text).not.toContain('4111');
      }
      expect(mock.simulate.createCalls).toBe(0); // nada chegou ao gateway
      expect(await row(order.id)).toMatchObject({ payment_method: null, gateway_payment_id: null });
    });

    it('PAN e CVV nunca aparecem em log, nem quando recusados', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      const out = vi.spyOn(process.stdout, 'write');
      const err = vi.spyOn(process.stderr, 'write');
      try {
        await a.post(`/orders/${order.id}/payment`, { method: 'cartao', cardToken: PAN, cvv: '987' });
        await a.post(`/orders/${order.id}/payment`, { method: 'cartao', number: PAN, cvv: '987' });
        const logged = [...out.mock.calls, ...err.mock.calls].map(c => String(c[0])).join('\n');
        expect(logged).not.toContain(PAN);
        expect(logged).not.toContain('987');
      } finally {
        out.mockRestore();
        err.mockRestore();
      }
    });

    it('parcelamento indisponível enquanto o cliente e o gateway não aprovarem (D-02)', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      for (const installments of [2, 12, 0, -1, 1.5]) {
        const res = await a.post(`/orders/${order.id}/payment`, { method: 'cartao', installments });
        expect([res.status, await code(res)], String(installments)).toEqual([422, 'parcelamento_indisponivel']);
      }
      expect((await a.post(`/orders/${order.id}/payment`, { method: 'cartao', installments: 1 })).status).toBe(201);
    });

    it('com gateway que usa token, exige o token e repassa só ele', async () => {
      const tokenMode: PaymentGateway = Object.assign(Object.create(mock), {
        capabilities: { ...mock.capabilities, cardMode: 'token' },
      });
      const a = await user('cliente', build(tokenMode));
      const e = await event();
      const order = await pendingOrder(a, e);
      const missing = await a.post(`/orders/${order.id}/payment`, { method: 'cartao' });
      expect([missing.status, await code(missing)]).toEqual([422, 'dados_invalidos']);
      // Só o token não basta: o componente do gateway também informa a bandeira e o tipo (crédito ou débito).
      const noBrand = await a.post(`/orders/${order.id}/payment`, { method: 'cartao', cardToken: 'tok_abcdef123456' });
      expect([noBrand.status, await code(noBrand)]).toEqual([422, 'dados_invalidos']);
      expect(await row(order.id)).toMatchObject({ payment_method: null });
      expect(
        (
          await a.post(`/orders/${order.id}/payment`, {
            method: 'cartao',
            cardToken: 'tok_abcdef123456',
            paymentMethodId: 'master',
            paymentTypeId: 'credit_card',
          })
        ).status,
      ).toBe(201);
    });
  });

  describe('o navegador nunca aprova nem emite ingresso', () => {
    it('não existe rota de cliente para confirmar pagamento ou emitir ingresso', () => {
      // Ficam de fora o painel do administrador e as entradas de máquina (webhook autenticado por assinatura e rotinas do Scheduler,
      // testadas à parte): aqui interessa o que o comprador, pelo navegador, consegue alcançar.
      const paths = app.routes
        .filter(
          r =>
            r.path.startsWith('/api') &&
            !r.path.startsWith('/api/admin') &&
            !r.path.startsWith('/api/webhooks/') &&
            !r.path.startsWith('/api/internal/'),
        )
        .map(r => `${r.method} ${r.path}`);
      // Leituras (GET) de ingressos e pedidos são legítimas; nada que ESCREVA pode confirmar, aprovar ou emitir. A transferência
      // (D-87) e o aceite do Termo de Ciência de quem recebeu mexem num ingresso já emitido e pago: não aprovam nem emitem nada.
      const transfer = /^POST \/api\/tickets\/:id\/(transfer|transfer\/preview|termo-menor)$/;
      expect(
        paths.filter(
          p =>
            !p.startsWith('GET ') &&
            !transfer.test(p) &&
            /confirm|aprov|approve|paid|pago|issue|emit|ticket|webhook/i.test(p),
        ),
      ).toEqual([]);
    });

    it('campos de status, valor, método do gateway ou id enviados no corpo são ignorados ou recusados', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      const bad = await a.post(`/orders/${order.id}/payment`, { method: 'pix', status: 'pago' });
      // Corpo com campos a mais: o servidor lê só o método.
      expect(bad.status).toBe(201);
      const after = await row(order.id);
      expect(after).toMatchObject({ status: 'pendente', paid_at: null, total_cents: order.totalCents });
      expect((await a.post(`/orders/${order.id}/payment`, { method: 'aprovado' })).status).toBe(422);
      expect((await a.post(`/orders/${order.id}/payment`, { status: 'pago' })).status).toBe(422);
      expect(mock.simulate.all()[0]!.amountCents).toBe(order.totalCents);
    });

    it('nenhuma resposta do fluxo coloca o pedido como pago', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      await a.post(`/orders/${order.id}/payment`, { method: 'pix' });
      for (let i = 0; i < 3; i++) {
        await a.get(`/orders/${order.id}`);
        await a.get(`/orders/${order.id}/payment`);
      }
      expect(await row(order.id)).toMatchObject({ status: 'pendente', paid_at: null });
      expect((await sql("select count(*)::int as n from orders where status = 'pago'")).rows[0].n).toBe(0);
    });
  });

  describe('forma de pagamento já escolhida', () => {
    it('não troca de Pix para cartão no mesmo pedido, e o pedido não pode ser cancelado depois (D-36)', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      await a.post(`/orders/${order.id}/payment`, { method: 'pix' });
      expect(await code(await a.post(`/orders/${order.id}/payment`, { method: 'cartao' }))).toBe('metodo_ja_escolhido');
      expect(await code(await a.post(`/orders/${order.id}/cancel`))).toBe('pagamento_iniciado');
      expect(mock.simulate.all()).toHaveLength(1);
    });
  });

  describe('falhas do gateway', () => {
    it('rede ou tempo esgotado: 503, o pedido volta a poder escolher, e repetir funciona sem duplicar', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      mock.simulate.failNext(new GatewayError('timeout'));
      const res = await a.post(`/orders/${order.id}/payment`, { method: 'pix' });
      expect([res.status, await code(res)]).toEqual([503, 'gateway_indisponivel']);
      expect(await row(order.id)).toMatchObject({ payment_method: null, gateway_payment_id: null, status: 'pendente' });
      // Pode escolher outra forma, já que nada foi criado.
      expect((await a.post(`/orders/${order.id}/payment`, { method: 'cartao' })).status).toBe(201);
    });

    it('depois da falha, repetir o mesmo método cria uma cobrança só', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      mock.simulate.failNext(new GatewayError('timeout'));
      expect((await a.post(`/orders/${order.id}/payment`, { method: 'pix' })).status).toBe(503);
      expect((await a.post(`/orders/${order.id}/payment`, { method: 'pix' })).status).toBe(201);
      expect((await a.post(`/orders/${order.id}/payment`, { method: 'pix' })).status).toBe(201);
      expect(mock.simulate.all()).toHaveLength(1);
    });

    it('recusa definitiva na criação: 422 e nada fica marcado', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      mock.simulate.failNext(new GatewayRejectedError('dados_invalidos'));
      const res = await a.post(`/orders/${order.id}/payment`, { method: 'pix' });
      expect([res.status, await code(res)]).toEqual([422, 'pagamento_nao_criado']);
      expect(await row(order.id)).toMatchObject({ payment_method: null, gateway_payment_id: null });
    });

    it('cobrança que não bate com o pedido (valor ou referência) nunca vira vínculo', async () => {
      const lying: PaymentGateway = Object.assign(Object.create(mock), {
        createPix: async (input: Parameters<PaymentGateway['createPix']>[0]) => {
          const c = await mock.createPix(input);
          return { ...c, snapshot: { ...c.snapshot, amountCents: c.snapshot.amountCents - 1 } };
        },
      });
      const a = await user('cliente', build(lying));
      const e = await event();
      const order = await pendingOrder(a, e);
      const res = await a.post(`/orders/${order.id}/payment`, { method: 'pix' });
      expect([res.status, await code(res)]).toEqual([503, 'gateway_indisponivel']);
      expect(await row(order.id)).toMatchObject({ payment_method: null, gateway_payment_id: null });
    });

    it('sem gateway configurado: 503 claro e o pedido segue intacto', async () => {
      const none = build(undefined);
      const a = await user('cliente', none);
      const e = await event();
      const order = await pendingOrder(a, e);
      const res = await a.post(`/orders/${order.id}/payment`, { method: 'pix' });
      expect([res.status, await code(res)]).toEqual([503, 'pagamento_indisponivel']);
      expect(await row(order.id)).toMatchObject({ payment_method: null, status: 'pendente' });
    });

    it('a consulta do gateway fora do ar responde 503 sem derrubar o pedido', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      await a.post(`/orders/${order.id}/payment`, { method: 'pix' });
      mock.simulate.failNext(new GatewayError('fora do ar'));
      expect((await a.get(`/orders/${order.id}/payment`)).status).toBe(503);
      expect((await a.get(`/orders/${order.id}`)).status).toBe(200);
    });
  });

  describe('estado do pedido e da reserva', () => {
    it('reserva vencida: 409 e o gateway nem é chamado', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      clock.advance(10 * 60_000 + 1000);
      const res = await a.post(`/orders/${order.id}/payment`, { method: 'pix' });
      expect([res.status, await code(res)]).toEqual([409, 'pedido_nao_pendente']);
      expect(mock.simulate.createCalls).toBe(0);
    });

    it('menos de 30 s de reserva: não cria uma cobrança que nasce vencida', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      clock.advance(10 * 60_000 - 20_000);
      const res = await a.post(`/orders/${order.id}/payment`, { method: 'pix' });
      expect([res.status, await code(res)]).toEqual([409, 'reserva_expirada']);
      expect(mock.simulate.createCalls).toBe(0);
      expect(await row(order.id)).toMatchObject({ payment_method: null });
    });

    it('pedido que não está pendente não inicia pagamento', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      await sql("update orders set status = 'pago', paid_at = now() where id = $1", [order.id]);
      expect(await code(await a.post(`/orders/${order.id}/payment`, { method: 'pix' }))).toBe('pedido_nao_pendente');
      expect(mock.simulate.createCalls).toBe(0);
    });
  });

  describe('acesso', () => {
    it('exige login e perfil cliente, e só o dono vê o pagamento do pedido', async () => {
      const e = await event();
      const a = await user();
      const b = await user();
      const staff = await user('validador');
      const order = await pendingOrder(a, e);
      const anon = await app.request(`/api/orders/${order.id}/payment`, {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: '{"method":"pix"}',
      });
      expect(anon.status).toBe(401);
      expect((await staff.post(`/orders/${order.id}/payment`, { method: 'pix' })).status).toBe(403);
      expect((await b.post(`/orders/${order.id}/payment`, { method: 'pix' })).status).toBe(404);
      expect((await b.get(`/orders/${order.id}/payment`)).status).toBe(404);
      expect(mock.simulate.createCalls).toBe(0);
    });

    it('corpo que não é JSON ou sem método é recusado', async () => {
      const e = await event();
      const a = await user();
      const order = await pendingOrder(a, e);
      expect((await a.raw('POST', `/orders/${order.id}/payment`, '{quebrado')).status).toBe(400);
      expect((await a.post(`/orders/${order.id}/payment`, {})).status).toBe(422);
    });
  });
});
