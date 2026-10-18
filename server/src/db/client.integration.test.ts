import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createDatabase } from './client';
import { createTestDatabase } from './testing';

const ADMIN_URL = process.env.TEST_DATABASE_URL;

/**
 * Banco que dorme (Neon, 5 min sem uso; desde 18/10/2026 a verificação de saúde não consulta mais o banco): uma conexão PARADA no
 * pool pode ser encerrada pelo servidor. O processo não pode cair por isso, e a consulta seguinte abre outra conexão sozinha.
 */
describe.skipIf(!ADMIN_URL)('pool do banco: conexão parada encerrada pelo servidor (integração)', () => {
  it('não derruba o processo, avisa no log e a consulta seguinte funciona com uma conexão nova', async () => {
    const t = await createTestDatabase(ADMIN_URL!, { migrate: false });
    const url = new URL(t.url);
    url.searchParams.set('application_name', 'partyx-teste-pool');
    const db = createDatabase({ DATABASE_URL: url.toString(), DB_POOL_MAX: 2 });
    const uncaught: unknown[] = [];
    const onUncaught = (error: unknown) => uncaught.push(error);
    process.on('uncaughtException', onUncaught);
    const logs: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array, ...rest: never[]) => {
      logs.push(String(chunk));
      return write(chunk, ...rest);
    }) as typeof process.stdout.write;
    try {
      await db.ping(); // abre uma conexão, que volta parada ao pool
      const admin = new pg.Client({ connectionString: ADMIN_URL });
      await admin.connect();
      // O servidor encerra a conexão parada, como o Neon ao dormir.
      const killed = await admin.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'partyx-teste-pool'",
      );
      await admin.end();
      expect(killed.rowCount).toBeGreaterThan(0);
      await new Promise(resolve => setTimeout(resolve, 300)); // o aviso de conexão encerrada chega ao pool
      expect(uncaught).toEqual([]);
      expect(logs.join('')).toContain('conexão parada com o banco encerrada');
      await expect(db.ping()).resolves.toBeUndefined(); // abre outra conexão sozinha
    } finally {
      process.stdout.write = write;
      process.off('uncaughtException', onUncaught);
      await db.close();
      await t.drop();
    }
  });
});
