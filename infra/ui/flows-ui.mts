// Segunda parte da semente FICTÍCIA de UI: com o servidor local no ar (gateway fictício), cria compradores, pedidos em todos os
// estados, entradas na portaria e cancelamentos pela própria API. Grava os IDs em <pasta>/state-ui.json para o script de captura.
// Uso: BASE_URL=http://localhost:8099 npx tsx infra/ui/flows-ui.mts <pasta>
import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { banner } from './banners.mts';

const OUT = process.argv[2]!;
const BASE = process.env.BASE_URL ?? 'http://localhost:8099';
const seed = JSON.parse(readFileSync(`${OUT}/seed-ui.json`, 'utf8')) as {
  url: string;
  events: Record<string, { id: string; types: Record<string, string> }>;
};
const ev = (slug: string) => seed.events[slug]!;
let ipn = 1;

class Client {
  ip = `10.9.${ipn >> 8}.${ipn++ & 255}`;
  cookies = new Map<string, string>();
  csrf = '';
  async req(method: string, path: string, body?: unknown, raw?: { body: BodyInit; headers?: Record<string, string> }) {
    const headers: Record<string, string> = { origin: BASE, 'x-forwarded-for': this.ip, ...(raw?.headers ?? {}) };
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (this.csrf) headers['x-csrf-token'] = this.csrf;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: raw?.body ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv!.indexOf('=');
      this.cookies.set(kv!.slice(0, i), kv!.slice(i + 1));
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b: unknown = {}) => this.req('POST', p, b);
  async arm() {
    this.csrf = (await this.get('/api/auth/me')).json.csrfToken;
  }
  async login(email: string, password = 'festa2026') {
    const r = await this.post('/api/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`login ${email} ${r.status} ${JSON.stringify(r.json)}`);
    await this.arm();
  }
}

const must = (r: { status: number; json: any }, what: string, ok = [200, 201]) => {
  if (!ok.includes(r.status)) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
};

function cpfFor(n: number) {
  const d = String(100000000 + n).padStart(9, '0').split('').map(Number);
  for (let t = 9; t <= 10; t++) {
    const s = d.reduce((a, v, i) => a + v * (t + 1 - i), 0);
    d.push(((s * 10) % 11) % 10);
  }
  return d.join('');
}

let cpfN = 4100;
async function buyer(name: string, email: string) {
  const c = new Client();
  const lv = (await c.get('/api/legal/versions')).json;
  must(
    await c.post('/api/auth/register', {
      name,
      email,
      cpf: cpfFor(cpfN++),
      phone: '(11) 98765-4321',
      password: 'festa2026Forte',
      acceptedTermsVersion: lv.terms,
      acceptedPrivacyVersion: lv.privacy,
      accept: true,
    }),
    `cadastro ${email}`,
  );
  await c.arm();
  return c;
}

async function order(c: Client, slug: string, items: [string, number][], coupon: string | null = null) {
  const e = ev(slug);
  const r = must(
    await c.post('/api/orders', {
      eventSlug: slug,
      items: items.map(([type, quantity]) => ({ ticketTypeId: e.types[type], quantity })),
      couponCode: coupon,
    }),
    `pedido ${slug}`,
  );
  return r.order.id as string;
}
const pay = async (c: Client, id: string, method: 'pix' | 'cartao') =>
  must(await c.post(`/api/orders/${id}/payment`, { method }), `pagamento ${id}`);
const sim = async (c: Client, id: string, status: string) =>
  must(await c.post(`/api/dev/mock-gateway/${id}/${status}`), `simulador ${status}`);
async function paid(c: Client, slug: string, items: [string, number][], coupon: string | null = null, method: 'pix' | 'cartao' = 'pix') {
  const id = await order(c, slug, items, coupon);
  await pay(c, id, method);
  await sim(c, id, 'aprovado');
  return id;
}
const ticketsOf = async (c: Client, orderId: string) =>
  ((await c.get('/api/tickets')).json.tickets as { id: string; orderId: string }[]).filter(t => t.orderId === orderId);
const qrOf = async (c: Client, ticketId: string) => (await c.get(`/api/tickets/${ticketId}`)).json.ticket.qrPayload as string;

// ---------- equipe e banners ----------
const admin = new Client();
await admin.login('admin@exemplo.com');
const looks: [string, Parameters<typeof banner>[0], number][] = [
  ['noite-roxa-warehouse', 'roxo', 3],
  ['baile-do-ambar', 'ambar', 9],
  ['sunset-rooftop', 'ciano', 21],
  ['rosa-eletrica', 'rosa', 33],
  ['reveillon-ficticio-2027', 'branco', 41],
  ['domingo-de-ressaca', 'ambar', 52],
  ['halloween-ficticio', 'rosa', 61],
  ['pre-estreia-lotada', 'branco', 77],
  ['festival-rascunho', 'ciano', 88],
];
for (const [slug, look, s] of looks) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(await banner(look, s))], { type: 'image/jpeg' }), `${slug}.jpg`);
  must(await admin.req('PUT', `/api/admin/events/${ev(slug).id}/banner`, undefined, { body: form }), `banner ${slug}`);
}

// ---------- compradores ----------
const marina = await buyer('Marina Costa Fictícia', 'marina@exemplo.com');
const joao = await buyer('João Pereira Fictício', 'joao@exemplo.com');
const ana = await buyer('Ana Souza Fictícia', 'ana@exemplo.com');
const bruno = await buyer('Bruno Lima Fictício', 'bruno@exemplo.com');
const bia = await buyer('Beatriz Rocha Fictícia', 'beatriz@exemplo.com');
const marina2 = await buyer('Marina Costa Fictícia', 'marina.costa2@exemplo.com'); // homônima (V04)
await buyer('Lucas Novo Fictício', 'lucas@exemplo.com'); // sem compras (estados vazios)

const S: Record<string, string> = {};
// Marina: pedido pago com 3 unidades (válido, utilizado, cancelado), com promoter.
S.orderPaid = await paid(marina, 'noite-roxa-warehouse', [['Pista', 2], ['VIP open bar', 1]], 'DUDA');
const mt = await ticketsOf(marina, S.orderPaid);
S.ticketValid = mt[1]!.id;
S.ticketUsed = mt[0]!.id;
S.ticketCancelled = mt[2]!.id;
S.qrValid = await qrOf(marina, S.ticketValid);
S.qrUsed = await qrOf(marina, S.ticketUsed);
S.qrCancelled = await qrOf(marina, S.ticketCancelled);
S.orderCard = await paid(marina, 'baile-do-ambar', [['Pista', 1]], null, 'cartao');
S.ticketOtherEvent = (await ticketsOf(marina, S.orderCard))[0]!.id;
S.qrOtherEvent = await qrOf(marina, S.ticketOtherEvent);
S.orderHistory = await paid(marina, 'halloween-ficticio', [['Pista', 2]]);
S.orderRefunded = await paid(marina, 'baile-do-ambar', [['Backstage', 1]]);
await sim(marina, S.orderRefunded, 'estornado');
S.orderExpired = await order(marina, 'sunset-rooftop', [['Pista', 2]]);
await pay(marina, S.orderExpired, 'pix');
await sim(marina, S.orderExpired, 'expirado');
S.orderDeclined = await order(marina, 'sunset-rooftop', [['Pista', 1]]);
await pay(marina, S.orderDeclined, 'cartao');
await sim(marina, S.orderDeclined, 'recusado');
S.orderCancelled = await order(marina, 'quinta-experimental', [['Pista', 2]]);
must(await marina.post(`/api/orders/${S.orderCancelled}/cancel`), 'cancelar pedido');
// Pago sem estoque: Marina reserva as 2 unidades, o prazo vence, Bruno compra as 2 e só depois o pagamento dela chega.
S.orderNoStock = await order(marina, 'rosa-eletrica', [['Pista', 2]]);
await pay(marina, S.orderNoStock, 'pix');
await sim(marina, S.orderNoStock, 'expirado');
await paid(bruno, 'rosa-eletrica', [['Pista', 2]], 'RAFA');
await sim(marina, S.orderNoStock, 'aprovado');
// Pendentes (ficam abertos por até 60 min): forma de pagamento, Pix e cartão redirecionado.
// Um pedido pendente por comprador e evento: um novo pedido no mesmo evento expira o anterior (regra do servidor).
S.orderPendingNoMethod = await order(marina, 'baile-do-ambar', [['Pista', 1], ['Backstage', 1]]);
S.orderPendingPix = await order(marina, 'noite-roxa-warehouse', [['VIP open bar', 2]], 'DUDA');
await pay(marina, S.orderPendingPix, 'pix');
S.orderPendingCard = await order(marina, 'sunset-rooftop', [['Pista', 1]]);
await pay(marina, S.orderPendingCard, 'cartao');

// Outros compradores: volume para painel, relatórios e portaria.
S.orderJoao = await paid(joao, 'noite-roxa-warehouse', [['Pista', 3]], 'DUDA');
await paid(joao, 'noite-roxa-warehouse', [['Pista', 4]]); // unidades livres para as leituras válidas das capturas
await paid(joao, 'baile-do-ambar', [['Pista', 2]], 'RAFA');
await paid(ana, 'noite-roxa-warehouse', [['Pista 1º lote', 3]]); // esgota o 1º lote
await paid(ana, 'sunset-rooftop', [['Pista', 2]], 'DUDA', 'cartao');
await paid(marina2, 'noite-roxa-warehouse', [['Meia-entrada Pista', 1]]);
await paid(bia, 'halloween-ficticio', [['Pista', 1]]);
S.orderHeld = await order(bia, 'pre-estreia-lotada', [['Sessão', 1]]); // a única unidade fica reservada
await pay(bia, S.orderHeld, 'pix');

// ---------- portaria ----------
const gate = new Client();
await gate.login('validador@exemplo.com');
const roxa = ev('noite-roxa-warehouse').id;
must(await gate.post('/api/gate/scan', { eventId: roxa, qr: S.qrUsed }), 'leitura válida');
for (const t of await ticketsOf(joao, S.orderJoao)) {
  must(await gate.post('/api/gate/scan', { eventId: roxa, qr: await qrOf(joao, t.id) }), 'leitura João');
  break; // só a primeira unidade de João entra
}
await gate.post('/api/gate/scan', { eventId: roxa, qr: S.qrUsed }); // repetida
await gate.post('/api/gate/scan', { eventId: roxa, qr: 'PX1.qr-adulterado-ficticio' }); // inválida
must(
  await admin.post(`/api/admin/tickets/${S.ticketCancelled}/cancel`, {
    reason: 'Pedido de cancelamento registrado pela PartyX (fictício)',
    confirm: true,
  }),
  'cancelar ingresso',
);
await gate.post('/api/gate/scan', { eventId: roxa, qr: S.qrCancelled });

// ---------- recuperação de senha (e-mail E02) ----------
must(await new Client().post('/api/auth/password/forgot', { email: 'marina@exemplo.com' }), 'recuperação', [202]);

// ---------- datas: Halloween vira evento passado e encerrado ----------
const pool = new pg.Pool({ connectionString: seed.url });
await pool.query(
  `update events set starts_at = now() - interval '9 days', status = 'encerrado', closed_at = now() - interval '8 days'
   where slug = 'halloween-ficticio'`,
);
const ids = (await pool.query(`select slug, id from events`)).rows;
await pool.end();

writeFileSync(
  `${OUT}/state-ui.json`,
  JSON.stringify({ ...S, events: Object.fromEntries(ids.map(r => [r.slug, r.id])) }, null, 1),
);
console.log('fluxos fictícios prontos:', Object.keys(S).length, 'referências');
