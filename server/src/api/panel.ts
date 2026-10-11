import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { AppError } from '../domain/errors';
import {
  cancelTickets,
  eventBuyers,
  eventTickets,
  liveEntries,
  listOrders,
  orderDetail,
  overview,
} from '../panel/service';
import { parseJson } from './validate';

const uuid = z.uuid();
const orderStatus = z.enum([
  'pendente',
  'pago',
  'expirado',
  'nao_concluido',
  'cancelado',
  'estornado',
  'contestado',
  'pago_sem_estoque',
]);

/** Painel: visão geral, pedidos, compradores, ingressos, entradas ao vivo e cancelamento. Só administrador, sempre sem cache. */
export function panelRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const panel = { db: deps.db, clock: deps.clock };
  app.use('/admin/*', requireAdmin);
  app.use('/admin/*', async (c, next) => {
    await next();
    // Dado de comprador: nunca em cache compartilhado.
    c.header('Cache-Control', 'private, no-store');
  });

  const id = (value: string, what: string) => {
    const p = uuid.safeParse(value);
    if (!p.success) throw new AppError(404, 'nao_encontrado', `${what} não encontrado.`);
    return p.data;
  };
  const page = (c: { req: { query: (k: string) => string | undefined } }, max = 100) => {
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        pageSize: z.coerce.number().int().min(1).max(max).default(50),
      })
      .safeParse({ page: c.req.query('page'), pageSize: c.req.query('pageSize') });
    if (!parsed.success) throw new AppError(422, 'dados_invalidos', 'Paginação inválida.');
    return parsed.data;
  };
  const actor = (c: { get: (k: 'auth') => AuthVariables['auth'] }) => ({ id: c.get('auth')!.user.id });

  app.get('/admin/overview', async c => c.json(await overview(panel, c.req.query('month'))));

  app.get('/admin/orders', async c => {
    const q = z
      .object({
        eventId: uuid.optional(),
        status: orderStatus.optional(),
        from: z.string().max(10).optional(),
        to: z.string().max(10).optional(),
        q: z.string().max(100).optional(),
      })
      .safeParse({
        eventId: c.req.query('eventId'),
        status: c.req.query('status'),
        from: c.req.query('from'),
        to: c.req.query('to'),
        q: c.req.query('q'),
      });
    if (!q.success)
      throw new AppError(
        422,
        'dados_invalidos',
        'Filtro inválido.',
        q.error.issues.map(i => ({ campo: i.path.join('.'), mensagem: i.message })),
      );
    return c.json(await listOrders(panel, { ...q.data, ...page(c) }));
  });

  app.get('/admin/orders/:id', async c => c.json({ order: await orderDetail(panel, id(c.req.param('id'), 'Pedido')) }));

  app.get('/admin/events/:id/buyers', async c =>
    c.json(await eventBuyers(panel, id(c.req.param('id'), 'Evento'), page(c).page, page(c).pageSize, c.req.query('q'))),
  );

  app.get('/admin/events/:id/tickets', async c => {
    const q = z
      .object({
        status: z.enum(['valido', 'utilizado', 'cancelado']).optional(),
        typeId: uuid.optional(),
        q: z.string().max(100).optional(),
      })
      .safeParse({ status: c.req.query('status'), typeId: c.req.query('typeId'), q: c.req.query('q') });
    if (!q.success) throw new AppError(422, 'dados_invalidos', 'Filtro inválido.');
    return c.json(await eventTickets(panel, id(c.req.param('id'), 'Evento'), { ...q.data, ...page(c) }));
  });

  /** Entradas ao vivo (RF-61): a tela consulta a cada poucos segundos. */
  app.get('/admin/events/:id/entries', async c => c.json(await liveEntries(panel, id(c.req.param('id'), 'Evento'))));

  const cancelBody = z.object({ reason: z.string().max(600), confirm: z.boolean() });
  app.post('/admin/tickets/:id/cancel', async c => {
    const body = await parseJson(c, cancelBody);
    return c.json(await cancelTickets(panel, actor(c), { ticketId: id(c.req.param('id'), 'Ingresso') }, body));
  });
  app.post('/admin/orders/:id/cancel-tickets', async c => {
    const body = await parseJson(c, cancelBody);
    return c.json(await cancelTickets(panel, actor(c), { orderId: id(c.req.param('id'), 'Pedido') }, body));
  });

  return app;
}
