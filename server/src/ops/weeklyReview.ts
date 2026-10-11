import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { MAX_EVENT_ATTEMPTS } from '../payments/notifications';

/**
 * Revisão semanal (Anexo II): erros, webhooks não processados, e-mails que falharam e exceções de pagamento. Somente leitura.
 * Nada aqui contém dado pessoal: só contagens, ids de pedido e tipos de evento.
 */
export interface WeeklyReview {
  since: string;
  until: string;
  webhooks: { pending: number; abandoned: number; invalidSignatures: number; oldestPendingAt: string | null };
  emails: { pending: number; failed: number; manualReview: number; oldestPendingAt: string | null };
  orders: {
    paidWithoutStock: number[];
    divergences: number;
    reversalsOutsideFlow: number;
    pendingTooLong: number;
    manualReview: number;
  };
  reservationsActiveButExpired: number;
  attention: string[];
}

const n = (v: unknown) => Number(v ?? 0);

export async function weeklyReview(db: Db, now: Date, days = 7): Promise<WeeklyReview> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const one = async <T extends Record<string, unknown>>(q: ReturnType<typeof sql>) => (await db.execute<T>(q)).rows[0] as T;

  const wh = await one<{ pending: number; abandoned: number; invalid: number; oldest: Date | null }>(sql`
    select count(*) filter (where signature_valid and processed_at is null and attempts < ${MAX_EVENT_ATTEMPTS})::int as pending,
           count(*) filter (where signature_valid and processed_at is null and attempts >= ${MAX_EVENT_ATTEMPTS})::int as abandoned,
           count(*) filter (where not signature_valid and received_at >= ${since})::int as invalid,
           min(received_at) filter (where signature_valid and processed_at is null) as oldest
      from payment_events`);
  const mail = await one<{ pending: number; failed: number; oldest: Date | null }>(sql`
    select count(*) filter (where status = 'pendente')::int as pending,
           count(*) filter (where status = 'falhou')::int as failed,
           min(created_at) filter (where status = 'pendente') as oldest
      from email_log`);
  const emailReview = await one<{ n: number }>(sql`select count(*)::int as n from audit_log where action = 'email.revisao_manual' and created_at >= ${since}`);
  const semEstoque = await db.execute<{ number: number }>(sql`select number from orders where status = 'pago_sem_estoque' order by number`);
  const audit = await one<{ divergent: number; outside: number; review: number }>(sql`
    select count(*) filter (where action = 'pagamento.divergente')::int as divergent,
           count(*) filter (where action = 'pagamento.estorno_fora_de_fluxo')::int as outside,
           count(*) filter (where action = 'conciliacao.revisao_manual')::int as review
      from audit_log where created_at >= ${since}`);
  const stale = await one<{ n: number }>(sql`
    select count(*)::int as n from orders where status = 'pendente' and created_at < ${new Date(now.getTime() - 86_400_000)}`);
  const zombie = await one<{ n: number }>(sql`
    select count(*)::int as n from reservations where status = 'ativa' and expires_at < ${new Date(now.getTime() - 5 * 60_000)}`);

  const review: WeeklyReview = {
    since: since.toISOString(),
    until: now.toISOString(),
    webhooks: {
      pending: n(wh.pending),
      abandoned: n(wh.abandoned),
      invalidSignatures: n(wh.invalid),
      oldestPendingAt: wh.oldest ? new Date(wh.oldest).toISOString() : null,
    },
    emails: { pending: n(mail.pending), failed: n(mail.failed), manualReview: n(emailReview.n), oldestPendingAt: mail.oldest ? new Date(mail.oldest).toISOString() : null },
    orders: {
      paidWithoutStock: semEstoque.rows.map(r => n(r.number)),
      divergences: n(audit.divergent),
      reversalsOutsideFlow: n(audit.outside),
      pendingTooLong: n(stale.n),
      manualReview: n(audit.review),
    },
    reservationsActiveButExpired: n(zombie.n),
    attention: [],
  };
  const a = review.attention;
  if (review.webhooks.abandoned > 0) a.push(`${review.webhooks.abandoned} notificação(ões) de pagamento desistida(s) após ${MAX_EVENT_ATTEMPTS} tentativas: reprocessar à mão ou conferir no gateway.`);
  if (review.webhooks.pending > 0) a.push(`${review.webhooks.pending} notificação(ões) de pagamento ainda pendente(s): conferir se a conciliação agendada está rodando.`);
  if (review.emails.failed > 0) a.push(`${review.emails.failed} e-mail(s) com falha de entrega${review.emails.manualReview > 0 ? ` (${review.emails.manualReview} esgotaram as 4 tentativas na semana: revisão manual, reabrir em /api/admin/emails)` : ''}.`);
  if (review.emails.pending > 0) a.push(`${review.emails.pending} e-mail(s) na fila.`);
  if (review.orders.paidWithoutStock.length > 0) a.push(`Pago sem estoque (pedidos ${review.orders.paidWithoutStock.join(', ')}): o cliente precisa estornar no gateway.`);
  if (review.orders.divergences > 0) a.push(`${review.orders.divergences} pagamento(s) divergente(s) do pedido na semana.`);
  if (review.orders.reversalsOutsideFlow > 0) a.push(`${review.orders.reversalsOutsideFlow} estorno(s) ou chargeback(s) fora de fluxo na semana: revisão manual.`);
  if (review.orders.manualReview > 0) a.push(`${review.orders.manualReview} pedido(s) ainda pendente(s) depois das 3 verificações sob demanda: conferir no gateway (revisão manual).`);
  if (review.orders.pendingTooLong > 0) a.push(`${review.orders.pendingTooLong} pedido(s) pendente(s) há mais de 24 h: a rotina de expiração pode estar parada.`);
  if (review.reservationsActiveButExpired > 0) a.push(`${review.reservationsActiveButExpired} reserva(s) vencida(s) e ainda ativa(s): a rotina de expiração pode estar parada.`);
  return review;
}

export function renderWeeklyReview(r: WeeklyReview): string {
  const out = [`# Revisão semanal: ${r.since.slice(0, 10)} a ${r.until.slice(0, 10)}`, ''];
  out.push(r.attention.length === 0 ? '**Nada exige atenção.**' : '**Exige atenção:**');
  for (const a of r.attention) out.push(`- ${a}`);
  out.push(
    '',
    `Webhooks: ${r.webhooks.pending} pendentes, ${r.webhooks.abandoned} desistidos, ${r.webhooks.invalidSignatures} com assinatura inválida na semana.`,
    `E-mails: ${r.emails.pending} na fila, ${r.emails.failed} com falha.`,
    `Pedidos: ${r.orders.paidWithoutStock.length} pagos sem estoque, ${r.orders.divergences} divergentes, ${r.orders.reversalsOutsideFlow} estornos fora de fluxo, ${r.orders.manualReview} para revisão manual, ${r.orders.pendingTooLong} pendentes há mais de 24 h.`,
    `Reservas vencidas ainda ativas: ${r.reservationsActiveButExpired}.`,
    '',
    'Complete a revisão olhando os logs de erro no Cloud Logging (`severity>=ERROR` e `jsonPayload.alert`), conforme `docs/operacao/README.md`.',
  );
  return out.join('\n') + '\n';
}
