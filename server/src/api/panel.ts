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
import { buyerDetail, listBuyers, revealBuyerCpf, ticketDetail } from '../panel/people';
import { undoLastTransfer } from '../tickets/transfer';
import { processSoon } from '../mail/outbox';

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
  // ----- compradores (ADM12, ADM13) e ingresso (ADM15) -----
  app.get('/admin/buyers', async c => {
    const p = page(c);
    const q = z.string().max(100).optional().safeParse(c.req.query('q') || undefined);
    if (!q.success) throw new AppError(422, 'dados_invalidos', 'Busca inválida.');
    return c.json(await listBuyers(panel, { ...p, q: q.data }));
  });
  app.get('/admin/buyers/:id', async c => c.json(await buyerDetail(panel, id(c.req.param('id'), 'Comprador'))));
  /** CPF completo sob demanda: ação registrada na trilha, resposta sem cache (já é a política de /admin). */
  app.post('/admin/buyers/:id/cpf', async c =>
    c.json(await revealBuyerCpf(panel, actor(c), id(c.req.param('id'), 'Comprador'))),
  );
  app.get('/admin/tickets/:id', async c => c.json(await ticketDetail(panel, id(c.req.param('id'), 'Ingresso'))));

  app.post('/admin/tickets/:id/cancel', async c => {
    const body = await parseJson(c, cancelBody);
    return c.json(await cancelTickets(panel, actor(c), { ticketId: id(c.req.param('id'), 'Ingresso') }, body));
  });
  /**
   * Desfaz a última transferência do ingresso (D-87, fraude comprovada): motivo obrigatório e confirmação, como o cancelamento. O
   * ingresso volta para quem transferiu, com QR novo; os dois recebem e-mail.
   */
  app.post('/admin/tickets/:id/transfer/undo', async c => {
    const body = await parseJson(c, cancelBody);
    const ticketId = id(c.req.param('id'), 'Ingresso');
    const done = await undoLastTransfer(deps, actor(c).id, ticketId, body);
    await processSoon(deps, { userId: done.returnedTo });
    await processSoon(deps, { userId: done.takenFrom });
    return c.json(await ticketDetail(panel, ticketId));
  });
  app.post('/admin/orders/:id/cancel-tickets', async c => {
    const body = await parseJson(c, cancelBody);
    return c.json(await cancelTickets(panel, actor(c), { orderId: id(c.req.param('id'), 'Pedido') }, body));
  });

  return app;
}
