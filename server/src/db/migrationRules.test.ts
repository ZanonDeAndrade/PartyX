import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeMigration, migrationPasses } from './migrationRules';

const kinds = (sql: string) => analyzeMigration(sql).findings.map(f => f.rule);

describe('regra expand/contract das migrações', () => {
  it('expandir é livre: tabela, coluna nula ou com padrão, índice, coluna NOT NULL com DEFAULT', () => {
    const sql = `CREATE TABLE "x" ("id" uuid primary key);--> statement-breakpoint
      ALTER TABLE "orders" ADD COLUMN "nota" text;--> statement-breakpoint
      ALTER TABLE "orders" ADD COLUMN "n" integer NOT NULL DEFAULT 0;--> statement-breakpoint
      CREATE INDEX "x_idx" ON "x" ("id");--> statement-breakpoint
      ALTER TABLE "orders" ADD CONSTRAINT "c" CHECK (n >= 0) NOT VALID;`;
    expect(analyzeMigration(sql).findings).toEqual([]);
    expect(migrationPasses(sql)).toBe(true);
  });

  it('contrair, renomear, mudar tipo, exigir NOT NULL e restringir são acusados', () => {
    const casos: [string, string][] = [
      ['ALTER TABLE "a" DROP COLUMN "b";', 'apaga coluna'],
      ['DROP TABLE "a";', 'apaga tabela'],
      ['ALTER TABLE "a" RENAME COLUMN "b" TO "c";', 'renomeia'],
      ['ALTER TABLE "a" RENAME TO "z";', 'renomeia'],
      ['ALTER TABLE "a" ALTER COLUMN "b" TYPE bigint;', 'muda o tipo da coluna'],
      ['ALTER TABLE "a" ALTER COLUMN "b" SET NOT NULL;', 'exige NOT NULL em coluna existente'],
      ['ALTER TABLE "a" ADD COLUMN "b" text NOT NULL;', 'coluna nova NOT NULL sem valor padrão'],
      ['ALTER TABLE "a" DROP CONSTRAINT "c";', 'apaga restrição ou índice'],
      ['DROP INDEX "i";', 'apaga restrição ou índice'],
      ['ALTER TABLE "a" ADD CONSTRAINT "c" CHECK (x > 0);', 'nova restrição que valida dados existentes e futuros'],
      ['CREATE TRIGGER t BEFORE DELETE ON "a" FOR EACH ROW EXECUTE FUNCTION f();', 'gatilho que pode recusar gravações'],
      ['REVOKE UPDATE ON "a" FROM papel;', 'revoga privilégio'],
      ['UPDATE "a" SET "b" = 1;', 'migração de dados'],
      ['DELETE FROM "a";', 'migração de dados'],
      ['TRUNCATE "a";', 'migração de dados'],
    ];
    for (const [sql, regra] of casos) {
      expect(kinds(sql), sql).toContain(regra);
      expect(migrationPasses(sql), sql).toBe(false);
    }
  });

  it('o corpo de DO $$ também é analisado (um REVOKE escondido ali dentro conta)', () => {
    expect(kinds("DO $$ BEGIN REVOKE UPDATE ON \"audit_log\" FROM papel; END $$;")).toContain('revoga privilégio');
  });

  it('palavras em comentários não contam', () => {
    expect(analyzeMigration('-- vamos fazer DROP COLUMN depois\nCREATE TABLE "x" ("id" int);').findings).toEqual([]);
  });

  it('com a linha de análise a migração passa; linha vazia não vale', () => {
    const sql = 'ALTER TABLE "a" DROP COLUMN "b";';
    expect(migrationPasses(`-- expand-contract: coluna sem uso desde a revisão anterior\n${sql}`)).toBe(true);
    expect(migrationPasses(`-- expand-contract:\n${sql}`)).toBe(false);
  });

  it('TODAS as migrações do repositório passam (CI)', () => {
    const files = readdirSync('drizzle').filter(f => /^\d{4}_.*\.sql$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) expect(migrationPasses(readFileSync(`drizzle/${f}`, 'utf8')), f).toBe(true);
  });
});
