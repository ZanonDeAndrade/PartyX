import { sql } from 'drizzle-orm';
import { boolean, check, date, index, inet, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, instant, updatedAt } from './columns';
import { userRole } from './enums';

/** Todos os logins: cliente, validador e administrador. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Sempre minúsculo (a aplicação normaliza; o banco confere). */
    email: text('email').notNull(),
    /** Só dígitos. Obrigatório para cliente; equipe pode não ter. */
    cpf: varchar('cpf', { length: 11 }),
    phone: text('phone'),
    /**
     * Data de nascimento (AAAA-MM-DD), obrigatória no cadastro desde a 0009 (regras de menores). Nula em contas anteriores: é pedida no
     * próximo checkout. Depois de gravada, só a PartyX altera (como o CPF). A idade que vale é a da DATA DO EVENTO.
     */
    birthDate: date('birth_date', { mode: 'string' }),
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    /** Primeiro acesso com senha temporária (ADM22). */
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastLoginAt: instant('last_login_at'),
    /** Preenchido quando os dados pessoais foram removidos a pedido da PartyX (LGPD). O registro fica, para o histórico de pedidos e ingressos. */
    anonymizedAt: instant('anonymized_at'),
  },
  t => [
    uniqueIndex('users_email_key').on(t.email),
    uniqueIndex('users_cpf_key')
      .on(t.cpf)
      .where(sql`${t.cpf} is not null`),
    index('users_role_idx').on(t.role),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('users_email_format', sql`${t.email} ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'`),
    check('users_cpf_format', sql`${t.cpf} is null or ${t.cpf} ~ '^[0-9]{11}$'`),
    check(
      'users_cliente_has_cpf',
      sql`${t.role} <> 'cliente' or ${t.cpf} is not null or ${t.anonymizedAt} is not null`,
    ),
    // Só o piso: o teto (não pode ser futura, mínimo de 16 anos) depende do dia de hoje e fica na aplicação.
    check('users_birth_date_range', sql`${t.birthDate} is null or ${t.birthDate} >= date '1900-01-01'`),
  ],
);

/** Tokens de recuperação de senha. Guarda só o hash; uso único e validade de 1 hora (RF-05). */
export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: instant('expires_at').notNull(),
    usedAt: instant('used_at'),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('password_resets_token_hash_key').on(t.tokenHash), index('password_resets_user_idx').on(t.userId)],
);

/** Aceite dos Termos e da Política de Privacidade, com versão, data e IP (RF-03). */
export const consents = pgTable(
  'consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    termsVersion: text('terms_version').notNull(),
    privacyVersion: text('privacy_version').notNull(),
    acceptedAt: instant('accepted_at').notNull().defaultNow(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  t => [index('consents_user_idx').on(t.userId)],
);

/**
 * Sessões no servidor. Tabela técnica (fora das 14 da documentação): com várias instâncias do
 * Cloud Run não dá para guardar sessão em memória, e desativar um usuário precisa revogar as
 * sessões dele (RF-08, CA-06). Guarda só o hash do token.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    createdAt: createdAt(),
    lastSeenAt: instant('last_seen_at').notNull().defaultNow(),
    expiresAt: instant('expires_at').notNull(),
    revokedAt: instant('revoked_at'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  t => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

/**
 * Tentativas de login. Tabela técnica: o limite de tentativas (RF-10) precisa valer entre
 * instâncias. Sem CPF, senha ou token; só e-mail normalizado e IP.
 */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emailNormalized: text('email_normalized').notNull(),
    ip: inet('ip'),
    succeeded: boolean('succeeded').notNull(),
    createdAt: createdAt(),
  },
  t => [
    index('login_attempts_email_idx').on(t.emailNormalized, t.createdAt),
    index('login_attempts_ip_idx').on(t.ip, t.createdAt),
  ],
);
