import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { consents, emailLog, passwordResets, users } from '../db/schema';
import { AppError } from '../domain/errors';
import { isValidCpf, onlyDigits } from '../domain/cpf';
import {
  hasFullName,
  isEmailFormat,
  isPhoneValid,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from '../domain/identity';
import { hashToken, passwordProblem } from '../domain/password';
import { birthDateProblem } from '../domain/age';
import { dateKeyInEventZone } from '../domain/time';
import { enqueueEmail, processSoon } from '../mail/outbox';
import { signupBlockers } from '../legal/documents';
import { logger } from '../logger';
import { loginBlock, recordLoginAttempt } from './limits';
import { createSession, revokeSession, revokeUserSessions } from './sessions';
import type { AuthDeps, AuthUser, RequestMeta } from './types';

const HOUR = 3_600_000;
export { RESET_TOKEN_TTL_MS } from './reset';
const RESET_REQUESTS_PER_HOUR = 3;

export interface FieldError {
  campo: string;
  mensagem: string;
}

const invalid = (errors: FieldError[]) =>
  new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', errors);

/** Erro do PostgreSQL pelo código SQLSTATE e nome da constraint, mesmo embrulhado pelo Drizzle. */
export function pgError(error: unknown): { code?: string; constraint?: string } {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return { code: e?.code ?? e?.cause?.code, constraint: e?.constraint ?? e?.cause?.constraint };
}

// ---------- cadastro (RF-01, RF-02, RF-03) ----------

export interface RegisterInput {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  /** AAAA-MM-DD. Obrigatória desde 14/10/2026 (regras de menores): recusa quem tem menos de 16 anos hoje. */
  birthDate: string;
  password: string;
  acceptedTermsVersion: string;
  acceptedPrivacyVersion: string;
}

export async function register(deps: AuthDeps, input: RegisterInput, meta: RequestMeta) {
  const { legal } = deps.config;
  const blockers = signupBlockers(deps.config);
  if (!legal.ready || blockers.length) {
    // Sem os textos legais do cliente publicados (ou com o cadastro fechado pela flag), não há o que aceitar: bloqueia o cadastro
    // real. O motivo vai só para o log, nunca para quem tenta se cadastrar.
    logger.warn('cadastro bloqueado', {
      motivos: blockers.length ? blockers : ['versões dos Termos e da Privacidade'],
    });
    throw new AppError(
      503,
      'cadastro_indisponivel',
      'O cadastro está temporariamente indisponível. Tente novamente mais tarde.',
    );
  }
  if (input.acceptedTermsVersion !== legal.terms || input.acceptedPrivacyVersion !== legal.privacy) {
    throw new AppError(
      409,
      'versao_desatualizada',
      'Os Termos de Uso ou a Política de Privacidade foram atualizados. Leia e aceite novamente.',
    );
  }

  const name = normalizeName(input.name);
  const email = normalizeEmail(input.email);
  const cpf = onlyDigits(input.cpf);
  const phone = normalizePhone(input.phone);

  const errors: FieldError[] = [];
  if (!hasFullName(name)) errors.push({ campo: 'name', mensagem: 'Informe nome e sobrenome.' });
  if (!isEmailFormat(email)) errors.push({ campo: 'email', mensagem: 'Informe um e-mail válido.' });
  if (cpf.length < 11) errors.push({ campo: 'cpf', mensagem: 'Informe os 11 dígitos do CPF.' });
  else if (!isValidCpf(cpf)) errors.push({ campo: 'cpf', mensagem: 'CPF inválido. Confira os números digitados.' });
  if (!isPhoneValid(phone)) errors.push({ campo: 'phone', mensagem: 'Informe o telefone com DDD.' });
  const birthDate = (input.birthDate ?? '').trim();
  const birthProblem = birthDateProblem(birthDate, dateKeyInEventZone(deps.clock.now()));
  if (birthProblem) errors.push({ campo: 'birthDate', mensagem: birthProblem });
  const pwProblem = passwordProblem(input.password);
  if (pwProblem) errors.push({ campo: 'password', mensagem: pwProblem });
  if (errors.length) throw invalid(errors);

  // E-mail e CPF repetidos (CA-02). A mensagem é explícita porque o critério exige "mensagem clara"; o endpoint tem limite de taxa.
  const dup = await deps.db
    .select({ email: users.email, cpf: users.cpf })
    .from(users)
    .where(sql`${users.email} = ${email} or ${users.cpf} = ${cpf}`);
  if (dup.length) {
    const dupErrors: FieldError[] = [];
    if (dup.some(d => d.email === email))
      dupErrors.push({ campo: 'email', mensagem: 'Este e-mail já tem cadastro. Entre ou recupere sua senha.' });
    if (dup.some(d => d.cpf === cpf))
      dupErrors.push({ campo: 'cpf', mensagem: 'Este CPF já tem cadastro. Entre com sua conta ou fale com a PartyX.' });
    throw invalid(dupErrors);
  }

  const passwordHash = await deps.hasher.hash(input.password);
  const now = deps.clock.now();
  let user: AuthUser;
  try {
    user = await deps.db.transaction(async tx => {
      const [created] = await tx
        .insert(users)
        .values({ name, email, cpf, phone, birthDate, passwordHash, role: 'cliente', createdAt: now, updatedAt: now })
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          cpf: users.cpf,
          phone: users.phone,
          birthDate: users.birthDate,
          role: users.role,
          isActive: users.isActive,
          mustChangePassword: users.mustChangePassword,
        });
      await tx.insert(consents).values({
        userId: created!.id,
        termsVersion: legal.terms,
        privacyVersion: legal.privacy,
        acceptedAt: now,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
      });
      return created!;
    });
  } catch (error) {
    // Duas requisições simultâneas com o mesmo e-mail ou CPF: o banco decide.
    const { code, constraint } = pgError(error);
    if (code === '23505') {
      throw invalid([
        constraint?.includes('cpf')
          ? { campo: 'cpf', mensagem: 'Este CPF já tem cadastro. Entre com sua conta ou fale com a PartyX.' }
          : { campo: 'email', mensagem: 'Este e-mail já tem cadastro. Entre ou recupere sua senha.' },
      ]);
    }
    throw error;
  }

  // Confirmação de cadastro (CA-01). Vai para a fila de e-mails; falha de envio nunca desfaz o cadastro. Não há etapa
  // obrigatória de verificação: a conta já funciona.
  await enqueueEmail(deps.db, deps.clock, {
    userId: user.id,
    template: 'cadastro',
    idempotencyKey: `cadastro:${user.id}`,
  });
  await processSoon(deps, { userId: user.id });

  const session = await createSession(deps, user, meta);
  return { user, session };
}

// ---------- login (RF-04, RF-10) ----------

let dummyHash: Promise<string> | null = null;

export async function login(deps: AuthDeps, input: { email: string; password: string }, meta: RequestMeta) {
  const email = normalizeEmail(input.email);
  if (!email || !input.password) throw new AppError(400, 'campos_obrigatorios', 'Preencha e-mail e senha.');

  const block = await loginBlock(deps, email, meta.ip);
  if (block.blocked) {
    throw new AppError(
      429,
      'login_bloqueado',
      'Acesso bloqueado temporariamente. Houve muitas tentativas sem sucesso.',
      {
        tentarNovamenteEmSegundos: block.retryAfterSeconds,
      },
    );
  }

  const [row] = await deps.db.select().from(users).where(eq(users.email, email)).limit(1);
  // Sempre confere uma senha, mesmo sem usuário, para o tempo de resposta não revelar se o e-mail existe.
  dummyHash ??= deps.hasher.hash('senha-ficticia-para-igualar-o-tempo-1');
  const ok = await deps.hasher.verify(row?.passwordHash ?? (await dummyHash), input.password);

  if (!row || !ok) {
    await recordLoginAttempt(deps, email, meta.ip, false);
    throw new AppError(401, 'credenciais_invalidas', 'E-mail ou senha incorretos.');
  }
  if (!row.isActive) {
    // Só revelado a quem acertou a senha.
    throw new AppError(403, 'conta_desativada', 'Esta conta está desativada.', { equipe: row.role !== 'cliente' });
  }

  await recordLoginAttempt(deps, email, meta.ip, true);
  await deps.db.update(users).set({ lastLoginAt: deps.clock.now() }).where(eq(users.id, row.id));

  const user: AuthUser = {
    id: row.id,
    name: row.name,
    email: row.email,
    cpf: row.cpf,
    phone: row.phone,
    birthDate: row.birthDate,
    role: row.role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
  };
  const session = await createSession(deps, user, meta);
  return { user, session };
}

export async function logout(deps: AuthDeps, sessionId: string) {
  await revokeSession(deps, sessionId);
}

// ---------- recuperação de senha (RF-05) ----------

/** Resposta idêntica exista o e-mail ou não (CA-04, design A04). */
export async function requestPasswordReset(deps: AuthDeps, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!isEmailFormat(email)) return;

  const [user] = await deps.db
    .select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || !user.isActive) return;

  const now = deps.clock.now();
  const since = new Date(now.getTime() - HOUR);
  // Limite de pedidos por hora, contado na fila de e-mails (o token só é criado no envio).
  const recent = await deps.db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(
      and(eq(emailLog.userId, user.id), eq(emailLog.template, 'recuperacao_senha'), gt(emailLog.createdAt, since)),
    );
  if (recent.length >= RESET_REQUESTS_PER_HOUR) return; // abuso: ignora em silêncio, sem revelar nada

  await enqueueEmail(deps.db, deps.clock, {
    userId: user.id,
    template: 'recuperacao_senha',
    idempotencyKey: `reset:${crypto.randomUUID()}`,
  });
  await processSoon(deps, { userId: user.id });
}

export type ResetState = 'valido' | 'expirado' | 'utilizado' | 'invalido';

export async function resetTokenState(deps: AuthDeps, token: string): Promise<ResetState> {
  const [row] = await deps.db
    .select({ usedAt: passwordResets.usedAt, expiresAt: passwordResets.expiresAt })
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return 'invalido';
  if (row.usedAt) return 'utilizado';
  if (row.expiresAt.getTime() <= deps.clock.now().getTime()) return 'expirado';
  return 'valido';
}

const RESET_ERRORS: Record<Exclude<ResetState, 'valido'>, [string, string]> = {
  invalido: ['link_invalido', 'Este link não é válido. Solicite um novo.'],
  expirado: ['link_expirado', 'Este link expirou. Solicite um novo.'],
  utilizado: ['link_utilizado', 'Este link já foi utilizado. Se você não alterou sua senha, solicite um novo.'],
};

export async function resetPassword(deps: AuthDeps, input: { token: string; password: string }) {
  const problem = passwordProblem(input.password);
  if (problem) throw invalid([{ campo: 'password', mensagem: problem }]);

  const now = deps.clock.now();
  const passwordHash = await deps.hasher.hash(input.password);
  const userId = await deps.db.transaction(async tx => {
    // Uso único atômico: só uma requisição consegue marcar o token como usado.
    const [claimed] = await tx
      .update(passwordResets)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResets.tokenHash, hashToken(input.token)),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, now),
        ),
      )
      .returning({ userId: passwordResets.userId });
    if (!claimed) return null;
    await tx.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, claimed.userId));
    await tx
      .update(passwordResets)
      .set({ expiresAt: now })
      .where(
        and(
          eq(passwordResets.userId, claimed.userId),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, now),
        ),
      );
    return claimed.userId;
  });

  if (!userId) {
    const state = await resetTokenState(deps, input.token);
    const [code, message] = RESET_ERRORS[state === 'valido' ? 'invalido' : state];
    throw new AppError(400, code, message);
  }
  // Trocar a senha encerra todas as sessões abertas.
  await revokeUserSessions(deps, userId);
}

// ---------- conta do cliente (RF-06) ----------

export async function updateProfile(deps: AuthDeps, userId: string, input: { name: string; phone: string }) {
  const name = normalizeName(input.name);
  const phone = normalizePhone(input.phone);
  const errors: FieldError[] = [];
  if (!hasFullName(name)) errors.push({ campo: 'name', mensagem: 'Informe nome e sobrenome.' });
  if (!isPhoneValid(phone)) errors.push({ campo: 'phone', mensagem: 'Informe o telefone com DDD.' });
  if (errors.length) throw invalid(errors);
  // E-mail e CPF não mudam por aqui: só o administrador corrige (RF-06).
  await deps.db.update(users).set({ name, phone }).where(eq(users.id, userId));
  return { name, phone };
}

export async function changePassword(
  deps: AuthDeps,
  auth: { userId: string; sessionId: string },
  input: { currentPassword: string; newPassword: string },
) {
  const [row] = await deps.db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);
  if (!row || !(await deps.hasher.verify(row.passwordHash, input.currentPassword))) {
    throw invalid([{ campo: 'currentPassword', mensagem: 'Senha atual incorreta.' }]);
  }
  const problem = passwordProblem(input.newPassword);
  if (problem) throw invalid([{ campo: 'newPassword', mensagem: problem }]);
  if (input.newPassword === input.currentPassword)
    throw invalid([{ campo: 'newPassword', mensagem: 'A nova senha precisa ser diferente da atual.' }]);

  await deps.db
    .update(users)
    .set({ passwordHash: await deps.hasher.hash(input.newPassword), mustChangePassword: false })
    .where(eq(users.id, auth.userId));
  // Mantém só a sessão atual: os outros aparelhos precisam entrar de novo.
  await revokeUserSessions(deps, auth.userId, auth.sessionId);
}

// ---------- data de nascimento de conta antiga (regras de menores, 14/10/2026) ----------

/**
 * Conta criada antes da 0009 informa a data de nascimento uma única vez (o checkout pede antes de continuar). Depois de gravada, só a
 * PartyX altera (`correctIdentity`), como o CPF. A gravação é condicional (`birth_date is null`): duas abas não sobrescrevem.
 */
export async function setOwnBirthDate(deps: AuthDeps, userId: string, rawBirthDate: string) {
  const birthDate = rawBirthDate.trim();
  const problem = birthDateProblem(birthDate, dateKeyInEventZone(deps.clock.now()));
  if (problem) throw invalid([{ campo: 'birthDate', mensagem: problem }]);
  const rows = await deps.db
    .update(users)
    .set({ birthDate, updatedAt: deps.clock.now() })
    .where(and(eq(users.id, userId), isNull(users.birthDate)))
    .returning({ id: users.id });
  if (rows.length === 0)
    throw new AppError(
      409,
      'data_nascimento_ja_informada',
      'A data de nascimento já foi informada. Para corrigir, fale com a PartyX.',
    );
  return { birthDate };
}
