import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../auth/permissions';
import { createMemoryLimiter } from '../auth/limits';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { AppError } from '../domain/errors';
import { dateKeyInEventZone } from '../domain/time';
import { renderContingencyPdf } from '../exports/contingency';
import {
  auditExport,
  contingencyCsv,
  exportEventAccess,
  exportEventBuyers,
  exportEventTickets,
  exportFee,
  exportOrders,
  exportPromoterOrders,
  exportPromoters,
  exportSales,
  loadContingency,
  type CsvExport,
} from '../exports/service';

const uuid = z.uuid();
const date = z.string().max(10).optional();

/**
 * Exportações do administrador (RF-63, RF-64). Sempre geradas na hora a partir das consultas das telas, nunca guardadas nem
 * servidas por URL pública: exigem sessão de administrador, vão com `no-store` e `attachment`, são limitadas por pessoa
 * e cada geração entra na auditoria (sem o texto digitado na busca, que pode ser CPF ou e-mail).
 */
export function exportRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const ed = { db: deps.db, clock: deps.clock };
  const limit = createMemoryLimiter({ max: 20, windowMs: 60_000, now: () => deps.clock.now().getTime() });

  app.use('/admin/exports/*', requireAdmin);
  app.use('/admin/exports/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });
  app.use('/admin/exports/*', async (c, next) => {
    if (limit.hit(c.get('auth')!.user.id))
      throw new AppError(429, 'muitas_requisicoes', 'Muitas exportações seguidas. Aguarde um minuto.');
    await next();
  });

  const parse = <T extends z.ZodType>(schema: T, input: unknown): z.infer<T> => {
    const r = schema.safeParse(input);
    if (!r.success)
      throw new AppError(
        422,
        'dados_invalidos',
        'Filtro inválido.',
        r.error.issues.map(i => ({ campo: i.path.join('.'), mensagem: i.message })),
      );
    return r.data;
  };
  const query = (c: Context, ...keys: string[]) => Object.fromEntries(keys.map(k => [k, c.req.query(k) || undefined]));
  const actor = (c: Context<{ Variables: AuthVariables }>) => c.get('auth')!.user.id;
  const eventId = (c: Context) => {
    const id = uuid.safeParse(c.req.param('id'));
    if (!id.success) throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
    return id.data;
  };

  const attachment = (name: string, ext: 'csv' | 'pdf') => {
    const file = `${name}.${ext}`;
    return `attachment; filename="${file}"; filename*=UTF-8''${encodeURIComponent(file)}`;
  };
  const sendCsv = async (c: Context<{ Variables: AuthVariables }>, kind: string, out: CsvExport, evId?: string) => {
    await auditExport(ed, actor(c), { kind, format: 'csv', rows: out.rows, filters: out.filters, eventId: evId });
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', attachment(out.filename, 'csv'));
    return c.body(out.csv);
  };

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

  app.get('/admin/exports/orders.csv', async c => {
    const f = parse(
      z.object({
        eventId: uuid.optional(),
        status: orderStatus.optional(),
        from: date,
        to: date,
        q: z.string().max(100).optional(),
      }),
      query(c, 'eventId', 'status', 'from', 'to', 'q'),
    );
    return sendCsv(c, 'pedidos', await exportOrders(ed, f), f.eventId);
  });

  app.get('/admin/exports/events/:id/tickets.csv', async c => {
    const f = parse(
      z.object({
        status: z.enum(['valido', 'utilizado', 'cancelado']).optional(),
        typeId: uuid.optional(),
        q: z.string().max(100).optional(),
      }),
      query(c, 'status', 'typeId', 'q'),
    );
    const id = eventId(c);
    return sendCsv(c, 'ingressos', await exportEventTickets(ed, id, f), id);
  });

  app.get('/admin/exports/events/:id/buyers.csv', async c => {
    const f = parse(z.object({ q: z.string().max(100).optional() }), query(c, 'q'));
    const id = eventId(c);
    return sendCsv(c, 'compradores', await exportEventBuyers(ed, id, f.q), id);
  });

  app.get('/admin/exports/events/:id/access.csv', async c => {
    const f = parse(
      z.object({ status: z.enum(['autorizada', 'pendente', 'recusada']).optional() }),
      query(c, 'status'),
    );
    const id = eventId(c);
    return sendCsv(c, 'autorizados', await exportEventAccess(ed, id, f.status), id);
  });

  app.get('/admin/exports/sales.csv', async c => {
    const f = parse(
      z.object({ eventId: uuid.optional(), typeId: uuid.optional(), from: date, to: date }),
      query(c, 'eventId', 'typeId', 'from', 'to'),
    );
    return sendCsv(c, 'vendas', await exportSales(ed, f), f.eventId);
  });

  app.get('/admin/exports/promoters.csv', async c => {
    const f = parse(
      z.object({ eventId: uuid.optional(), from: date, to: date, metric: z.enum(['qtd', 'valor']).default('qtd') }),
      { ...query(c, 'eventId', 'from', 'to'), metric: c.req.query('metric') },
    );
    return sendCsv(c, 'promoters', await exportPromoters(ed, f), f.eventId);
  });

  app.get('/admin/exports/promoters/:id/orders.csv', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    if (!id.success) throw new AppError(404, 'nao_encontrado', 'Promoter não encontrado.');
    const f = parse(z.object({ eventId: uuid.optional(), from: date, to: date }), query(c, 'eventId', 'from', 'to'));
    return sendCsv(c, 'vendas_promoter', await exportPromoterOrders(ed, id.data, f), f.eventId);
  });

  app.get('/admin/exports/fee.csv', async c => {
    const f = parse(z.object({ month: z.string().max(7).optional() }), query(c, 'month'));
    return sendCsv(c, 'taxa', await exportFee(ed, f.month ?? dateKeyInEventZone(deps.clock.now()).slice(0, 7)));
  });

  app.get('/admin/exports/events/:id/contingency.csv', async c => {
    const id = eventId(c);
    const out = contingencyCsv(await loadContingency(ed, id));
    return sendCsv(c, 'contingencia', out, id);
  });

  app.get('/admin/exports/events/:id/contingency.pdf', async c => {
    const id = eventId(c);
    const list = await loadContingency(ed, id);
    const pdf = await renderContingencyPdf(list);
    await auditExport(ed, actor(c), {
      kind: 'contingencia',
      format: 'pdf',
      rows: list.admit.length + list.cancelled.length,
      filters: { eventId: id },
      eventId: id,
    });
    c.header('Content-Type', 'application/pdf');
    c.header(
      'Content-Disposition',
      attachment(
        `contingencia-${
          list.event.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'evento'
        }`,
        'pdf',
      ),
    );
    return c.body(new Uint8Array(pdf));
  });

  return app;
}
