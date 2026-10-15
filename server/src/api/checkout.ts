import { Hono } from 'hono';
import { z } from 'zod';
import { createMemoryLimiter } from '../auth/limits';
import { requireRole } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { AppError } from '../domain/errors';
import { getPayment, paymentOptions, rejectCardData, startPayment } from '../orders/payment';
import { reconcilePayment } from '../payments/reconcile';
import { cancelOrder, createOrder, getOrder, quote, type OrdersDeps } from '../orders/service';
import { parseJson } from './validate';

const checkoutBody = z.object({
  eventSlug: z.string().max(100),
  // Só id e quantidade. Qualquer preço, total ou desconto enviado pelo navegador é descartado aqui (z.object remove chaves extras).
  items: z.array(z.object({ ticketTypeId: z.uuid(), quantity: z.number() })).max(20),
  couponCode: z.string().max(40).nullable().optional(),
  expectedTotalCents: z.number().int().optional(),
  minorTermAccepted: z.boolean().optional(),
  minorTermVersion: z.string().max(40).nullable().optional(),
  // Política de Cancelamento, Troca e Reembolso (D-80 atualizada): a caixa e a versão lida. O resumo (quote) ignora os dois.
  cancellationAccepted: z.boolean().optional(),
  cancellationVersion: z.string().max(40).nullable().optional(),
});
const paymentBody = z.discriminatedUnion('method', [
  z.object({ method: z.literal('pix') }),
  // Cartão: só o token do gateway, a bandeira, o tipo (crédito ou débito) e as parcelas. Nunca número, validade nem CVV.
  z.object({
    method: z.literal('cartao'),
    cardToken: z.string().min(8).max(500).optional(),
    installments: z.number().optional(),
    paymentMethodId: z
      .string()
      .regex(/^[a-z0-9_-]{2,40}$/)
      .optional(),
    paymentTypeId: z.enum(['credit_card', 'debit_card']).optional(),
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
    return c.json({ summary: await quote(ordersDeps, await parseJson(c, checkoutBody), userId(c)) });
  });

  app.post('/orders', buyer, async c => {
    if (createLimiter.hit(userId(c))) throw tooMany();
    const order = await createOrder(ordersDeps, userId(c), await parseJson(c, checkoutBody), c.get('meta'));
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

  const gateway = deps.gateway;
  const paymentDeps = () => ({
    ...ordersDeps,
    gateway,
    publicBaseUrl: deps.config.PUBLIC_BASE_URL ?? 'http://localhost:5173',
    settle: gateway
      ? async (gatewayPaymentId: string) => {
          await reconcilePayment(
            {
              db: deps.db,
              clock: deps.clock,
              gateway,
              issueTickets: deps.issueTickets,
              mail: {
                db: deps.db,
                clock: deps.clock,
                mailer: deps.mailer,
                config: deps.config,
                taskQueue: deps.taskQueue,
              },
            },
            gatewayPaymentId,
          );
        }
      : undefined,
  });

  /** Como montar a tela de pagamento: componente de cartão (chave PÚBLICA do gateway) e se o Pix está disponível (D-03). */
  app.get('/payments/options', buyer, c =>
    c.json({ options: paymentOptions(gateway, deps.config.RESERVATION_MINUTES) }),
  );
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
