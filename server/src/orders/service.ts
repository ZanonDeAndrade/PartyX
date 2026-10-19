import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import type { Tx } from '../db/audit';
import {
  events,
  cancellationAcceptances,
  minorTermAcceptances,
  orderItemLots,
  orderItems,
  orders,
  promoters,
  reservations,
  ticketLots,
  ticketTypes,
} from '../db/schema';
import {
  checkShape,
  planOrder,
  secondsLeft,
  type ItemFailure,
  type PlannedLine,
  type RequestedItem,
  type TypeForPlan,
} from '../domain/checkout';
import { AppError } from '../domain/errors';
import { transferredOutOfOrder } from '../tickets/service';
import { DECLINE_REASONS, type DeclineReason } from '../domain/payment';
import { isCouponCodeValid, normalizeCouponCode } from '../domain/events';
import type { Config, SupportContact } from '../config';
import { reservedByType } from '../events/service';
import { previewTypes, saveLots, settleTypes } from '../events/lots';
import type { Clock } from '../providers/clock';
import { legalVersion, salesBlockers } from '../legal/documents';
import { logger } from '../logger';
import type { TaskQueue } from '../payments/taskQueue';
import type { RequestMeta } from '../auth/types';
import { assertBuyerMayPurchase, checkBuyer, type BuyerCheck } from './buyer';
import { currentServiceFee } from '../settings/serviceFee';

export interface OrdersDeps {
  db: Db;
  clock: Clock;
  /** Agenda as verificações do pagamento quando a cobrança é criada (conciliação sob demanda). Opcional. */
  taskQueue?: TaskQueue;
  config: Pick<
    Config,
    | 'RESERVATION_MINUTES'
    | 'MAX_TICKETS_PER_ORDER'
    | 'salesOpen'
    | 'APP_ENV'
    | 'legal'
    | 'legalContentDir'
    | 'cancellationVersion'
    | 'minorTermVersion'
    | 'minorAuthorizationVersion'
    | 'legalDates'
    | 'visualApproved'
    | 'reconcile'
    | 'partyxSupport'
  >;
}

export interface CheckoutInput {
  eventSlug: string;
  items: RequestedItem[];
  couponCode?: string | null;
  /** Total que o navegador mostrou. Só serve para avisar que o preço mudou; nunca é usado para cobrar. */
  expectedTotalCents?: number;
  /** Caixa do Termo de Ciência para Menores marcada pela pessoa (16 ou 17 anos na data do evento), e a versão que ela leu. */
  minorTermAccepted?: boolean;
  minorTermVersion?: string | null;
  /** Caixa da Política de Cancelamento, Troca e Reembolso marcada pela pessoa, e a versão que ela leu (D-80 atualizada). */
  cancellationAccepted?: boolean;
  cancellationVersion?: string | null;
}

const FAILURE_TEXT: Record<ItemFailure['reason'], string> = {
  em_breve: 'As vendas deste ingresso ainda não começaram.',
  encerrada: 'As vendas deste ingresso foram encerradas.',
  esgotado: 'Este ingresso esgotou.',
  reservado: 'As últimas unidades estão reservadas por outros compradores. Tente de novo em alguns minutos.',
  indisponivel: 'Este ingresso não está disponível.',
  quantidade_indisponivel: 'Restam menos unidades do que a quantidade escolhida.',
};

function stockError(failures: ItemFailure[]) {
  return new AppError(409, 'estoque_alterado', 'Alguns ingressos não estão mais disponíveis na quantidade escolhida.', {
    itens: failures.map(f => ({
      ticketTypeId: f.ticketTypeId,
      motivo: f.reason,
      disponivel: f.available ?? 0,
      mensagem: FAILURE_TEXT[f.reason],
    })),
  });
}

const invalid = (campo: string, mensagem: string, codigo = 'dados_invalidos') =>
  new AppError(422, codigo, 'Alguns campos precisam de ajuste.', [{ campo, mensagem }]);

function assertSalesOpen(deps: OrdersDeps) {
  if (!deps.config.salesOpen) {
    throw new AppError(503, 'vendas_fechadas', 'As vendas deste evento ainda não estão abertas.');
  }
  // Mesmo com SALES_OPEN=true, produção só vende com os textos legais e a aprovação visual do cliente (D-10, D-11).
  const blockers = salesBlockers(deps.config);
  if (blockers.length) {
    logger.warn('venda bloqueada por pendência do cliente', { blockers });
    throw new AppError(503, 'vendas_fechadas', 'As vendas deste evento ainda não estão abertas.');
  }
}

/** Cupom do promoter (RF-30, RF-31). Só vincula a venda: não existe desconto. */
async function resolveCoupon(db: Db | Tx, raw: string | null | undefined): Promise<string | null> {
  const code = normalizeCouponCode(raw ?? '');
  if (!code) return null;
  const message = 'Código inválido ou desativado. Confira o código ou finalize sem ele.';
  if (!isCouponCodeValid(code)) throw invalid('couponCode', message, 'cupom_invalido');
  const [promoter] = await db
    .select({ id: promoters.id })
    .from(promoters)
    .where(and(eq(promoters.couponCode, code), eq(promoters.isActive, true)))
    .limit(1);
  if (!promoter) throw invalid('couponCode', message, 'cupom_invalido');
  return promoter.id;
}

function shapeOrThrow(deps: OrdersDeps, items: RequestedItem[]) {
  const problems = checkShape(items, deps.config.MAX_TICKETS_PER_ORDER);
  if (problems.length) {
    const overLimit = problems.some(p => p.message.startsWith('O limite'));
    throw new AppError(
      422,
      overLimit ? 'limite_por_compra' : 'dados_invalidos',
      'Alguns campos precisam de ajuste.',
      problems.map(p => ({ campo: p.field, mensagem: p.message })),
    );
  }
}

async function loadEvent(db: Db | Tx, slug: string) {
  const [event] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  // Arquivado: sem compra nova, mesmo publicado (o arquivamento tira o evento do site).
  if (!event || event.status !== 'publicado' || event.archivedAt) {
    throw new AppError(409, 'evento_indisponivel', 'Este evento não está disponível para compra.');
  }
  return event;
}

/** Tipos pedidos, na ordem do id. Com `lock`, as linhas ficam trancadas até o fim da transação. */
async function loadTypes(tx: Db | Tx, eventId: string, ids: string[], lock: boolean) {
  const query = tx
    .select()
    .from(ticketTypes)
    .where(and(eq(ticketTypes.eventId, eventId), inArray(ticketTypes.id, ids)))
    .orderBy(asc(ticketTypes.id));
  const rows = await (lock ? query.for('update') : query);
  if (rows.length !== new Set(ids).size) {
    // O evento foi excluído enquanto este pedido esperava a trava dos tipos (a exclusão só alcança evento sem pedido).
    const [still] = await tx.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!still) throw new AppError(409, 'evento_indisponivel', 'Este evento não está disponível para compra.');
    // Id que não existe ou é de outro evento: nunca se descobre qual.
    throw invalid('items', 'Algum ingresso escolhido não pertence a este evento.');
  }
  return rows;
}

function forPlan(rows: (typeof ticketTypes.$inferSelect)[]): Map<string, TypeForPlan> {
  return new Map(
    rows.map(t => [
      t.id,
      {
        id: t.id,
        name: t.name,
        priceCents: t.priceCents,
        isActive: t.isActive,
        salesStartAt: t.salesStartAt,
        salesEndAt: t.salesEndAt,
        quantityTotal: t.quantityTotal,
        quantitySold: t.quantitySold,
        quantityReserved: 0,
      },
    ]),
  );
}

export interface Summary {
  event: { slug: string; name: string; startsAt: string; venue: string; allowsMinors: boolean };
  items: PlannedLine[];
  /** Valor dos ingressos, sem a taxa de serviço (D-90). */
  ticketsCents: number;
  serviceFeeCents: number;
  /** Ingressos mais taxa de serviço: o que o comprador paga. */
  totalCents: number;
  units: number;
  coupon: { code: string } | null;
  /** O que o comprador ainda precisa (novo aceite, data de nascimento, termo de menor) ou por que não pode comprar. Com `userId`. */
  buyer: BuyerCheck | null;
}

/**
 * Resumo antes do pagamento (RF-32): recalcula tudo no servidor e confere o estoque **sem reservar**.
 * É informação; quem garante o estoque é `createOrder`, dentro da transação com bloqueio.
 */
export async function quote(deps: OrdersDeps, input: CheckoutInput, userId?: string): Promise<Summary> {
  shapeOrThrow(deps, input.items);
  const now = deps.clock.now();
  const event = await loadEvent(deps.db, input.eventSlug);
  const rows = await loadTypes(
    deps.db,
    event.id,
    input.items.map(i => i.ticketTypeId),
    false,
  );
  const reserved = await reservedByType(
    deps.db,
    rows.map(r => r.id),
    now,
  );
  // Lotes como valeriam agora, sem gravar: o resumo é informação; quem grava é `createOrder`, com os tipos trancados.
  const lots = await previewTypes(deps.db, rows, now);
  const plan = planOrder(
    input.items,
    forPlan(rows),
    reserved,
    now,
    { byType: lots.byType, reservedByLot: lots.reserved },
    await currentServiceFee(deps.db),
  );
  if (!plan.ok) throw stockError(plan.failures);
  await resolveCoupon(deps.db, input.couponCode);
  const code = normalizeCouponCode(input.couponCode ?? '');
  return {
    event: {
      slug: event.slug,
      name: event.name,
      startsAt: event.startsAt.toISOString(),
      venue: event.venue,
      allowsMinors: event.allowsMinors,
    },
    items: plan.lines,
    ticketsCents: plan.ticketsCents,
    serviceFeeCents: plan.serviceFeeCents,
    totalCents: plan.totalCents,
    units: plan.units,
    coupon: code ? { code } : null,
    buyer: userId ? await checkBuyer(deps.db, deps.config, userId, event) : null,
  };
}

export interface OrderView {
  /** Ingressos do pedido que o comprador transferiu (D-87), com o nome de quem recebeu mascarado. Só em `getOrder`. */
  transferred?: { typeName: string; to: string; at: string }[];
  id: string;
  number: number;
  status: typeof orders.$inferSelect.status;
  event: { slug: string; name: string; startsAt: string; venue: string; allowsMinors: boolean };
  /** Comprador com 16 ou 17 anos na data do evento: a tela oferece a autorização preenchida com os dados dele. */
  buyerMinor: boolean;
  items: PlannedLine[];
  /** Valor dos ingressos (`total_cents - service_fee_cents`). */
  ticketsCents: number;
  /** Taxa de serviço guardada no pedido (D-90): não muda se a taxa do painel mudar depois. Zero nos pedidos anteriores. */
  serviceFeeCents: number;
  totalCents: number;
  coupon: { code: string } | null;
  paymentMethod: 'pix' | 'cartao' | null;
  /** Reserva do pedido. O contador usa `serverNow`, não o relógio do aparelho. */
  reservation: { status: string; expiresAt: string; serverNow: string; secondsLeft: number } | null;
  createdAt: string;
  /**
   * Contato de atendimento **da PartyX** (configuração `PARTYX_SUPPORT_*`), só no pedido pago sem estoque. Nulo quando a PartyX ainda
   * não forneceu: a tela mostra uma mensagem neutra. Nunca há contato da contratada aqui.
   */
  support: SupportContact | null;
  /** Pagamento recusado: categoria para o texto amigável (nunca o código técnico do gateway). Nula nos demais estados. */
  declineReason: DeclineReason | null;
}

async function view(
  db: Db | Tx,
  orderId: string,
  now: Date,
  support: SupportContact | null = null,
): Promise<OrderView> {
  const [order] = await db
    .select({
      o: orders,
      eventSlug: events.slug,
      eventName: events.name,
      eventStartsAt: events.startsAt,
      eventVenue: events.venue,
      eventAllowsMinors: events.allowsMinors,
    })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');
  const items = await db
    .select({
      ticketTypeId: orderItems.ticketTypeId,
      name: ticketTypes.name,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
      serviceFeeCents: orderItems.serviceFeeCents,
    })
    .from(orderItems)
    .innerJoin(ticketTypes, eq(ticketTypes.id, orderItems.ticketTypeId))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.ticketTypeId));
  // De que lote saiu cada parte da linha (0013), na ordem dos lotes.
  const parts = await db
    .select({
      ticketTypeId: orderItemLots.ticketTypeId,
      lotId: orderItemLots.lotId,
      name: ticketLots.name,
      position: ticketLots.position,
      quantity: orderItemLots.quantity,
      unitPriceCents: orderItemLots.unitPriceCents,
      unitServiceFeeCents: orderItemLots.unitServiceFeeCents,
    })
    .from(orderItemLots)
    .innerJoin(ticketLots, eq(ticketLots.id, orderItemLots.lotId))
    .where(eq(orderItemLots.orderId, orderId))
    .orderBy(asc(ticketLots.position));
  const resv = await db
    .select()
    .from(reservations)
    .where(eq(reservations.orderId, orderId))
    .orderBy(asc(reservations.ticketTypeId));
  const first = resv[0];
  let coupon: { code: string } | null = null;
  if (order.o.promoterId) {
    const [p] = await db
      .select({ code: promoters.couponCode })
      .from(promoters)
      .where(eq(promoters.id, order.o.promoterId));
    coupon = p ? { code: p.code } : null;
  }
  return {
    id: order.o.id,
    number: order.o.number,
    status: order.o.status,
    event: {
      slug: order.eventSlug,
      name: order.eventName,
      startsAt: order.eventStartsAt.toISOString(),
      venue: order.eventVenue,
      allowsMinors: order.eventAllowsMinors,
    },
    buyerMinor: order.o.buyerMinor,
    items: items.map(i => {
      const lots = parts
        .filter(p => p.ticketTypeId === i.ticketTypeId)
        .map(({ ticketTypeId: _t, ...p }) => ({ ...p, subtotalCents: p.quantity * p.unitPriceCents }));
      return {
        ...i,
        subtotalCents: lots.length ? lots.reduce((t, p) => t + p.subtotalCents, 0) : i.quantity * i.unitPriceCents,
        lots,
      };
    }),
    ticketsCents: order.o.totalCents - order.o.serviceFeeCents,
    serviceFeeCents: order.o.serviceFeeCents,
    totalCents: order.o.totalCents,
    coupon,
    paymentMethod: order.o.paymentMethod,
    reservation: first
      ? {
          status: first.status,
          expiresAt: first.expiresAt.toISOString(),
          serverNow: now.toISOString(),
          secondsLeft: first.status === 'ativa' ? secondsLeft(first.expiresAt, now) : 0,
        }
      : null,
    createdAt: order.o.createdAt.toISOString(),
    support: order.o.status === 'pago_sem_estoque' ? support : null,
    declineReason:
      order.o.status === 'nao_concluido' && DECLINE_REASONS.includes(order.o.declineReason as DeclineReason)
        ? (order.o.declineReason as DeclineReason)
        : null,
  };
}

/**
 * Vence reservas e pedidos pendentes. Idempotente e segura com execuções simultâneas: cada UPDATE só age
 * sobre quem ainda está "ativa" ou "pendente". O estoque já volta **sem** esta rotina, porque a contagem
 * ignora reserva vencida; ela só acerta os estados para o painel, os relatórios e a confirmação tardia.
 */
export async function expireOverdue(deps: Pick<OrdersDeps, 'db' | 'clock'>, scope?: { orderId?: string }) {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const expired = await tx
      .update(reservations)
      .set({ status: 'expirada', releasedAt: now })
      .where(
        and(
          eq(reservations.status, 'ativa'),
          lte(reservations.expiresAt, now),
          scope?.orderId ? eq(reservations.orderId, scope.orderId) : undefined,
        ),
      )
      .returning({ orderId: reservations.orderId });
    const ids = [...new Set(expired.map(r => r.orderId))];
    if (ids.length === 0) return { reservations: 0, orders: 0 };
    const closed = await tx
      .update(orders)
      .set({ status: 'expirado', updatedAt: now })
      .where(and(inArray(orders.id, ids), inArray(orders.status, ['pendente', 'nao_concluido'])))
      .returning({ id: orders.id });
    return { reservations: expired.length, orders: closed.length };
  });
}

/** Solta as reservas ativas de um pedido que o comprador abandonou ou substituiu. */
async function release(tx: Tx, orderId: string, now: Date) {
  await tx
    .update(reservations)
    .set({ status: 'liberada', releasedAt: now })
    .where(and(eq(reservations.orderId, orderId), eq(reservations.status, 'ativa')));
  await tx
    .update(orders)
    .set({ status: 'expirado', updatedAt: now })
    .where(and(eq(orders.id, orderId), inArray(orders.status, ['pendente', 'nao_concluido'])));
}

/**
 * A pessoa marcou a caixa da Política de Cancelamento, Troca e Reembolso e leu a versão vigente (D-80 atualizada, 15/10/2026). Devolve
 * a versão que vai para o aceite. Sem a Política publicada (produção), a venda já está fechada por `salesBlockers`.
 */
function assertCancellationAccepted(config: OrdersDeps['config'], input: CheckoutInput): string {
  const version = legalVersion(config, 'cancelamento');
  if (!version) throw new AppError(503, 'politica_indisponivel', 'A compra está indisponível no momento.');
  if (input.cancellationAccepted !== true)
    throw new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', [
      {
        campo: 'cancellationAccepted',
        mensagem: 'Para continuar, leia e aceite a Política de Cancelamento, Troca e Reembolso.',
      },
    ]);
  if (input.cancellationVersion !== version)
    throw new AppError(
      409,
      'versao_desatualizada',
      'A Política de Cancelamento, Troca e Reembolso foi atualizada. Leia e aceite novamente.',
    );
  return version;
}

/**
 * Cria o pedido e reserva o estoque (RF-28, RF-33, CA-15, CA-16).
 *
 * Uma transação, nesta ordem: (1) trava do comprador, para dois cliques seguidos virarem um pedido só;
 * (2) evento; (3) linhas dos tipos trancadas em ordem de id (sem impasse entre compradores que pedem os mesmos
 * tipos em ordens diferentes); (4) libera o pedido pendente anterior do mesmo comprador neste evento;
 * (5) conta vendidos mais reservas válidas **com a linha trancada**; (6) grava pedido, itens e reservas.
 * Não há chamada externa dentro da transação.
 */
export async function createOrder(
  deps: OrdersDeps,
  userId: string,
  input: CheckoutInput,
  meta: RequestMeta = { ip: null, userAgent: null },
): Promise<OrderView> {
  assertSalesOpen(deps);
  shapeOrThrow(deps, input.items);
  const policyVersion = assertCancellationAccepted(deps.config, input);
  const promoterId = await resolveCoupon(deps.db, input.couponCode);
  const now = deps.clock.now();
  const expiresAt = new Date(now.getTime() + deps.config.RESERVATION_MINUTES * 60_000);

  const orderId = await deps.db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`order-user:${userId}`}, 0))`);
    const event = await loadEvent(tx, input.eventSlug);
    // Regras do comprador (novo aceite, data de nascimento, idade na data do evento, termo de menor) ANTES de mexer em qualquer
    // pedido ou reserva: uma recusa aqui não solta a reserva de um pedido anterior.
    const buyer = await checkBuyer(tx, deps.config, userId, event);
    assertBuyerMayPurchase(buyer, deps.config, input);

    // **Ordem das travas: pedidos antes dos tipos**, a mesma da confirmação do pagamento (`applyApproval`). Trancar os tipos
    // primeiro e o pedido anterior depois cruzava com uma aprovação que tranca o pedido e depois os tipos: impasse no banco
    // (achado pela rajada de `stock.integration.test.ts`).
    const previous = await tx
      .select({ id: orders.id, paymentMethod: orders.paymentMethod })
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.eventId, event.id), eq(orders.status, 'pendente')))
      .orderBy(orders.id)
      .for('update');
    const rows = await loadTypes(
      tx,
      event.id,
      input.items.map(i => i.ticketTypeId),
      true,
    );

    // O pedido pendente anterior deste comprador neste evento sai antes da conta, para não competir consigo mesmo.
    for (const p of previous) {
      const [live] = await tx
        .select({ id: reservations.id })
        .from(reservations)
        .where(
          and(
            eq(reservations.orderId, p.id),
            eq(reservations.status, 'ativa'),
            sql`${reservations.expiresAt} > ${now}`,
          ),
        )
        .limit(1);
      if (live && p.paymentMethod) {
        // Pagamento já iniciado no gateway: soltar a reserva agora poderia vender o lugar de quem está pagando.
        throw new AppError(
          409,
          'pedido_em_andamento',
          'Você já tem um pagamento em andamento para este evento. Conclua ou aguarde ele expirar.',
          { orderId: p.id },
        );
      }
      await release(tx, p.id, now);
    }

    // Viradas devidas agora (data de fim, esgotado, reservas vencidas de lote encerrado), gravadas com os tipos trancados.
    const settled = await settleTypes(tx, rows, now);
    const reserved = await reservedByType(
      tx,
      rows.map(r => r.id),
      now,
    );
    // Taxa de serviço lida na mesma transação (D-90): o pedido guarda a taxa, a porcentagem e o mínimo deste instante. Se a taxa
    // mudou desde a tela, o total muda e o `expectedTotalCents` abaixo recusa, como numa virada de lote.
    const fee = await currentServiceFee(tx);
    const plan = planOrder(
      input.items,
      forPlan(rows),
      reserved,
      now,
      { byType: settled.byType, reservedByLot: settled.reserved },
      fee,
    );
    if (!plan.ok) throw stockError(plan.failures);
    if (input.expectedTotalCents !== undefined && input.expectedTotalCents !== plan.totalCents) {
      throw new AppError(409, 'preco_alterado', 'O valor do pedido mudou. Confira o novo total antes de continuar.', {
        totalCents: plan.totalCents,
      });
    }

    const [order] = await tx
      .insert(orders)
      .values({
        userId,
        eventId: event.id,
        promoterId,
        totalCents: plan.totalCents,
        serviceFeeCents: plan.serviceFeeCents,
        serviceFeeRateBps: fee.rateBps,
        serviceFeeMinCents: fee.minCents,
        status: 'pendente',
        buyerMinor: buyer.minor,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: orders.id });
    // Aceite da Política de Cancelamento, Troca e Reembolso (D-80 atualizada): na mesma transação, ligado ao pedido.
    await tx.insert(cancellationAcceptances).values({
      userId,
      orderId: order!.id,
      policyVersion,
      acceptedAt: now,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    });
    if (buyer.minor) {
      // Aceite do termo de menor na mesma transação do pedido: existe se, e somente se, o pedido existe.
      await tx.insert(minorTermAcceptances).values({
        userId,
        orderId: order!.id,
        termVersion: buyer.minorTermVersion!,
        ageAtEvent: buyer.age!,
        acceptedAt: now,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
      });
    }
    for (const line of plan.lines) {
      const [item] = await tx
        .insert(orderItems)
        .values({
          orderId: order!.id,
          eventId: event.id,
          ticketTypeId: line.ticketTypeId,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          serviceFeeCents: line.serviceFeeCents,
        })
        .returning({ id: orderItems.id });
      // O preço de cada lote (e a taxa de serviço dele) fica preso aqui: quem estiver pagando quando o lote virar paga o reservado.
      for (const part of line.lots) {
        await tx.insert(orderItemLots).values({
          orderItemId: item!.id,
          orderId: order!.id,
          ticketTypeId: line.ticketTypeId,
          eventId: event.id,
          lotId: part.lotId,
          quantity: part.quantity,
          unitPriceCents: part.unitPriceCents,
          unitServiceFeeCents: part.unitServiceFeeCents,
        });
      }
      await tx.insert(reservations).values({
        orderId: order!.id,
        ticketTypeId: line.ticketTypeId,
        quantity: line.quantity,
        expiresAt,
        createdAt: now,
      });
    }
    // Viradas causadas por esta compra (o lote esgotou e havia próximo), com os tipos ainda trancados.
    for (const update of plan.lotUpdates) {
      if (update.changes.length === 0) continue;
      const type = rows.find(r => r.id === update.ticketTypeId)!;
      await saveLots(tx, type, settled.byType.get(type.id) ?? [], update.lots, update.changes, null, now);
    }
    return order!.id;
  });
  // As verificações do pagamento (Cloud Tasks) começam quando a cobrança é criada (`startPayment`). Sem cobrança, nada é cobrado:
  // a reserva vence sozinha (a contagem ignora reserva vencida) e o estado é acertado na leitura e pela varredura.
  return view(deps.db, orderId, now);
}

/** Pedido do próprio comprador. De outro usuário, responde como se não existisse. Acerta o estado se a reserva venceu. */
export async function getOrder(deps: OrdersDeps, userId: string, orderId: string): Promise<OrderView> {
  const [own] = await deps.db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  if (!own) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');
  await expireOverdue(deps, { orderId });
  const order = await view(deps.db, orderId, deps.clock.now(), deps.config.partyxSupport);
  // Ingressos que o comprador transferiu (D-87): a página mostra "Transferido para Maria S. O.", sem QR.
  return { ...order, transferred: await transferredOutOfOrder(deps.db, userId, orderId) };
}

/** O comprador desiste antes de pagar: a reserva é liberada na hora. Repetir não faz mal. */
export async function cancelOrder(deps: OrdersDeps, userId: string, orderId: string): Promise<OrderView> {
  const now = deps.clock.now();
  await deps.db.transaction(async tx => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1)
      .for('update');
    if (!order) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');
    if (order.status === 'pendente') {
      if (order.paymentMethod) {
        throw new AppError(
          409,
          'pagamento_iniciado',
          'O pagamento deste pedido já foi iniciado e não pode ser cancelado por aqui.',
        );
      }
      await release(tx, orderId, now);
    }
    // Já expirado ou liberado: nada a fazer. Pago ou em outro estado: não é cancelável por esta rota.
    else if (order.status !== 'expirado') {
      throw new AppError(409, 'estado_invalido', 'Este pedido não pode ser cancelado.');
    }
  });
  return view(deps.db, orderId, now);
}
