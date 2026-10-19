// Semente FICTÍCIA da auditoria de entrega (19/10/2026): equipe, compradores de várias idades, promoters e eventos em cada estado da
// vitrine. Só no PostgreSQL de teste descartável (nunca o Neon). Lotes e compras pagas são feitos pela API no setup, para respeitar as
// regras do servidor. Uso: npx tsx auditoria/e2e/support/seed-auditoria.mts <saida.json>
import { writeFileSync } from 'node:fs';
import { createTestDatabase } from '../../../server/src/db/testing';
import { argon2Hasher } from '../../../server/src/providers/passwordHasher';

const OUT = process.argv[2];
if (!OUT) throw new Error('uso: seed-auditoria.mts <arquivo.json>');
const ADMIN_URL = process.env.TEST_DATABASE_URL;
if (!ADMIN_URL) throw new Error('defina TEST_DATABASE_URL (PostgreSQL de teste)');
if (/neon\.tech/.test(ADMIN_URL)) throw new Error('recusado: a auditoria só roda no PostgreSQL de teste');

/** CPF fictício com dígitos verificadores válidos. */
export function cpfFor(n: number): string {
  const d = String(100000000 + n).padStart(9, '0').slice(-9).split('').map(Number);
  for (const len of [9, 10]) {
    const sum = d.slice(0, len).reduce((t, x, i) => t + x * (len + 1 - i), 0);
    d.push(((sum * 10) % 11) % 10);
  }
  return d.join('');
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const addYears = (d: Date, n: number) => {
  const c = new Date(d);
  c.setUTCFullYear(c.getUTCFullYear() + n);
  return c;
};

const db = await createTestDatabase(ADMIN_URL, { serviceFee: 'migracao' });
const q = (t: string, p: unknown[] = []) => db.pool.query(t, p);
const teamHash = await argon2Hasher.hash('festa2026');
const buyerHash = await argon2Hasher.hash('festa2026Forte');

const now = new Date();
// Evento principal a 20 dias, às 22:00 de São Paulo (01:00 UTC do dia seguinte).
const principalStart = new Date(`${iso(addDays(now, 20))}T22:00:00-03:00`);
const baileStart = new Date(`${iso(addDays(now, 15))}T20:00:00-03:00`);
// Idades na data do evento do baile (menores): 17 e 16 anos completos 10 dias antes do evento.
const birth17 = iso(addDays(addYears(baileStart, -17), -10));
const birth16 = iso(addDays(addYears(baileStart, -16), -10));
// Quem faz 18 só depois do evento principal: 17 anos nele (para o caso "evento 18+ recusa 17 anos").
const birth17Principal = iso(addDays(addYears(principalStart, -17), -10));

const team = [
  { key: 'admin', name: 'Carla Admin Fictícia', email: 'admin@auditoria.test', role: 'administrador' },
  { key: 'validador', name: 'Rafael Validador Fictício', email: 'validador@auditoria.test', role: 'validador' },
  { key: 'validador2', name: 'Bia Validadora Fictícia', email: 'validador2@auditoria.test', role: 'validador' },
] as const;
for (const m of team)
  await q(
    `insert into users (name, email, password_hash, role, is_active, must_change_password, phone, birth_date)
     values ($1, $2, $3, $4, true, false, '(11) 90000-0000', '1990-01-01')`,
    [m.name, m.email, teamHash, m.role],
  );

const buyers = [
  { key: 'adulto1', name: 'Ana Auditoria Fictícia', email: 'ana@auditoria.test', birth: '1990-05-10', n: 9001 },
  { key: 'adulto2', name: 'Bruno Auditoria Fictício', email: 'bruno@auditoria.test', birth: '1988-01-20', n: 9002 },
  { key: 'adulto3', name: 'Caio Auditoria Fictício', email: 'caio@auditoria.test', birth: '1992-07-07', n: 9003 },
  { key: 'adulto4', name: 'Dani Auditoria Fictícia', email: 'dani@auditoria.test', birth: '1985-11-11', n: 9004 },
  { key: 'adulto5', name: 'Eli Auditoria Fictício', email: 'eli@auditoria.test', birth: '1979-03-03', n: 9005 },
  { key: 'jovem17', name: 'Enzo Jovem Fictício', email: 'enzo@auditoria.test', birth: birth17, n: 9017 },
  { key: 'jovem16', name: 'Flávia Jovem Fictícia', email: 'flavia@auditoria.test', birth: birth16, n: 9016 },
  { key: 'jovem17b', name: 'Gui Jovem Fictício', email: 'gui@auditoria.test', birth: birth17Principal, n: 9018 },
] as const;
const buyerOut: Record<string, { id: string; name: string; email: string; cpf: string; birth: string; password: string }> = {};
for (const b of buyers) {
  const cpf = cpfFor(b.n);
  const r = await q(
    `insert into users (name, email, cpf, phone, birth_date, password_hash, role, is_active, must_change_password)
     values ($1, $2, $3, '(11) 98765-4321', $4, $5, 'cliente', true, false) returning id`,
    [b.name, b.email, cpf, b.birth, buyerHash],
  );
  buyerOut[b.key] = { id: r.rows[0].id, name: b.name, email: b.email, cpf, birth: b.birth, password: 'festa2026Forte' };
}

for (const [name, code, active] of [
  ['Duda Promoter Fictícia', 'AUDIT1', true],
  ['Leo Promoter Inativo', 'INATIVO', false],
] as const)
  await q(`insert into promoters (name, coupon_code, phone, is_active) values ($1, $2, '(11) 98888-0000', $3)`, [name, code, active]);

interface EventSpec {
  key: string;
  slug: string;
  name: string;
  startsAt: Date;
  endsAt?: Date | null;
  status?: 'rascunho' | 'publicado' | 'encerrado';
  allowsMinors?: boolean;
  ageRating: string;
  featured?: boolean;
  archived?: boolean;
  accent?: string | null;
  types: { key: string; name: string; price: number; qty: number; start: Date; end: Date; active?: boolean }[];
}
const d = (n: number) => addDays(now, n);
const h = (n: number) => new Date(now.getTime() + n * 3_600_000);
const events: EventSpec[] = [
  {
    key: 'principal',
    slug: 'festa-auditoria',
    name: 'Festa Auditoria',
    startsAt: principalStart,
    ageRating: '18 anos',
    featured: true,
    accent: '#7C3AED',
    types: [
      { key: 'pista', name: 'Pista', price: 8000, qty: 100, start: d(-1), end: principalStart },
      { key: 'vip', name: 'VIP', price: 15000, qty: 20, start: d(-1), end: principalStart },
      { key: 'camarote', name: 'Camarote', price: 30000, qty: 5, start: d(-1), end: principalStart },
    ],
  },
  {
    key: 'menores',
    slug: 'baile-auditoria',
    name: 'Baile Auditoria 16+',
    startsAt: baileStart,
    endsAt: new Date(baileStart.getTime() + 5 * 3_600_000),
    allowsMinors: true,
    ageRating: '16 anos',
    types: [{ key: 'pista', name: 'Pista', price: 5000, qty: 50, start: d(-1), end: baileStart }],
  },
  {
    key: 'breve',
    slug: 'em-breve-auditoria',
    name: 'Em Breve Auditoria',
    startsAt: d(30),
    ageRating: '18 anos',
    types: [{ key: 'pista', name: 'Pista', price: 6000, qty: 40, start: d(5), end: d(30) }],
  },
  {
    key: 'encerradas',
    slug: 'vendas-encerradas-auditoria',
    name: 'Vendas Encerradas Auditoria',
    startsAt: d(10),
    ageRating: '18 anos',
    types: [{ key: 'pista', name: 'Pista', price: 6000, qty: 40, start: d(-10), end: d(-1) }],
  },
  {
    key: 'encerrado',
    slug: 'evento-encerrado-auditoria',
    name: 'Evento Encerrado Auditoria',
    startsAt: d(-2),
    status: 'encerrado',
    ageRating: '18 anos',
    types: [{ key: 'pista', name: 'Pista', price: 6000, qty: 40, start: d(-20), end: d(-2) }],
  },
  {
    key: 'esgotado',
    slug: 'esgotado-auditoria',
    name: 'Esgotado Auditoria',
    startsAt: d(12),
    ageRating: '18 anos',
    types: [{ key: 'unica', name: 'Única', price: 2000, qty: 1, start: d(-1), end: d(12) }],
  },
  {
    key: 'arquivado',
    slug: 'arquivado-auditoria',
    name: 'Arquivado Auditoria',
    startsAt: d(25),
    ageRating: '18 anos',
    archived: true,
    types: [{ key: 'pista', name: 'Pista', price: 6000, qty: 40, start: d(-1), end: d(25) }],
  },
  {
    key: 'rascunho',
    slug: 'rascunho-auditoria',
    name: 'Rascunho Auditoria',
    startsAt: d(40),
    status: 'rascunho',
    ageRating: '18 anos',
    types: [{ key: 'pista', name: 'Pista', price: 6000, qty: 40, start: d(-1), end: d(40) }],
  },
  {
    key: 'hoje',
    slug: 'hoje-auditoria',
    name: 'Hoje Auditoria',
    startsAt: h(1.5),
    ageRating: '18 anos',
    types: [{ key: 'pista', name: 'Pista', price: 3000, qty: 50, start: d(-5), end: h(1.5) }],
  },
  {
    key: 'outro',
    slug: 'outro-evento-auditoria',
    name: 'Outro Evento Auditoria',
    startsAt: d(18),
    ageRating: '18 anos',
    types: [{ key: 'pista', name: 'Pista', price: 4000, qty: 30, start: d(-1), end: d(18) }],
  },
];
const eventOut: Record<string, { id: string; slug: string; name: string; startsAt: string; types: Record<string, string> }> = {};
for (const e of events) {
  const r = await q(
    `insert into events (slug, name, starts_at, ends_at, allows_minors, venue, address, description, attractions, age_rating, status,
                         is_featured, archived_at, closed_at, accent_color)
     values ($1, $2, $3, $4, $5, 'Galpão Fictício', 'Rua dos Testes, 112, Cidade Pequena', $6, $7, $8, $9, $10, $11, $12, $13)
     returning id`,
    [
      e.slug,
      e.name,
      e.startsAt,
      e.endsAt ?? null,
      e.allowsMinors ?? false,
      `Evento fictício da auditoria de entrega (${e.key}). Nenhum ingresso real.`,
      ['DJ Fictício', 'Banda de Teste'],
      e.ageRating,
      e.status ?? 'publicado',
      e.featured ?? false,
      e.archived ? now : null,
      e.status === 'encerrado' ? d(-1) : null,
      e.accent ?? null,
    ],
  );
  const id = r.rows[0].id as string;
  const types: Record<string, string> = {};
  for (const t of e.types) {
    const tr = await q(
      `insert into ticket_types (event_id, name, price_cents, quantity_total, sales_start_at, sales_end_at, is_active)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [id, t.name, t.price, t.qty, t.start, t.end, t.active ?? true],
    );
    types[t.key] = tr.rows[0].id;
  }
  eventOut[e.key] = { id, slug: e.slug, name: e.name, startsAt: e.startsAt.toISOString(), types };
}

// Lotes no tipo Pista do evento principal (0013): o 1º lote com 3 unidades a R$ 80,00 já à venda e o 2º lote com as 97 restantes a
// R$ 100,00 aguardando. Inseridos aqui como o servidor faz em ensureLots; os outros tipos ganham o "Lote único" quando forem tocados.
const pistaId = eventOut.principal!.types.pista!;
const principalId = eventOut.principal!.id;
const lotIds: string[] = [];
for (const [position, name, price, qty, status] of [
  [1, '1º lote', 8000, 3, 'a_venda'],
  [2, '2º lote', 10000, 97, 'aguardando'],
] as const) {
  const r = await q(
    `insert into ticket_lots (ticket_type_id, event_id, position, name, price_cents, quantity, quantity_sold, status, leftover_policy)
     values ($1, $2, $3, $4, $5, $6, 0, $7, 'passar') returning id`,
    [pistaId, principalId, position, name, price, qty, status],
  );
  lotIds.push(r.rows[0].id as string);
}

writeFileSync(
  OUT,
  JSON.stringify({ url: db.url, team: Object.fromEntries(team.map(m => [m.key, { email: m.email, password: 'festa2026' }])), buyers: buyerOut, events: eventOut, promoters: { ativo: 'AUDIT1', inativo: 'INATIVO' }, lots: { pista1: lotIds[0], pista2: lotIds[1] } }),
);
await db.pool.end();
