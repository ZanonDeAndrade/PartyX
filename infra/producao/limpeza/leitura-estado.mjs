// Etapa 2: estado de eventos, pedidos, ingressos, entradas, avisos do gateway e trilha. SOMENTE LEITURA; sem nome, e-mail ou CPF.
import { createRequire } from 'node:module';
const pg = createRequire(process.env.PG_FROM)('pg');
const c = new pg.Client({ connectionString: process.env.DB_URL });
const out = (t, rows) => {
  console.log(`\n## ${t} (${rows.length})`);
  for (const x of rows) console.log(JSON.stringify(Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]))));
};
await c.connect();
try {
  await c.query('begin transaction read only');
  out('agora', (await c.query(`select now() as agora, current_user as papel`)).rows);
  out('eventos', (await c.query(`select id, slug, name, status, archived_at, starts_at, banner_url is not null as tem_banner from events order by created_at`)).rows);
  out('pedidos', (await c.query(`select o.number, e.slug, o.status, o.payment_method, o.total_cents, o.service_fee_cents, o.discount_cents,
      o.created_at, o.paid_at, o.gateway_payment_id, o.updated_at,
      (o.user_id = (select user_id from orders where number = 10001)) as mesmo_comprador_do_10001
    from orders o join events e on e.id = o.event_id order by o.number`)).rows);
  out('ingressos', (await c.query(`select o.number as pedido, t.status, t.cancel_reason, t.cancelled_at, (t.holder_user_id <> o.user_id) as transferido,
      (select count(*) from checkins k where k.ticket_id = t.id and k.result = 'valido')::int as entradas
    from tickets t join orders o on o.id = t.order_id order by o.number, t.id`)).rows);
  out('entradas por evento', (await c.query(`select e.slug, k.result, count(*)::int from checkins k join events e on e.id = k.event_id group by 1, 2 order by 1, 2`)).rows);
  out('avisos do gateway (payment_events)', (await c.query(`select p.received_at, p.type, p.signature_valid, p.processed_at, p.attempts, p.processing_error, o.number as pedido,
      p.payload_json->>'action' as acao
    from payment_events p left join orders o on o.id = p.order_id order by p.received_at`)).rows);
  out('trilha: pagamentos', (await c.query(`select a.created_at, a.action, o.number as pedido, a.after_json from audit_log a left join orders o on o.id = a.entity_id
    where a.action like 'pagamento.%' order by a.created_at`)).rows);
  out('e-mails por pedido', (await c.query(`select o.number as pedido, m.template, m.status, m.attempts from email_log m join orders o on o.id = m.order_id order by o.number, m.created_at`)).rows);
  await c.query('rollback');
} finally { await c.end(); }
