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
  /** Parâmetros da URL do webhook (o Mercado Pago assina o `data.id` que vem nela). */
  query?: URLSearchParams;
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
  const check = await deps.gateway.verifyNotification({
    headers: input.headers,
    rawBody: input.rawBody,
    query: input.query ?? new URLSearchParams(),
  });
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

  const { subject } = check;
  const [linked] =
    subject.kind === 'payment'
      ? await deps.db.select({ id: orders.id }).from(orders).where(eq(orders.gatewayPaymentId, subject.id)).limit(1)
      : [];
  const payload: EventPayload =
    subject.kind === 'payment'
      ? { gatewayPaymentId: subject.id, type: check.type.slice(0, 80) }
      : { type: check.type.slice(0, 80) };

  // Chave única só entre eventos válidos: um evento forjado nunca "ocupa" o id de um real.
  const inserted = await deps.db
    .insert(paymentEvents)
    .values({
      gatewayEventId: check.eventId,
      signatureValid: true,
      orderId: linked?.id ?? null,
      type: check.type.slice(0, 80),
      payloadJson: payload,
      receivedAt: deps.clock.now(),
      // Assunto que a PartyX não usa: fica registrado e já resolvido (responde 200 para o gateway não repetir).
      processedAt: subject.kind === 'ignored' ? deps.clock.now() : undefined,
    })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });
  if (subject.kind === 'ignored') return { status: 'ignorada' };

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
  return processEvent(deps, eventId, payload);
}

/** O que fica gravado de uma notificação válida: só identificadores do gateway e o tipo, nunca o corpo. */
interface EventPayload {
  gatewayPaymentId?: string;
  type: string;
}

/** Processa um evento já registrado. Seguro de repetir e de rodar em paralelo: a conciliação é idempotente. */
async function processEvent(deps: ReconcileDeps, eventId: string, payload: EventPayload): Promise<NotificationResult> {
  await deps.db
    .update(paymentEvents)
    .set({ attempts: sql`${paymentEvents.attempts} + 1` })
    .where(eq(paymentEvents.id, eventId));
  try {
    const result = payload.gatewayPaymentId
      ? await reconcilePayment(deps, payload.gatewayPaymentId)
      : { outcome: 'sem_pedido' as const };
    await deps.db
      .update(paymentEvents)
      .set({
        processedAt: deps.clock.now(),
        processingError:
          result.outcome === 'divergente' || result.outcome === 'sem_pedido' || result.outcome === 'cobranca_duplicada'
            ? result.outcome
            : null,
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
    const payload = ev.payload as EventPayload;
    if (!payload.gatewayPaymentId) continue;
    const r = await processEvent(deps, ev.id, payload);
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
  /**
   * Pedidos já pagos (ou contestados, ou pagos sem estoque) de eventos que ainda não passaram: reconsulta cada um, no máximo uma
   * vez a cada tantos segundos, para pegar estorno ou contestação cujo webhook se perdeu. Padrão: 20 h, até 200 por execução.
   */
  reversalIntervalSeconds?: number;
  reversalLimit?: number;
  /** Tarifas do gateway dos pedidos pagos ainda sem elas (relatório da taxa de serviço, D-90): até tantos por execução. Padrão: 100. */
  feesLimit?: number;
}

export interface RunSummary {
  expired: { reservations: number; orders: number };
  events: { tried: number; done: number };
  orders: { checked: number; failed: number; outcomes: Partial<Record<ReconcileOutcome, number>> };
  /** Reconsulta dos pedidos pagos (estorno ou contestação sem webhook). */
  paid: { checked: number; failed: number; outcomes: Partial<Record<ReconcileOutcome, number>> };
  /** Tarifa e líquido do gateway gravados nos pedidos pagos (D-90). */
  fees: { checked: number; filled: number; failed: number };
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

  const open = await reconsultAll(deps, claimed.rows);

  // Estorno ou contestação feitos no painel do gateway cujo webhook nunca chegou: sem isto, o ingresso de quem recebeu o dinheiro de
  // volta continuaria valendo na portaria. Só eventos que ainda não passaram (até 1 dia depois do início), em rodízio pelo carimbo.
  const eventFrom = new Date(deps.clock.now().getTime() - 86_400_000);
  const paidClaimed = await deps.db.execute<{ gateway_payment_id: string }>(sql`
    update orders set updated_at = now()
     where id in (
       select o.id from orders o join events e on e.id = o.event_id
        where o.gateway_payment_id is not null
          and o.status in ('pago', 'contestado', 'pago_sem_estoque')
          and e.starts_at > ${eventFrom}
          and o.updated_at <= now() - make_interval(secs => ${options.reversalIntervalSeconds ?? 72_000})
        order by o.updated_at asc
        limit ${options.reversalLimit ?? 200}
        for update of o skip locked)
    returning gateway_payment_id`);
  const paid = await reconsultAll(deps, paidClaimed.rows);
  // Vence as reservas DEPOIS de reconsultar: a expiração renova o carimbo de conferência (`updated_at`), e vencer antes deixaria de
  // fora desta execução justamente o pedido que ninguém abriu e cujas tarefas falharam. A aprovação de um pedido ainda "pendente" com
  // reserva vencida já segue o caminho tardio (emite se houver estoque, senão "pago sem estoque").
  const expired = await expireOverdue(deps);
  const fees = await fillGatewayFees(deps, options.feesLimit ?? 100);
  return { expired, events, orders: open, paid, fees };
}

/**
 * Grava a tarifa e o líquido que o gateway informa nos pedidos pagos que ainda não têm (D-90; relatório "a taxa cobre a tarifa?").
 * Só pedidos pagos há mais de 10 minutos (a busca do gateway indexa com atraso). Sem resposta, tenta de novo na próxima execução,
 * até 3 dias depois do pagamento; depois disso marca como consultado, e o relatório mostra "não informada".
 */
async function fillGatewayFees(deps: ReconcileDeps, limit: number) {
  const summary = { checked: 0, filled: 0, failed: 0 };
  const lookup = deps.gateway.paymentFees?.bind(deps.gateway);
  if (!lookup) return summary;
  const now = deps.clock.now();
  const rows = await deps.db
    .select({ id: orders.id, paidAt: orders.paidAt })
    .from(orders)
    .where(
      and(
        isNull(orders.gatewayFeeCheckedAt),
        sql`${orders.gatewayPaymentId} is not null`,
        sql`${orders.status} in ('pago', 'estornado', 'contestado', 'pago_sem_estoque')`,
        lt(orders.paidAt, new Date(now.getTime() - 10 * 60_000)),
      ),
    )
    .orderBy(asc(orders.paidAt))
    .limit(limit);
  for (const row of rows) {
    summary.checked++;
    try {
      const fees = await lookup(row.id);
      const giveUp = row.paidAt!.getTime() < now.getTime() - 3 * 86_400_000;
      if (!fees && !giveUp) continue;
      await deps.db
        .update(orders)
        .set({ gatewayFeeCents: fees?.feeCents ?? null, gatewayNetCents: fees?.netCents ?? null, gatewayFeeCheckedAt: now })
        .where(eq(orders.id, row.id));
      if (fees) summary.filled++;
    } catch (error) {
      summary.failed++;
      logger.warn('tarifa do gateway não consultada', {
        orderId: row.id,
        error: error instanceof GatewayError ? 'gateway_indisponivel' : 'erro_interno',
      });
    }
  }
  return summary;
}

async function reconsultAll(deps: ReconcileDeps, rows: { gateway_payment_id: string }[]) {
  const outcomes: Partial<Record<ReconcileOutcome, number>> = {};
  let failed = 0;
  for (const row of rows) {
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
  return { checked: rows.length, failed, outcomes };
}
