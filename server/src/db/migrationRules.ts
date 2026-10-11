/**
 * Regra das migrações **retrocompatíveis** (expand/contract), que torna o rollback do código seguro.
 *
 * O deploy aplica a migração ANTES de a nova revisão receber tráfego. Se a revisão nova der problema, volta-se o código
 * (`deploy.sh rollback`), mas o banco **continua no esquema novo**. Por isso toda migração precisa deixar o código da revisão
 * ANTERIOR funcionando:
 *
 * - **Expandir** (permitido): criar tabela, coluna nula ou com valor padrão, índice, tipo, função; afrouxar uma regra.
 * - **Contrair** (só em um deploy POSTERIOR, quando nenhuma revisão que ainda possa receber rollback usa o que sai): apagar ou
 *   renomear coluna e tabela, mudar tipo, exigir NOT NULL, apagar restrição ou índice.
 * - **Restringir gravações** (nova restrição, gatilho que recusa, REVOKE) pode derrubar o código anterior: exige análise.
 * - Migração de dados (`UPDATE`, `DELETE`, `TRUNCATE`) também exige análise.
 *
 * Este verificador **não decide** se algo é seguro: acusa o que MERECE análise. Quem escreve a migração faz a análise e a registra
 * numa linha `-- expand-contract: <por que é seguro>`, que o revisor lê. Sem a linha, a CI reprova.
 */
export interface Finding {
  rule: string;
  statement: string;
}

const RULES: { rule: string; test: RegExp }[] = [
  { rule: 'apaga tabela', test: /\bdrop\s+table\b/i },
  { rule: 'apaga coluna', test: /\bdrop\s+column\b/i },
  { rule: 'apaga tipo ou esquema', test: /\bdrop\s+(type|schema)\b/i },
  { rule: 'renomeia', test: /\brename\b/i },
  { rule: 'muda o tipo da coluna', test: /\balter\s+column\b[^;]*\btype\b/i },
  { rule: 'exige NOT NULL em coluna existente', test: /\balter\s+column\b[^;]*\bset\s+not\s+null\b/i },
  { rule: 'coluna nova NOT NULL sem valor padrão', test: /\badd\s+column\b(?![^;]*\bdefault\b)[^;]*\bnot\s+null\b/i },
  { rule: 'apaga restrição ou índice', test: /\bdrop\s+(constraint|index)\b/i },
  {
    rule: 'nova restrição que valida dados existentes e futuros',
    test: /\badd\s+constraint\b(?![^;]*\bnot\s+valid\b)/i,
  },
  { rule: 'gatilho que pode recusar gravações', test: /\bcreate\s+(or\s+replace\s+)?trigger\b/i },
  { rule: 'revoga privilégio', test: /\brevoke\b/i },
  { rule: 'migração de dados', test: /\b(truncate|delete\s+from|update\s+"?[\w.]+"?\s+set)\b/i },
];

/** Remove comentários. O corpo de `DO $$ ... $$` e de funções FICA: é SQL de verdade (um `REVOKE` pode estar lá dentro). */
function strip(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

export function analyzeMigration(sql: string): { findings: Finding[]; justification: string | null } {
  const note = /^--[ \t]*expand-contract:[ \t]*(\S.*)$/im.exec(sql);
  const findings: Finding[] = [];
  for (const raw of strip(sql).split(/;|-->\s*statement-breakpoint/)) {
    const statement = raw.trim().replace(/\s+/g, ' ');
    if (!statement) continue;
    for (const { rule, test } of RULES) if (test.test(statement)) findings.push({ rule, statement: statement.slice(0, 120) });
  }
  return { findings, justification: note ? note[1]!.trim() : null };
}

/** Migração aprovada = sem achados, ou com achados e a linha de justificativa. */
export function migrationPasses(sql: string): boolean {
  const { findings, justification } = analyzeMigration(sql);
  return findings.length === 0 || justification !== null;
}
