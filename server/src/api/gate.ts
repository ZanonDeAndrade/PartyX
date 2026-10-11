import { Hono } from 'hono';
import { z } from 'zod';
import { createMemoryLimiter } from '../auth/limits';
import { consumeGlobal } from '../auth/globalLimits';
import { requireRole, ROUTE_POLICY } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { AppError } from '../domain/errors';
import {
  admitManually,
  counterByType,
  counterOf,
  gateEvents,
  scan,
  searchTickets,
  type GateDeps,
} from '../gate/service';
import { parseJson } from './validate';

const policy = ROUTE_POLICY.find(p => p.prefix === '/gate')!;
const uuid = z.uuid();

/**
 * Portaria. Só validador e administrador (RF-44), por toda a árvore `/gate`. O servidor decide tudo: o aparelho envia o texto
 * lido do QR e recebe o resultado. Respostas nunca vão para cache.
 */
export function gateRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const gateDeps: GateDeps = {
    db: deps.db,
    clock: deps.clock,
    keys: deps.config.qr.keys,
    closedWindow: {
      beforeHours: deps.config.GATE_CLOSED_WINDOW_BEFORE_HOURS,
      afterHours: deps.config.GATE_CLOSED_WINDOW_AFTER_HOURS,
    },
  };
  const now = () => deps.clock.now().getTime();
  // Teto por pessoa. A leitura contínua da câmera repete o mesmo QR várias vezes por segundo; a tela já espera entre leituras.
  const scanLimit = createMemoryLimiter({ max: 300, windowMs: 60_000, now });
  const searchLimit = createMemoryLimiter({ max: 40, windowMs: 60_000, now });
  const tooMany = () => new AppError(429, 'muitas_requisicoes', 'Muitas leituras seguidas. Aguarde um instante.');

  app.use('/gate/*', requireRole(...policy.roles));
  app.use('/gate/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });

  const who = (c: { get: (k: 'auth') => AuthVariables['auth'] }) => {
    const u = c.get('auth')!.user;
    return { id: u.id, name: u.name };
  };
  const eventId = (value: string) => {
    const p = uuid.safeParse(value);
    if (!p.success) throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
    return p.data;
  };

  app.get('/gate/events', async c => c.json({ events: await gateEvents(gateDeps) }));

  /** Contador de entradas e por tipo (RF-53, CA-27). A tela consulta a cada poucos segundos. */
  app.get('/gate/events/:id/counter', async c => {
    const id = eventId(c.req.param('id'));
    return c.json({ counter: await counterOf(deps.db, id), byType: await counterByType(deps.db, id) });
  });

  app.post('/gate/scan', async c => {
    const v = who(c);
    if (scanLimit.hit(v.id)) throw tooMany();
    await consumeGlobal(deps, 'portaria_leitura', deps.config.GATE_SCANS_PER_MINUTE);
    const body = await parseJson(c, z.object({ eventId: uuid, qr: z.string().min(1).max(300) }));
    return c.json(await scan(gateDeps, v, body));
  });

  app.post('/gate/search', async c => {
    const v = who(c);
    if (searchLimit.hit(v.id)) throw tooMany();
    await consumeGlobal(deps, 'portaria_busca', deps.config.GATE_SEARCHES_PER_MINUTE);
    const body = await parseJson(c, z.object({ eventId: uuid, q: z.string().max(200) }));
    return c.json(await searchTickets(gateDeps, v, body));
  });

  app.post('/gate/admit', async c => {
    const v = who(c);
    if (scanLimit.hit(v.id)) throw tooMany();
    await consumeGlobal(deps, 'portaria_leitura', deps.config.GATE_SCANS_PER_MINUTE);
    const body = await parseJson(c, z.object({ eventId: uuid, ticketId: uuid }));
    return c.json(await admitManually(gateDeps, v, body));
  });

  return app;
}
