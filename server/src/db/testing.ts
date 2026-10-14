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
  if (options.migrate !== false) {
    await runMigrations(url.toString());
    // SÓ NO BANCO DE TESTE: quem é cadastrado direto no SQL (fixtures antigas) nasce adulto, para o checkout não pedir a data de
    // nascimento em todo teste (regra de 14/10/2026). Produção não tem valor padrão: o cadastro exige a data e conta antiga fica nula.
    // Os testes de menores e de "conta antiga sem data" informam a data, ou `null`, explicitamente.
    const setup = new pg.Client({ connectionString: url.toString() });
    await setup.connect();
    await setup.query(`alter table users alter column birth_date set default date '1990-01-01'`);
    await setup.end();
  }

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
