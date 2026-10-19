// Limpeza dos eventos de teste "Teste" e "Teste02" em produção (pedido do administrador, 19/10/2026).
// Uma transação só. Padrão: ENSAIO (faz tudo e desfaz com ROLLBACK). Grava só com --executar.
// Conexão do DONO (segredo database-url-direct), porque os gatilhos são dele; a URL nunca é impressa. Sem nome, e-mail ou CPF na saída.
//
// Recusa (e desfaz) se: algum id/slug não bater; o evento do Bernardo estiver na lista; algum pedido dos dois eventos ainda estiver
// pago, pendente, contestado ou pago sem estoque (estorno não gravado); o evento do Bernardo (evento, tipos, lotes, descontos) diferir
// da foto tirada antes; sobrar qualquer linha; ou os gatilhos não voltarem ligados.
//
// --aceitar-pagos: aceita pedidos PAGOS, mas só os listados em DEVOLVIDOS_PIX_MANUAL (número e valor conferidos), cujo dinheiro o
// administrador devolveu por Pix manual em 19/10/2026, fora do Mercado Pago. Pendente, contestado e pago sem estoque continuam recusados,
// e um pedido pago fora da lista (ou com outro valor) também. A trilha grava a forma da devolução de cada pedido.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const pg = createRequire(process.env.PG_FROM)('pg');

const EXECUTAR = process.argv.includes('--executar');
const ACEITAR_PAGOS = process.argv.includes('--aceitar-pagos');
// Pedidos pagos dos dois eventos, devolvidos por Pix manual em 19/10/2026 fora do Mercado Pago (informado pelo administrador), em centavos.
const DEVOLVIDOS_PIX_MANUAL = new Map([[10001, 100], [10003, 100], [10004, 200], [10005, 100], [10006, 100], [10008, 100]]);
const ALVOS = [
  { id: 'a5a09cdc-a375-45c2-a9ac-1da8ca58c257', slug: 'teste', name: 'Teste' },
  { id: '0003d4fb-ba54-4802-b33f-b9a8d095f1db', slug: 'teste02', name: 'Teste02' },
];
const BERNARDO = 'a05708e7-80b3-42b7-a05c-d3667a289c99';
const FOTO = readFileSync(process.env.FOTO_BERNARDO, 'utf8').trim();
const BACKUP = process.env.BACKUP_REF; // execução do backup sob demanda, conferida antes
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!BACKUP || !ADMIN_EMAIL) throw new Error('informe BACKUP_REF e ADMIN_EMAIL');
const T = ALVOS.map(a => a.id);

// Gatilhos que recusam exclusão nas tabelas tocadas. A trilha (audit_log_no_delete/no_update) NÃO entra: continua ligada.
const GATILHOS = [
  ['checkins', 'checkins_forbid_delete'],
  ['ticket_minor_acceptances', 'ticket_minor_acceptances_forbid_delete'],
  ['ticket_transfers', 'ticket_transfers_forbid_delete'],
  ['payment_events', 'payment_events_forbid_delete'],
  ['minor_term_acceptances', 'minor_term_acceptances_forbid_delete'],
  ['cancellation_acceptances', 'cancellation_acceptances_forbid_delete'],
  ['tickets', 'tickets_forbid_delete'],
  ['order_item_lots', 'order_item_lots_forbid_delete'],
  ['order_items', 'order_items_forbid_delete'],
  ['orders', 'orders_forbid_delete'],
  ['ticket_types', 'ticket_types_delete_only_unused'],
  ['events', 'events_delete_only_unused'],
];

// Conjuntos fixados no início (tabelas temporárias da transação): tudo o que sai depende dos dois ids.
const CONJUNTOS = [
  `create temp table _ev on commit drop as select id from events where id = any($1::uuid[])`,
  `create temp table _ord on commit drop as select id from orders where event_id in (select id from _ev)`,
  `create temp table _tk on commit drop as select id from tickets where event_id in (select id from _ev) or order_id in (select id from _ord)`,
  `create temp table _tr on commit drop as select id from ticket_transfers where event_id in (select id from _ev) or ticket_id in (select id from _tk)`,
];

// Ordem das exclusões: filhos antes dos pais (chaves estrangeiras sem cascata; conferidas no catálogo de produção em 19/10/2026:
// reservas e ingressos apontam para os itens, ingressos e lotes dos itens para os lotes).
const PASSOS = [
  ['checkins', `delete from checkins where event_id in (select id from _ev) or ticket_id in (select id from _tk)`],
  ['ticket_minor_acceptances', `delete from ticket_minor_acceptances where ticket_transfer_id in (select id from _tr)`],
  ['ticket_transfers', `delete from ticket_transfers where id in (select id from _tr)`],
  ['email_log', `delete from email_log where order_id in (select id from _ord)`],
  ['payment_events', `delete from payment_events where order_id in (select id from _ord)`],
  ['minor_term_acceptances', `delete from minor_term_acceptances where order_id in (select id from _ord)`],
  ['cancellation_acceptances', `delete from cancellation_acceptances where order_id in (select id from _ord)`],
  ['tickets', `delete from tickets where id in (select id from _tk)`],
  ['order_item_lots', `delete from order_item_lots where order_id in (select id from _ord)`],
  ['reservations', `delete from reservations where order_id in (select id from _ord)`],
  ['order_items', `delete from order_items where order_id in (select id from _ord)`],
  ['orders', `delete from orders where id in (select id from _ord)`],
  ['promoter_discount_events', `delete from promoter_discount_events where event_id in (select id from _ev)`],
  ['ticket_lots', `delete from ticket_lots where event_id in (select id from _ev)`],
  ['ticket_types', `delete from ticket_types where event_id in (select id from _ev)`],
  ['events', `delete from events where id in (select id from _ev)`],
];

// Contagem por tabela, pelos mesmos critérios (sempre contra o banco, não contra as temporárias).
const CONTAGEM = `
  select 'checkins' t, count(*)::int n from checkins where event_id = any($1::uuid[])
     or ticket_id in (select id from tickets where event_id = any($1::uuid[]))
  union all select 'ticket_minor_acceptances', count(*)::int from ticket_minor_acceptances where ticket_transfer_id in
     (select id from ticket_transfers where event_id = any($1::uuid[]))
  union all select 'ticket_transfers', count(*)::int from ticket_transfers where event_id = any($1::uuid[])
  union all select 'email_log', count(*)::int from email_log where order_id in (select id from orders where event_id = any($1::uuid[]))
  union all select 'payment_events', count(*)::int from payment_events where order_id in (select id from orders where event_id = any($1::uuid[]))
  union all select 'minor_term_acceptances', count(*)::int from minor_term_acceptances where order_id in (select id from orders where event_id = any($1::uuid[]))
  union all select 'cancellation_acceptances', count(*)::int from cancellation_acceptances where order_id in (select id from orders where event_id = any($1::uuid[]))
  union all select 'tickets', count(*)::int from tickets where event_id = any($1::uuid[])
  union all select 'order_item_lots', count(*)::int from order_item_lots where order_id in (select id from orders where event_id = any($1::uuid[]))
  union all select 'order_items', count(*)::int from order_items where order_id in (select id from orders where event_id = any($1::uuid[]))
  union all select 'reservations', count(*)::int from reservations where order_id in (select id from orders where event_id = any($1::uuid[]))
  union all select 'orders', count(*)::int from orders where event_id = any($1::uuid[])
  union all select 'promoter_discount_events', count(*)::int from promoter_discount_events where event_id = any($1::uuid[])
  union all select 'ticket_lots', count(*)::int from ticket_lots where event_id = any($1::uuid[])
  union all select 'ticket_types', count(*)::int from ticket_types where event_id = any($1::uuid[])
  union all select 'events', count(*)::int from events where id = any($1::uuid[])`;

const fotoBernardo = async c => JSON.stringify({
  event: (await c.query(`select * from events where id = $1`, [BERNARDO])).rows[0],
  types: (await c.query(`select * from ticket_types where event_id = $1 order by id`, [BERNARDO])).rows,
  lots: (await c.query(`select * from ticket_lots where event_id = $1 order by id`, [BERNARDO])).rows,
  promoterDiscounts: (await c.query(`select * from promoter_discount_events where event_id = $1 order by promoter_id`, [BERNARDO])).rows,
});
const contar = async c => Object.fromEntries((await c.query(CONTAGEM, [T])).rows.map(r => [r.t, r.n]));
const recusa = msg => { throw new Error(`RECUSADO: ${msg}`); };

const c = new pg.Client({ connectionString: process.env.DB_URL });
await c.connect();
try {
  await c.query('begin');
  await c.query(`set local lock_timeout = '5s'`);
  await c.query(`set local statement_timeout = '60s'`);
  console.log(`modo: ${EXECUTAR ? 'EXECUTAR (commit)' : 'ENSAIO (rollback no fim)'}; papel: ${(await c.query('select current_user u')).rows[0].u}`);

  // 1) Conferências antes de mexer.
  if (T.includes(BERNARDO)) recusa('o evento do Bernardo está na lista');
  const ev = (await c.query(`select id, slug, name, archived_at from events where id = any($1::uuid[]) for update`, [T])).rows;
  for (const a of ALVOS) {
    const e = ev.find(x => x.id === a.id);
    if (!e || e.slug !== a.slug || e.name !== a.name) recusa(`evento ${a.id} não é ${a.slug}/${a.name}`);
    if (!e.archived_at) recusa(`${a.slug} não está arquivado`);
  }
  const pedidos = (await c.query(`select o.number, e.slug, o.status, o.total_cents, o.payment_method from orders o join events e on e.id = o.event_id
     where o.event_id = any($1::uuid[]) order by o.number for update of o`, [T])).rows;
  console.log('pedidos:', pedidos.map(p => `PX-${p.number} ${p.slug} ${p.status}`).join('; '));
  const encerrados = ['estornado', 'expirado', 'cancelado', 'nao_concluido', 'recusado'];
  const aceito = p => encerrados.includes(p.status) ||
    (ACEITAR_PAGOS && p.status === 'pago' && DEVOLVIDOS_PIX_MANUAL.get(p.number) === p.total_cents);
  const abertos = pedidos.filter(p => !aceito(p));
  if (abertos.length) recusa(`pedidos sem estorno gravado: ${abertos.map(p => `PX-${p.number} (${p.status}, ${p.total_cents} centavos)`).join(', ')}` +
    (ACEITAR_PAGOS ? '' : '; para os devolvidos por Pix manual, use --aceitar-pagos'));
  // Forma da devolução de cada pedido com dinheiro, para a trilha e a contabilidade.
  const devolucao = p => p.status === 'pago' ? 'Pix manual em 19/10/2026, fora do Mercado Pago (pedido continua aprovado no Mercado Pago)'
    : p.status === 'estornado' ? 'estorno no painel do Mercado Pago (gravado pelo webhook)' + (DEVOLVIDOS_PIX_MANUAL.has(p.number) ? '; consta também na lista do Pix manual' : '')
    : null;
  console.log(`--aceitar-pagos: ${ACEITAR_PAGOS ? 'sim' : 'não'}; pagos aceitos: ${pedidos.filter(p => p.status === 'pago').map(p => `PX-${p.number}`).join(', ') || 'nenhum'}`);
  if ((await fotoBernardo(c)) !== FOTO) recusa('o evento do Bernardo mudou desde a foto');
  const admin = (await c.query(`select id from users where email = $1 and role = 'administrador'`, [ADMIN_EMAIL])).rows[0];
  if (!admin) recusa('administrador não encontrado');

  const antes = await contar(c);
  const trilhaAntes = (await c.query(`select count(*)::int n from audit_log`)).rows[0].n;
  console.log('\nlinhas ANTES:', JSON.stringify(antes));

  // 2) Gatilhos desligados SÓ dentro desta transação (ALTER TABLE é transacional; trava de escrita nessas tabelas até o fim).
  for (const [t, g] of GATILHOS) await c.query(`alter table "${t}" disable trigger "${g}"`);

  // 3) Exclusões, conferindo cada contagem contra a de antes.
  for (const q of CONJUNTOS) await c.query(q, q.includes('$1') ? [T] : []);
  const apagadas = {};
  for (const [t, q] of PASSOS) {
    apagadas[t] = (await c.query(q)).rowCount;
    if (apagadas[t] !== antes[t]) recusa(`${t}: apagou ${apagadas[t]}, esperado ${antes[t]}`);
  }

  // 4) Gatilhos religados antes do commit, e conferidos no catálogo.
  for (const [t, g] of GATILHOS) await c.query(`alter table "${t}" enable trigger "${g}"`);
  const desligados = (await c.query(`select tgname from pg_trigger where not tgisinternal and tgenabled = 'D'`)).rows;
  if (desligados.length) recusa(`gatilhos ainda desligados: ${desligados.map(r => r.tgname).join(', ')}`);

  // 5) Depois: nada sobra, evento do Bernardo igual.
  const depois = await contar(c);
  console.log('linhas DEPOIS:', JSON.stringify(depois));
  if (Object.values(depois).some(n => n !== 0)) recusa('sobrou linha');
  if ((await fotoBernardo(c)) !== FOTO) recusa('o evento do Bernardo mudou durante a limpeza');

  // 6) Linha nova na trilha, uma por evento (a trilha antiga fica toda).
  for (const a of ALVOS) {
    await c.query(
      `insert into audit_log (actor_id, action, entity, entity_id, before_json, after_json, reason) values ($1, 'evento.limpeza_dados_de_teste', 'event', $2, $3, null, $4)`,
      [admin.id, a.id,
        JSON.stringify({ slug: a.slug, name: a.name,
          pedidos: pedidos.filter(p => p.slug === a.slug).map(p => ({ numero: `PX-${p.number}`, status: p.status, totalCentavos: p.total_cents,
            forma: p.payment_method, devolucao: devolucao(p) })),
          aceitarPagos: ACEITAR_PAGOS, linhasApagadasNosDoisEventos: apagadas }),
        `Dados de teste em produção removidos a pedido do administrador (19/10/2026): evento, tipos, lotes, pedidos, ingressos, entradas ` +
        `(inclusive a leitura de um ingresso de teste no evento do Bernardo, autorizada), transferência, avisos do gateway e e-mails. ` +
        (ACEITAR_PAGOS ? `Pedidos pagos apagados com o dinheiro devolvido por Pix manual em 19/10/2026, fora do Mercado Pago, onde continuam aprovados ` +
          `(registro docs/registros/limpeza-dados-de-teste-2026-10-19.md). ` : '') +
        `Backup sob demanda ${BACKUP}. Script em transação, gatilhos de exclusão desligados só dentro dela. Contas de comprador mantidas.`]);
  }
  const trilhaDepois = (await c.query(`select count(*)::int n from audit_log`)).rows[0].n;
  if (trilhaDepois !== trilhaAntes + ALVOS.length) recusa(`trilha: ${trilhaAntes} -> ${trilhaDepois}`);
  console.log(`trilha: ${trilhaAntes} -> ${trilhaDepois} linhas (nenhuma apagada)`);

  if (EXECUTAR) { await c.query('commit'); console.log('\nCOMMIT feito.'); }
  else { await c.query('rollback'); console.log('\nENSAIO: tudo conferiu; ROLLBACK, nada gravado.'); }
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error(`\n${e.message}\nROLLBACK: nada gravado.`);
  process.exitCode = 1;
} finally { await c.end(); }
