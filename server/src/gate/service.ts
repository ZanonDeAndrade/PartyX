import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { writeAudit } from '../db/audit';
import { checkins, events, orders, ticketTypes, tickets, users } from '../db/schema';
import { maskCpf, onlyDigits } from '../domain/cpf';
import { AppError } from '../domain/errors';
import { formatInEventZone } from '../domain/time';
import { logger } from '../logger';
import type { Clock } from '../providers/clock';
import { lookupByQr } from '../tickets/service';
import { minorTermPendingSql, transferredCode } from '../tickets/transfer';
import { verifyQr, type QrKeys } from '../domain/ticketCode';

/**
 * Portaria (RF-44 a RF-54). A verificação e a marcação de uso acontecem **no servidor**: o aparelho só mostra o resultado.
 * Sem internet o aparelho não confirma nada sozinho (não existe validação local): a orientação é a lista impressa (seção 15).
 */

export interface GateDeps {
  db: Db;
  clock: Clock;
  keys: QrKeys;
  /** Janela operacional para evento encerrado, em horas antes e depois do início (D-79). */
  closedWindow: GateWindow;
}
export interface GateWindow {
  beforeHours: number;
  afterHours: number;
}

const HOUR = 3_600_000;
/** Início e fim da janela em que a portaria ainda abre um evento encerrado. */
export function gateWindowOf(startsAt: Date, w: GateWindow) {
  return {
    opensAt: new Date(startsAt.getTime() - w.beforeHours * HOUR),
    closesAt: new Date(startsAt.getTime() + w.afterHours * HOUR),
  };
}
const fmt = (d: Date) =>
  formatInEventZone(d, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).replace(', ', ' às ');
export interface Validator {
  id: string;
  name: string;
}

export type GateResult = 'valido' | 'ja_utilizado' | 'invalido' | 'cancelado' | 'outro_evento';
/**
 * `menor_confirmar` (regras de menores, 14/10/2026): ingresso válido de pedido de comprador menor. NÃO consome o ingresso nem vira
 * leitura gravada: a tela pede ao validador que confira a idade de quem está na frente e confirme (`MinorCheck`).
 */
export type GateOutcomeResult = GateResult | 'menor_confirmar';
/** O que o validador confirmou num ingresso de pedido de comprador menor: menor com a autorização entregue, ou pessoa de 18+. */
export type MinorCheck = 'autorizacao_recebida' | 'maior_de_idade';
export const MINOR_CHECKS = ['autorizacao_recebida', 'maior_de_idade'] as const;

export interface Counter {
  entered: number;
  total: number;
}

export interface GateOutcome {
  result: GateOutcomeResult;
  /** Texto curto para a tela cheia. */
  message: string;
  /** `buyerMinor`: pedido de comprador com 16 ou 17 anos na data do evento (aviso de menor em todos os ingressos dele). */
  ticket: { id: string; shortCode: string; typeName: string; holderName: string; buyerMinor: boolean } | null;
  /** Amarelo: quem entrou primeiro e quando (RF-48). */
  firstEntry: { at: string; validatorName: string } | null;
  /** Vermelho "outro evento" (RF-54): de qual evento é o ingresso. */
  otherEvent: { name: string } | null;
  counter: Counter;
  method: 'camera' | 'manual';
}

/** QR de antes de uma transferência (D-87): o ingresso passou para outra conta e ganhou QR novo. */
export const OLD_TRANSFERRED_QR = 'QR antigo: este ingresso foi transferido e este QR não vale mais';
/** Ingresso recebido com 16 ou 17 anos sem o Termo de Ciência aceito (D-87). */
export const TERM_PENDING =
  'Recebido numa transferência: o titular precisa aceitar o Termo de Ciência em Meus ingressos antes de entrar';

const MESSAGES: Record<GateOutcomeResult, string> = {
  menor_confirmar:
    'Pedido de comprador menor: conferir a idade de cada pessoa; quem tiver 16 ou 17 anos entrega a autorização',
  valido: 'Entrada liberada',
  ja_utilizado: 'Ingresso já utilizado',
  invalido: 'Ingresso inválido',
  cancelado: 'Ingresso cancelado',
  outro_evento: 'Ingresso de outro evento',
};

/**
 * Evento que a portaria pode abrir agora: publicado, ou encerrado dentro da janela operacional (de `beforeHours` antes do início até
 * `afterHours` depois) **e encerrado já dentro dela** (D-79). Encerrar o evento durante a festa tira do site e para as vendas, mas não
 * deve travar a entrada de quem já tem ingresso. Encerrado antes da janela (cancelamento antecipado) fica fechado. Rascunho nunca.
 */
async function loadEvent(deps: Pick<GateDeps, 'db' | 'clock' | 'closedWindow'>, eventId: string) {
  const [event] = await deps.db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
  if (event.status === 'publicado') return event;
  if (event.status === 'encerrado') {
    const now = deps.clock.now();
    const { opensAt, closesAt } = gateWindowOf(event.startsAt, deps.closedWindow);
    // Encerrado antes da janela abrir = cancelamento antecipado: a portaria não abre, nem perto da data.
    if (closedAtOf(event) < opensAt) {
      throw new AppError(
        409,
        'portaria_fechada',
        'Este evento foi encerrado antes da data e não está disponível para validação.',
      );
    }
    if (now >= opensAt && now <= closesAt) return event;
    throw new AppError(
      409,
      'portaria_fechada',
      now > closesAt
        ? `Este evento foi encerrado e a portaria funcionou até ${fmt(closesAt)}. Não é mais possível validar ingressos dele.`
        : `Este evento foi encerrado. A portaria só abre para ele a partir de ${fmt(opensAt)}.`,
      { opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() },
    );
  }
  throw new AppError(
    409,
    'evento_indisponivel',
    'Este evento ainda não foi publicado e não está aberto para a portaria.',
  );
}

/**
 * Quando o evento foi encerrado. Sem `closed_at` (encerrado por uma versão anterior do código), vale `updated_at`: evento encerrado
 * não aceita mais nenhuma alteração, então essa data é a do encerramento.
 */
const closedAtOf = (e: { closedAt: Date | null; updatedAt: Date }) => e.closedAt ?? e.updatedAt;

/** Entradas do evento (ingressos usados) e total de ingressos que ainda valem ou já entraram (cancelados ficam de fora). */
export async function counterOf(db: Db, eventId: string): Promise<Counter> {
  const [row] = await db
    .select({
      entered: sql<number>`count(*) filter (where ${tickets.status} = 'utilizado')::int`,
      total: sql<number>`count(*) filter (where ${tickets.status} in ('valido', 'utilizado'))::int`,
    })
    .from(tickets)
    .where(eq(tickets.eventId, eventId));
  return { entered: row?.entered ?? 0, total: row?.total ?? 0 };
}

/** Entradas por tipo (Pista, VIP, Camarote), para direcionar o público (RF-49) e acompanhar. */
export async function counterByType(db: Db, eventId: string) {
  return db
    .select({
      typeName: ticketTypes.name,
      entered: sql<number>`count(*) filter (where ${tickets.status} = 'utilizado')::int`,
      total: sql<number>`count(*) filter (where ${tickets.status} in ('valido', 'utilizado'))::int`,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(eq(tickets.eventId, eventId))
    .groupBy(ticketTypes.name)
    .orderBy(asc(ticketTypes.name));
}

/**
 * Eventos que a portaria pode abrir agora (RF-45): publicados e, dentro da janela operacional, os encerrados já dentro dela (com
 * `salesClosed` para a tela mostrar "Vendas encerradas" e até quando a portaria funciona). Com o contador de cada um.
 */
export async function gateEvents(deps: Pick<GateDeps, 'db' | 'clock' | 'closedWindow'>) {
  const now = deps.clock.now();
  // Encerrado entra se o início estiver entre (agora - depois) e (agora + antes).
  const from = new Date(now.getTime() - deps.closedWindow.afterHours * HOUR);
  const to = new Date(now.getTime() + deps.closedWindow.beforeHours * HOUR);
  const rows = await deps.db
    .select({
      id: events.id,
      name: events.name,
      slug: events.slug,
      startsAt: events.startsAt,
      venue: events.venue,
      status: events.status,
      // Subconsultas com nome de tabela explícito: dentro de sql`` o Drizzle não qualifica as colunas e o `id` ficaria ambíguo.
      entered: sql<number>`(select count(*) from tickets t where t.event_id = "events"."id" and t.status = 'utilizado')::int`,
      total: sql<number>`(select count(*) from tickets t where t.event_id = "events"."id" and t.status in ('valido', 'utilizado'))::int`,
    })
    .from(events)
    .where(
      sql`${events.status} = 'publicado' or (${events.status} = 'encerrado' and ${events.startsAt} >= ${from} and ${events.startsAt} <= ${to}
          and coalesce(${events.closedAt}, ${events.updatedAt}) >= ${events.startsAt} - make_interval(hours => ${deps.closedWindow.beforeHours}))`,
    )
    .orderBy(asc(events.startsAt), asc(events.id));
  return rows.map(({ status, ...e }) => ({
    ...e,
    salesClosed: status === 'encerrado',
    gateClosesAt: status === 'encerrado' ? gateWindowOf(e.startsAt, deps.closedWindow).closesAt : null,
  }));
}

type TicketRow = {
  id: string;
  shortCode: string;
  typeName: string;
  holderName: string;
  eventId: string;
  status: 'valido' | 'utilizado' | 'cancelado';
  usedAt: Date | null;
  buyerMinor: boolean;
  /** Recebido numa transferência com 16 ou 17 anos e o Termo de Ciência ainda não aceito (D-87): não entra até aceitar. */
  minorTermPending: boolean;
};

async function ticketById(db: Db, id: string): Promise<TicketRow | null> {
  const [row] = await db
    .select({
      id: tickets.id,
      shortCode: tickets.shortCode,
      typeName: ticketTypes.name,
      holderName: tickets.holderName,
      eventId: tickets.eventId,
      status: tickets.status,
      usedAt: tickets.usedAt,
      // Menor pelo titular atual (D-87); sem transferência, o pedido, como antes.
      buyerMinor: sql<boolean>`coalesce(${tickets.holderMinor}, ${orders.buyerMinor})`,
      minorTermPending: minorTermPendingSql,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .where(eq(tickets.id, id))
    .limit(1);
  return row ?? null;
}

async function record(
  db: Db,
  v: Validator,
  eventId: string,
  result: GateResult,
  method: 'camera' | 'manual',
  ticketId: string | null,
  presented: string | null,
  at: Date,
) {
  await db.insert(checkins).values({
    ticketId,
    eventId,
    validatorId: v.id,
    result,
    method,
    codePresented: presented?.slice(0, 64) ?? null,
    createdAt: at,
  });
}

async function outcome(
  deps: GateDeps,
  eventId: string,
  result: GateOutcomeResult,
  method: 'camera' | 'manual',
  ticket: TicketRow | null,
  extra: { firstEntry?: GateOutcome['firstEntry']; otherEvent?: string | null; message?: string } = {},
): Promise<GateOutcome> {
  return {
    result,
    message: extra.message ?? MESSAGES[result],
    ticket:
      ticket && result !== 'invalido'
        ? {
            id: ticket.id,
            shortCode: ticket.shortCode,
            typeName: ticket.typeName,
            holderName: ticket.holderName,
            buyerMinor: ticket.buyerMinor,
          }
        : null,
    firstEntry: extra.firstEntry ?? null,
    otherEvent: extra.otherEvent ? { name: extra.otherEvent } : null,
    counter: await counterOf(deps.db, eventId),
    method,
  };
}

/**
 * Marca o ingresso como usado **de forma atômica** (RF-50, RF-51, CA-25): `UPDATE ... WHERE status = 'valido'` numa transação
 * com o registro da entrada. Se dois aparelhos leem o mesmo ingresso ao mesmo tempo, o segundo `UPDATE` espera o primeiro, não
 * encontra mais "valido" e vira "já utilizado". Mesmo que algo falhasse, o índice único parcial de `checkins` (uma entrada
 * válida por ingresso) impede a segunda.
 */
async function admit(
  deps: GateDeps,
  v: Validator,
  eventId: string,
  ticketId: string,
  method: 'camera' | 'manual',
  minorCheck?: MinorCheck,
): Promise<GateOutcome> {
  const now = deps.clock.now();
  const before = (await ticketById(deps.db, ticketId))!;
  // Recebido numa transferência com 16 ou 17 anos sem o Termo de Ciência aceito (D-87): não entra, nem com a confirmação do
  // validador. A pessoa aceita no celular, em Meus ingressos, e a leitura é feita de novo.
  if (before.minorTermPending && before.status === 'valido')
    return outcome(deps, eventId, 'menor_confirmar', method, before, { message: TERM_PENDING });
  // Pedido de comprador menor (regras de menores): a entrada só acontece com a confirmação do validador, que conferiu a idade de quem
  // está na frente. Sem ela, nada é consumido e a tela pede a conferência. Ingresso já usado ou cancelado segue o caminho normal.
  if (before.buyerMinor && before.status === 'valido' && !minorCheck)
    return outcome(deps, eventId, 'menor_confirmar', method, before);
  const won = await deps.db.transaction(async tx => {
    const rows = await tx
      .update(tickets)
      .set({ status: 'utilizado', usedAt: now, validatedBy: v.id })
      .where(and(eq(tickets.id, ticketId), eq(tickets.status, 'valido'), eq(tickets.eventId, eventId)))
      .returning({ id: tickets.id });
    if (rows.length === 0) return false;
    await tx.insert(checkins).values({
      ticketId,
      eventId,
      validatorId: v.id,
      result: 'valido',
      method,
      // Gravado na leitura: true = menor com a autorização entregue; false = o validador conferiu 18 anos ou mais.
      minorAuthorizationReceived: before.buyerMinor ? minorCheck === 'autorizacao_recebida' : null,
      createdAt: now,
    });
    return true;
  });
  const ticket = (await ticketById(deps.db, ticketId))!;
  if (won) return outcome(deps, eventId, 'valido', method, ticket);

  // Perdeu a disputa, ou o ingresso já tinha sido usado ou cancelado: mostra o estado real.
  if (ticket.status === 'cancelado') {
    await record(deps.db, v, eventId, 'cancelado', method, ticketId, null, now);
    return outcome(deps, eventId, 'cancelado', method, ticket);
  }
  const [first] = await deps.db
    .select({ at: checkins.createdAt, validatorName: users.name })
    .from(checkins)
    .innerJoin(users, eq(users.id, checkins.validatorId))
    .where(and(eq(checkins.ticketId, ticketId), eq(checkins.result, 'valido')))
    .limit(1);
  await record(deps.db, v, eventId, 'ja_utilizado', method, ticketId, null, now);
  return outcome(deps, eventId, 'ja_utilizado', method, ticket, {
    firstEntry: {
      at: (first?.at ?? ticket.usedAt ?? now).toISOString(),
      validatorName: first?.validatorName ?? 'validador',
    },
  });
}

/** Leitura de um QR (RF-46 a RF-51, RF-54). Todo resultado fica registrado, inclusive as tentativas inválidas. */
export async function scan(deps: GateDeps, v: Validator, input: { eventId: string; qr: string }): Promise<GateOutcome> {
  await loadEvent(deps, input.eventId);
  const now = deps.clock.now();
  const found = await lookupByQr(deps, input.qr);
  if (!found.ok) {
    // Só o começo do que foi lido (prefixo e versão), nunca o suficiente para reconstituir um código.
    await record(deps.db, v, input.eventId, 'invalido', 'camera', null, input.qr.slice(0, 24), now);
    // Assinatura certa e código desconhecido: pode ser o QR antigo de um ingresso transferido (D-87). A tela explica, sem mostrar
    // quem é o titular novo.
    const check = found.reason === 'desconhecido' ? verifyQr(deps.keys, input.qr) : null;
    if (check?.ok && (await transferredCode(deps.db, check.code)))
      return outcome(deps, input.eventId, 'invalido', 'camera', null, { message: OLD_TRANSFERRED_QR });
    return outcome(deps, input.eventId, 'invalido', 'camera', null);
  }
  const ticket = (await ticketById(deps.db, found.ticket.id))!;
  if (ticket.eventId !== input.eventId) {
    const [other] = await deps.db.select({ name: events.name }).from(events).where(eq(events.id, ticket.eventId));
    await record(deps.db, v, input.eventId, 'outro_evento', 'camera', ticket.id, null, now);
    return outcome(deps, input.eventId, 'outro_evento', 'camera', ticket, { otherEvent: other?.name ?? null });
  }
  if (ticket.status === 'cancelado') {
    await record(deps.db, v, input.eventId, 'cancelado', 'camera', ticket.id, null, now);
    return outcome(deps, input.eventId, 'cancelado', 'camera', ticket);
  }
  return admit(deps, v, input.eventId, ticket.id, 'camera');
}

/**
 * Entrada de um ingresso já identificado: o encontrado na busca (RF-52, `manual`) ou a confirmação depois da leitura de um ingresso de
 * pedido de comprador menor (`camera`, com `minorCheck`). A confirmação só é aceita em ingresso de pedido de comprador menor.
 */
export async function admitManually(
  deps: GateDeps,
  v: Validator,
  input: { eventId: string; ticketId: string; method?: 'camera' | 'manual'; minorCheck?: MinorCheck },
): Promise<GateOutcome> {
  await loadEvent(deps, input.eventId);
  const ticket = await ticketById(deps.db, input.ticketId);
  if (!ticket) throw new AppError(404, 'nao_encontrado', 'Ingresso não encontrado.');
  const now = deps.clock.now();
  if (ticket.eventId !== input.eventId) {
    const [other] = await deps.db.select({ name: events.name }).from(events).where(eq(events.id, ticket.eventId));
    await record(deps.db, v, input.eventId, 'outro_evento', 'manual', ticket.id, null, now);
    return outcome(deps, input.eventId, 'outro_evento', 'manual', ticket, { otherEvent: other?.name ?? null });
  }
  const method = input.method ?? 'manual';
  if (ticket.status === 'cancelado') {
    await record(deps.db, v, input.eventId, 'cancelado', method, ticket.id, null, now);
    return outcome(deps, input.eventId, 'cancelado', method, ticket);
  }
  if (input.minorCheck && !ticket.buyerMinor)
    throw new AppError(422, 'dados_invalidos', 'Este ingresso não é de pedido de comprador menor.');
  return admit(deps, v, input.eventId, ticket.id, method, input.minorCheck);
}

/**
 * Menor sem a autorização (ou sem os documentos): a entrada é recusada e o ingresso continua válido (a pessoa pode voltar com o papel).
 * Fica na trilha de auditoria, sem dado pessoal: só o ingresso, o evento e quem recusou.
 */
export async function refuseMinor(deps: GateDeps, v: Validator, input: { eventId: string; ticketId: string }) {
  await loadEvent(deps, input.eventId);
  const ticket = await ticketById(deps.db, input.ticketId);
  if (!ticket || ticket.eventId !== input.eventId)
    throw new AppError(404, 'nao_encontrado', 'Ingresso não encontrado.');
  if (!ticket.buyerMinor)
    throw new AppError(422, 'dados_invalidos', 'Este ingresso não é de pedido de comprador menor.');
  await deps.db.transaction(tx =>
    writeAudit(tx, {
      actorId: v.id,
      action: 'portaria.menor_recusado',
      entity: 'ticket',
      entityId: ticket.id,
      before: null,
      after: { evento: input.eventId, codigo: ticket.shortCode },
      reason: 'Menor sem a autorização ou sem os documentos',
      at: deps.clock.now(),
    }),
  );
  return { recusado: true };
}

// ---------- busca manual (RF-52) ----------

const maskEmail = (email: string): string => {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(local.length - 1, 6)))}@${domain}`;
};

/** Minúsculas e sem acento, igual dos dois lados da comparação. */
const FROM = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const TO = 'aaaaaeeeeiiiiooooouuuucn';
export const foldName = (s: string): string =>
  [...s.toLowerCase().normalize('NFC')].map(ch => (FROM.includes(ch) ? TO[FROM.indexOf(ch)]! : ch)).join('');

export type SearchKind = 'cpf' | 'codigo' | 'email' | 'nome';
export function classifyQuery(raw: string): { kind: SearchKind; value: string } | null {
  const q = raw.trim();
  if (q.length < 3 || q.length > 100) return null;
  const digits = onlyDigits(q);
  if (/^[\d.\-\s]+$/.test(q)) return digits.length === 11 ? { kind: 'cpf', value: digits } : null; // CPF só inteiro: evita varredura por pedaços
  if (/^px-/i.test(q)) return q.length >= 6 ? { kind: 'codigo', value: q.toUpperCase().replace(/\s+/g, '') } : null;
  if (q.includes('@')) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q) ? { kind: 'email', value: q.toLowerCase() } : null; // e-mail inteiro
  return { kind: 'nome', value: foldName(q).replace(/\s+/g, ' ') };
}

export interface SearchHit {
  ticketId: string;
  shortCode: string;
  typeName: string;
  holderName: string;
  cpf: string | null;
  email: string;
  status: 'valido' | 'utilizado' | 'cancelado';
  usedAt: string | null;
  /** Pedido de comprador menor: a tela marca "MENOR" e a entrada pede a conferência da idade. */
  buyerMinor: boolean;
}

/**
 * Busca em ingressos do evento selecionado, por código, nome, CPF ou e-mail. Acesso limitado: no máximo 20 resultados;
 * CPF e e-mail só por correspondência inteira; resultado com CPF mascarado e e-mail parcialmente oculto. A consulta em si
 * não é gravada (pode ser um CPF): a trilha guarda só o tipo de busca e quantos resultados voltaram.
 */
export async function searchTickets(
  deps: GateDeps,
  v: Validator,
  input: { eventId: string; q: string },
): Promise<{ kind: SearchKind; hits: SearchHit[] }> {
  await loadEvent(deps, input.eventId);
  const parsed = classifyQuery(input.q);
  if (!parsed) {
    throw new AppError(
      422,
      'busca_invalida',
      'Digite o código do ingresso (PX-...), o nome (3 letras ou mais), o CPF completo ou o e-mail completo.',
    );
  }
  const cond =
    parsed.kind === 'cpf'
      ? eq(users.cpf, parsed.value)
      : parsed.kind === 'email'
        ? eq(users.email, parsed.value)
        : parsed.kind === 'codigo'
          ? sql`${tickets.shortCode} like ${parsed.value.replace(/[%_\\]/g, '') + '%'}`
          : sql`translate(lower(${tickets.holderName}), ${FROM}, ${TO}) like ${'%' + parsed.value.replace(/[%_\\]/g, '') + '%'}`;
  const rows = await deps.db
    .select({
      ticketId: tickets.id,
      shortCode: tickets.shortCode,
      typeName: ticketTypes.name,
      holderName: tickets.holderName,
      cpf: users.cpf,
      email: users.email,
      status: tickets.status,
      usedAt: tickets.usedAt,
      buyerMinor: sql<boolean>`coalesce(${tickets.holderMinor}, ${orders.buyerMinor})`,
    })
    .from(tickets)
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    // CPF e e-mail da conta do titular atual (D-87): depois de uma transferência, não são mais os de quem comprou.
    .innerJoin(users, eq(users.id, tickets.holderUserId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(and(eq(tickets.eventId, input.eventId), cond))
    .orderBy(asc(tickets.holderName), asc(tickets.shortCode))
    .limit(20);
  await deps.db.transaction(tx =>
    writeAudit(tx, {
      actorId: v.id,
      action: 'portaria.busca',
      entity: 'event',
      entityId: input.eventId,
      before: null,
      after: { tipo: parsed.kind, resultados: rows.length },
      at: deps.clock.now(),
    }),
  );
  logger.info('busca manual na portaria', { eventId: input.eventId, kind: parsed.kind, results: rows.length });
  return {
    kind: parsed.kind,
    hits: rows.map(r => ({
      ticketId: r.ticketId,
      shortCode: r.shortCode,
      typeName: r.typeName,
      holderName: r.holderName,
      cpf: r.cpf ? maskCpf(r.cpf) : null,
      email: maskEmail(r.email),
      status: r.status,
      usedAt: r.usedAt?.toISOString() ?? null,
      buyerMinor: r.buyerMinor,
    })),
  };
}
