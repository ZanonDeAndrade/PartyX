import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { auditLog, users } from '../db/schema';
import { hasFullName, isEmailFormat, normalizeEmail, normalizeName } from '../domain/identity';
import { newTemporaryPassword, passwordProblem } from '../domain/password';
import type { Clock } from '../providers/clock';
import type { PasswordHasher } from '../providers/passwordHasher';

export type BootstrapResult =
  | { status: 'criado'; email: string; temporaryPassword: string; passwordGenerated: boolean }
  | { status: 'ja_existe' }
  | { status: 'email_em_uso' };

/** Chave fixa do advisory lock que serializa o bootstrap entre processos. */
const BOOTSTRAP_LOCK = 0x70617274; // "part"

/**
 * Cria o primeiro administrador. Idempotente e restrito: se já existe **qualquer** administrador
 * (ativo ou não), não faz nada. Rodar duas vezes, ou duas instâncias ao mesmo tempo, cria um só.
 *
 * Sem senha fixa no código: usa a informada (vinda do Secret Manager) ou gera uma aleatória, devolvida
 * uma única vez para quem executou o comando. Em ambos os casos o primeiro acesso exige trocar a senha.
 * Não promove conta existente: se o e-mail já pertence a alguém, recusa.
 */
export async function bootstrapFirstAdmin(
  deps: { db: Db; hasher: PasswordHasher; clock: Clock },
  input: { name: string; email: string; password?: string },
): Promise<BootstrapResult> {
  const name = normalizeName(input.name);
  const email = normalizeEmail(input.email);
  if (!hasFullName(name)) throw new Error('nome do administrador inicial inválido: informe nome e sobrenome');
  if (!isEmailFormat(email)) throw new Error('e-mail do administrador inicial inválido');
  if (input.password !== undefined) {
    const problem = passwordProblem(input.password);
    if (problem) throw new Error(`senha inicial inválida: ${problem}`);
  }
  const passwordGenerated = input.password === undefined;
  const password = input.password ?? newTemporaryPassword();
  const passwordHash = await deps.hasher.hash(password);

  return deps.db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`);
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.role, 'administrador')).limit(1);
    if (existing) return { status: 'ja_existe' } as const;
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (taken) return { status: 'email_em_uso' } as const;

    const now = deps.clock.now();
    const [created] = await tx
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
        role: 'administrador',
        mustChangePassword: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: users.id });
    await tx.insert(auditLog).values({
      actorId: null,
      action: 'equipe.bootstrap',
      entity: 'user',
      entityId: created!.id,
      beforeJson: null,
      afterJson: { name, email, role: 'administrador', isActive: true },
      reason: 'primeiro administrador',
      createdAt: now,
    });
    return { status: 'criado', email, temporaryPassword: password, passwordGenerated } as const;
  });
}
