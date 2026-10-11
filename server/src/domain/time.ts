/**
 * Instantes são guardados em UTC. O fuso do evento só entra na hora de exibir ou de
 * decidir "em que dia/mês" algo aconteceu (ex.: virada do mês do relatório da taxa).
 */
export const EVENT_TIMEZONE = 'America/Sao_Paulo';

export function formatInEventZone(instant: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: EVENT_TIMEZONE, ...options }).format(instant);
}

/** Data e hora no formato brasileiro, no fuso do evento: 17/10/2026 23:00. */
export function formatEventDateTime(instant: Date): string {
  return formatInEventZone(instant, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).replace(',', '');
}

/** Mês de referência (AAAA-MM) de um instante, no fuso do evento. */
export function monthKeyInEventZone(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}`;
}

/** Dia (AAAA-MM-DD) de um instante, no fuso do evento. Usado na busca por data. */
export function dateKeyInEventZone(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
