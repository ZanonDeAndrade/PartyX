// Conferência depois da limpeza de 19/10/2026. SOMENTE LEITURA; sem dado pessoal. FOTO_BERNARDO = foto tirada antes.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const pg = createRequire(process.env.PG_FROM)('pg');
const c = new pg.Client({ connectionString: process.env.DB_URL });
const B = 'a05708e7-80b3-42b7-a05c-d3667a289c99';
const T = ['a5a09cdc-a375-45c2-a9ac-1da8ca58c257', '0003d4fb-ba54-4802-b33f-b9a8d095f1db'];
const TZ = 'America/Sao_Paulo';
const one = async (q, p = []) => (await c.query(q, p)).rows;
const ok = (nome, cond, info = '') => console.log(`${cond ? 'OK   ' : 'FALHA'} ${nome}${info ? ': ' + info : ''}`);
await c.connect();
try {
  await c.query('begin transaction read only');
  const desl = await one(`select tgname from pg_trigger where not tgisinternal and tgenabled = 'D'`);
  ok('nenhum gatilho desligado', desl.length === 0, desl.map(r => r.tgname).join(','));
  const g = (await one(`select (select count(*) from events)::int ev, (select count(*) from orders)::int ord, (select count(*) from tickets)::int tk,
    (select count(*) from checkins)::int ck, (select count(*) from reservations)::int res, (select count(*) from ticket_transfers)::int tr,
    (select count(*) from order_items)::int it, (select count(*) from events where id = any($1::uuid[]))::int teste`, [T]))[0];
  ok('só o evento do Bernardo', g.ev === 1 && g.teste === 0, JSON.stringify(g));
  ok('Pedidos vazio', g.ord === 0); ok('Ingressos vazio', g.tk === 0); ok('Entradas vazio', g.ck === 0);
  // Visão geral: as mesmas consultas de server/src/panel/service.ts (hoje e mês, por situação; gráfico diário; eventos em andamento).
  const hoje = (await one(`select to_char(now() at time zone '${TZ}', 'YYYY-MM-DD') d`))[0].d;
  const dia = await one(`select count(*)::int n from orders where paid_at is not null and to_char(paid_at at time zone '${TZ}', 'YYYY-MM-DD') = $1`, [hoje]);
  const mes = await one(`select count(*)::int n, coalesce(sum(total_cents),0)::int c from orders where paid_at is not null and to_char(paid_at at time zone '${TZ}', 'YYYY-MM') = $1`, [hoje.slice(0, 7)]);
  ok(`Visão geral hoje (${hoje}) zerada`, dia[0].n === 0); ok(`Visão geral mês (${hoje.slice(0, 7)}) zerada`, mes[0].n === 0 && mes[0].c === 0);
  const and = await one(`select e.slug, t.name, t.quantity_total, t.quantity_sold, coalesce((select sum(r.quantity) from reservations r where r.ticket_type_id = t.id and r.status = 'ativa' and r.expires_at > now()),0)::int reservados
     from events e join ticket_types t on t.event_id = e.id where e.status = 'publicado' order by t.name`);
  ok('eventos em andamento: só o do Bernardo, 0 vendidos, 0 reservados', and.every(r => r.slug === 'teste01-2' && r.quantity_sold === 0 && r.reservados === 0), JSON.stringify(and));
  // Relatório da taxa mensal de outubro (server/src/reports/service.ts feeReport): ingressos por mês do paid_at.
  const taxa = await one(`select count(t.id)::int n from tickets t join orders o on o.id = t.order_id where o.paid_at is not null and to_char(o.paid_at at time zone '${TZ}', 'YYYY-MM') = '2026-10'`);
  ok('taxa mensal de outubro: 0 ingressos', taxa[0].n === 0);
  // Alertas e conciliação.
  const pend = await one(`select count(*)::int n from payment_events where signature_valid and processed_at is null`);
  ok('nenhum aviso do gateway pendente (a conciliação não tem o que retomar)', pend[0].n === 0, String(pend[0].n));
  const conc = await one(`select count(*)::int n from orders where gateway_payment_id is not null and status in ('pendente','expirado','nao_concluido','pago','contestado','pago_sem_estoque')`);
  ok('nenhum pedido para a conciliação reconsultar', conc[0].n === 0);
  const semEst = await one(`select count(*)::int n from orders where status = 'pago_sem_estoque'`);
  ok('nenhum pago sem estoque (alerta da Visão geral)', semEst[0].n === 0);
  const emails = await one(`select status::text, count(*)::int n from email_log group by 1 order by 1`);
  console.log('      fila de e-mails (contas, sem pedido):', JSON.stringify(emails));
  // Trilha: linhas novas.
  const tr = await one(`select a.created_at, a.action, a.entity_id, u.role, a.before_json->'pedidos' as pedidos from audit_log a left join users u on u.id = a.actor_id
     where a.action = 'evento.limpeza_dados_de_teste' order by a.created_at`);
  ok('trilha: 2 linhas evento.limpeza_dados_de_teste do administrador', tr.length === 2 && tr.every(r => r.role === 'administrador'));
  for (const r of tr) console.log('      ', r.created_at.toISOString(), r.entity_id, JSON.stringify(r.pedidos));
  const anti = await one(`select count(*)::int n from audit_log where entity_id = any($1::uuid[])`, [T]);
  console.log(`      trilha com os ids dos eventos de teste (fica): ${anti[0].n} linhas; total ${(await one('select count(*)::int n from audit_log'))[0].n}`);
  // Evento do Bernardo igual à foto.
  const foto = JSON.stringify({
    event: (await one(`select * from events where id = $1`, [B]))[0],
    types: await one(`select * from ticket_types where event_id = $1 order by id`, [B]),
    lots: await one(`select * from ticket_lots where event_id = $1 order by id`, [B]),
    promoterDiscounts: await one(`select * from promoter_discount_events where event_id = $1 order by promoter_id`, [B]),
  });
  ok('evento do Bernardo igual à foto (evento, tipos, preços, capacidade, datas, lotes)', foto === readFileSync(process.env.FOTO_BERNARDO, 'utf8').trim());
  const contas = await one(`select role::text, count(*)::int n from users group by 1 order by 1`);
  console.log('      contas:', JSON.stringify(contas));
  await c.query('rollback');
} finally { await c.end(); }
