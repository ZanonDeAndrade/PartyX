// Foto do evento do Bernardo + a leitura de portaria gravada nele + contagem por tabela dos eventos de teste. SOMENTE LEITURA.
import { createRequire } from 'node:module';
const pg = createRequire(process.env.PG_FROM)('pg');
const c = new pg.Client({ connectionString: process.env.DB_URL });
const B = 'a05708e7-80b3-42b7-a05c-d3667a289c99';
const T = ['a5a09cdc-a375-45c2-a9ac-1da8ca58c257', '0003d4fb-ba54-4802-b33f-b9a8d095f1db'];
const j = x => JSON.stringify(x, (k, v) => v);
await c.connect();
try {
  await c.query('begin transaction read only');
  const ev = (await c.query(`select * from events where id = $1`, [B])).rows[0];
  const types = (await c.query(`select * from ticket_types where event_id = $1 order by id`, [B])).rows;
  const lots = (await c.query(`select * from ticket_lots where event_id = $1 order by id`, [B])).rows;
  const promo = (await c.query(`select * from promoter_discount_events where event_id = $1 order by promoter_id`, [B])).rows;
  const foto = { event: ev, types, lots, promoterDiscounts: promo };
  console.log('## foto (sha256 abaixo)');
  console.log(j({ name: ev.name, slug: ev.slug, status: ev.status, starts_at: ev.starts_at, ends_at: ev.ends_at, updated_at: ev.updated_at,
    tipos: types.map(t => ({ name: t.name, price_cents: t.price_cents, quantity_total: t.quantity_total, quantity_sold: t.quantity_sold,
      sales_start_at: t.sales_start_at, sales_end_at: t.sales_end_at, is_active: t.is_active })),
    lotes: lots.map(l => ({ name: l.name, status: l.status, price_cents: l.price_cents, quantity: l.quantity })) }));
  console.log('FOTO_JSON ' + j(foto));
  console.log('\n## leituras de portaria no evento do Bernardo');
  for (const r of (await c.query(`select k.created_at, k.result, k.method, k.ticket_id is not null as tem_ingresso, te.slug as evento_do_ingresso
      from checkins k left join tickets t on t.id = k.ticket_id left join events te on te.id = t.event_id where k.event_id = $1`, [B])).rows) console.log(j(r));
  console.log('\n## linhas por tabela ligadas aos eventos de teste');
  const q = `with ev as (select unnest($1::uuid[]) id), ord as (select o.id from orders o where o.event_id in (select id from ev)),
     tk as (select t.id from tickets t where t.event_id in (select id from ev)),
     tr as (select x.id from ticket_transfers x where x.event_id in (select id from ev) or x.ticket_id in (select id from tk))
   select 'events' t, (select count(*) from events where id in (select id from ev))::int n
   union all select 'ticket_types', (select count(*) from ticket_types where event_id in (select id from ev))::int
   union all select 'ticket_lots', (select count(*) from ticket_lots where event_id in (select id from ev))::int
   union all select 'promoter_discount_events', (select count(*) from promoter_discount_events where event_id in (select id from ev))::int
   union all select 'orders', (select count(*) from ord)::int
   union all select 'order_items', (select count(*) from order_items where order_id in (select id from ord))::int
   union all select 'order_item_lots', (select count(*) from order_item_lots where order_id in (select id from ord))::int
   union all select 'reservations', (select count(*) from reservations where order_id in (select id from ord))::int
   union all select 'tickets', (select count(*) from tk)::int
   union all select 'ticket_transfers', (select count(*) from tr)::int
   union all select 'ticket_minor_acceptances', (select count(*) from ticket_minor_acceptances where ticket_transfer_id in (select id from tr))::int
   union all select 'minor_term_acceptances', (select count(*) from minor_term_acceptances where order_id in (select id from ord))::int
   union all select 'cancellation_acceptances', (select count(*) from cancellation_acceptances where order_id in (select id from ord))::int
   union all select 'checkins (do evento de teste)', (select count(*) from checkins where event_id in (select id from ev))::int
   union all select 'checkins (outro evento, ingresso de teste)', (select count(*) from checkins where event_id not in (select id from ev) and ticket_id in (select id from tk))::int
   union all select 'payment_events', (select count(*) from payment_events where order_id in (select id from ord))::int
   union all select 'email_log', (select count(*) from email_log where order_id in (select id from ord))::int
   union all select 'audit_log (fica)', (select count(*) from audit_log where entity_id in (select id from ev union select id from ord union select id from tk union select id from tr))::int`;
  for (const r of (await c.query(q, [T])).rows) console.log(`${r.t}: ${r.n}`);
  await c.query('rollback');
} finally { await c.end(); }
