import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { getServiceFeeSettings, updateServiceFee } from '../settings/serviceFee';
import { parseJson } from './validate';

const serviceFeeBody = z.object({ rateBps: z.number().int(), minCents: z.number().int() });

/** Configurações do painel (só administrador). Hoje: a taxa de serviço (D-90). */
export function settingsRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('/admin/settings/*', requireAdmin);
  app.use('/admin/settings/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
  });
  app.get('/admin/settings/service-fee', async c =>
    c.json({ serviceFee: await getServiceFeeSettings(deps.db, deps.clock.now()) }),
  );
  app.put('/admin/settings/service-fee', async c => {
    const body = await parseJson(c, serviceFeeBody);
    return c.json({
      serviceFee: await updateServiceFee({ db: deps.db, clock: deps.clock }, { id: c.get('auth')!.user.id }, body),
    });
  });
  return app;
}
