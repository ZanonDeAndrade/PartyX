import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { assertDatabaseEnvironment } from './environment';

/** Impede duas execuções simultâneas de migração (deploy duplicado). */
const MIGRATION_LOCK = 727_274;

interface JournalEntry {
  idx: number;
  tag: string;
}

async function readJournal(folder: string): Promise<JournalEntry[]> {
  const raw = await readFile(path.join(folder, 'meta', '_journal.json'), 'utf8');
  return (JSON.parse(raw) as { entries: JournalEntry[] }).entries;
}

/**
 * Aplica as migrações pendentes. Use a conexão **direta** do Neon (`DATABASE_URL_DIRECT`):
 * conexões pooled em modo transação não sustentam o lock de sessão nem DDL longo.
 */
export async function runMigrations(
  connectionString: string,
  folder = 'drizzle',
  options: { allowMissingAppRole?: boolean; expectedEnvironment?: string } = {},
): Promise<void> {
  // A migração 0002 recusa rodar se o papel `partyx_app` não existir (antes ela ignorava em silêncio e deixava o banco sem as
  // permissões da aplicação). Só ambiente local e testes (Vitest) podem dispensar o papel, de forma explícita.
  const allow = options.allowMissingAppRole ?? (process.env.PARTYX_ALLOW_MISSING_APP_ROLE === '1' || Boolean(process.env.VITEST));
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    // Antes de qualquer alteração: o banco precisa ser do ambiente que está migrando (homologação não migra banco de produção e vice-versa).
    if (options.expectedEnvironment) await assertDatabaseEnvironment(pool, options.expectedEnvironment);
    await pool.query('select pg_advisory_lock($1)', [MIGRATION_LOCK]);
    // `max: 1` mantém a mesma conexão: a configuração de sessão vale para todas as migrações desta execução.
    if (allow) await pool.query("select set_config('partyx.allow_missing_app_role', 'on', false)");
    try {
      await migrate(drizzle(pool), { migrationsFolder: folder });
    } finally {
      await pool.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK]);
    }
  } finally {
    await pool.end();
  }
}

/**
 * Reverte **a última** migração aplicada, executando `drizzle/rollback/<tag>.down.sql`.
 * O Drizzle não gera reversão, então cada migração mantém seu arquivo `.down.sql`.
 * Só aceita a última migração aplicada, para nunca deixar o histórico fora de ordem.
 */
export async function rollbackLastMigration(connectionString: string, tag: string, folder = 'drizzle'): Promise<void> {
  const journal = await readJournal(folder);
  const entry = journal.find(e => e.tag === tag);
  if (!entry) throw new Error(`Migração desconhecida: ${tag}`);

  const down = await readFile(path.join(folder, 'rollback', `${tag}.down.sql`), 'utf8');
  const pool = new pg.Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query('begin');
    const applied = await client.query<{ id: number }>('select id from drizzle.__drizzle_migrations order by id');
    if (applied.rowCount !== entry.idx + 1) {
      throw new Error(
        `${tag} não é a última migração aplicada (aplicadas: ${applied.rowCount}, posição: ${entry.idx + 1}).`,
      );
    }
    await client.query(down);
    await client.query('delete from drizzle.__drizzle_migrations where id = $1', [applied.rows.at(-1)!.id]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}
