import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { writeAudit } from '../db/audit';
import { AppError } from '../domain/errors';
import { listEmails, processSoon, reopenEmail } from '../mail/outbox';
import { emailLog } from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Fila de e-mails para o administrador: ver o que está pendente ou falhou e reabrir um item que esgotou as tentativas.
 * Mostra só modelo, estado, tentativas e o **nome** do último erro: nunca endereço, conteúdo ou token.
 */
export function emailAdminRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('/admin/*', requireAdmin);

  app.get('/admin/emails', async c => {
    const status = z.enum(['pendente', 'enviado', 'falhou']).optional().safeParse(c.req.query('status'));
    if (!status.success) throw new AppError(422, 'dados_invalidos', 'Estado inválido.');
    return c.json({ emails: await listEmails(deps.db, { status: status.data }) });
  });

  app.post('/admin/emails/:id/retry', async c => {
    const id = z.uuid().safeParse(c.req.param('id'));
    if (!id.success) throw new AppError(404, 'nao_encontrado', 'E-mail não encontrado.');
    const reopened = await deps.db.transaction(async tx => {
      const ok = await reopenEmail(tx, deps.clock, id.data);
      if (ok) {
        await writeAudit(tx, {
          actorId: c.get('auth')!.user.id,
          action: 'email.reabrir',
          entity: 'email',
          entityId: id.data,
          before: { status: 'falhou' },
          after: { status: 'pendente' },
          at: deps.clock.now(),
        });
      }
      return ok;
    });
    if (!reopened) {
      throw new AppError(
        409,
        'nao_reabrivel',
        'Só é possível reabrir e-mail que falhou por erro de entrega. Os que deixaram de se aplicar não são reenviados.',
      );
    }
    // Tenta entregar já (espera no máximo 3 s e nunca lança): sem isto o item reaberto só sairia na varredura diária.
    await processSoon(deps, { emailId: id.data });
    const [row] = await deps.db.select({ status: emailLog.status }).from(emailLog).where(eq(emailLog.id, id.data)).limit(1);
    return c.json({ status: row?.status ?? 'pendente' });
  });

  return app;
}
