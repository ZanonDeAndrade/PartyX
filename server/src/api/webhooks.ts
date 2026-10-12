import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { bodyLimit } from 'hono/body-limit';
import { clientIp } from '../auth/middleware';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { orders } from '../db/schema';
import { AppError } from '../domain/errors';
import { logger } from '../logger';
import { backfillTickets } from '../tickets/issuer';
import { purgeExpired } from '../privacy/retention';
import { createInvalidWriteLimiter, handleNotification, runReconciliation } from '../payments/notifications';
import type { PaymentGateway } from '../payments/gateway';
import type { JobAuthenticator } from '../payments/jobsAuth';
import type { MockGateway } from '../payments/mockGateway';
import type { ReconcileDeps, TicketIssuer } from '../payments/reconcile';
import { BACKOFF_MINUTES as EMAIL_RETRIES } from '../mail/outbox';
import type { TaskQueue } from '../payments/taskQueue';
import { handleReconcileTask, offsetsOf } from '../payments/reconcileTask';
import { finalAttempt } from '../domain/reconcileSchedule';
import { acquireLease, purgeOldLeases, releaseLease } from '../db/jobLease';
import type { Clock } from '../providers/clock';
import type { EmailSender } from '../providers/email';
import { handleEmailTask, processOutbox, type OutboxDeps } from '../mail/outbox';

export interface WebhookDeps {
  db: Db;
  clock: Clock;
  config: Config;
  gateway: PaymentGateway | undefined;
  jobAuth: JobAuthenticator | undefined;
  issueTickets?: TicketIssuer;
  mailer?: EmailSender;
  taskQueue?: TaskQueue;
}

const isMock = (g: PaymentGateway | undefined): g is MockGateway =>
  Boolean(g && 'simulate' in g && g.capabilities.providerId === 'mock');

/**
 * Entradas que **não** usam sessão do comprador: o webhook do gateway (autenticado pela assinatura dele) e as rotinas
 * do Cloud Scheduler (autenticadas por token OIDC). Montadas antes do contexto de autenticação, sem cookie nem CSRF.
 */
export function webhookRoutes(deps: WebhookDeps) {
  const app = new Hono();
  const now = () => deps.clock.now().getTime();
  const mayRecord = createInvalidWriteLimiter(30, 60_000, now);
  const mail: OutboxDeps | undefined = deps.mailer
    ? { db: deps.db, clock: deps.clock, mailer: deps.mailer, config: deps.config, taskQueue: deps.taskQueue }
    : undefined;
  const reconcileDeps = (gateway: PaymentGateway): ReconcileDeps => ({
    db: deps.db,
    clock: deps.clock,
    gateway,
    issueTickets: deps.issueTickets,
    mail,
  });

  const tooBig = bodyLimit({
    maxSize: 256 * 1024,
    onError: () => {
      throw new AppError(413, 'corpo_grande', 'Corpo grande demais.');
    },
  });

  /**
   * Webhook do gateway. Responde 200 se registrou e processou (ou já tinha processado, ou o assunto não interessa), 401 se a
   * assinatura não confere, 503 para o gateway tentar de novo. A reconsulta tem tempo limite (7 s por tentativa, no máximo duas),
   * dentro dos 22 s que o Mercado Pago espera; se falhar, o evento fica gravado e pendente, e as verificações do pedido no
   * Cloud Tasks e a rotina diária o retomam.
   */
  app.post('/webhooks/payments', tooBig, async c => {
    if (!deps.gateway) throw new AppError(503, 'pagamento_indisponivel', 'Pagamento indisponível.');
    const rawBody = await c.req.text(); // corpo bruto: a assinatura é calculada sobre ele
    const ip = clientIp(c.req.header('x-forwarded-for'), deps.config.TRUSTED_PROXY_HOPS) ?? 'desconhecido';
    const result = await handleNotification(reconcileDeps(deps.gateway), {
      headers: c.req.raw.headers,
      rawBody,
      query: new URL(c.req.url).searchParams,
      mayRecordInvalid: mayRecord(ip),
    });
    if (result.status === 'invalida')
      return c.json({ erro: { codigo: 'assinatura_invalida', mensagem: 'Notificação não autenticada.' } }, 401);
    if (result.retry) return c.json({ erro: { codigo: 'processamento_pendente', mensagem: 'Tente novamente.' } }, 503);
    return c.json({ status: result.status, outcome: result.outcome ?? null });
  });

  /**
   * Rotina diária de segurança (Cloud Scheduler, 04:00), a ÚNICA agenda fixa da conciliação: fila de e-mails, pedidos de até 3 dias
   * que ainda podem mudar (pega os pedidos cujas tarefas no Cloud Tasks não puderam ser agendadas ou falharam) e ingressos que
   * faltarem. Uma execução por vez (trava `job_leases`); limpa as travas vencidas há mais de 2 dias. Só o Scheduler (OIDC) chama.
   */
  app.post('/internal/jobs/reconcile-payments', async c => {
    if (!deps.jobAuth)
      throw new AppError(503, 'rotinas_nao_configuradas', 'As rotinas internas não estão configuradas.');
    if (!(await deps.jobAuth.verify(c.req.header('authorization')))) {
      // Resposta igual para qualquer falha de autenticação.
      throw new AppError(401, 'nao_autenticado', 'Não autenticado.');
    }
    const lease = await acquireLease(deps.db, 'reconcile-daily', deps.config.reconcile.lockSeconds);
    if (!lease) return c.json({ status: 'em_execucao' });
    try {
      // A fila de e-mails anda mesmo sem gateway: cadastro e recuperação de senha também dependem dela.
      const emails = mail ? await processOutbox(mail, { limit: 50 }) : null;
      const leases = await purgeOldLeases(deps.db);
      if (!deps.gateway) return c.json({ status: 'sem_gateway', emails, leases });
      const summary = await runReconciliation(reconcileDeps(deps.gateway));
      // Rede de segurança: pedido pago sem ingresso (pago antes do emissor existir) recebe o que falta. Idempotente.
      const recovered = await backfillTickets({ db: deps.db, qr: deps.config.qr });
      logger.info('conciliação de pagamentos executada', {
        checked: summary.orders.checked,
        failed: summary.orders.failed,
        expiredOrders: summary.expired.orders,
      });
      return c.json({ status: 'ok', summary, tickets: recovered, emails, leases });
    } finally {
      await releaseLease(deps.db, 'reconcile-daily', lease);
    }
  });

  /**
   * Verificação de UM pedido, agendada pelo Cloud Tasks (conciliação sob demanda). Autenticada por OIDC como as rotinas do Scheduler.
   * 200 quando tratou (inclusive reagendar ou marcar para revisão); 503 em falha de rede com o gateway, para o Cloud Tasks repetir.
   */
  app.post('/internal/tasks/reconcile-order', async c => {
    if (!deps.jobAuth)
      throw new AppError(503, 'rotinas_nao_configuradas', 'As rotinas internas não estão configuradas.');
    if (!(await deps.jobAuth.verify(c.req.header('authorization'))))
      throw new AppError(401, 'nao_autenticado', 'Não autenticado.');
    if (!deps.gateway) return c.json({ status: 'sem_gateway' });
    const schedule = deps.config.reconcile;
    const parsed = z
      .object({
        orderId: z.uuid(),
        attempt: z.number().int().min(1).max(finalAttempt(offsetsOf(schedule))),
        chargedAt: z.iso.datetime().optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new AppError(422, 'dados_invalidos', 'Tarefa inválida.');
    try {
      const result = await handleReconcileTask(
        { ...reconcileDeps(deps.gateway), queue: deps.taskQueue, schedule },
        parsed.data,
      );
      return c.json({ status: 'ok', ...result });
    } catch (error) {
      logger.error('falha ao conciliar o pedido sob demanda', {
        orderId: parsed.data.orderId,
        error: error instanceof Error ? error.name : 'desconhecido',
        alert: 'reconciliacao_falhou',
      });
      throw new AppError(503, 'processamento_pendente', 'Tente novamente.');
    }
  });

  /**
   * Reenvio de UM e-mail que falhou, agendado pelo Cloud Tasks (+2, +10 e +30 min). Autenticada por OIDC como as demais rotinas.
   * 200 quando tratou (enviou, reagendou ou mandou para revisão); 503 só se o NOSSO banco falhar, para o Cloud Tasks repetir.
   */
  app.post('/internal/tasks/send-email', async c => {
    if (!deps.jobAuth)
      throw new AppError(503, 'rotinas_nao_configuradas', 'As rotinas internas não estão configuradas.');
    if (!(await deps.jobAuth.verify(c.req.header('authorization'))))
      throw new AppError(401, 'nao_autenticado', 'Não autenticado.');
    if (!mail) return c.json({ status: 'sem_provedor' });
    const parsed = z
      .object({ emailId: z.uuid(), attempt: z.number().int().min(1).max(EMAIL_RETRIES.length) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new AppError(422, 'dados_invalidos', 'Tarefa inválida.');
    try {
      return c.json({ status: 'ok', ...(await handleEmailTask(mail, parsed.data)) });
    } catch (error) {
      logger.error('falha ao processar o reenvio de e-mail', {
        emailId: parsed.data.emailId,
        error: error instanceof Error ? error.name : 'desconhecido',
      });
      throw new AppError(503, 'processamento_pendente', 'Tente novamente.');
    }
  });

  /** Limpeza de dados técnicos pelos prazos configurados (LGPD). Sem prazo configurado, não apaga nada. */
  app.post('/internal/jobs/purge-retention', async c => {
    if (!deps.jobAuth)
      throw new AppError(503, 'rotinas_nao_configuradas', 'As rotinas internas não estão configuradas.');
    if (!(await deps.jobAuth.verify(c.req.header('authorization'))))
      throw new AppError(401, 'nao_autenticado', 'Não autenticado.');
    const result = await purgeExpired({ db: deps.db, clock: deps.clock, config: deps.config });
    logger.info('limpeza de retenção executada', { ...result });
    return c.json({ status: 'ok', ...result });
  });

  // Só no ambiente local, com o gateway fictício: leva o pagamento de um pedido a um estado e entrega a notificação assinada
  // pelo mesmo caminho do webhook real. Permite ver o fluxo até "pago" na interface sem gateway de verdade.
  if (deps.config.APP_ENV === 'local' && deps.config.PAYMENT_GATEWAY === 'mock' && isMock(deps.gateway)) {
    const mock = deps.gateway;
    const states = ['aprovado', 'recusado', 'expirado', 'cancelado', 'estornado', 'contestado'] as const;
    app.post('/dev/mock-gateway/:orderId/:status', async c => {
      const status = c.req.param('status') as (typeof states)[number];
      if (!states.includes(status)) throw new AppError(422, 'dados_invalidos', 'Estado desconhecido.');
      const [order] = await deps.db
        .select({ paymentId: orders.gatewayPaymentId })
        .from(orders)
        .where(eq(orders.id, c.req.param('orderId')))
        .limit(1);
      if (!order?.paymentId) throw new AppError(404, 'nao_encontrado', 'Pedido sem cobrança.');
      mock.simulate.setStatus(order.paymentId, status);
      const body = JSON.stringify({
        id: `evt_${crypto.randomUUID()}`,
        paymentId: order.paymentId,
        type: `payment.${status}`,
      });
      const headers = new Headers({ 'x-mock-signature': mock.simulate.sign(body) });
      const result = await handleNotification(reconcileDeps(mock), { headers, rawBody: body, mayRecordInvalid: false });
      return c.json({ status: result.status, outcome: result.outcome ?? null });
    });
  }

  return app;
}
