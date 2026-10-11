import { desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireAdmin } from '../auth/permissions';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { auditLog, events, orders, users } from '../db/schema';
import { maskCpf } from '../domain/cpf';
import { AppError } from '../domain/errors';
import type { MockGateway } from '../payments/mockGateway';

/**
 * Exceções de pagamento para o administrador agir (o painel completo é do Prompt 16):
 * pagamentos aprovados sem estoque (o cliente precisa estornar no gateway) e pagamentos que não conferem com o pedido.
 * A plataforma **não estorna sozinha** e não decide pelo cliente.
 */
export function paymentAdminRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('/admin/*', requireAdmin);

  app.get('/admin/payments/exceptions', async c => {
    const semEstoque = await deps.db
      .select({
        orderId: orders.id,
        number: orders.number,
        totalCents: orders.totalCents,
        paidAt: orders.paidAt,
        paymentMethod: orders.paymentMethod,
        event: events.name,
        buyerName: users.name,
        buyerEmail: users.email,
        buyerCpf: users.cpf,
      })
      .from(orders)
      .innerJoin(events, eq(events.id, orders.eventId))
      .innerJoin(users, eq(users.id, orders.userId))
      .where(eq(orders.status, 'pago_sem_estoque'))
      .orderBy(desc(orders.paidAt));

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
      semEstoque: semEstoque.map(({ buyerCpf, ...o }) => ({ ...o, buyerCpf: buyerCpf ? maskCpf(buyerCpf) : null })),
      divergencias,
      foraDeFluxo,
      orientacao:
        'Pagamento sem estoque: o cliente estorna no painel do gateway. A PartyX não estorna nem decide pelo cliente.',
    });
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
