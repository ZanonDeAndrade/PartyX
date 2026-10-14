import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { events, orders, tickets } from '../db/schema';
import { AppError } from '../domain/errors';
import { renderTicketsPdf } from '../tickets/pdf';
import { getMyOrderTickets, getMyTicket, listMyTickets } from '../tickets/service';
import { orderAuthorizationPdf } from '../minors/authorization';

const idParam = z.uuid();

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
