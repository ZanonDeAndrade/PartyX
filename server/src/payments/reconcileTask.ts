import { asc, eq } from 'drizzle-orm';
import type { ReconcileSchedule } from '../config';
import { writeAudit } from '../db/audit';
import { orders, reservations } from '../db/schema';
import { delayUntil, nextCheck } from '../domain/reconcileSchedule';
import { logger } from '../logger';
import { expireOverdue } from '../orders/service';
import { enqueueSafely, type TaskQueue } from './taskQueue';
import { reconcilePayment, type ReconcileDeps } from './reconcile';

export type ReconcileTaskOutcome =
  | 'sem_pedido'
  | 'ja_resolvido'
  | 'expirado'
  | 'conciliado'
  | 'reagendado'
  | 'revisao_manual';

/** Estados em que uma aprovação ainda pode chegar: pendente, recusado no cartão e vencido (aprovação tardia, seção 10.1). */
const OPEN = new Set(['pendente', 'nao_concluido', 'expirado']);

export interface ReconcileTaskDeps extends ReconcileDeps {
  queue?: TaskQueue;
  schedule: Pick<ReconcileSchedule, 'taskOffsetsSeconds' | 'taskMarginSeconds'>;
}

/**
 * Verificação de **um** pedido, chamada pelo Cloud Tasks (rota autenticada por OIDC). Idempotente: repetir a mesma tarefa não muda
 * nada de novo, e duas tarefas do mesmo pedido ao mesmo tempo não duplicam nada (a confirmação tranca o pedido e confere o estado).
 * Erros de rede com o gateway sobem (a rota responde 503 e o Cloud Tasks tenta de novo) e não gastam tentativa.
 *
 * Cadência em `domain/reconcileSchedule.ts`: 1, 2, 4 e 8 minutos depois da cobrança, e a última no fim da reserva mais a margem.
 * Inclui o pedido já vencido: a verificação do limite existe justamente para achar o pagamento aprovado junto com o vencimento
 * (que emite se ainda houver estoque ou vira "pago sem estoque").
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

  if (order.gatewayPaymentId) {
    // Consulta o gateway e aplica o que ele disser (aprovado, recusado, expirado, estornado...). Erro de rede sobe.
    const result = await reconcilePayment(deps, order.gatewayPaymentId);
    if (result.outcome !== 'aguardando') {
      return { outcome: result.outcome === 'expirado' ? 'expirado' : 'conciliado' };
    }
  } else {
    // Tarefa antiga (agendada na criação do pedido, antes da cobrança): se a reserva venceu, o pedido expira e o estoque volta.
    const closed = await expireOverdue(deps, { orderId: order.id });
    if (closed.orders > 0) return { outcome: 'expirado' };
    if (order.status === 'expirado') return { outcome: 'ja_resolvido' };
  }

  // Ainda sem decisão do gateway.
  const now = deps.clock.now();
  const [reservation] = await deps.db
    .select({ expiresAt: reservations.expiresAt })
    .from(reservations)
    .where(eq(reservations.orderId, order.id))
    .orderBy(asc(reservations.expiresAt))
    .limit(1);
  const chargedAt = parseInstant(input.chargedAt) ?? order.createdAt;
  const deadline = new Date((reservation?.expiresAt ?? chargedAt).getTime() + deps.schedule.taskMarginSeconds * 1000);
  const next = nextCheck({ attempt: input.attempt, chargedAt, deadline, now }, deps.schedule.taskOffsetsSeconds);
  if (next) {
    await enqueueSafely(deps.queue, {
      orderId: order.id,
      attempt: next.attempt,
      delaySeconds: delayUntil(next.at, now),
      chargedAt: chargedAt.toISOString(),
    });
    return { outcome: 'reagendado' };
  }
  // Fim das verificações sob demanda. O estado local acompanha o prazo; a varredura agendada continua conferindo.
  await expireOverdue(deps, { orderId: order.id });
  if (!order.gatewayPaymentId) return { outcome: 'expirado' };
  await deps.db.transaction(async tx => {
    await writeAudit(tx, {
      actorId: null,
      action: 'conciliacao.revisao_manual',
      entity: 'order',
      entityId: order.id,
      before: { status: order.status },
      after: { tentativas: input.attempt },
      reason:
        'Pagamento ainda pendente no gateway depois do fim da reserva e da margem. A varredura agendada segue conferindo; conferir no gateway.',
      at: now,
    });
  });
  logger.error('pagamento ainda pendente depois das verificações sob demanda: revisão manual', {
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
