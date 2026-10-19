import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jsQR from 'jsqr';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { parseQrKeys, verifyQr } from '../domain/ticketCode';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import type { PaymentGateway } from '../payments/gateway';
import { createMockGateway, type MockGateway } from '../payments/mockGateway';
import type { TicketIssuer } from '../payments/reconcile';
import { backfillTickets, createTicketIssuer, issueForOrder } from '../tickets/issuer';
import { lookupByQr } from '../tickets/service';
import { renderTicketsPdf, toLatin1 } from '../tickets/pdf';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';
const HAS_POPPLER = spawnSync('pdftoppm', ['-v']).status === 0 && spawnSync('pdftotext', ['-v']).status === 0;

/** Texto de um PDF (uma entrada por página). */
function pdfPages(bytes: Buffer): string[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'px-pdf-'));
  const file = path.join(dir, 'a.pdf');
  writeFileSync(file, bytes);
  const out = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).stdout;
  return out.split('\f').filter(p => p.trim().length > 0);
}

/** "Lê" o QR de uma página do PDF como um leitor faria: rasteriza a página e decodifica a imagem. */
async function readQrFromPdf(bytes: Buffer, page = 1): Promise<string | null> {
  const dir = mkdtempSync(path.join(tmpdir(), 'px-pdf-'));
  writeFileSync(path.join(dir, 'a.pdf'), bytes);
  spawnSync('pdftoppm', [
    '-r',
    '110',
    '-png',
    '-f',
    String(page),
    '-l',
    String(page),
    path.join(dir, 'a.pdf'),
    path.join(dir, 'p'),
  ]);
  const png = readdirPng(dir);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}
function readdirPng(dir: string): string {
  const out = spawnSync('ls', [dir], { encoding: 'utf8' })
    .stdout.split('\n')
    .find(f => f.endsWith('.png'));
  return path.join(dir, out!);
}

describe.skipIf(!ADMIN_URL)('ingresso, QR e PDF (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  let mock: MockGateway;
  let hash = '';
  let n = 0;
  const config = loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none' });
  const keys = config.qr.keys;

  const build = (gateway: PaymentGateway | undefined, issue: TicketIssuer | null = createTicketIssuer(config.qr)) =>
    createApp({
      config,
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender(), gateway },
      issueTickets: issue ?? undefined,
    });
  let app: ReturnType<typeof build>;

  async function user(role: 'cliente' | 'validador' | 'administrador' = 'cliente', target = app, name?: string) {
    const i = ++n;
    const email = `${role}${i}@partyx.test`;
    await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5)', [
      name ?? `Pessoa ${i} Teste`,
      email,
      role === 'cliente' ? String(30000000000 + i) : null,
      hash,
      role,
    ]);
    let cookie = '';
    let csrf = '';
    const raw = (method: string, p: string, body?: unknown) => {
      const headers: Record<string, string> = { origin: 'http://localhost', 'x-forwarded-for': '203.0.113.7' };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return target.request(`/api${p}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    };
    const login = await raw('POST', '/auth/login', { email, password: PASSWORD });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    const row = (await sql('select id from users where email = $1', [email])).rows[0];
    return {
      id: row.id as string,
      raw,
      get: (p: string) => raw('GET', p),
      post: (p: string, b: unknown = {}) => raw('POST', p, b),
    };
  }
  type Session = Awaited<ReturnType<typeof user>>;
  const json = async <T = any>(res: Response) => (await res.json()) as T;

  async function event(
    types: { name?: string; price?: number; total?: number }[] = [{}],
    over: { name?: string; venue?: string } = {},
  ) {
    const slug = `evento-${++n}`;
    const id = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values ($1,$2,'2026-12-12T22:00:00-03:00',$3,'Av. Brasil, 1000, Santa Maria - RS','d','18 anos','publicado') returning id`,
        [slug, over.name ?? 'Noite Neon Verão', over.venue ?? 'Arena Central'],
      )
    ).rows[0].id as string;
    const ids: string[] = [];
    for (const t of types) {
      ids.push(
        (
          await sql(
            `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,$2,$3,$4,'2026-10-01T00:00:00-03:00','2026-12-12T20:00:00-03:00') returning id`,
            [id, t.name ?? `Tipo ${ids.length + 1}`, t.price ?? 8000, t.total ?? 100],
          )
        ).rows[0].id,
      );
    }
    return { id, slug, types: ids };
  }

  async function pay(s: Session, e: Awaited<ReturnType<typeof event>>, qty: number[] = [3]) {
    const items = qty.map((quantity, i) => ({ ticketTypeId: e.types[i]!, quantity }));
    const order = (await json(await s.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: e.slug, items }))).order as { id: string };
    expect((await s.post(`/orders/${order.id}/payment`, { method: 'pix' })).status).toBe(201);
    const paymentId = (await sql('select gateway_payment_id from orders where id = $1', [order.id])).rows[0]
      .gateway_payment_id as string;
    return { orderId: order.id, paymentId };
  }
  const approve = async (paymentId: string, target = app) => {
    mock.simulate.setStatus(paymentId, 'aprovado');
    const body = JSON.stringify({ id: `evt_${randomBytes(6).toString('hex')}`, paymentId, type: 'payment.approved' });
    return target.request('/api/webhooks/payments', {
      method: 'POST',
      headers: { 'x-mock-signature': mock.simulate.sign(body) },
      body,
    });
  };
  const rowsOf = async (orderId: string) =>
    (
      await sql(
        'select id, unit_index, code, short_code, qr_payload, qr_key_version, holder_name, status, order_item_id, event_id from tickets where order_id = $1 order by order_item_id, unit_index',
        [orderId],
      )
    ).rows;

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

  describe('emissão (RF-38, RF-39, CA-20)', () => {
    it('compra de 3 unidades gera 3 ingressos com 3 QR Codes e códigos diferentes, todos válidos e assinados', async () => {
      const e = await event();
      const a = await user('cliente', app, 'Marina Costa');
      const p = await pay(a, e, [3]);
      expect((await approve(p.paymentId)).status).toBe(200);

      const t = await rowsOf(p.orderId);
      expect(t).toHaveLength(3);
      expect(t.map(x => x.unit_index)).toEqual([1, 2, 3]);
      expect(new Set(t.map(x => x.code)).size).toBe(3);
      expect(new Set(t.map(x => x.short_code)).size).toBe(3);
      expect(new Set(t.map(x => x.qr_payload)).size).toBe(3);
      for (const x of t) {
        expect(x.code.length).toBeGreaterThanOrEqual(22);
        expect(x).toMatchObject({
          status: 'valido',
          holder_name: 'Marina Costa',
          qr_key_version: config.qr.currentVersion,
          event_id: e.id,
        });
        expect(verifyQr(keys, x.qr_payload)).toEqual({
          ok: true,
          keyVersion: config.qr.currentVersion,
          eventId: e.id,
          code: x.code,
        });
      }
    });

    it('dois tipos no mesmo pedido: um ingresso por unidade de cada tipo', async () => {
      const e = await event([{ name: 'Pista' }, { name: 'VIP' }]);
      const a = await user();
      const p = await pay(a, e, [2, 1]);
      await approve(p.paymentId);
      const t = await rowsOf(p.orderId);
      expect(t).toHaveLength(3);
      const perItem = new Map<string, number[]>();
      for (const x of t) perItem.set(x.order_item_id, [...(perItem.get(x.order_item_id) ?? []), x.unit_index]);
      expect([...perItem.values()].map(v => v.join(',')).sort()).toEqual(['1', '1,2']);
    });

    it('QR de ingressos diferentes nunca coincide, nem entre pedidos e eventos', async () => {
      const e1 = await event();
      const e2 = await event();
      const [a, b] = await Promise.all([user(), user()]);
      const p1 = await pay(a, e1, [3]);
      const p2 = await pay(b, e2, [3]);
      await approve(p1.paymentId);
      await approve(p2.paymentId);
      const all = (await sql('select code, short_code, qr_payload from tickets')).rows;
      expect(all).toHaveLength(6);
      for (const col of ['code', 'short_code', 'qr_payload'] as const)
        expect(new Set(all.map(r => r[col])).size).toBe(6);
    });

    it('sem CPF no ingresso: nem no registro do titular, nem no QR', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [1]);
      await approve(p.paymentId);
      const cpf = (await sql('select cpf from users where id = $1', [a.id])).rows[0].cpf as string;
      const row = (await rowsOf(p.orderId))[0]!;
      expect(JSON.stringify(row)).not.toContain(cpf);
    });
  });

  describe('reprocessamento não duplica (CA-P3, RF-38)', () => {
    it('notificações repetidas, simultâneas e a recuperação mantêm exatamente 3 ingressos, com os mesmos códigos', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [3]);
      await approve(p.paymentId);
      const before = await rowsOf(p.orderId);
      await Promise.all([approve(p.paymentId), approve(p.paymentId), approve(p.paymentId)]);
      const recovered = await backfillTickets({ db: createDrizzle(testDb.pool), qr: config.qr });
      expect(recovered).toEqual({ orders: 0, tickets: 0 });
      const after = await rowsOf(p.orderId);
      expect(after.map(x => x.code)).toEqual(before.map(x => x.code));
      expect(after).toHaveLength(3);
      expect(
        (await sql('select quantity_sold from ticket_types where id = $1', [e.types[0]])).rows[0].quantity_sold,
      ).toBe(3);
    });

    it('chamar a emissão duas vezes na mesma transação não cria nada de novo e não troca os códigos', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [2]);
      await approve(p.paymentId);
      const before = await rowsOf(p.orderId);
      const db = createDrizzle(testDb.pool);
      const items = (
        await sql('select id, ticket_type_id, quantity from order_items where order_id = $1', [p.orderId])
      ).rows.map(r => ({ orderItemId: r.id, ticketTypeId: r.ticket_type_id, quantity: r.quantity }));
      const made = await db.transaction(tx =>
        issueForOrder(tx, config.qr, { id: p.orderId, userId: a.id, eventId: e.id, items }),
      );
      expect(made).toBe(0);
      expect((await rowsOf(p.orderId)).map(x => x.code)).toEqual(before.map(x => x.code));
    });

    it('emissão e confirmação são atômicas: se a emissão falha, o pedido continua pendente e nada fica pela metade', async () => {
      const failing: TicketIssuer = async (tx, order) => {
        await createTicketIssuer(config.qr)(tx, order); // emite...
        throw new Error('falha depois de emitir'); // ...e falha: tudo precisa voltar
      };
      const broken = build(mock, failing);
      const e = await event();
      const a = await user('cliente', broken);
      const p = await pay(a, e, [3]);
      const res = await approve(p.paymentId, broken);
      expect(res.status).toBe(503); // o gateway reenvia
      expect((await sql('select status from orders where id = $1', [p.orderId])).rows[0].status).toBe('pendente');
      expect(await rowsOf(p.orderId)).toHaveLength(0);
      expect(
        (await sql('select quantity_sold from ticket_types where id = $1', [e.types[0]])).rows[0].quantity_sold,
      ).toBe(0);
      // Com o emissor consertado, a reentrega fecha tudo.
      const fixed = build(mock);
      expect((await approve(p.paymentId, fixed)).status).toBe(200);
      expect(await rowsOf(p.orderId)).toHaveLength(3);
    });

    it('a recuperação emite o que falta em pedido pago sem ingresso, e só nele', async () => {
      const noIssuer = build(mock, null); // simula a época em que o emissor não existia
      const e = await event();
      const [a, b, c] = await Promise.all([
        user('cliente', noIssuer),
        user('cliente', noIssuer),
        user('cliente', noIssuer),
      ]);
      const pa = await pay(a, e, [2]);
      const pb = await pay(b, e, [1]);
      const pc = await pay(c, e, [1]);
      for (const p of [pa, pb, pc]) await approve(p.paymentId, noIssuer);
      expect((await sql("select count(*)::int as n from orders where status = 'pago'")).rows[0].n).toBe(3);
      expect((await sql('select count(*)::int as n from tickets')).rows[0].n).toBe(0);
      // Estornado e sem estoque nunca recebem ingresso, mesmo sem ter ingressos.
      mock.simulate.setStatus(pc.paymentId, 'estornado');
      const body = JSON.stringify({ id: 'evt-estorno', paymentId: pc.paymentId, type: 'payment.refunded' });
      await noIssuer.request('/api/webhooks/payments', {
        method: 'POST',
        headers: { 'x-mock-signature': mock.simulate.sign(body) },
        body,
      });

      const db = createDrizzle(testDb.pool);
      const runs = await Promise.all([backfillTickets({ db, qr: config.qr }), backfillTickets({ db, qr: config.qr })]);
      expect(runs.reduce((t, r) => t + r.tickets, 0)).toBe(3);
      expect(await rowsOf(pa.orderId)).toHaveLength(2);
      expect(await rowsOf(pb.orderId)).toHaveLength(1);
      expect(await rowsOf(pc.orderId)).toHaveLength(0);
      expect(await backfillTickets({ db, qr: config.qr })).toEqual({ orders: 0, tickets: 0 });
    });

    it('a rotina do Scheduler também recupera ingressos', async () => {
      const jobApp = createApp({
        config,
        clock,
        auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender(), gateway: mock },
        jobAuth: { verify: async h => h === 'Bearer ok' },
      });
      const e = await event();
      const a = await user('cliente', jobApp);
      const p = await pay(a, e, [2]);
      await approve(p.paymentId, jobApp); // sem emissor neste app
      expect(await rowsOf(p.orderId)).toHaveLength(0);
      // O emissor entra pela configuração do servidor real; aqui a rotina usa a chave do config.
      const res = await jobApp.request('/api/internal/jobs/reconcile-payments', {
        method: 'POST',
        headers: { authorization: 'Bearer ok' },
      });
      expect((await json(res)).tickets).toEqual({ orders: 1, tickets: 2 });
      expect(await rowsOf(p.orderId)).toHaveLength(2);
    });
  });

  describe('Meus ingressos e isolamento (RF-42)', () => {
    it('lista só os ingressos do comprador, sem o código secreto nem o conteúdo do QR', async () => {
      const e = await event();
      const [a, b] = await Promise.all([user(), user()]);
      const pa = await pay(a, e, [2]);
      const pb = await pay(b, e, [1]);
      await approve(pa.paymentId);
      await approve(pb.paymentId);
      const res = await a.get('/tickets');
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      const { tickets } = await json(res);
      expect(tickets).toHaveLength(2);
      for (const t of tickets) {
        expect(Object.keys(t).sort()).toEqual([
          'event',
          'holderName',
          'id',
          'minorTermPending',
          'orderId',
          'orderNumber',
          'priceCents',
          'receivedFrom',
          'serviceFeeCents',
          'shortCode',
          'status',
          'transferUntil',
          'typeName',
          'usedAt',
        ]);
        expect(t.event).toMatchObject({
          name: 'Noite Neon Verão',
          venue: 'Arena Central',
          startsAt: '2026-12-13T01:00:00.000Z',
        });
      }
      const secrets = (await rowsOf(pa.orderId)).flatMap(r => [r.code, r.qr_payload]);
      for (const s of secrets) expect(JSON.stringify(tickets)).not.toContain(s);
    });

    it('o detalhe traz o QR; de outro comprador, o ingresso e o pedido respondem 404 em todas as rotas', async () => {
      const e = await event();
      const [a, b] = await Promise.all([user(), user()]);
      const p = await pay(a, e, [2]);
      await approve(p.paymentId);
      const [t1] = await rowsOf(p.orderId);
      const mine = await a.get(`/tickets/${t1!.id}`);
      expect((await json(mine)).ticket).toMatchObject({
        id: t1!.id,
        qrPayload: t1!.qr_payload,
        shortCode: t1!.short_code,
        status: 'valido',
      });
      for (const path of [
        `/tickets/${t1!.id}`,
        `/tickets/${t1!.id}/pdf`,
        `/orders/${p.orderId}/tickets`,
        `/orders/${p.orderId}/tickets/pdf`,
      ]) {
        expect((await b.get(path)).status, path).toBe(404);
      }
      expect((await a.get('/tickets/não-é-uuid')).status).toBe(404);
      expect((await json(await b.get('/tickets'))).tickets).toEqual([]);
    });

    it('exige login e perfil cliente', async () => {
      const e = await event();
      const a = await user();
      const staff = await user('validador');
      const p = await pay(a, e, [1]);
      await approve(p.paymentId);
      const t = (await rowsOf(p.orderId))[0]!;
      const anon = await app.request(`/api/tickets/${t.id}`);
      expect(anon.status).toBe(401);
      for (const path of ['/tickets', `/tickets/${t.id}`, `/tickets/${t.id}/pdf`, `/orders/${p.orderId}/tickets`]) {
        expect((await staff.get(path)).status, path).toBe(403);
      }
    });

    it('pedido ainda não pago não tem ingressos: lista vazia e PDF 404', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [1]);
      expect((await json(await a.get(`/orders/${p.orderId}/tickets`))).tickets).toEqual([]);
      expect((await a.get(`/orders/${p.orderId}/tickets/pdf`)).status).toBe(404);
      expect((await json(await a.get('/tickets'))).tickets).toEqual([]);
    });

    it('histórico de compras: todos os pedidos do comprador, com a quantidade de ingressos', async () => {
      const e1 = await event();
      const e2 = await event();
      const a = await user();
      const b = await user();
      const p1 = await pay(a, e1, [2]);
      await approve(p1.paymentId);
      await pay(a, e2, [1]); // pendente
      await pay(b, e1, [1]);
      const { orders } = await json(await a.get('/orders'));
      expect(orders).toHaveLength(2);
      expect(orders.map((o: any) => [o.status, o.ticketCount]).sort()).toEqual([
        ['pago', 2],
        ['pendente', 0],
      ]);
      expect(Object.keys(orders[0]).sort()).toEqual([
        'createdAt',
        'eventName',
        'eventSlug',
        'eventStartsAt',
        'id',
        'number',
        'paidAt',
        'status',
        'ticketCount',
        'totalCents',
      ]);
    });
  });

  describe('ingresso cancelado por estorno', () => {
    it('muda para cancelado, não mostra QR e o PDF sai marcado, sem QR', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [2]);
      await approve(p.paymentId);
      mock.simulate.setStatus(p.paymentId, 'estornado');
      const body = JSON.stringify({ id: 'evt-refund', paymentId: p.paymentId, type: 'payment.refunded' });
      await app.request('/api/webhooks/payments', {
        method: 'POST',
        headers: { 'x-mock-signature': mock.simulate.sign(body) },
        body,
      });
      const t = (await rowsOf(p.orderId))[0]!;
      const d = (await json(await a.get(`/tickets/${t.id}`))).ticket;
      expect(d).toMatchObject({ status: 'cancelado', qrPayload: null });
      // O histórico permanece: o ingresso continua listado.
      expect((await json(await a.get('/tickets'))).tickets.map((x: any) => x.status)).toEqual([
        'cancelado',
        'cancelado',
      ]);
      if (HAS_POPPLER) {
        const pdf = Buffer.from(await (await a.get(`/tickets/${t.id}/pdf`)).arrayBuffer());
        expect(pdfPages(pdf)[0]).toContain('CANCELADO');
        expect(await readQrFromPdf(pdf)).toBeNull();
      }
    });
  });

  describe.skipIf(!HAS_POPPLER)('PDF (RF-41, CA-21)', () => {
    async function paidTicketSetup(qty: number[] = [3]) {
      const e = await event([{ name: 'Camarote Premium' }, { name: 'Pista' }], {
        name: 'Noite Neon Verão',
        venue: 'Arena Central',
      });
      const a = await user('cliente', app, 'Marina Costa');
      const p = await pay(a, e, qty);
      await approve(p.paymentId);
      return { e, a, p, rows: await rowsOf(p.orderId) };
    }
    const fetchPdf = async (s: Session, p: string) => {
      const res = await s.get(p);
      expect(res.status).toBe(200);
      return { res, bytes: Buffer.from(await res.arrayBuffer()) };
    };

    it('o PDF de um ingresso traz todos os dados exigidos e o QR é lido como um validador leria', async () => {
      const { a, rows } = await paidTicketSetup([2]);
      const t = rows[0]!;
      const { res, bytes } = await fetchPdf(a, `/tickets/${t.id}/pdf`);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toBe(`attachment; filename="ingresso-${t.short_code}.pdf"`);
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');

      const pages = pdfPages(bytes);
      expect(pages).toHaveLength(1);
      const text = pages[0]!.replace(/\s+/g, ' ');
      for (const must of [
        'Noite Neon Verão',
        'sábado, 12 de dezembro de 2026',
        '22:00',
        'Arena Central',
        'Av. Brasil, 1000, Santa Maria - RS',
        'Marina Costa',
        t.short_code,
        'Classificação: 18 anos',
      ]) {
        expect(text, must).toContain(must);
      }
      // O QR do PDF é o do ingresso, e a leitura do servidor o reconhece como este ingresso válido.
      const scanned = await readQrFromPdf(bytes);
      expect(scanned).toBe(t.qr_payload);
      const lookup = await lookupByQr({ db: createDrizzle(testDb.pool), keys }, scanned!);
      expect(lookup).toMatchObject({
        ok: true,
        ticket: { id: t.id, status: 'valido', shortCode: t.short_code, holderName: 'Marina Costa' },
      });
    });

    it('o PDF não traz CPF nem o código secreto em texto', async () => {
      const { a, rows } = await paidTicketSetup([1]);
      const cpf = (await sql('select cpf from users where id = $1', [a.id])).rows[0].cpf as string;
      const { bytes } = await fetchPdf(a, `/tickets/${rows[0]!.id}/pdf`);
      const text = pdfPages(bytes).join(' ');
      expect(text).not.toContain(cpf);
      expect(text).not.toContain(rows[0]!.code);
    });

    it('o PDF do pedido tem uma página por ingresso, cada uma com o seu QR, todos lidos e diferentes', async () => {
      const { a, p, rows } = await paidTicketSetup([2, 1]);
      const { res, bytes } = await fetchPdf(a, `/orders/${p.orderId}/tickets/pdf`);
      expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="ingressos-pedido-\d+\.pdf"$/);
      const pages = pdfPages(bytes);
      expect(pages).toHaveLength(3);
      const scanned: string[] = [];
      for (let i = 1; i <= 3; i++) scanned.push((await readQrFromPdf(bytes, i))!);
      expect(new Set(scanned).size).toBe(3);
      expect(scanned.sort()).toEqual(rows.map(r => r.qr_payload).sort());
      expect(pages.map(pg => /ingresso (\d) de 3/.exec(pg.replace(/\s+/g, ' '))?.[1])).toEqual(['1', '2', '3']);
    });

    it('nome do evento com acentos, aspas e emoji não quebra o PDF (o emoji sai do texto impresso)', async () => {
      expect(toLatin1('Festa "Açaí" — São João ✨🎉')).toBe('Festa "Açaí" — São João');
      const bytes = await renderTicketsPdf(
        [
          {
            id: 'x',
            orderId: 'o',
            orderNumber: 10001,
            event: {
              slug: 's',
              name: 'Festa Açaí ✨ do Zé',
              startsAt: '2026-12-13T01:00:00.000Z',
              venue: 'Clube',
              address: 'Rua',
              ageRating: 'Livre',
              allowsMinors: false,
            },
            typeName: 'Pista',
            holderName: 'José da Conceição',
            shortCode: 'PX-ABCD-2345',
            status: 'valido',
            usedAt: null,
            receivedFrom: null,
            transferUntil: '2026-12-12T23:00:00.000Z',
            minorTermPending: false,
            priceCents: 3000,
            serviceFeeCents: 0,
            qrPayload: 'PX1.1.' + 'a'.repeat(32) + '.' + 'b'.repeat(24) + '.' + 'c'.repeat(22),
          },
        ],
        'Teste',
      );
      expect(pdfPages(bytes)[0]).toContain('Festa Açaí do Zé');
    });

    it('o QR do PDF é lido de um PDF impresso pequeno: dimensão e zona de silêncio adequadas', async () => {
      const { a, rows } = await paidTicketSetup([1]);
      const { bytes } = await fetchPdf(a, `/tickets/${rows[0]!.id}/pdf`);
      // Resolução baixa (60 dpi, como uma tela de celular encolhida) ainda decodifica.
      const dir = mkdtempSync(path.join(tmpdir(), 'px-pdf-'));
      writeFileSync(path.join(dir, 'a.pdf'), bytes);
      spawnSync('pdftoppm', ['-r', '60', '-png', '-f', '1', '-l', '1', path.join(dir, 'a.pdf'), path.join(dir, 'p')]);
      const { data, info } = await sharp(readdirPng(dir)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(rows[0]!.qr_payload);
    });
  });

  describe('leitura do QR no servidor (CA-22)', () => {
    it('um caractere alterado, em qualquer posição, deixa o ingresso inválido; o original segue válido', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [1]);
      await approve(p.paymentId);
      const t = (await rowsOf(p.orderId))[0]!;
      const deps = { db: createDrizzle(testDb.pool), keys };
      expect((await lookupByQr(deps, t.qr_payload)).ok).toBe(true);
      for (let i = 0; i < t.qr_payload.length; i++) {
        const ch = t.qr_payload[i] === 'A' ? 'B' : 'A';
        const tampered = t.qr_payload.slice(0, i) + ch + t.qr_payload.slice(i + 1);
        expect((await lookupByQr(deps, tampered)).ok, `posição ${i}`).toBe(false);
      }
    });

    it('o código curto não vale como QR; QR de outro evento assinado por nós mas sem ingresso é desconhecido', async () => {
      const e = await event();
      const a = await user();
      const p = await pay(a, e, [1]);
      await approve(p.paymentId);
      const t = (await rowsOf(p.orderId))[0]!;
      const deps = { db: createDrizzle(testDb.pool), keys };
      expect(await lookupByQr(deps, t.short_code)).toEqual({ ok: false, reason: 'formato' });
      expect(await lookupByQr(deps, t.code)).toEqual({ ok: false, reason: 'formato' });
      // Assinatura correta, mas o código não existe: ninguém "inventa" um ingresso nem com a chave certa para um código novo.
      const { signQr, newTicketCode } = await import('../domain/ticketCode');
      expect(await lookupByQr(deps, signQr(keys, config.qr.currentVersion, e.id, newTicketCode()))).toEqual({
        ok: false,
        reason: 'desconhecido',
      });
      // Código verdadeiro de um evento, assinado para outro: o evento do ingresso não bate.
      const other = await event();
      expect(await lookupByQr(deps, signQr(keys, config.qr.currentVersion, other.id, t.code))).toEqual({
        ok: false,
        reason: 'desconhecido',
      });
    });

    it('rotação de chave preserva os ingressos emitidos e os novos usam a versão atual', async () => {
      const k1 = randomBytes(32).toString('base64url');
      const k2 = randomBytes(32).toString('base64url');
      const only1 = { keys: parseQrKeys(`1:${k1}`), currentVersion: 1 };
      const both = { keys: parseQrKeys(`1:${k1},2:${k2}`), currentVersion: 2 };
      const e = await event();
      const [a, b] = await Promise.all([user(), user()]);
      const appV1 = build(mock, createTicketIssuer(only1));
      const appV2 = build(mock, createTicketIssuer(both));
      const pa = await pay(a, e, [1]);
      await approve(pa.paymentId, appV1); // emitido com a versão 1
      const pb = await pay(b, e, [1]);
      await approve(pb.paymentId, appV2); // depois da rotação: versão 2
      const [ta] = await rowsOf(pa.orderId);
      const [tb] = await rowsOf(pb.orderId);
      expect([ta!.qr_key_version, tb!.qr_key_version]).toEqual([1, 2]);
      const db = createDrizzle(testDb.pool);
      // Com as duas versões configuradas, os dois valem.
      expect((await lookupByQr({ db, keys: both.keys }, ta!.qr_payload)).ok).toBe(true);
      expect((await lookupByQr({ db, keys: both.keys }, tb!.qr_payload)).ok).toBe(true);
      // Remover a versão 1 invalidaria os ingressos antigos: por isso a regra é nunca remover enquanto houver emitido.
      expect(await lookupByQr({ db, keys: parseQrKeys(`2:${k2}`) }, ta!.qr_payload)).toEqual({
        ok: false,
        reason: 'versao_desconhecida',
      });
      // Uma chave só da versão 1 não valida o QR novo (versão 2 desconhecida).
      expect(await lookupByQr({ db, keys: only1.keys }, tb!.qr_payload)).toEqual({
        ok: false,
        reason: 'versao_desconhecida',
      });
    });
  });

  describe('rotas que mudam um ingresso (D-87)', () => {
    it('fora do painel, só as da transferência e o aceite do Termo de Ciência de quem recebeu', () => {
      const writes = app.routes.filter(
        r =>
          r.path.startsWith('/api') &&
          r.method !== 'GET' &&
          r.method !== 'ALL' &&
          /ticket|ingresso/i.test(r.path) &&
          !r.path.startsWith('/api/admin'),
      );
      expect([...new Set(writes.map(r => `${r.method} ${r.path}`))].sort()).toEqual([
        'POST /api/tickets/:id/termo-menor',
        'POST /api/tickets/:id/transfer',
        'POST /api/tickets/:id/transfer/preview',
      ]);
    });
  });
});
