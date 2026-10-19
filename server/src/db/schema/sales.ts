import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  inet,
  integer,
  pgSequence,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, updatedAt } from './columns';
import { orderStatus, paymentMethod, promoterDiscountKind, reservationStatus, ticketStatus } from './enums';
import { events, promoters, ticketLots, ticketTypes } from './events';
import { users } from './users';

/** Número do pedido exibido ao cliente (PX-10001...). */
export const orderNumberSeq = pgSequence('order_number_seq', { startWith: 10001, increment: 1 });

/**
 * Pedido. Pertence a um único evento. Nunca é apagado.
 * `paid_at` guarda o instante original da aprovação e **não muda mais** (trigger `orders_paid_at_immutable`):
 * é a base do relatório mensal da taxa (Cl. 6.3), mesmo se o pedido for cancelado, reembolsado ou estornado.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: integer('number')
      .notNull()
      .default(sql`nextval('order_number_seq')`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    /** Promoter da venda (atribuição). Com desconto (D-91), o desconto aplicado fica nas colunas `discount_*` abaixo. */
    promoterId: uuid('promoter_id').references(() => promoters.id),
    /**
     * Retrato do código e do desconto do promoter no momento do pedido (D-91, 0018): mudar o promoter depois não altera o pedido.
     * `discount_cents` é a soma dos descontos por ingresso, já fora de `total_cents` (total = ingressos - desconto + taxa de serviço).
     * Nulos e zero nos pedidos sem código, nos sem desconto e nos anteriores à 0018.
     */
    couponCode: text('coupon_code'),
    discountKind: promoterDiscountKind('discount_kind'),
    discountValue: integer('discount_value'),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    status: orderStatus('status').notNull().default('pendente'),
    /** Nulo até o comprador escolher a forma de pagamento. */
    paymentMethod: paymentMethod('payment_method'),
    gatewayPaymentId: text('gateway_payment_id'),
    /** Último código de detalhe do gateway numa recusa (ex.: `cc_rejected_insufficient_amount`), para o atendimento. */
    gatewayStatusDetail: varchar('gateway_status_detail', { length: 80 }),
    /** Categoria da recusa (domain/payment.ts, `DeclineReason`): a tela mostra um texto amigável para ela. */
    declineReason: varchar('decline_reason', { length: 32 }),
    /**
     * Tentativa de cobrança do pedido, parte da chave de idempotência enviada ao gateway. Sobe só quando o gateway RECUSA criar a
     * cobrança (ex.: token de cartão inválido): a nova tentativa leva chave nova. Reenvio da mesma tentativa repete a chave.
     */
    paymentAttempt: smallint('payment_attempt').notNull().default(0),
    /**
     * O comprador tinha 16 ou 17 anos na data do evento quando fez o pedido (0009). Retrato da compra: vale mesmo depois de anonimizar
     * a conta. A portaria mostra o aviso de menor em todos os ingressos do pedido. Recalculado se a PartyX corrigir a data de nascimento.
     */
    buyerMinor: boolean('buyer_minor').notNull().default(false),
    /**
     * Taxa de serviço da PartyX (D-90, 0017): soma das taxas por ingresso, já dentro de `total_cents` (o valor dos ingressos é
     * `total_cents - service_fee_cents`). Porcentagem (centésimos de ponto percentual) e mínimo usados no pedido, para mudar a taxa
     * depois não alterar o pedido. Zero nos pedidos anteriores à taxa.
     */
    serviceFeeCents: integer('service_fee_cents').notNull().default(0),
    serviceFeeRateBps: integer('service_fee_rate_bps').notNull().default(0),
    serviceFeeMinCents: integer('service_fee_min_cents').notNull().default(0),
    /**
     * Tarifa cobrada pelo Mercado Pago (`fee_details`) e líquido recebido (`net_received_amount`) neste pagamento, lidos pela busca de
     * pagamentos (a Orders API não informa). Relatório da taxa de serviço. Nulos: ainda não consultados ou não informados.
     */
    gatewayFeeCents: integer('gateway_fee_cents'),
    gatewayNetCents: integer('gateway_net_cents'),
    gatewayFeeCheckedAt: instant('gateway_fee_checked_at'),
    paidAt: instant('paid_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    uniqueIndex('orders_number_key').on(t.number),
    uniqueIndex('orders_gateway_payment_id_key')
      .on(t.gatewayPaymentId)
      .where(sql`${t.gatewayPaymentId} is not null`),
    unique('orders_id_event_key').on(t.id, t.eventId),
    index('orders_user_idx').on(t.userId),
    index('orders_event_status_idx').on(t.eventId, t.status),
    index('orders_paid_at_idx').on(t.paidAt),
    index('orders_promoter_idx').on(t.promoterId),
    index('orders_status_created_idx').on(t.status, t.createdAt),
    check('orders_total_positive', sql`${t.totalCents} > 0`),
    check(
      'orders_paid_has_paid_at',
      sql`${t.status} not in ('pago', 'estornado', 'contestado', 'pago_sem_estoque') or ${t.paidAt} is not null`,
    ),
    check('orders_pending_not_paid', sql`${t.status} <> 'pendente' or ${t.paidAt} is null`),
    check(
      'orders_service_fee_valid',
      sql`${t.serviceFeeCents} >= 0 and ${t.serviceFeeCents} < ${t.totalCents} and ${t.serviceFeeRateBps} >= 0 and ${t.serviceFeeMinCents} >= 0`,
    ),
    check(
      'orders_discount_valid',
      sql`${t.discountCents} >= 0 and (${t.discountCents} = 0 or (${t.discountKind} in ('percentual', 'fixo') and ${t.discountValue} is not null and ${t.couponCode} is not null))`,
    ),
    check(
      'orders_gateway_fee_valid',
      sql`(${t.gatewayFeeCents} is null or ${t.gatewayFeeCents} >= 0) and (${t.gatewayNetCents} is null or ${t.gatewayNetCents} >= 0)`,
    ),
  ],
);

/** Linhas do pedido. `event_id` repetido para impedir, por chave composta, tipo de ingresso de outro evento. */
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    eventId: uuid('event_id').notNull(),
    ticketTypeId: uuid('ticket_type_id').notNull(),
    quantity: integer('quantity').notNull(),
    /** Preço no momento da compra, em centavos. */
    unitPriceCents: integer('unit_price_cents').notNull(),
    /** Taxa de serviço das unidades do item (soma das taxas por ingresso dos lotes, 0017). */
    serviceFeeCents: integer('service_fee_cents').notNull().default(0),
    /** Desconto do promoter nas unidades do item (soma dos descontos por ingresso dos lotes, D-91, 0018). */
    discountCents: integer('discount_cents').notNull().default(0),
  },
  t => [
    foreignKey({
      name: 'order_items_order_fk',
      columns: [t.orderId, t.eventId],
      foreignColumns: [orders.id, orders.eventId],
    }),
    foreignKey({
      name: 'order_items_ticket_type_fk',
      columns: [t.ticketTypeId, t.eventId],
      foreignColumns: [ticketTypes.id, ticketTypes.eventId],
    }),
    // Constraint de tabela (e não índice): a chave de `reservations` aponta para ela e precisa existir já no CREATE TABLE.
    unique('order_items_order_type_key').on(t.orderId, t.ticketTypeId),
    // Alvo das chaves compostas de `tickets` e `reservations`.
    unique('order_items_ref_key').on(t.id, t.orderId, t.ticketTypeId, t.eventId),
    check('order_items_quantity_positive', sql`${t.quantity} > 0`),
    check('order_items_price_positive', sql`${t.unitPriceCents} > 0`),
    check('order_items_service_fee_nonnegative', sql`${t.serviceFeeCents} >= 0`),
    // O teto exato fica por lote (`order_item_lots_discount_valid`): aqui o preço unitário é a média arredondada dos lotes.
    check('order_items_discount_nonnegative', sql`${t.discountCents} >= 0`),
  ],
);

/**
 * De que lote saíram as unidades de cada item do pedido, e por qual preço (0013, 15/10/2026). Um item (um por tipo) pode ter unidades de
 * mais de um lote, quando o lote à venda não bastava: o restante sai do próximo lote, pelo preço dele. O preço fica preso aqui no momento
 * da reserva; quem estiver pagando quando o lote virar paga o preço reservado. Itens anteriores aos lotes ganham o "Lote único".
 */
export const orderItemLots = pgTable(
  'order_item_lots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderItemId: uuid('order_item_id').notNull(),
    orderId: uuid('order_id').notNull(),
    ticketTypeId: uuid('ticket_type_id').notNull(),
    eventId: uuid('event_id').notNull(),
    lotId: uuid('lot_id').notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    /** Taxa de serviço de cada ingresso deste lote, presa junto com o preço (0017); com desconto, calculada sobre o valor descontado. */
    unitServiceFeeCents: integer('unit_service_fee_cents').notNull().default(0),
    /** Desconto do promoter em cada ingresso deste lote (D-91, 0018). O ingresso custa `unit_price_cents - unit_discount_cents`. */
    unitDiscountCents: integer('unit_discount_cents').notNull().default(0),
  },
  t => [
    foreignKey({
      name: 'order_item_lots_item_fk',
      columns: [t.orderItemId, t.orderId, t.ticketTypeId, t.eventId],
      foreignColumns: [orderItems.id, orderItems.orderId, orderItems.ticketTypeId, orderItems.eventId],
    }),
    foreignKey({
      name: 'order_item_lots_lot_fk',
      columns: [t.lotId, t.ticketTypeId],
      foreignColumns: [ticketLots.id, ticketLots.ticketTypeId],
    }),
    uniqueIndex('order_item_lots_item_lot_key').on(t.orderItemId, t.lotId),
    index('order_item_lots_lot_idx').on(t.lotId),
    index('order_item_lots_order_idx').on(t.orderId),
    check('order_item_lots_quantity_positive', sql`${t.quantity} > 0`),
    check('order_item_lots_price_positive', sql`${t.unitPriceCents} > 0`),
    check('order_item_lots_service_fee_nonnegative', sql`${t.unitServiceFeeCents} >= 0`),
    check('order_item_lots_discount_valid', sql`${t.unitDiscountCents} >= 0 and ${t.unitDiscountCents} <= ${t.unitPriceCents}`),
  ],
);

/** Reserva temporária ao iniciar o pagamento (RF-33). Não é venda: a venda é o ingresso emitido. */
export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    ticketTypeId: uuid('ticket_type_id').notNull(),
    quantity: integer('quantity').notNull(),
    expiresAt: instant('expires_at').notNull(),
    status: reservationStatus('status').notNull().default('ativa'),
    createdAt: createdAt(),
    releasedAt: instant('released_at'),
  },
  t => [
    foreignKey({
      name: 'reservations_order_item_fk',
      columns: [t.orderId, t.ticketTypeId],
      foreignColumns: [orderItems.orderId, orderItems.ticketTypeId],
    }),
    uniqueIndex('reservations_order_type_key').on(t.orderId, t.ticketTypeId),
    index('reservations_active_idx')
      .on(t.ticketTypeId, t.expiresAt)
      .where(sql`${t.status} = 'ativa'`),
    check('reservations_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

/**
 * Um registro por unidade comprada (RF-38). Nunca é apagado: cancelado e estornado ficam no histórico.
 * A emissão é idempotente: `(order_item_id, unit_index)` é único, então reprocessar o pagamento não duplica.
 */
export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderItemId: uuid('order_item_id').notNull(),
    orderId: uuid('order_id').notNull(),
    ticketTypeId: uuid('ticket_type_id').notNull(),
    eventId: uuid('event_id').notNull(),
    /** Posição da unidade dentro do item (1 a quantidade). */
    unitIndex: smallint('unit_index').notNull(),
    /** Nome do titular atual: o do comprador na emissão; numa transferência (D-87, 0016), o de quem recebeu. */
    holderName: text('holder_name').notNull(),
    /**
     * Conta do titular atual (D-87, 0016): o comprador na emissão (gatilho `tickets_holder_default`, também para o código anterior
     * à 0016) e quem recebeu, depois de uma transferência. "Meus ingressos", a portaria e a contingência olham esta conta; o pedido,
     * o pagamento e o reembolso continuam do comprador (`orders.user_id`).
     */
    holderUserId: uuid('holder_user_id')
      .notNull()
      .references(() => users.id),
    /** Titular de 16 ou 17 anos na data do evento (D-87). Nulo: vale `orders.buyer_minor`, como antes das transferências. */
    holderMinor: boolean('holder_minor'),
    /** Segredo aleatório de pelo menos 128 bits (22 caracteres base64url). Nunca exibir em listas. */
    code: text('code').notNull(),
    /** Código curto legível (PX-7K4M-2Q9D) para exibir e buscar na portaria. Não é credencial: validar exige o QR. */
    shortCode: varchar('short_code', { length: 12 }).notNull(),
    /** Conteúdo do QR, assinado com HMAC. */
    qrPayload: text('qr_payload').notNull(),
    /** Versão da chave HMAC, para rotação sem invalidar ingressos emitidos. */
    qrKeyVersion: smallint('qr_key_version').notNull().default(1),
    status: ticketStatus('status').notNull().default('valido'),
    issuedAt: instant('issued_at').notNull().defaultNow(),
    usedAt: instant('used_at'),
    validatedBy: uuid('validated_by').references(() => users.id),
    cancelledAt: instant('cancelled_at'),
    cancelReason: text('cancel_reason'),
    /** Lote de onde a unidade saiu (0013). Nulo só em ingresso emitido por uma versão anterior aos lotes. */
    lotId: uuid('lot_id'),
  },
  t => [
    foreignKey({
      name: 'tickets_order_item_fk',
      columns: [t.orderItemId, t.orderId, t.ticketTypeId, t.eventId],
      foreignColumns: [orderItems.id, orderItems.orderId, orderItems.ticketTypeId, orderItems.eventId],
    }),
    uniqueIndex('tickets_code_key').on(t.code),
    uniqueIndex('tickets_short_code_key').on(t.shortCode),
    uniqueIndex('tickets_item_unit_key').on(t.orderItemId, t.unitIndex),
    index('tickets_order_idx').on(t.orderId),
    index('tickets_holder_idx').on(t.holderUserId, t.eventId),
    index('tickets_event_status_idx').on(t.eventId, t.status),
    index('tickets_type_idx').on(t.ticketTypeId),
    foreignKey({
      name: 'tickets_lot_fk',
      columns: [t.lotId, t.ticketTypeId],
      foreignColumns: [ticketLots.id, ticketLots.ticketTypeId],
    }),
    check('tickets_code_strength', sql`length(${t.code}) >= 22 and ${t.code} ~ '^[A-Za-z0-9_-]+$'`),
    check('tickets_short_code_format', sql`${t.shortCode} ~ '^PX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'`),
    check('tickets_unit_index_positive', sql`${t.unitIndex} > 0`),
    check('tickets_holder_not_blank', sql`length(btrim(${t.holderName})) > 0`),
    check(
      'tickets_used_has_usage',
      sql`${t.status} <> 'utilizado' or (${t.usedAt} is not null and ${t.validatedBy} is not null)`,
    ),
    check('tickets_cancelled_has_time', sql`${t.status} <> 'cancelado' or ${t.cancelledAt} is not null`),
    check('tickets_valid_is_clean', sql`${t.status} <> 'valido' or (${t.usedAt} is null and ${t.cancelledAt} is null)`),
  ],
);

/**
 * Aceite do Termo de Ciência para Menores de Idade (0009): quem terá 16 ou 17 anos na data do evento aceita o termo no checkout, e o
 * aceite fica ligado ao pedido, com a versão, a data, o IP e o navegador, como o aceite dos Termos. Um por pedido. Nunca apagado (é
 * prova); a anonimização limpa só o IP e o navegador.
 */
export const minorTermAcceptances = pgTable(
  'minor_term_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    termVersion: text('term_version').notNull(),
    /** Idade na data do evento, quando aceitou: 16 ou 17. */
    ageAtEvent: smallint('age_at_event').notNull(),
    acceptedAt: instant('accepted_at').notNull().defaultNow(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  t => [
    uniqueIndex('minor_term_acceptances_order_key').on(t.orderId),
    index('minor_term_acceptances_user_idx').on(t.userId),
    check('minor_term_acceptances_age', sql`${t.ageAtEvent} in (16, 17)`),
  ],
);

/**
 * Transferências de ingresso (D-87, 0016): cada troca de titular é uma linha, que nunca muda nem é apagada (gatilhos). Desfazer, pelo
 * administrador em caso de fraude, é uma linha nova que aponta para a desfeita (`reverts_id`) e tem motivo. Guarda os códigos curtos
 * (que não são credencial) e só o resumo SHA-256 do código antigo (hexadecimal), para a portaria reconhecer o QR antigo sem guardar o segredo.
 */
export const ticketTransfers = pgTable(
  'ticket_transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    fromUserId: uuid('from_user_id')
      .notNull()
      .references(() => users.id),
    toUserId: uuid('to_user_id')
      .notNull()
      .references(() => users.id),
    /** Quem fez: o titular, ou o administrador que desfez. */
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    /** Preenchido só no desfazer: a transferência desfeita. */
    revertsId: uuid('reverts_id').references((): AnyPgColumn => ticketTransfers.id),
    /** Motivo do desfazer (obrigatório nele, 5 a 500 caracteres); nulo na transferência do titular. */
    reason: text('reason'),
    oldShortCode: varchar('old_short_code', { length: 12 }).notNull(),
    newShortCode: varchar('new_short_code', { length: 12 }).notNull(),
    /** SHA-256 do código antigo, em hexadecimal minúsculo. */
    oldCodeSha256: varchar('old_code_sha256', { length: 64 }).notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  t => [
    index('ticket_transfers_ticket_idx').on(t.ticketId, t.createdAt),
    index('ticket_transfers_to_idx').on(t.toUserId),
    index('ticket_transfers_from_idx').on(t.fromUserId),
    index('ticket_transfers_old_code_idx').on(t.oldCodeSha256),
    uniqueIndex('ticket_transfers_reverts_key')
      .on(t.revertsId)
      .where(sql`${t.revertsId} is not null`),
    check('ticket_transfers_other_account', sql`${t.fromUserId} <> ${t.toUserId}`),
    check('ticket_transfers_reason_on_revert', sql`(${t.revertsId} is null) = (${t.reason} is null)`),
    check(
      'ticket_transfers_reason_length',
      sql`${t.reason} is null or char_length(btrim(${t.reason})) between 5 and 500`,
    ),
    check('ticket_transfers_sha256', sql`${t.oldCodeSha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

/**
 * Termo de Ciência aceito por quem recebeu, numa transferência, um ingresso com 16 ou 17 anos na data do evento (D-87, 0016). O de
 * `minor_term_acceptances` é por pedido, de quem comprou. Um por transferência. Nunca apagado (prova); a anonimização limpa só o IP
 * e o navegador.
 */
export const ticketMinorAcceptances = pgTable(
  'ticket_minor_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    ticketTransferId: uuid('ticket_transfer_id')
      .notNull()
      .references(() => ticketTransfers.id),
    termVersion: text('term_version').notNull(),
    ageAtEvent: smallint('age_at_event').notNull(),
    acceptedAt: instant('accepted_at').notNull().defaultNow(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  t => [
    uniqueIndex('ticket_minor_acceptances_transfer_key').on(t.ticketTransferId),
    index('ticket_minor_acceptances_user_idx').on(t.userId),
    check('ticket_minor_acceptances_age', sql`${t.ageAtEvent} in (16, 17)`),
  ],
);

/**
 * Aceite da Política de Cancelamento, Troca e Reembolso no checkout (D-80 atualizada, 0016): versão, data, IP e navegador, ligado ao
 * pedido. Um por pedido. Nunca apagado (prova); a anonimização limpa só o IP e o navegador.
 */
export const cancellationAcceptances = pgTable(
  'cancellation_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    policyVersion: text('policy_version').notNull(),
    acceptedAt: instant('accepted_at').notNull().defaultNow(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  t => [
    uniqueIndex('cancellation_acceptances_order_key').on(t.orderId),
    index('cancellation_acceptances_user_idx').on(t.userId),
  ],
);
