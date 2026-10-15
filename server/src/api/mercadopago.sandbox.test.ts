import { createHmac, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { expireOverdue } from '../orders/service';
import { systemClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { createMercadoPagoGateway } from '../payments/mercadopago';
import { runReconciliation } from '../payments/notifications';
import type { ReconcileDeps, TicketIssuer } from '../payments/reconcile';
import { handleReconcileTask } from '../payments/reconcileTask';
import { createTicketIssuer } from '../tickets/issuer';

/**
 * Etapa 07 no ambiente de teste REAL do Mercado Pago (API de Orders). Rodar com `npm run test:sandbox`.
 *
 * O que é real: criação das orders, aprovação do Pix pelo Mercado Pago (pagador de teste `APRO`), estorno total pela API de
 * reembolsos (o mesmo que o painel faz), toda reconsulta (`GET /v1/orders/{id}`), a busca de orders e as chaves de idempotência.
 * O que é simulado, e por quê:
 * - a ENTREGA do webhook: as notificações das compras de teste vêm assinadas pela aplicação do usuário de teste, cuja assinatura
 *   secreta o painel não mostra (docs/pagamento-mercadopago.md). Aqui elas são montadas no formato do Mercado Pago e assinadas com a
 *   assinatura secreta da aplicação da PartyX; o servidor reconsulta a order real antes de agir;
 * - resposta perdida e tempo esgotado: injetados no `fetch` em volta da chamada real (a chamada vai ao Mercado Pago de verdade);
 * - a queda no meio da emissão: o emissor de ingressos falha uma vez de propósito;
 * - a contestação (chargeback): o ambiente de teste não gera contestação. A order real (aprovada) é lida e só o estado volta trocado
 *   para `charged_back`, como a documentação descreve.
 *
 * Nada aqui imprime token, assinatura secreta, CPF ou dado de cartão.
 */

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const TOKEN = process.env.MP_ACCESS_TOKEN;
const PUBLIC_KEY = process.env.MP_PUBLIC_KEY;
const SECRET = process.env.MP_WEBHOOK_SECRET;
const PASSWORD = 'festa2026';
const MP = 'https://api.mercadopago.com';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** CPF fictício com dígitos verificadores válidos (o Mercado Pago falha a order com `processing_error` se o CPF for inválido). */
function validCpf(base: number): string {
  const d = String(base).padStart(9, '0').split('').map(Number);
  for (const len of [9, 10]) {
    const sum = d.slice(0, len).reduce((t, x, i) => t + x * (len + 1 - i), 0);
    d.push(((sum * 10) % 11) % 10);
  }
  return d.join('');
}

/** Chamada direta à API, como o "painel": estorno, criação fora da plataforma, conferência. Nunca usada pela aplicação. */
async function mpApi(method: string, path: string, body?: unknown, key?: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${MP}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          ...(key ? { 'X-Idempotency-Key': key } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, json: (await res.json().catch(() => null)) as any };
    } catch (error) {
      // Rede instável (ECONNRESET observado): repetir é seguro, toda escrita aqui leva chave de idempotência.
      if (attempt >= 2 || (method !== 'GET' && !key)) throw error;
      await sleep(1000);
    }
  }
}

/** Falhas injetadas em volta do `fetch` real. Cada uma vale `times` vezes. */
type Fault =
  | { kind: 'resposta_perdida'; method: string; path: RegExp; times: number }
  | { kind: 'tempo_esgotado'; method: string; path: RegExp; times: number }
  | { kind: 'contestacao'; method: string; path: RegExp; times: number };

describe('Mercado Pago, ambiente de teste REAL: webhook, conciliação, estorno e contestação (etapa 07)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const faults: Fault[] = [];
  const calls: { method: string; path: string; status: number | string }[] = [];
  let hash = '';
  let n = 0;
  let collector = '';
  let crashNextIssue = false;
  let lastCreation = 0;
  let app: ReturnType<typeof createApp>;
  let deps: ReconcileDeps;
  const config = loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none' });
  const evidence: Record<string, unknown> = {};

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const fault = faults.find(f => f.times > 0 && f.method === method && f.path.test(url.pathname));
    if (fault) fault.times--;
    if (fault?.kind === 'tempo_esgotado') {
      // Tempo esgotado de verdade: a chamada real é abortada em 1 ms.
      try {
        await fetch(input, { ...init, signal: AbortSignal.timeout(1) });
      } catch (error) {
        calls.push({ method, path: url.pathname, status: 'tempo_esgotado' });
        throw error;
      }
    }
    const res = await fetch(input, init);
    calls.push({ method, path: url.pathname, status: res.status });
    if (fault?.kind === 'resposta_perdida') {
      // O Mercado Pago recebeu e processou; a resposta "não chega".
      await res.arrayBuffer();
      throw new DOMException('resposta perdida (simulada)', 'TimeoutError');
    }
    if (fault?.kind === 'contestacao') {
      const order = (await res.json()) as any;
      order.status = 'charged_back';
      order.status_detail = 'charged_back';
      return new Response(JSON.stringify(order), {
        status: res.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return res;
  }) as typeof fetch;

  const realIssuer = createTicketIssuer(config.qr);
  const issuer: TicketIssuer = async (tx, order) => {
    if (crashNextIssue) {
      crashNextIssue = false;
      throw new Error('queda simulada no meio da emissão');
    }
    return realIssuer(tx, order);
  };

  async function login(email: string) {
    let cookie = '';
    let csrf = '';
    const raw = (method: string, path: string, body?: unknown) => {
      const headers: Record<string, string> = { origin: 'http://localhost', 'x-forwarded-for': '203.0.113.9' };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return app.request(`/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    };
    const res = await raw('POST', '/auth/login', { email, password: PASSWORD });
    expect(res.status).toBe(200);
    cookie = res.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    return { get: (p: string) => raw('GET', p), post: (p: string, b: unknown = {}) => raw('POST', p, b) };
  }

  async function person(role: 'cliente' | 'validador' | 'administrador') {
    const i = ++n;
    const email = `sandbox${i}@partyx.test`;
    // Primeiro nome APRO: no ambiente de teste o Mercado Pago aprova o Pix sozinho.
    await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5)', [
      role === 'cliente' ? `APRO Sandbox ${i}` : `Equipe ${i}`,
      email,
      role === 'cliente' ? validCpf(400000000 + i) : null,
      hash,
      role,
    ]);
    return login(email);
  }

  async function event(total: number) {
    const slug = `sandbox-${++n}`;
    const id = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values ($1,'Evento Sandbox','2026-12-12T22:00:00-03:00','Arena','Rua 1','d','Livre','publicado') returning id`,
        [slug],
      )
    ).rows[0].id as string;
    const type = (
      await sql(
        `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'Pista',4000,$2,'2026-10-01T00:00:00-03:00','2026-12-12T20:00:00-03:00') returning id`,
        [id, total],
      )
    ).rows[0].id as string;
    return { id, slug, type };
  }

  type Buyer = Awaited<ReturnType<typeof person>>;
  async function newOrder(s: Buyer, e: { slug: string; type: string }, quantity: number) {
    const res = await s.post('/orders', { cancellationAccepted: true, cancellationVersion: 'ficticio-0', eventSlug: e.slug, items: [{ ticketTypeId: e.type, quantity }] });
    expect(res.status).toBe(201);
    return ((await res.json()) as { order: { id: string } }).order.id;
  }

  /** O antifraude do ambiente de teste recusa rajadas: no mínimo 6 s entre criações de cobrança. */
  async function pace() {
    const wait = lastCreation + 6000 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCreation = Date.now();
  }

  /**
   * Token de cartão como o Brick gera no navegador (com a chave PÚBLICA), com o cartão Visa de teste da documentação do Mercado
   * Pago (não é cartão real) e titular APRO (aprovado). O servidor da PartyX só recebe o token.
   */
  async function cardToken() {
    const res = await fetch(`${MP}/v1/card_tokens?public_key=${PUBLIC_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_number: '4235647728025682',
        expiration_month: 11,
        expiration_year: 2030,
        security_code: '123',
        cardholder: { name: 'APRO', identification: { type: 'CPF', number: '19119119100' } },
      }),
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }
  const card = (token: string) => ({
    method: 'cartao',
    cardToken: token,
    paymentMethodId: 'visa',
    paymentTypeId: 'credit_card',
    installments: 1,
  });

  /**
   * Paga com o cartão de teste APRO: o Mercado Pago aprova na criação (real). A conciliação imediata do servidor (reconsulta logo
   * depois da criação) esgota o tempo de verdade nas duas tentativas, então o pedido fica "pendente" com a order já aprovada no
   * Mercado Pago: o mesmo estado de um Pix pago à espera do webhook. Usado porque, no ambiente de teste, o Pix APRO passou a ficar
   * preso em `processing/in_process` (12/10/2026, 06:00 UTC em diante).
   */
  async function payApprovedDeferred(s: Buyer, orderId: string) {
    await pace();
    faults.push({ kind: 'tempo_esgotado', method: 'GET', path: /^\/v1\/orders\/ORD/, times: 2 });
    const res = await s.post(`/orders/${orderId}/payment`, card(await cardToken()));
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).payment).toMatchObject({ method: 'cartao', status: 'aprovado' });
    expect(await orderRow(orderId)).toMatchObject({ status: 'pendente', reserva: 'ativa' });
    return res;
  }

  /** Espera a order real chegar a um estado no Mercado Pago (o Pix APRO aprova em poucos segundos). */
  async function waitMp(gid: string, status: string) {
    for (let i = 0; i < 40; i++) {
      const r = await mpApi('GET', `/v1/orders/${gid}`);
      if (r.json?.status === status) return r.json;
      if (r.json?.status === 'failed' && status !== 'failed')
        throw new Error(`order ${gid} falhou no Mercado Pago: ${r.json?.transactions?.payments?.[0]?.status_detail}`);
      await sleep(1500);
    }
    throw new Error(`order ${gid} não chegou a ${status}`);
  }

  /** Estorno TOTAL, como o botão do painel: `POST /v1/orders/{id}/refund` sem corpo. */
  async function refundInPanel(gid: string) {
    const r = await mpApi('POST', `/v1/orders/${gid}/refund`, undefined, `sandbox-estorno:${gid}`);
    expect(r.status).toBe(201);
    await waitMp(gid, 'refunded');
  }

  /** Order criada direto na API, fora da plataforma (cartão de teste APRO), com a referência e o valor escolhidos. */
  async function directOrder(ref: string, amount: string) {
    await pace();
    const token = await cardToken();
    const r = await mpApi(
      'POST',
      '/v1/orders',
      {
        type: 'online',
        processing_mode: 'automatic',
        external_reference: ref,
        total_amount: amount,
        payer: { email: 'test@testuser.com', first_name: 'APRO' },
        transactions: {
          payments: [{ amount, payment_method: { id: 'visa', type: 'credit_card', token, installments: 1 } }],
        },
      },
      `sandbox-direta:${ref}:${amount}`,
    );
    expect(r.status).toBe(201);
    return r.json.id as string;
  }

  /** Notificação no formato do Mercado Pago (tópico order), assinada com a assinatura secreta da aplicação da PartyX. */
  function notification(
    gid: string,
    action: string,
    over: { secret?: string; dateCreated?: string; tsMs?: number } = {},
  ) {
    const ts = String(Math.floor((over.tsMs ?? Date.now()) / 1000));
    const rid = randomUUID();
    const v1 = createHmac('sha256', over.secret ?? SECRET!)
      .update(`id:${gid.toLowerCase()};request-id:${rid};ts:${ts};`)
      .digest('hex');
    const body = JSON.stringify({
      action,
      api_version: 'v1',
      data: { id: gid, type: 'online' },
      date_created: over.dateCreated ?? new Date().toISOString(),
      live_mode: false,
      type: 'order',
      user_id: collector,
    });
    const send = () =>
      app.request(`/api/webhooks/payments?data.id=${gid}&type=order`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid },
        body,
      });
    return { send };
  }
  const notify = async (gid: string, action: string, over: Parameters<typeof notification>[2] = {}) => {
    const res = await notification(gid, action, over).send();
    return { status: res.status, body: (await res.json()) as any };
  };

  const orderRow = async (id: string) =>
    (
      await sql(
        `select o.status, o.paid_at, o.gateway_payment_id, o.payment_method,
                (select string_agg(status::text, ',') from reservations r where r.order_id = o.id) as reserva
           from orders o where o.id = $1`,
        [id],
      )
    ).rows[0];
  const ticketsOf = async (id: string) =>
    (
      await sql('select id, status, qr_payload, cancel_reason from tickets where order_id = $1 order by short_code', [
        id,
      ])
    ).rows;
  const sold = async (type: string) =>
    (await sql('select quantity_sold from ticket_types where id = $1', [type])).rows[0].quantity_sold as number;
  const gid = async (id: string) => (await orderRow(id)).gateway_payment_id as string;

  // Estado compartilhado entre os casos, na ordem em que rodam.
  const s: Record<string, { order: string; gid: string; event: Awaited<ReturnType<typeof event>>; paidAt?: string }> =
    {};
  let buyer: Buyer;
  let gate: Buyer;
  let admin: Buyer;

  beforeAll(async () => {
    if (!ADMIN_URL) throw new Error('TEST_DATABASE_URL ausente: o teste de sandbox precisa do banco de teste');
    if (!TOKEN || !PUBLIC_KEY || !SECRET)
      throw new Error('credenciais de teste do Mercado Pago ausentes (scripts/setup-mp-credentials.sh)');
    const me = await mpApi('GET', '/users/me');
    expect(me.status).toBe(200);
    // Só ambiente de teste: a conta das credenciais tem de ser um usuário de teste.
    expect(me.json.tags).toContain('test_user');
    collector = String(me.json.id);
    if (process.env.MP_COLLECTOR_ID) expect(collector).toBe(process.env.MP_COLLECTOR_ID);

    testDb = await createTestDatabase(ADMIN_URL);
    hash = await argon2Hasher.hash(PASSWORD);
    const gateway = createMercadoPagoGateway({
      accessToken: TOKEN,
      publicKey: PUBLIC_KEY,
      webhookSecret: SECRET,
      collectorId: collector,
      liveMode: false,
      clock: systemClock,
      http: { fetchImpl },
    });
    const db = createDrizzle(testDb.pool);
    app = createApp({
      config,
      clock: systemClock,
      auth: { db, hasher: argon2Hasher, mailer: new MemoryEmailSender(), gateway },
      issueTickets: issuer,
    });
    deps = { db, clock: systemClock, gateway, issueTickets: issuer };
    buyer = await person('cliente');
    gate = await person('validador');
    admin = await person('administrador');
  });
  afterAll(async () => {
    // Evidência para o relatório (só ids, estados e contagens), num arquivo fora do Git se `SANDBOX_EVIDENCE_FILE` estiver definido.
    if (process.env.SANDBOX_EVIDENCE_FILE)
      writeFileSync(process.env.SANDBOX_EVIDENCE_FILE, JSON.stringify({ em: new Date().toISOString(), ...evidence }, null, 1));
    await testDb?.drop();
  });

  it('1. Pagamento aprovado no Mercado Pago; webhook repetido e simultâneo não duplica nada (CA-P1, CA-P3)', async () => {
    const e = await event(5);
    const order = await newOrder(buyer, e, 2);
    await payApprovedDeferred(buyer, order);
    const g = await gid(order);
    expect(g).toMatch(/^ORDTST/);
    await waitMp(g, 'processed');

    const first = notification(g, 'order.processed');
    expect(await (await first.send()).json()).toMatchObject({ status: 'processada', outcome: 'confirmado' });
    // O Mercado Pago repete a MESMA notificação (sem resposta a tempo, por exemplo).
    expect(await (await first.send()).json()).toMatchObject({ status: 'duplicada' });
    // E várias notificações diferentes da mesma order chegam juntas.
    const burst = await Promise.all(Array.from({ length: 6 }, () => notify(g, 'order.processed')));
    expect(burst.every(r => r.status === 200)).toBe(true);

    const row = await orderRow(order);
    expect(row).toMatchObject({ status: 'pago', reserva: 'convertida' });
    const t = await ticketsOf(order);
    expect(t).toHaveLength(2);
    expect(new Set(t.map(x => x.qr_payload)).size).toBe(2);
    expect(await sold(e.type)).toBe(2);
    s.A = { order, gid: g, event: e, paidAt: new Date(row.paid_at).toISOString() };
    evidence.caso1 = {
      gid: g,
      pedido: row.status,
      ingressos: t.length,
      vendidos: 2,
      rajada: burst.map(r => r.body.status),
    };
  });

  it('2. Fora de ordem: notificação antiga chega depois da aprovação; nada muda e paid_at fica', async () => {
    const { order, gid: g, paidAt } = s.A!;
    const late = await notify(g, 'order.action_required', { dateCreated: '2026-01-01T00:00:00Z' });
    expect(late.body).toMatchObject({ status: 'processada', outcome: 'ignorado' });
    const row = await orderRow(order);
    expect(row.status).toBe('pago');
    expect(new Date(row.paid_at).toISOString()).toBe(paidAt);
    expect(await ticketsOf(order)).toHaveLength(2);
    evidence.caso2 = { atrasada: late.body.outcome, paidAtPreservado: true };
  });

  it('3. Assinatura falsa, fora do prazo ou ausente: 401, só metadados gravados, pedido intocado (CA-P4)', async () => {
    const { order, gid: g } = s.A!;
    const before = Number((await sql("select count(*) from payment_events where type = 'invalido'")).rows[0].count);
    expect((await notify(g, 'order.refunded', { secret: 'assinatura-falsa-de-quem-ataca-000000' })).status).toBe(401);
    expect((await notify(g, 'order.refunded', { tsMs: Date.now() - 15 * 60_000 })).status).toBe(401);
    const missing = await app.request(`/api/webhooks/payments?data.id=${g}&type=order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'order.refunded', type: 'order', data: { id: g } }),
    });
    expect(missing.status).toBe(401);
    const rows = (
      await sql(
        "select payload_json, gateway_event_id, order_id from payment_events where type = 'invalido' order by received_at",
      )
    ).rows.slice(before);
    expect(rows.map(r => r.payload_json.motivo)).toEqual([
      'assinatura_invalida',
      'fora_do_prazo',
      'assinatura_ausente',
    ]);
    // Só metadados: nem o id da order, nem o corpo.
    expect(JSON.stringify(rows)).not.toContain(g);
    expect(rows.every(r => r.gateway_event_id === null && r.order_id === null)).toBe(true);
    expect(await orderRow(order)).toMatchObject({ status: 'pago' });
    expect((await ticketsOf(order)).every(t => t.status === 'valido')).toBe(true);
    evidence.caso3 = { recusadas: rows.map(r => r.payload_json.motivo), pedido: 'pago' };
  });

  it('4. Webhook perdido: a verificação agendada (Cloud Tasks) reconsulta e emite (aprovação recuperada)', async () => {
    const e = await event(5);
    const order = await newOrder(buyer, e, 1);
    await payApprovedDeferred(buyer, order);
    const g = await gid(order);
    await waitMp(g, 'processed');
    // Nenhuma notificação é entregue.
    expect(await orderRow(order)).toMatchObject({ status: 'pendente' });
    const r = await handleReconcileTask({ ...deps, schedule: config.reconcile }, { orderId: order, attempt: 1 });
    expect(r.outcome).toBe('conciliado');
    const row = await orderRow(order);
    expect(row).toMatchObject({ status: 'pago', reserva: 'convertida' });
    expect(await ticketsOf(order)).toHaveLength(1);
    s.B = { order, gid: g, event: e, paidAt: new Date(row.paid_at).toISOString() };
    evidence.caso4 = { gid: g, tarefa: r.outcome, ingressos: 1 };
  });

  it('5. Tempo esgotado na reconsulta: 503 e evento pendente; a repetição do Mercado Pago conclui sem duplicar', async () => {
    const e = await event(5);
    const order = await newOrder(buyer, e, 2);
    await payApprovedDeferred(buyer, order);
    const g = await gid(order);
    await waitMp(g, 'processed');
    // As duas tentativas da reconsulta (7 s cada no padrão) esgotam o tempo de verdade.
    faults.push({ kind: 'tempo_esgotado', method: 'GET', path: new RegExp(`/v1/orders/${g}$`), times: 2 });
    const msg = notification(g, 'order.processed');
    const first = await msg.send();
    expect(first.status).toBe(503);
    const ev = (
      await sql('select processed_at, processing_error, attempts from payment_events where order_id = $1', [order])
    ).rows[0];
    expect(ev).toMatchObject({ processed_at: null, processing_error: 'gateway_indisponivel', attempts: 1 });
    expect(await orderRow(order)).toMatchObject({ status: 'pendente', reserva: 'ativa' });
    expect(await ticketsOf(order)).toHaveLength(0);
    // O Mercado Pago repete a mesma notificação.
    expect(await (await msg.send()).json()).toMatchObject({ status: 'processada', outcome: 'confirmado' });
    expect(await ticketsOf(order)).toHaveLength(2);
    expect(await sold(e.type)).toBe(2);
    const row = await orderRow(order);
    s.C = { order, gid: g, event: e, paidAt: new Date(row.paid_at).toISOString() };
    evidence.caso5 = { gid: g, primeira: 503, repeticao: 'confirmado', ingressos: 2 };
  });

  it('6. Resposta da criação perdida e nova tentativa com token novo: acha a cobrança, não cobra duas vezes', async () => {
    const e = await event(5);
    const order = await newOrder(buyer, e, 1);
    // A criação chega ao Mercado Pago nas duas tentativas do adaptador (mesma chave, mesmo corpo), mas nenhuma resposta volta.
    faults.push({ kind: 'resposta_perdida', method: 'POST', path: /^\/v1\/orders$/, times: 2 });
    await pace();
    const lost = await buyer.post(`/orders/${order}/payment`, card(await cardToken()));
    expect(lost.status).toBe(503);
    expect(await orderRow(order)).toMatchObject({ status: 'pendente', gateway_payment_id: null });
    // O comprador tenta de novo: o Brick gera um token NOVO (token de cartão vale uma vez), o corpo muda e a mesma chave dá 409
    // `idempotency_key_already_used` no Mercado Pago. Antes da correção isso virava "recusa": tentativa nova, chave nova e uma
    // SEGUNDA cobrança aprovada. Agora a cobrança da primeira tentativa é procurada pela referência e vinculada.
    let retry: Response | undefined;
    const codes: string[] = [];
    for (let i = 0; i < 8; i++) {
      retry = await buyer.post(`/orders/${order}/payment`, card(await cardToken()));
      if (retry.status === 201) break;
      codes.push(((await retry.json()) as any).erro?.codigo ?? String(retry.status));
      await sleep(3000); // a busca do Mercado Pago indexa com atraso
    }
    expect(retry!.status).toBe(201);
    expect(((await retry!.json()) as any).payment).toMatchObject({ method: 'cartao', status: 'aprovado' });
    expect(codes.every(c => c === 'pagamento_em_verificacao')).toBe(true);
    const g = await gid(order);
    expect(g).toMatch(/^ORDTST/);
    // No Mercado Pago existe UMA order para este pedido; a 2ª tentativa recebeu 409 e não criou nada.
    const conflicts = calls.filter(c => c.method === 'POST' && c.path === '/v1/orders' && c.status === 409).length;
    expect(conflicts).toBeGreaterThanOrEqual(1);
    const search = await mpApi(
      'GET',
      `/v1/orders?begin_date=${new Date(Date.now() - 3_600_000).toISOString()}&end_date=${new Date(Date.now() + 60_000).toISOString()}&external_reference=${order}`,
    );
    expect(search.json.data.map((o: any) => o.id)).toEqual([g]);
    expect(await orderRow(order)).toMatchObject({ status: 'pago', payment_method: 'cartao' });
    expect(await ticketsOf(order)).toHaveLength(1);
    evidence.caso6 = {
      gid: g,
      ordersNoGateway: search.json.data.length,
      respostas409: conflicts,
      tentativasAntes: codes,
    };
  });

  it('7. Processamento interrompido no meio da emissão: nada fica pela metade; a rotina diária retoma', async () => {
    const e = await event(5);
    const order = await newOrder(buyer, e, 3);
    await payApprovedDeferred(buyer, order);
    const g = await gid(order);
    await waitMp(g, 'processed');
    crashNextIssue = true;
    const first = await notify(g, 'order.processed');
    expect(first.status).toBe(503);
    // A transação inteira voltou: nem pedido pago, nem ingresso, nem estoque contado.
    expect(await orderRow(order)).toMatchObject({ status: 'pendente', paid_at: null, reserva: 'ativa' });
    expect(await ticketsOf(order)).toHaveLength(0);
    expect(await sold(e.type)).toBe(0);
    const pending = (await sql('select processing_error from payment_events where order_id = $1', [order])).rows[0];
    expect(pending.processing_error).toBe('erro_interno');
    // Rotina diária (04:00): reprocessa o evento pendente.
    const summary = await runReconciliation(deps, { minIntervalSeconds: 3600 });
    expect(summary.events.done).toBeGreaterThanOrEqual(1);
    expect(await orderRow(order)).toMatchObject({ status: 'pago', reserva: 'convertida' });
    expect(await ticketsOf(order)).toHaveLength(3);
    expect(await sold(e.type)).toBe(3);
    evidence.caso7 = { gid: g, primeira: 503, retomada: summary.events, ingressos: 3 };
  });

  it('8. Valor divergente e pedido divergente em orders reais: nada é aprovado; órfã correta é vinculada', async () => {
    const e = await event(10);
    // a) Order criada fora da plataforma para um pedido aberto, com valor errado (R$ 1,00 contra R$ 40,00).
    const wrongAmount = await newOrder(buyer, e, 1);
    const gWrong = await directOrder(wrongAmount, '1.00');
    await waitMp(gWrong, 'processed');
    expect((await notify(gWrong, 'order.processed')).body).toMatchObject({ outcome: 'divergente' });
    expect(await orderRow(wrongAmount)).toMatchObject({ status: 'pendente', gateway_payment_id: null });
    expect(await ticketsOf(wrongAmount)).toHaveLength(0);
    const audit = (
      await sql("select reason from audit_log where action = 'pagamento.divergente' and entity_id = $1", [wrongAmount])
    ).rows.map(r => r.reason);
    expect(audit).toEqual(['valor']);

    // b) Segunda cobrança aprovada para um pedido que já tem a sua (pedido A): cobrança em dobro, nada emitido.
    const gDouble = await directOrder(s.A!.order, '80.00');
    await waitMp(gDouble, 'processed');
    expect((await notify(gDouble, 'order.processed')).body).toMatchObject({ outcome: 'cobranca_duplicada' });
    expect(await gid(s.A!.order)).toBe(s.A!.gid);
    expect(await ticketsOf(s.A!.order)).toHaveLength(2);

    // c) Referência de pedido que não existe: nada.
    const gNone = await directOrder(randomUUID(), '40.00');
    expect((await notify(gNone, 'order.action_required')).body).toMatchObject({ outcome: 'sem_pedido' });

    // d) Órfã correta (resposta da criação perdida e nunca repetida): o webhook vincula e emite.
    const orphan = await newOrder(buyer, e, 1);
    const gOrphan = await directOrder(orphan, '40.00');
    await waitMp(gOrphan, 'processed');
    expect((await notify(gOrphan, 'order.processed')).body).toMatchObject({ outcome: 'confirmado' });
    expect(await orderRow(orphan)).toMatchObject({
      status: 'pago',
      gateway_payment_id: gOrphan,
      payment_method: 'cartao',
    });
    expect(await ticketsOf(orphan)).toHaveLength(1);
    evidence.caso8 = {
      valorErrado: { gid: gWrong, resultado: 'divergente', trilha: audit },
      cobrancaEmDobro: { gid: gDouble, resultado: 'cobranca_duplicada' },
      semPedido: { gid: gNone },
      orfaVinculada: { gid: gOrphan, resultado: 'confirmado' },
    };
  });

  it('9. Estorno no painel do gateway: ingressos cancelados, vermelho na portaria, paid_at preservado, taxa conta (CA-P5, CA-29)', async () => {
    const { order, gid: g, event: e, paidAt } = s.A!;
    // Uma pessoa já entrou com o primeiro ingresso antes do estorno.
    const [t1, t2] = await ticketsOf(order);
    const entered = (await (await gate.post('/gate/scan', { eventId: e.id, qr: t1.qr_payload })).json()) as any;
    expect(entered.result).toBe('valido');

    await refundInPanel(g);
    const r = await notify(g, 'order.refunded');
    expect(r.body).toMatchObject({ status: 'processada', outcome: 'estornado' });
    const row = await orderRow(order);
    expect(row.status).toBe('estornado');
    expect(new Date(row.paid_at).toISOString()).toBe(paidAt);
    const after = await ticketsOf(order);
    // O que já entrou fica "utilizado" (a entrada aconteceu); o outro é cancelado por estorno.
    expect(after.map(t => [t.status, t.cancel_reason])).toEqual([
      ['utilizado', null],
      ['cancelado', 'estorno'],
    ]);
    const red = (await (await gate.post('/gate/scan', { eventId: e.id, qr: t2.qr_payload })).json()) as any;
    expect(red).toMatchObject({ result: 'cancelado', message: 'Ingresso cancelado' });
    // Estoque: o estorno não devolve (D-14 pendente).
    expect(await sold(e.type)).toBe(2);

    // Repetida e fora de ordem: a aprovação antiga chega depois do estorno; nada volta a valer.
    expect((await notify(g, 'order.processed', { dateCreated: '2026-01-01T00:00:00Z' })).body).toMatchObject({
      outcome: 'ignorado',
    });
    expect((await notify(g, 'order.refunded')).body).toMatchObject({ outcome: 'ignorado' });
    expect((await ticketsOf(order)).map(t => t.status)).toEqual(['utilizado', 'cancelado']);

    const month = paidAt!.slice(0, 7);
    const fee = (await (await admin.get(`/admin/reports/fee?month=${month}&pageSize=200`)).json()) as any;
    const tickets = (
      await sql(
        'select count(*)::int as n from tickets t join orders o on o.id = t.order_id where o.paid_at is not null',
      )
    ).rows[0].n;
    expect(fee.units).toBe(tickets); // todos os emitidos contam, inclusive os do pedido estornado
    const labels = Object.fromEntries(fee.byCurrentStatus.map((x: any) => [x.label, x.units]));
    expect(labels['Cancelado (estorno)']).toBeGreaterThanOrEqual(1);
    evidence.caso9 = {
      gid: g,
      pedido: row.status,
      ingressos: after.map(t => t.status),
      portaria: red.result,
      taxa: labels,
      unidades: fee.units,
    };
  });

  it('10. Estorno no painel com o webhook perdido: a rotina diária reconsulta os pagos e cancela (correção da etapa 07)', async () => {
    const { order, gid: g, paidAt } = s.B!;
    await refundInPanel(g);
    // Nenhuma notificação. A rotina diária passa pelos pedidos pagos de eventos que ainda não aconteceram.
    const summary = await runReconciliation(deps, { minIntervalSeconds: 3600, reversalIntervalSeconds: 0 });
    expect(summary.paid.outcomes.estornado).toBe(1);
    const row = await orderRow(order);
    expect(row.status).toBe('estornado');
    expect(new Date(row.paid_at).toISOString()).toBe(paidAt);
    expect((await ticketsOf(order)).map(t => t.status)).toEqual(['cancelado']);
    evidence.caso10 = { gid: g, rotina: summary.paid };
  });

  it('11. Contestação (chargeback), SIMULADA sobre order real aprovada: cancela, vermelho na portaria, taxa conta', async () => {
    const { order, gid: g, event: e, paidAt } = s.C!;
    faults.push({ kind: 'contestacao', method: 'GET', path: new RegExp(`/v1/orders/${g}$`), times: 1 });
    expect((await notify(g, 'order.charged_back')).body).toMatchObject({ outcome: 'contestado' });
    const row = await orderRow(order);
    expect(row.status).toBe('contestado');
    expect(new Date(row.paid_at).toISOString()).toBe(paidAt);
    const t = await ticketsOf(order);
    expect(t.map(x => [x.status, x.cancel_reason])).toEqual([
      ['cancelado', 'chargeback'],
      ['cancelado', 'chargeback'],
    ]);
    const red = (await (await gate.post('/gate/scan', { eventId: e.id, qr: t[0].qr_payload })).json()) as any;
    expect(red.result).toBe('cancelado');
    const fee = (await (await admin.get(`/admin/reports/fee?month=${paidAt!.slice(0, 7)}&pageSize=200`)).json()) as any;
    const labels = Object.fromEntries(fee.byCurrentStatus.map((x: any) => [x.label, x.units]));
    expect(labels['Cancelado (contestação)']).toBe(2);
    evidence.caso11 = { gid: g, pedido: row.status, portaria: red.result, taxa: labels };
  });

  it('12. Estorno ANTES de a plataforma ver a aprovação (fora de ordem): nada é emitido; o estoque volta quando a reserva vence', async () => {
    const e = await event(2);
    const order = await newOrder(buyer, e, 2);
    await payApprovedDeferred(buyer, order);
    const g = await gid(order);
    await waitMp(g, 'processed');
    await refundInPanel(g);
    // As notificações chegam invertidas: primeiro o estorno, depois a aprovação.
    expect((await notify(g, 'order.refunded')).body).toMatchObject({ outcome: 'ignorado' });
    expect((await notify(g, 'order.processed', { dateCreated: '2026-01-01T00:00:00Z' })).body).toMatchObject({
      outcome: 'ignorado',
    });
    expect(await orderRow(order)).toMatchObject({ status: 'pendente', paid_at: null, reserva: 'ativa' });
    expect(await ticketsOf(order)).toHaveLength(0);
    const trail = (
      await sql(
        "select count(*)::int as n from audit_log where action = 'pagamento.estorno_fora_de_fluxo' and entity_id = $1",
        [order],
      )
    ).rows[0].n;
    expect(trail).toBe(1);
    // A reserva vence (aqui adiantada no banco) e o estoque volta; ninguém foi cobrado.
    await sql("update reservations set expires_at = now() - interval '1 minute' where order_id = $1", [order]);
    await expireOverdue(deps, { orderId: order });
    expect(await orderRow(order)).toMatchObject({ status: 'expirado', reserva: 'expirada' });
    expect(await sold(e.type)).toBe(0);
    await newOrder(await person('cliente'), e, 2); // as 2 unidades estão à venda de novo
    evidence.caso12 = { gid: g, pedido: 'expirado', ingressos: 0, trilha: trail };
  });

  it('Banco: nenhum pedido ou ingresso duplicado, vendidos = ingressos emitidos, paid_at só em quem foi aprovado', async () => {
    const dupOrders = (
      await sql(
        'select gateway_payment_id from orders where gateway_payment_id is not null group by 1 having count(*) > 1',
      )
    ).rows;
    const dupQr = (await sql('select qr_payload from tickets group by 1 having count(*) > 1')).rows;
    const overIssued = (
      await sql(`select i.id from order_items i left join tickets t on t.order_item_id = i.id
                  group by i.id, i.quantity having count(t.id) > i.quantity`)
    ).rows;
    const soldVsTickets = (
      await sql(`select tt.id, tt.quantity_sold, (select count(*)::int from tickets t where t.ticket_type_id = tt.id) as emitidos
                   from ticket_types tt where tt.quantity_sold <> (select count(*) from tickets t where t.ticket_type_id = tt.id)`)
    ).rows;
    const paidWithoutApproval = (
      await sql(
        "select id from orders where paid_at is not null and status not in ('pago','estornado','contestado','cancelado','pago_sem_estoque')",
      )
    ).rows;
    const overCapacity = (
      await sql(`select tt.id from ticket_types tt where tt.quantity_sold + coalesce((select sum(quantity) from reservations r
                  where r.ticket_type_id = tt.id and r.status = 'ativa' and r.expires_at > now()), 0) > tt.quantity_total`)
    ).rows;
    expect({ dupOrders, dupQr, overIssued, soldVsTickets, paidWithoutApproval, overCapacity }).toEqual({
      dupOrders: [],
      dupQr: [],
      overIssued: [],
      soldVsTickets: [],
      paidWithoutApproval: [],
      overCapacity: [],
    });
    const byStatus = (await sql('select status::text, count(*)::int as n from orders group by 1 order by 1')).rows;
    const ticketsByStatus = (await sql('select status::text, count(*)::int as n from tickets group by 1 order by 1'))
      .rows;
    const events = (
      await sql(
        'select signature_valid, count(*)::int as n, count(processed_at)::int as processados from payment_events group by 1',
      )
    ).rows;
    evidence.banco = {
      pedidos: byStatus,
      ingressos: ticketsByStatus,
      notificacoes: events,
      chamadasAoGateway: calls.length,
    };
  });
});
