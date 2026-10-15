import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, updatedAt } from './columns';
import { eventStatus } from './enums';

/**
 * Eventos. O ciclo é rascunho, publicado e encerrado. Só o evento SEM uso (nenhum pedido, em qualquer situação, e nenhuma leitura de
 * portaria) pode ser apagado, junto com os tipos dele (0011; o gatilho `events_delete_only_unused` e as chaves estrangeiras conferem
 * de novo). O evento com uso é arquivado (`archived_at`), nunca apagado.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Endereço amigável: /eventos/:slug (RF-27). */
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    startsAt: instant('starts_at').notNull(),
    /** Fim previsto (vai na autorização de menor). Obrigatório quando o evento permite menores. */
    endsAt: instant('ends_at'),
    /**
     * Permite a entrada de quem terá 16 ou 17 anos na data do evento, com o termo de autorização (0009). Falso: quem tiver menos de 18
     * na data do evento não compra.
     */
    allowsMinors: boolean('allows_minors').notNull().default(false),
    /**
     * SEM USO desde 14/10/2026 (D-85 revista: a autorização judicial saiu do sistema). A 0010 tirou a exigência; a coluna ficou para
     * não apagar dado já gravado e para a reversão ser simples. Nada lê nem grava esta coluna.
     */
    judicialAuthorization: text('judicial_authorization'),
    venue: text('venue').notNull(),
    address: text('address').notNull(),
    description: text('description').notNull(),
    attractions: text('attractions')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ageRating: text('age_rating').notNull(),
    bannerUrl: text('banner_url'),
    /**
     * Larguras (px) em que o banner existe, da menor à maior; a maior é a de `banner_url` e as outras ficam ao lado,
     * como `<hash>-w640.webp`. Vazio: banner anterior às versões menores (o site usa só `banner_url`).
     */
    bannerWidths: smallint('banner_widths')
      .array()
      .notNull()
      .default(sql`'{}'::smallint[]`),
    status: eventStatus('status').notNull().default('rascunho'),
    isFeatured: boolean('is_featured').notNull().default(false),
    /**
     * Quando o evento foi encerrado (D-79). A portaria só abre um evento encerrado se ele foi encerrado dentro da janela operacional;
     * encerrado antes dela é cancelamento antecipado e fica fechado. Nulo enquanto não encerrado (e em linhas encerradas por uma
     * versão anterior do código, quando então vale `updated_at`, porque evento encerrado não aceita mais alteração).
     */
    closedAt: instant('closed_at'),
    /**
     * Arquivado pelo administrador (0011): some da vitrine, da busca, do link público e da lista padrão do painel, e não aceita compra
     * nova. Pedidos, ingressos, portaria, relatórios e exportações continuam como estão. Nulo: não arquivado. Pode ser desfeito.
     */
    archivedAt: instant('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    uniqueIndex('events_slug_key').on(t.slug),
    index('events_status_starts_idx').on(t.status, t.startsAt),
    check('events_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('events_name_not_blank', sql`length(btrim(${t.name})) > 0`),
    check('events_ends_after_start', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    // Quem permite menores precisa do horário de fim (vai na autorização). Desde a 0010, sem exigir a autorização judicial.
    check('events_minors_need_end', sql`not ${t.allowsMinors} or ${t.endsAt} is not null`),
  ],
);

/**
 * Pista, VIP, Camarote e outros. Lotes são tipos com nome e período próprios (sem virada automática).
 * `quantity_sold` só muda dentro de transação com bloqueio de linha (seção 6.2).
 */
export const ticketTypes = pgTable(
  'ticket_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    name: text('name').notNull(),
    /** Centavos. Zero é proibido: ingresso gratuito e cortesia estão fora do escopo. */
    priceCents: integer('price_cents').notNull(),
    quantityTotal: integer('quantity_total').notNull(),
    quantitySold: integer('quantity_sold').notNull().default(0),
    salesStartAt: instant('sales_start_at').notNull(),
    salesEndAt: instant('sales_end_at').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    uniqueIndex('ticket_types_event_name_key').on(t.eventId, t.name),
    // Alvo das chaves estrangeiras compostas que impedem item de outro evento.
    unique('ticket_types_id_event_key').on(t.id, t.eventId),
    index('ticket_types_event_active_idx').on(t.eventId, t.isActive),
    check('ticket_types_price_positive', sql`${t.priceCents} > 0`),
    check('ticket_types_total_positive', sql`${t.quantityTotal} > 0`),
    check('ticket_types_sold_in_range', sql`${t.quantitySold} >= 0 and ${t.quantitySold} <= ${t.quantityTotal}`),
    check('ticket_types_sales_window', sql`${t.salesEndAt} > ${t.salesStartAt}`),
    check('ticket_types_name_not_blank', sql`length(btrim(${t.name})) > 0`),
  ],
);

/** Promoters com código exclusivo. O código só atribui a venda: sem desconto e sem comissão. */
export const promoters = pgTable(
  'promoters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** De 3 a 20 letras maiúsculas sem acento ou números. */
    couponCode: text('coupon_code').notNull(),
    phone: text('phone'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  t => [
    uniqueIndex('promoters_coupon_code_key').on(t.couponCode),
    check('promoters_coupon_code_format', sql`${t.couponCode} ~ '^[A-Z0-9]{3,20}$'`),
  ],
);
