import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { assertGlobalOpen, BUCKET_MS, consumeGlobal, recordGlobal } from './globalLimits';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const MIN = 60_000;

describe.skipIf(!ADMIN_URL)('limites globais no banco (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  let deps: { db: ReturnType<typeof createDrizzle>; clock: typeof clock };
  const sql = (t: string, p: unknown[] = []) => testDb.pool.query(t, p);
  const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { status?: number; code?: string }) => `${e.status}:${e.code}`);
  const total = async (kind: string) => Number((await sql('select coalesce(sum(count),0) as n from global_limit_counters where kind = $1', [kind])).rows[0].n);
  /** Captura o que foi para o log de erro (o alerta). */
  const alerts = () => {
    const spy = vi.spyOn(process.stderr, 'write');
    return { spy, count: () => spy.mock.calls.map(c => String(c[0])).filter(l => l.includes('"alert":"limite_global_atingido"')).length };
  };

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    deps = { db: createDrizzle(testDb.pool), clock };
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql('truncate global_limit_counters');
    clock.set('2026-10-10T15:03:00Z');
  });

  it('cadastro: abre até o limite, fecha no limite com 429 "limite_global", e tipos diferentes não se misturam', async () => {
    for (let i = 0; i < 3; i++) {
      expect(await code(assertGlobalOpen(deps, 'cadastro', 3))).toBe('ok');
      await recordGlobal(deps, 'cadastro');
    }
    expect(await code(assertGlobalOpen(deps, 'cadastro', 3))).toBe('429:limite_global');
    expect(await code(assertGlobalOpen(deps, 'recuperacao', 3))).toBe('ok'); // outro tipo
    expect(await total('cadastro')).toBe(3);
  });

  it('conferir não conta: conferir 100 vezes sem criar conta não gasta o limite', async () => {
    for (let i = 0; i < 100; i++) await assertGlobalOpen(deps, 'cadastro', 3);
    expect(await total('cadastro')).toBe(0);
  });

  it('janela deslizante de 60 min em baldes de 10: ainda fechado aos 55 min, aberto depois de 60', async () => {
    for (let i = 0; i < 5; i++) await recordGlobal(deps, 'cadastro');
    clock.advance(55 * MIN);
    expect(await code(assertGlobalOpen(deps, 'cadastro', 5))).toBe('429:limite_global');
    clock.advance(6 * MIN); // 61 min depois
    expect(await code(assertGlobalOpen(deps, 'cadastro', 5))).toBe('ok');
  });

  it('o total é a soma dos baldes dentro da janela, não de um balde só', async () => {
    for (let b = 0; b < 4; b++) {
      await recordGlobal(deps, 'cadastro');
      await recordGlobal(deps, 'cadastro');
      clock.advance(BUCKET_MS);
    }
    expect(await total('cadastro')).toBe(8);
    expect(await code(assertGlobalOpen(deps, 'cadastro', 8))).toBe('429:limite_global');
    expect(await code(assertGlobalOpen(deps, 'cadastro', 9))).toBe('ok');
  });

  it('ALERTA: um por balde de 10 minutos, não um por requisição; no balde seguinte, se ainda cheio, de novo', async () => {
    for (let i = 0; i < 2; i++) await recordGlobal(deps, 'cadastro');
    const a = alerts();
    try {
      for (let i = 0; i < 25; i++) await code(assertGlobalOpen(deps, 'cadastro', 2));
      expect(a.count()).toBe(1);
      clock.advance(BUCKET_MS);
      for (let i = 0; i < 10; i++) await code(assertGlobalOpen(deps, 'cadastro', 2));
      expect(a.count()).toBe(2);
      const line = a.spy.mock.calls.map(c => String(c[0])).find(l => l.includes('limite_global_atingido'))!;
      expect(line).toContain('"kind":"cadastro"');
      expect(line).toContain('"limitPerHour":2');
    } finally {
      a.spy.mockRestore();
    }
  });

  it('recuperação: conta de forma ATÔMICA entre instâncias: 60 pedidos simultâneos com limite 10 passam exatamente 10', async () => {
    const results = await Promise.all(Array.from({ length: 60 }, () => code(consumeGlobal(deps, 'recuperacao', 10))));
    expect(results.filter(r => r === 'ok')).toHaveLength(10);
    expect(results.filter(r => r === '429:limite_global')).toHaveLength(50);
    expect(await total('recuperacao')).toBe(10);
  });

  it('recuperação: alerta uma vez mesmo com 50 recusas simultâneas', async () => {
    const a = alerts();
    try {
      await Promise.all(Array.from({ length: 60 }, () => code(consumeGlobal(deps, 'recuperacao', 10))));
      expect(a.count()).toBe(1);
    } finally {
      a.spy.mockRestore();
    }
  });

  it('o banco recusa contador negativo', async () => {
    await expect(sql("insert into global_limit_counters (kind, bucket, count) values ('x', now(), -1)")).rejects.toThrow(/nonneg|check/i);
  });

  it('o papel da aplicação tem o que precisa na tabela (migração 0004 + privilégios padrão da 0002)', async () => {
    // Só confere a forma da tabela: os privilégios do papel são provados no banco real (deploy) e no teste do papel.
    const cols = (await sql("select column_name from information_schema.columns where table_name = 'global_limit_counters' order by 1")).rows.map(r => r.column_name);
    expect(cols).toEqual(['alerted_at', 'bucket', 'count', 'kind']);
  });
});
