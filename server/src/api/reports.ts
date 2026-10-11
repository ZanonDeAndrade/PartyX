import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { AppError } from '../domain/errors';
import { dateKeyInEventZone } from '../domain/time';
import { feeReport, promoterOrders, promoterRanking, salesReport } from '../reports/service';

const uuid = z.uuid();

/** Relatórios do administrador. Somente leitura, sem cache. */
export function reportRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const rd = { db: deps.db };
  app.use('/admin/reports/*', requireAdmin);
  app.use('/admin/reports/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
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
  const q = (c: { req: { query: (k: string) => string | undefined } }, ...keys: string[]) =>
    Object.fromEntries(keys.map(k => [k, c.req.query(k)]));

  const period = { from: z.string().max(10).optional(), to: z.string().max(10).optional(), eventId: uuid.optional() };

  app.get('/admin/reports/sales', async c =>
    c.json(
      await salesReport(
        rd,
        parse(z.object({ ...period, typeId: uuid.optional() }), q(c, 'from', 'to', 'eventId', 'typeId')),
      ),
    ),
  );

  app.get('/admin/reports/promoters', async c => {
    const f = parse(z.object({ ...period, metric: z.enum(['qtd', 'valor']).default('qtd') }), {
      ...q(c, 'from', 'to', 'eventId'),
      metric: c.req.query('metric'),
    });
    return c.json(await promoterRanking(rd, f));
  });

  app.get('/admin/reports/promoters/:id', async c => {
    const id = uuid.safeParse(c.req.param('id'));
    if (!id.success) throw new AppError(404, 'nao_encontrado', 'Promoter não encontrado.');
    return c.json(await promoterOrders(rd, id.data, parse(z.object(period), q(c, 'from', 'to', 'eventId'))));
  });

  app.get('/admin/reports/fee', async c => {
    const f = parse(
      z.object({
        month: z.string().max(7).optional(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
      }),
      { month: c.req.query('month') || undefined, page: c.req.query('page'), pageSize: c.req.query('pageSize') },
    );
    // O mês padrão é o atual no momento do pedido (não no da inicialização do servidor).
    return c.json(await feeReport(rd, f.month ?? dateKeyInEventZone(deps.clock.now()).slice(0, 7), f.page, f.pageSize));
  });

  return app;
}
