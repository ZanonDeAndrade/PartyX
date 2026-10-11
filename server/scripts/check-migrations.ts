import { readdirSync, readFileSync } from 'node:fs';
import { analyzeMigration } from '../src/db/migrationRules';
import { createTestDatabase } from '../src/db/testing';
import { rollbackLastMigration, runMigrations } from '../src/db/migrate';

/** Verifica a regra expand/contract em todas as migrações. Uso: `npm run check:migrations`. Sai com 1 se alguma reprovar. */
const files = readdirSync('drizzle').filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
let failed = 0;
for (const f of files) {
  const { findings, justification } = analyzeMigration(readFileSync(`drizzle/${f}`, 'utf8'));
  const kinds = [...new Set(findings.map(x => x.rule))];
  if (findings.length === 0) console.log(`OK     ${f}: só expande`);
  else if (justification) console.log(`OK     ${f}: ${kinds.length} ponto(s) de atenção, com análise registrada: ${justification.slice(0, 100)}`);
  else {
    failed++;
    console.log(`FALHA  ${f}: falta a linha "-- expand-contract: <por que é seguro para o código anterior>". Pontos:`);
    for (const x of findings.slice(0, 8)) console.log(`         - ${x.rule}: ${x.statement}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} migração(ões) sem análise de retrocompatibilidade (docs: README-DEPLOY.md, seção Rollback).`);
  process.exit(1);
}

// Com um PostgreSQL de teste, comprova também a reversão e a reaplicação reais.
const adminUrl = process.env.TEST_DATABASE_URL;
if (adminUrl) {
  const tags = files.map(f => f.slice(0, -4));
  const db = await createTestDatabase(adminUrl, { migrate: false });
  try {
    const applyAll = () => runMigrations(db.url, 'drizzle', { allowMissingAppRole: true });
    const assertApplied = async () => {
      const result = await db.pool.query<{ count: number }>(
        'select count(*)::int as count from drizzle.__drizzle_migrations',
      );
      if (result.rows[0]?.count !== tags.length) throw new Error(`Esperadas ${tags.length} migrações aplicadas`);
      const triggers = await db.pool.query<{ tgname: string }>(
        `select tgname from pg_trigger where not tgisinternal and tgenabled = 'O'
         and tgname = any($1::text[])`,
        [['orders_paid_at_immutable', 'audit_log_no_update', 'audit_log_no_delete']],
      );
      if (triggers.rowCount !== 3) throw new Error('Gatilhos paid_at/audit_log ausentes ou desativados');
    };
    await applyAll();
    await assertApplied();
    for (const tag of tags.toReversed()) await rollbackLastMigration(db.url, tag);
    const tables = await db.pool.query<{ count: number }>(
      "select count(*)::int as count from information_schema.tables where table_schema = 'public'",
    );
    if (tables.rows[0]?.count !== 0) throw new Error('Rollback deixou tabelas no schema public');
    await applyAll();
    await assertApplied();
    console.log(`OK     PostgreSQL: ${tags.length} migrações aplicadas, revertidas e reaplicadas; gatilhos ativos`);
  } finally {
    await db.drop();
  }
}
