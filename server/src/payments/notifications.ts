import { createHash } from 'node:crypto';
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { orders, paymentEvents } from '../db/schema';
import { logger } from '../logger';
import { expireOverdue } from '../orders/service';
import { GatewayError } from './gateway';
import { reconcilePayment, type ReconcileDeps, type ReconcileOutcome } from './reconcile';

/** Depois de tantas tentativas sem sucesso, a notificação deixa de ser reprocessada e fica para revisão (e alerta). */
export const MAX_EVENT_ATTEMPTS = 10;

export interface NotificationResult {
  /** `invalida`: assinatura recusada (HTTP 401). `duplicada`: já processada antes. `processada`: reconsultou e aplicou. */
  status: 'invalida' | 'duplicada' | 'processada' | 'ignorada';
  outcome?: ReconcileOutcome;
  /** Quando o processamento falhou depois de registrar o evento: o gateway deve tentar de novo. */
  retry?: boolean;
}

/** Limite de gravação de notificações inválidas por origem, para ninguém encher a tabela. Em memória, por instância. */
export function createInvalidWriteLimiter(max: number, windowMs: number, now: () => number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter(x => t - x < windowMs);
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (v.every(x => t - x >= windowMs)) hits.delete(k);
    return recent.length <= max;
  };
}

export interface NotificationInput {
  headers: Headers;
  rawBody: string;
  /** Pode gravar a linha de uma notificação inválida (limite por origem). */
  mayRecordInvalid: boolean;
}

/**
 * Recebe uma notificação do gateway (RF-35, CA-P3, CA-P4).
 *
 * 1. **Autentica** segundo o gateway, sobre o corpo bruto. Inválida: recusa e registra **só metadados seguros**
 *    (motivo, tamanho, hash do corpo, nomes dos cabeçalhos); nunca o corpo nem os valores dos cabeçalhos. Nunca é processada.
 * 2. Válida: grava o evento com chave única (o id do evento no gateway). Repetida e já processada: responde sem fazer nada.
 * 3. Processa: **reconsulta o gateway** e aplica (idempotente). Se falhar, o evento fica pendente e a resposta pede nova tentativa.
 */
export async function handleNotification(deps: ReconcileDeps, input: NotificationInput): Promise<NotificationResult> {
  const check = await deps.gateway.verifyNotification({ headers: input.headers, rawBody: input.rawBody });
  if (!check.valid) {
    logger.warn('notificação de pagamento recusada', {
      reason: check.reason,
      provider: deps.gateway.capabilities.providerId,
    });
    if (input.mayRecordInvalid) {
      await deps.db.insert(paymentEvents).values({
        gatewayEventId: null,
        signatureValid: false,
        orderId: null,
        type: 'invalido',
        payloadJson: {
          motivo: check.reason,
          bytes: Buffer.byteLength(input.rawBody),
          sha256: createHash('sha256').update(input.rawBody).digest('hex').slice(0, 16),
          cabecalhos: [...input.headers.keys()].sort().slice(0, 30),
        },
        receivedAt: deps.clock.now(),
      });
    }
    return { status: 'invalida' };
  }

  const [linked] = await deps.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.gatewayPaymentId, check.gatewayPaymentId))
    .limit(1);

  // Chave única só entre eventos válidos: um evento forjado nunca "ocupa" o id de um real.
  const inserted = await deps.db
    .insert(paymentEvents)
    .values({
      gatewayEventId: check.eventId,
      signatureValid: true,
      orderId: linked?.id ?? null,
      type: check.type.slice(0, 80),
      payloadJson: { gatewayPaymentId: check.gatewayPaymentId, type: check.type.slice(0, 80) },
      receivedAt: deps.clock.now(),
    })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });

  let eventId = inserted[0]?.id;
  if (!eventId) {
    const [existing] = await deps.db
      .select({ id: paymentEvents.id, processedAt: paymentEvents.processedAt })
      .from(paymentEvents)
      .where(and(eq(paymentEvents.gatewayEventId, check.eventId), eq(paymentEvents.signatureValid, true)))
      .limit(1);
    if (existing?.processedAt) return { status: 'duplicada' };
    eventId = existing?.id; // repetida mas ainda não processada (a primeira tentativa falhou): processa agora
  }
  if (!eventId) return { status: 'ignorada' };
  return processEvent(deps, eventId, check.gatewayPaymentId);
}

/** Processa um evento já registrado. Seguro de repetir e de rodar em paralelo: a conciliação é idempotente. */
async function processEvent(
  deps: ReconcileDeps,
  eventId: string,
  gatewayPaymentId: string,
): Promise<NotificationResult> {
  await deps.db
    .update(paymentEvents)
    .set({ attempts: sql`${paymentEvents.attempts} + 1` })
    .where(eq(paymentEvents.id, eventId));
  try {
    const result = await reconcilePayment(deps, gatewayPaymentId);
    await deps.db
      .update(paymentEvents)
      .set({
        processedAt: deps.clock.now(),
        processingError: result.outcome === 'divergente' || result.outcome === 'sem_pedido' ? result.outcome : null,
        orderId: result.orderId ?? undefined,
      })
      .where(eq(paymentEvents.id, eventId));
    return { status: 'processada', outcome: result.outcome };
  } catch (error) {
    const name = error instanceof GatewayError ? 'gateway_indisponivel' : 'erro_interno';
    const [row] = await deps.db
      .update(paymentEvents)
      .set({ processingError: name })
      .where(eq(paymentEvents.id, eventId))
      .returning({ attempts: paymentEvents.attempts });
    logger.error('falha ao processar notificação de pagamento', {
      eventId,
      error: name,
      // Código do erro (ex.: SQLSTATE 40P01 de impasse no banco), nunca a mensagem, que pode trazer valores.
      errorCode: String((error as { code?: unknown } | null)?.code ?? (error as Error | null)?.name ?? 'desconhecido'),
      attempts: row?.attempts,
      alert: 'webhook_falhou',
    });
    return { status: 'processada', retry: true };
  }
}

/** Reprocessa notificações válidas que ficaram sem processar (gateway fora do ar na hora, queda do servidor). */
export async function retryPendingEvents(deps: ReconcileDeps, limit = 50): Promise<{ tried: number; done: number }> {
  const pending = await deps.db
    .select({ id: paymentEvents.id, payload: paymentEvents.payloadJson, attempts: paymentEvents.attempts })
    .from(paymentEvents)
    .where(
      and(
        eq(paymentEvents.signatureValid, true),
        isNull(paymentEvents.processedAt),
        lt(paymentEvents.attempts, MAX_EVENT_ATTEMPTS),
      ),
    )
    .orderBy(asc(paymentEvents.receivedAt))
    .limit(limit);
  let done = 0;
  for (const ev of pending) {
    const paymentId = (ev.payload as { gatewayPaymentId?: string }).gatewayPaymentId;
    if (!paymentId) continue;
    const r = await processEvent(deps, ev.id, paymentId);
    if (!r.retry) done++;
  }
  return { tried: pending.length, done };
}

export interface ReconcileRunOptions {
  /** Só pega pedidos cuja última conferência foi há mais que isto. Duas execuções simultâneas não pegam os mesmos. */
  minIntervalSeconds?: number;
  limit?: number;
  /** Só pedidos criados nas últimas N horas (pelo relógio da aplicação). Padrão: 72 (a rotina diária). */
  windowHours?: number;
}

export interface RunSummary {
  expired: { reservations: number; orders: number };
  events: { tried: number; done: number };
  orders: { checked: number; failed: number; outcomes: Partial<Record<ReconcileOutcome, number>> };
}

/**
 * Conciliação agendada (para webhook perdido): reconsulta no gateway os pedidos com cobrança que ainda podem mudar
 * (pendentes, vencidos ou não concluídos, criados dentro da janela, porque uma aprovação pode chegar atrasada).
 *
 * **Segura com execuções simultâneas:** os pedidos são "reservados" para a execução (`FOR UPDATE SKIP LOCKED` e carimbo
 * de `updated_at`), então duas execuções pegam lotes diferentes; e mesmo que pegassem o mesmo, a conciliação é idempotente.
 */
export async function runReconciliation(deps: ReconcileDeps, options: ReconcileRunOptions = {}): Promise<RunSummary> {
  const minInterval = options.minIntervalSeconds ?? 60;
  const limit = options.limit ?? 100;
  const since = new Date(deps.clock.now().getTime() - (options.windowHours ?? 72) * 3_600_000);

  const events = await retryPendingEvents(deps);

  const claimed = await deps.db.execute<{ gateway_payment_id: string }>(sql`
    update orders set updated_at = now()
     where id in (
       select id from orders
        where gateway_payment_id is not null
          and status in ('pendente', 'expirado', 'nao_concluido')
          and created_at > ${since}
          and updated_at <= now() - make_interval(secs => ${minInterval})
        order by updated_at asc
        limit ${limit}
        for update skip locked)
    returning gateway_payment_id`);

  const outcomes: Partial<Record<ReconcileOutcome, number>> = {};
  let failed = 0;
  for (const row of claimed.rows) {
    try {
      const { outcome } = await reconcilePayment(deps, row.gateway_payment_id);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    } catch (error) {
      failed++;
      logger.error('falha ao reconsultar pagamento', {
        error: error instanceof GatewayError ? 'gateway_indisponivel' : 'erro_interno',
        alert: 'reconciliacao_falhou',
      });
    }
  }
  // Vence as reservas DEPOIS de reconsultar: a expiração renova o carimbo de conferência (`updated_at`), e vencer antes deixaria de
  // fora desta execução justamente o pedido que ninguém abriu e cujas tarefas falharam. A aprovação de um pedido ainda "pendente" com
  // reserva vencida já segue o caminho tardio (emite se houver estoque, senão "pago sem estoque").
  const expired = await expireOverdue(deps);
  return { expired, events, orders: { checked: claimed.rows.length, failed, outcomes } };
}
