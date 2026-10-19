// Semente FICTÍCIA do teste de carga da auditoria: evento de 500 ingressos numa cidade pequena (Pista 350 a R$ 60, VIP 150 a R$ 120),
// compradores já cadastrados (a abertura de vendas é de quem já tem conta), 3 validadores e 1 administrador. Só PostgreSQL de teste.
// Uso: TEST_DATABASE_URL=... npx tsx auditoria/carga/seed-carga-auditoria.mts <saida.json> <compradores=1500> <escala=1>
import { writeFileSync } from 'node:fs';
import { createTestDatabase } from '../../server/src/db/testing';
import { argon2Hasher } from '../../server/src/providers/passwordHasher';

const OUT = process.argv[2]!;
const BUYERS = Number(process.argv[3] ?? 1500);
const SCALE = Number(process.argv[4] ?? 1);
const ADMIN_URL = process.env.TEST_DATABASE_URL;
if (!OUT || !ADMIN_URL) throw new Error('uso: seed-carga-auditoria.mts <saida.json> [compradores] [escala]; TEST_DATABASE_URL obrigatória');
if (/neon\.tech/.test(ADMIN_URL)) throw new Error('recusado: a carga só roda no PostgreSQL de teste');

function cpfFor(n: number): string {
  const d = String(100000000 + n).padStart(9, '0').slice(-9).split('').map(Number);
  for (const len of [9, 10]) {
    const sum = d.slice(0, len).reduce((t, x, i) => t + x * (len + 1 - i), 0);
    d.push(((sum * 10) % 11) % 10);
  }
  return d.join('');
}

const db = await createTestDatabase(ADMIN_URL, { serviceFee: 'migracao' });
const q = (t: string, p: unknown[] = []) => db.pool.query(t, p);
const hash = await argon2Hasher.hash('festa2026Forte');
for (const [name, email, role] of [
  ['Admin Carga Fictício', 'admin@carga.test', 'administrador'],
  ['Validador 1 Fictício', 'validador1@carga.test', 'validador'],
  ['Validador 2 Fictício', 'validador2@carga.test', 'validador'],
  ['Validador 3 Fictício', 'validador3@carga.test', 'validador'],
] as const)
  await q(`insert into users (name, email, password_hash, role, is_active, must_change_password, phone, birth_date) values ($1, $2, $3, $4, true, false, '(11) 90000-0000', '1990-01-01')`, [name, email, hash, role]);

// Compradores em lotes (mesmo hash: a senha é a mesma para todos; só o banco de teste).
const buyers: { email: string; password: string }[] = [];
for (let start = 0; start < BUYERS; start += 500) {
  const values: string[] = [];
  const params: unknown[] = [];
  for (let i = start; i < Math.min(BUYERS, start + 500); i++) {
    const email = `comprador${i}@carga.test`;
    buyers.push({ email, password: 'festa2026Forte' });
    params.push(`Comprador ${i} Fictício`, email, cpfFor(500_000 + i), hash);
    const b = params.length - 4;
    values.push(`($${b + 1}, $${b + 2}, $${b + 3}, '(11) 98765-4321', '1990-05-10', $${b + 4}, 'cliente', true, false)`);
  }
  await q(`insert into users (name, email, cpf, phone, birth_date, password_hash, role, is_active, must_change_password) values ${values.join(',')}`, params);
}

const starts = new Date(Date.now() + 10 * 86_400_000);
const ev = await q(
  `insert into events (slug, name, starts_at, venue, address, description, attractions, age_rating, status, is_featured)
   values ('carga-500', '[FICTÍCIO] Festa da Cidade Pequena', $1, 'Clube Fictício', 'Rua 1, Cidade Pequena', 'Evento fictício de carga (500 ingressos).', '{}', '18 anos', 'publicado', true) returning id`,
  [starts],
);
const eventId = ev.rows[0].id as string;
const types: Record<string, string> = {};
for (const [key, name, price, qty] of [
  ['pista', 'Pista', 6000, 350 * SCALE],
  ['vip', 'VIP', 12000, 150 * SCALE],
] as const) {
  const r = await q(
    `insert into ticket_types (event_id, name, price_cents, quantity_total, sales_start_at, sales_end_at, is_active)
     values ($1, $2, $3, $4, now() - interval '1 day', $5, true) returning id`,
    [eventId, name, price, qty, starts],
  );
  types[key] = r.rows[0].id;
}
writeFileSync(OUT, JSON.stringify({ url: db.url, eventId, slug: 'carga-500', types, capacity: 500 * SCALE, buyers, validators: ['validador1@carga.test', 'validador2@carga.test', 'validador3@carga.test'], password: 'festa2026Forte' }));
console.log(`semente de carga: ${BUYERS} compradores, capacidade ${500 * SCALE}`);
await db.pool.end();
