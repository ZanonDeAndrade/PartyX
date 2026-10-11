import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../auth/permissions';
import {
  correctIdentity,
  createMember,
  issueTemporaryPassword,
  listTeam,
  setMemberActive,
  updateMember,
  type TeamMember,
} from '../auth/team';
import type { AuthDeps, AuthVariables } from '../auth/types';
import { maskCpf } from '../domain/cpf';
import { AppError } from '../domain/errors';
import { parseJson } from './validate';

const text = z.string().max(500);
const role = z.enum(['validador', 'administrador']);
const idParam = z.uuid();

const createBody = z.object({
  name: text,
  email: text,
  phone: text.nullable().optional(),
  cpf: text.nullable().optional(),
  role,
});
const updateBody = z.object({
  name: text.optional(),
  email: text.optional(),
  phone: text.nullable().optional(),
  cpf: text.nullable().optional(),
  role: role.optional(),
});
const identityBody = z.object({ email: text.optional(), cpf: text.optional(), reason: text });

const view = (m: TeamMember) => ({
  id: m.id,
  name: m.name,
  email: m.email,
  cpf: m.cpf ? maskCpf(m.cpf) : null,
  phone: m.phone,
  role: m.role,
  isActive: m.isActive,
  mustChangePassword: m.mustChangePassword,
  lastLoginAt: m.lastLoginAt,
  createdAt: m.createdAt,
});

/** Rotas da equipe. Montadas dentro de `authRoutes`, depois do `authContext`, e restritas ao administrador. */
export function teamRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: AuthVariables }>();

  // Negar por padrão em todo o prefixo; cada rota abaixo só é alcançada depois disso.
  app.use('/admin/*', requireAdmin);

  const id = (value: string) => {
    const parsed = idParam.safeParse(value);
    if (!parsed.success) throw new AppError(404, 'nao_encontrado', 'Usuário não encontrado.');
    return parsed.data;
  };
  const actor = (c: { get: (k: 'auth') => AuthVariables['auth'] }) => ({ id: c.get('auth')!.user.id });

  app.get('/admin/team', async c => c.json({ team: (await listTeam(deps)).map(view) }));

  // Credencial temporária na resposta: nunca guardar em cache.
  app.post('/admin/team', async c => {
    const body = await parseJson(c, createBody);
    const { member, temporaryPassword } = await createMember(deps, actor(c), body);
    c.header('Cache-Control', 'no-store');
    return c.json({ member: view(member), temporaryPassword }, 201);
  });

  app.patch('/admin/team/:id', async c => {
    const body = await parseJson(c, updateBody);
    return c.json({ member: view(await updateMember(deps, actor(c), id(c.req.param('id')), body)) });
  });

  app.post('/admin/team/:id/deactivate', async c =>
    c.json({ member: view(await setMemberActive(deps, actor(c), id(c.req.param('id')), false)) }),
  );
  app.post('/admin/team/:id/activate', async c =>
    c.json({ member: view(await setMemberActive(deps, actor(c), id(c.req.param('id')), true)) }),
  );

  app.post('/admin/team/:id/temporary-password', async c => {
    const { member, temporaryPassword } = await issueTemporaryPassword(deps, actor(c), id(c.req.param('id')));
    c.header('Cache-Control', 'no-store');
    return c.json({ member: view(member), temporaryPassword });
  });

  // E-mail e CPF de qualquer usuário (inclusive cliente) só mudam por aqui (RF-06).
  app.patch('/admin/users/:id/identity', async c => {
    const body = await parseJson(c, identityBody);
    await correctIdentity(deps, actor(c), id(c.req.param('id')), body);
    return c.json({ mensagem: 'Dados corrigidos. O usuário precisa entrar novamente.' });
  });

  return app;
}
