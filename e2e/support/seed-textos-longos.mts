/**
 * Dados FICTÍCIOS de texto longo para e2e/textos-longos.spec.ts, num banco descartável do PostgreSQL de teste: palavras sem espaço
 * no limite de cada campo, URL, emojis e quebras de linha digitadas. Uso: tsx e2e/support/seed-textos-longos.mts <pasta>
 * Grava <pasta>/seed.json com a URL do banco e os IDs usados nas rotas.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createDrizzle } from '../../server/src/db/client';
import { createTestDatabase } from '../../server/src/db/testing';
import { loadConfig } from '../../server/src/config';
import { argon2Hasher } from '../../server/src/providers/passwordHasher';
import { issueForOrder } from '../../server/src/tickets/issuer';
import { testDatabaseUrl } from './server';

const OUT = process.argv[2]!;
const LONG = (w: string, n: number) => w.repeat(Math.ceil(n / w.length)).slice(0, n);
const URL_LONGA =
  'https://www.exemplo-de-site-muito-longo.com.br/eventos/2026/dezembro/festa-de-fim-de-ano/ingressos?utm_source=instagram&utm_medium=story&utm_campaign=lancamento-oficial-2026';
// "Sobre o evento": 300 caracteres sem espaço, link, emojis e linhas digitadas pelo admin (white-space: pre-line).
const DESC = `${LONG('Testetesteteste', 300)}\n\nMais informações: ${URL_LONGA}\n\nTraga seu documento 🎉🎶🍾✨🔥🥳👯‍♀️🇧🇷\nSegunda linha digitada pelo admin, depois de uma quebra.`;
export const BUYER_EMAIL = 'compradora.com.um.endereco.de.email.bem.comprido.para.testar.a.quebra@partyx.test';

const db = await createTestDatabase(testDatabaseUrl());
const q = (t: string, p: unknown[] = []) => db.pool.query(t, p);
const hash = await argon2Hasher.hash('festa2026');
const user = async (name: string, email: string, cpf: string | null, role: string) =>
  (await q('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5) returning id', [name, email, cpf, hash, role]))
    .rows[0].id as string;

const buyer = await user(`Ana ${LONG('Testetesteteste', 100)} 🎉`, BUYER_EMAIL, '52998224725', 'cliente');
await user(`Valida ${LONG('Dordaportaria', 90)}`, 'portaria@partyx.test', null, 'validador');
await user('Admin Teste', 'admin@partyx.test', null, 'administrador');

const ev = (
  await q(
    `insert into events (slug,name,starts_at,ends_at,venue,address,description,attractions,age_rating,status,allows_minors,judicial_authorization,is_featured)
     values ('texto-longo',$1,'2026-12-12T23:30:00-03:00','2026-12-13T05:00:00-03:00',$2,$3,$4,$5,'16 anos','publicado',true,$6,true) returning id`,
    [
      `${LONG('FestaTesteteste', 114)} 🎉`,
      LONG('ArenaCentraldeEventos', 120),
      URL_LONGA,
      DESC,
      [`DJ ${LONG('Testetesteteste', 76)}`, 'Banda Neon 🎸🎤', URL_LONGA.slice(0, 80)],
      LONG('Portaria12/2026doJuizado', 120),
    ],
  )
).rows[0].id as string;
await q(
  `insert into events (slug,name,starts_at,venue,address,description,age_rating,status)
   values ('baile-de-verao','Baile de Verão','2026-12-20T23:00:00-03:00','Clube Central','Rua das Flores, 100, São Gabriel/RS','Festa de verão com DJ convidado.','18 anos','publicado')`,
);
const window = `'2026-10-01T00:00:00-03:00','2026-12-12T22:00:00-03:00'`;
const typeId = (
  await q(
    `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,$2,6000,300,${window}) returning id`,
    [ev, LONG('MeiaEntradaEstudante', 60)],
  )
).rows[0].id as string;
await q(
  `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'Pista 🎉 VIP',12000,100,${window})`,
  [ev],
);
const promoter = (
  await q(`insert into promoters (name,coupon_code) values ($1,'ABCDEFGHIJKLMNOPQRST') returning id`, [LONG('PromoterTeste', 80)])
).rows[0].id as string;
const orderId = (
  await q(
    `insert into orders (user_id,event_id,total_cents,status,paid_at,payment_method,promoter_id) values ($1,$2,12000,'pago',now(),'pix',$3) returning id`,
    [buyer, ev, promoter],
  )
).rows[0].id as string;
const item = (
  await q(
    'insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,2,6000) returning id',
    [orderId, ev, typeId],
  )
).rows[0].id as string;
await createDrizzle(db.pool).transaction(tx =>
  issueForOrder(tx, loadConfig({ APP_ENV: 'local' }).qr, {
    id: orderId,
    userId: buyer,
    eventId: ev,
    items: [{ orderItemId: item, ticketTypeId: typeId, quantity: 2 }],
  }),
);
const ticketId = (await q('select id from tickets where order_id = $1 order by unit_index limit 1', [orderId])).rows[0].id as string;
writeFileSync(path.join(OUT, 'seed.json'), JSON.stringify({ url: db.url, eventId: ev, typeId, orderId, ticketId }));
await db.pool.end();
