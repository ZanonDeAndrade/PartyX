/**
 * Cronômetro da página do evento (15/10/2026). Regras puras, sem DOM nem relógio: a página passa a hora "certa" e desenha o resultado.
 *
 * Hora certa: a API manda `serverNow` junto com o evento. No momento da resposta, a página guarda a diferença entre a hora do
 * servidor e o relógio do aparelho (com metade da ida e volta da rede) e, dali em diante, conta pelo relógio do aparelho mais essa
 * diferença. Quem está com o relógio adiantado ou atrasado vê a contagem certa, sem nenhuma outra chamada ao servidor.
 */

/** Diferença, em ms, a somar ao relógio do aparelho. `sentAt` e `receivedAt` são o relógio do aparelho antes e depois do pedido. */
export function clockOffsetMs(serverNowIso: string | undefined, sentAtMs: number, receivedAtMs: number): number {
  const server = serverNowIso ? Date.parse(serverNowIso) : Number.NaN;
  if (Number.isNaN(server)) return 0; // resposta sem a hora do servidor: conta pelo aparelho
  return server - (sentAtMs + receivedAtMs) / 2;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export type CountdownView =
  /** Antes do início: o que falta, em segundos inteiros (o último mostrado é 00 00 00 01). */
  | { kind: 'antes'; parts: CountdownParts; msLeft: number }
  /** Entre o início e `liveUntil`: "Acontecendo agora". `msLeft` é o que falta para sumir. */
  | { kind: 'agora'; msLeft: number }
  /** Depois de `liveUntil` (ou sem cronômetro): nada na tela. */
  | { kind: 'oculto' };

export function countdownView(nowMs: number, startsAtIso: string, liveUntilIso: string): CountdownView {
  const start = Date.parse(startsAtIso);
  const until = Date.parse(liveUntilIso);
  if (Number.isNaN(start) || Number.isNaN(until) || nowMs >= until) return { kind: 'oculto' };
  if (nowMs >= start) return { kind: 'agora', msLeft: until - nowMs };
  const msLeft = start - nowMs;
  const total = Math.ceil(msLeft / 1000);
  return {
    kind: 'antes',
    msLeft,
    parts: {
      days: Math.floor(total / 86_400),
      hours: Math.floor((total % 86_400) / 3_600),
      minutes: Math.floor((total % 3_600) / 60),
      seconds: total % 60,
    },
  };
}

/**
 * Quanto esperar até a próxima mudança na tela, em ms: a próxima virada de segundo (um pouco depois dela, para não chegar cedo) ou,
 * em "Acontecendo agora", a hora de sumir (no máximo um minuto por vez, para o relógio do aparelho mudado no meio não atrasar demais).
 */
export function nextChangeIn(view: CountdownView): number {
  if (view.kind === 'oculto') return Number.POSITIVE_INFINITY;
  if (view.kind === 'agora') return Math.min(view.msLeft + 15, 60_000);
  const rest = view.msLeft % 1000;
  return (rest === 0 ? 1000 : rest) + 15;
}

/** Dois dígitos no mínimo ("03"); dias acima de 99 aparecem inteiros ("120"). */
export const pad2 = (n: number) => String(n).padStart(2, '0');

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * O que falta, por extenso, para leitor de tela. Só até os minutos: o texto não muda a cada segundo, e o cronômetro não é anunciado
 * sozinho (fica num `role="timer"`, que não fala as mudanças).
 */
export function remainingSentence(p: CountdownParts): string {
  const items: string[] = [];
  if (p.days) items.push(plural(p.days, 'dia', 'dias'));
  if (p.hours) items.push(plural(p.hours, 'hora', 'horas'));
  if (p.minutes) items.push(plural(p.minutes, 'minuto', 'minutos'));
  if (items.length === 0) return 'Falta menos de um minuto';
  const text = items.length === 1 ? items[0]! : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
  const one = items.length === 1 && items[0]!.startsWith('1 ');
  return `${one ? 'Falta' : 'Faltam'} ${text}`;
}

/** Aviso para o leitor de tela, só na troca de estado (nunca a cada segundo). */
export function stateAnnouncement(from: CountdownView['kind'], to: CountdownView['kind']): string {
  if (from === to) return '';
  if (to === 'agora') return 'O evento começou: acontecendo agora.';
  if (to === 'oculto' && from === 'agora') return 'O evento terminou.';
  return '';
}
