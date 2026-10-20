import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { writeAudit, type Tx } from '../db/audit';
import { eventAccess, events, users } from '../db/schema';
import { maskCpf } from '../domain/cpf';
import { AppError } from '../domain/errors';
import {
  ACCESS_LIMITS,
  checkNote,
  checkPerson,
  effectiveStatus,
  maskEmail,
  parseAccessList,
  type AccessOrigin,
  type AccessPerson,
  type AccessStatus,
} from '../domain/eventAccess';
import { countdownLiveUntil } from '../domain/vitrine';
import { enqueueEmail } from '../mail/outbox';
import type { Clock } from '../providers/clock';

/**
 * Evento privado com lista de autorizados (D-92, mudança de escopo aprovada pela PartyX em 20/10/2026). Com a chave ligada, só compra
 * (e só recebe ingresso transferido) a conta autorizada na lista do evento. Uma linha vale para a conta quando bate a conta, o e-mail
 * dela ou o CPF dela, então a pessoa cadastrada antes de ter conta é reconhecida ao criar a conta ou ao entrar, sem gravação extra.
 *
 * Privacidade: a página do evento só recebe a situação da própria conta (`myAccess`); nenhuma resposta pública diz quem está na
 * lista. CPF e e-mail entram mascarados na trilha, que não se apaga; a lista é apagada 6 meses depois do evento (`privacy/retention.ts`).
 */
export interface AccessDeps {
  db: Db;
  clock: Clock;
}
export interface Actor {
  id: string;
}

type Row = typeof eventAccess.$inferSelect;
type Account = { id: string; email: string; cpf: string | null };

const notFound = (what: string) => new AppError(404, 'nao_encontrado', `${what} não encontrado.`);
const invalid = (campo: string, mensagem: string) =>
  new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', [{ campo, mensagem }]);

export const PRIVATE_EVENT_TEXT = 'Este evento é privado. Só pessoas autorizadas pelo organizador podem comprar.';
export const RECIPIENT_NOT_AUTHORIZED_TEXT =
  'Este evento é privado e essa conta não está autorizada pelo organizador. Peça para a pessoa solicitar acesso na página do evento.';

/** Escritas na lista de um evento, uma por vez: duas solicitações ou dois cadastros da mesma pessoa ao mesmo tempo não duplicam. */
const lockList = (tx: Tx, eventId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`event-access:${eventId}`}, 0))`);

/** Linhas que valem para a conta: pela conta, pelo e-mail ou pelo CPF dela. */
function matchesAccount(a: Account) {
  return sql`(${eventAccess.userId} = ${a.id} or ${eventAccess.emailNormalized} = ${a.email}${
    a.cpf ? sql` or ${eventAccess.cpf} = ${a.cpf}` : sql``
  })`;
}

async function loadAccount(db: Db | Tx, userId: string): Promise<Account> {
  const [u] = await db
    .select({ id: users.id, email: users.email, cpf: users.cpf })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) throw new AppError(401, 'nao_autenticado', 'Entre na sua conta para continuar.');
  return u;
}

/** Situação da conta na lista do evento, ou nula se ela não estiver na lista. */
export async function accountStatus(db: Db | Tx, eventId: string, account: Account): Promise<AccessStatus | null> {
  const rows = await db
    .select({ status: eventAccess.status })
    .from(eventAccess)
    .where(and(eq(eventAccess.eventId, eventId), matchesAccount(account)));
  return effectiveStatus(rows.map(r => r.status));
}

/**
 * Compra e resumo (D-92): em evento privado, só a conta autorizada. As janelas de venda, os lotes, a capacidade e as regras de
 * menores continuam conferidas depois, como em qualquer evento. Sem conta (resumo sem sessão), recusa do mesmo jeito.
 */
export async function assertMayBuy(db: Db | Tx, event: { id: string; isPrivate: boolean }, userId: string | undefined) {
  if (!event.isPrivate) return;
  const status = userId ? await accountStatus(db, event.id, await loadAccount(db, userId)) : null;
  if (status !== 'autorizada') throw new AppError(403, 'evento_privado', PRIVATE_EVENT_TEXT);
}

/** Transferência (D-92): ingresso de evento privado só vai para conta autorizada. O "desfazer" pelo painel não passa por aqui. */
export async function assertRecipientAuthorized(
  db: Db | Tx,
  event: { id: string; isPrivate: boolean },
  recipientId: string,
) {
  if (!event.isPrivate) return;
  const status = await accountStatus(db, event.id, await loadAccount(db, recipientId));
  if (status !== 'autorizada') throw new AppError(403, 'destino_nao_autorizado', RECIPIENT_NOT_AUTHORIZED_TEXT);
}

// ---------- página do evento (comprador) ----------

export type MyAccess = 'livre' | 'autorizada' | 'pendente' | 'recusada' | 'nenhuma';

async function publicEvent(db: Db | Tx, slug: string) {
  const [e] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  if (!e || e.status === 'rascunho' || e.archivedAt) throw notFound('Evento');
  return e;
}

/** Já passou do fim (ou de 8 h depois do início, sem fim) ou foi encerrado: não aceita solicitação. */
const eventOver = (e: typeof events.$inferSelect, now: Date) =>
  e.status === 'encerrado' || now >= countdownLiveUntil(e.startsAt, e.endsAt);

/** Só a situação da própria conta. Evento aberto: `livre`. */
export async function myAccess(deps: AccessDeps, slug: string, userId: string) {
  const e = await publicEvent(deps.db, slug);
  if (!e.isPrivate) return { privado: false, situacao: 'livre' as MyAccess, podeSolicitar: false };
  const status = await accountStatus(deps.db, e.id, await loadAccount(deps.db, userId));
  return {
    privado: true,
    situacao: (status ?? 'nenhuma') as MyAccess,
    podeSolicitar: status === null && !eventOver(e, deps.clock.now()),
  };
}

/**
 * Solicitação de acesso pela página do evento: um toque, com os dados da conta, sem formulário. Uma por conta por evento: se a conta já
 * estiver na lista (pelo painel ou por solicitação anterior), devolve a situação e não cria nada. Vale antes de as vendas abrirem;
 * evento encerrado ou que já aconteceu não aceita. Limite de 10 solicitações por conta por hora, somando os eventos (o de IP fica na rota).
 */
export async function requestAccess(deps: AccessDeps, slug: string, userId: string) {
  const now = deps.clock.now();
  const e = await publicEvent(deps.db, slug);
  if (!e.isPrivate)
    throw new AppError(409, 'evento_nao_privado', 'Este evento não precisa de autorização: a compra é livre.');
  if (eventOver(e, now))
    throw new AppError(409, 'evento_encerrado', 'Este evento já aconteceu e não aceita solicitações.');
  const account = await loadAccount(deps.db, userId);
  const created = await deps.db.transaction(async tx => {
    await lockList(tx, e.id);
    const status = await accountStatus(tx, e.id, account);
    if (status) return null;
    const [recent] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(eventAccess)
      .where(
        and(
          eq(eventAccess.userId, userId),
          eq(eventAccess.origin, 'solicitacao'),
          gt(eventAccess.createdAt, new Date(now.getTime() - 3_600_000)),
        ),
      );
    if ((recent?.n ?? 0) >= ACCESS_LIMITS.requestsPerAccountPerHour)
      throw new AppError(429, 'muitas_requisicoes', 'Muitas solicitações seguidas. Aguarde um pouco e tente de novo.');
    const [row] = await tx
      .insert(eventAccess)
      .values({
        eventId: e.id,
        userId,
        status: 'pendente',
        origin: 'solicitacao',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await writeAudit(tx, {
      actorId: userId,
      action: 'acesso.solicitar',
      entity: 'event_access',
      entityId: row!.id,
      before: null,
      after: { evento: e.id, situacao: 'pendente', origem: 'solicitacao' },
      at: now,
    });
    await enqueueEmail(tx, deps.clock, {
      userId,
      template: 'acesso_solicitado',
      idempotencyKey: `acesso:${row!.id}:recebida`,
    });
    return row!;
  });
  const after = created ? 'pendente' : await accountStatus(deps.db, e.id, account);
  return { privado: true, situacao: (after ?? 'nenhuma') as MyAccess, podeSolicitar: false, criada: Boolean(created) };
}

// ---------- painel ----------

async function eventForAdmin(db: Db | Tx, eventId: string) {
  const [e] = await db
    .select({ id: events.id, name: events.name, slug: events.slug, isPrivate: events.isPrivate })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!e) throw notFound('Evento');
  return e;
}

/** O que a trilha guarda de uma linha: sem e-mail nem CPF inteiros. */
const auditView = (
  r: Pick<Row, 'eventId' | 'emailNormalized' | 'cpf' | 'name' | 'status' | 'origin' | 'userId' | 'note'>,
) => ({
  evento: r.eventId,
  email: r.emailNormalized ? maskEmail(r.emailNormalized) : null,
  cpf: r.cpf ? maskCpf(r.cpf) : null,
  nome: r.name,
  conta: r.userId,
  situacao: r.status,
  origem: r.origin,
  observacao: r.note,
});

/** Linhas da lista que já são desta pessoa: pelo e-mail, pelo CPF ou pela conta que tem esse e-mail ou CPF. */
async function existingFor(tx: Tx, eventId: string, p: AccessPerson): Promise<Row[]> {
  const ors = [];
  if (p.email) ors.push(sql`${eventAccess.emailNormalized} = ${p.email}`);
  if (p.cpf) ors.push(sql`${eventAccess.cpf} = ${p.cpf}`);
  const accountWhere = [];
  if (p.email) accountWhere.push(sql`u.email = ${p.email}`);
  if (p.cpf) accountWhere.push(sql`u.cpf = ${p.cpf}`);
  ors.push(sql`${eventAccess.userId} in (select u.id from users u where ${sql.join(accountWhere, sql` or `)})`);
  return tx
    .select()
    .from(eventAccess)
    .where(and(eq(eventAccess.eventId, eventId), sql`(${sql.join(ors, sql` or `)})`))
    .for('update');
}

type AddOutcome = 'adicionada' | 'atualizada' | 'ja_autorizada';

/** Cadastra (ou autoriza, se já estava na lista) uma pessoa, dentro da transação com a lista trancada. */
async function addOne(tx: Tx, clock: Clock, actor: Actor, eventId: string, p: AccessPerson, now: Date) {
  const found = await existingFor(tx, eventId, p);
  if (found.length > 0) {
    if (found.some(r => r.status === 'autorizada')) return { outcome: 'ja_autorizada' as AddOutcome, id: found[0]!.id };
    const target = found[0]!;
    const [after] = await tx
      .update(eventAccess)
      .set({ status: 'autorizada', decidedAt: now, decidedBy: actor.id, updatedAt: now })
      .where(eq(eventAccess.id, target.id))
      .returning();
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'acesso.aprovar',
      entity: 'event_access',
      entityId: target.id,
      before: auditView(target),
      after: auditView(after!),
      reason: 'cadastrada pelo painel quando já estava na lista',
      at: now,
    });
    if (target.origin === 'solicitacao') await notifyApproved(tx, clock, target);
    return { outcome: 'atualizada' as AddOutcome, id: target.id };
  }
  const [row] = await tx
    .insert(eventAccess)
    .values({
      eventId,
      emailNormalized: p.email,
      cpf: p.cpf,
      name: p.name,
      status: 'autorizada',
      origin: 'painel',
      decidedAt: now,
      decidedBy: actor.id,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return { outcome: 'adicionada' as AddOutcome, id: row!.id, row: row! };
}

/** "Acesso liberado" (D-92, premissa 3): só para solicitação aprovada, que tem conta. Idempotente pela chave. */
async function notifyApproved(tx: Tx, clock: Clock, row: Pick<Row, 'id' | 'userId'>) {
  if (!row.userId) return;
  await enqueueEmail(tx, clock, {
    userId: row.userId,
    template: 'acesso_liberado',
    idempotencyKey: `acesso:${row.id}:liberada`,
  });
}

export async function addAccess(
  deps: AccessDeps,
  actor: Actor,
  eventId: string,
  input: { email?: string | null; cpf?: string | null; name?: string | null },
) {
  const checked = checkPerson(input);
  if (!checked.ok) throw invalid(checked.message.includes('CPF') ? 'cpf' : 'email', checked.message);
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    await eventForAdmin(tx, eventId);
    await lockList(tx, eventId);
    const r = await addOne(tx, deps.clock, actor, eventId, checked.person, now);
    if (r.outcome === 'adicionada')
      await writeAudit(tx, {
        actorId: actor.id,
        action: 'acesso.adicionar',
        entity: 'event_access',
        entityId: r.id,
        before: null,
        after: auditView(r.row!),
        at: now,
      });
    return { resultado: r.outcome, id: r.id };
  });
}

/** Lista colada, uma pessoa por linha. Tudo numa transação: as linhas boas entram, as ruins voltam com o número da linha. */
export async function importAccess(deps: AccessDeps, actor: Actor, eventId: string, text: string) {
  const parsed = parseAccessList(text);
  if ('tooMany' in parsed)
    throw invalid(
      'lista',
      `Cole no máximo ${ACCESS_LIMITS.importMax} pessoas por vez. Divida a lista e importe em partes.`,
    );
  if (parsed.people.length === 0 && parsed.errors.length === 0)
    throw invalid('lista', 'Cole pelo menos uma pessoa, uma por linha.');
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    await eventForAdmin(tx, eventId);
    await lockList(tx, eventId);
    const counts = { adicionadas: 0, atualizadas: 0, jaAutorizadas: 0 };
    const ids: string[] = [];
    for (const { person } of parsed.people) {
      const r = await addOne(tx, deps.clock, actor, eventId, person, now);
      if (r.outcome === 'adicionada') counts.adicionadas++;
      else if (r.outcome === 'atualizada') counts.atualizadas++;
      else counts.jaAutorizadas++;
      if (r.outcome === 'adicionada') ids.push(r.id);
    }
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'acesso.importar',
      entity: 'event',
      entityId: eventId,
      before: null,
      after: { ...counts, erros: parsed.errors.length, repetidas: parsed.repeated.length, linhas: ids },
      at: now,
    });
    return { ...counts, erros: parsed.errors, repetidas: parsed.repeated };
  });
}

export async function removeAccess(deps: AccessDeps, actor: Actor, entryId: string) {
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const [row] = await tx.select().from(eventAccess).where(eq(eventAccess.id, entryId)).limit(1);
    if (!row) throw notFound('Pessoa');
    await lockList(tx, row.eventId);
    const removed = await tx.delete(eventAccess).where(eq(eventAccess.id, entryId)).returning({ id: eventAccess.id });
    if (removed.length === 0) throw notFound('Pessoa');
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'acesso.remover',
      entity: 'event_access',
      entityId: entryId,
      before: auditView(row),
      after: null,
      at: now,
    });
    return { removida: true };
  });
}

/**
 * Aprovar ou recusar, uma a uma ou várias de uma vez, com observação opcional. Aprovar uma solicitação põe na fila o e-mail "Acesso
 * liberado"; recusar não manda nada. Mudar uma decisão (recusar quem estava autorizada) também vale e entra na trilha.
 */
export async function decideAccess(
  deps: AccessDeps,
  actor: Actor,
  input: { ids: string[]; decision: 'aprovar' | 'recusar'; note?: string | null },
) {
  const ids = [...new Set(input.ids)];
  if (ids.length === 0) throw invalid('ids', 'Escolha pelo menos uma pessoa.');
  if (ids.length > 500) throw invalid('ids', 'Escolha no máximo 500 pessoas por vez.');
  const note = checkNote(input.note);
  if (!note.ok) throw invalid('note', note.message);
  const status: AccessStatus = input.decision === 'aprovar' ? 'autorizada' : 'recusada';
  const now = deps.clock.now();
  return deps.db.transaction(async tx => {
    const found = await tx.select().from(eventAccess).where(inArray(eventAccess.id, ids));
    if (found.length !== ids.length) throw notFound('Pessoa');
    for (const eventId of [...new Set(found.map(r => r.eventId))].sort()) await lockList(tx, eventId);
    let changed = 0;
    for (const id of ids) {
      const [before] = await tx.select().from(eventAccess).where(eq(eventAccess.id, id)).limit(1).for('update');
      if (!before) throw notFound('Pessoa');
      if (before.status === status && (note.note === null || before.note === note.note)) continue;
      const [after] = await tx
        .update(eventAccess)
        .set({ status, note: note.note ?? before.note, decidedAt: now, decidedBy: actor.id, updatedAt: now })
        .where(eq(eventAccess.id, id))
        .returning();
      await writeAudit(tx, {
        actorId: actor.id,
        action: status === 'autorizada' ? 'acesso.aprovar' : 'acesso.recusar',
        entity: 'event_access',
        entityId: id,
        before: auditView(before),
        after: auditView(after!),
        at: now,
      });
      if (status === 'autorizada' && before.status !== 'autorizada' && before.origin === 'solicitacao')
        await notifyApproved(tx, deps.clock, before);
      changed++;
    }
    return { alteradas: changed };
  });
}

export interface AccessView {
  id: string;
  eventId: string;
  name: string | null;
  email: string | null;
  /** Sempre mascarado. */
  cpf: string | null;
  status: AccessStatus;
  origin: AccessOrigin;
  /** Já existe conta para esta pessoa (pela conta, pelo e-mail ou pelo CPF). */
  hasAccount: boolean;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  updatedAt: string;
}

type ListRow = {
  id: string;
  event_id: string;
  name: string | null;
  email: string | null;
  cpf: string | null;
  status: AccessStatus;
  origin: AccessOrigin;
  has_account: boolean;
  note: string | null;
  created_at: Date;
  decided_at: Date | null;
  decided_by: string | null;
  updated_at: Date;
};

const viewOf = (r: ListRow): AccessView => ({
  id: r.id,
  eventId: r.event_id,
  name: r.name,
  email: r.email,
  cpf: r.cpf ? maskCpf(r.cpf) : null,
  status: r.status,
  origin: r.origin,
  hasAccount: r.has_account,
  note: r.note,
  createdAt: new Date(r.created_at).toISOString(),
  decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
  decidedBy: r.decided_by,
  updatedAt: new Date(r.updated_at).toISOString(),
});

/**
 * Linhas da lista com o que o painel mostra: nome, e-mail e CPF da linha ou, na falta, da conta encontrada (solicitação ou pessoa que
 * criou conta depois). O CPF sai daqui só para virar máscara.
 */
const LIST_SELECT = sql`
  select a.id, a.event_id, coalesce(a.name, u.name) as name, coalesce(a.email_normalized, u.email) as email,
         coalesce(a.cpf, u.cpf) as cpf, a.status, a.origin, (u.id is not null) as has_account, a.note,
         a.created_at, a.decided_at, d.name as decided_by, a.updated_at
    from event_access a
    left join lateral (
      select x.id, x.name, x.email, x.cpf from users x
       where x.id = a.user_id
          or (a.user_id is null and (x.email = a.email_normalized or (a.cpf is not null and x.cpf = a.cpf)))
       order by (x.id = a.user_id) desc nulls last, x.created_at
       limit 1
    ) u on true
    left join users d on d.id = a.decided_by`;

function searchWhere(q?: string) {
  const text = (q ?? '').trim();
  if (!text) return sql`true`;
  const like = `%${text.replace(/[\\%_]/g, m => `\\${m}`).toLowerCase()}%`;
  const digits = text.replace(/\D/g, '');
  return sql`(lower(coalesce(a.name, u.name, '')) like ${like} or coalesce(a.email_normalized, u.email, '') like ${like}${
    digits.length >= 3 ? sql` or coalesce(a.cpf, u.cpf, '') like ${`%${digits}%`}` : sql``
  })`;
}

export const ACCESS_PAGE = 50;

export async function listAccess(
  deps: AccessDeps,
  eventId: string,
  filter: { q?: string; status?: AccessStatus; page?: number; all?: boolean },
) {
  const ev = await eventForAdmin(deps.db, eventId);
  const page = Math.max(1, filter.page ?? 1);
  const where = sql`a.event_id = ${eventId} and ${searchWhere(filter.q)}${filter.status ? sql` and a.status = ${filter.status}` : sql``}`;
  const rows = await deps.db.execute<ListRow & { total: number }>(sql`
    select l.*, count(*) over ()::int as total from (${LIST_SELECT} where ${where}) l
     order by (l.status = 'pendente') desc, l.created_at desc, l.id
     ${filter.all ? sql`` : sql`limit ${ACCESS_PAGE} offset ${(page - 1) * ACCESS_PAGE}`}`);
  const counts = await deps.db.execute<{ status: AccessStatus; n: number }>(
    sql`select status, count(*)::int as n from event_access where event_id = ${eventId} group by status`,
  );
  const byStatus = { autorizada: 0, pendente: 0, recusada: 0 };
  for (const c of counts.rows) byStatus[c.status] = c.n;
  return {
    event: ev,
    people: rows.rows.map(viewOf),
    total: rows.rows[0]?.total ?? 0,
    page,
    pageSize: ACCESS_PAGE,
    counts: byStatus,
  };
}

/** Página "Solicitações": pendentes de todos os eventos, da mais antiga para a mais nova. */
export async function pendingRequests(deps: AccessDeps, filter: { eventId?: string; page?: number }) {
  const page = Math.max(1, filter.page ?? 1);
  const rows = await deps.db.execute<
    ListRow & { event_name: string; event_slug: string; starts_at: Date; total: number }
  >(sql`
    select l.*, e.name as event_name, e.slug as event_slug, e.starts_at, count(*) over ()::int as total
      from (${LIST_SELECT} where a.status = 'pendente'${filter.eventId ? sql` and a.event_id = ${filter.eventId}` : sql``}) l
      join events e on e.id = l.event_id
     order by l.created_at, l.id
     limit ${ACCESS_PAGE} offset ${(page - 1) * ACCESS_PAGE}`);
  return {
    requests: rows.rows.map(r => ({
      ...viewOf(r),
      event: { id: r.event_id, name: r.event_name, slug: r.event_slug, startsAt: new Date(r.starts_at).toISOString() },
    })),
    total: rows.rows[0]?.total ?? 0,
    page,
    pageSize: ACCESS_PAGE,
  };
}

/** Contador do menu e card da Visão geral. */
export async function pendingCount(db: Db) {
  const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from event_access where status = 'pendente'`);
  return r.rows[0]?.n ?? 0;
}
