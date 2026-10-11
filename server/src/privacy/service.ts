import { randomBytes } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  auditLog,
  consents,
  emailLog,
  events,
  loginAttempts,
  orderItems,
  orders,
  passwordResets,
  paymentEvents,
  sessions,
  ticketTypes,
  tickets,
  users,
} from '../db/schema';
import { writeAudit } from '../db/audit';
import { onlyDigits } from '../domain/cpf';
import { AppError } from '../domain/errors';
import type { PasswordHasher } from '../providers/passwordHasher';
import type { Clock } from '../providers/clock';

/**
 * Direitos do titular (LGPD), atendidos **a pedido da PartyX** (controladora). A PartyX decide e registra o pedido; estes
 * mecanismos só executam, com trilha de auditoria. Nenhum prazo de retenção legal é presumido: o que a lei, o contrato ou a
 * contabilidade exigirem manter fica de fora da remoção (pedidos, valores, ingressos, pagamentos e a própria auditoria), e
 * quem decide por quanto tempo é a PartyX (docs/lgpd.md).
 */
export interface PrivacyDeps {
  db: Db;
  clock: Clock;
  hasher: PasswordHasher;
}

export const REMOVED_NAME = 'Titular removido';
const PII_KEY = /(e-?mail|name|nome|cpf|document|identification|phone|telefone|payer|holder|address|ip)/i;

/** Troca por "[removido]" tudo o que, em um JSON de gateway, tem cara de dado pessoal. Estrutura e valores financeiros ficam. */
export function scrubPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubPayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        PII_KEY.test(k) && (typeof v === 'string' || typeof v === 'number' || (v && typeof v === 'object'))
          ? '[removido]'
          : scrubPayload(v),
      ]),
    );
  }
  return value;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Localiza um titular por e-mail ou CPF exatos. Sem listagem: quem consulta já conhece o dado. */
export async function findSubject(deps: PrivacyDeps, by: { email?: string; cpf?: string }) {
  const email = by.email?.trim().toLowerCase();
  const cpf = by.cpf ? onlyDigits(by.cpf) : null;
  if (!email && !cpf) throw new AppError(422, 'dados_invalidos', 'Informe o e-mail ou o CPF do titular.');
  const [row] = await deps.db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      anonymizedAt: users.anonymizedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(email ? eq(users.email, email) : eq(users.cpf, cpf!))
    .limit(1);
  if (!row) throw new AppError(404, 'nao_encontrado', 'Titular não encontrado.');
  return { ...row, createdAt: row.createdAt.toISOString(), anonymizedAt: iso(row.anonymizedAt) };
}

/**
 * Cópia dos dados do titular (acesso, RF/LGPD). Inclui o CPF e os dados que ele próprio informou; **não** inclui hashes de
 * senha e de token, código de assinatura do QR nem identificadores internos do gateway.
 */
export async function exportSubjectData(deps: PrivacyDeps, userId: string) {
  const [u] = await deps.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new AppError(404, 'nao_encontrado', 'Titular não encontrado.');
  const consentRows = await deps.db.select().from(consents).where(eq(consents.userId, userId));
  const orderRows = await deps.db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      totalCents: orders.totalCents,
      paymentMethod: orders.paymentMethod,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      eventName: events.name,
    })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .where(eq(orders.userId, userId))
    .orderBy(orders.createdAt);
  const orderIds = orderRows.map(o => o.id);
  const itemRows = orderIds.length
    ? await deps.db
        .select({
          orderId: orderItems.orderId,
          type: ticketTypes.name,
          quantity: orderItems.quantity,
          unit: orderItems.unitPriceCents,
        })
        .from(orderItems)
        .innerJoin(ticketTypes, eq(ticketTypes.id, orderItems.ticketTypeId))
        .where(inArray(orderItems.orderId, orderIds))
    : [];
  const ticketRows = orderIds.length
    ? await deps.db
        .select({
          shortCode: tickets.shortCode,
          orderId: tickets.orderId,
          holderName: tickets.holderName,
          status: tickets.status,
          usedAt: tickets.usedAt,
          type: ticketTypes.name,
        })
        .from(tickets)
        .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
        .where(inArray(tickets.orderId, orderIds))
    : [];
  const sessionRows = await deps.db.select().from(sessions).where(eq(sessions.userId, userId));
  const mailRows = await deps.db
    .select({ template: emailLog.template, status: emailLog.status, sentAt: emailLog.sentAt })
    .from(emailLog)
    .where(eq(emailLog.userId, userId));
  return {
    generatedAt: deps.clock.now().toISOString(),
    subject: {
      id: u.id,
      name: u.name,
      email: u.email,
      cpf: u.cpf,
      phone: u.phone,
      role: u.role,
      active: u.isActive,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: iso(u.lastLoginAt),
      anonymizedAt: iso(u.anonymizedAt),
    },
    consents: consentRows.map(c => ({
      termsVersion: c.termsVersion,
      privacyVersion: c.privacyVersion,
      acceptedAt: c.acceptedAt.toISOString(),
      ip: c.ip,
      userAgent: c.userAgent,
    })),
    orders: orderRows.map(o => ({
      number: o.number,
      status: o.status,
      totalCents: o.totalCents,
      paymentMethod: o.paymentMethod,
      createdAt: o.createdAt.toISOString(),
      paidAt: iso(o.paidAt),
      event: o.eventName,
      items: itemRows
        .filter(i => i.orderId === o.id)
        .map(i => ({ type: i.type, quantity: i.quantity, unitPriceCents: i.unit })),
      tickets: ticketRows
        .filter(t => t.orderId === o.id)
        .map(t => ({
          code: t.shortCode,
          type: t.type,
          holderName: t.holderName,
          status: t.status,
          usedAt: iso(t.usedAt),
        })),
    })),
    emails: mailRows.map(m => ({ template: m.template, status: m.status, sentAt: iso(m.sentAt) })),
    sessions: sessionRows.map(s => ({
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      revoked: s.revokedAt !== null,
      ip: s.ip,
      userAgent: s.userAgent,
    })),
    notIncluded:
      'Hashes de senha e de token, assinatura do QR Code e identificadores internos do gateway de pagamento.',
  };
}

export interface AnonymizeInput {
  /** Número do pedido da PartyX (protocolo, e-mail ou ticket) que originou a solicitação. Obrigatório. */
  reference: string;
  reason: string;
  /** Ciência de que o titular ainda tem ingressos válidos de evento futuro (continuam válidos, com o nome removido). */
  acknowledgeValidTickets?: boolean;
}

/**
 * Remove os dados pessoais do titular **sem apagar a história**: pedidos, valores, pagamentos e ingressos continuam (retenção
 * contratual, fiscal e de auditoria é da PartyX), mas deixam de apontar para uma pessoa identificável. Uma transação só.
 */
export async function anonymizeSubject(deps: PrivacyDeps, adminId: string, userId: string, input: AnonymizeInput) {
  const reference = input.reference.trim();
  const reason = input.reason.trim();
  if (reference.length < 3 || reference.length > 100)
    throw new AppError(422, 'dados_invalidos', 'Informe o protocolo da solicitação da PartyX.');
  if (reason.length < 10 || reason.length > 500)
    throw new AppError(422, 'dados_invalidos', 'Descreva o motivo (10 a 500 caracteres).');
  const unusable = await deps.hasher.hash(randomBytes(32).toString('base64url'));
  const now = deps.clock.now();

  return deps.db.transaction(async tx => {
    const locked = await tx.execute<{ id: string }>(sql`select id from users where id = ${userId} for update`);
    if (locked.rows.length === 0) throw new AppError(404, 'nao_encontrado', 'Titular não encontrado.');
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) throw new AppError(404, 'nao_encontrado', 'Titular não encontrado.');
    if (u.anonymizedAt) throw new AppError(409, 'ja_anonimizado', 'Os dados deste titular já foram removidos.');
    if (u.role !== 'cliente')
      throw new AppError(
        422,
        'perfil_nao_permitido',
        'Só dados de comprador são removidos aqui. Para a equipe, desative o acesso.',
      );

    const open = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from orders where user_id = ${userId} and status = 'pendente'`,
    );
    if ((open.rows[0]?.n ?? 0) > 0)
      throw new AppError(
        409,
        'pedido_pendente',
        'Há pedido aguardando pagamento. Aguarde expirar ou cancele antes de remover os dados.',
      );

    const future = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from tickets t join orders o on o.id = t.order_id join events e on e.id = t.event_id
       where o.user_id = ${userId} and t.status = 'valido' and e.starts_at > ${now}`);
    const validFuture = future.rows[0]?.n ?? 0;
    if (validFuture > 0 && !input.acknowledgeValidTickets)
      throw new AppError(
        409,
        'ingressos_validos',
        `O titular tem ${validFuture} ingresso(s) válido(s) de evento futuro. Eles continuam valendo, com o nome removido. Confirme para prosseguir.`,
        [{ campo: 'acknowledgeValidTickets', mensagem: String(validFuture) }],
      );

    const orderIds = (await tx.select({ id: orders.id }).from(orders).where(eq(orders.userId, userId))).map(o => o.id);
    const oldEmail = u.email;

    await tx
      .update(users)
      .set({
        name: REMOVED_NAME,
        email: `removido-${userId}@removido.invalid`,
        cpf: null,
        phone: null,
        passwordHash: unusable,
        isActive: false,
        anonymizedAt: now,
      })
      .where(eq(users.id, userId));

    let ticketsAnonymized = 0;
    if (orderIds.length) {
      const t = await tx
        .update(tickets)
        .set({ holderName: REMOVED_NAME })
        .where(inArray(tickets.orderId, orderIds))
        .returning({ id: tickets.id });
      ticketsAnonymized = t.length;
      const evs = await tx.select().from(paymentEvents).where(inArray(paymentEvents.orderId, orderIds));
      for (const ev of evs)
        await tx
          .update(paymentEvents)
          .set({ payloadJson: scrubPayload(ev.payloadJson) })
          .where(eq(paymentEvents.id, ev.id));
    }
    await tx.update(consents).set({ ip: null, userAgent: null }).where(eq(consents.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(passwordResets).where(eq(passwordResets.userId, userId));
    await tx.delete(loginAttempts).where(eq(loginAttempts.emailNormalized, oldEmail));

    // A trilha de auditoria não guarda dado pessoal: só quem pediu, o protocolo da PartyX e contagens.
    await writeAudit(tx, {
      actorId: adminId,
      action: 'privacidade.anonimizacao',
      entity: 'user',
      entityId: userId,
      before: null,
      after: { protocolo: reference, ordersKept: orderIds.length, ticketsAnonymized, validFutureTickets: validFuture },
      reason,
      at: now,
    });
    return {
      userId,
      anonymizedAt: now.toISOString(),
      ordersKept: orderIds.length,
      ticketsAnonymized,
      validFutureTickets: validFuture,
    };
  });
}

/** Consulta e cópia também ficam na trilha: quem acessou dado pessoal de quem, a pedido de qual protocolo. */
export async function auditAccess(
  deps: Pick<PrivacyDeps, 'db' | 'clock'>,
  adminId: string,
  action: 'consulta' | 'exportacao',
  userId: string,
  reference: string | null,
) {
  await deps.db.insert(auditLog).values({
    actorId: adminId,
    action: `privacidade.${action}`,
    entity: 'user',
    entityId: userId,
    beforeJson: null,
    afterJson: { protocolo: reference },
    reason: null,
    createdAt: deps.clock.now(),
  });
}
