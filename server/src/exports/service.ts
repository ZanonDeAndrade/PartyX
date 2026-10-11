import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { auditLog, events } from '../db/schema';
import { maskCpf } from '../domain/cpf';
import { AppError } from '../domain/errors';
import { formatEventDateTime } from '../domain/time';
import { eventBuyers, eventTickets, listOrders, PAYMENT_SITUATION, type OrderFilter } from '../panel/service';
import { feeReport, promoterOrders, promoterRanking, salesReport, type RankMetric } from '../reports/service';
import type { Clock } from '../providers/clock';
import { int, money, safeFilename, toCsv, type Cell } from './csv';

/**
 * Exportações (RF-63, RF-64, CA-31, seção 15.1). Os dados vêm **das mesmas consultas das telas**, com os mesmos filtros, então
 * totais e filtros batem com o que o administrador vê. Nada é guardado: o arquivo é gerado na hora, só para quem está logado
 * como administrador, e cada geração fica na trilha de auditoria.
 */
export interface ExportDeps {
  db: Db;
  clock: Clock;
}

export const MAX_EXPORT_ROWS = 50_000;
const PAGE = 500;

export interface CsvExport {
  filename: string;
  csv: string;
  rows: number;
  filters: Record<string, unknown>;
}

const when = (iso: string | null) => (iso ? formatEventDateTime(new Date(iso)) : '');
const stamp = (deps: ExportDeps) => formatEventDateTime(deps.clock.now());
const day = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '');
const period = (f: { from?: string; to?: string }) =>
  f.from || f.to ? `${day(f.from) || 'início'} a ${day(f.to) || 'hoje'}` : 'todo o período';

async function eventName(db: Db, id: string): Promise<string> {
  const [e] = await db.select({ name: events.name }).from(events).where(eq(events.id, id)).limit(1);
  if (!e) throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
  return e.name;
}

/** Percorre as páginas da própria consulta da tela até acabar. Recusa arquivos acima do teto, em vez de cortar em silêncio. */
async function collect<T>(fetchPage: (page: number) => Promise<{ total: number; rows: T[] }>): Promise<T[]> {
  const first = await fetchPage(1);
  if (first.total > MAX_EXPORT_ROWS) {
    throw new AppError(
      413,
      'exportacao_grande',
      `A exportação passa de ${MAX_EXPORT_ROWS} linhas. Restrinja os filtros (evento, período ou situação).`,
    );
  }
  const all = [...first.rows];
  for (let page = 2; all.length < first.total; page++) {
    const next = await fetchPage(page);
    if (next.rows.length === 0) break;
    all.push(...next.rows);
  }
  return all;
}

// ---------- listas ----------

export async function exportOrders(deps: ExportDeps, f: Omit<OrderFilter, 'page' | 'pageSize'>): Promise<CsvExport> {
  const rows = await collect(async page => {
    const r = await listOrders({ db: deps.db, clock: deps.clock }, { ...f, page, pageSize: PAGE });
    return { total: r.total, rows: r.orders };
  });
  const evName = f.eventId ? await eventName(deps.db, f.eventId) : 'Todos';
  const paid = rows.filter(o => o.status === 'pago');
  const csv = toCsv(
    [
      'Pedido',
      'Data do pedido',
      'Pago em',
      'Evento',
      'Comprador',
      'CPF (mascarado)',
      'E-mail',
      'Situação do pagamento',
      'Forma de pagamento',
      'Código do promoter',
      'Ingressos',
      'Ingressos cancelados',
      'Valor (R$)',
    ],
    rows.map(o => [
      `PX-${o.number}`,
      when(o.createdAt),
      when(o.paidAt),
      o.event.name,
      o.buyer.name,
      o.buyer.cpf ?? '',
      o.buyer.email,
      PAYMENT_SITUATION[o.status] ?? o.status,
      o.paymentMethod === 'pix' ? 'Pix' : o.paymentMethod === 'cartao' ? 'Cartão' : '',
      o.coupon ?? '',
      int(o.tickets),
      int(o.cancelledTickets),
      money(o.totalCents),
    ]),
    [
      ['Total de pedidos listados', int(rows.length)],
      ['Pedidos com situação Pago', int(paid.length)],
      ['Soma dos pedidos com situação Pago (R$)', money(paid.reduce((t, o) => t + o.totalCents, 0))],
      [
        'Filtros aplicados',
        `Evento: ${evName}; Situação: ${f.status ? (PAYMENT_SITUATION[f.status] ?? f.status) : 'todas'}; Período de criação: ${period(f)}${f.q ? '; Busca informada' : ''}`,
      ],
      ['Gerado em', stamp(deps)],
    ],
  );
  return {
    filename: safeFilename('pedidos', evName, f.from ?? '', f.to ?? '', f.status ?? ''),
    csv,
    rows: rows.length,
    filters: {
      eventId: f.eventId ?? null,
      status: f.status ?? null,
      from: f.from ?? null,
      to: f.to ?? null,
      q: Boolean(f.q),
    },
  };
}

const TICKET_STATUS = { valido: 'Válido', utilizado: 'Utilizado', cancelado: 'Cancelado' } as const;

export async function exportEventTickets(
  deps: ExportDeps,
  eventId: string,
  f: { status?: string; typeId?: string; q?: string },
): Promise<CsvExport> {
  const name = await eventName(deps.db, eventId);
  const rows = await collect(async page => {
    const r = await eventTickets({ db: deps.db, clock: deps.clock }, eventId, { ...f, page, pageSize: PAGE });
    return { total: r.total, rows: r.tickets };
  });
  const count = (s: string) => rows.filter(t => t.status === s).length;
  const csv = toCsv(
    [
      'Código',
      'Tipo',
      'Titular',
      'CPF (mascarado)',
      'E-mail do comprador',
      'Pedido',
      'Situação do ingresso',
      'Entrou em',
      'Validador',
      'Motivo do cancelamento',
    ],
    rows.map(t => [
      t.shortCode,
      t.typeName,
      t.holderName,
      t.buyerCpf ?? '',
      t.buyerEmail,
      `PX-${t.orderNumber}`,
      TICKET_STATUS[t.status as keyof typeof TICKET_STATUS] ?? t.status,
      when(t.usedAt),
      t.validatorName ?? '',
      t.cancelReason ?? '',
    ]),
    [
      ['Total de ingressos listados', int(rows.length)],
      ['Válidos', int(count('valido'))],
      ['Utilizados', int(count('utilizado'))],
      ['Cancelados', int(count('cancelado'))],
      [
        'Filtros aplicados',
        `Evento: ${name}; Situação: ${f.status ? (TICKET_STATUS[f.status as keyof typeof TICKET_STATUS] ?? f.status) : 'todas'}${f.typeId ? '; Tipo escolhido' : ''}${f.q ? '; Busca informada' : ''}`,
      ],
      ['Gerado em', stamp(deps)],
    ],
  );
  return {
    filename: safeFilename('ingressos', name, f.status ?? ''),
    csv,
    rows: rows.length,
    filters: { eventId, status: f.status ?? null, typeId: f.typeId ?? null, q: Boolean(f.q) },
  };
}

export async function exportEventBuyers(deps: ExportDeps, eventId: string, q?: string): Promise<CsvExport> {
  const name = await eventName(deps.db, eventId);
  const rows = await collect(async page => {
    const r = await eventBuyers({ db: deps.db, clock: deps.clock }, eventId, page, PAGE, q);
    return { total: r.total, rows: r.buyers };
  });
  const csv = toCsv(
    ['Comprador', 'CPF (mascarado)', 'E-mail', 'Pedidos', 'Ingressos', 'Cancelados', 'Entraram', 'Valor pago (R$)'],
    rows.map(b => [
      b.name,
      b.cpf ?? '',
      b.email,
      int(b.orders),
      int(b.tickets),
      int(b.cancelled),
      int(b.entered),
      money(b.paidCents),
    ]),
    [
      ['Total de compradores listados', int(rows.length)],
      ['Ingressos (não cancelados)', int(rows.reduce((t, b) => t + b.tickets, 0))],
      ['Soma do valor pago (R$)', money(rows.reduce((t, b) => t + b.paidCents, 0))],
      ['Filtros aplicados', `Evento: ${name}${q ? '; Busca informada' : ''}`],
      ['Gerado em', stamp(deps)],
    ],
  );
  return { filename: safeFilename('compradores', name), csv, rows: rows.length, filters: { eventId, q: Boolean(q) } };
}

// ---------- relatórios ----------

export async function exportSales(
  deps: ExportDeps,
  f: { eventId?: string; typeId?: string; from?: string; to?: string },
): Promise<CsvExport> {
  const r = await salesReport({ db: deps.db }, f);
  const evName = f.eventId ? await eventName(deps.db, f.eventId) : 'Todos';
  const csv = toCsv(
    ['Evento', 'Tipo de ingresso', 'Ingressos', 'Valor (R$)'],
    r.lines.map(l => [l.eventName, l.typeName, int(l.tickets), money(l.cents)]),
    [
      ['TOTAL', '', int(r.totals.tickets), money(r.totals.cents)],
      ['Soma dos pedidos pagos (R$)', '', '', money(r.reconciliation.ordersCents)],
      [
        'Conciliação',
        r.reconciliation.ok === null
          ? 'não se aplica com filtro de tipo'
          : r.reconciliation.ok
            ? 'confere'
            : 'DIVERGENTE',
      ],
      ['Receita bruta (inclui estornados e contestados) (R$)', '', '', money(r.reversals.grossCents)],
      ['Estornados (R$)', '', int(r.reversals.refunded.tickets), money(r.reversals.refunded.cents)],
      ['Contestados (R$)', '', int(r.reversals.contested.tickets), money(r.reversals.contested.cents)],
      ['Receita líquida (R$)', '', '', money(r.reversals.netCents)],
      ['Critério', r.criterion],
      [
        'Filtros aplicados',
        `Evento: ${evName}; Período de aprovação: ${period(f)}${f.typeId ? '; Tipo escolhido' : ''}`,
      ],
      ['Gerado em', stamp(deps)],
    ],
  );
  return {
    filename: safeFilename('vendas', evName, f.from ?? '', f.to ?? ''),
    csv,
    rows: r.lines.length,
    filters: { eventId: f.eventId ?? null, typeId: f.typeId ?? null, from: f.from ?? null, to: f.to ?? null },
  };
}

export async function exportPromoters(
  deps: ExportDeps,
  f: { eventId?: string; from?: string; to?: string; metric: RankMetric },
): Promise<CsvExport> {
  const r = await promoterRanking({ db: deps.db }, f);
  const evName = f.eventId ? await eventName(deps.db, f.eventId) : 'Todos';
  const csv = toCsv(
    ['Posição', 'Promoter', 'Código', 'Situação do cadastro', 'Ingressos', 'Valor atribuído (R$)', 'Pedidos'],
    r.ranking.map(p => [
      int(p.position),
      p.name,
      p.code,
      p.isActive ? 'Ativo' : 'Inativo',
      int(p.tickets),
      money(p.cents),
      int(p.orders),
    ]),
    [
      [
        'Vendas sem código de promoter (fora do ranking)',
        '',
        '',
        '',
        int(r.withoutPromoter.tickets),
        money(r.withoutPromoter.cents),
        int(r.withoutPromoter.orders),
      ],
      [
        'Ordenado por',
        f.metric === 'qtd'
          ? 'quantidade de ingressos, do maior para o menor'
          : 'valor atribuído, do maior para o menor',
      ],
      ['Critério', r.criterion],
      ['Filtros aplicados', `Evento: ${evName}; Período de aprovação: ${period(f)}`],
      ['Gerado em', stamp(deps)],
    ],
  );
  return {
    filename: safeFilename('ranking-promoters', evName, f.from ?? '', f.to ?? ''),
    csv,
    rows: r.ranking.length,
    filters: { eventId: f.eventId ?? null, from: f.from ?? null, to: f.to ?? null, metric: f.metric },
  };
}

/** Vendas atribuídas a UM promoter (ADM09), com os mesmos filtros da tela. Sem comissão: só ingressos e valor atribuído. */
export async function exportPromoterOrders(
  deps: ExportDeps,
  promoterId: string,
  f: { eventId?: string; from?: string; to?: string },
): Promise<CsvExport> {
  const r = await promoterOrders({ db: deps.db }, promoterId, f);
  const evName = f.eventId ? await eventName(deps.db, f.eventId) : 'Todos';
  const csv = toCsv(
    ['Pedido', 'Evento', 'Pagamento aprovado em', 'Ingressos', 'Valor (R$)'],
    r.orders.map(o => [`PX-${o.number}`, o.eventName, when(o.paidAt), int(o.tickets), money(o.cents)]),
    [
      ['Total', '', '', int(r.totals.tickets), money(r.totals.cents)],
      ['Promoter', `${r.promoter.name} (${r.promoter.code})`],
      ['Critério', 'Pedidos pagos com o código do promoter, pela data original da aprovação. Sem desconto e sem comissão.'],
      ['Filtros aplicados', `Evento: ${evName}; Período de aprovação: ${period(f)}`],
      ['Gerado em', stamp(deps)],
    ],
  );
  return {
    filename: safeFilename('vendas-promoter', r.promoter.code, f.from ?? '', f.to ?? ''),
    csv,
    rows: r.orders.length,
    filters: { promoterId, eventId: f.eventId ?? null, from: f.from ?? null, to: f.to ?? null },
  };
}

export async function exportFee(deps: ExportDeps, month: string): Promise<CsvExport> {
  const rows = await collect(async page => {
    const r = await feeReport({ db: deps.db }, month, page, PAGE);
    return { total: r.total, rows: r.units_detail };
  });
  const summary = await feeReport({ db: deps.db }, month, 1, 1);
  const csv = toCsv(
    ['Código do ingresso', 'Pedido', 'Evento', 'Pagamento aprovado em', 'Situação atual'],
    rows.map(u => [u.shortCode, `PX-${u.orderNumber}`, u.eventName, when(u.paidAt), u.current]),
    [
      ['Mês de aprovação', month.split('-').reverse().join('/')],
      ['Ingressos apurados (unidades)', int(summary.units)],
      ['Valor por ingresso (R$)', money(summary.feePerTicketCents)],
      ['Valor da taxa no mês (R$)', money(summary.feeCents)],
      ['Pedidos de origem', int(summary.originOrders)],
      [
        'Conciliação',
        summary.reconciliation.ok
          ? 'confere'
          : `DIVERGENTE: ${summary.reconciliation.issuedUnits} emitidos para ${summary.reconciliation.expectedUnits} previstos`,
      ],
      ['Pagamentos aprovados sem estoque (fora da contagem)', int(summary.exceptions.paidWithoutStock.length)],
      ['Receita aprovada bruta (R$)', money(summary.revenue.grossCents)],
      ['Receita líquida (R$)', money(summary.revenue.netCents)],
      ['Critério', summary.criterion],
      ['Gerado em', stamp(deps)],
    ],
  );
  return { filename: safeFilename('taxa-mensal', month), csv, rows: rows.length, filters: { month } };
}

// ---------- contingência (RF-64, seção 15.1) ----------

export interface ContingencyTicket {
  shortCode: string;
  typeName: string;
  holderName: string;
  cpf: string | null;
  orderNumber: number;
  status: 'valido' | 'utilizado' | 'cancelado';
  usedAt: string | null;
}
export interface Contingency {
  event: { id: string; name: string; startsAt: string; venue: string; address: string };
  generatedAt: Date;
  /** Válidos e já utilizados, em ordem alfabética do nome. */
  admit: ContingencyTicket[];
  /** Cancelados: constam à parte e a entrada NÃO deve ser liberada. */
  cancelled: ContingencyTicket[];
  byType: { typeName: string; total: number }[];
}

const FOLD_FROM = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const FOLD_TO = 'aaaaaeeeeiiiiooooouuuucn';
const fold = (s: string) =>
  [...s.toLowerCase()].map(c => (FOLD_FROM.includes(c) ? FOLD_TO[FOLD_FROM.indexOf(c)]! : c)).join('');

/** Instantâneo da lista para a portaria: só ingressos emitidos até este momento. Ingressos criados ou cancelados depois não constam. */
export async function loadContingency(deps: ExportDeps, eventId: string): Promise<Contingency> {
  const [event] = await deps.db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
  const count = await deps.db.execute<{ n: number }>(
    sql`select count(*)::int as n from tickets where event_id = ${eventId}`,
  );
  if ((count.rows[0]?.n ?? 0) > MAX_EXPORT_ROWS)
    throw new AppError(413, 'exportacao_grande', 'Evento grande demais para uma única lista.');
  const rows = await deps.db.execute<Record<string, unknown>>(sql`
    select t.short_code, ty.name as type_name, t.holder_name, u.cpf, o.number, t.status::text as status, t.used_at
      from tickets t
      join ticket_types ty on ty.id = t.ticket_type_id
      join orders o on o.id = t.order_id
      join users u on u.id = o.user_id
     where t.event_id = ${eventId}`);
  const all: ContingencyTicket[] = rows.rows.map(r => ({
    shortCode: r.short_code as string,
    typeName: r.type_name as string,
    holderName: r.holder_name as string,
    cpf: r.cpf ? maskCpf(r.cpf as string) : null,
    orderNumber: Number(r.number),
    status: r.status as ContingencyTicket['status'],
    usedAt: r.used_at ? new Date(r.used_at as string).toISOString() : null,
  }));
  const byName = (a: ContingencyTicket, b: ContingencyTicket) =>
    fold(a.holderName).localeCompare(fold(b.holderName), 'pt-BR') || a.shortCode.localeCompare(b.shortCode);
  const admit = all.filter(t => t.status !== 'cancelado').sort(byName);
  const types = new Map<string, number>();
  for (const t of admit) types.set(t.typeName, (types.get(t.typeName) ?? 0) + 1);
  return {
    event: {
      id: event.id,
      name: event.name,
      startsAt: event.startsAt.toISOString(),
      venue: event.venue,
      address: event.address,
    },
    generatedAt: deps.clock.now(),
    admit,
    cancelled: all.filter(t => t.status === 'cancelado').sort(byName),
    byType: [...types.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([typeName, total]) => ({ typeName, total })),
  };
}

export function contingencyCsv(c: Contingency): CsvExport {
  const row = (t: ContingencyTicket): Cell[] => [
    t.shortCode,
    t.typeName,
    t.holderName,
    t.cpf ?? '',
    `PX-${t.orderNumber}`,
    t.status === 'cancelado'
      ? 'CANCELADO: NÃO LIBERAR A ENTRADA'
      : t.status === 'utilizado'
        ? 'Já utilizado'
        : 'Válido',
    '',
  ];
  const csv = toCsv(
    [
      'Código',
      'Tipo',
      'Comprador',
      'CPF (mascarado)',
      'Pedido',
      'Situação na hora da exportação',
      'Entrou (marque aqui)',
    ],
    [...c.admit.map(row), ...c.cancelled.map(row)],
    [
      ['Ingressos para liberar', int(c.admit.length)],
      ...c.byType.map((t): Cell[] => [`  ${t.typeName}`, int(t.total)]),
      ['Cancelados (não liberar)', int(c.cancelled.length)],
      ['Evento', `${c.event.name}, ${when(c.event.startsAt)}, ${c.event.venue}`],
      ['Lista gerada em', formatEventDateTime(c.generatedAt)],
      [
        'Atenção',
        'Instantâneo: ingressos emitidos ou cancelados depois desta hora não constam. Com o sistema no ar, valide pelo QR Code. Contém dados pessoais: guarde em local seguro e descarte depois do evento.',
      ],
    ],
  );
  return {
    filename: safeFilename('contingencia', c.event.name),
    csv,
    rows: c.admit.length + c.cancelled.length,
    filters: { eventId: c.event.id },
  };
}

// ---------- auditoria ----------

/** Quem exportou o quê e quando. Os filtros entram sem texto digitado (a busca pode ser um CPF ou e-mail). */
export async function auditExport(
  deps: ExportDeps,
  actorId: string,
  entry: { kind: string; format: 'csv' | 'pdf'; rows: number; filters: Record<string, unknown>; eventId?: string },
) {
  await deps.db.insert(auditLog).values({
    actorId,
    action: `exportacao.${entry.kind}`,
    entity: entry.eventId ? 'event' : 'export',
    entityId: entry.eventId ?? null,
    beforeJson: null,
    afterJson: { formato: entry.format, linhas: entry.rows, filtros: entry.filters },
    reason: null,
    createdAt: deps.clock.now(),
  });
}
