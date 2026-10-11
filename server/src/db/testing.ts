import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { runMigrations } from './migrate';

/** Banco descartável para testes de integração: um banco novo por arquivo de teste, removido no fim. */
export async function createTestDatabase(adminUrl: string, options: { migrate?: boolean } = {}) {
  const name = `partyx_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  if (options.migrate !== false) await runMigrations(url.toString());

  const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
  return {
    url: url.toString(),
    pool,
    async drop() {
      await pool.end();
      const cleanup = new pg.Client({ connectionString: adminUrl });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}
