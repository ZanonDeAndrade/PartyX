import { Hono } from 'hono';
import type { Config } from '../config';
import { logger } from '../logger';
import type { Clock } from '../providers/clock';

export interface HealthDeps {
  config: Pick<Config, 'APP_ENV'>;
  clock: Clock;
  /** Ausente quando não há banco configurado (desenvolvimento local). */
  pingDatabase?: () => Promise<void>;
}

export function healthRoutes({ config, clock, pingDatabase }: HealthDeps) {
  const app = new Hono();

  /** Liveness: o processo responde. Não consulta dependências. */
  app.get('/health', c => c.json({ status: 'ok', env: config.APP_ENV, time: clock.now().toISOString() }));

  /** Readiness: o banco responde. Sem banco configurado, informa e segue como pronto. */
  app.get('/health/ready', async c => {
    if (!pingDatabase) return c.json({ status: 'ok', database: 'não configurado' });
    try {
      await pingDatabase();
      return c.json({ status: 'ok', database: 'ok' });
    } catch (error) {
      logger.error('health: falha ao consultar o banco', {
        error: error instanceof Error ? error.name : 'desconhecido',
      });
      return c.json({ status: 'indisponível', database: 'falha' }, 503);
    }
  });

  return app;
}
