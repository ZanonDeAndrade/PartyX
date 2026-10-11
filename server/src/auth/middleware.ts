import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { AppError } from '../domain/errors';
import { csrfMatches, loadSession, SESSION_COOKIE } from './sessions';
import type { AuthDeps, AuthVariables } from './types';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** IP do cliente. Atrás do Cloud Run, o último item do X-Forwarded-For é o que o Google acrescentou; os anteriores o cliente pode forjar. */
export function clientIp(forwardedFor: string | undefined, trustedHops: number): string | null {
  if (!forwardedFor || trustedHops < 1) return null;
  const chain = forwardedFor
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return chain[chain.length - trustedHops] ?? chain[0] ?? null;
}

/** Origens aceitas em requisições que alteram dados: o próprio endereço da API, o público e as extras. */
function allowedOrigins(deps: AuthDeps, requestUrl: string): Set<string> {
  const set = new Set<string>([new URL(requestUrl).origin]);
  if (deps.config.PUBLIC_BASE_URL) set.add(new URL(deps.config.PUBLIC_BASE_URL).origin);
  for (const o of (deps.config.ALLOWED_ORIGINS ?? '').split(',')) if (o.trim()) set.add(o.trim());
  return set;
}

/**
 * 1. Guarda IP e navegador. 2. Em requisições que alteram dados, o `Origin` precisa ser aceito (CSRF).
 * 3. Carrega a sessão e, se houver, exige o token CSRF da sessão no cabeçalho `X-CSRF-Token`.
 */
export function authContext(deps: AuthDeps) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    c.set('meta', {
      ip: clientIp(c.req.header('x-forwarded-for'), deps.config.TRUSTED_PROXY_HOPS),
      userAgent: c.req.header('user-agent') ?? null,
    });

    const unsafe = UNSAFE.has(c.req.method);
    if (unsafe) {
      const origin = c.req.header('origin');
      if (origin && !allowedOrigins(deps, c.req.url).has(origin)) {
        throw new AppError(403, 'origem_invalida', 'Requisição recusada.');
      }
    }

    const token = getCookie(c, SESSION_COOKIE);
    const auth = token ? await loadSession(deps, token) : null;
    c.set('auth', auth);

    if (auth && unsafe && !csrfMatches(auth.csrfToken, c.req.header('x-csrf-token'))) {
      throw new AppError(403, 'csrf_invalido', 'Sessão inválida para esta ação. Recarregue a página e tente de novo.');
    }
    await next();
  });
}

export const requireUser = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  if (!c.get('auth')) throw new AppError(401, 'nao_autenticado', 'Entre na sua conta para continuar.');
  await next();
});
