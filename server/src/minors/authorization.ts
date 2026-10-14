import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { events, orders, users } from '../db/schema';
import { AppError } from '../domain/errors';
import { legalDocument, minorDocsBlockers } from '../legal/documents';
import { logger } from '../logger';
import { renderAuthorizationPdf } from './authorizationPdf';

type AuthorizationConfig = Pick<
  Config,
  | 'APP_ENV'
  | 'legal'
  | 'legalContentDir'
  | 'cancellationVersion'
  | 'minorTermVersion'
  | 'minorAuthorizationVersion'
  | 'legalDates'
  | 'partyx'
  | 'WEB_DIST_DIR'
>;
export interface AuthorizationDeps {
  db: Db;
  config: AuthorizationConfig;
}

type EventRow = typeof events.$inferSelect;

function assertAvailable(deps: AuthorizationDeps, event: EventRow | undefined) {
  if (!event || event.status === 'rascunho') throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
  if (!event.allowsMinors || !event.endsAt)
    throw new AppError(404, 'evento_sem_menores', 'Este evento não permite a entrada de menores de 18 anos.');
  const blockers = minorDocsBlockers(deps.config);
  if (blockers.length) {
    logger.warn('autorização de menor indisponível', { blockers });
    throw new AppError(503, 'autorizacao_indisponivel', 'A autorização para menores está indisponível no momento.');
  }
  return event as EventRow & { endsAt: Date };
}

// Logo escuro do cabeçalho: vem do build do front-end (public/brand). Lido uma vez; sem o arquivo (API sem build), o nome sai em texto.
let logo: Promise<Buffer | undefined> | undefined;
const pdfLogo = (deps: AuthorizationDeps) =>
  (logo ??= readFile(path.resolve(deps.config.WEB_DIST_DIR, 'brand/partyx-logo-print-dark.png')).catch(() => undefined));

const render = async (
  deps: AuthorizationDeps,
  event: EventRow & { endsAt: Date },
  minor: { name: string; birthDate: string } | null,
) =>
  renderAuthorizationPdf({
    event: { name: event.name, startsAt: event.startsAt, endsAt: event.endsAt, venue: event.venue, address: event.address },
    minor,
    partyx: deps.config.partyx,
    document: legalDocument(deps.config, 'autorizacao-menor'),
    logo: await pdfLogo(deps),
  });

/**
 * Autorização do pedido (fim da compra, Meus ingressos, link do e-mail). Só o dono do pedido. Se o comprador era menor na data do
 * evento, sai com o nome e a data de nascimento dele; senão, os campos do menor ficam em branco (para um acompanhante).
 */
export async function orderAuthorizationPdf(deps: AuthorizationDeps, userId: string, orderId: string) {
  const [row] = await deps.db
    .select({
      event: events,
      buyerMinor: orders.buyerMinor,
      name: users.name,
      birthDate: users.birthDate,
      gone: users.anonymizedAt,
    })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  if (!row) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');
  const event = assertAvailable(deps, row.event);
  const minor = row.buyerMinor && row.birthDate && !row.gone ? { name: row.name, birthDate: row.birthDate } : null;
  return { bytes: await render(deps, event, minor), slug: event.slug };
}

/** Autorização em branco do evento (página do evento), para acompanhantes de 16 ou 17 anos. Pública: não leva dado pessoal. */
export async function blankAuthorizationPdf(deps: AuthorizationDeps, slug: string) {
  const [event] = await deps.db.select().from(events).where(eq(events.slug, slug)).limit(1);
  return { bytes: await render(deps, assertAvailable(deps, event), null), slug };
}
