import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setCsrfToken, type SessionUser } from './api';

interface SessionState {
  /** `loading` até a primeira resposta de /auth/me. */
  status: 'loading' | 'anon' | 'user';
  user: SessionUser | null;
  login(email: string, password: string): Promise<SessionUser | null>;
  register(body: Record<string, unknown>): Promise<void>;
  logout(): Promise<void>;
  /** Relê /auth/me (depois de editar a conta). */
  reload(): Promise<void>;
}

const Ctx = createContext<SessionState>({
  status: 'loading',
  user: null,
  login: async () => null,
  register: async () => {},
  logout: async () => {},
  reload: async () => {},
});

export const useSession = () => useContext(Ctx);

/** Sessão do comprador. O cookie é HttpOnly (a página não o lê); o token CSRF fica só em memória. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  const refresh = useCallback(async (): Promise<SessionUser | null> => {
    try {
      const me = await api.me();
      setCsrfToken(me.csrfToken);
      setUser(me.user);
      setStatus('user');
      return me.user;
    } catch (e) {
      setCsrfToken('');
      setUser(null);
      // 401 é o caso normal de visitante. Falha de rede também cai aqui: a pessoa segue como visitante.
      setStatus('anon');
      if (!(e instanceof ApiError)) throw e;
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const value = useMemo<SessionState>(
    () => ({
      status,
      user,
      async login(email, password) {
        await api.login(email, password);
        return refresh();
      },
      async register(body) {
        await api.register(body);
        await refresh();
      },
      async reload() {
        await refresh();
      },
      async logout() {
        try {
          await api.logout();
        } finally {
          setCsrfToken('');
          setUser(null);
          setStatus('anon');
        }
      },
    }),
    [status, user, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Só caminhos internos: evita que `?voltar=` leve a outro site depois do login. */
export function safeReturnPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}
