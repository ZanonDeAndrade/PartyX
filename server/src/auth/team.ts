import { and, asc, eq, inArray } from 'drizzle-orm';
import { auditLog, users } from '../db/schema';
import { maskCpf, isValidCpf, onlyDigits } from '../domain/cpf';
import { AppError } from '../domain/errors';
import {
  hasFullName,
  isEmailFormat,
  isPhoneValid,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from '../domain/identity';
import { newTemporaryPassword } from '../domain/password';
import { pgError, type FieldError } from './service';
import { revokeUserSessions } from './sessions';
import type { AuthDeps, Role } from './types';

export type StaffRole = Exclude<Role, 'cliente'>;
export const STAFF_ROLES: readonly StaffRole[] = ['validador', 'administrador'];

/** Quem está agindo. Vem da sessão já validada. */
export interface Actor {
  id: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
  role: StaffRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const memberColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  cpf: users.cpf,
  phone: users.phone,
  role: users.role,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

type Row = {
  id: string;
  role: Role;
  name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
  isActive: boolean;
};

const invalid = (errors: FieldError[]) =>
  new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', errors);

/** Foto do usuário para a trilha de auditoria. Sem hash de senha; CPF mascarado. */
const snapshot = (u: Row) => ({
  name: u.name,
  email: u.email,
  cpf: u.cpf ? maskCpf(u.cpf) : null,
  phone: u.phone,
  role: u.role,
  isActive: u.isActive,
});

function conflict(error: unknown): never {
  const { code, constraint } = pgError(error);
  if (code === '23505') {
    throw invalid([
      constraint?.includes('cpf')
        ? { campo: 'cpf', mensagem: 'Este CPF já tem cadastro.' }
        : { campo: 'email', mensagem: 'Este e-mail já tem cadastro.' },
    ]);
  }
  throw error;
}

const asStaff = (row: { role: Role } & Record<string, unknown>) => row as unknown as TeamMember;

export async function listTeam(deps: AuthDeps): Promise<TeamMember[]> {
  const rows = await deps.db
    .select(memberColumns)
    .from(users)
    .where(inArray(users.role, [...STAFF_ROLES]))
    .orderBy(asc(users.name), asc(users.id));
  return rows.map(asStaff);
}

interface MemberInput {
  name?: string;
  email?: string;
  phone?: string | null;
  cpf?: string | null;
}

/** Valida e normaliza só os campos presentes. */
function checkMember(input: MemberInput, required: boolean) {
  const out: { name?: string; email?: string; phone?: string | null; cpf?: string | null } = {};
  const errors: FieldError[] = [];
  if (input.name !== undefined || required) {
    const name = normalizeName(input.name ?? '');
    if (!hasFullName(name)) errors.push({ campo: 'name', mensagem: 'Informe nome e sobrenome.' });
    out.name = name;
  }
  if (input.email !== undefined || required) {
    const email = normalizeEmail(input.email ?? '');
    if (!isEmailFormat(email)) errors.push({ campo: 'email', mensagem: 'Informe um e-mail válido.' });
    out.email = email;
  }
  if (input.phone !== undefined) {
    const phone = input.phone === null || input.phone.trim() === '' ? null : normalizePhone(input.phone);
    if (phone !== null && !isPhoneValid(phone))
      errors.push({ campo: 'phone', mensagem: 'Informe o telefone com DDD.' });
    out.phone = phone;
  }
  if (input.cpf !== undefined) {
    const cpf = input.cpf === null || input.cpf.trim() === '' ? null : onlyDigits(input.cpf);
    if (cpf !== null && !isValidCpf(cpf))
      errors.push({ campo: 'cpf', mensagem: 'CPF inválido. Confira os números digitados.' });
    out.cpf = cpf;
  }
  if (errors.length) throw invalid(errors);
  return out;
}

/**
 * Tranca os administradores ativos em ordem fixa de id e confirma que quem age ainda é um deles.
 * Duas desativações simultâneas esperam uma pela outra e a segunda enxerga o resultado da primeira,
 * então a plataforma nunca fica sem administrador ativo.
 */
type Tx = Parameters<Parameters<AuthDeps['db']['transaction']>[0]>[0];
async function lockActiveAdmins(tx: Tx, actor: Actor) {
  const admins = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'administrador'), eq(users.isActive, true)))
    .orderBy(asc(users.id))
    .for('update');
  if (!admins.some(a => a.id === actor.id)) {
    throw new AppError(403, 'sem_permissao', 'Você não tem permissão para acessar esta área.');
  }
  return admins.map(a => a.id);
}

async function loadTarget(tx: Tx, id: string, staffOnly: boolean): Promise<Row> {
  const [row] = await tx
    .select({
      id: users.id,
      role: users.role,
      name: users.name,
      email: users.email,
      cpf: users.cpf,
      phone: users.phone,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
    .for('update');
  // Cliente some desta área: quem gerencia a equipe não enxerga que o id existe.
  if (!row || (staffOnly && row.role === 'cliente')) {
    throw new AppError(404, 'nao_encontrado', 'Usuário não encontrado.');
  }
  return row;
}

async function audit(
  tx: Tx,
  deps: AuthDeps,
  actor: Actor,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
  reason?: string,
) {
  await tx.insert(auditLog).values({
    actorId: actor.id,
    action,
    entity: 'user',
    entityId,
    beforeJson: before,
    afterJson: after,
    reason: reason ?? null,
    createdAt: deps.clock.now(),
  });
}

// ---------- cadastro (RF-08) ----------

export interface CreateMemberInput extends MemberInput {
  name: string;
  email: string;
  role: StaffRole;
}

/** Cria o acesso com senha temporária aleatória. A senha só existe na resposta desta chamada. */
export async function createMember(deps: AuthDeps, actor: Actor, input: CreateMemberInput) {
  const data = checkMember(input, true);
  const temporaryPassword = newTemporaryPassword();
  const passwordHash = await deps.hasher.hash(temporaryPassword);
  const now = deps.clock.now();
  try {
    const member = await deps.db.transaction(async tx => {
      await lockActiveAdmins(tx, actor);
      const [created] = await tx
        .insert(users)
        .values({
          name: data.name!,
          email: data.email!,
          phone: data.phone ?? null,
          cpf: data.cpf ?? null,
          passwordHash,
          role: input.role,
          mustChangePassword: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning(memberColumns);
      await audit(tx, deps, actor, 'equipe.criar', created!.id, null, snapshot(created!));
      return created!;
    });
    return { member: asStaff(member), temporaryPassword };
  } catch (error) {
    return conflict(error);
  }
}

// ---------- edição ----------

export interface UpdateMemberInput extends MemberInput {
  role?: StaffRole;
}

export async function updateMember(deps: AuthDeps, actor: Actor, id: string, input: UpdateMemberInput) {
  const data = checkMember(input, false);
  try {
    return await deps.db
      .transaction(async tx => {
        const adminIds = await lockActiveAdmins(tx, actor);
        const before = await loadTarget(tx, id, true);
        const roleChanges = input.role !== undefined && input.role !== before.role;

        if (roleChanges && id === actor.id) {
          throw new AppError(409, 'autoalteracao', 'Você não pode alterar o seu próprio perfil.');
        }

        if (roleChanges && before.role === 'administrador' && before.isActive && adminIds.length <= 1) {
          throw new AppError(409, 'ultimo_administrador', 'Não é possível retirar o único administrador ativo.');
        }

        const [after] = await tx
          .update(users)
          .set({ ...data, ...(input.role ? { role: input.role } : {}), updatedAt: deps.clock.now() })
          .where(eq(users.id, id))
          .returning(memberColumns);
        await audit(tx, deps, actor, 'equipe.editar', id, snapshot(before), snapshot(after!));
        return {
          member: asStaff(after!),
          revoke: roleChanges || (data.email !== undefined && data.email !== before.email),
        };
      })
      .then(async result => {
        // Perfil ou e-mail mudou: as sessões abertas valem para o perfil antigo, então caem.
        if (result.revoke) await revokeUserSessions(deps, id);
        return result.member;
      });
  } catch (error) {
    return conflict(error);
  }
}

// ---------- ativar e desativar (RF-08, CA-06) ----------

export async function setMemberActive(deps: AuthDeps, actor: Actor, id: string, active: boolean) {
  const result = await deps.db.transaction(async tx => {
    const adminIds = await lockActiveAdmins(tx, actor);
    const before = await loadTarget(tx, id, true);
    if (!active) {
      if (id === actor.id) {
        throw new AppError(409, 'autoalteracao', 'Você não pode desativar o seu próprio acesso.');
      }
      if (before.role === 'administrador' && before.isActive && adminIds.filter(a => a !== id).length === 0) {
        throw new AppError(409, 'ultimo_administrador', 'Não é possível desativar o único administrador ativo.');
      }
    }
    if (before.isActive === active) return { member: before, changed: false };
    const [after] = await tx
      .update(users)
      .set({ isActive: active, updatedAt: deps.clock.now() })
      .where(eq(users.id, id))
      .returning(memberColumns);
    await audit(tx, deps, actor, active ? 'equipe.ativar' : 'equipe.desativar', id, snapshot(before), snapshot(after!));
    return { member: after!, changed: true };
  });
  // Desativar derruba as sessões abertas na hora. (`loadSession` também recusa usuário inativo, como segunda barreira.)
  if (!active) await revokeUserSessions(deps, id);
  return asStaff(result.member as never);
}

// ---------- senha temporária nova ----------

export async function issueTemporaryPassword(deps: AuthDeps, actor: Actor, id: string) {
  const temporaryPassword = newTemporaryPassword();
  const passwordHash = await deps.hasher.hash(temporaryPassword);
  const member = await deps.db.transaction(async tx => {
    await lockActiveAdmins(tx, actor);
    const before = await loadTarget(tx, id, true);
    const [after] = await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: true, updatedAt: deps.clock.now() })
      .where(eq(users.id, id))
      .returning(memberColumns);
    // A trilha registra que houve redefinição, nunca a senha.
    await audit(tx, deps, actor, 'equipe.senha_temporaria', id, snapshot(before), snapshot(after!));
    return after!;
  });
  await revokeUserSessions(deps, id);
  return { member: asStaff(member), temporaryPassword };
}

// ---------- correção de e-mail e CPF por administrador (RF-06) ----------

export interface IdentityInput {
  email?: string;
  cpf?: string;
  reason: string;
}

/**
 * Correção de e-mail e CPF de qualquer usuário, inclusive cliente. É a única via: a conta do cliente
 * não altera esses dois campos (RF-06). Exige motivo, grava antes/depois e derruba as sessões do usuário.
 */
export async function correctIdentity(deps: AuthDeps, actor: Actor, id: string, input: IdentityInput) {
  const reason = input.reason.trim();
  if (reason.length < 5) throw invalid([{ campo: 'reason', mensagem: 'Informe o motivo da correção.' }]);
  if (input.email === undefined && input.cpf === undefined) {
    throw invalid([{ campo: 'email', mensagem: 'Informe o e-mail ou o CPF a corrigir.' }]);
  }
  const data = checkMember({ email: input.email, cpf: input.cpf }, false);
  try {
    await deps.db.transaction(async tx => {
      await lockActiveAdmins(tx, actor);
      const before = await loadTarget(tx, id, false);
      if (before.role === 'cliente' && data.cpf === null) {
        throw invalid([{ campo: 'cpf', mensagem: 'O CPF do cliente é obrigatório.' }]);
      }
      const [after] = await tx
        .update(users)
        .set({
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.cpf !== undefined ? { cpf: data.cpf } : {}),
          updatedAt: deps.clock.now(),
        })
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          role: users.role,
          name: users.name,
          email: users.email,
          cpf: users.cpf,
          phone: users.phone,
          isActive: users.isActive,
        });
      await audit(tx, deps, actor, 'usuario.identidade', id, snapshot(before), snapshot(after!), reason);
    });
  } catch (error) {
    return conflict(error);
  }
  await revokeUserSessions(deps, id);
}
