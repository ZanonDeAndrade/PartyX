import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { writeAudit, type Tx } from '../db/audit';
import { orderItems, orders, reservations, tickets, ticketTypes, users } from '../db/schema';
import { AppError } from '../domain/errors';
import { approvalOutcome, canTransition, type OrderStatus } from '../domain/orderState';
import { checkSnapshotAgainstOrder, intentFor, type PaymentSnapshot } from '../domain/payment';
import { logger } from '../logger';
import type { Clock } from '../providers/clock';
import { GatewayRejectedError, type PaymentGateway } from './gateway';
import { enqueueEmail, processSoon, type OutboxDeps } from '../mail/outbox';

/**
 * Confirmação de pagamento e conciliação (RF-35, RF-37, CA-P1 a CA-P5).
 *
 * Princípios:
 * 1. **Nunca confia no navegador nem no corpo do webhook.** A notificação só diz "olhe o pagamento X". O servidor
 *    **reconsulta o gateway** e só age sobre o que a API do gateway responde.
 * 2. Antes de aprovar, a resposta confere com o pedido: referência, valor, moeda, conta da PartyX e forma de pagamento.
 * 3. **Nenhuma chamada externa dentro de transação.** Consulta primeiro; depois uma transação curta e trancada.
 * 4. Tudo é idempotente: repetir a mesma notificação, ou rodar a conciliação duas vezes, não duplica nada.
 */

/**
 * Emissão de ingressos, chamada **dentro** da transação de confirmação, com o pedido e os itens já trancados.
 * É o ponto de encaixe do Prompt 13 (QR, HMAC, código curto). Sem ela, o pedido é confirmado e o estoque contado,
 * mas nenhuma linha de `tickets` é criada.
 */
export type TicketIssuer = (
  tx: Tx,
  order: {
    id: string;
    userId: string;
    eventId: string;
    items: { orderItemId: string; ticketTypeId: string; quantity: number }[];
  },
) => Promise<void>;

export interface ReconcileDeps {
  db: Db;
  clock: Clock;
  gateway: PaymentGateway;
  issueTickets?: TicketIssuer;
  /** Entrega de e-mail. Sem ela, o e-mail de compra fica na fila e sai pela rotina agendada. */
  mail?: OutboxDeps;
}

export type ReconcileOutcome =
  | 'sem_pedido'
  | 'divergente'
  | 'aguardando'
  | 'confirmado'
  | 'confirmado_tardio'
  | 'sem_estoque'
  | 'recusado'
  | 'expirado'
  | 'estornado'
  | 'contestado'
  | 'cobranca_duplicada'
  | 'ignorado';

const FINAL_FOR_APPROVAL: OrderStatus[] = ['pago', 'pago_sem_estoque', 'estornado', 'contestado', 'cancelado'];

function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransition(from, to)) {
    // Bug nosso, nunca erro do comprador: transição que o contrato não prevê.
    throw new Error(`transição de pedido não permitida: ${from} → ${to}`);
  }
}

/**
 * Reconsulta o gateway e aplica ao pedido o que ele disser. É o único caminho que muda um pedido para pago,
 * recusado, estornado ou contestado. Chamada pelo webhook e pela conciliação agendada.
 * Erros de rede (`GatewayError` retentável) sobem para quem chamou tentar de novo.
 */
export async function reconcilePayment(
  deps: ReconcileDeps,
  gatewayPaymentId: string,
): Promise<{ outcome: ReconcileOutcome; orderId?: string }> {
  const [order] = await deps.db
    .select({ id: orders.id, totalCents: orders.totalCents, paymentMethod: orders.paymentMethod })
    .from(orders)
    .where(eq(orders.gatewayPaymentId, gatewayPaymentId))
    .limit(1);
  if (!order) return adoptOrphan(deps, gatewayPaymentId);

  // 1) Consulta (fora de qualquer transação).
  let snapshot: PaymentSnapshot;
  try {
    snapshot = await deps.gateway.getPayment(gatewayPaymentId);
  } catch (error) {
    if (error instanceof GatewayRejectedError) {
      await recordDivergence(deps, order.id, [`gateway:${error.reason}`]);
      return { outcome: 'divergente', orderId: order.id };
    }
    throw error;
  }

  // 2) Conferência com o pedido. Qualquer divergência: não age, registra e avisa.
  const check = checkSnapshotAgainstOrder(snapshot, order, deps.gateway.accountId);
  if (!check.ok) {
    await recordDivergence(deps, order.id, check.mismatches);
    return { outcome: 'divergente', orderId: order.id };
  }

  // 3) Aplica, em transação curta, conforme o estado que o gateway informou.
  switch (intentFor(snapshot.status)) {
    case 'aguardar':
      return { outcome: 'aguardando', orderId: order.id };
    case 'confirmar': {
      const outcome = await applyApproval(deps, order.id, snapshot);
      if (snapshot.statusDetail === 'partially_refunded') await recordPartialRefund(deps, order.id);
      // E-mail de compra (ou o aviso aos administradores, no caso sem estoque): já está na fila, gravado na mesma transação.
      // Tenta entregar agora sem segurar a resposta.
      if ((outcome === 'confirmado' || outcome === 'confirmado_tardio' || outcome === 'sem_estoque') && deps.mail)
        await processSoon(deps.mail, { orderId: order.id });
      return { outcome, orderId: order.id };
    }
    case 'recusar':
      return { outcome: await applyDecline(deps, order.id, snapshot), orderId: order.id };
    case 'expirar':
      return { outcome: await applyGatewayExpiry(deps, order.id), orderId: order.id };
    case 'estornar':
      return { outcome: await applyReversal(deps, order.id, 'estornado', snapshot), orderId: order.id };
    case 'contestar':
      return { outcome: await applyReversal(deps, order.id, 'contestado', snapshot), orderId: order.id };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Pedidos que ainda podem receber uma cobrança (os mesmos em que uma aprovação tardia é aceita). */
const OPEN_FOR_CHARGE: OrderStatus[] = ['pendente', 'nao_concluido', 'expirado'];

/**
 * Cobrança que nenhum pedido conhece (a resposta da criação se perdeu: tempo esgotado depois de o gateway criar). A notificação é
 * autêntica, mas o vínculo só sai da **reconsulta**: a referência externa da cobrança aponta o pedido, e a conta tem de ser a da
 * PartyX. Pedido aberto e sem cobrança: a cobrança é vinculada e conciliada pelo caminho normal (com todas as conferências).
 * Pedido que já tem OUTRA cobrança: é cobrança em dobro; nada é emitido, fica na trilha e no alerta para o estorno no gateway.
 */
async function adoptOrphan(
  deps: ReconcileDeps,
  gatewayPaymentId: string,
): Promise<{ outcome: ReconcileOutcome; orderId?: string }> {
  let snapshot: PaymentSnapshot;
  try {
    snapshot = await deps.gateway.getPayment(gatewayPaymentId);
  } catch (error) {
    if (error instanceof GatewayRejectedError) return { outcome: 'sem_pedido' };
    throw error;
  }
  if (!UUID.test(snapshot.orderRef) || snapshot.accountId !== deps.gateway.accountId) return { outcome: 'sem_pedido' };
  const [target] = await deps.db
    .select({
      id: orders.id,
      status: orders.status,
      gatewayPaymentId: orders.gatewayPaymentId,
      totalCents: orders.totalCents,
      paymentMethod: orders.paymentMethod,
    })
    .from(orders)
    .where(eq(orders.id, snapshot.orderRef))
    .limit(1);
  if (!target) return { outcome: 'sem_pedido' };

  if (!target.gatewayPaymentId && OPEN_FOR_CHARGE.includes(target.status)) {
    // Confere ANTES de vincular: cobrança com outro valor, moeda ou forma nunca vira o pagamento do pedido.
    const check = checkSnapshotAgainstOrder(snapshot, target, deps.gateway.accountId);
    if (!check.ok) {
      await recordDivergence(deps, target.id, check.mismatches);
      return { outcome: 'divergente', orderId: target.id };
    }
    const linked = await deps.db
      .update(orders)
      .set({
        gatewayPaymentId,
        // A forma da cobrança vem da reconsulta; a escolha local pode ter sido desfeita quando a criação deu tempo esgotado.
        paymentMethod: sql`coalesce(${orders.paymentMethod}, ${snapshot.method === 'outro' ? null : snapshot.method})`,
        updatedAt: deps.clock.now(),
      })
      .where(and(eq(orders.id, target.id), isNull(orders.gatewayPaymentId)))
      .returning({ id: orders.id });
    if (linked.length > 0) {
      logger.warn('cobrança sem vínculo encontrada pela notificação e vinculada ao pedido', {
        orderId: target.id,
        alert: 'cobranca_vinculada_tardia',
      });
      await deps.db.transaction(tx =>
        writeAudit(tx, {
          actorId: null,
          action: 'pagamento.vinculado_pela_reconsulta',
          entity: 'order',
          entityId: target.id,
          before: { gatewayPaymentId: null },
          after: { gatewayPaymentId, gatewayStatus: snapshot.status },
          at: deps.clock.now(),
        }),
      );
    }
    // Vinculada agora ou por uma notificação simultânea: segue pelo caminho normal.
    return reconcilePayment(deps, gatewayPaymentId);
  }
  if (target.gatewayPaymentId === gatewayPaymentId) return reconcilePayment(deps, gatewayPaymentId);

  // Segunda cobrança para o mesmo pedido. Só importa se houve (ou pode haver) dinheiro: aprovada, aberta, estornada ou contestada.
  if (snapshot.status === 'recusado' || snapshot.status === 'expirado')
    return { outcome: 'ignorado', orderId: target.id };
  const reason = `cobranca:${gatewayPaymentId}`;
  logger.error('segunda cobrança para o mesmo pedido: conferir e estornar no gateway', {
    orderId: target.id,
    gatewayStatus: snapshot.status,
    alert: 'cobranca_duplicada',
  });
  await deps.db.transaction(async tx => {
    const existing = await tx.execute(
      sql`select 1 from audit_log where action = 'pagamento.cobranca_duplicada' and entity_id = ${target.id} and reason = ${reason} limit 1`,
    );
    if (existing.rows.length > 0) return;
    await writeAudit(tx, {
      actorId: null,
      action: 'pagamento.cobranca_duplicada',
      entity: 'order',
      entityId: target.id,
      before: { gatewayPaymentId: target.gatewayPaymentId },
      after: { outraCobranca: gatewayPaymentId, gatewayStatus: snapshot.status },
      reason,
      at: deps.clock.now(),
    });
  });
  return { outcome: 'cobranca_duplicada', orderId: target.id };
}

/**
 * Estorno PARCIAL feito no painel do gateway: no Mercado Pago a order continua `processed`, com detalhe `partially_refunded`
 * (observado no ambiente de teste em 12/10/2026). Qual ingresso deixa de valer é decisão da PartyX (D-82, pendente): nada é
 * cancelado sozinho; fica uma linha na trilha (uma vez por pedido) e o alerta para o administrador cancelar no painel.
 */
async function recordPartialRefund(deps: ReconcileDeps, orderId: string) {
  await deps.db.transaction(async tx => {
    const existing = await tx.execute(
      sql`select 1 from audit_log where action = 'pagamento.estorno_parcial' and entity_id = ${orderId} limit 1`,
    );
    if (existing.rows.length > 0) return;
    await writeAudit(tx, {
      actorId: null,
      action: 'pagamento.estorno_parcial',
      entity: 'order',
      entityId: orderId,
      before: null,
      after: { gatewayStatusDetail: 'partially_refunded' },
      reason:
        'Estorno parcial no gateway. Nenhum ingresso é cancelado automaticamente (D-82, proposta a confirmar com a PartyX): cancele manualmente, no detalhe do ingresso (ADM15), o ingresso correspondente ao valor devolvido.',
      at: deps.clock.now(),
    });
    logger.warn('estorno parcial no gateway: cancelar manualmente no ADM15 o ingresso correspondente', {
      orderId,
      alert: 'estorno_parcial',
    });
  });
}

/** Divergência: fica na trilha uma vez por combinação, e no log para o alerta. Não muda o pedido. */
async function recordDivergence(deps: ReconcileDeps, orderId: string, mismatches: string[]) {
  const reason = mismatches.join(',');
  logger.warn('pagamento diverge do pedido', { orderId, mismatches: reason, alert: 'pagamento_divergente' });
  await deps.db.transaction(async tx => {
    const existing = await tx.execute(
      sql`select 1 from audit_log where action = 'pagamento.divergente' and entity_id = ${orderId} and reason = ${reason} limit 1`,
    );
    if (existing.rows.length > 0) return;
    await writeAudit(tx, {
      actorId: null,
      action: 'pagamento.divergente',
      entity: 'order',
      entityId: orderId,
      before: null,
      after: { divergencias: mismatches },
      reason,
      at: deps.clock.now(),
    });
  });
}

async function lockOrder(tx: Tx, orderId: string) {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for('update');
  if (!row) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');
  return row;
}

/**
 * Aprovação (CA-P1, CA-P3, seção 10.1): reserva válida → confirma; reserva vencida → só emite **se ainda houver estoque**,
 * com a linha do tipo trancada; sem estoque → `pago_sem_estoque`, nada é emitido e o administrador é avisado para o
 * cliente estornar no gateway. O pagamento nunca vira "venda inventada".
 */
async function applyApproval(
  deps: ReconcileDeps,
  orderId: string,
  snapshot: PaymentSnapshot,
): Promise<ReconcileOutcome> {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const order = await lockOrder(tx, orderId);
    if (FINAL_FOR_APPROVAL.includes(order.status)) return 'ignorado'; // notificação repetida

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.ticketTypeId));
    // Trava os tipos na mesma ordem das reservas (id), para não haver impasse com compradores simultâneos.
    const types = await tx
      .select()
      .from(ticketTypes)
      .where(
        inArray(
          ticketTypes.id,
          items.map(i => i.ticketTypeId),
        ),
      )
      .orderBy(asc(ticketTypes.id))
      .for('update');
    const resv = await tx.select().from(reservations).where(eq(reservations.orderId, orderId));
    const reservationValid = resv.length > 0 && resv.every(r => r.status === 'ativa' && r.expiresAt > now);

    // Reservas ativas e válidas **de outros pedidos**, por tipo.
    const heldByOthers = await tx
      .select({ id: reservations.ticketTypeId, n: sql<number>`coalesce(sum(${reservations.quantity}), 0)::int` })
      .from(reservations)
      .where(
        and(
          inArray(
            reservations.ticketTypeId,
            types.map(t => t.id),
          ),
          eq(reservations.status, 'ativa'),
          sql`${reservations.expiresAt} > ${now}`,
          sql`${reservations.orderId} <> ${orderId}`,
        ),
      )
      .groupBy(reservations.ticketTypeId);
    const held = new Map(heldByOthers.map(r => [r.id, r.n]));
    const typeById = new Map(types.map(t => [t.id, t]));

    const outcomes = items.map(item => {
      const t = typeById.get(item.ticketTypeId)!;
      return approvalOutcome({
        orderStatus: order.status,
        reservationStatus: resv.find(r => r.ticketTypeId === item.ticketTypeId)?.status ?? null,
        reservationValid,
        availableNow: t.quantityTotal - t.quantitySold - (held.get(t.id) ?? 0),
        needed: item.quantity,
      });
    });
    const outcome = outcomes.includes('sem_estoque') ? 'sem_estoque' : (outcomes[0] ?? 'sem_estoque');
    const paidAt = snapshot.paidAt ?? now;

    if (outcome === 'ignorar') return 'ignorado';

    if (outcome === 'sem_estoque') {
      assertTransition(order.status, 'pago_sem_estoque');
      await tx.update(orders).set({ status: 'pago_sem_estoque', paidAt }).where(eq(orders.id, orderId));
      await writeAudit(tx, {
        actorId: null,
        action: 'pagamento.sem_estoque',
        entity: 'order',
        entityId: orderId,
        before: { status: order.status },
        after: { status: 'pago_sem_estoque' },
        reason:
          'Pagamento aprovado depois da reserva vencer, sem estoque. Nenhum ingresso emitido; o cliente deve estornar no gateway.',
        at: now,
      });
      // Aviso por e-mail a cada administrador ativo, na mesma transação (outbox): existe se, e somente se, o caso foi registrado.
      // Repetir a notificação não duplica (chave por pedido e administrador). Procedimento provisório até a decisão D-13.
      const admins = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'administrador'), eq(users.isActive, true)))
        .orderBy(asc(users.id));
      for (const admin of admins) {
        await enqueueEmail(tx, deps.clock, {
          userId: admin.id,
          orderId,
          template: 'pagamento_sem_estoque',
          idempotencyKey: `sem_estoque:${orderId}:${admin.id}`,
        });
      }
      // O alerta é este log (severidade e campo `alert` fixos, para o Cloud Monitoring), o e-mail acima e a lista do painel.
      logger.error('pagamento aprovado sem estoque: estornar no gateway', {
        orderId,
        admins: admins.length,
        alert: 'pago_sem_estoque',
      });
      return 'sem_estoque';
    }

    // confirmar | emitir_tardio: a conta de estoque já foi feita com as linhas trancadas.
    assertTransition(order.status, 'pago');
    await tx.update(orders).set({ status: 'pago', paidAt }).where(eq(orders.id, orderId));
    for (const item of items) {
      await tx
        .update(ticketTypes)
        .set({ quantitySold: sql`${ticketTypes.quantitySold} + ${item.quantity}` })
        .where(eq(ticketTypes.id, item.ticketTypeId));
    }
    await tx
      .update(reservations)
      .set({ status: 'convertida', releasedAt: null })
      .where(eq(reservations.orderId, orderId));
    await deps.issueTickets?.(tx, {
      id: orderId,
      userId: order.userId,
      eventId: order.eventId,
      items: items.map(i => ({ orderItemId: i.id, ticketTypeId: i.ticketTypeId, quantity: i.quantity })),
    });
    // E-mail de compra na mesma transação: existe se, e somente se, o pedido foi confirmado. Falha de envio não desfaz nada.
    await enqueueEmail(tx, deps.clock, {
      userId: order.userId,
      orderId,
      template: 'compra_confirmada',
      idempotencyKey: `compra:${orderId}`,
    });
    await writeAudit(tx, {
      actorId: null,
      action: outcome === 'emitir_tardio' ? 'pagamento.confirmado_tardio' : 'pagamento.confirmado',
      entity: 'order',
      entityId: orderId,
      before: { status: order.status },
      after: { status: 'pago' },
      at: now,
    });
    return outcome === 'emitir_tardio' ? 'confirmado_tardio' : 'confirmado';
  });
}

/**
 * Cartão recusado (CA-P2): sem ingresso, e a reserva é liberada (o estoque volta). Guarda o código de detalhe do gateway (para o
 * atendimento) e a categoria da recusa (para o texto amigável ao comprador).
 */
async function applyDecline(
  deps: ReconcileDeps,
  orderId: string,
  snapshot: PaymentSnapshot,
): Promise<ReconcileOutcome> {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== 'pendente') return 'ignorado';
    assertTransition('pendente', 'nao_concluido');
    await tx
      .update(orders)
      .set({
        status: 'nao_concluido',
        gatewayStatusDetail: snapshot.statusDetail,
        declineReason: snapshot.declineReason ?? 'outro',
      })
      .where(eq(orders.id, orderId));
    await tx
      .update(reservations)
      .set({ status: 'liberada', releasedAt: now })
      .where(and(eq(reservations.orderId, orderId), eq(reservations.status, 'ativa')));
    return 'recusado';
  });
}

/** O gateway informou que a cobrança venceu ou foi cancelada: o pedido expira e a reserva é encerrada. */
async function applyGatewayExpiry(deps: ReconcileDeps, orderId: string): Promise<ReconcileOutcome> {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== 'pendente' && order.status !== 'nao_concluido') return 'ignorado';
    assertTransition(order.status, 'expirado');
    await tx.update(orders).set({ status: 'expirado' }).where(eq(orders.id, orderId));
    await tx
      .update(reservations)
      .set({ status: 'expirada', releasedAt: now })
      .where(and(eq(reservations.orderId, orderId), eq(reservations.status, 'ativa')));
    return 'expirado';
  });
}

/**
 * Estorno ou chargeback (CA-P5): o pedido muda de estado, os ingressos ainda válidos são cancelados (a portaria passa a
 * recusá-los) e **`paid_at` não muda**: a taxa mensal continua contando. Ingresso já usado fica como está (a entrada ocorreu).
 * Não devolve estoque: a reposição depende da decisão do cliente (D-14), então nada é feito até ela existir.
 */
async function applyReversal(
  deps: ReconcileDeps,
  orderId: string,
  target: 'estornado' | 'contestado',
  snapshot: PaymentSnapshot,
): Promise<ReconcileOutcome> {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const order = await lockOrder(tx, orderId);
    if (order.status === target) return 'ignorado';
    if (!canTransition(order.status, target)) {
      // Nunca foi aprovado aqui (ou combinação sem previsão, como chargeback de pagamento sem estoque): não inventa transição.
      const seen = await tx.execute(
        sql`select 1 from audit_log where action = 'pagamento.estorno_fora_de_fluxo' and entity_id = ${orderId} and reason like ${`O gateway informou ${target}%`} limit 1`,
      );
      if (seen.rows.length > 0) return 'ignorado'; // reconsulta repetida: já está na trilha
      logger.warn('estorno ou chargeback sem aprovação local', {
        orderId,
        status: order.status,
        target,
        alert: 'estorno_fora_de_fluxo',
      });
      await writeAudit(tx, {
        actorId: null,
        action: 'pagamento.estorno_fora_de_fluxo',
        entity: 'order',
        entityId: orderId,
        before: { status: order.status },
        after: { gatewayStatus: snapshot.status },
        reason: `O gateway informou ${target}, mas o pedido está ${order.status}. Revisão manual.`,
        at: now,
      });
      return 'ignorado';
    }
    await tx.update(orders).set({ status: target }).where(eq(orders.id, orderId));
    const cancelled = await tx
      .update(tickets)
      .set({ status: 'cancelado', cancelledAt: now, cancelReason: target === 'estornado' ? 'estorno' : 'chargeback' })
      .where(and(eq(tickets.orderId, orderId), eq(tickets.status, 'valido')))
      .returning({ id: tickets.id });
    await writeAudit(tx, {
      actorId: null,
      action: target === 'estornado' ? 'pagamento.estornado' : 'pagamento.contestado',
      entity: 'order',
      entityId: orderId,
      before: { status: order.status },
      after: { status: target, ingressosCancelados: cancelled.length },
      at: now,
    });
    return target;
  });
}
