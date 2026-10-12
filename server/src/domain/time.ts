/**
 * Instantes são guardados em UTC. O fuso do evento só entra na hora de exibir ou de
 * decidir "em que dia/mês" algo aconteceu (ex.: virada do mês do relatório da taxa).
 */
export const EVENT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Formatadores reaproveitados. Cada `new Intl.DateTimeFormat` aloca memória nativa do ICU (cerca de 25 KB) que o V8 quase não
 * contabiliza: criado a cada requisição, o coletor demora a rodar e o processo passou de 1 GB na carga (docs/evidencias/carga).
 * As opções vêm de constantes do código; o teto só protege contra uma chamada que monte opções variáveis.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();
const MAX_FORMATTERS = 64;

/** Formatador no fuso do evento, criado uma vez por combinação de idioma e opções. */
export function eventZoneFormatter(
  locale: 'pt-BR' | 'en-CA',
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { timeZone: EVENT_TIMEZONE, ...options });
    if (formatters.size < MAX_FORMATTERS) formatters.set(key, formatter);
  }
  return formatter;
}

export function formatInEventZone(instant: Date, options: Intl.DateTimeFormatOptions): string {
  return eventZoneFormatter('pt-BR', options).format(instant);
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
  const parts = eventZoneFormatter('en-CA', { year: 'numeric', month: '2-digit' }).formatToParts(instant);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}`;
}

/** Dia (AAAA-MM-DD) de um instante, no fuso do evento. Usado na busca por data. */
export function dateKeyInEventZone(instant: Date): string {
  return eventZoneFormatter('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}
