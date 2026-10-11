import { createMiddleware } from 'hono/factory';
import { AppError } from '../domain/errors';
import type { AuthVariables, Role } from './types';

/**
 * Autorização no servidor (RF-09). Toda rota que não é pública passa por `requireRole`; a interface
 * esconde botões por conveniência, mas quem decide é este código.
 *
 * Ordem das verificações: sem sessão → 401; perfil errado → 403; senha temporária ainda não trocada → 403.
 */
export const requireRole = (...allowed: Role[]) =>
  createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const auth = c.get('auth');
    if (!auth) throw new AppError(401, 'nao_autenticado', 'Entre na sua conta para continuar.');
    if (!allowed.includes(auth.user.role)) {
      throw new AppError(403, 'sem_permissao', 'Você não tem permissão para acessar esta área.');
    }
    // Senha temporária (ADM22): até trocar, a equipe só consegue ver a própria conta, trocar a senha e sair.
    if (auth.user.mustChangePassword) {
      throw new AppError(403, 'troca_de_senha_obrigatoria', 'Troque a senha temporária para continuar.');
    }
    await next();
  });

export const requireAdmin = requireRole('administrador');
export const requireStaff = requireRole('validador', 'administrador');

/**
 * Prefixos reservados por perfil. Negar por padrão: qualquer rota nova sob `/admin` já nasce restrita
 * ao administrador, mesmo que quem a escreva esqueça o middleware. `/gate` (portaria) é do validador e do administrador.
 */
export const ROUTE_POLICY = [
  { prefix: '/admin', roles: ['administrador'] },
  { prefix: '/gate', roles: ['validador', 'administrador'] },
] as const satisfies readonly { prefix: string; roles: readonly Role[] }[];
