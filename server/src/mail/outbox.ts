import { isRecipientAllowed, NOT_ALLOWED_NOTE, NOT_ALLOWED_REASON } from './allowlist';
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Config } from '../config';
import type { Db } from '../db/client';
import type { Tx } from '../db/audit';
import { emailLog, events, orders, ticketTypes, tickets, users } from '../db/schema';
import { formatInEventZone, formatEventDateTime } from '../domain/time';
import { logger } from '../logger';
import type { Clock } from '../providers/clock';
import type { EmailSender, EmailTemplate, OutgoingEmail } from '../providers/email';
import {
  composeCadastro,
  composeCompra,
  composePagamentoSemEstoque,
  composeRecuperacao,
  type Composed,
  type MailContext,
} from './templates';
import { formatBRL } from '../domain/money';
import { createPasswordResetLink } from '../auth/reset';
import { writeAudit } from '../db/audit';
import { enqueueEmailSafely, type TaskQueue } from '../payments/taskQueue';

/**
 * Fila de e-mails (outbox) sobre `email_log` (RF-36, RF-67). A regra central: **falha de e-mail nunca desfaz pagamento,
 * cadastro ou qualquer outra coisa**. O item é gravado na mesma transação do fato que o gerou (por exemplo, a confirmação do
 * pedido) e a entrega é feita depois, com tentativas, intervalo crescente, estado e alerta.
 *
 * - **Idempotente:** a chave de idempotência é única (`compra:<pedido>`, `cadastro:<usuário>`, `reset:<id>`): enfileirar duas
 *   vezes não cria dois itens.
 * - **Pelo menos uma entrega:** uma queda entre o envio e o registro pode repetir o envio; o `Message-ID` é o mesmo, então o
 *   provedor e o cliente de e-mail enxergam a mesma mensagem.
 * - **Nada sensível guardado:** a fila guarda só quem e o quê (usuário, pedido, modelo). O conteúdo é composto na hora do envio
 *   com dados atuais, e o link de recuperação é gerado **no envio** (token novo, o anterior deixa de valer), então nenhum token
 *   fica em texto no banco.
 */

/**
 * Tentativas de entrega: a primeira (logo depois do fato) e 3 retentativas, agendadas no Cloud Tasks para +2, +10 e +30 minutos
 * depois de cada falha. Esgotadas, o item vira `falhou` (revisão manual) e há alerta. A varredura diária continua só como
 * rede de segurança: pega o que estiver vencido e sem tarefa (tarefa que não pôde ser agendada, instância que caiu).
 */
export const MAX_ATTEMPTS = 4;
/** Espera antes da próxima tentativa, em minutos, conforme o número de tentativas já feitas (1ª falha: 2 min; 2ª: 10; 3ª: 30). */
export const BACKOFF_MINUTES = [2, 10, 30];
/** Tempo em que um item "reservado" por uma execução não é pego por outra. */
const LEASE_MINUTES = 5;

export interface OutboxDeps {
  db: Db;
  clock: Clock;
  mailer: EmailSender;
  config: Pick<Config, 'APP_ENV' | 'PUBLIC_BASE_URL' | 'PORT'> & Partial<Pick<Config, 'partyx' | 'emailAllowlist'>>;
  /** Agenda o reenvio no Cloud Tasks. Ausente (local, testes): só a varredura retoma o item. */
  taskQueue?: TaskQueue;
}

export interface EnqueueInput {
  userId: string;
  orderId?: string;
  template: EmailTemplate;
  idempotencyKey: string;
}

/** Grava o item na fila. Chamar dentro da transação do fato que o motivou. Devolve falso se já existia. */
export async function enqueueEmail(db: Db | Tx, clock: Clock, input: EnqueueInput): Promise<boolean> {
  const rows = await db
    .insert(emailLog)
    .values({
      userId: input.userId,
      orderId: input.orderId ?? null,
      template: input.template,
      idempotencyKey: input.idempotencyKey,
      status: 'pendente',
      nextAttemptAt: clock.now(),
      createdAt: clock.now(),
    })
    .onConflictDoNothing()
    .returning({ id: emailLog.id });
  return rows.length > 0;
}

export const mailContext = (config: OutboxDeps['config']): MailContext => ({
  baseUrl: (config.PUBLIC_BASE_URL ?? `http://localhost:${config.PORT}`).replace(/\/$/, ''),
  environmentLabel: config.APP_ENV === 'producao' ? null : config.APP_ENV === 'homologacao' ? 'HOMOLOGAÇÃO' : 'LOCAL',
  partyx: config.partyx,
});

/** `Reply-To` dos e-mails: o configurado ou, na falta, o e-mail de atendimento da PartyX. Nunca um endereço da contratada. */
export const replyToFor = (config: Pick<Config, 'EMAIL_REPLY_TO' | 'partyx'>): string | undefined =>
  config.EMAIL_REPLY_TO ?? config.partyx.supportEmail ?? undefined;

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

type Row = typeof emailLog.$inferSelect;
type Skip = { skip: string };

/** Compõe a mensagem com os dados atuais. `{ skip }` quando o e-mail deixou de fazer sentido (não é erro nem alerta). */
async function compose(
  deps: OutboxDeps,
  row: Row,
): Promise<(Composed & { to: string; data: Record<string, string> }) | Skip> {
  if (!row.userId) return { skip: 'sem_usuario' };
  const [user] = await deps.db
    .select({ name: users.name, email: users.email, isActive: users.isActive, role: users.role })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  if (!user || !user.isActive) return { skip: 'usuario_inativo' };
  const ctx = mailContext(deps.config);
  const name = firstName(user.name);

  if (row.template === 'cadastro') {
    return { ...composeCadastro({ name }, ctx), to: user.email, data: { name } };
  }

  if (row.template === 'recuperacao_senha') {
    // Link novo a cada tentativa: nenhum token fica guardado, e o anterior deixa de valer.
    const link = await createPasswordResetLink(deps, row.userId);
    return { ...composeRecuperacao({ name, link }, ctx), to: user.email, data: { name, link } };
  }

  if (row.template === 'pagamento_sem_estoque') {
    // Só para quem ainda é administrador, e só enquanto o pedido continua nessa exceção.
    if (user.role !== 'administrador') return { skip: 'nao_e_administrador' };
    if (!row.orderId) return { skip: 'sem_pedido' };
    const [o] = await deps.db
      .select({
        number: orders.number,
        status: orders.status,
        totalCents: orders.totalCents,
        paidAt: orders.paidAt,
        gatewayPaymentId: orders.gatewayPaymentId,
        eventName: events.name,
        buyerName: users.name,
        buyerEmail: users.email,
      })
      .from(orders)
      .innerJoin(events, eq(events.id, orders.eventId))
      .innerJoin(users, eq(users.id, orders.userId))
      .where(eq(orders.id, row.orderId))
      .limit(1);
    if (!o || o.status !== 'pago_sem_estoque') return { skip: 'pedido_fora_da_excecao' };
    const data = {
      orderNumber: `PX-${o.number}`,
      eventName: o.eventName,
      buyerName: o.buyerName,
      buyerEmail: o.buyerEmail,
      amount: formatBRL(o.totalCents),
      paidAt: o.paidAt ? formatEventDateTime(o.paidAt).replace(' ', ' às ') : 'não informado',
      gatewayRef: o.gatewayPaymentId ?? 'não informada',
    };
    // Só o número do pedido vai para os metadados da mensagem (nada do comprador).
    return { ...composePagamentoSemEstoque(data, ctx), to: user.email, data: { orderNumber: data.orderNumber } };
  }

  // compra_confirmada
  if (!row.orderId) return { skip: 'sem_pedido' };
  const [order] = await deps.db
    .select({
      number: orders.number,
      status: orders.status,
      paidAt: orders.paidAt,
      startsAt: events.startsAt,
      eventName: events.name,
      venue: events.venue,
      allowsMinors: events.allowsMinors,
      id: orders.id,
    })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .where(eq(orders.id, row.orderId))
    .limit(1);
  // Só pedido pago, e ainda com ingresso válido. Se foi estornado antes de o e-mail sair, ele não vai: diria o contrário da verdade.
  if (!order || order.status !== 'pago' || !order.paidAt) return { skip: 'pedido_nao_pago' };
  const units = await deps.db
    .select({ type: ticketTypes.name, n: sql<number>`count(*)::int` })
    .from(tickets)
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(and(eq(tickets.orderId, order.id), eq(tickets.status, 'valido')))
    .groupBy(ticketTypes.name);
  const total = units.reduce((t, u) => t + u.n, 0);
  if (total === 0) return { skip: 'sem_ingressos' };
  const data = {
    name: user.name,
    eventName: order.eventName,
    eventDate: formatInEventZone(order.startsAt, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    eventTime: formatInEventZone(order.startsAt, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    venue: order.venue,
    orderNumber: `PX-${order.number}`,
    units: total === 1 ? '1 ingresso' : `${total} ingressos`,
    paidAt: formatEventDateTime(order.paidAt).replace(' ', ' às '),
    lines: units.map(u => `${u.n} × ${u.type}`),
    // Página do site que exige entrar na conta e baixa a autorização do pedido (o e-mail nunca leva o PDF nem dado do menor).
    minorAuthorizationUrl: order.allowsMinors ? `${ctx.baseUrl}/autorizacao-menor/pedido/${order.id}` : null,
  };
  const composed = composeCompra(data, ctx);
  return {
    ...composed,
    to: user.email,
    data: { name: user.name, orderNumber: data.orderNumber, eventName: data.eventName },
  };
}

const messageIdFor = (key: string, host: string) =>
  `<${createHash('sha256').update(key).digest('hex').slice(0, 32)}@${host}>`;

export interface ProcessResult {
  claimed: number;
  sent: number;
  retry: number;
  failed: number;
  skipped: number;
}

/**
 * Entrega os itens vencidos da fila. Segura com execuções simultâneas: cada item é "reservado" por 5 minutos
 * (`FOR UPDATE SKIP LOCKED` e avanço de `next_attempt_at`), então duas execuções pegam itens diferentes. O envio acontece
 * **fora** de qualquer transação.
 */
export async function processOutbox(
  deps: OutboxDeps,
  options: { limit?: number; orderId?: string; userId?: string; emailId?: string } = {},
): Promise<ProcessResult> {
  const now = deps.clock.now();
  const lease = new Date(now.getTime() + LEASE_MINUTES * 60_000);
  const filter = [
    options.orderId ? sql`and order_id = ${options.orderId}` : sql``,
    options.userId ? sql`and user_id = ${options.userId}` : sql``,
    options.emailId ? sql`and id = ${options.emailId}` : sql``,
  ];
  const claimed = await deps.db.execute<{ id: string; idempotency_key: string; attempts: number }>(sql`
    update email_log set attempts = attempts + 1, next_attempt_at = ${lease}
     where id in (
       select id from email_log
        where status = 'pendente' and next_attempt_at <= ${now} ${filter[0]} ${filter[1]} ${filter[2]}
        order by next_attempt_at asc
        limit ${options.limit ?? 25}
        for update skip locked)
    returning id, idempotency_key, attempts`);

  const result: ProcessResult = { claimed: claimed.rows.length, sent: 0, retry: 0, failed: 0, skipped: 0 };
  const host = (() => {
    try {
      return new URL(mailContext(deps.config).baseUrl).hostname;
    } catch {
      return 'partyx.invalid';
    }
  })();

  for (const item of claimed.rows) {
    const [row] = await deps.db.select().from(emailLog).where(eq(emailLog.id, item.id)).limit(1);
    if (!row) continue;
    try {
      const composed = await compose(deps, row);
      if ('skip' in composed) {
        // Não é falha: o fato mudou. Fica registrado como "falhou" com o motivo, **sem alerta**.
        await deps.db
          .update(emailLog)
          .set({ status: 'falhou', lastError: `nao_aplicavel:${composed.skip}` })
          .where(eq(emailLog.id, row.id));
        result.skipped++;
        continue;
      }
      // Homologação com entrega real: fora da lista, nada sai. Fica registrado, sem alerta e sem erro para quem usa a tela;
      // o administrador pode reabrir depois de a lista mudar. Em produção a lista é sempre nula.
      if (deps.config.APP_ENV !== 'producao' && !isRecipientAllowed(deps.config.emailAllowlist, composed.to)) {
        await deps.db
          .update(emailLog)
          .set({ status: 'falhou', lastError: NOT_ALLOWED_REASON })
          .where(eq(emailLog.id, row.id));
        result.skipped++;
        continue;
      }
      const message: OutgoingEmail = {
        template: row.template,
        to: composed.to,
        data: composed.data,
        subject: composed.subject,
        text: composed.text,
        html: composed.html,
        messageId: messageIdFor(row.idempotencyKey, host),
      };
      await deps.mailer.send(message);
      await deps.db
        .update(emailLog)
        .set({ status: 'enviado', sentAt: deps.clock.now(), lastError: null })
        .where(and(eq(emailLog.id, row.id), eq(emailLog.status, 'pendente')));
      result.sent++;
    } catch (error) {
      // Só o nome do erro: nunca o texto (pode ter endereço, token ou resposta do provedor).
      const name = error instanceof Error ? error.name : 'erro';
      const exhausted = item.attempts >= MAX_ATTEMPTS;
      if (exhausted) {
        await deps.db.update(emailLog).set({ status: 'falhou', lastError: name }).where(eq(emailLog.id, row.id));
        // Marcado para revisão manual: fica na trilha e o alerta avisa quem opera (lista em GET /api/admin/emails, reabrir em /retry).
        await deps.db.transaction(tx =>
          writeAudit(tx, {
            actorId: null,
            action: 'email.revisao_manual',
            entity: 'email',
            entityId: row.id,
            before: { status: 'pendente' },
            after: { status: 'falhou', tentativas: item.attempts, modelo: row.template },
            reason: `E-mail não entregue depois de ${MAX_ATTEMPTS} tentativas (${name}). Conferir o provedor de e-mail e reabrir.`,
            at: deps.clock.now(),
          }),
        );
        logger.error('e-mail não entregue depois de todas as tentativas', {
          emailId: row.id,
          template: row.template,
          error: name,
          attempts: item.attempts,
          alert: 'email_falhou',
        });
        result.failed++;
      } else {
        const wait = BACKOFF_MINUTES[Math.min(item.attempts - 1, BACKOFF_MINUTES.length - 1)]!;
        await deps.db
          .update(emailLog)
          .set({ lastError: name, nextAttemptAt: new Date(deps.clock.now().getTime() + wait * 60_000) })
          .where(eq(emailLog.id, row.id));
        const scheduled = await enqueueEmailSafely(deps.taskQueue, {
          emailId: row.id,
          attempt: item.attempts,
          delaySeconds: wait * 60,
        });
        logger.warn('falha ao entregar e-mail; nova tentativa agendada', {
          emailId: row.id,
          template: row.template,
          error: name,
          attempts: item.attempts,
          waitMinutes: wait,
          viaCloudTasks: scheduled,
        });
        result.retry++;
      }
    }
  }
  return result;
}

export type EmailTaskOutcome = 'enviado' | 'reagendado' | 'revisao_manual' | 'ja_resolvido' | 'adiado' | 'sem_email';

/**
 * Tarefa do Cloud Tasks: tenta entregar UM e-mail. Idempotente: repetir a mesma tarefa não reenvia (o item é reservado por
 * `FOR UPDATE SKIP LOCKED` e só é pego quando vence). Falha de envio não é erro da tarefa: ela se reagenda (ou vai para revisão).
 * Só uma falha do nosso banco sobe, para o Cloud Tasks repetir.
 */
export async function handleEmailTask(
  deps: OutboxDeps,
  input: { emailId: string },
): Promise<{ outcome: EmailTaskOutcome }> {
  const result = await processOutbox(deps, { emailId: input.emailId, limit: 1 });
  if (result.sent > 0) return { outcome: 'enviado' };
  if (result.failed > 0) return { outcome: 'revisao_manual' };
  if (result.retry > 0) return { outcome: 'reagendado' };
  if (result.skipped > 0) return { outcome: 'ja_resolvido' };
  const [row] = await deps.db
    .select({ status: emailLog.status, nextAttemptAt: emailLog.nextAttemptAt })
    .from(emailLog)
    .where(eq(emailLog.id, input.emailId))
    .limit(1);
  if (!row) return { outcome: 'sem_email' };
  if (row.status !== 'pendente') return { outcome: 'ja_resolvido' };
  // Pendente, mas ainda não venceu (outra execução está com ele, ou a tarefa chegou antes da hora): a varredura diária cobre.
  return { outcome: 'adiado' };
}

/** Tenta entregar já, sem atrapalhar quem pediu: espera no máximo `ms` e nunca lança. O resto continua pela fila. */
export async function processSoon(
  deps: OutboxDeps,
  options: Parameters<typeof processOutbox>[1],
  ms = 3000,
): Promise<void> {
  try {
    await Promise.race([processOutbox(deps, options), new Promise<void>(resolve => setTimeout(resolve, ms).unref())]);
  } catch (error) {
    logger.error('falha ao processar a fila de e-mails', {
      error: error instanceof Error ? error.name : 'desconhecido',
    });
  }
}

/** Reabre para nova tentativa um e-mail que esgotou as tentativas (ação do administrador). A entrega é tentada logo em seguida pela rota. */
export async function reopenEmail(db: Db | Tx, clock: Clock, id: string): Promise<boolean> {
  const rows = await db
    .update(emailLog)
    .set({ status: 'pendente', attempts: 0, nextAttemptAt: clock.now(), lastError: null })
    .where(
      and(eq(emailLog.id, id), eq(emailLog.status, 'falhou'), sql`${emailLog.lastError} not like 'nao_aplicavel:%'`),
    )
    .returning({ id: emailLog.id });
  return rows.length > 0;
}

export async function listEmails(db: Db, filter: { status?: 'pendente' | 'enviado' | 'falhou' }) {
  const rows = await db
    .select({
      id: emailLog.id,
      template: emailLog.template,
      status: emailLog.status,
      attempts: emailLog.attempts,
      nextAttemptAt: emailLog.nextAttemptAt,
      lastError: emailLog.lastError,
      sentAt: emailLog.sentAt,
      createdAt: emailLog.createdAt,
      orderId: emailLog.orderId,
    })
    .from(emailLog)
    .where(filter.status ? eq(emailLog.status, filter.status) : undefined)
    .orderBy(sql`${emailLog.createdAt} desc`)
    .limit(200);
  // O estado do banco só tem pendente, enviado e falhou: o item barrado pela lista de homologação sai com a explicação.
  return rows.map(r => ({ ...r, note: r.lastError === NOT_ALLOWED_REASON ? NOT_ALLOWED_NOTE : null }));
}
