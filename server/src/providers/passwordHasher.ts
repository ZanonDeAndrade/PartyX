import { hash, verify, type Algorithm } from '@node-rs/argon2';

/** Algorithm.Argon2id. A biblioteca exporta um enum constante que o `verbatimModuleSyntax` não deixa importar. */
const ARGON2ID = 2 as Algorithm;

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hashed: string, password: string): Promise<boolean>;
}

/** Argon2id (recomendado pela OWASP). Parâmetros padrão da biblioteca: 19 MiB, 2 passos, 1 faixa. */
export const argon2Hasher: PasswordHasher = {
  hash: password => hash(password, { algorithm: ARGON2ID }),
  verify: async (hashed, password) => {
    try {
      return await verify(hashed, password);
    } catch {
      return false; // hash malformado nunca autentica
    }
  },
};
