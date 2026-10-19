// Amostra, a cada 2 s, as conexões abertas no PostgreSQL de teste (pg_stat_activity do banco da rodada), a CPU e a memória RSS do
// processo do servidor. Uso: node auditoria/carga/amostrador.mjs <url do banco> <pid> <saida.jsonl>
import { appendFileSync, readFileSync } from 'node:fs';
import pg from 'pg';

const [url, pid, out] = process.argv.slice(2);
if (/neon\.tech/.test(url)) throw new Error('recusado: só o PostgreSQL de teste');
const pool = new pg.Pool({ connectionString: url, max: 1 });
const dbname = new URL(url).pathname.slice(1);
let lastCpu = 0;
let lastAt = Date.now();
setInterval(async () => {
  try {
    const { rows } = await pool.query(`select count(*)::int as n, count(*) filter (where state = 'active')::int as ativas from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [dbname]);
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ');
    const cpuTicks = Number(stat[13]) + Number(stat[14]);
    const rssKb = Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)?.[1] ?? 0);
    const now = Date.now();
    const cpuPct = lastCpu ? ((cpuTicks - lastCpu) / 100 / ((now - lastAt) / 1000)) * 100 : 0;
    lastCpu = cpuTicks;
    lastAt = now;
    appendFileSync(out, JSON.stringify({ t: new Date(now).toISOString(), conexoes: rows[0].n, ativas: rows[0].ativas, cpuPct: Math.round(cpuPct), rssMb: Math.round(rssKb / 1024) }) + '\n');
  } catch (e) {
    appendFileSync(out, JSON.stringify({ t: new Date().toISOString(), erro: e instanceof Error ? e.message.slice(0, 80) : 'x' }) + '\n');
  }
}, 2000);
