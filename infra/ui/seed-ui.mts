// Dados FICTÍCIOS para as capturas de tela da UI (docs/ui). Cria um banco descartável no PostgreSQL de teste (nunca o Neon),
// com equipe, promoters, eventos e tipos em todos os estados de venda. Os pedidos, pagamentos e entradas são feitos depois pela
// própria API (flows-ui.mts), para cada estado vir do código real.
// Uso: npx tsx infra/ui/seed-ui.mts <pasta-de-saída>
import { writeFileSync } from 'node:fs';
import { createTestDatabase } from '../../server/src/db/testing';
import { argon2Hasher } from '../../server/src/providers/passwordHasher';

const OUT = process.argv[2];
if (!OUT) throw new Error('uso: seed-ui.mts <pasta>');
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://partyx:partyx_test_only@127.0.0.1:55432/postgres';
if (/neon\.tech/.test(ADMIN_URL)) throw new Error('recusado: este script só roda no PostgreSQL de teste');

const db = await createTestDatabase(ADMIN_URL);
const q = (t: string, p: unknown[] = []) => db.pool.query(t, p);
const hash = await argon2Hasher.hash('festa2026');

const user = async (name: string, email: string, role: string, extra: { active?: boolean; temp?: boolean } = {}) =>
  (
    await q(
      `insert into users (name, email, password_hash, role, is_active, must_change_password, phone)
       values ($1, $2, $3, $4, $5, $6, '(11) 90000-0000') returning id`,
      [name, email, hash, role, extra.active ?? true, extra.temp ?? false],
    )
  ).rows[0].id as string;

await user('Carla Menezes Fictícia', 'admin@partyx.test', 'administrador');
await user('Rafael Lima Fictício', 'validador@partyx.test', 'validador');
await user('Otávio Portaria Fictício', 'validador2@partyx.test', 'validador', { active: false });
await user('Paulo Reis Fictício', 'primeiro@partyx.test', 'validador', { temp: true });

for (const [name, code, active] of [
  ['Duda Martins Fictícia', 'DUDA', true],
  ['Rafa Promoções Fictício', 'RAFA', true],
  ['Leo Noturno Fictício', 'LEO', false],
] as const)
  await q(`insert into promoters (name, coupon_code, phone, is_active) values ($1, $2, '(11) 98888-0000', $3)`, [
    name,
    code,
    active,
  ]);

/** Horário em São Paulo: `dias` a partir de hoje, na hora indicada. */
const at = (days: number, hour: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour + 3, 0, 0, 0);
  return d.toISOString();
};

interface TypeSpec {
  name: string;
  price: number;
  total: number;
  start?: number;
  end?: number;
  active?: boolean;
}
const ids: Record<string, { id: string; types: Record<string, string> }> = {};
async function event(
  slug: string,
  spec: {
    name: string;
    days: number;
    hour: number;
    venue: string;
    address: string;
    description: string;
    attractions: string[];
    age: string;
    status?: string;
    featured?: boolean;
    types: TypeSpec[];
  },
) {
  const id = (
    await q(
      `insert into events (slug, name, starts_at, venue, address, description, attractions, age_rating, status, is_featured)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [
        slug,
        spec.name,
        at(spec.days, spec.hour),
        spec.venue,
        spec.address,
        spec.description,
        spec.attractions,
        spec.age,
        spec.status ?? 'publicado',
        spec.featured ?? false,
      ],
    )
  ).rows[0].id as string;
  const types: Record<string, string> = {};
  for (const t of spec.types) {
    types[t.name] = (
      await q(
        `insert into ticket_types (event_id, name, price_cents, quantity_total, sales_start_at, sales_end_at, is_active)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [
          id,
          t.name,
          t.price,
          t.total,
          at(t.start ?? -20, 10),
          at(t.end ?? spec.days, spec.hour),
          t.active ?? true,
        ],
      )
    ).rows[0].id as string;
  }
  ids[slug] = { id, types };
}

const DESC =
  'Evento fictício criado para as capturas de tela da PartyX. A descrição real é escrita pela PartyX no painel, com horários, regras da casa e informações de acesso.';

await event('noite-roxa-warehouse', {
  name: 'Noite Roxa: Warehouse Sessions',
  days: 12,
  hour: 23,
  venue: 'Galpão Fictício 22',
  address: 'Rua das Fábricas, 220, Barra Funda, São Paulo',
  description: `${DESC}\n\nAbertura dos portões às 23h. Entrada com documento com foto.`,
  attractions: ['DJ Ametista (fictícia)', 'Coletivo Baixa Frequência (fictício)', 'Lua Nova b2b Sereno (fictícios)'],
  age: '18 anos',
  featured: true,
  types: [
    { name: 'Pista 1º lote', price: 6000, total: 3 },
    { name: 'Pista', price: 8000, total: 300 },
    { name: 'Meia-entrada Pista', price: 4000, total: 80 },
    { name: 'VIP open bar', price: 18000, total: 60 },
    { name: 'Camarote', price: 40000, total: 10, active: false },
  ],
});
await event('baile-do-ambar', {
  name: 'Baile do Âmbar',
  days: 5,
  hour: 22,
  venue: 'Clube Fictício Aurora',
  address: 'Av. dos Bailes, 1500, Centro, Campinas',
  description: DESC,
  attractions: ['Banda Fogo Lento (fictícia)', 'DJ Cobre (fictício)'],
  age: '16 anos',
  types: [
    { name: 'Pista', price: 7000, total: 400 },
    { name: 'Backstage', price: 15000, total: 40 },
  ],
});
await event('sunset-rooftop', {
  name: 'Sunset Rooftop',
  days: 20,
  hour: 16,
  venue: 'Terraço Fictício Alto',
  address: 'Rua do Mirante, 88, Pinheiros, São Paulo',
  description: DESC,
  attractions: ['Maré Alta (fictícia)'],
  age: '18 anos',
  types: [{ name: 'Pista', price: 9000, total: 250 }],
});
await event('quinta-experimental', {
  name: 'Quinta Experimental',
  days: 8,
  hour: 21,
  venue: 'Porão Fictício',
  address: 'Rua Baixa, 12, Santa Cecília, São Paulo',
  description: DESC,
  attractions: [],
  age: '18 anos',
  types: [{ name: 'Pista', price: 3500, total: 120 }],
});
await event('reveillon-ficticio-2027', {
  name: 'Réveillon Fictício 2027',
  days: 80,
  hour: 22,
  venue: 'Praia Fictícia do Farol',
  address: 'Orla Norte, s/n, Ubatuba',
  description: DESC,
  attractions: ['Line-up a anunciar (fictício)'],
  age: '18 anos',
  types: [
    { name: 'Pista', price: 25000, total: 1000, start: 10 },
    { name: 'Open bar', price: 45000, total: 300, start: 10 },
  ],
});
await event('rosa-eletrica', {
  name: 'Rosa Elétrica',
  days: 15,
  hour: 23,
  venue: 'Estúdio Fictício Rosa',
  address: 'Rua Neon, 404, Vila Madalena, São Paulo',
  description: DESC,
  attractions: ['Pink Noise (fictício)'],
  age: '18 anos',
  types: [{ name: 'Pista', price: 5000, total: 2 }],
});
await event('domingo-de-ressaca', {
  name: 'Domingo de Ressaca',
  days: 3,
  hour: 15,
  venue: 'Quintal Fictício',
  address: 'Rua do Sossego, 9, Lapa, São Paulo',
  description: DESC,
  attractions: ['Samba do Quintal (fictício)'],
  age: 'Livre',
  types: [{ name: 'Entrada', price: 3000, total: 200, start: -30, end: -1 }],
});
await event('halloween-ficticio', {
  name: 'Halloween Fictício',
  days: 25,
  hour: 23,
  venue: 'Casarão Fictício',
  address: 'Rua das Sombras, 31, Bixiga, São Paulo',
  description: DESC,
  attractions: ['DJ Abóbora (fictício)'],
  age: '18 anos',
  types: [{ name: 'Pista', price: 6500, total: 300 }],
});
await event('pre-estreia-lotada', {
  name: 'Pré-estreia Lotada',
  days: 30,
  hour: 20,
  venue: 'Cine Fictício',
  address: 'Av. das Telas, 7, Centro, São Paulo',
  description: DESC,
  attractions: [],
  age: '14 anos',
  types: [{ name: 'Sessão', price: 4500, total: 1 }],
});
await event('festival-rascunho', {
  name: 'Festival em Rascunho',
  days: 60,
  hour: 14,
  venue: 'Parque Fictício',
  address: 'Estrada do Parque, km 3, Itu',
  description: DESC,
  attractions: ['A definir'],
  age: '16 anos',
  status: 'rascunho',
  types: [{ name: 'Pista', price: 12000, total: 2000 }],
});

writeFileSync(`${OUT}/seed-ui.json`, JSON.stringify({ url: db.url, events: ids }, null, 1));
console.log('banco fictício pronto:', db.url.replace(/:[^:@/]+@/, ':***@'));
await db.pool.end();
