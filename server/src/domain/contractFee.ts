import { formatBRL } from './money';
import type { PaymentMethod } from './payment';
import { formatInEventZone } from './time';

/**
 * Taxa da contratada por ingresso (Cl. 6.3; D-93, aditivo de 21/10/2026). As regras ficam na tabela `contract_fee_rules`, cada uma
 * valendo do seu início até o da seguinte; o relatório recorta o mês em períodos, um por regra vigente nele. Aqui ficam só as partes
 * puras: se um ingresso entra no repasse e o texto do aviso, gerado da própria regra (uma regra nova não pede texto novo no código).
 */
export interface ContractFeePeriod {
  /** Início do período, incluído. */
  startsAt: Date;
  /** Fim do período, excluído (o início da regra seguinte ou o primeiro instante do mês seguinte). */
  endsAt: Date;
  perTicketCents: number;
  /** Formas que entram no repasse; nulo: qualquer forma, inclusive pedido sem forma informada. */
  methods: PaymentMethod[] | null;
  reference: string;
}

const METHOD_LABEL: Record<PaymentMethod, string> = { pix: 'Pix', cartao: 'cartão' };
const KNOWN: PaymentMethod[] = ['pix', 'cartao'];

/** O ingresso de um pedido pago com `method` entra no repasse da regra? */
export function countsInFee(methods: readonly PaymentMethod[] | null, method: PaymentMethod | null): boolean {
  return methods === null || (method !== null && methods.includes(method));
}

/** "a", "a ou b", "a, b ou c". */
function either(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} ou ${words.at(-1)}`;
}

const at = (d: Date, opts: Intl.DateTimeFormatOptions) => formatInEventZone(d, opts);
const DAY: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
const midnight = (d: Date) => at(d, { ...TIME, second: '2-digit' }) === '00:00:00';

/** "De 01/10/2026 a 20/10/2026", com a hora quando o período não começa ou não termina na virada do dia em Brasília. */
export function periodLabel(p: Pick<ContractFeePeriod, 'startsAt' | 'endsAt'>): string {
  const last = new Date(p.endsAt.getTime() - 1000);
  const exact = midnight(p.startsAt) && midnight(p.endsAt);
  const from = exact ? at(p.startsAt, DAY) : `${at(p.startsAt, DAY)} ${at(p.startsAt, TIME)}`;
  const to = exact ? at(last, DAY) : `${at(last, DAY)} ${at(last, TIME)}`;
  return `De ${from} a ${to}`;
}

/** Uma linha do aviso do relatório, por período. */
export function periodNotice(p: ContractFeePeriod): string {
  const value = `${formatBRL(p.perTicketCents)} por ingresso`;
  if (p.methods === null) return `${periodLabel(p)}: ${value}, qualquer forma de pagamento (${p.reference}).`;
  const out = KNOWN.filter(m => !p.methods!.includes(m)).map(m => METHOD_LABEL[m]);
  const counted = `${value} de pedido pago por ${either(p.methods.map(m => METHOD_LABEL[m]))}`;
  const left = out.length > 0 ? `; ingressos pagos por ${either(out)} não entram no repasse e aparecem só para informação` : '';
  return `${periodLabel(p)}: ${counted}${left} (${p.reference}).`;
}
