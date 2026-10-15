import { formatEventDateTime, formatInEventZone } from './time';
import { salesState, type SalesInput, type SalesState } from './events';

/** Regras de exibição da vitrine pública. Puras, sem I/O. */

/** Um evento publicado continua na vitrine até 8 horas depois do início (como no protótipo). Encerrar é manual. */
export const VISIBLE_AFTER_START_MS = 8 * 3_600_000;

/**
 * Até quando a página mostra "Acontecendo agora": o fim informado, ou, sem ele, a mesma janela em que o evento fica na vitrine
 * depois do início (8 h). Depois disso, e em evento encerrado, o cronômetro some.
 */
export const countdownLiveUntil = (startsAt: Date, endsAt: Date | null): Date =>
  endsAt ?? new Date(startsAt.getTime() + VISIBLE_AFTER_START_MS);


export const TYPE_LABEL: Record<SalesState, string> = {
  a_venda: 'À venda',
  em_breve: 'Em breve',
  encerrada: 'Vendas encerradas',
  esgotado: 'Esgotado',
  reservado: 'Indisponível no momento',
  indisponivel: 'Indisponível',
};

export function typeNote(state: SalesState, t: Pick<SalesInput, 'salesStartAt' | 'salesEndAt'>): string {
  switch (state) {
    case 'a_venda':
      return `Vendas até ${formatEventDateTime(t.salesEndAt)}.`;
    case 'em_breve':
      return `Vendas a partir de ${formatEventDateTime(t.salesStartAt)}.`;
    case 'encerrada':
      return `Vendas encerradas em ${formatEventDateTime(t.salesEndAt)}.`;
    case 'esgotado':
      return 'Todas as unidades foram vendidas.';
    case 'reservado':
      return 'As últimas unidades estão reservadas por outros compradores e podem voltar se a reserva expirar.';
    case 'indisponivel':
      return '';
  }
}

export type EventSaleKind = 'open' | 'soon' | 'out' | 'held' | 'closed' | 'ended';

export interface EventSale {
  kind: EventSaleKind;
  label: string;
  /** Menor preço entre os tipos à venda (só em `open`). */
  minPriceCents?: number;
  /** Início das vendas mais próximo (só em `soon`). */
  startsAt?: Date;
}

/**
 * Situação de venda do evento, a partir dos tipos (RF-21, RF-25):
 * - `open`: algum tipo à venda. - `soon`: nenhum à venda, mas há tipo ativo por começar.
 * - `out`: algum esgotado e todos os demais fora de venda. - `held`: sem vendas só por reservas em andamento.
 * - `closed`: o resto (vendas encerradas ou tudo desativado). - `ended`: evento encerrado pelo administrador.
 */
export function eventSale(
  eventStatus: 'rascunho' | 'publicado' | 'encerrado',
  /** `state` e `soonAt`: já calculados com os lotes (0013); sem eles, pelo tipo. */
  types: (SalesInput & { priceCents: number; state?: SalesState; soonAt?: Date })[],
  now: Date,
): EventSale {
  if (eventStatus === 'encerrado') return { kind: 'ended', label: 'Evento encerrado' };
  const states = types.map(t => ({ t: { ...t, salesStartAt: t.soonAt ?? t.salesStartAt }, state: t.state ?? salesState(t, now) }));

  const on = states.filter(x => x.state === 'a_venda');
  if (on.length) return { kind: 'open', label: 'À venda', minPriceCents: Math.min(...on.map(x => x.t.priceCents)) };

  const soon = states
    .filter(x => x.state === 'em_breve')
    .sort((a, b) => a.t.salesStartAt.getTime() - b.t.salesStartAt.getTime())[0];
  if (soon) {
    const day = formatInEventZone(soon.t.salesStartAt, { day: '2-digit', month: '2-digit' });
    return { kind: 'soon', label: `Vendas a partir de ${day}`, startsAt: soon.t.salesStartAt };
  }

  const dead = new Set<SalesState>(['esgotado', 'reservado', 'indisponivel', 'encerrada']);
  if (states.length && states.every(x => dead.has(x.state))) {
    if (states.some(x => x.state === 'esgotado')) return { kind: 'out', label: 'Esgotado' };
    if (states.some(x => x.state === 'reservado')) return { kind: 'held', label: 'Indisponível no momento' };
  }
  return { kind: 'closed', label: 'Vendas encerradas' };
}

/** Texto para comparar na busca: sem acento, minúsculo, espaços simples. */
export const searchKey = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
