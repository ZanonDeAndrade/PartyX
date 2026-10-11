import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from './client';

/**
 * Trava com prazo (`job_leases`) para a rotina diária e para cada verificação de pedido (`reconcile-order:<id>`). Só uma execução
 * segura a trava por vez; se a execução cair no meio, a trava vence sozinha depois de `seconds`. Usa o relógio do banco, igual para
 * todas as instâncias.
 *
 * Não usa `pg_advisory_lock` de sessão: com a conexão pooled do Neon (PgBouncer em modo transação) a sessão não é garantida, e a
 * rotina faz chamadas externas que não podem ficar dentro de uma transação aberta.
 */
export async function acquireLease(db: Db, name: string, seconds: number): Promise<string | null> {
  const holder = randomUUID();
  const rows = await db.execute<{ holder: string }>(sql`
    insert into job_leases (name, holder, expires_at)
    values (${name}, ${holder}, now() + make_interval(secs => ${seconds}))
    on conflict (name) do update set holder = excluded.holder, expires_at = excluded.expires_at
      where job_leases.expires_at <= now()
    returning holder`);
  return rows.rows[0]?.holder === holder ? holder : null;
}

/** Solta a trava, se ainda for de quem a pegou (não solta a de outra execução que já assumiu depois do prazo). */
export async function releaseLease(db: Db, name: string, holder: string): Promise<void> {
  await db.execute(sql`update job_leases set expires_at = now() where name = ${name} and holder = ${holder}`);
}

/** Apaga travas vencidas há mais de 2 dias (uma por pedido conferido). Chamada pela rotina diária. Devolve quantas apagou. */
export async function purgeOldLeases(db: Db): Promise<number> {
  const res = await db.execute(sql`delete from job_leases where expires_at < now() - interval '2 days'`);
  return res.rowCount ?? 0;
}
