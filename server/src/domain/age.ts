import { dateKeyInEventZone } from './time';

/** Idade mínima para ter conta e comprar (Termos de Uso 1.1). */
export const MIN_AGE = 16;
/** Maioridade: a partir daqui não há termo nem autorização de menor. */
export const ADULT_AGE = 18;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Data real do calendário no formato AAAA-MM-DD (recusa 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * Anos completos em `onDate` de quem nasceu em `birthDate` (as duas AAAA-MM-DD). O aniversário conta no próprio dia; quem nasceu em
 * 29/02 completa o ano em 01/03 nos anos não bissextos (Código Civil, art. 132, § 3º).
 */
export function ageOn(birthDate: string, onDate: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = onDate.split('-').map(Number) as [number, number, number];
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/**
 * Idade na DATA DO EVENTO: o dia em que o evento começa, no fuso de São Paulo. Um evento às 23h30 do dia 20 usa o dia 20, mesmo que
 * a festa passe da meia-noite (decisão de 14/10/2026).
 */
export const ageOnEvent = (birthDate: string, eventStartsAt: Date): number =>
  ageOn(birthDate, dateKeyInEventZone(eventStartsAt));

export type PurchaseAge =
  | { ok: true; age: number; minor: boolean }
  | { ok: false; age: number; reason: 'menor_de_16' | 'evento_sem_menores' };

/** Quem pode comprar para o evento: 16 anos ou mais na data dele; 16 e 17 só se o evento permitir menores. */
export function purchaseAge(birthDate: string, event: { startsAt: Date; allowsMinors: boolean }): PurchaseAge {
  const age = ageOnEvent(birthDate, event.startsAt);
  if (age < MIN_AGE) return { ok: false, age, reason: 'menor_de_16' };
  if (age < ADULT_AGE && !event.allowsMinors) return { ok: false, age, reason: 'evento_sem_menores' };
  return { ok: true, age, minor: age < ADULT_AGE };
}

/** Problema com a data de nascimento informada (`today` = hoje, AAAA-MM-DD, no fuso de São Paulo), ou `null` se ela serve. */
export function birthDateProblem(value: string, today: string): string | null {
  if (!isCalendarDate(value) || value < '1900-01-01' || value > today) return 'Informe uma data de nascimento válida.';
  if (ageOn(value, today) < MIN_AGE) return 'O cadastro é permitido a partir de 16 anos.';
  return null;
}
