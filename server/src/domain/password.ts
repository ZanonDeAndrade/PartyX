import { randomBytes, createHash } from 'node:crypto';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Pelo menos 8 caracteres, com letras e números (design A02, A05). Devolve a mensagem do problema ou null. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN || !/\d/.test(password) || !/\p{L}/u.test(password)) {
    return 'Use pelo menos 8 caracteres, com letras e números.';
  }
  if (password.length > PASSWORD_MAX) return 'Use no máximo 128 caracteres.';
  return null;
}

/** Token aleatório de 256 bits para link de recuperação. Só o hash vai para o banco. */
export const newToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/l/I, que se confundem ao ditar

/**
 * Senha temporária para a equipe (ADM22): 14 caracteres aleatórios, com letra e número.
 * Mostrada uma única vez ao administrador; o usuário é obrigado a trocá-la no primeiro acesso.
 */
export function newTemporaryPassword(): string {
  for (;;) {
    const bytes = randomBytes(14);
    // 256 não é múltiplo do alfabeto: descarta a faixa que enviesaria a escolha.
    const limit = 256 - (256 % TEMP_ALPHABET.length);
    const chars: string[] = [];
    for (const b of bytes) if (b < limit) chars.push(TEMP_ALPHABET[b % TEMP_ALPHABET.length]!);
    const value = chars.join('');
    if (value.length >= 12 && passwordProblem(value) === null) return value;
  }
}
