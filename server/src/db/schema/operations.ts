import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant } from './columns';
import { checkinMethod, checkinResult, emailStatus, emailTemplate } from './enums';
import { events } from './events';
import { orders, tickets } from './sales';
import { users } from './users';

/**
 * Cada tentativa de validação na portaria (RF-51). Guarda também as recusadas.
 * Índice único parcial: **no máximo uma entrada válida por ingresso**, garantida pelo banco (CA-25).
 */
export const checkins = pgTable(
  'checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Nulo quando o código não corresponde a nenhum ingresso. */
    ticketId: uuid('ticket_id').references(() => tickets.id),
    /** Evento em que o validador está trabalhando. */
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    validatorId: uuid('validator_id')
      .notNull()
      .references(() => users.id),
    result: checkinResult('result').notNull(),
    method: checkinMethod('method').notNull(),
    /** Trecho do código apresentado, só para tentativas sem ingresso. Limitado a 64 caracteres. */
    codePresented: text('code_presented'),
    createdAt: createdAt(),
  },
  t => [
    uniqueIndex('checkins_one_valid_per_ticket_key')
      .on(t.ticketId)
      .where(sql`${t.result} = 'valido'`),
    index('checkins_event_created_idx').on(t.eventId, t.createdAt),
    index('checkins_ticket_idx').on(t.ticketId),
    index('checkins_validator_idx').on(t.validatorId, t.createdAt),
    check('checkins_ticket_required', sql`${t.result} not in ('valido', 'ja_utilizado') or ${t.ticketId} is not null`),
    check('checkins_code_presented_length', sql`${t.codePresented} is null or length(${t.codePresented}) <= 64`),
  ],
);

/**
 * Notificações do gateway, para idempotência e auditoria (seção 6.2).
 * `gateway_event_id` é único **só entre eventos com assinatura válida**: um evento forjado não pode
 * "ocupar" o identificador de um evento real. Eventos com assinatura inválida são registrados e nunca processados (CA-P4).
 */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gatewayEventId: text('gateway_event_id'),
    signatureValid: boolean('signature_valid').notNull(),
    orderId: uuid('order_id').references(() => orders.id),
    type: text('type').notNull(),
    /** Só metadados seguros. Nunca dados de cartão. */
    payloadJson: jsonb('payload_json').notNull(),
    receivedAt: instant('received_at').notNull().defaultNow(),
    processedAt: instant('processed_at'),
    attempts: integer('attempts').notNull().default(0),
    processingError: text('processing_error'),
  },
  t => [
    uniqueIndex('payment_events_gateway_event_key')
      .on(t.gatewayEventId)
      .where(sql`${t.signatureValid} and ${t.gatewayEventId} is not null`),
    index('payment_events_order_idx').on(t.orderId),
    index('payment_events_pending_idx')
      .on(t.receivedAt)
      .where(sql`${t.signatureValid} and ${t.processedAt} is null`),
    check('payment_events_invalid_never_processed', sql`${t.signatureValid} or ${t.processedAt} is null`),
  ],
);

/**
 * E-mails transacionais e fila de envio. Serve de **outbox**: a falha no envio não desfaz o pagamento
 * e o reenvio é idempotente pela `idempotency_key` (ex.: `compra:<id do pedido>`).
 */
export const emailLog = pgTable(
  'email_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    orderId: uuid('order_id').references(() => orders.id),
    template: emailTemplate('template').notNull(),
    status: emailStatus('status').notNull().default('pendente'),
    idempotencyKey: text('idempotency_key').notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: instant('next_attempt_at').notNull().defaultNow(),
    /** Mensagem já sem dados pessoais. */
    lastError: text('last_error'),
    sentAt: instant('sent_at'),
    createdAt: createdAt(),
  },
  t => [
    uniqueIndex('email_log_idempotency_key').on(t.idempotencyKey),
    index('email_log_due_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pendente'`),
    index('email_log_user_idx').on(t.userId),
    index('email_log_order_idx').on(t.orderId),
    check('email_log_sent_has_time', sql`${t.status} <> 'enviado' or ${t.sentAt} is not null`),
  ],
);

/** Ações administrativas: cancelamentos, edições, permissões. Só inclui (trigger impede alterar e apagar). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Nulo para ações do sistema (webhook, rotina agendada). */
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id'),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  t => [
    index('audit_log_entity_idx').on(t.entity, t.entityId),
    index('audit_log_actor_idx').on(t.actorId, t.createdAt),
    index('audit_log_created_idx').on(t.createdAt),
  ],
);

/**
 * Contadores dos limites GLOBAIS (cadastros e pedidos de recuperação de senha por hora, no total). No banco porque há várias instâncias
 * do Cloud Run e porque o limite não pode depender de IP. Janela deslizante de 60 minutos feita de baldes de 10 minutos: `bucket` é o
 * início do balde; `alerted_at` marca o balde em que o alerta de limite atingido já foi dado (um alerta por balde, não um por requisição).
 * Tabela técnica (fora das 14 da documentação). Cresce 6 linhas por hora por tipo; sem dado pessoal.
 */
export const globalLimitCounters = pgTable(
  'global_limit_counters',
  {
    kind: text('kind').notNull(),
    bucket: instant('bucket').notNull(),
    count: integer('count').notNull().default(0),
    alertedAt: instant('alerted_at'),
  },
  t => [
    primaryKey({ columns: [t.kind, t.bucket] }),
    check('global_limit_counters_count_nonneg', sql`${t.count} >= 0`),
  ],
);
