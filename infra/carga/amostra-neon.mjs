// Amostra o banco de HOMOLOGAÇÃO durante a carga: conexões abertas e ativas no banco e o tempo de ida e volta de `select 1` a partir
// desta máquina. Somente leitura (papel de backup, sessão read only). Para quando o arquivo de parada existir.
// Uso: DATABASE_URL=<url de leitura> node infra/carga/amostra-neon.mjs <saída.txt> <arquivo-de-parada>
import { existsSync, appendFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const pg = createRequire(`${process.cwd()}/`)('pg');
const [saida, parar] = process.argv.slice(2);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, options: '-c default_transaction_read_only=on' });
await client.connect();
writeFileSync(saida, 'epoch_ms conexoes ativas ida_e_volta_ms\n');
while (!existsSync(parar)) {
  const t0 = performance.now();
  await client.query('select 1');
  const rtt = performance.now() - t0;
  const { rows } = await client.query(
    `select count(*)::int as total, count(*) filter (where state = 'active')::int as ativas
       from pg_stat_activity where datname = current_database()`,
  );
  appendFileSync(saida, `${Date.now()} ${rows[0].total} ${rows[0].ativas} ${rtt.toFixed(1)}\n`);
  await new Promise(r => setTimeout(r, 5000));
}
await client.end();
