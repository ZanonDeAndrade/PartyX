import pg from 'pg';

/** Testa a conexão pooled (aplicação) e a direta (migrações). Nunca imprime URL, host ou senha. */
async function check(label: string, url: string | undefined) {
  if (!url) return console.log(`${label}: não configurada`);
  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 8000 });
  try {
    const started = performance.now();
    const { rows } = await pool.query<{ version: string; max_connections: string }>(
      "select version(), current_setting('max_connections') as max_connections",
    );
    const ms = Math.round(performance.now() - started);
    const pooler = /-pooler\./.test(url) ? 'sim' : 'não detectado pelo host';
    console.log(
      `${label}: ok em ${ms} ms | ${rows[0]!.version.split(',')[0]} | max_connections=${rows[0]!.max_connections} | pooler: ${pooler}`,
    );
  } catch (error) {
    console.log(`${label}: FALHOU (${error instanceof Error ? error.name : 'erro'})`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await check('conexão pooled (DATABASE_URL)', process.env.DATABASE_URL);
await check('conexão direta (DATABASE_URL_DIRECT)', process.env.DATABASE_URL_DIRECT);
