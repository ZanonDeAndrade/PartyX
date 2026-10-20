import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, instant, updatedAt } from './columns';
import { eventAccessOrigin, eventAccessStatus } from './enums';
import { events } from './events';
import { users } from './users';

/**
 * Lista de autorizados de um evento privado (D-92, 0019). Cada linha é uma pessoa: cadastrada pelo painel (por e-mail, CPF ou os dois,
 * antes ou depois de ter conta) ou uma solicitação feita pela conta na página do evento (só a conta; e-mail e CPF vêm dela).
 *
 * A linha vale para uma conta quando bate a conta, o e-mail da conta ou o CPF da conta; com mais de uma linha, autorizada vale antes de
 * pendente e pendente antes de recusada (`domain/eventAccess.ts`). Os dados servem só ao controle de acesso e são apagados 6 meses
 * depois do evento pela limpeza diária (`privacy/retention.ts`); apagar o evento sem uso (0011) leva a lista junto.
 */
export const eventAccess = pgTable(
  'event_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** Conta que pediu (solicitação). Nas linhas do painel fica nula: a conta é achada pelo e-mail ou pelo CPF. */
    userId: uuid('user_id').references(() => users.id),
    /** E-mail em minúsculas, sem espaços. */
    emailNormalized: text('email_normalized'),
    /** CPF só com os 11 dígitos. Nunca aparece inteiro em tela, exportação ou trilha. */
    cpf: varchar('cpf', { length: 11 }),
    /** Nome opcional, para o painel reconhecer a pessoa antes de ela ter conta. */
    name: text('name'),
    status: eventAccessStatus('status').notNull(),
    origin: eventAccessOrigin('origin').notNull(),
    /** Observação opcional da aprovação ou da recusa: não aparece na página do evento, mas entra na cópia dos dados do titular. */
    note: text('note'),
    decidedAt: instant('decided_at'),
    decidedBy: uuid('decided_by').references(() => users.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    uniqueIndex('event_access_email_key')
      .on(t.eventId, t.emailNormalized)
      .where(sql`${t.emailNormalized} is not null`),
    uniqueIndex('event_access_cpf_key')
      .on(t.eventId, t.cpf)
      .where(sql`${t.cpf} is not null`),
    // Uma solicitação por conta por evento.
    uniqueIndex('event_access_user_key')
      .on(t.eventId, t.userId)
      .where(sql`${t.userId} is not null`),
    index('event_access_user_idx').on(t.userId),
    index('event_access_pending_idx')
      .on(t.createdAt)
      .where(sql`${t.status} = 'pendente'`),
    check('event_access_identifies', sql`num_nonnulls(${t.userId}, ${t.emailNormalized}, ${t.cpf}) >= 1`),
    check('event_access_request_has_user', sql`${t.origin} <> 'solicitacao' or ${t.userId} is not null`),
    check(
      'event_access_email_format',
      sql`${t.emailNormalized} is null or (${t.emailNormalized} = lower(btrim(${t.emailNormalized})) and position('@' in ${t.emailNormalized}) > 1 and char_length(${t.emailNormalized}) <= 254)`,
    ),
    check('event_access_cpf_format', sql`${t.cpf} is null or ${t.cpf} ~ '^[0-9]{11}$'`),
    check('event_access_name_length', sql`${t.name} is null or char_length(${t.name}) between 1 and 120`),
    check('event_access_note_length', sql`${t.note} is null or char_length(${t.note}) between 1 and 500`),
    check('event_access_decided_has_time', sql`${t.status} = 'pendente' or ${t.decidedAt} is not null`),
  ],
);
