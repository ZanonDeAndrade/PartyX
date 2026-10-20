import { Hono } from 'hono';
import { z } from 'zod';
import { createMemoryLimiter } from '../auth/limits';
import { requireAdmin, requireRole } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { ACCESS_LIMITS } from '../domain/eventAccess';
import { AppError } from '../domain/errors';
import {
  addAccess,
  decideAccess,
  importAccess,
  listAccess,
  myAccess,
  pendingCount,
  pendingRequests,
  removeAccess,
  requestAccess,
} from '../events/access';
import { processSoon } from '../mail/outbox';
import { parseJson } from './validate';

const idParam = z.uuid();
const slugParam = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(100);
const statusEnum = z.enum(['autorizada', 'pendente', 'recusada']);
const personBody = z.object({
  email: z.string().max(254).nullable().optional(),
  cpf: z.string().max(20).nullable().optional(),
  name: z.string().max(200).nullable().optional(),
});
// A busca vai no corpo, nunca na URL: pode ser um CPF ou um e-mail (S-06 da auditoria de entrega).
const searchBody = z.object({
  q: z.string().max(100).optional(),
  status: statusEnum.optional(),
  page: z.number().int().min(1).max(10_000).optional(),
});
const importBody = z.object({ text: z.string().max(200_000) });
const decideBody = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  decision: z.enum(['aprovar', 'recusar']),
  note: z.string().max(1000).nullable().optional(),
});

/**
 * Evento privado (D-92). Comprador: só a situação da própria conta e a solicitação de acesso, com limite por conta (no banco, dentro de
 * `requestAccess`) e por IP (aqui, por instância). Painel: lista de autorizados do evento e página de solicitações, só do administrador.
 * Respostas privadas: nunca vão para cache compartilhado.
 */
export function eventAccessRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const buyer = requireRole('cliente');
  const ad = { db: deps.db, clock: deps.clock };
  const ipLimiter = createMemoryLimiter({
    max: ACCESS_LIMITS.requestsPerIpPerHour,
    windowMs: 3_600_000,
    now: () => deps.clock.now().getTime(),
  });
  const userId = (c: { get: (k: 'auth') => AuthVariables['auth'] }) => c.get('auth')!.user.id;
  const slug = (value: string) => {
    const parsed = slugParam.safeParse(value);
    if (!parsed.success) throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
    return parsed.data;
  };
  const id = (value: string, what: string) => {
    const parsed = idParam.safeParse(value);
    if (!parsed.success) throw new AppError(404, 'nao_encontrado', `${what} não encontrado.`);
    return parsed.data;
  };
  const priv = (c: { header: (k: string, v: string) => void }) => c.header('Cache-Control', 'private, no-store');

  app.get('/events/:slug/access', buyer, async c => {
    priv(c);
    return c.json({ access: await myAccess(ad, slug(c.req.param('slug')), userId(c)) });
  });

  app.post('/events/:slug/access-request', buyer, async c => {
    priv(c);
    const ip = c.get('meta')?.ip;
    if (ip && ipLimiter.hit(ip))
      throw new AppError(429, 'muitas_requisicoes', 'Muitas solicitações seguidas. Aguarde um pouco e tente de novo.');
    const access = await requestAccess(ad, slug(c.req.param('slug')), userId(c));
    if (access.criada) await processSoon(deps, { userId: userId(c) });
    return c.json({ access }, access.criada ? 201 : 200);
  });

  app.use('/admin/*', requireAdmin);
  const actor = (c: { get: (k: 'auth') => AuthVariables['auth'] }) => ({ id: userId(c) });

  app.post('/admin/events/:id/access/search', async c => {
    const body = await parseJson(c, searchBody);
    return c.json(await listAccess(ad, id(c.req.param('id'), 'Evento'), body));
  });
  app.post('/admin/events/:id/access', async c => {
    const body = await parseJson(c, personBody);
    return c.json(await addAccess(ad, actor(c), id(c.req.param('id'), 'Evento'), body), 201);
  });
  app.post('/admin/events/:id/access/import', async c => {
    const body = await parseJson(c, importBody);
    return c.json(await importAccess(ad, actor(c), id(c.req.param('id'), 'Evento'), body.text));
  });
  app.delete('/admin/access/:id', async c => c.json(await removeAccess(ad, actor(c), id(c.req.param('id'), 'Pessoa'))));
  app.post('/admin/access/decide', async c => {
    const body = await parseJson(c, decideBody);
    const result = await decideAccess(ad, actor(c), body);
    if (body.decision === 'aprovar' && result.alteradas > 0) await processSoon(deps, {});
    return c.json(result);
  });
  app.get('/admin/access-requests', async c => {
    const page = Number(c.req.query('page') ?? 1);
    const eventId = c.req.query('eventId');
    return c.json(
      await pendingRequests(ad, {
        page: Number.isInteger(page) && page >= 1 ? page : 1,
        eventId: eventId ? id(eventId, 'Evento') : undefined,
      }),
    );
  });
  app.get('/admin/access-requests/count', async c => c.json({ pendentes: await pendingCount(deps.db) }));

  return app;
}
