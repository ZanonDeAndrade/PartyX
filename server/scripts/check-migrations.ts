import { readdirSync, readFileSync } from 'node:fs';
import { analyzeMigration } from '../src/db/migrationRules';

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
