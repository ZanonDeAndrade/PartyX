import { readFileSync } from 'node:fs';
import pg from 'pg';
import { verifyRestore, type Manifest } from '../src/ops/restoreCheck';

/**
 * Confere o banco onde um backup foi restaurado. Uso:
 *   DATABASE_URL=<banco ISOLADO restaurado> npm run -s backup:verify -- <arquivo>.manifest.json
 * Sai com 1 se alguma verificação falhar. Nunca imprime a URL.
 */
const file = process.argv[2];
const url = process.env.DATABASE_URL;
if (!file || !url) {
  console.error('uso: DATABASE_URL=<banco restaurado> npm run backup:verify -- <manifesto.json>');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
const journal = (JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as { entries: unknown[] }).entries.length;
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const checks = await verifyRestore(pool, manifest, journal);
  for (const c of checks) console.log(`${c.ok ? 'OK    ' : 'FALHA '} ${c.name}: ${c.detail}`);
  const failed = checks.filter(c => !c.ok).length;
  const age = Math.round((Date.now() - Date.parse(manifest.generatedAt.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'))) / 3_600_000);
  console.log(`\nPonto recuperado: ${manifest.generatedAt} (cópia de ${age} h atrás). O que aconteceu depois dela NÃO está neste banco.`);
  console.log(failed === 0 ? `\n${checks.length} verificações, todas OK.` : `\n${failed} verificação(ões) FALHARAM de ${checks.length}.`);
  process.exit(failed === 0 ? 0 : 1);
} finally {
  await pool.end();
}
