import { eq } from 'drizzle-orm';
import { writeAudit } from '../db/audit';
import { orders } from '../db/schema';
import { logger } from '../logger';
import { expireOverdue } from '../orders/service';
import {
  enqueueSafely,
  RECONCILE_BACKOFF_SECONDS,
  RECONCILE_MAX_ATTEMPTS,
  type TaskQueue,
} from './taskQueue';
import { reconcilePayment, type ReconcileDeps } from './reconcile';

export type ReconcileTaskOutcome =
  | 'sem_pedido'
  | 'ja_resolvido'
  | 'expirado'
  | 'conciliado'
  | 'reagendado'
  | 'revisao_manual';

/**
 * Verificação de **um** pedido, chamada pelo Cloud Tasks (rota autenticada por OIDC). Idempotente: repetir a mesma tarefa
 * não muda nada de novo. Erros de rede com o gateway sobem (a rota responde 503 e o Cloud Tasks tenta de novo); só o que é
 * "ainda pendente" gasta uma das tentativas lógicas.
 */
export async function handleReconcileTask(
  deps: ReconcileDeps & { queue?: TaskQueue },
  input: { orderId: string; attempt: number },
): Promise<{ outcome: ReconcileTaskOutcome }> {
  const [order] = await deps.db
    .select({ id: orders.id, status: orders.status, gatewayPaymentId: orders.gatewayPaymentId })
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);
  if (!order) return { outcome: 'sem_pedido' };
  if (order.status !== 'pendente' && order.status !== 'nao_concluido') return { outcome: 'ja_resolvido' };

  if (order.gatewayPaymentId) {
    // Consulta o gateway e aplica o que ele disser (aprovado, recusado, expirado, estornado...). Erro de rede sobe.
    const result = await reconcilePayment(deps, order.gatewayPaymentId);
    if (result.outcome !== 'aguardando') {
      return { outcome: result.outcome === 'expirado' ? 'expirado' : 'conciliado' };
    }
  } else {
    // Sem cobrança criada: se a reserva venceu, o pedido expira e o estoque volta; se não, o comprador ainda pode pagar.
    const closed = await expireOverdue(deps, { orderId: order.id });
    if (closed.orders > 0) return { outcome: 'expirado' };
  }

  // Ainda pendente.
  if (input.attempt < RECONCILE_MAX_ATTEMPTS) {
    await enqueueSafely(deps.queue, {
      orderId: order.id,
      attempt: input.attempt + 1,
      delaySeconds: RECONCILE_BACKOFF_SECONDS[input.attempt] ?? 1800,
    });
    return { outcome: 'reagendado' };
  }
  const now = deps.clock.now();
  await deps.db.transaction(async tx => {
    await writeAudit(tx, {
      actorId: null,
      action: 'conciliacao.revisao_manual',
      entity: 'order',
      entityId: order.id,
      before: { status: order.status },
      after: { tentativas: input.attempt },
      reason: `Pedido ainda pendente depois de ${RECONCILE_MAX_ATTEMPTS} verificações sob demanda. Conferir no gateway.`,
      at: now,
    });
  });
  logger.error('pedido pendente depois de todas as verificações: revisão manual', {
    orderId: order.id,
    alert: 'conciliacao_revisao_manual',
  });
  return { outcome: 'revisao_manual' };
}
