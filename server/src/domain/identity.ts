import { onlyDigits } from './cpf';

const EMAIL_FORMAT = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** E-mail sempre minúsculo e sem espaços nas pontas. O banco confere o mesmo formato. */
export const normalizeEmail = (value: string): string => value.normalize('NFC').trim().toLowerCase();
export const isEmailFormat = (value: string): boolean => EMAIL_FORMAT.test(value) && value.length <= 254;

/** Telefone guardado só com dígitos (DDD + número, 10 ou 11 dígitos). A tela formata. */
export const normalizePhone = (value: string): string => onlyDigits(value);
export const isPhoneValid = (digits: string): boolean => /^[1-9][0-9]{9,10}$/.test(digits);

/** Nome e sobrenome (RF-01 e design A02). */
export const hasFullName = (value: string): boolean =>
  value.trim().split(/\s+/).length >= 2 && value.trim().length <= 120;
export const normalizeName = (value: string): string => value.normalize('NFC').trim().replace(/\s+/g, ' ');

/** Partículas que não viram inicial no nome mascarado. */
const NAME_PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e', "d'"]);

/**
 * Nome mascarado da outra pessoa numa transferência (D-87): o primeiro nome e as iniciais dos outros, sem partículas ("Maria da
 * Silva Oliveira" vira "Maria S. O."). Basta para quem transfere reconhecer a conta de destino sem expor o nome completo.
 */
export function maskName(value: string): string {
  const [first = '', ...rest] = normalizeName(value).split(' ');
  const initials = rest
    .filter(w => w && !NAME_PARTICLES.has(w.toLocaleLowerCase('pt-BR')))
    .map(w => `${w[0]!.toLocaleUpperCase('pt-BR')}.`);
  return [first, ...initials].join(' ').trim();
}
