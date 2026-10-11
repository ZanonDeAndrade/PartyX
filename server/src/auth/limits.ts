import { and, asc, eq, gt, max } from 'drizzle-orm';
import { loginAttempts } from '../db/schema';
import type { AuthDeps } from './types';

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;
/** Limite por IP: mais alto, porque uma rede compartilhada (evento, operadora) concentra vários usuários. */
export const LOGIN_IP_MAX_FAILURES = 30;

export interface Block {
  blocked: boolean;
  retryAfterSeconds: number;
}

async function blockFor(
  deps: AuthDeps,
  where: ReturnType<typeof eq>,
  maxFailures: number,
  since: Date,
): Promise<Block> {
  const failures = await deps.db
    .select({ at: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(where, eq(loginAttempts.succeeded, false), gt(loginAttempts.createdAt, since)))
    .orderBy(asc(loginAttempts.createdAt));
  if (failures.length < maxFailures) return { blocked: false, retryAfterSeconds: 0 };
  // Libera quando a falha que completou o limite sair da janela.
  const releaseAt = failures[failures.length - maxFailures]!.at.getTime() + LOGIN_WINDOW_MS;
  return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((releaseAt - deps.clock.now().getTime()) / 1000)) };
}

/**
 * RF-10: 5 falhas em 15 minutos bloqueiam o e-mail temporariamente. Uma entrada bem-sucedida zera a contagem.
 * Fica no banco para valer entre instâncias do Cloud Run.
 */
export async function loginBlock(deps: AuthDeps, emailNormalized: string, ip: string | null): Promise<Block> {
  const now = deps.clock.now();
  const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MS);

  const [lastOk] = await deps.db
    .select({ at: max(loginAttempts.createdAt) })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.emailNormalized, emailNormalized), eq(loginAttempts.succeeded, true)));
  const since = lastOk?.at && lastOk.at > windowStart ? lastOk.at : windowStart;

  const byEmail = await blockFor(deps, eq(loginAttempts.emailNormalized, emailNormalized), LOGIN_MAX_FAILURES, since);
  if (byEmail.blocked) return byEmail;
  if (ip) return blockFor(deps, eq(loginAttempts.ip, ip), LOGIN_IP_MAX_FAILURES, windowStart);
  return { blocked: false, retryAfterSeconds: 0 };
}

export async function recordLoginAttempt(
  deps: AuthDeps,
  emailNormalized: string,
  ip: string | null,
  succeeded: boolean,
) {
  await deps.db.insert(loginAttempts).values({ emailNormalized, ip, succeeded, createdAt: deps.clock.now() });
}

/** Limitador em memória por instância, para cadastro e recuperação. Camada extra; o rigor entre instâncias é do Prompt 20. */
export function createMemoryLimiter(options: { max: number; windowMs: number; now: () => number }) {
  const hits = new Map<string, number[]>();
  return {
    /** Registra uma tentativa e informa se passou do limite. */
    hit(key: string): boolean {
      const now = options.now();
      const recent = (hits.get(key) ?? []).filter(t => now - t < options.windowMs);
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.every(t => now - t >= options.windowMs)) hits.delete(k);
      return recent.length > options.max;
    },
  };
}
