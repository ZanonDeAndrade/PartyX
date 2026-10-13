import { readFileSync } from 'node:fs';
import pg from 'pg';
import { verifyRestore, type Manifest } from '../src/ops/restoreCheck';

/**
 * Confere o banco onde um backup foi restaurado. Uso:
 *   DATABASE_URL=<banco ISOLADO restaurado> npm run -s backup:verify -- <arquivo>.manifest.json [--migracoes-esperadas=N]
 * `--migracoes-esperadas=N`: para a cópia tirada ANTES de uma release (menos migrações que o repositório, de propósito). Sem o
 * parâmetro, a cópia precisa ter pelo menos as migrações do repositório.
 * Sai com 1 se alguma verificação falhar. Nunca imprime a URL.
 */
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const url = process.env.DATABASE_URL;
const exactArg = args.find(a => a.startsWith('--migracoes-esperadas='))?.split('=')[1];
const unknown = args.filter(a => a.startsWith('--') && !a.startsWith('--migracoes-esperadas='));
if (!file || !url || unknown.length > 0 || (exactArg !== undefined && !/^[1-9]\d{0,3}$/.test(exactArg))) {
  console.error('uso: DATABASE_URL=<banco restaurado> npm run backup:verify -- <manifesto.json> [--migracoes-esperadas=N]');
  process.exit(2);
}
const exactMigrations = exactArg === undefined ? undefined : Number(exactArg);
const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
const journal = (JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as { entries: unknown[] }).entries.length;
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  if (exactMigrations !== undefined && exactMigrations > journal) {
    console.error(`--migracoes-esperadas=${exactMigrations} é maior que as ${journal} migrações do repositório`);
    process.exit(2);
  }
  const checks = await verifyRestore(pool, manifest, journal, { exactMigrations });
  for (const c of checks) console.log(`${c.ok ? 'OK    ' : 'FALHA '} ${c.name}: ${c.detail}`);
  const failed = checks.filter(c => !c.ok).length;
  const age = Math.round((Date.now() - Date.parse(manifest.generatedAt.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'))) / 3_600_000);
  console.log(`\nPonto recuperado: ${manifest.generatedAt} (cópia de ${age} h atrás). O que aconteceu depois dela NÃO está neste banco.`);
  console.log(failed === 0 ? `\n${checks.length} verificações, todas OK.` : `\n${failed} verificação(ões) FALHARAM de ${checks.length}.`);
  process.exit(failed === 0 ? 0 : 1);
} finally {
  await pool.end();
}
