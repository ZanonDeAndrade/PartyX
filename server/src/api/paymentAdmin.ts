import { desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { auditLog, orders } from '../db/schema';
import { AppError } from '../domain/errors';
import { listPaidWithoutStock, markTreated } from '../payments/exceptions';
import { parseJson } from './validate';
import type { MockGateway } from '../payments/mockGateway';

/**
 * Exceções de pagamento para o administrador agir: pagamentos aprovados sem estoque (o cliente precisa estornar no gateway; o caso
 * fica em aberto até um administrador marcá-lo como tratado, com motivo) e pagamentos que não conferem com o pedido.
 * A plataforma **não estorna sozinha** e não decide pelo cliente.
 */
export function paymentAdminRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('/admin/*', requireAdmin);

  app.get('/admin/payments/exceptions', async c => {
    const semEstoque = await listPaidWithoutStock(deps.db);

    const divergencias = await deps.db
      .select({ orderId: auditLog.entityId, reason: auditLog.reason, at: auditLog.createdAt })
      .from(auditLog)
      .where(sql`${auditLog.action} = 'pagamento.divergente'`)
      .orderBy(desc(auditLog.createdAt))
      .limit(100);

    const foraDeFluxo = await deps.db
      .select({ orderId: auditLog.entityId, reason: auditLog.reason, at: auditLog.createdAt })
      .from(auditLog)
      .where(inArray(auditLog.action, ['pagamento.estorno_fora_de_fluxo']))
      .orderBy(desc(auditLog.createdAt))
      .limit(100);

    return c.json({
      semEstoque,
      abertos: semEstoque.filter(x => !x.treated).length,
      divergencias,
      foraDeFluxo,
      orientacao:
        'Pagamento sem estoque: o cliente estorna no painel do gateway. A PartyX não estorna nem decide pelo cliente. Depois de tratar, marque o caso como tratado com o motivo.',
    });
  });

  /** Marca um caso de pagamento sem estoque como tratado (motivo obrigatório, na trilha). Não estorna nem muda o pedido. */
  app.post('/admin/payments/exceptions/:orderId/treat', async c => {
    const orderId = z.uuid().safeParse(c.req.param('orderId'));
    if (!orderId.success) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');
    const body = await parseJson(c, z.object({ reason: z.string().max(600) }));
    const result = await markTreated(deps, { id: c.get('auth')!.user.id }, orderId.data, body.reason);
    return c.json(result);
  });

  /**
   * SIMULADOR DE HOMOLOGAÇÃO (só com HOMOLOGACAO_GATEWAY_FICTICIO=true; nunca existe em produção nem fora de homologação).
   * Muda o estado do pagamento no gateway FICTÍCIO e devolve a notificação já assinada, para quem testa decidir se a entrega
   * (POST /api/webhooks/payments, pelo caminho público de verdade) ou se a "perde" para exercitar a conciliação do Cloud Tasks.
   * Só administrador. O estado do fictício fica na memória: use UMA instância (`min=max=1`). NÃO é o sandbox do gateway real.
   */
  const gateway = deps.gateway as Partial<MockGateway> | undefined;
  if (deps.config.APP_ENV === 'homologacao' && deps.config.mockGatewayInHomologacao && gateway?.simulate) {
    const mock = gateway as MockGateway;
    const states = ['aprovado', 'recusado', 'expirado', 'cancelado', 'estornado', 'contestado'] as const;
    app.post('/admin/dev/mock-gateway/:orderId/:status', async c => {
      const status = c.req.param('status') as (typeof states)[number];
      if (!states.includes(status)) throw new AppError(422, 'dados_invalidos', 'Estado desconhecido.');
      const [order] = await deps.db
        .select({ paymentId: orders.gatewayPaymentId })
        .from(orders)
        .where(eq(orders.id, c.req.param('orderId')))
        .limit(1);
      if (!order?.paymentId) throw new AppError(404, 'nao_encontrado', 'Pedido sem cobrança.');
      mock.simulate.setStatus(order.paymentId, status);
      const body = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, paymentId: order.paymentId, type: `payment.${status}` });
      return c.json({ status, webhook: { body, headers: { 'content-type': 'application/json', 'x-mock-signature': mock.simulate.sign(body) } } });
    });
  }

  return app;
}
