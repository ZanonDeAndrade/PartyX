import { asc, eq } from 'drizzle-orm';
import type { ReconcileSchedule } from '../config';
import { writeAudit } from '../db/audit';
import { acquireLease, releaseLease } from '../db/jobLease';
import { orders, reservations } from '../db/schema';
import { delayUntil, nextCheck, type CheckOffsets } from '../domain/reconcileSchedule';
import { logger } from '../logger';
import { expireOverdue } from '../orders/service';
import { enqueueSafely, type TaskQueue } from './taskQueue';
import { reconcilePayment, type ReconcileDeps } from './reconcile';

export type ReconcileTaskOutcome =
  | 'sem_pedido'
  | 'ja_resolvido'
  | 'em_execucao'
  | 'expirado'
  | 'conciliado'
  | 'reagendado'
  | 'sem_agendamento'
  | 'revisao_manual';

/** Estados em que uma aprovação ainda pode chegar: pendente, recusado no cartão e vencido (aprovação tardia, seção 10.1). */
const OPEN = new Set(['pendente', 'nao_concluido', 'expirado']);

export interface ReconcileTaskDeps extends ReconcileDeps {
  queue?: TaskQueue;
  schedule: Pick<ReconcileSchedule, 'taskOffsetsSeconds' | 'taskMarginSeconds' | 'lateOffsetsSeconds' | 'lockSeconds'>;
}

export const offsetsOf = (s: ReconcileTaskDeps['schedule']): CheckOffsets => ({
  early: s.taskOffsetsSeconds,
  late: s.lateOffsetsSeconds,
});

/**
 * Verificação de **um** pedido, chamada pelo Cloud Tasks (rota autenticada por OIDC). Cadência em `domain/reconcileSchedule.ts`:
 * 1, 2, 4 e 8 min depois da cobrança, no fim da reserva + margem, e tardias aos 15 min, 30 min, 1 h, 3 h, 8 h e 24 h.
 *
 * - Pedido já em estado final: encerra em silêncio (sem log, sem agendar nada).
 * - Uma verificação por pedido de cada vez (trava `job_leases`, `reconcile-order:<id>`); a que chega com outra em andamento
 *   encerra sem fazer nada, porque a outra continua a sequência. A confirmação também é idempotente por si.
 * - Gateway ainda sem decisão: acerta o estado local pelo prazo (o pedido vira "expirado" quando a reserva vence) e agenda a próxima.
 *   Só depois da **última** tardia, ainda sem estado conclusivo, o pedido vai para revisão manual (trilha e alerta).
 * - Erro de rede com o gateway sobe (a rota responde 503 e o Cloud Tasks repete) e não gasta tentativa.
 */
export async function handleReconcileTask(
  deps: ReconcileTaskDeps,
  input: { orderId: string; attempt: number; chargedAt?: string },
): Promise<{ outcome: ReconcileTaskOutcome }> {
  const [order] = await deps.db
    .select({
      id: orders.id,
      status: orders.status,
      gatewayPaymentId: orders.gatewayPaymentId,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);
  if (!order) return { outcome: 'sem_pedido' };
  if (!OPEN.has(order.status)) return { outcome: 'ja_resolvido' };

  const leaseName = `reconcile-order:${order.id}`;
  const lease = await acquireLease(deps.db, leaseName, deps.schedule.lockSeconds);
  if (!lease) return { outcome: 'em_execucao' };
  try {
    return await check(deps, order, input);
  } finally {
    await releaseLease(deps.db, leaseName, lease);
  }
}

async function check(
  deps: ReconcileTaskDeps,
  order: { id: string; status: string; gatewayPaymentId: string | null; createdAt: Date },
  input: { attempt: number; chargedAt?: string },
): Promise<{ outcome: ReconcileTaskOutcome }> {
  if (order.gatewayPaymentId) {
    // Consulta o gateway e aplica o que ele disser (aprovado, recusado, expirado, estornado...). Erro de rede sobe.
    const result = await reconcilePayment(deps, order.gatewayPaymentId);
    if (result.outcome !== 'aguardando') {
      return { outcome: result.outcome === 'expirado' ? 'expirado' : 'conciliado' };
    }
  }
  // Sem decisão do gateway (ou tarefa antiga, de pedido sem cobrança): o estado local acompanha o prazo da reserva.
  const closed = await expireOverdue(deps, { orderId: order.id });
  if (!order.gatewayPaymentId) {
    // Sem cobrança não há o que conferir no gateway: vencida a reserva, acabou.
    if (closed.orders > 0 || order.status === 'expirado') return { outcome: 'expirado' };
  }

  const now = deps.clock.now();
  const [reservation] = await deps.db
    .select({ expiresAt: reservations.expiresAt })
    .from(reservations)
    .where(eq(reservations.orderId, order.id))
    .orderBy(asc(reservations.expiresAt))
    .limit(1);
  const chargedAt = parseInstant(input.chargedAt) ?? order.createdAt;
  const deadline = new Date((reservation?.expiresAt ?? chargedAt).getTime() + deps.schedule.taskMarginSeconds * 1000);
  const next = nextCheck({ attempt: input.attempt, chargedAt, deadline, now }, offsetsOf(deps.schedule));
  if (next) {
    const queued = await enqueueSafely(deps.queue, {
      orderId: order.id,
      attempt: next.attempt,
      delaySeconds: delayUntil(next.at, now),
      chargedAt: chargedAt.toISOString(),
    });
    // Sem a fila, a sequência para aqui; a rotina diária pega o pedido (até 3 dias).
    return { outcome: queued ? 'reagendado' : 'sem_agendamento' };
  }
  if (!order.gatewayPaymentId) return { outcome: 'expirado' };

  // Depois da última verificação tardia (24 h no padrão), o gateway continua sem estado conclusivo.
  await deps.db.transaction(async tx => {
    await writeAudit(tx, {
      actorId: null,
      action: 'conciliacao.revisao_manual',
      entity: 'order',
      entityId: order.id,
      before: { status: order.status },
      after: { tentativas: input.attempt },
      reason:
        'Pagamento sem estado conclusivo no gateway depois da última verificação tardia. Conferir no gateway; a rotina diária segue olhando o pedido por até 3 dias.',
      at: now,
    });
  });
  logger.error('pagamento sem estado conclusivo depois da última verificação tardia: revisão manual', {
    orderId: order.id,
    alert: 'conciliacao_revisao_manual',
  });
  return { outcome: 'revisao_manual' };
}

function parseInstant(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
