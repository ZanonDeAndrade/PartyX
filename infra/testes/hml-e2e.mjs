// Fluxo ponta a ponta na HOMOLOGAÇÃO, atrás do Firebase Hosting, com tempos de cada etapa.
// Uso: SP=<pasta> BASE_URL=https://partyx-hml.web.app node infra/testes/hml-e2e.mjs fase1|fase2|estado
// Precisa de $SP/hml-creds.json: { admin:{email,password}, validador:{email,password}, slug, eventId, pista } (criado fora do Git).
// Pagamento: gateway FICTÍCIO de homologação (HML_GATEWAY_FICTICIO=true no deploy). NÃO é o sandbox do gateway real (D-01 em aberto).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const SP = process.env.SP ?? '.';
const BASE = process.env.BASE_URL ?? 'https://partyx-hml.web.app';
const creds = JSON.parse(readFileSync(`${SP}/hml-creds.json`, 'utf8'));
const STATE = `${SP}/hml-e2e-state.json`;
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { timings: [], orders: {} };
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 1));
const T0 = () => performance.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CAPTCHA = 'XXXX.DUMMY.TOKEN.XXXX'; // a chave de TESTE da Cloudflare aceita qualquer token (e a verificação é feita DE VERDADE na API deles)

class Client {
  constructor() { this.cookie = ''; this.csrf = ''; }
  async req(method, path, body, extra = {}) {
    const t = T0();
    const headers = { origin: BASE, ...extra };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.csrf) headers['x-csrf-token'] = this.csrf;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie');
    if (sc && /^__session=/.test(sc)) this.cookie = sc.split(';')[0];
    const buf = Buffer.from(await res.arrayBuffer());
    let json = null;
    if ((res.headers.get('content-type') || '').includes('json')) { try { json = JSON.parse(buf.toString()); } catch {} }
    return { status: res.status, ms: Math.round(performance.now() - t), json, buf, headers: res.headers };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  async arm() { const me = await this.get('/api/auth/me'); this.csrf = me.json?.csrfToken ?? ''; return me; }
  async login(c) { const r = await this.post('/api/auth/login', c); if (r.status !== 200) throw new Error('login ' + r.status); await this.arm(); return r; }
}
const step = (name, r, extra = '') => { state.timings.push({ etapa: name, ms: r.ms ?? r, http: r.status ?? null, extra, em: new Date().toISOString() }); console.log(`${String(r.ms ?? r).padStart(6)} ms  ${r.status ?? ''}  ${name} ${extra}`); save(); };
const cpf = n => { const d = String(100000000 + n).padStart(9, '0').split('').map(Number); for (let t = 9; t <= 10; t++) { const s = d.reduce((a, v, i) => a + v * (t + 1 - i), 0); d.push(((s * 10) % 11) % 10); } return d.join(''); };

async function signup(label, n) {
  const c = new Client();
  const lv = await c.get('/api/legal/versions');
  const email = `${label}-${Date.now()}@exemplo.com`;
  const r = await c.post('/api/auth/register', { name: `Comprador ${label} Ficticio`, email, cpf: cpf(700000 + n + (Date.now() % 100000)), phone: '11987654321', password: 'festa2026Forte!', acceptedTermsVersion: lv.json.terms, acceptedPrivacyVersion: lv.json.privacy, accept: true, captchaToken: CAPTCHA });
  step(`cadastro ${label} (inclui verificação Turnstile na Cloudflare)`, r);
  if (r.status !== 201) throw new Error('cadastro ' + r.status + JSON.stringify(r.json));
  await c.arm();
  return { c, email };
}
async function order(c, label, qty) {
  const r = await c.post('/api/orders', { eventSlug: creds.slug, items: [{ ticketTypeId: creds.pista, quantity: qty }] });
  step(`pedido ${label} (reserva + agenda a tarefa de +10 min no Cloud Tasks)`, r);
  if (r.status !== 201) throw new Error('pedido ' + r.status + JSON.stringify(r.json));
  const pay = await c.post(`/api/orders/${r.json.order.id}/payment`, { method: 'pix' });
  step(`Pix ${label}`, pay);
  return { id: r.json.order.id, createdAt: Date.now() };
}
async function admin() { const a = new Client(); const r = await a.login(creds.admin); step('login do administrador', r); return a; }
const simulate = async (a, orderId, status) => { const r = await a.post(`/api/admin/dev/mock-gateway/${orderId}/${status}`); step(`simulador: pagamento ${status}`, r); return r.json?.webhook; };
const deliver = async wh => { const t = T0(); const res = await fetch(BASE + '/api/webhooks/payments', { method: 'POST', headers: wh.headers, body: wh.body }); const j = await res.json().catch(() => ({})); const r = { status: res.status, ms: Math.round(performance.now() - t), json: j }; step('webhook entregue pelo caminho público (Hosting → Cloud Run)', r, JSON.stringify(j)); return r; };
const orderState = async (c, id) => (await c.get(`/api/orders/${id}`)).json?.order;

async function fase1() {
  console.log('== negativos do Turnstile e login (sem desafio)');
  const anon = new Client();
  const lv = await anon.get('/api/legal/versions');
  const body = { name: 'Sem Token Ficticio', email: `semtoken-${Date.now()}@exemplo.com`, cpf: cpf(1), phone: '11987654321', password: 'festa2026Forte!', acceptedTermsVersion: lv.json.terms, acceptedPrivacyVersion: lv.json.privacy, accept: true };
  const r1 = await anon.post('/api/auth/register', body); step('cadastro SEM token: recusado', r1, r1.json?.erro?.codigo);
  const r2 = await anon.post('/api/auth/register', { ...body, captchaToken: 'x'.repeat(2100) }); step('cadastro com token de 2100 caracteres: recusado', r2, r2.json?.erro?.codigo);
  const r3 = await anon.post('/api/auth/password/forgot', { email: 'ninguem@exemplo.com' }); step('recuperação SEM token: recusada', r3, r3.json?.erro?.codigo);
  const r4 = await anon.post('/api/auth/password/forgot', { email: 'ninguem@exemplo.com', captchaToken: CAPTCHA }); step('recuperação com token: aceita (resposta igual para conta inexistente)', r4);
  state.negativos = [r1.json?.erro?.codigo, r2.json?.erro?.codigo, r3.json?.erro?.codigo, r4.status];

  console.log('== vitrine, cadastro e checkout');
  const home = await anon.get('/'); step('página inicial (HTML pelo Hosting)', home);
  const ev = await anon.get(`/api/public/events/${creds.slug}`); step('API: página do evento', ev);
  const a = await admin();

  // Comprador A: o webhook se PERDE. Quem confirma é a tarefa do Cloud Tasks, 10 minutos depois do pedido.
  const A = await signup('A-webhook-perdido', 1);
  const oA = await order(A.c, 'A', 2);
  await simulate(a, oA.id, 'aprovado'); // muda o estado no gateway fictício, mas NÃO entrega o webhook
  state.orders.A = { ...oA, email: A.email, approvedAt: Date.now() };

  // Comprador B: webhook entregue pelo caminho público.
  const B = await signup('B-webhook', 2);
  const oB = await order(B.c, 'B', 3);
  const wh = await simulate(a, oB.id, 'aprovado');
  const approvedAt = Date.now();
  await deliver(wh);
  const paidB = await orderState(B.c, oB.id); step('pedido B depois do webhook', { ms: Date.now() - approvedAt }, `status=${paidB?.status}`);
  const t0 = T0(); const tk = await B.c.get('/api/tickets'); step('Meus ingressos (B)', tk, `${tk.json?.tickets?.length} ingressos`);
  const ids = (tk.json?.tickets ?? []).map(t => t.id);
  const det = await B.c.get(`/api/tickets/${ids[0]}`); step('ingresso (detalhe com QR)', det);
  const pdf = await B.c.get(`/api/orders/${oB.id}/tickets/pdf`); step('PDF do pedido', pdf, `${pdf.buf.length} bytes, ${pdf.buf.subarray(0, 4).toString()}`);
  const qr = (det.json.ticket ?? det.json).qrPayload ?? (det.json.ticket ?? det.json).qr;
  state.orders.B = { ...oB, email: B.email, qr, ticketIds: ids };

  console.log('== portaria');
  const v = new Client(); step('login do validador', await v.login(creds.validador));
  const s1 = await v.post('/api/gate/scan', { eventId: creds.eventId, qr }); step('leitura do QR (1ª)', s1, s1.json?.result);
  const s2 = await v.post('/api/gate/scan', { eventId: creds.eventId, qr }); step('leitura do QR (2ª, mesma entrada)', s2, s2.json?.result);
  const forged = qr.slice(0, -2) + (qr.endsWith('AA') ? 'BB' : 'AA');
  const s3 = await v.post('/api/gate/scan', { eventId: creds.eventId, qr: forged }); step('leitura de QR adulterado', s3, s3.json?.result);
  state.gate = [s1.json?.result, s2.json?.result, s3.json?.result];

  console.log('== cenários que disparam alertas REAIS');
  const C = await signup('C-estorno-fora-de-fluxo', 3); const oC = await order(C.c, 'C', 1);
  const whC = await simulate(a, oC.id, 'estornado'); await deliver(whC); // estorno de pedido nunca aprovado
  const D = await signup('D-fica-pendente', 4); const oD = await order(D.c, 'D', 1);
  state.orders.D = { ...oD, email: D.email };
  save();
  console.log('\nA: aprovado no gateway SEM webhook às', new Date(state.orders.A.approvedAt).toISOString(), '| pedido criado às', new Date(state.orders.A.createdAt).toISOString());
  console.log('D: nunca pago (vai gastar as 3 verificações: +10, +25, +55 min)');
}

async function fase2() {
  const A = state.orders.A; if (!A) throw new Error('rode fase1 antes');
  const c = new Client(); await c.login(creds.admin);
  const listEmails = async () => (await c.get('/api/admin/emails')).json?.emails ?? [];
  const start = Date.now(); let paid = null;
  console.log('aguardando a tarefa do Cloud Tasks confirmar o pedido A (webhook perdido)...');
  while (Date.now() - start < 20 * 60_000) {
    const r = await c.get(`/api/admin/orders/${A.id}`);
    const status = r.json?.order?.status ?? r.json?.status;
    if (status === 'pago') { paid = Date.now(); break; }
    await sleep(15_000);
  }
  if (!paid) { console.log('NÃO foi confirmado em 20 min'); return; }
  state.orders.A.paidAt = paid; save();
  step('pedido A confirmado pelo Cloud Tasks (desde a aprovação no gateway)', { ms: paid - A.approvedAt });
  step('pedido A confirmado pelo Cloud Tasks (desde a criação do pedido; meta ≈ 10 min)', { ms: paid - A.createdAt });
}

// Fase 3 (depois de configurar o SMTP no ambiente): e-mails em revisão voltam a sair ao reabrir; compra nova recebe o e-mail do ingresso.
async function fase3() {
  const a = await admin();
  const list = async () => (await a.get('/api/admin/emails')).json?.emails ?? [];
  const before = await list();
  console.log('e-mails antes:', before.map(e => `${e.template}:${e.status}`).join(' '));
  for (const e of before.filter(x => x.status === 'falhou')) {
    const r = await a.post(`/api/admin/emails/${e.id}/retry`);
    step(`reabrir e-mail em revisão (${e.template}): entrega imediata`, r, r.json?.status);
  }
  const E = await signup('E-com-smtp', 5);
  const oE = await order(E.c, 'E', 2);
  const wh = await simulate(a, oE.id, 'aprovado');
  const approvedAt = Date.now();
  await deliver(wh);
  let sentAt = null;
  for (let i = 0; i < 40 && !sentAt; i++) {
    const mails = await list();
    const m = mails.find(x => x.template === 'compra_confirmada' && x.orderId === oE.id);
    if (m?.status === 'enviado') sentAt = Date.now();
    else await sleep(500);
  }
  step('e-mail do ingresso: da aprovação do pagamento até "enviado" no SMTP', { ms: sentAt ? sentAt - approvedAt : -1 }, sentAt ? '' : 'NÃO ENVIADO');
  const tk = await E.c.get('/api/tickets'); step('Meus ingressos (E)', tk, `${tk.json?.tickets?.length} ingressos`);
  state.orders.E = { id: oE.id, email: E.email };
  save();
  console.log('E-mail do comprador E:', E.email);
}

function estado() {
  console.log(JSON.stringify({ negativos: state.negativos, gate: state.gate }, null, 1));
  console.table(state.timings.map(t => ({ etapa: t.etapa, 'tempo (ms)': t.ms, http: t.http, obs: t.extra })));
}
({ fase1, fase2, fase3, estado })[process.argv[2] ?? 'estado']();
