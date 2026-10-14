import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { sessions, users } from '../db/schema';
import { hashToken, newToken } from '../domain/password';
import type { AuthDeps, AuthState, AuthUser, RequestMeta, Role } from './types';

export const SESSION_COOKIE = '__session';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * Validade das sessões. **Premissa**: a documentação pede expiração por inatividade no painel (12.1.C)
 * mas não define os prazos. Confirmar com o cliente. Cliente: 7 dias sem uso, 30 no máximo.
 * Equipe (painel e portaria): 30 minutos sem uso, 12 horas no máximo.
 */
export const SESSION_LIMITS: Record<Role, { idleMs: number; absoluteMs: number }> = {
  cliente: { idleMs: 7 * DAY, absoluteMs: 30 * DAY },
  validador: { idleMs: 30 * MINUTE, absoluteMs: 12 * 60 * MINUTE },
  administrador: { idleMs: 30 * MINUTE, absoluteMs: 12 * 60 * MINUTE },
};

/** Atualiza `last_seen_at` no máximo uma vez por minuto, para não gravar a cada requisição. */
const TOUCH_INTERVAL_MS = MINUTE;

export async function createSession(deps: AuthDeps, user: Pick<AuthUser, 'id' | 'role'>, meta: RequestMeta) {
  const now = deps.clock.now();
  const token = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_LIMITS[user.role].absoluteMs);
  await deps.db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(token),
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 255) ?? null,
  });
  return { token, expiresAt };
}

/** Token CSRF ligado à sessão. Só quem leu `GET /api/auth/me` com o cookie da sessão conhece o valor. */
export function csrfTokenFor(secret: string, sessionId: string): string {
  return createHmac('sha256', secret).update(`csrf:${sessionId}`).digest('base64url');
}

export function csrfMatches(expected: string, received: string | undefined): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Carrega a sessão pelo token do cookie. Devolve nulo se não existir, estiver revogada, vencida, ociosa ou o usuário estiver desativado. */
export async function loadSession(deps: AuthDeps, token: string): Promise<AuthState | null> {
  const [row] = await deps.db
    .select({
      sessionId: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        cpf: users.cpf,
        phone: users.phone,
        birthDate: users.birthDate,
        role: users.role,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);
  if (!row || row.revokedAt || !row.user.isActive) return null;

  const now = deps.clock.now().getTime();
  if (row.expiresAt.getTime() <= now) return null;
  if (row.lastSeenAt.getTime() + SESSION_LIMITS[row.user.role].idleMs <= now) return null;

  if (now - row.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
    await deps.db.update(sessions).set({ lastSeenAt: deps.clock.now() }).where(eq(sessions.id, row.sessionId));
  }
  return {
    sessionId: row.sessionId,
    user: row.user,
    csrfToken: csrfTokenFor(deps.config.SESSION_SECRET, row.sessionId),
  };
}

export async function revokeSession(deps: AuthDeps, sessionId: string) {
  await deps.db
    .update(sessions)
    .set({ revokedAt: deps.clock.now() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Revoga todas as sessões do usuário, menos a indicada (troca de senha, recuperação, desativação). */
export async function revokeUserSessions(deps: AuthDeps, userId: string, exceptSessionId?: string) {
  const filters = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (exceptSessionId) filters.push(ne(sessions.id, exceptSessionId));
  await deps.db
    .update(sessions)
    .set({ revokedAt: deps.clock.now() })
    .where(and(...filters));
}
