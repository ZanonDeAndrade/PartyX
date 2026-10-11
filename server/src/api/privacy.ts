import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../auth/permissions';
import { createMemoryLimiter } from '../auth/limits';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { AppError } from '../domain/errors';
import { anonymizeSubject, auditAccess, exportSubjectData, findSubject } from '../privacy/service';
import { parseJson } from './validate';

const uuid = z.uuid();
const anonymizeBody = z.object({
  reference: z.string().max(100),
  reason: z.string().max(500),
  confirm: z.literal(true),
  acknowledgeValidTickets: z.boolean().optional(),
});

/**
 * Direitos do titular, a pedido da PartyX (LGPD). Só administrador, sempre sem cache, com limite por pessoa e tudo na
 * auditoria (sem dado pessoal na trilha). Não há tela: é um procedimento operacional documentado em `docs/lgpd.md`.
 */
export function privacyRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const pd = { db: deps.db, clock: deps.clock, hasher: deps.hasher };
  const limit = createMemoryLimiter({ max: 30, windowMs: 60_000, now: () => deps.clock.now().getTime() });

  app.use('/admin/privacy/*', requireAdmin);
  app.use('/admin/privacy/*', async (c, next) => {
    if (limit.hit(c.get('auth')!.user.id))
      throw new AppError(429, 'muitas_requisicoes', 'Muitas consultas seguidas. Aguarde um minuto.');
    await next();
    c.header('Cache-Control', 'private, no-store');
  });
  const actor = (c: Context<{ Variables: AuthVariables }>) => c.get('auth')!.user.id;
  const subjectId = (c: Context) => {
    const id = uuid.safeParse(c.req.param('id'));
    if (!id.success) throw new AppError(404, 'nao_encontrado', 'Titular não encontrado.');
    return id.data;
  };
  const reference = (c: Context) => (c.req.query('protocolo') ?? '').trim().slice(0, 100);

  app.get('/admin/privacy/subjects', async c => {
    const q = z
      .object({ email: z.string().max(200).optional(), cpf: z.string().max(20).optional() })
      .safeParse({ email: c.req.query('email') || undefined, cpf: c.req.query('cpf') || undefined });
    if (!q.success) throw new AppError(422, 'dados_invalidos', 'Filtro inválido.');
    const subject = await findSubject(pd, q.data);
    await auditAccess(pd, actor(c), 'consulta', subject.id, null);
    return c.json({ subject });
  });

  app.get('/admin/privacy/subjects/:id/export', async c => {
    const id = subjectId(c);
    const protocolo = reference(c);
    if (protocolo.length < 3)
      throw new AppError(422, 'dados_invalidos', 'Informe o protocolo da solicitação da PartyX (?protocolo=).');
    const data = await exportSubjectData(pd, id);
    await auditAccess(pd, actor(c), 'exportacao', id, protocolo);
    c.header('Content-Disposition', `attachment; filename="dados-do-titular-${id}.json"`);
    c.header('X-Content-Type-Options', 'nosniff');
    return c.json(data);
  });

  app.post('/admin/privacy/subjects/:id/anonymize', async c => {
    const id = subjectId(c);
    const body = await parseJson(c, anonymizeBody);
    return c.json({ result: await anonymizeSubject(pd, actor(c), id, body) });
  });

  return app;
}
