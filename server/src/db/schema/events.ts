import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
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
import { eventStatus, lotCloseReason, lotLeftover, lotStatus } from './enums';

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
    /**
     * Miniatura da capa (0015, 15/10/2026): WebP de 32 px de largura em `data:` (poucas centenas de bytes), gerada no envio. A página
     * mostra a miniatura desfocada na hora e troca pela capa nítida quando ela chega ("blur-up"). Nula: sem capa, ou capa anterior.
     */
    bannerPlaceholder: text('banner_placeholder'),
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
    /** Cronômetro regressivo na página do evento até o início (0012, 15/10/2026). Ligado por padrão. */
    countdownEnabled: boolean('countdown_enabled').notNull().default(true),
    /** Frase acima do título durante a contagem. Nula: a padrão ("Falta pouco para"). Até 40 caracteres, só texto (sem < nem >). */
    countdownPhrase: text('countdown_phrase'),
    /**
     * Cor de destaque da página do evento (0014, 15/10/2026), só `#RRGGBB` em maiúsculas. Nula: o roxo da PartyX. A página deriva dela
     * os tons legíveis (texto, links, linhas, foco) e aplica por variável CSS; nunca entra em CSS como texto livre.
     */
    accentColor: text('accent_color'),
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
    check('events_accent_color_format', sql`${t.accentColor} is null or ${t.accentColor} ~ '^#[0-9A-F]{6}$'`),
    check(
      'events_banner_placeholder_format',
      // O ";" do prefixo vai como chr(59): o gerador de migrações do Drizzle corta o texto num ";" literal.
      sql`${t.bannerPlaceholder} is null or (${t.bannerUrl} is not null and char_length(${t.bannerPlaceholder}) <= 1500 and starts_with(${t.bannerPlaceholder}, 'data:image/webp' || chr(59) || 'base64,') and substr(${t.bannerPlaceholder}, 24) ~ '^[A-Za-z0-9+/]+={0,2}$')`,
    ),
    check(
      'events_countdown_phrase_format',
      sql`${t.countdownPhrase} is null or (char_length(${t.countdownPhrase}) between 1 and 40 and ${t.countdownPhrase} !~ '[<>]')`,
    ),
  ],
);

/**
 * Pista, VIP, Camarote e outros. Cada tipo vende em lotes (`ticket_lots`, 0013): o preço mora no lote à venda (espelhado aqui) e a
 * capacidade do tipo é o teto da soma dos lotes.
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
    /** Mostra "Últimas unidades deste lote" na página do evento quando falta pouco no lote à venda (0013). */
    lastUnitsNotice: boolean('last_units_notice').notNull().default(true),
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

/**
 * Lotes de um tipo de ingresso (0013, 15/10/2026), em ordem (`position`: 1º, 2º...). Cada um com nome, preço, quantidade e, se quiser,
 * início e fim. Só um fica à venda por vez em cada tipo; a virada é automática (esgotou, com próximo lote, ou passou o fim) ou manual no
 * painel, e nunca volta atrás. A capacidade do tipo (`ticket_types.quantity_total`) continua sendo o teto, conferida como antes.
 *
 * Capacidade do lote = `quantity` + `carried_in` (recebido: sobra de lotes anteriores e reservas vencidas de lote encerrado)
 * - `passed_out` (passado adiante) - `discarded` (descartado na virada). `quantity_sold` sobe na confirmação do pagamento, como o do
 * tipo. Mudança de lote só com a linha do tipo trancada (`FOR UPDATE`), a mesma trava da compra e da confirmação.
 */
export const ticketLots = pgTable(
  'ticket_lots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketTypeId: uuid('ticket_type_id').notNull(),
    eventId: uuid('event_id').notNull(),
    position: smallint('position').notNull(),
    name: text('name').notNull(),
    /** Centavos. Preso ao pedido no momento da reserva (`order_item_lots.unit_price_cents`). */
    priceCents: integer('price_cents').notNull(),
    quantity: integer('quantity').notNull(),
    carriedIn: integer('carried_in').notNull().default(0),
    passedOut: integer('passed_out').notNull().default(0),
    discarded: integer('discarded').notNull().default(0),
    quantitySold: integer('quantity_sold').notNull().default(0),
    salesStartAt: instant('sales_start_at'),
    salesEndAt: instant('sales_end_at'),
    leftoverPolicy: lotLeftover('leftover_policy').notNull().default('passar'),
    status: lotStatus('status').notNull().default('aguardando'),
    closedAt: instant('closed_at'),
    closeReason: lotCloseReason('close_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    foreignKey({
      name: 'ticket_lots_type_fk',
      columns: [t.ticketTypeId, t.eventId],
      foreignColumns: [ticketTypes.id, ticketTypes.eventId],
    }),
    uniqueIndex('ticket_lots_type_position_key').on(t.ticketTypeId, t.position),
    // Alvo das chaves compostas que impedem lote de outro tipo no item do pedido e no ingresso.
    unique('ticket_lots_id_type_key').on(t.id, t.ticketTypeId),
    uniqueIndex('ticket_lots_one_on_sale')
      .on(t.ticketTypeId)
      .where(sql`${t.status} = 'a_venda'`),
    check('ticket_lots_position_positive', sql`${t.position} > 0`),
    check('ticket_lots_name_not_blank', sql`length(btrim(${t.name})) > 0`),
    check('ticket_lots_price_positive', sql`${t.priceCents} > 0`),
    check('ticket_lots_quantity_positive', sql`${t.quantity} > 0`),
    check(
      'ticket_lots_counters',
      sql`${t.carriedIn} >= 0 and ${t.passedOut} >= 0 and ${t.discarded} >= 0 and ${t.quantitySold} >= 0`,
    ),
    check(
      'ticket_lots_sales_window',
      sql`${t.salesEndAt} is null or ${t.salesStartAt} is null or ${t.salesEndAt} > ${t.salesStartAt}`,
    ),
    check(
      'ticket_lots_closed_has_time',
      sql`(${t.status} = 'encerrado') = (${t.closedAt} is not null and ${t.closeReason} is not null)`,
    ),
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
