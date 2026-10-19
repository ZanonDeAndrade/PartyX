import { auditLog } from './schema';
import type { Db } from './client';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Linha da trilha de auditoria dentro da transação da própria mudança. Nunca receber senha, token ou CPF inteiro. */
export async function writeAudit(
  tx: Tx,
  entry: {
    actorId: string | null;
    action: string;
    entity: string;
    /** Nulo para o que não tem id próprio (a configuração da taxa de serviço, linha única). */
    entityId: string | null;
    before: unknown;
    after: unknown;
    reason?: string;
    at: Date;
  },
) {
  await tx.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    beforeJson: entry.before,
    afterJson: entry.after,
    reason: entry.reason ?? null,
    createdAt: entry.at,
  });
}
export type { Tx };
