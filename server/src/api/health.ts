import { Hono } from 'hono';
import { clientIp } from '../auth/middleware';
import type { Config } from '../config';
import { logger } from '../logger';
import type { Clock } from '../providers/clock';
import { maskIp } from '../security/ip';

export interface HealthDeps {
  config: Pick<Config, 'APP_ENV' | 'TRUSTED_PROXY_HOPS'>;
  clock: Clock;
  /** Ausente quando não há banco configurado (desenvolvimento local). */
  pingDatabase?: () => Promise<void>;
}

/** Quem entregou o pedido ao Cloud Run, pelos cabeçalhos que cada intermediário acrescenta. Só diagnóstico: dá para forjar. */
function intermediary(headers: { get(name: string): string | null }): 'vercel' | 'firebase' | 'direto' {
  if (headers.get('x-vercel-id')) return 'vercel';
  if ((headers.get('via') ?? '').includes('Firebase Hosting')) return 'firebase';
  return 'direto';
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

  /**
   * Origem do pedido, para conferir a cadeia de intermediários (Vercel ou Firebase Hosting até o Cloud Run): o host
   * público recebido, quem entregou e o IP do visitante como o servidor o calcula (TRUSTED_PROXY_HOPS), sempre mascarado.
   * Ao contrário das duas rotas acima, passa pela barreira de Host: direto no run.app, sem o domínio, responde 403.
   * Grava a mesma linha no log, para o IP real (mascarado) aparecer no Cloud Logging.
   */
  app.get('/health/origem', c => {
    const forwardedFor = c.req.header('x-forwarded-for');
    const origin = {
      host: c.req.header('x-forwarded-host') ?? c.req.header('host') ?? null,
      intermediario: intermediary(c.req.raw.headers),
      ip: maskIp(clientIp(forwardedFor, config.TRUSTED_PROXY_HOPS)),
      itensNoEncaminhamento: (forwardedFor ?? '').split(',').filter(s => s.trim()).length,
      protocolo: c.req.header('x-forwarded-proto') ?? null,
    };
    logger.info('origem do pedido', origin);
    return c.json(origin);
  });

  return app;
}
