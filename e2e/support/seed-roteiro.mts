// Semente FICTÍCIA do roteiro 11.2, só com a equipe, os promoters e um segundo evento (para o caso "ingresso de outro evento").
// O evento principal é criado pela interface no item 3.
// - Local (padrão): banco descartável no PostgreSQL de teste (nunca o Neon).
// - Homologação (E2E_REMOTE_DB + E2E_RUN_ID): grava no banco de HOMOLOGAÇÃO já conferido pela marca `partyx-env:homologacao`, com
//   e-mails, códigos e endereço do evento sufixados pela rodada, para não colidir com dados anteriores.
// Uso: npx tsx e2e/support/seed-roteiro.mts <arquivo-de-saída.json>
import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { assertDatabaseEnvironment } from '../../server/src/db/environment';
import { createTestDatabase } from '../../server/src/db/testing';
import { argon2Hasher } from '../../server/src/providers/passwordHasher';
import { roteiroRun } from './run';

const OUT = process.argv[2];
if (!OUT) throw new Error('uso: seed-roteiro.mts <arquivo.json>');
const REMOTE = process.env.E2E_REMOTE_DB;
const run = roteiroRun(REMOTE ? process.env.E2E_RUN_ID : undefined);

let url: string;
let pool: pg.Pool;
if (REMOTE) {
  pool = new pg.Pool({ connectionString: REMOTE, max: 1 });
  await assertDatabaseEnvironment(pool, 'homologacao');
  url = 'env:E2E_DATABASE_URL';
} else {
  const ADMIN_URL = process.env.TEST_DATABASE_URL;
  if (!ADMIN_URL) throw new Error('defina TEST_DATABASE_URL (ver .env.test)');
  if (/neon\.tech/.test(ADMIN_URL)) throw new Error('recusado: o roteiro local só roda no PostgreSQL de teste');
  const db = await createTestDatabase(ADMIN_URL, { serviceFee: { rateBps: 500, minCents: 0 } });
  pool = db.pool;
  url = db.url;
}
const q = (t: string, p: unknown[] = []) => pool.query(t, p);
const hash = await argon2Hasher.hash('festa2026');

for (const [name, email, role] of [
  ['Carla Admin Fictícia', run.admin, 'administrador'],
  ['Rafael Validador Fictício', run.validador, 'validador'],
  ['Bia Validadora Fictícia', run.validador2, 'validador'],
] as const)
  await q(
    `insert into users (name, email, password_hash, role, is_active, must_change_password, phone)
     values ($1, $2, $3, $4, true, false, '(11) 90000-0000')`,
    [name, email, hash, role],
  );

for (const [name, code, active] of [
  ['Duda Martins Fictícia', run.duda, true],
  ['Leo Noturno Fictício', run.leo, false],
] as const)
  await q(`insert into promoters (name, coupon_code, phone, is_active) values ($1, $2, '(11) 98888-0000', $3)`, [
    name,
    code,
    active,
  ]);

const otherSlug = `outro-evento-e2e${run.slugSuffix}`;
const other = (
  await q(
    `insert into events (slug, name, starts_at, venue, address, description, attractions, age_rating, status)
     values ($1, $2, now() + interval '20 days', 'Clube Fictício', 'Rua Fictícia, 1, São Paulo',
             'Evento fictício do roteiro 11.2 (caso de ingresso de outro evento).', '{}', '18 anos', 'publicado')
     returning id`,
    [otherSlug, `Outro Evento E2E${run.nameSuffix}`],
  )
).rows[0].id as string;
const otherType = (
  await q(
    `insert into ticket_types (event_id, name, price_cents, quantity_total, sales_start_at, sales_end_at, is_active)
     values ($1, 'Pista', 5000, 50, now() - interval '1 day', now() + interval '19 days', true) returning id`,
    [other],
  )
).rows[0].id as string;

writeFileSync(OUT, JSON.stringify({ url, run, otherEvent: { id: other, slug: otherSlug, type: otherType } }));
await pool.end();
