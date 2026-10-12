import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSnapshotAgainstOrder, type GatewayStatus } from '../../domain/payment';
import { createFakeClock } from '../../providers/clock';
import { GatewayError, GatewayKeyReusedError, GatewayRejectedError } from '../gateway';
import { createMercadoPagoGateway, SANDBOX_PAYER_EMAIL } from './index';
import {
  amountFromCents,
  centsFromAmount,
  declineReasonFor,
  snapshotFrom,
  toGatewayStatus,
  type MpOrder,
} from './mapping';
import { buildManifest, signManifest, verifySignature } from './signature';

const fixture = <T = MpOrder>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;

const ORDER_ID = '11111111-2222-4333-8444-555555555555';
const COLLECTOR = '123456789';
const SECRET = 'segredo-de-teste-do-webhook-0123456789abcdef';

describe('Mercado Pago: estados da order', () => {
  const cases: [string, GatewayStatus | null][] = [
    ['processed', 'aprovado'],
    ['failed', 'recusado'],
    ['canceled', 'expirado'],
    ['expired', 'expirado'],
    ['refunded', 'estornado'],
    ['charged_back', 'contestado'],
    ['created', 'pendente'],
    ['processing', 'pendente'],
    ['action_required', 'pendente'],
    ['in_review', 'pendente'],
    ['estado_novo_do_gateway', null],
  ];
  it.each(cases)('%s → %s', (mp, ours) => {
    expect(toGatewayStatus(mp)).toBe(ours);
  });

  it('estado desconhecido nunca vira aprovado: fica aguardando e marcado', () => {
    const s = snapshotFrom({ ...fixture('order-cartao-aprovado.json'), status: 'novo_estado' });
    expect(s.status).toBe('pendente');
    expect(s.statusDetail).toBe('estado_desconhecido');
  });

  it.each([
    ['bad_filled_card_data', 'dados_do_cartao'],
    ['invalid_card_token', 'dados_do_cartao'],
    ['insufficient_amount', 'saldo_insuficiente'],
    ['card_insufficient_amount', 'saldo_insuficiente'],
    ['rejected_by_issuer', 'nao_autorizado'],
    ['required_call_for_authorize', 'nao_autorizado'],
    ['card_disabled', 'cartao_desabilitado'],
    ['high_risk', 'seguranca'],
    ['max_attempts_exceeded', 'limite_de_tentativas'],
    ['3ds_challenge_expired', 'autenticacao'],
    ['processing_error', 'outro'],
    [null, 'outro'],
  ] as const)('recusa %s → %s', (detail, reason) => {
    expect(declineReasonFor(detail)).toBe(reason);
  });

  it('cartão recusado (resposta 402): recusado, com o código guardado e a categoria para o comprador', () => {
    const s = snapshotFrom(fixture<{ data: MpOrder }>('order-cartao-recusado-402.json').data);
    expect(s).toMatchObject({
      status: 'recusado',
      method: 'cartao',
      statusDetail: 'insufficient_amount',
      declineReason: 'saldo_insuficiente',
      amountCents: 16000,
    });
  });

  it('Pix pendente: QR e copia e cola do gateway, vencimento e conta', () => {
    const s = snapshotFrom(fixture('order-pix-pendente.json'));
    expect(s).toMatchObject({
      gatewayPaymentId: 'ORD01HRYFWNYRE1MR1E60MW3X0T2P',
      status: 'pendente',
      method: 'pix',
      orderRef: ORDER_ID,
      amountCents: 18000,
      currency: 'BRL',
      accountId: COLLECTOR,
      statusDetail: 'waiting_transfer',
      declineReason: null,
    });
    expect(s.pix?.copyPaste).toMatch(/^000201/);
    expect(s.pix?.qrCodeImage).toMatch(/^data:image\/png;base64,iVBOR/);
    expect(s.pix?.expiresAt.toISOString()).toBe('2026-10-10T15:31:00.000Z');
  });

  it('mais de uma transação na order: forma desconhecida, nunca confere com o pedido', () => {
    const base = fixture('order-cartao-aprovado.json');
    const tx = base.transactions!.payments![0]!;
    const s = snapshotFrom({ ...base, transactions: { payments: [tx, tx] } });
    expect(s.method).toBe('outro');
    expect(
      checkSnapshotAgainstOrder(s, { id: ORDER_ID, totalCents: 24000, paymentMethod: 'cartao' }, COLLECTOR).ok,
    ).toBe(false);
  });
});

describe('Mercado Pago: valores', () => {
  it('centavos → reais com 2 casas, montados como texto', () => {
    expect(amountFromCents(1)).toBe('0.01');
    expect(amountFromCents(1005)).toBe('10.05');
    expect(amountFromCents(24000)).toBe('240.00');
    expect(amountFromCents(100_000_000)).toBe('1000000.00');
    expect(() => amountFromCents(0)).toThrow();
    expect(() => amountFromCents(10.5)).toThrow();
  });
  it('reais → centavos, sem ponto flutuante; formato estranho vira NaN (que nunca confere)', () => {
    expect(centsFromAmount('240.00')).toBe(24000);
    expect(centsFromAmount('10.5')).toBe(1050);
    expect(centsFromAmount('0.1')).toBe(10);
    expect(centsFromAmount(12.34)).toBe(1234);
    expect(centsFromAmount('7')).toBe(700);
    for (const bad of ['1.234', '-1.00', '1e3', '', null, undefined]) expect(centsFromAmount(bad)).toBeNaN();
  });
});

describe('Mercado Pago: conferência antes de aprovar (divergência de valor, moeda, referência e conta)', () => {
  const order = { id: ORDER_ID, totalCents: 24000, paymentMethod: 'cartao' as const };
  const approved = fixture('order-cartao-aprovado.json');
  it('order que confere: aprova', () => {
    expect(checkSnapshotAgainstOrder(snapshotFrom(approved), order, COLLECTOR)).toEqual({ ok: true, mismatches: [] });
  });
  it.each([
    ['valor', { total_amount: '239.99' }],
    ['moeda', { currency: 'USD' }],
    ['pedido', { external_reference: '99999999-2222-4333-8444-555555555555' }],
    ['conta', { user_id: '987654321' }],
  ] as const)('%s divergente: não aprova', (field, patch) => {
    const check = checkSnapshotAgainstOrder(snapshotFrom({ ...approved, ...patch }), order, COLLECTOR);
    expect(check.ok).toBe(false);
    expect(check.mismatches).toContain(field);
  });
});

describe('Mercado Pago: assinatura do webhook (x-signature)', () => {
  const now = Date.parse('2026-10-10T15:00:00Z');
  const ts = String(now / 1000);
  const dataId = 'ORD01M28P44G5FG8RJPM579EH56FV';
  const requestId = 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e';
  const sign = (over: { ts?: string; dataId?: string | null; requestId?: string | null; secret?: string } = {}) => {
    const t = over.ts ?? ts;
    const manifest = buildManifest({
      dataId: over.dataId === undefined ? dataId : over.dataId,
      requestId: over.requestId === undefined ? requestId : over.requestId,
      ts: t,
    });
    return `ts=${t},v1=${signManifest(manifest, over.secret ?? SECRET)}`;
  };
  const check = (xSignature: string | null, over: { dataId?: string | null; requestId?: string | null } = {}) =>
    verifySignature({
      xSignature,
      xRequestId: over.requestId === undefined ? requestId : over.requestId,
      dataId: over.dataId === undefined ? dataId : over.dataId,
      secret: SECRET,
      nowMs: now,
    });

  it('manifesto da documentação: id em minúsculas, request-id e ts', () => {
    expect(buildManifest({ dataId, requestId, ts })).toBe(
      `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`,
    );
    expect(buildManifest({ dataId: null, requestId: null, ts })).toBe(`ts:${ts};`);
  });
  it('válida', () => expect(check(sign())).toBe('ok'));
  it('válida com ts em milissegundos', () => {
    const ms = String(now);
    expect(check(sign({ ts: ms }))).toBe('ok');
  });
  it('sem x-request-id: a parte sai do manifesto', () => {
    expect(check(sign({ requestId: null }), { requestId: null })).toBe('ok');
  });
  it('inválida: outro segredo, outro id ou outro request-id', () => {
    expect(check(sign({ secret: 'outro-segredo-0123456789' }))).toBe('assinatura_invalida');
    expect(check(sign(), { dataId: 'ORD01OUTRAORDEMQUALQUER0000' })).toBe('assinatura_invalida');
    expect(check(sign(), { requestId: 'outro-request' })).toBe('assinatura_invalida');
  });
  it('ts fora da tolerância (5 minutos), para trás e para a frente', () => {
    expect(check(sign({ ts: String(now / 1000 - 301) }))).toBe('fora_do_prazo');
    expect(check(sign({ ts: String(now / 1000 + 301) }))).toBe('fora_do_prazo');
    expect(check(sign({ ts: String(now / 1000 - 299) }))).toBe('ok');
  });
  it('ausente ou malformada', () => {
    expect(check(null)).toBe('assinatura_ausente');
    expect(check('ts=abc,v1=xyz')).toBe('formato_invalido');
    expect(check(`v1=${'a'.repeat(64)}`)).toBe('formato_invalido');
    expect(check(`ts=${ts}`)).toBe('formato_invalido');
  });
});

/** `fetch` falso: registra as chamadas e devolve as respostas em ordem. */
function fakeFetch(responses: (Response | Error)[]) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: any }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error('sem resposta preparada');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { impl, calls };
}
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Mercado Pago: adaptador (HTTP)', () => {
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const payer = { name: 'Maria Fictícia Souza', email: 'maria@exemplo.com', cpf: '12345678909' };
  const make = (responses: (Response | Error)[], liveMode = false) => {
    const f = fakeFetch(responses);
    const gateway = createMercadoPagoGateway({
      accessToken: 'APP_USR-token-ficticio-de-teste-000000',
      publicKey: 'APP_USR-chave-publica-ficticia-0000',
      webhookSecret: SECRET,
      collectorId: COLLECTOR,
      liveMode,
      clock,
      http: { fetchImpl: f.impl, sleep: async () => {}, retries: 1 },
    });
    return { gateway, calls: f.calls };
  };
  const card = {
    orderId: ORDER_ID,
    amountCents: 24000,
    payer,
    description: 'Ingressos PartyX, pedido 10001',
    idempotencyKey: `order:${ORDER_ID}:cartao`,
    mode: 'token' as const,
    cardToken: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    installments: 1,
    paymentMethodId: 'master',
    paymentTypeId: 'credit_card',
  };

  it('cartão: corpo da order com valor do pedido, referência, uma transação à vista e a chave de idempotência', async () => {
    const { gateway, calls } = make([jsonResponse(201, fixture('order-cartao-aprovado.json'))]);
    const created = await gateway.createCard(card);
    expect(created).toMatchObject({ gatewayPaymentId: 'ORDTST01AAAAAAAAAAAAAAAAAAAAAAAA', status: 'aprovado' });
    const [call] = calls;
    expect(call!.url).toBe('https://api.mercadopago.com/v1/orders');
    expect(call!.method).toBe('POST');
    expect(call!.headers['X-Idempotency-Key']).toBe(card.idempotencyKey);
    expect(call!.headers.Authorization).toMatch(/^Bearer /);
    expect(call!.body).toMatchObject({
      type: 'online',
      processing_mode: 'automatic',
      external_reference: ORDER_ID,
      total_amount: '240.00',
      payer: {
        email: SANDBOX_PAYER_EMAIL,
        first_name: 'Maria',
        identification: { type: 'CPF', number: '12345678909' },
      },
      transactions: {
        payments: [
          {
            amount: '240.00',
            payment_method: { id: 'master', type: 'credit_card', token: card.cardToken, installments: 1 },
          },
        ],
      },
    });
  });

  it('produção: o e-mail do pagador é o do comprador (no teste, o da documentação)', async () => {
    const { gateway, calls } = make([jsonResponse(201, fixture('order-cartao-aprovado.json'))], true);
    await gateway.createCard(card);
    expect(calls[0]!.body.payer.email).toBe('maria@exemplo.com');
  });

  it('cartão recusado (HTTP 402 com a order em data): vira cobrança recusada, sem erro', async () => {
    const { gateway } = make([jsonResponse(402, fixture('order-cartao-recusado-402.json'))]);
    const created = await gateway.createCard({ ...card, amountCents: 16000 });
    expect(created.status).toBe('recusado');
    expect(created.snapshot.declineReason).toBe('saldo_insuficiente');
  });

  it('idempotência: falha de rede na criação repete com a MESMA chave e devolve a mesma order', async () => {
    const { gateway, calls } = make([
      new TypeError('fetch failed'),
      jsonResponse(201, fixture('order-cartao-aprovado.json')),
    ]);
    const created = await gateway.createCard(card);
    expect(created.gatewayPaymentId).toBe('ORDTST01AAAAAAAAAAAAAAAAAAAAAAAA');
    expect(calls).toHaveLength(2);
    expect(calls.map(c => c.headers['X-Idempotency-Key'])).toEqual([card.idempotencyKey, card.idempotencyKey]);
  });

  it('chave já usada com outro corpo (409): NÃO é recusa (a primeira cobrança pode existir); sem repetir', async () => {
    const { gateway, calls } = make([
      jsonResponse(409, {
        errors: [{ code: 'idempotency_key_already_used', message: 'X-Idempotency-Key already used.' }],
      }),
    ]);
    const error = await gateway.createCard(card).catch(e => e);
    expect(error).toBeInstanceOf(GatewayKeyReusedError);
    expect(error).not.toBeInstanceOf(GatewayRejectedError);
    expect(error.retryable).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('busca de orders pela referência: data de início e fim, referência conferida de novo, páginas', async () => {
    const ref = '0b6f2f0e-6a65-4d55-9a3c-6a1f7e2b9c10';
    const order = (id: string, external_reference: string) => ({
      id,
      status: 'processed',
      external_reference,
      total_amount: '80.00',
      currency: 'BRL',
      user_id: '123456789',
      transactions: {
        payments: [{ id: 'PAY01X', status: 'processed', payment_method: { id: 'pix', type: 'bank_transfer' } }],
      },
    });
    const { gateway, calls } = make([
      jsonResponse(200, {
        data: [
          order('ORDTST01AAAAAAAAAAAAAAAAAAAAAAAA', ref),
          order('ORDTST01BBBBBBBBBBBBBBBBBBBBBBBB', 'outro-pedido'),
        ],
        paging: { total: '3', total_pages: '2', offset: '0', limit: '50' },
      }),
      jsonResponse(200, {
        data: [order('ORDTST01CCCCCCCCCCCCCCCCCCCCCCCC', ref)],
        paging: { total: '3', total_pages: '2', offset: '50', limit: '50' },
      }),
    ]);
    const found = await gateway.findPaymentsByOrderRef!(ref, new Date('2026-10-10T14:50:00Z'));
    expect(found.map(f => f.gatewayPaymentId)).toEqual([
      'ORDTST01AAAAAAAAAAAAAAAAAAAAAAAA',
      'ORDTST01CCCCCCCCCCCCCCCCCCCCCCCC',
    ]);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/v1/orders');
    expect(url.searchParams.get('external_reference')).toBe(ref);
    expect(url.searchParams.get('begin_date')).toBe('2026-10-10T14:45:00.000Z');
    expect(url.searchParams.get('end_date')).toBeTruthy();
    expect(new URL(calls[1]!.url).searchParams.get('page')).toBe('2');
  });

  it('5xx e tempo esgotado: "não confirmado" (erro que pode repetir), nunca aprovado; sem dado do comprador na mensagem', async () => {
    const { gateway } = make([jsonResponse(503, {}), jsonResponse(502, {})]);
    const error = await gateway.getPayment('ORDTST01AAAAAAAAAAAAAAAAAAAAAAAA').catch(e => e);
    expect(error).toBeInstanceOf(GatewayError);
    expect(error.retryable).toBe(true);
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    const { gateway: g2 } = make([timeout, timeout]);
    const e2 = await g2.createCard(card).catch(e => e);
    expect(e2).toBeInstanceOf(GatewayError);
    expect(String(e2.message)).not.toMatch(/12345678909|maria@|APP_USR|token/i);
  });

  it('credencial recusada (401): erro de configuração, sem repetir', async () => {
    const { gateway, calls } = make([jsonResponse(401, { errors: [{ code: 'invalid_credentials' }] })]);
    const error = await gateway.getPayment('ORDTST01AAAAAAAAAAAAAAAAAAAAAAAA').catch(e => e);
    expect(error).toBeInstanceOf(GatewayError);
    expect(error.retryable).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('número de cartão onde só cabe token: recusado antes de qualquer chamada', async () => {
    const { gateway, calls } = make([]);
    await expect(gateway.createCard({ ...card, cardToken: '5480 8328 0103 3311' })).rejects.toBeInstanceOf(
      GatewayRejectedError,
    );
    expect(calls).toHaveLength(0);
  });

  it('Pix: vencimento como duração ISO 8601, dentro dos limites da documentação (30 min a 30 dias)', async () => {
    const { gateway, calls } = make([jsonResponse(201, fixture('order-pix-pendente.json'))]);
    const pix = {
      orderId: ORDER_ID,
      amountCents: 18000,
      payer,
      description: 'Ingressos PartyX, pedido 10002',
      idempotencyKey: `order:${ORDER_ID}:pix`,
    };
    const created = await gateway.createPix({ ...pix, expiresAt: new Date(clock.now().getTime() + 1860_000) });
    expect(created.snapshot.pix?.copyPaste).toBeTruthy();
    expect(calls[0]!.body.transactions.payments[0]).toEqual({
      amount: '180.00',
      payment_method: { id: 'pix', type: 'bank_transfer' },
      expiration_time: 'PT1860S',
    });
    await expect(
      gateway.createPix({ ...pix, expiresAt: new Date(clock.now().getTime() + 10 * 60_000) }),
    ).rejects.toBeInstanceOf(GatewayRejectedError);
  });

  it('consulta: GET /v1/orders/{id}; id fora do formato não sai para a rede', async () => {
    const { gateway, calls } = make([jsonResponse(200, fixture('order-cartao-aprovado.json'))]);
    const s = await gateway.getPayment('ORDTST01AAAAAAAAAAAAAAAAAAAAAAAA');
    expect(s.status).toBe('aprovado');
    expect(calls[0]!.url).toBe('https://api.mercadopago.com/v1/orders/ORDTST01AAAAAAAAAAAAAAAAAAAAAAAA');
    await expect(gateway.getPayment('../users/me')).rejects.toBeInstanceOf(GatewayRejectedError);
    expect(calls).toHaveLength(1);
  });

  it('consulta que devolve outra order: erro, nunca usa a resposta', async () => {
    const { gateway } = make([jsonResponse(200, fixture('order-cartao-aprovado.json'))]);
    await expect(gateway.getPayment('ORDTST01CCCCCCCCCCCCCCCCCCCCCCCC')).rejects.toBeInstanceOf(GatewayError);
  });

  describe('notificação', () => {
    const body = JSON.stringify(fixture('notificacao-order.json'));
    const dataId = 'ORD01M28P44G5FG8RJPM579EH56FV';
    const headersFor = (over: { ts?: number; secret?: string; id?: string } = {}) => {
      const ts = String(Math.floor((over.ts ?? clock.now().getTime()) / 1000));
      const requestId = 'req-0001';
      const v1 = signManifest(buildManifest({ dataId: over.id ?? dataId, requestId, ts }), over.secret ?? SECRET);
      return new Headers({ 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId });
    };
    const query = new URLSearchParams({ 'data.id': dataId, type: 'order' });

    it('válida: reconsulta a order do id assinado', async () => {
      const { gateway } = make([]);
      const r = await gateway.verifyNotification({ headers: headersFor(), rawBody: body, query });
      expect(r).toMatchObject({ valid: true, type: 'order.processed', subject: { kind: 'payment', id: dataId } });
    });
    it('assinatura inválida, fora do prazo ou corpo de outra order: recusada', async () => {
      const { gateway } = make([]);
      expect(
        await gateway.verifyNotification({ headers: headersFor({ secret: 'x'.repeat(20) }), rawBody: body, query }),
      ).toEqual({
        valid: false,
        reason: 'assinatura_invalida',
      });
      expect(
        await gateway.verifyNotification({
          headers: headersFor({ ts: clock.now().getTime() - 600_000 }),
          rawBody: body,
          query,
        }),
      ).toEqual({ valid: false, reason: 'fora_do_prazo' });
      const other = new URLSearchParams({ 'data.id': 'ORD01OUTRAORDEMQUALQUER0000', type: 'order' });
      expect(
        await gateway.verifyNotification({
          headers: headersFor({ id: 'ORD01OUTRAORDEMQUALQUER0000' }),
          rawBody: body,
          query: other,
        }),
      ).toEqual({ valid: false, reason: 'formato_invalido' });
    });
    it('tópico que a PartyX não usa: autêntica, mas ignorada', async () => {
      const { gateway } = make([]);
      const other = JSON.stringify({ ...JSON.parse(body), type: 'topic_merchant_order_wh' });
      const r = await gateway.verifyNotification({ headers: headersFor(), rawBody: other, query });
      expect(r).toMatchObject({ valid: true, subject: { kind: 'ignored' } });
    });
  });
});
