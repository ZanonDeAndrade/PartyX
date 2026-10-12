// Semente FICTÍCIA do roteiro 11.2: banco descartável no PostgreSQL de teste (nunca o Neon), só com a equipe, os promoters e um
// segundo evento (para o caso "ingresso de outro evento"). O evento principal é criado pela interface no item 3.
// Uso: npx tsx e2e/support/seed-roteiro.mts <arquivo-de-saída.json>
import { writeFileSync } from 'node:fs';
import { createTestDatabase } from '../../server/src/db/testing';
import { argon2Hasher } from '../../server/src/providers/passwordHasher';

const OUT = process.argv[2];
if (!OUT) throw new Error('uso: seed-roteiro.mts <arquivo.json>');
const ADMIN_URL = process.env.TEST_DATABASE_URL;
if (!ADMIN_URL) throw new Error('defina TEST_DATABASE_URL (ver .env.test)');
if (/neon\.tech/.test(ADMIN_URL)) throw new Error('recusado: o roteiro só roda no PostgreSQL de teste');

const db = await createTestDatabase(ADMIN_URL);
const q = (t: string, p: unknown[] = []) => db.pool.query(t, p);
const hash = await argon2Hasher.hash('festa2026');

for (const [name, email, role] of [
  ['Carla Admin Fictícia', 'admin@exemplo.com', 'administrador'],
  ['Rafael Validador Fictício', 'validador@exemplo.com', 'validador'],
  ['Bia Validadora Fictícia', 'validador2@exemplo.com', 'validador'],
] as const)
  await q(
    `insert into users (name, email, password_hash, role, is_active, must_change_password, phone)
     values ($1, $2, $3, $4, true, false, '(11) 90000-0000')`,
    [name, email, hash, role],
  );

for (const [name, code, active] of [
  ['Duda Martins Fictícia', 'DUDA', true],
  ['Leo Noturno Fictício', 'LEO', false],
] as const)
  await q(`insert into promoters (name, coupon_code, phone, is_active) values ($1, $2, '(11) 98888-0000', $3)`, [
    name,
    code,
    active,
  ]);

const other = (
  await q(
    `insert into events (slug, name, starts_at, venue, address, description, attractions, age_rating, status)
     values ('outro-evento-e2e', 'Outro Evento E2E', now() + interval '20 days', 'Clube Fictício', 'Rua Fictícia, 1, São Paulo',
             'Evento fictício do roteiro 11.2 (caso de ingresso de outro evento).', '{}', '18 anos', 'publicado')
     returning id`,
  )
).rows[0].id as string;
const otherType = (
  await q(
    `insert into ticket_types (event_id, name, price_cents, quantity_total, sales_start_at, sales_end_at, is_active)
     values ($1, 'Pista', 5000, 50, now() - interval '1 day', now() + interval '19 days', true) returning id`,
    [other],
  )
).rows[0].id as string;

writeFileSync(OUT, JSON.stringify({ url: db.url, otherEvent: { id: other, slug: 'outro-evento-e2e', type: otherType } }));
await db.pool.end();
