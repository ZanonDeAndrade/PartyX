import { describe, expect, it } from 'vitest';

/**
 * Onde o Mercado Pago informa a TARIFA de um pagamento criado pela Orders API (relatório da taxa de serviço, D-90). Ambiente de teste
 * real: uma order de R$ 31,58 com o cartão de teste APRO. Não imprime token, chave, CPF nem dados do pagador: só nomes de campos e
 * os valores de tarifa.
 */
const TOKEN = process.env.MP_ACCESS_TOKEN;
const PUBLIC_KEY = process.env.MP_PUBLIC_KEY;
const MP = 'https://api.mercadopago.com';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function api(method: string, path: string, body?: unknown, key?: string) {
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
}

const paths = (x: unknown, p = ''): string[] =>
  x && typeof x === 'object'
    ? Object.entries(x).flatMap(([k, v]) =>
        Array.isArray(v)
          ? v.flatMap((e, i) => paths(e, `${p}${k}[${i}].`))
          : v && typeof v === 'object'
            ? paths(v, `${p}${k}.`)
            : [`${p}${k}`],
      )
    : [];

// Credenciais de teste do .env.local (scripts/setup-mp-credentials.sh). A conta é conferida antes: usuário de teste do Mercado Pago.
describe('tarifa do Mercado Pago (ambiente de teste)', () => {
  it('order aprovada: campos de tarifa na order e no pagamento', async () => {
    expect({ token: Boolean(TOKEN), chavePublica: Boolean(PUBLIC_KEY) }).toEqual({ token: true, chavePublica: true });
    // Conta de TESTE do Mercado Pago (usuário de teste), nunca a de produção da PartyX: confere antes de criar qualquer order.
    const me = await api('GET', '/users/me');
    const testAccount = Boolean(TOKEN!.startsWith('TEST-') || (me.json?.tags ?? []).includes('test_user'));
    console.log('conta de teste:', testAccount ? 'sim' : 'não');
    expect(testAccount).toBe(true);
    const tokenRes = await fetch(`${MP}/v1/card_tokens?public_key=${PUBLIC_KEY}`, {
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
    const token = ((await tokenRes.json()) as { id: string }).id;
    const ref = `prova-tarifa-${Date.now()}`;
    const created = await api(
      'POST',
      '/v1/orders',
      {
        type: 'online',
        processing_mode: 'automatic',
        external_reference: ref,
        total_amount: '31.58',
        payer: { email: 'test@testuser.com', first_name: 'APRO' },
        transactions: { payments: [{ amount: '31.58', payment_method: { id: 'visa', type: 'credit_card', token, installments: 1 } }] },
      },
      ref,
    );
    console.log('criação:', created.status, created.json?.status, created.json?.status_detail);
    expect(created.status).toBe(201);
    let order: any;
    for (let i = 0; i < 20; i++) {
      order = (await api('GET', `/v1/orders/${created.json.id}`)).json;
      if (order?.status === 'processed') break;
      await sleep(1500);
    }
    const all = paths(order).filter(k => !/payer|identification|email|name|card|token|first_six|last_four/i.test(k));
    console.log('GET /v1/orders:', order?.status, '| campos:', all.join(', '));
    const pick = (k: string) => k.split(/[.[\]]/).filter(Boolean).reduce((a: any, s) => a?.[s], order);
    console.log(
      'campos de valor e tarifa na order:',
      JSON.stringify(all.filter(k => /fee|net|amount|charge/i.test(k)).map(k => [k, pick(k)])),
    );
    const pay = order?.transactions?.payments?.[0] ?? {};
    const search = await api('GET', `/v1/payments/search?external_reference=${ref}`);
    const found = search.json?.results?.[0];
    console.log('payments/search:', search.status, 'resultados:', search.json?.results?.length ?? null);
    if (found)
      console.log(
        'fee_details:',
        JSON.stringify(found.fee_details),
        '| net_received_amount:',
        found.transaction_details?.net_received_amount,
        '| transaction_amount:',
        found.transaction_amount,
        '| id numérico:',
        typeof found.id,
      );
    for (const [label, pid] of [
      ['reference_id', pay.reference_id],
      ['id do pagamento na order', pay.id],
    ] as const) {
      if (!pid) continue;
      const g = await api('GET', `/v1/payments/${pid}`);
      console.log(`GET /v1/payments/{${label}}:`, g.status, g.json?.fee_details ? JSON.stringify(g.json.fee_details) : (g.json?.message ?? ''));
    }
  });
});
