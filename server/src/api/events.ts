import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { requireAdmin } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { AGE_RATINGS } from '../domain/events';
import { AppError } from '../domain/errors';
import {
  closeEvent,
  createEvent,
  createPromoter,
  createTicketType,
  eventExists,
  getEvent,
  listEvents,
  listPromoters,
  publishEvent,
  setEventBanner,
  updateEvent,
  updatePromoter,
  updateTicketType,
} from '../events/service';
import { BANNER_MAX_BYTES, processBanner, shareObjectName } from '../media/banner';
import { parseJson } from './validate';

const text = z.string().max(6000);
const instant = z.iso.datetime({ offset: true }).transform(s => new Date(s));
const idParam = z.uuid();

const eventFields = {
  name: text,
  startsAt: instant,
  venue: text,
  address: text,
  description: text,
  attractions: z.array(text).max(100),
  ageRating: z.enum(AGE_RATINGS),
  isFeatured: z.boolean(),
};
const createEventBody = z.object({
  ...eventFields,
  attractions: eventFields.attractions.optional(),
  isFeatured: eventFields.isFeatured.optional(),
  slug: text.optional(),
});
const updateEventBody = z.object(eventFields).partial();

const typeFields = {
  name: text,
  priceCents: z.number(),
  quantityTotal: z.number(),
  salesStartAt: instant,
  salesEndAt: instant,
  isActive: z.boolean(),
};
const createTypeBody = z.object({ ...typeFields, isActive: typeFields.isActive.optional() });
const updateTypeBody = z.object(typeFields).partial();

const promoterBody = z.object({
  name: text,
  couponCode: text,
  phone: text.nullable().optional(),
  isActive: z.boolean().optional(),
});

const bannerLimit = bodyLimit({
  // Margem para o envelope multipart; o limite exato do arquivo é conferido depois.
  maxSize: BANNER_MAX_BYTES + 512 * 1024,
  onError: () => {
    throw new AppError(413, 'arquivo_grande', 'A imagem passa de 5 MB. Escolha um arquivo menor.');
  },
});

/** Gestão de eventos, tipos de ingresso e promoters. Tudo sob `/admin`, portanto só do administrador. */
export function eventsRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('/admin/*', requireAdmin);

  const uuid = (value: string, what: string) => {
    const parsed = idParam.safeParse(value);
    if (!parsed.success) throw new AppError(404, 'nao_encontrado', `${what} não encontrado.`);
    return parsed.data;
  };
  const actor = (c: { get: (k: 'auth') => AuthVariables['auth'] }) => ({ id: c.get('auth')!.user.id });
  const evDeps = { db: deps.db, clock: deps.clock };

  // ----- eventos -----
  app.get('/admin/events', async c => c.json({ events: await listEvents(evDeps) }));
  app.get('/admin/events/:id', async c => c.json(await getEvent(evDeps, uuid(c.req.param('id'), 'Evento'))));

  app.post('/admin/events', async c => {
    const body = await parseJson(c, createEventBody);
    return c.json({ event: await createEvent(evDeps, actor(c), body) }, 201);
  });
  app.patch('/admin/events/:id', async c => {
    const body = await parseJson(c, updateEventBody);
    return c.json({ event: await updateEvent(evDeps, actor(c), uuid(c.req.param('id'), 'Evento'), body) });
  });
  app.post('/admin/events/:id/publish', async c =>
    c.json({ event: await publishEvent(evDeps, actor(c), uuid(c.req.param('id'), 'Evento')) }),
  );
  app.post('/admin/events/:id/close', async c =>
    c.json({ event: await closeEvent(evDeps, actor(c), uuid(c.req.param('id'), 'Evento')) }),
  );

  // ----- banner (RF-13) -----
  app.put('/admin/events/:id/banner', bannerLimit, async c => {
    const id = uuid(c.req.param('id'), 'Evento');
    if (!deps.banners) {
      throw new AppError(
        503,
        'armazenamento_indisponivel',
        'O armazenamento de imagens não está configurado neste ambiente.',
      );
    }
    await eventExists(evDeps, id); // não gasta processamento de imagem com evento inexistente ou encerrado
    let form: Record<string, string | File | (string | File)[]>;
    try {
      form = await c.req.parseBody();
    } catch {
      throw new AppError(400, 'corpo_invalido', 'Envie a imagem no campo "file" de um formulário multipart.');
    }
    const file = form.file;
    if (!(file instanceof File)) throw new AppError(422, 'arquivo_ausente', 'Envie a imagem no campo "file".');
    if (file.size > BANNER_MAX_BYTES)
      throw new AppError(413, 'arquivo_grande', 'A imagem passa de 5 MB. Escolha um arquivo menor.');

    const processed = await processBanner(Buffer.from(await file.arrayBuffer()));
    // Caminho gerado aqui: id do evento e hash do conteúdo. Nada do que o navegador mandou entra no nome.
    const objectName = `events/${id}/${processed.hash}.webp`;
    // Primeiro a imagem de pré-visualização: se a segunda gravação falhar, o evento ainda não aponta para o banner novo.
    await deps.banners.put(shareObjectName(objectName), processed.share.data, processed.share.contentType);
    const url = await deps.banners.put(objectName, processed.data, processed.contentType);
    const event = await setEventBanner(evDeps, actor(c), id, url);
    return c.json({
      event,
      banner: { width: processed.width, height: processed.height, bytes: processed.data.length },
    });
  });
  app.delete('/admin/events/:id/banner', async c =>
    c.json({ event: await setEventBanner(evDeps, actor(c), uuid(c.req.param('id'), 'Evento'), null) }),
  );

  // ----- tipos de ingresso -----
  app.post('/admin/events/:id/ticket-types', async c => {
    const body = await parseJson(c, createTypeBody);
    return c.json(
      { ticketType: await createTicketType(evDeps, actor(c), uuid(c.req.param('id'), 'Evento'), body) },
      201,
    );
  });
  app.patch('/admin/ticket-types/:id', async c => {
    const body = await parseJson(c, updateTypeBody);
    return c.json({
      ticketType: await updateTicketType(evDeps, actor(c), uuid(c.req.param('id'), 'Tipo de ingresso'), body),
    });
  });

  // ----- promoters -----
  app.get('/admin/promoters', async c => c.json({ promoters: await listPromoters(evDeps) }));
  app.post('/admin/promoters', async c => {
    const body = await parseJson(c, promoterBody);
    return c.json({ promoter: await createPromoter(evDeps, actor(c), body) }, 201);
  });
  app.patch('/admin/promoters/:id', async c => {
    const body = await parseJson(c, promoterBody.partial());
    return c.json({ promoter: await updatePromoter(evDeps, actor(c), uuid(c.req.param('id'), 'Promoter'), body) });
  });

  return app;
}
