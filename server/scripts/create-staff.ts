import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { readDatabaseEnvironment } from '../src/db/environment';
import { users } from '../src/db/schema';
import { loadConfig } from '../src/config';
import { logger } from '../src/logger';
import { createMemberWithPassword, STAFF_ROLES, type StaffRole } from '../src/auth/team';
import { AppError } from '../src/domain/errors';
import { normalizeEmail } from '../src/domain/identity';
import { systemClock } from '../src/providers/clock';
import { argon2Hasher } from '../src/providers/passwordHasher';

/**
 * Cria um membro da equipe pelo terminal quando já existe administrador (o bootstrap só cria o primeiro).
 * Uso: STAFF_ACTOR_EMAIL=<administrador ativo que responde pela criação> STAFF_NAME="Nome Sobrenome" STAFF_EMAIL=...
 *      STAFF_ROLE=administrador|validador STAFF_REASON="motivo" STAFF_PASSWORD=... npm run admin:create-staff
 * A senha vem só do ambiente do processo (o script de apoio a pede sem eco) e nunca é impressa.
 * Opcional: STAFF_EXPECT_ENV=producao recusa um banco com outra marca de ambiente.
 */
const config = loadConfig();
const env = (name: string) => process.env[name]?.trim() || '';
function fail(message: string): never {
  logger.error(`criar equipe: ${message}`);
  process.exit(1);
}

if (!config.DATABASE_URL) fail('defina DATABASE_URL');
const role = env('STAFF_ROLE') as StaffRole;
if (!STAFF_ROLES.includes(role)) fail('STAFF_ROLE deve ser administrador ou validador');
const actorEmail = env('STAFF_ACTOR_EMAIL');
const name = env('STAFF_NAME');
const email = env('STAFF_EMAIL');
const reason = env('STAFF_REASON');
if (!actorEmail || !name || !email || !reason) fail('defina STAFF_ACTOR_EMAIL, STAFF_NAME, STAFF_EMAIL e STAFF_REASON');
const password = process.env.STAFF_PASSWORD ?? '';

const database = createDatabase(config);
try {
  const marker = await readDatabaseEnvironment(database);
  const expected = env('STAFF_EXPECT_ENV');
  if (expected && marker !== expected) fail(`o banco está marcado como "${marker ?? 'sem marca'}", não "${expected}"`);

  const [actor] = await database.db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, normalizeEmail(actorEmail)), eq(users.role, 'administrador'), eq(users.isActive, true)))
    .limit(1);
  if (!actor) fail('o autor informado não é administrador ativo');

  const member = await createMemberWithPassword(
    { db: database.db, hasher: argon2Hasher, clock: systemClock },
    actor,
    { name, email, role },
    password,
    reason,
  );
  // Só o que não é segredo: nunca a senha.
  console.log(
    `\nCriado no banco marcado como "${marker ?? 'sem marca'}": ${member.name} <${member.email}>, perfil ${member.role}.` +
      '\nO primeiro acesso exige trocar a senha. A trilha registrou equipe.criar com o autor e o motivo.\n',
  );
} catch (error) {
  if (error instanceof AppError) {
    const fields = (error.details as { mensagem: string }[] | undefined)?.map(d => d.mensagem).join(' ') ?? '';
    fail(`recusado (${error.code}): ${error.message} ${fields}`.trim());
  }
  throw error;
} finally {
  await database.close();
}
