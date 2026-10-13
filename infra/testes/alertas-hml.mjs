// Disparo DE PROPÓSITO, na HOMOLOGAÇÃO, dos sinais `estorno_parcial` e `cobranca_duplicada` pelo código real (checklist de alertas,
// docs/infraestrutura.md, itens 4 e 5). Mercado Pago de TESTE apenas. Nunca produção.
//
// Uso: infra/testes/alertas-hml.sh (lê os segredos e chama este arquivo). Variáveis: E2E_DATABASE_URL (banco de homologação),
// RUN_URL (run.app da homologação), PUBLIC_HOST, e no .env.local as credenciais de TESTE do Mercado Pago (as mesmas gravadas na
// homologação por scripts/setup-mp-credentials-homologacao.sh). Nada de token, assinatura ou CPF é impresso.
//
// O que faz:
// 1. Cria um evento fictício (fora da vitrine) e um comprador "APRO" no banco de homologação, sufixados pela rodada.
// 2. Pedido A (2 unidades) e pedido B (1 unidade), pagos pela plataforma com o cartão de TESTE APRO (o Pix de teste oscilou em 12/10).
// 3. Estorno PARCIAL da cobrança de A direto na API do Mercado Pago (como a PartyX faria no painel) e a notificação `order.refunded`
//    assinada com a assinatura secreta da homologação, entregue pelo Hosting. Esperado: A continua pago, nada cancelado, trilha
//    `pagamento.estorno_parcial` e log com `alert=estorno_parcial`.
// 4. Segunda cobrança aprovada, criada direto na API, com a referência externa e o valor de B, e a notificação assinada.
//    Esperado: resposta `cobranca_duplicada`, nada emitido, B intacto, log com `alert=cobranca_duplicada`.
// As notificações das compras de teste vêm do Mercado Pago assinadas pela aplicação do usuário de teste (a plataforma recusa com 401,
// docs/pagamento-mercadopago.md); por isso a entrega é montada aqui, como na suíte do sandbox. O servidor reconsulta a order REAL.
import { createHmac, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(`${process.cwd()}/`);
const pg = require('pg');
const ROOT = process.cwd();
process.loadEnvFile(path.join(ROOT, '.env.local'));
const { MP_ACCESS_TOKEN: TOKEN, MP_PUBLIC_KEY: PUBLIC_KEY, MP_WEBHOOK_SECRET: SECRET, E2E_DATABASE_URL: DB, RUN_URL, PUBLIC_HOST } = process.env;
if (!TOKEN || !PUBLIC_KEY || !SECRET) throw new Error('credenciais de TESTE do Mercado Pago ausentes no .env.local');
if (!DB || !RUN_URL || !PUBLIC_HOST) throw new Error('use infra/testes/alertas-hml.sh');
if (!/^https:\/\/partyx-hml-[a-z0-9-]+\.run\.app$/.test(RUN_URL) || PUBLIC_HOST !== 'partyx-hml.web.app')
  throw new Error('recusado: só a homologação');
const ORIGIN = `https://${PUBLIC_HOST}`;
const MP = 'https://api.mercadopago.com';
const RUN = Math.floor(Date.now() / 1000).toString(36).slice(-6);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function mp(method, p, body, key) {
  const res = await fetch(`${MP}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(key ? { 'X-Idempotency-Key': key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const me = await mp('GET', '/users/me');
if (!me.json?.tags?.includes('test_user')) throw new Error('recusado: as credenciais não são de usuário de TESTE');
const collector = String(me.json.id);

const pool = new pg.Pool({ connectionString: DB, max: 1 });
const sql = async (t, p = []) => (await pool.query(t, p)).rows;
const mark = (await sql(`select shobj_description(oid, 'pg_database') as c from pg_database where datname = current_database()`))[0]?.c;
if (mark !== 'partyx-env:homologacao') throw new Error('recusado: o banco não tem a marca de homologação');

// 1. Semente.
const cpf = n => {
  const d = String(500000000 + n).split('').map(Number);
  for (const len of [9, 10]) d.push(((d.slice(0, len).reduce((t, x, i) => t + x * (len + 1 - i), 0) * 10) % 11) % 10);
  return d.join('');
};
const argon = require('@node-rs/argon2');
const PASSWORD = `alerta-${randomUUID()}`;
const email = `alerta.${RUN}@exemplo.com`;
await sql(
  `insert into users (name, email, password_hash, role, is_active, must_change_password, phone, cpf)
   values ($1, $2, $3, 'cliente', true, false, '(11) 98765-4321', $4)`,
  [`APRO Alerta ${RUN.toUpperCase()} Fictício`, email, await argon.hash(PASSWORD), cpf(parseInt(RUN, 36) % 400_000_000)],
);
const slug = `alertas-hml-${RUN}`;
const eventId = (
  await sql(
    `insert into events (slug, name, starts_at, venue, address, description, attractions, age_rating, status, is_featured)
     values ($1, $2, now() + interval '20 days', 'Clube Fictício', 'Rua Fictícia, 1, São Paulo',
             'Evento fictício do disparo de alertas em homologação.', '{}', '18 anos', 'publicado', false) returning id`,
    [slug, `Alertas Homologação ${RUN.toUpperCase()}`],
  )
)[0].id;
const typeId = (
  await sql(
    `insert into ticket_types (event_id, name, price_cents, quantity_total, sales_start_at, sales_end_at, is_active)
     values ($1, 'Pista', 4000, 10, now() - interval '1 day', now() + interval '19 days', true) returning id`,
    [eventId],
  )
)[0].id;
log(`rodada ${RUN}: evento ${slug}`);

// Sessão do comprador (pelo run.app, com o X-Forwarded-Host do domínio público, como o Hosting faz).
let cookie = '';
const api = async (method, p, body) => {
  const res = await fetch(`${RUN_URL}/api${p}`, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      'x-forwarded-host': PUBLIC_HOST,
      ...(cookie ? { cookie } : {}),
      ...(api.csrf ? { 'x-csrf-token': api.csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, json: await res.json().catch(() => null) };
};
const login = await api('POST', '/auth/login', { email, password: PASSWORD });
if (login.status !== 200) throw new Error(`login ${login.status}`);
api.csrf = (await api('GET', '/auth/me')).json?.csrfToken;

let last = 0;
const pace = async () => {
  const wait = last + 8000 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
};
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
  if (res.status !== 201) throw new Error(`token do cartão de teste: ${res.status}`);
  return (await res.json()).id;
}
const orderRow = async id =>
  (await sql(`select status, paid_at, gateway_payment_id as gid, total_cents from orders where id = $1`, [id]))[0];
const ticketsOf = async id => await sql(`select id, status from tickets where order_id = $1`, [id]);

async function paidOrder(quantity) {
  const o = await api('POST', '/orders', { eventSlug: slug, items: [{ ticketTypeId: typeId, quantity }], couponCode: null });
  if (o.status !== 201) throw new Error(`pedido ${o.status} ${JSON.stringify(o.json)}`);
  const id = o.json.order.id;
  await pace();
  const pay = await api('POST', `/orders/${id}/payment`, {
    method: 'cartao',
    cardToken: await cardToken(),
    paymentMethodId: 'visa',
    paymentTypeId: 'credit_card',
    installments: 1,
  });
  if (pay.status !== 201) throw new Error(`pagamento ${pay.status} ${JSON.stringify(pay.json)}`);
  for (let i = 0; i < 60; i++) {
    const row = await orderRow(id);
    if (row.status === 'pago') return { id, gid: row.gid };
    await sleep(5000);
  }
  throw new Error(`pedido ${id} não ficou pago em 5 min`);
}
async function waitMp(gid, ok) {
  for (let i = 0; i < 60; i++) {
    const r = await mp('GET', `/v1/orders/${gid}`);
    if (ok(r.json)) return r.json;
    await sleep(2000);
  }
  throw new Error(`order ${gid} não chegou ao estado esperado no Mercado Pago`);
}
/** Notificação do tópico order, assinada (manifesto id;request-id;ts), entregue pelo Hosting como o Mercado Pago faria. */
async function notify(gid, action) {
  const ts = String(Math.floor(Date.now() / 1000));
  const rid = randomUUID();
  const v1 = createHmac('sha256', SECRET).update(`id:${gid.toLowerCase()};request-id:${rid};ts:${ts};`).digest('hex');
  const res = await fetch(`${ORIGIN}/api/webhooks/payments?data.id=${gid}&type=order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid },
    body: JSON.stringify({
      action,
      api_version: 'v1',
      data: { id: gid, type: 'online' },
      date_created: new Date().toISOString(),
      live_mode: false,
      type: 'order',
      user_id: collector,
    }),
  });
  return { status: res.status, body: await res.json().catch(() => null), at: new Date().toISOString() };
}

const evidence = { rodada: RUN, evento: eventId };
try {
  // 2. Pedidos pagos.
  const A = await paidOrder(2);
  log(`pedido A pago (2 unidades), cobrança ${A.gid}`);
  const B = await paidOrder(1);
  log(`pedido B pago (1 unidade), cobrança ${B.gid}`);

  // 3. Estorno parcial de A (R$ 40,00 de R$ 80,00).
  const orderA = await waitMp(A.gid, j => j?.status === 'processed');
  const paymentId = orderA.transactions.payments[0].id;
  const refund = await mp('POST', `/v1/orders/${A.gid}/refund`, { transactions: [{ id: paymentId, amount: '40.00' }] }, `alerta-parcial:${A.gid}`);
  if (refund.status !== 201) throw new Error(`estorno parcial ${refund.status} ${JSON.stringify(refund.json)?.slice(0, 200)}`);
  await waitMp(A.gid, j => j?.status_detail === 'partially_refunded');
  const n1 = await notify(A.gid, 'order.refunded');
  log(`estorno parcial notificado: ${n1.status} ${JSON.stringify(n1.body)}`);
  const trilha = await sql(`select created_at from audit_log where action = 'pagamento.estorno_parcial' and entity_id = $1`, [A.id]);
  const rowA = await orderRow(A.id);
  const tA = await ticketsOf(A.id);
  evidence.estornoParcial = {
    pedido: A.id,
    cobranca: A.gid,
    notificacao: { status: n1.status, resposta: n1.body, em: n1.at },
    pedidoDepois: rowA.status,
    ingressos: tA.map(t => t.status),
    trilha: trilha.map(t => t.created_at),
  };
  if (n1.status !== 200 || rowA.status !== 'pago' || tA.some(t => t.status !== 'valido') || trilha.length !== 1)
    throw new Error(`estorno parcial: resultado inesperado ${JSON.stringify(evidence.estornoParcial)}`);

  // 4. Cobrança em dobro de B.
  await pace();
  const token = await cardToken();
  const dup = await mp(
    'POST',
    '/v1/orders',
    {
      type: 'online',
      processing_mode: 'automatic',
      external_reference: B.id,
      total_amount: '40.00',
      payer: { email: 'test@testuser.com', first_name: 'APRO' },
      transactions: { payments: [{ amount: '40.00', payment_method: { id: 'visa', type: 'credit_card', token, installments: 1 } }] },
    },
    `alerta-dobro:${B.id}`,
  );
  if (dup.status !== 201) throw new Error(`cobrança em dobro ${dup.status} ${JSON.stringify(dup.json)?.slice(0, 200)}`);
  await waitMp(dup.json.id, j => j?.status === 'processed');
  const n2 = await notify(dup.json.id, 'order.processed');
  log(`cobrança em dobro notificada: ${n2.status} ${JSON.stringify(n2.body)}`);
  const rowB = await orderRow(B.id);
  const tB = await ticketsOf(B.id);
  evidence.cobrancaDuplicada = {
    pedido: B.id,
    cobrancaDoPedido: B.gid,
    cobrancaEmDobro: dup.json.id,
    notificacao: { status: n2.status, resposta: n2.body, em: n2.at },
    cobrancaDoPedidoDepois: rowB.gid,
    ingressos: tB.length,
  };
  if (n2.status !== 200 || n2.body?.outcome !== 'cobranca_duplicada' || rowB.gid !== B.gid || tB.length !== 1)
    throw new Error(`cobrança em dobro: resultado inesperado ${JSON.stringify(evidence.cobrancaDuplicada)}`);
  log('ok: os dois sinais foram emitidos pelo código; conferir o log, o incidente e o e-mail');
} finally {
  const dir = path.join(ROOT, 'docs/evidencias/alertas');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `homologacao-${RUN}.json`), JSON.stringify({ em: new Date().toISOString(), ...evidence }, null, 1));
  await pool.end();
}
