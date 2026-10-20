import { createHash } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { writeAudit, type Tx } from '../db/audit';
import { events, orders, ticketMinorAcceptances, ticketTransfers, tickets, users } from '../db/schema';
import { ADULT_AGE, ageOnEvent, MIN_AGE, purchaseAge } from '../domain/age';
import { isValidCpf, onlyDigits } from '../domain/cpf';
import { AppError } from '../domain/errors';
import { assertRecipientAuthorized } from '../events/access';
import { isEmailFormat, maskName, normalizeEmail } from '../domain/identity';
import { newShortCode, newTicketCode, signQr } from '../domain/ticketCode';
import { legalVersion, minorDocsBlockers } from '../legal/documents';
import { enqueueEmail } from '../mail/outbox';
import type { RequestMeta } from '../auth/types';
import type { Clock } from '../providers/clock';

/**
 * Transferência de ingresso (D-87, mudança de escopo de 15/10/2026; Política de Cancelamento, Troca e Reembolso, seção 2).
 *
 * O titular passa um ingresso válido para outra conta de cliente até 2 horas antes do início do evento. A mesma linha do ingresso muda
 * de titular, com código, código curto e QR novos (o antigo deixa de valer, inclusive em cópias); o pedido, o pagamento e o reembolso
 * continuam do comprador. Tudo numa transação: trava o pedido e depois o ingresso (a mesma ordem do estorno, `reconcile.ts`), confere de
 * novo que o ingresso é de quem pede, troca o titular, grava o histórico (`ticket_transfers`), a trilha e os e-mails na fila.
 */

export const TRANSFER_DEADLINE_MS = 2 * 60 * 60 * 1000;

export type TransferDeps = {
  db: Db;
  clock: Clock;
  config: Pick<
    Config,
    'APP_ENV' | 'legal' | 'legalContentDir' | 'cancellationVersion' | 'minorTermVersion' | 'minorAuthorizationVersion'
  > &
    Pick<Config, 'qr' | 'legalDates'>;
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Ingresso com o que a transferência confere. */
type Held = {
  id: string;
  orderId: string;
  status: 'valido' | 'utilizado' | 'cancelado';
  holderUserId: string;
  code: string;
  shortCode: string;
  orderStatus: string;
  buyerId: string;
  eventId: string;
  eventStatus: string;
  archivedAt: Date | null;
  startsAt: Date;
  allowsMinors: boolean;
  isPrivate: boolean;
};

const heldColumns = {
  id: tickets.id,
  orderId: tickets.orderId,
  status: tickets.status,
  holderUserId: tickets.holderUserId,
  code: tickets.code,
  shortCode: tickets.shortCode,
  orderStatus: orders.status,
  buyerId: orders.userId,
  eventId: events.id,
  eventStatus: events.status,
  archivedAt: events.archivedAt,
  startsAt: events.startsAt,
  allowsMinors: events.allowsMinors,
  isPrivate: events.isPrivate,
};

async function loadHeld(db: Db | Tx, ticketId: string, lock: boolean): Promise<Held | undefined> {
  const query = db
    .select(heldColumns)
    .from(tickets)
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .innerJoin(events, eq(events.id, tickets.eventId))
    .where(eq(tickets.id, ticketId))
    .limit(1);
  const [row] = lock ? await query.for('update', { of: tickets }) : await query;
  return row as Held | undefined;
}

/** O ingresso pode sair da conta de `userId` agora? Lança a recusa com a mensagem para a tela. */
function assertTransferable(t: Held | undefined, userId: string, now: Date): asserts t is Held {
  // De outra conta: 404, como se não existisse (a mesma regra de "Meus ingressos").
  if (!t || t.holderUserId !== userId) throw new AppError(404, 'nao_encontrado', 'Ingresso não encontrado.');
  const refuse = (message: string) => {
    throw new AppError(409, 'transferencia_indisponivel', message);
  };
  if (t.status === 'utilizado') refuse('Ingresso já utilizado não pode ser transferido.');
  if (t.status === 'cancelado') refuse('Ingresso cancelado não pode ser transferido.');
  if (t.orderStatus !== 'pago') refuse('Ingresso de pedido estornado, contestado ou cancelado não pode ser transferido.');
  if (t.eventStatus !== 'publicado' || t.archivedAt) refuse('Este evento não aceita mais transferências.');
  if (now.getTime() > t.startsAt.getTime() - TRANSFER_DEADLINE_MS)
    refuse('O prazo para transferir terminou: a transferência vai até 2 horas antes do início do evento.');
}

/** Conta de destino pronta para receber. */
export interface Recipient {
  id: string;
  name: string;
  masked: string;
  /** 16 ou 17 anos na data do evento: aceita o Termo de Ciência ao receber, e o QR só aparece depois. */
  minor: boolean;
  age: number;
}

/**
 * Acha a conta de destino pelo e-mail ou pelo CPF e confere se ela pode receber o ingresso deste evento. As recusas de idade usam a
 * mesma mensagem (quem transfere não fica sabendo a idade da outra pessoa).
 */
async function findRecipient(
  db: Db | Tx,
  config: TransferDeps['config'],
  senderId: string,
  raw: string,
  event: { eventId: string; isPrivate: boolean; startsAt: Date; allowsMinors: boolean },
): Promise<Recipient> {
  const value = raw.trim();
  let where;
  if (value.includes('@')) {
    const email = normalizeEmail(value);
    if (!isEmailFormat(email)) throw invalidDestination();
    where = eq(users.email, email);
  } else {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11 || !isValidCpf(cpf)) throw invalidDestination();
    where = eq(users.cpf, cpf);
  }
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      anonymizedAt: users.anonymizedAt,
      birthDate: users.birthDate,
    })
    .from(users)
    .where(where)
    .limit(1);
  if (!user || user.role !== 'cliente' || !user.isActive || user.anonymizedAt)
    throw new AppError(
      404,
      'conta_nao_encontrada',
      'Não encontramos uma conta de cliente com esse e-mail ou CPF. Quem recebe precisa ter conta na PartyX.',
    );
  if (user.id === senderId) throw new AppError(422, 'mesma_conta', 'Este ingresso já está na sua conta.');
  // Evento privado (D-92): só para conta autorizada na lista do evento, na prévia e na confirmação.
  await assertRecipientAuthorized(db, { id: event.eventId, isPrivate: event.isPrivate }, user.id);
  if (!user.birthDate)
    throw new AppError(
      409,
      'destino_sem_data_nascimento',
      'Essa conta ainda não tem data de nascimento. Peça para a pessoa informar a data em Minha conta e tente de novo.',
    );
  const age = purchaseAge(user.birthDate, event);
  if (!age.ok)
    throw new AppError(
      403,
      'destino_classificacao',
      'Essa conta não pode receber ingresso deste evento por causa da classificação etária ou da idade mínima de 16 anos.',
    );
  if (age.minor) {
    const blockers = minorDocsBlockers(config);
    if (blockers.length || !legalVersion(config, 'termo-menor'))
      throw new AppError(503, 'termo_menor_indisponivel', 'A transferência para menores de idade está indisponível no momento.');
  }
  return { id: user.id, name: user.name, masked: maskName(user.name), minor: age.minor, age: age.age };
}

const invalidDestination = () =>
  new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', [
    { campo: 'destination', mensagem: 'Informe o e-mail ou o CPF da conta de destino.' },
  ]);

/** Conferência antes de confirmar: só o nome mascarado de quem vai receber. Nada muda. */
export async function previewTransfer(
  deps: TransferDeps,
  userId: string,
  ticketId: string,
  destination: string,
): Promise<{ recipient: string; allowsMinors: boolean }> {
  const held = await loadHeld(deps.db, ticketId, false);
  assertTransferable(held, userId, deps.clock.now());
  const recipient = await findRecipient(deps.db, deps.config, userId, destination, held);
  return { recipient: recipient.masked, allowsMinors: held.allowsMinors };
}

/** Novo código, código curto e QR do ingresso, gravados com o titular novo. Tenta de novo na colisão rara do código curto. */
async function reissue(
  tx: Tx,
  config: TransferDeps['config'],
  t: Held,
  set: { holderUserId: string; holderName: string; holderMinor: boolean | null },
  expectedHolder: string,
): Promise<{ shortCode: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newTicketCode();
    const shortCode = newShortCode();
    try {
      // Ponto de salvamento: uma colisão no código curto desfaz só esta tentativa, não a transação.
      const updated = await tx.transaction(async sp =>
        sp
          .update(tickets)
          .set({
            ...set,
            code,
            shortCode,
            qrPayload: signQr(config.qr.keys, config.qr.currentVersion, t.eventId, code),
            qrKeyVersion: config.qr.currentVersion,
          })
          .where(and(eq(tickets.id, t.id), eq(tickets.holderUserId, expectedHolder), eq(tickets.status, 'valido')))
          .returning({ id: tickets.id }),
      );
      if (updated.length === 0) throw new AppError(409, 'transferencia_indisponivel', 'Este ingresso não está mais na sua conta.');
      return { shortCode };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error('não foi possível gerar um código novo para o ingresso');
}

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';

/** `holder_minor` do titular novo: nulo quando o ingresso volta para quem comprou (vale o pedido, com o termo aceito na compra). */
const holderMinorFor = (t: Held, recipient: { id: string; minor: boolean }) =>
  recipient.id === t.buyerId ? null : recipient.minor;

/**
 * Transfere. Devolve o nome mascarado de quem recebeu e o código curto novo. As duas mensagens (para quem transferiu e para quem
 * recebeu) vão para a fila na mesma transação; quem chama tenta entregá-las logo depois (`processSoon`).
 */
export async function transferTicket(
  deps: TransferDeps,
  userId: string,
  ticketId: string,
  destination: string,
): Promise<{ transferId: string; recipient: string; recipientId: string; shortCode: string }> {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    // Pedido antes do ingresso: a mesma ordem do estorno, que trava o pedido e depois cancela os ingressos dele.
    const [ref] = await tx.select({ orderId: tickets.orderId }).from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ref) throw new AppError(404, 'nao_encontrado', 'Ingresso não encontrado.');
    await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, ref.orderId)).for('share');
    const held = await loadHeld(tx, ticketId, true);
    assertTransferable(held, userId, now);
    const recipient = await findRecipient(tx, deps.config, userId, destination, held);
    const { shortCode } = await reissue(
      tx,
      deps.config,
      held,
      { holderUserId: recipient.id, holderName: recipient.name, holderMinor: holderMinorFor(held, recipient) },
      userId,
    );
    const [row] = await tx
      .insert(ticketTransfers)
      .values({
        ticketId: held.id,
        eventId: held.eventId,
        fromUserId: userId,
        toUserId: recipient.id,
        actorId: userId,
        oldShortCode: held.shortCode,
        newShortCode: shortCode,
        oldCodeSha256: sha256(held.code),
        createdAt: now,
      })
      .returning({ id: ticketTransfers.id });
    const transferId = row!.id;
    // Na trilha, só contas e códigos curtos (nunca o código secreto nem o QR).
    await writeAudit(tx, {
      actorId: userId,
      action: 'ingresso.transferir',
      entity: 'ticket',
      entityId: held.id,
      before: { titular: userId, codigoCurto: held.shortCode },
      after: { titular: recipient.id, codigoCurto: shortCode, transferencia: transferId },
      at: now,
    });
    await enqueueEmail(tx, deps.clock, {
      userId,
      orderId: held.orderId,
      template: 'transferencia_enviada',
      idempotencyKey: `transferencia:${transferId}:enviada`,
    });
    await enqueueEmail(tx, deps.clock, {
      userId: recipient.id,
      orderId: held.orderId,
      template: 'transferencia_recebida',
      idempotencyKey: `transferencia:${transferId}:recebida`,
    });
    return { transferId, recipient: recipient.masked, recipientId: recipient.id, shortCode };
  });
}

/**
 * Quem recebeu com 16 ou 17 anos aceita o Termo de Ciência (D-87): até lá, o QR e o PDF do ingresso não aparecem. Um aceite por
 * transferência, na versão vigente do termo, com IP e navegador, como o da compra.
 */
export async function acceptTransferMinorTerm(
  deps: TransferDeps,
  userId: string,
  ticketId: string,
  input: { accepted: boolean; termVersion: string },
  meta: RequestMeta,
): Promise<void> {
  if (input.accepted !== true)
    throw new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', [
      { campo: 'accepted', mensagem: 'Para continuar, leia e aceite o Termo de Ciência para Menores de Idade.' },
    ]);
  const version = legalVersion(deps.config, 'termo-menor');
  if (!version) throw new AppError(503, 'termo_menor_indisponivel', 'O Termo de Ciência está indisponível no momento.');
  if (input.termVersion !== version)
    throw new AppError(409, 'versao_desatualizada', 'O Termo de Ciência para Menores de Idade foi atualizado. Leia e aceite novamente.');
  await deps.db.transaction(async tx => {
    const [t] = await tx
      .select({ holderUserId: tickets.holderUserId, holderMinor: tickets.holderMinor, startsAt: events.startsAt })
      .from(tickets)
      .innerJoin(events, eq(events.id, tickets.eventId))
      .where(eq(tickets.id, ticketId))
      .for('update', { of: tickets });
    if (!t || t.holderUserId !== userId) throw new AppError(404, 'nao_encontrado', 'Ingresso não encontrado.');
    const [last] = await tx
      .select({ id: ticketTransfers.id })
      .from(ticketTransfers)
      .where(and(eq(ticketTransfers.ticketId, ticketId), eq(ticketTransfers.toUserId, userId)))
      .orderBy(desc(ticketTransfers.createdAt))
      .limit(1);
    if (!t.holderMinor || !last) return; // nada a aceitar: a conta não recebeu como menor
    const [me] = await tx.select({ birthDate: users.birthDate }).from(users).where(eq(users.id, userId)).limit(1);
    const age = me?.birthDate ? ageOnEvent(me.birthDate, t.startsAt) : null;
    if (age === null || age < MIN_AGE || age >= ADULT_AGE) return; // a data foi corrigida e a conta não é mais menor no evento
    await tx
      .insert(ticketMinorAcceptances)
      .values({
        userId,
        ticketTransferId: last.id,
        termVersion: version,
        ageAtEvent: age,
        acceptedAt: deps.clock.now(),
        ip: meta.ip,
        userAgent: meta.userAgent,
      })
      .onConflictDoNothing();
  });
}

/**
 * Termo de Ciência ainda não aceito pelo titular atual que recebeu o ingresso como menor (SQL para as consultas de ingresso).
 * Ingresso que nunca foi transferido, ou que voltou para quem comprou, tem `holder_minor` nulo: o aceite é o do pedido.
 */
export const minorTermPendingSql = sql<boolean>`(${tickets.holderMinor} is true and not exists (
  select 1 from ${ticketMinorAcceptances} a
  join ${ticketTransfers} tt on tt.id = a.ticket_transfer_id
  where tt.ticket_id = ${tickets.id} and a.user_id = ${tickets.holderUserId}
))`;

/** Validação do motivo do desfazer: a mesma régua do cancelamento (5 a 500 caracteres, com confirmação). */
function checkReason(input: { reason: string; confirm: boolean }) {
  const reason = input.reason.trim();
  const errors: { campo: string; mensagem: string }[] = [];
  if (input.confirm !== true) errors.push({ campo: 'confirm', mensagem: 'Confirme que a transferência deve ser desfeita.' });
  if (reason.length < 5) errors.push({ campo: 'reason', mensagem: 'Informe o motivo (pelo menos 5 caracteres).' });
  if (reason.length > 500) errors.push({ campo: 'reason', mensagem: 'Use no máximo 500 caracteres.' });
  if (errors.length) throw new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', errors);
  return reason;
}

/**
 * Desfaz a última transferência do ingresso (administrador, fraude comprovada). Só com o ingresso válido e com quem recebeu. O ingresso
 * volta para quem transferiu, com QR e código novos de novo (quem recebeu tinha o QR); a reversão é uma linha nova do histórico,
 * ligada à desfeita, com o motivo; trilha `ingresso.transferencia_desfeita`; e-mail para os dois. Numa cadeia, desfaz uma por vez.
 */
export async function undoLastTransfer(
  deps: TransferDeps,
  adminId: string,
  ticketId: string,
  input: { reason: string; confirm: boolean },
): Promise<{ transferId: string; returnedTo: string; takenFrom: string }> {
  const reason = checkReason(input);
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const [ref] = await tx.select({ orderId: tickets.orderId }).from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ref) throw new AppError(404, 'nao_encontrado', 'Ingresso não encontrado.');
    await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, ref.orderId)).for('share');
    const held = (await loadHeld(tx, ticketId, true))!;
    if (held.status !== 'valido')
      throw new AppError(409, 'desfazer_indisponivel', 'Ingresso já utilizado ou cancelado: a transferência não pode ser desfeita.');
    // A transferência que trouxe o ingresso ao titular atual e ainda não foi desfeita (numa cadeia A, B, C, com C titular: B para
    // C; depois de desfeita, A para B).
    const reverted = tx
      .select({ id: sql`r.reverts_id` })
      .from(sql`${ticketTransfers} r`)
      .where(sql`r.reverts_id is not null and r.ticket_id = ${ticketId}`);
    const [last] = await tx
      .select({ id: ticketTransfers.id, fromUserId: ticketTransfers.fromUserId, toUserId: ticketTransfers.toUserId })
      .from(ticketTransfers)
      .where(
        and(
          eq(ticketTransfers.ticketId, ticketId),
          eq(ticketTransfers.toUserId, held.holderUserId),
          isNull(ticketTransfers.revertsId),
          sql`${ticketTransfers.id} not in (${reverted})`,
        ),
      )
      .orderBy(desc(ticketTransfers.createdAt))
      .limit(1);
    if (!last)
      throw new AppError(409, 'desfazer_indisponivel', 'Este ingresso não tem transferência para desfazer.');
    const [back] = await tx
      .select({ id: users.id, name: users.name, birthDate: users.birthDate })
      .from(users)
      .where(eq(users.id, last.fromUserId))
      .limit(1);
    const age = back?.birthDate ? purchaseAge(back.birthDate, held) : null;
    const minor = age?.ok ? age.minor : false;
    const { shortCode } = await reissue(
      tx,
      deps.config,
      held,
      { holderUserId: back!.id, holderName: back!.name, holderMinor: holderMinorFor(held, { id: back!.id, minor }) },
      held.holderUserId,
    );
    const [row] = await tx
      .insert(ticketTransfers)
      .values({
        ticketId: held.id,
        eventId: held.eventId,
        fromUserId: held.holderUserId,
        toUserId: back!.id,
        actorId: adminId,
        revertsId: last.id,
        reason,
        oldShortCode: held.shortCode,
        newShortCode: shortCode,
        oldCodeSha256: sha256(held.code),
        createdAt: now,
      })
      .returning({ id: ticketTransfers.id });
    const transferId = row!.id;
    await writeAudit(tx, {
      actorId: adminId,
      action: 'ingresso.transferencia_desfeita',
      entity: 'ticket',
      entityId: held.id,
      before: { titular: held.holderUserId, codigoCurto: held.shortCode },
      after: { titular: back!.id, codigoCurto: shortCode, desfaz: last.id },
      reason,
      at: now,
    });
    await enqueueEmail(tx, deps.clock, {
      userId: back!.id,
      orderId: held.orderId,
      template: 'transferencia_desfeita',
      idempotencyKey: `transferencia:${transferId}:volta`,
    });
    await enqueueEmail(tx, deps.clock, {
      userId: held.holderUserId,
      orderId: held.orderId,
      template: 'transferencia_desfeita',
      idempotencyKey: `transferencia:${transferId}:saida`,
    });
    return { transferId, returnedTo: back!.id, takenFrom: held.holderUserId };
  });
}

/** Histórico de transferências de um ingresso (painel), da mais nova para a mais antiga. Nomes completos: só a equipe vê. */
export async function transferHistory(db: Db, ticketId: string) {
  const fromUser = sql`fu.name`;
  const toUser = sql`tu.name`;
  const actor = sql`au.name`;
  const rows = await db.execute<{
    id: string;
    from_name: string;
    to_name: string;
    actor_name: string;
    actor_role: string;
    reverts_id: string | null;
    reason: string | null;
    old_short_code: string;
    new_short_code: string;
    created_at: Date;
  }>(sql`
    select tt.id, ${fromUser} as from_name, ${toUser} as to_name, ${actor} as actor_name, au.role as actor_role,
           tt.reverts_id, tt.reason, tt.old_short_code, tt.new_short_code, tt.created_at
    from ${ticketTransfers} tt
    join ${users} fu on fu.id = tt.from_user_id
    join ${users} tu on tu.id = tt.to_user_id
    join ${users} au on au.id = tt.actor_id
    where tt.ticket_id = ${ticketId}
    order by tt.created_at desc, tt.id desc`);
  return rows.rows.map(r => ({
    id: r.id,
    from: r.from_name,
    to: r.to_name,
    by: r.actor_name,
    byStaff: r.actor_role !== 'cliente',
    reverts: r.reverts_id,
    reason: r.reason,
    oldShortCode: r.old_short_code,
    newShortCode: r.new_short_code,
    at: new Date(r.created_at).toISOString(),
  }));
}

/** QR antigo de um ingresso transferido? (portaria: recusa com a explicação, sem mostrar o titular novo). */
export async function transferredCode(db: Db | Tx, code: string): Promise<{ ticketId: string } | null> {
  const [row] = await db
    .select({ ticketId: ticketTransfers.ticketId })
    .from(ticketTransfers)
    .where(eq(ticketTransfers.oldCodeSha256, sha256(code)))
    .limit(1);
  return row ?? null;
}
