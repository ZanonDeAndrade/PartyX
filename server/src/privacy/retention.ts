import { and, isNotNull, lt, or } from 'drizzle-orm';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { loginAttempts, passwordResets, sessions } from '../db/schema';
import type { Clock } from '../providers/clock';

/**
 * Retenção configurável dos dados **técnicos** (sessões, tentativas de login, tokens de recuperação). Cada prazo vem de
 * variável de ambiente e **não tem valor padrão**: sem a decisão da PartyX nada é apagado. Pedidos, ingressos, pagamentos
 * e auditoria não entram aqui: seu prazo é decisão da PartyX com a contabilidade (docs/lgpd.md).
 * O papel da aplicação só pode apagar estas três tabelas (migração 0002).
 */
export type RetentionConfig = Pick<Config, 'retention'>;

const cutoff = (clock: Clock, days: number) => new Date(clock.now().getTime() - days * 86_400_000);

export async function purgeExpired(deps: { db: Db; clock: Clock; config: RetentionConfig }) {
  const { retention } = deps.config;
  const out = { loginAttempts: 0, sessions: 0, passwordResets: 0, skipped: [] as string[] };
  if (retention.loginAttemptsDays === undefined) out.skipped.push('login_attempts');
  else {
    const r = await deps.db
      .delete(loginAttempts)
      .where(lt(loginAttempts.createdAt, cutoff(deps.clock, retention.loginAttemptsDays)))
      .returning({ id: loginAttempts.id });
    out.loginAttempts = r.length;
  }
  if (retention.sessionsDays === undefined) out.skipped.push('sessions');
  else {
    const limit = cutoff(deps.clock, retention.sessionsDays);
    // Só sessões já encerradas (expiradas ou revogadas) há mais que o prazo: nunca derruba sessão ativa.
    const r = await deps.db
      .delete(sessions)
      .where(or(lt(sessions.expiresAt, limit), and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, limit))))
      .returning({ id: sessions.id });
    out.sessions = r.length;
  }
  if (retention.passwordResetsDays === undefined) out.skipped.push('password_resets');
  else {
    const r = await deps.db
      .delete(passwordResets)
      .where(lt(passwordResets.expiresAt, cutoff(deps.clock, retention.passwordResetsDays)))
      .returning({ id: passwordResets.id });
    out.passwordResets = r.length;
  }
  return out;
}
