import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, BACKUP_ROLE, ensureRoles } from './appRole';
import { runMigrations } from './migrate';
import { createTestDatabase } from './testing';

/**
 * Estes testes criam e APAGAM papéis do PostgreSQL, que são do cluster inteiro (não de um banco). Por isso rodam em um passo
 * separado (`vitest.cluster.config.ts`), DEPOIS da suíte principal, quando nenhum outro banco de teste está vivo com privilégios
 * desse papel. Misturados na suíte principal, o `drop role` falha de forma intermitente.
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!ADMIN_URL)('papel da aplicação e migração 0002 (integração)', () => {
  const dbs: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
  const roleNames = [APP_ROLE, BACKUP_ROLE];
  let admin: pg.Pool;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  });
  afterAll(async () => {
    for (const d of dbs) await d.drop();
    for (const r of roleNames) {
      await admin.query(`drop owned by ${r}`).catch(() => undefined);
      await admin.query(`drop role if exists ${r}`).catch(() => undefined);
    }
    await admin.end();
  });
  const fresh = async () => {
    const d = await createTestDatabase(ADMIN_URL!, { migrate: false });
    dbs.push(d);
    return d;
  };
  const dropRoles = async () => {
    for (const d of dbs) await d.pool.query(`revoke all on schema public from ${APP_ROLE}`).catch(() => undefined);
    for (const r of roleNames) await admin.query(`drop owned by ${r}`).catch(() => undefined);
    for (const r of roleNames) await admin.query(`drop role if exists ${r}`).catch(() => undefined);
  };

  it('sem o papel, a migração ABORTA com erro claro e não deixa banco pela metade', async () => {
    await dropRoles();
    const d = await fresh();
    await expect(runMigrations(d.url, 'drizzle', { allowMissingAppRole: false })).rejects.toThrow(/partyx_app.*não existe.*Crie-o antes de migrar/s);
    const tables = await d.pool.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
    expect(tables.rows[0].n).toBe(0); // tudo voltou: nenhuma tabela criada
  });

  it('local e testes podem dispensar o papel, de forma explícita; as permissões ficam sem efeito', async () => {
    await dropRoles();
    const d = await fresh();
    await runMigrations(d.url, 'drizzle', { allowMissingAppRole: true });
    const tables = await d.pool.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
    expect(tables.rows[0].n).toBeGreaterThan(10);
  });

  it('com o papel criado antes, migra e a aplicação ganha só o mínimo: lê e grava, mas não apaga nem altera auditoria', async () => {
    await dropRoles();
    const d = await fresh();
    const { passwords, actions } = await ensureRoles(d.pool);
    expect(actions.join()).toContain('papel criado: partyx_app');
    expect(passwords[APP_ROLE]).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    await runMigrations(d.url, 'drizzle', { allowMissingAppRole: false });
    const can = async (priv: string, table: string) =>
      (await d.pool.query('select has_table_privilege($1, $2, $3) as ok', [APP_ROLE, table, priv])).rows[0].ok as boolean;
    expect(await can('SELECT', 'orders')).toBe(true);
    expect(await can('INSERT', 'orders')).toBe(true);
    expect(await can('UPDATE', 'orders')).toBe(true);
    expect(await can('DELETE', 'orders')).toBe(false);
    expect(await can('DELETE', 'tickets')).toBe(false);
    expect(await can('UPDATE', 'audit_log')).toBe(false);
    expect(await can('DELETE', 'sessions')).toBe(true); // só dados temporários
    const attrs = (await d.pool.query("select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = $1", [APP_ROLE])).rows[0];
    expect(attrs).toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
    const member = await d.pool.query("select count(*)::int as n from pg_auth_members m join pg_roles r on r.oid = m.member where r.rolname = $1", [APP_ROLE]);
    expect(member.rows[0].n).toBe(0); // não pertence a nenhum papel (em especial, nada parecido com neon_superuser)
  });

  it('o papel de backup só lê; é idempotente e só --rotate troca a senha', async () => {
    await dropRoles();
    const d = await fresh();
    const first = await ensureRoles(d.pool);
    expect(first.passwords[BACKUP_ROLE]).toBeTruthy();
    const again = await ensureRoles(d.pool);
    expect(again.passwords).toEqual({ [APP_ROLE]: null, [BACKUP_ROLE]: null }); // não toca no que existe
    expect(again.actions.every(a => a.startsWith('já existe'))).toBe(true);
    const rotated = await ensureRoles(d.pool, { rotate: true });
    expect(rotated.passwords[APP_ROLE]).not.toBe(first.passwords[APP_ROLE]);
    await runMigrations(d.url, 'drizzle', { allowMissingAppRole: false });
    const r = await d.pool.query("select pg_has_role($1, 'pg_read_all_data', 'member') as ok", [BACKUP_ROLE]);
    expect(r.rows[0].ok).toBe(true);
    const w = await d.pool.query("select has_table_privilege($1, 'orders', 'INSERT') as ins, has_table_privilege($1, 'orders', 'UPDATE') as upd", [BACKUP_ROLE]);
    expect(w.rows[0]).toEqual({ ins: false, upd: false });
  });
});
