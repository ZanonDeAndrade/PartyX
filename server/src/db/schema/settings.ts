import { sql } from 'drizzle-orm';
import { check, integer, pgTable, smallint, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, updatedAt } from './columns';
import { paymentMethod } from './enums';
import { users } from './users';

/**
 * Taxa de serviço da PartyX (D-90, 18/10/2026): uma linha só, editada no painel (Configurações). Porcentagem em centésimos de ponto
 * percentual (500 = 5%) e mínimo em centavos, a mesma para Pix e cartão. Vale para pedidos NOVOS: cada pedido guarda a taxa, a
 * porcentagem e o mínimo usados (`orders.service_fee_*`), então mudar aqui não altera pedido já feito. Sem DELETE para o partyx_app.
 */
export const serviceFeeSettings = pgTable(
  'service_fee_settings',
  {
    id: smallint('id').primaryKey().default(1),
    rateBps: integer('rate_bps').notNull().default(0),
    minCents: integer('min_cents').notNull().default(0),
    /** Quem mudou por último (nulo: valor gravado pela migração). */
    updatedBy: uuid('updated_by').references(() => users.id),
    updatedAt: updatedAt(),
  },
  t => [
    check('service_fee_settings_single_row', sql`${t.id} = 1`),
    check('service_fee_settings_rate_range', sql`${t.rateBps} between 0 and 2000`),
    check('service_fee_settings_min_range', sql`${t.minCents} between 0 and 5000`),
  ],
);

/**
 * Regra da taxa da contratada por ingresso (Cl. 6.3 do contrato; D-93, aditivo de 21/10/2026). Cada linha vale para os pedidos com
 * `paid_at` a partir de `effective_from` até a linha seguinte: `per_ticket_cents` por ingresso emitido, só dos pedidos cuja forma de
 * pagamento está em `methods` (nulo: qualquer forma, inclusive não informada). Só inclusão, e nunca num mês já fechado (gatilhos da
 * 0020): mudar o contrato é gravar uma linha nova, sem código. O partyx_app só lê; a migração grava a regra original e a da D-93.
 */
export const contractFeeRules = pgTable(
  'contract_fee_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    effectiveFrom: instant('effective_from').notNull(),
    perTicketCents: integer('per_ticket_cents').notNull(),
    methods: paymentMethod('methods').array(),
    /** De onde vem a regra, mostrado no aviso do relatório (ex.: "Aditivo ao contrato de 21/10/2026, D-93"). */
    reference: text('reference').notNull(),
    createdAt: createdAt(),
  },
  t => [
    uniqueIndex('contract_fee_rules_effective_from_key').on(t.effectiveFrom),
    check('contract_fee_rules_per_ticket_range', sql`${t.perTicketCents} between 0 and 10000`),
    check('contract_fee_rules_methods_not_empty', sql`${t.methods} is null or cardinality(${t.methods}) >= 1`),
    check('contract_fee_rules_reference_length', sql`char_length(${t.reference}) between 1 and 160`),
  ],
);
