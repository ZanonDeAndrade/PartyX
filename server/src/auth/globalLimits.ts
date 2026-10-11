import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { AppError } from '../domain/errors';
import { logger } from '../logger';
import type { Clock } from '../providers/clock';

/**
 * Limites GLOBAIS entre todas as instâncias. Cadastro e recuperação são disjuntores contra abuso em massa;
 * portaria tem tetos compartilhados por minuto para leituras e buscas.
 *
 * Cadastro e recuperação: janela deslizante de 60 minutos em baldes de 10. Portaria: minuto fixo.
 * Atingido o limite: 429 e um alerta (`limite_global_atingido`) por balde.
 *
 * Duas formas de contar, de propósito:
 * - **cadastro:** confere ANTES e só conta DEPOIS de criar a conta. Tentativa inválida (CPF repetido, senha fraca) não gasta o limite, então
 *   lixo enviado em massa não bloqueia quem se cadastra de verdade.
 * - **recuperação:** conta cada pedido aceito, de forma atômica (trava por tipo). Não dá para contar só os "com sucesso": a resposta é a mesma exista
 *   a conta ou não (para não revelar quem tem conta).
 */
export type LimitKind = 'cadastro' | 'recuperacao' | 'portaria_leitura' | 'portaria_busca';

export const BUCKET_MS = 10 * 60_000;
export const WINDOW_MS = 60 * 60_000;
export const GATE_WINDOW_MS = 60_000;

interface Deps {
  db: Db;
  clock: Clock;
}

const bucketStart = (now: Date, kind: LimitKind) => {
  const size = kind.startsWith('portaria_') ? GATE_WINDOW_MS : BUCKET_MS;
  return new Date(Math.floor(now.getTime() / size) * size);
};
const windowFloor = (now: Date, kind: LimitKind) =>
  kind.startsWith('portaria_') ? new Date(bucketStart(now, kind).getTime() - 1) : new Date(now.getTime() - WINDOW_MS);

async function used(db: Pick<Db, 'execute'>, kind: LimitKind, now: Date): Promise<number> {
  const r = await db.execute<{ n: number }>(
    sql`select coalesce(sum(count), 0)::int as n from global_limit_counters where kind = ${kind} and bucket > ${windowFloor(now, kind)}`,
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Um alerta por balde: só quem conseguir marcar `alerted_at` registra o log. */
async function alertOnce(deps: Deps, kind: LimitKind, limit: number, now: Date) {
  const bucket = bucketStart(now, kind);
  await deps.db.execute(
    sql`insert into global_limit_counters (kind, bucket, count) values (${kind}, ${bucket}, 0) on conflict (kind, bucket) do nothing`,
  );
  const marked = await deps.db.execute(
    sql`update global_limit_counters set alerted_at = ${now} where kind = ${kind} and bucket = ${bucket} and alerted_at is null returning kind`,
  );
  if (marked.rows.length > 0)
    logger.error('limite global atingido', {
      kind,
      ...(kind.startsWith('portaria_') ? { limitPerMinute: limit } : { limitPerHour: limit }),
      alert: 'limite_global_atingido',
    });
}

const tooMany = (kind: LimitKind) =>
  new AppError(
    429,
    'limite_global',
    kind === 'cadastro'
      ? 'Muitos cadastros neste momento. Tente de novo em alguns minutos.'
      : kind === 'recuperacao'
        ? 'Muitos pedidos de recuperação neste momento. Tente de novo em alguns minutos.'
        : 'Muitas operações de portaria neste momento. Tente de novo em instantes.',
  );

/** Cadastro: lança 429 se o limite da hora já foi atingido (e dá o alerta). Não conta nada. */
export async function assertGlobalOpen(deps: Deps, kind: LimitKind, limit: number): Promise<void> {
  const now = deps.clock.now();
  if ((await used(deps.db, kind, now)) < limit) return;
  await alertOnce(deps, kind, limit, now);
  throw tooMany(kind);
}

/** Cadastro: conta uma conta criada. */
export async function recordGlobal(deps: Deps, kind: LimitKind): Promise<void> {
  const now = deps.clock.now();
  await deps.db.execute(sql`
    insert into global_limit_counters (kind, bucket, count) values (${kind}, ${bucketStart(now, kind)}, 1)
    on conflict (kind, bucket) do update set count = global_limit_counters.count + 1`);
}

/** Recuperação: confere e conta de forma atômica (uma por vez por tipo, entre todas as instâncias). 429 e alerta se estourou. */
export async function consumeGlobal(deps: Deps, kind: LimitKind, limit: number): Promise<void> {
  const now = deps.clock.now();
  const allowed = await deps.db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`global-limit:${kind}`}, 0))`);
    if ((await used(tx, kind, now)) >= limit) return false;
    await tx.execute(sql`
      insert into global_limit_counters (kind, bucket, count) values (${kind}, ${bucketStart(now, kind)}, 1)
      on conflict (kind, bucket) do update set count = global_limit_counters.count + 1`);
    return true;
  });
  if (allowed) return;
  await alertOnce(deps, kind, limit, now);
  throw tooMany(kind);
}
