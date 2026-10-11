import { Hono } from 'hono';
import { z } from 'zod';
import { createMemoryLimiter } from '../auth/limits';
import { requireRole } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { AppError } from '../domain/errors';
import { getPayment, rejectCardData, startPayment } from '../orders/payment';
import { cancelOrder, createOrder, getOrder, quote, type OrdersDeps } from '../orders/service';
import { parseJson } from './validate';

const checkoutBody = z.object({
  eventSlug: z.string().max(100),
  // Só id e quantidade. Qualquer preço, total ou desconto enviado pelo navegador é descartado aqui (z.object remove chaves extras).
  items: z.array(z.object({ ticketTypeId: z.uuid(), quantity: z.number() })).max(20),
  couponCode: z.string().max(40).nullable().optional(),
  expectedTotalCents: z.number().int().optional(),
});
const paymentBody = z.discriminatedUnion('method', [
  z.object({ method: z.literal('pix') }),
  // Cartão: só um token do gateway (se o gateway usar token) e parcelas. Nunca número, validade nem CVV.
  z.object({
    method: z.literal('cartao'),
    cardToken: z.string().min(8).max(500).optional(),
    installments: z.number().optional(),
  }),
]);
const idParam = z.uuid();

/** Carrinho, reserva e pedido. Só o comprador (perfil cliente): equipe testa com uma conta de cliente. */
export function checkoutRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const ordersDeps: OrdersDeps = {
    db: deps.db,
    clock: deps.clock,
    config: deps.config,
    taskQueue: deps.taskQueue,
  };
  const now = () => deps.clock.now().getTime();
  // Por instância; o freio de verdade contra estoque preso é a regra de um pedido pendente por evento.
  const createLimiter = createMemoryLimiter({ max: 30, windowMs: 600_000, now });
  const quoteLimiter = createMemoryLimiter({ max: 120, windowMs: 600_000, now });
  const buyer = requireRole('cliente');
  const tooMany = () => new AppError(429, 'muitas_requisicoes', 'Muitas tentativas. Aguarde um pouco e tente de novo.');
  const userId = (c: { get: (k: 'auth') => AuthVariables['auth'] }) => c.get('auth')!.user.id;
  const orderId = (value: string) => {
    const parsed = idParam.safeParse(value);
    if (!parsed.success) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');
    return parsed.data;
  };

  app.post('/checkout/quote', buyer, async c => {
    if (quoteLimiter.hit(userId(c))) throw tooMany();
    return c.json({ summary: await quote(ordersDeps, await parseJson(c, checkoutBody)) });
  });

  app.post('/orders', buyer, async c => {
    if (createLimiter.hit(userId(c))) throw tooMany();
    const order = await createOrder(ordersDeps, userId(c), await parseJson(c, checkoutBody));
    c.header('Cache-Control', 'no-store');
    return c.json({ order }, 201);
  });

  app.get('/orders/:id', buyer, async c => {
    c.header('Cache-Control', 'no-store');
    return c.json({ order: await getOrder(ordersDeps, userId(c), orderId(c.req.param('id'))) });
  });

  app.post('/orders/:id/cancel', buyer, async c =>
    c.json({ order: await cancelOrder(ordersDeps, userId(c), orderId(c.req.param('id'))) }),
  );

  const paymentDeps = () => ({
    ...ordersDeps,
    gateway: deps.gateway,
    publicBaseUrl: deps.config.PUBLIC_BASE_URL ?? 'http://localhost:5173',
  });
  const payLimiter = createMemoryLimiter({ max: 20, windowMs: 600_000, now });

  /** Escolhe a forma de pagamento e cria a cobrança. Valor e prazo vêm do pedido; o corpo só diz Pix ou cartão. */
  app.post('/orders/:id/payment', buyer, async c => {
    if (payLimiter.hit(userId(c))) throw tooMany();
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new AppError(400, 'corpo_invalido', 'O corpo da requisição precisa ser um JSON válido.');
    }
    rejectCardData(raw); // antes de tudo: dado de cartão não passa daqui, e o valor nunca é repetido na resposta
    const parsed = paymentBody.safeParse(raw);
    if (!parsed.success) throw new AppError(422, 'dados_invalidos', 'Escolha Pix ou cartão.');
    c.header('Cache-Control', 'no-store');
    return c.json(await startPayment(paymentDeps(), userId(c), orderId(c.req.param('id')), parsed.data), 201);
  });

  app.get('/orders/:id/payment', buyer, async c => {
    c.header('Cache-Control', 'no-store');
    return c.json({ payment: await getPayment(paymentDeps(), userId(c), orderId(c.req.param('id'))) });
  });

  return app;
}
