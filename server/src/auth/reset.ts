import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { passwordResets } from '../db/schema';
import { hashToken, newToken } from '../domain/password';
import type { Clock } from '../providers/clock';

export const RESET_TOKEN_TTL_MS = 3_600_000;

/**
 * Cria o link de recuperação de senha (RF-05): token de 256 bits, **só o hash** vai ao banco, vale 1 hora e uma única vez.
 * Um link novo invalida os anteriores ainda não usados. Chamado **no momento do envio** do e-mail, para nenhum token ficar
 * guardado na fila; se o envio falhar e for repetido, o link da tentativa anterior deixa de valer.
 */
export async function createPasswordResetLink(
  deps: { db: Db; clock: Clock; config: Pick<Config, 'PUBLIC_BASE_URL' | 'PORT'> },
  userId: string,
): Promise<string> {
  const now = deps.clock.now();
  await deps.db
    .update(passwordResets)
    .set({ expiresAt: now })
    .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)));
  const token = newToken();
  await deps.db.insert(passwordResets).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
    createdAt: now,
  });
  const base = (deps.config.PUBLIC_BASE_URL ?? `http://localhost:${deps.config.PORT}`).replace(/\/$/, '');
  return `${base}/redefinir-senha?token=${encodeURIComponent(token)}`;
}
