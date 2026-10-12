// Semente FICTÍCIA da carga (PDF 11.3): banco descartável no PostgreSQL de teste (nunca o Neon), um evento publicado com estoque
// LIMITADO de propósito (a procura passa do estoque, para provar que não há venda acima dele) e compradores já cadastrados.
// Uso: npx tsx infra/carga/seed-carga.mts <arquivo.json> [capacidade=240] [compradores=400]
import { writeFileSync } from 'node:fs';
import { createTestDatabase } from '../../server/src/db/testing';
import { argon2Hasher } from '../../server/src/providers/passwordHasher';

const OUT = process.argv[2];
const CAPACITY = Number(process.argv[3] ?? 240);
const BUYERS = Number(process.argv[4] ?? 400);
if (!OUT) throw new Error('uso: seed-carga.mts <arquivo.json> [capacidade] [compradores]');
const ADMIN_URL = process.env.TEST_DATABASE_URL;
if (!ADMIN_URL) throw new Error('defina TEST_DATABASE_URL (ver .env.test)');
if (/neon\.tech/.test(ADMIN_URL)) throw new Error('recusado: a carga só roda no PostgreSQL de teste');

const db = await createTestDatabase(ADMIN_URL);
const q = (t: string, p: unknown[] = []) => db.pool.query(t, p);

const event = (
  await q(
    `insert into events (slug, name, starts_at, venue, address, description, attractions, age_rating, status, is_featured)
     values ('abertura-de-vendas-carga', 'Abertura de Vendas (carga fictícia)', now() + interval '30 days', 'Arena Fictícia',
             'Av. dos Testes, 1000, São Paulo', 'Evento fictício do teste de carga (PDF 11.3).', '{"Line-up fictício"}', '18 anos',
             'publicado', true)
     returning id`,
  )
).rows[0].id as string;
const type = (
  await q(
    `insert into ticket_types (event_id, name, price_cents, quantity_total, sales_start_at, sales_end_at, is_active)
     values ($1, 'Pista', 8000, $2, now() - interval '1 day', now() + interval '29 days', true) returning id`,
    [event, CAPACITY],
  )
).rows[0].id as string;

// Um hash só para todos (mesma senha): cadastrar 400 contas com Argon2 levaria minutos e não é o que se mede aqui.
const hash = await argon2Hasher.hash('festa2026Forte');
const cpf = (n: number) => {
  const d = String(300000000 + n).split('').map(Number);
  for (const len of [9, 10]) d.push(((d.slice(0, len).reduce((t, x, i) => t + x * (len + 1 - i), 0) * 10) % 11) % 10);
  return d.join('');
};
for (let i = 0; i < BUYERS; i++)
  await q(
    `insert into users (name, email, password_hash, role, is_active, must_change_password, phone, cpf)
     values ($1, $2, $3, 'cliente', true, false, '(11) 98765-4321', $4)`,
    [`Comprador Carga ${i} Fictício`, `carga${i}@exemplo.com`, hash, cpf(i)],
  );

writeFileSync(OUT, JSON.stringify({ url: db.url, eventId: event, slug: 'abertura-de-vendas-carga', typeId: type, capacity: CAPACITY, buyers: BUYERS }));
console.log(`carga: evento com ${CAPACITY} unidades e ${BUYERS} compradores fictícios`);
await db.pool.end();
