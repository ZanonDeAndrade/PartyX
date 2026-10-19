import { and, countDistinct, eq, gt, isNull, lt, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { writeAudit, type Tx } from '../db/audit';
import { events, serviceFeeSettings, ticketTypes, users } from '../db/schema';
import { AppError } from '../domain/errors';
import { NO_SERVICE_FEE, validServiceFeeRule, type ServiceFeeRule } from '../domain/serviceFee';
import type { Clock } from '../providers/clock';

/** Configuração da taxa de serviço (D-90), linha única de `service_fee_settings`. */
export interface ServiceFeeSettings extends ServiceFeeRule {
  updatedAt: string;
  updatedBy: string | null;
  /** Eventos à venda neste instante (ver `countEventsOnSale`): o painel avisa que a mudança vale só para pedidos novos. */
  eventsOnSale: number;
}

/**
 * Quantos eventos estão à venda agora: publicados, não arquivados, com algum tipo ativo dentro do período de venda e com unidade por
 * vender. Serve ao aviso do painel ao mudar a taxa (vale só para pedidos novos a partir daquele momento) e fica na trilha da mudança.
 */
export async function countEventsOnSale(db: Db | Tx, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: countDistinct(events.id) })
    .from(events)
    .innerJoin(ticketTypes, eq(ticketTypes.eventId, events.id))
    .where(
      and(
        eq(events.status, 'publicado'),
        isNull(events.archivedAt),
        eq(ticketTypes.isActive, true),
        lte(ticketTypes.salesStartAt, now),
        gt(ticketTypes.salesEndAt, now),
        lt(ticketTypes.quantitySold, ticketTypes.quantityTotal),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Regra em vigor. Dentro da transação do pedido, quem chama passa `tx`: o pedido grava a taxa lida no mesmo instante. Sem a linha
 * (banco anterior à 0017, só em teste), não há taxa.
 */
export async function currentServiceFee(db: Db | Tx): Promise<ServiceFeeRule> {
  const [row] = await db
    .select({ rateBps: serviceFeeSettings.rateBps, minCents: serviceFeeSettings.minCents })
    .from(serviceFeeSettings)
    .where(eq(serviceFeeSettings.id, 1))
    .limit(1);
  return row ?? NO_SERVICE_FEE;
}

export async function getServiceFeeSettings(db: Db | Tx, now: Date): Promise<ServiceFeeSettings> {
  const eventsOnSale = await countEventsOnSale(db, now);
  const [row] = await db
    .select({
      rateBps: serviceFeeSettings.rateBps,
      minCents: serviceFeeSettings.minCents,
      updatedAt: serviceFeeSettings.updatedAt,
      updatedBy: users.name,
    })
    .from(serviceFeeSettings)
    .leftJoin(users, eq(users.id, serviceFeeSettings.updatedBy))
    .where(eq(serviceFeeSettings.id, 1))
    .limit(1);
  if (!row) return { ...NO_SERVICE_FEE, updatedAt: new Date(0).toISOString(), updatedBy: null, eventsOnSale };
  return { ...row, updatedAt: row.updatedAt.toISOString(), eventsOnSale };
}

/**
 * Muda a taxa. Vale para pedidos NOVOS; os já feitos guardam a deles. Fica na trilha (`taxa_servico.alterar`) com quantos eventos
 * estavam à venda no momento: com algum, o motivo registra que a taxa vale só para os pedidos feitos a partir dali.
 */
export async function updateServiceFee(
  deps: { db: Db; clock: Clock },
  actor: { id: string },
  rule: ServiceFeeRule,
): Promise<ServiceFeeSettings> {
  if (!validServiceFeeRule(rule))
    throw new AppError(422, 'dados_invalidos', 'Taxa de serviço fora dos limites: porcentagem de 0% a 20% e mínimo de R$ 0,00 a R$ 50,00.');
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const [before] = await tx.select().from(serviceFeeSettings).where(eq(serviceFeeSettings.id, 1)).limit(1).for('update');
    const eventsOnSale = await countEventsOnSale(tx, now);
    if (before)
      await tx
        .update(serviceFeeSettings)
        .set({ rateBps: rule.rateBps, minCents: rule.minCents, updatedBy: actor.id })
        .where(eq(serviceFeeSettings.id, 1));
    else await tx.insert(serviceFeeSettings).values({ id: 1, ...rule, updatedBy: actor.id });
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'taxa_servico.alterar',
      entity: 'taxa_servico',
      entityId: null,
      before: before ? { rateBps: before.rateBps, minCents: before.minCents } : null,
      after: { rateBps: rule.rateBps, minCents: rule.minCents, eventsOnSale },
      reason:
        eventsOnSale > 0
          ? `Taxa alterada com ${eventsOnSale} evento${eventsOnSale === 1 ? '' : 's'} à venda: vale só para os pedidos feitos a partir deste momento; os pedidos já feitos mantêm a taxa deles.`
          : undefined,
      at: now,
    });
    return getServiceFeeSettings(tx, now);
  });
}
