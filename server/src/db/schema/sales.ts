import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
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
import { orderStatus, paymentMethod, reservationStatus, ticketStatus } from './enums';
import { events, promoters, ticketTypes } from './events';
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
    /** Só atribui a venda ao promoter. Não altera o total. */
    promoterId: uuid('promoter_id').references(() => promoters.id),
    totalCents: integer('total_cents').notNull(),
    status: orderStatus('status').notNull().default('pendente'),
    /** Nulo até o comprador escolher a forma de pagamento. */
    paymentMethod: paymentMethod('payment_method'),
    gatewayPaymentId: text('gateway_payment_id'),
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
    /** Nome do comprador, em todas as unidades. Não há transferência de titularidade. */
    holderName: text('holder_name').notNull(),
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
    index('tickets_event_status_idx').on(t.eventId, t.status),
    index('tickets_type_idx').on(t.ticketTypeId),
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
