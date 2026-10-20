import { and, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { loginAttempts, passwordResets, sessions } from '../db/schema';
import { ACCESS_LIMITS } from '../domain/eventAccess';
import type { Clock } from '../providers/clock';

/**
 * Retenção configurável dos dados **técnicos** (sessões, tentativas de login, tokens de recuperação). Cada prazo vem de
 * variável de ambiente e **não tem valor padrão**: sem a decisão da PartyX nada é apagado. Pedidos, ingressos, pagamentos
 * e auditoria não entram aqui: seu prazo é decisão da PartyX com a contabilidade (docs/lgpd.md).
 * O papel da aplicação só pode apagar estas três tabelas (migração 0002) e a lista de autorizados (0019).
 *
 * Lista de autorizados do evento privado (D-92): prazo decidido, sem variável. Apagada 6 meses depois do fim do evento (ou do início,
 * sem fim), sempre, na mesma rotina diária. Idempotente: rodar de novo não apaga nada além do que já passou do prazo.
 */
export type RetentionConfig = Pick<Config, 'retention'>;

const cutoff = (clock: Clock, days: number) => new Date(clock.now().getTime() - days * 86_400_000);

export async function purgeExpired(deps: { db: Db; clock: Clock; config: RetentionConfig }) {
  const { retention } = deps.config;
  const out = { loginAttempts: 0, sessions: 0, passwordResets: 0, eventAccess: 0, skipped: [] as string[] };
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
  const access = await deps.db.execute<{ id: string }>(sql`
    delete from event_access a using events e
     where e.id = a.event_id
       and coalesce(e.ends_at, e.starts_at) + make_interval(months => ${ACCESS_LIMITS.retentionMonths}) <= ${deps.clock.now()}
    returning a.id`);
  out.eventAccess = access.rows.length;
  return out;
}
