import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { createMemoryLimiter } from '../auth/limits';
import { requireRole } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { events, orders, tickets } from '../db/schema';
import { AppError } from '../domain/errors';
import { renderTicketsPdf } from '../tickets/pdf';
import { getMyOrderTickets, getMyTicket, listMyTickets } from '../tickets/service';
import { acceptTransferMinorTerm, previewTransfer, transferTicket } from '../tickets/transfer';
import { processSoon } from '../mail/outbox';
import { orderAuthorizationPdf, ticketAuthorizationPdf } from '../minors/authorization';
import { parseJson } from './validate';

const idParam = z.uuid();
const destinationBody = z.object({ destination: z.string().min(1).max(254) });
const transferBody = destinationBody.extend({ confirm: z.literal(true) });
const minorTermBody = z.object({ accepted: z.boolean(), termVersion: z.string().max(40) });

/**
 * Meus ingressos (RF-42), ingresso individual, PDF (RF-41) e histórico de compras. Só o dono vê: de outro comprador, 404.
 * Respostas privadas: nunca vão para cache compartilhado.
 */
export function ticketRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const buyer = requireRole('cliente');
  const userId = (c: { get: (k: 'auth') => AuthVariables['auth'] }) => c.get('auth')!.user.id;
  const id = (value: string, what: string) => {
    const parsed = idParam.safeParse(value);
    if (!parsed.success) throw new AppError(404, 'nao_encontrado', `${what} não encontrado.`);
    return parsed.data;
  };
  const priv = (c: { header: (k: string, v: string) => void }) => c.header('Cache-Control', 'private, no-store');
  // Logo do PDF: vem do build do front-end (public/brand). Lida uma vez; sem o arquivo (API sem build), o nome sai em texto.
  let logo: Promise<Buffer | undefined> | undefined;
  const pdfLogo = () =>
    (logo ??= readFile(path.resolve(deps.config.WEB_DIST_DIR, 'brand/partyx-logo-print.png')).catch(() => undefined));
  const pdf = (
    c: { header: (k: string, v: string) => void; body: (d: Uint8Array) => Response },
    bytes: Buffer,
    filename: string,
  ) => {
    c.header('Content-Type', 'application/pdf');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    c.header('Cache-Control', 'private, no-store');
    return c.body(new Uint8Array(bytes));
  };

  app.get('/tickets', buyer, async c => {
    priv(c);
    return c.json({ tickets: await listMyTickets(deps.db, userId(c)) });
  });

  app.get('/tickets/:id', buyer, async c => {
    priv(c);
    return c.json({ ticket: await getMyTicket(deps.db, userId(c), id(c.req.param('id'), 'Ingresso')) });
  });

  app.get('/tickets/:id/pdf', buyer, async c => {
    const t = await getMyTicket(deps.db, userId(c), id(c.req.param('id'), 'Ingresso'));
    if (t.minorTermPending)
      throw new AppError(409, 'termo_pendente', 'Aceite o Termo de Ciência para Menores de Idade para baixar o ingresso.');
    return pdf(
      c,
      await renderTicketsPdf([t], `Ingresso ${t.shortCode}`, await pdfLogo()),
      `ingresso-${t.shortCode}.pdf`,
    );
  });

  app.get('/orders/:id/tickets', buyer, async c => {
    priv(c);
    return c.json({ tickets: await getMyOrderTickets(deps.db, userId(c), id(c.req.param('id'), 'Pedido')) });
  });

  app.get('/orders/:id/tickets/pdf', buyer, async c => {
    const list = await getMyOrderTickets(deps.db, userId(c), id(c.req.param('id'), 'Pedido'));
    if (list.length === 0) throw new AppError(404, 'nao_encontrado', 'Este pedido ainda não tem ingressos.');
    return pdf(
      c,
      await renderTicketsPdf(list, `Pedido PX-${list[0]!.orderNumber}`, await pdfLogo()),
      `ingressos-pedido-${list[0]!.orderNumber}.pdf`,
    );
  });

  /**
   * Termo de Autorização e Responsabilidade do pedido (regras de menores): com o nome e a data de nascimento do comprador quando ele
   * tinha 16 ou 17 anos na data do evento; senão, em branco para um acompanhante. Só em evento que permite menores.
   */
  app.get('/orders/:id/autorizacao-menor.pdf', buyer, async c => {
    const { bytes, slug } = await orderAuthorizationPdf(deps, userId(c), id(c.req.param('id'), 'Pedido'));
    return pdf(c, bytes, `autorizacao-menor-${slug}.pdf`);
  });

  /**
   * Termo de Autorização e Responsabilidade de um ingresso recebido numa transferência (D-87): com o nome e a data de nascimento do
   * titular quando ele terá 16 ou 17 anos na data do evento; senão, em branco. Só em evento que permite menores.
   */
  app.get('/tickets/:id/autorizacao-menor.pdf', buyer, async c => {
    const { bytes, slug } = await ticketAuthorizationPdf(deps, userId(c), id(c.req.param('id'), 'Ingresso'));
    return pdf(c, bytes, `autorizacao-menor-${slug}.pdf`);
  });

  // Transferência (D-87). A conferência do destino diz se a conta existe (como o cadastro, D-22): limite por conta, por instância.
  const now = () => deps.clock.now().getTime();
  const previewLimiter = createMemoryLimiter({ max: 15, windowMs: 600_000, now });
  const transferLimiter = createMemoryLimiter({ max: 20, windowMs: 3_600_000, now });
  const tooMany = () => new AppError(429, 'muitas_requisicoes', 'Muitas tentativas. Aguarde um pouco e tente de novo.');

  /** Conferência: o nome mascarado da conta de destino ("Maria S. O."). Nada muda. */
  app.post('/tickets/:id/transfer/preview', buyer, async c => {
    priv(c);
    if (previewLimiter.hit(userId(c))) throw tooMany();
    const { destination } = await parseJson(c, destinationBody);
    return c.json(await previewTransfer(deps, userId(c), id(c.req.param('id'), 'Ingresso'), destination));
  });

  /** Transfere: o ingresso muda de conta, com QR novo. As mensagens dos dois lados saem pela fila. */
  app.post('/tickets/:id/transfer', buyer, async c => {
    priv(c);
    if (transferLimiter.hit(userId(c))) throw tooMany();
    const { destination } = await parseJson(c, transferBody);
    const result = await transferTicket(deps, userId(c), id(c.req.param('id'), 'Ingresso'), destination);
    await processSoon(deps, { userId: userId(c) });
    await processSoon(deps, { userId: result.recipientId });
    return c.json({ transfer: { recipient: result.recipient, at: deps.clock.now().toISOString() } });
  });

  /** Quem recebeu com 16 ou 17 anos aceita o Termo de Ciência; depois disso o QR aparece. */
  app.post('/tickets/:id/termo-menor', buyer, async c => {
    const input = await parseJson(c, minorTermBody);
    const ticketId = id(c.req.param('id'), 'Ingresso');
    await acceptTransferMinorTerm(deps, userId(c), ticketId, input, c.get('meta'));
    priv(c);
    return c.json({ ticket: await getMyTicket(deps.db, userId(c), ticketId) });
  });

  /** Histórico de compras: todos os pedidos do comprador, do mais novo ao mais antigo. */
  app.get('/orders', buyer, async c => {
    priv(c);
    const rows = await deps.db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        totalCents: orders.totalCents,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
        eventSlug: events.slug,
        eventName: events.name,
        eventStartsAt: events.startsAt,
        ticketCount: sql<number>`(select count(*)::int from ${tickets} where ${tickets.orderId} = ${orders.id})`,
      })
      .from(orders)
      .innerJoin(events, eq(events.id, orders.eventId))
      .where(eq(orders.userId, userId(c)))
      .orderBy(desc(orders.number));
    return c.json({ orders: rows });
  });

  return app;
}
