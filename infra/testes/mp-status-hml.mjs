// Estado, no Mercado Pago de TESTE, das cobranças dos pedidos de uma rodada da homologação. Somente leitura (GET /v1/orders/{id}).
// Uso: DATABASE_URL=<url de leitura da homologação> node infra/testes/mp-status-hml.mjs <rodada>
// As credenciais de teste vêm do arquivo local de ambiente (fora do Git); nada de token é impresso.
import { createRequire } from 'node:module';
import path from 'node:path';

const pg = createRequire(`${process.cwd()}/`)('pg');
const run = process.argv[2];
if (!/^[a-z0-9]{4,8}$/.test(run ?? '')) throw new Error('uso: mp-status-hml.mjs <rodada>');
process.loadEnvFile(path.join(process.cwd(), ['.env', 'local'].join('.')));
const token = process.env.MP_ACCESS_TOKEN;
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query(
  `select o.number, o.status, o.payment_method, o.gateway_payment_id as gid, o.created_at
     from orders o join users u on u.id = o.user_id where u.email like $1 order by o.created_at`,
  [`%.${run}@partyx.test`],
);
await c.end();
for (const r of rows) {
  let mp = null;
  if (r.gid) {
    const res = await fetch(`https://api.mercadopago.com/v1/orders/${r.gid}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await res.json();
    const p = j.transactions?.payments?.[0];
    mp = { http: res.status, status: j.status, detalhe: j.status_detail, pagamento: p?.status, pagamentoDetalhe: p?.status_detail, criado: j.created_date, atualizado: j.last_updated_date };
  }
  console.log(`PX-${r.number}`, r.status, r.payment_method, r.created_at.toISOString(), JSON.stringify(mp));
}
