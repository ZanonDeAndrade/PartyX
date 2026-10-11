import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertDatabaseEnvironment,
  DatabaseEnvironmentError,
  markDatabaseEnvironment,
  markDatabaseEnvironmentSafely,
  readDatabaseEnvironment,
} from './environment';
import { runMigrations } from './migrate';
import { createTestDatabase } from './testing';

const ADMIN_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!ADMIN_URL)('marca de ambiente do banco (integração)', () => {
  const dbs: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
  const fresh = async (migrate = false) => {
    const d = await createTestDatabase(ADMIN_URL!, { migrate });
    dbs.push(d);
    return d;
  };
  afterAll(async () => {
    for (const d of dbs) await d.drop();
  });
  beforeAll(() => undefined);

  it('banco novo não tem marca; marcar vale para conexões novas e não vaza para outro banco', async () => {
    const a = await fresh();
    const b = await fresh();
    expect(await readDatabaseEnvironment(a.pool)).toBeNull();
    await markDatabaseEnvironment(a.pool, 'producao');
    const again = (await import('pg')).default; // conexão NOVA: a marca é do BANCO (comentário), não da sessão
    const pool = new again.Pool({ connectionString: a.url, max: 1 });
    expect(await readDatabaseEnvironment(pool)).toBe('producao');
    await pool.end();
    expect(await readDatabaseEnvironment(b.pool)).toBeNull();
  });

  it('assertDatabaseEnvironment: sem marca, marca errada e marca certa', async () => {
    const d = await fresh();
    await expect(assertDatabaseEnvironment(d.pool, 'producao')).rejects.toThrow(/não tem marca de ambiente/);
    await markDatabaseEnvironment(d.pool, 'homologacao');
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({ connectionString: d.url, max: 1 });
    await expect(assertDatabaseEnvironment(pool, 'producao')).rejects.toThrow(DatabaseEnvironmentError);
    await expect(assertDatabaseEnvironment(pool, 'producao')).rejects.toThrow(
      /ambiente producao.*pertence ao ambiente homologacao/,
    );
    await expect(assertDatabaseEnvironment(pool, 'homologacao')).resolves.toBeUndefined();
    await expect(assertDatabaseEnvironment(pool, 'local')).resolves.toBeUndefined();
    await pool.end();
  });

  it('a marca não se troca por engano: remarcar para outro ambiente é recusado, repetir o mesmo é inofensivo', async () => {
    const d = await fresh();
    await markDatabaseEnvironmentSafely(d.pool, 'homologacao');
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({ connectionString: d.url, max: 1 });
    await expect(markDatabaseEnvironmentSafely(pool, 'producao')).rejects.toThrow(/já pertence a homologacao/);
    await expect(markDatabaseEnvironmentSafely(pool, 'homologacao')).resolves.toBeUndefined();
    await pool.end();
  });

  it('a MIGRAÇÃO recusa banco de outro ambiente ou sem marca, antes de criar qualquer tabela', async () => {
    const d = await fresh();
    await expect(
      runMigrations(d.url, 'drizzle', { allowMissingAppRole: true, expectedEnvironment: 'producao' }),
    ).rejects.toThrow(/sem marca|não tem marca/);
    await markDatabaseEnvironment(d.pool, 'homologacao');
    await expect(
      runMigrations(d.url, 'drizzle', { allowMissingAppRole: true, expectedEnvironment: 'producao' }),
    ).rejects.toThrow(/pertence ao ambiente homologacao/);
    const tables = await d.pool.query(
      "select count(*)::int as n from information_schema.tables where table_schema in ('public','drizzle')",
    );
    expect(tables.rows[0].n).toBe(0); // nada foi criado
    await runMigrations(d.url, 'drizzle', { allowMissingAppRole: true, expectedEnvironment: 'homologacao' });
    expect(
      (await d.pool.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'"))
        .rows[0].n,
    ).toBeGreaterThan(10);
  });

  /** Sobe o servidor de verdade e devolve o que aconteceu: saiu (com código) ou iniciou (e então é encerrado). */
  function boot(env: Record<string, string>) {
    return new Promise<{ exited: number | null; started: boolean; out: string; err: string }>(resolve => {
      const child = spawn('node', ['--import', 'tsx', 'server/src/index.ts'], {
        env: { PATH: process.env.PATH ?? '', PORT: String(20000 + Math.floor(Math.random() * 20000)), ...env },
      });
      let out = '';
      let err = '';
      let started = false;
      const finish = (code: number | null) => resolve({ exited: code, started, out, err });
      child.stdout.on('data', d => {
        out += String(d);
        if (out.includes('servidor iniciado') && !started) {
          started = true;
          child.kill('SIGKILL');
        }
      });
      child.stderr.on('data', d => (err += String(d)));
      child.on('exit', code => finish(code));
      setTimeout(() => child.kill('SIGKILL'), 12_000).unref();
    });
  }

  it('o SERVIDOR se recusa a subir (processo real) com banco de outro ambiente ou sem marca; com a marca certa sobe', async () => {
    const d = await fresh(true);
    await markDatabaseEnvironment(d.pool, 'homologacao');
    const base = {
      DATABASE_URL: d.url,
      PUBLIC_BASE_URL: 'https://partyx.example.com',
      SESSION_SECRET: 's'.repeat(40),
      QR_HMAC_KEYS: `1:${randomBytes(32).toString('base64url')}`,
    };
    const prod = await boot({
      ...base,
      APP_ENV: 'producao',
      TURNSTILE_SECRET: 'segredo-turnstile-teste',
      TURNSTILE_SITE_KEY: 'chave-site-turnstile-teste',
    });
    expect(prod.exited).toBe(1);
    expect(prod.started).toBe(false);
    expect(prod.err).toContain('"alert":"banco_de_outro_ambiente"');
    expect(prod.err).toContain('pertence ao ambiente homologacao');
    expect(prod.err + prod.out).not.toContain(d.url); // nunca imprime a URL
    // Sem marca: também recusa.
    const clean = await fresh(true);
    const noMark = await boot({ ...base, DATABASE_URL: clean.url, APP_ENV: 'homologacao' });
    expect(noMark.exited).toBe(1);
    expect(noMark.err).toContain('não tem marca de ambiente');
    // Marca certa: sobe e é encerrado em seguida.
    const ok = await boot({ ...base, APP_ENV: 'homologacao' });
    expect(ok.started).toBe(true);
    expect(ok.err).not.toContain('banco_de_outro_ambiente');
  });
});
