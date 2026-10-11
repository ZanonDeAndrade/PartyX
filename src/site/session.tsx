import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, onSessionExpired, setCsrfToken, type SessionUser } from './api';

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

  // G05: a sessão acabou no servidor (prazo ou saída em outro aparelho). Encerra aqui também e deixa um aviso para a tela de
  // entrar. As páginas protegidas já levam ao login com `?voltar=` para o mesmo ponto; o carrinho fica no sessionStorage.
  const statusRef = useRef(status);
  statusRef.current = status;
  useEffect(
    () =>
      onSessionExpired(() => {
        if (statusRef.current !== 'user') return;
        markSessionExpired();
        // O token CSRF fica: com a sessão de fato encerrada no servidor ele não é exigido, e o login seguinte troca por um novo.
        setUser(null);
        setStatus('anon');
      }),
    [],
  );

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

const EXPIRED_KEY = 'px.sessao-expirada';
function markSessionExpired() {
  try {
    sessionStorage.setItem(EXPIRED_KEY, '1');
  } catch {
    // Sem armazenamento: o login aparece sem o aviso, com o retorno ao ponto mantido.
  }
}
/** Lê e apaga o aviso de sessão expirada (mostrado uma vez, na tela de entrar). */
export function takeSessionExpired(): boolean {
  try {
    const was = sessionStorage.getItem(EXPIRED_KEY) === '1';
    sessionStorage.removeItem(EXPIRED_KEY);
    return was;
  } catch {
    return false;
  }
}
