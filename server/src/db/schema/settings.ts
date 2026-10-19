import { sql } from 'drizzle-orm';
import { check, integer, pgTable, smallint, uuid } from 'drizzle-orm/pg-core';
import { updatedAt } from './columns';
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
