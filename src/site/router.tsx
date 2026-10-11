import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';

interface Location {
  path: string;
  search: string;
}
type Go = (to: string, options?: { force?: boolean }) => void;
const RouterContext = createContext<{ loc: Location; go: Go; setGuard: (message: string | null) => void }>({
  loc: { path: '/', search: '' },
  go: () => {},
  setGuard: () => {},
});

const read = (): Location => ({
  path: window.location.pathname.replace(/\/+$/, '') || '/',
  search: window.location.search,
});

/** Roteador mínimo por History API: a vitrine tem poucas rotas e não precisa de biblioteca. */
export function Router({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<Location>(read);
  // Aviso de alterações não salvas (ADM03): enquanto houver mensagem, sair pela navegação interna pede confirmação.
  const guard = useRef<string | null>(null);
  const current = useRef(loc);
  current.current = loc;
  useEffect(() => {
    const onPop = () => {
      if (guard.current && !window.confirm(guard.current)) {
        // O navegador já voltou o endereço: devolve a página atual sem recarregar nada.
        window.history.pushState(null, '', current.current.path + current.current.search);
        return;
      }
      guard.current = null;
      setLoc(read());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback<Go>((to, options) => {
    if (!options?.force && guard.current && !window.confirm(guard.current)) return;
    guard.current = null;
    window.history.pushState(null, '', to);
    setLoc(read());
    window.scrollTo(0, 0);
  }, []);
  const setGuard = useCallback((message: string | null) => {
    guard.current = message;
  }, []);
  const value = useMemo(() => ({ loc, go, setGuard }), [loc, go, setGuard]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export const useRouter = () => useContext(RouterContext);

export const LEAVE_MESSAGE = 'Há alterações não salvas. Sair desta página e perder as alterações?';

/**
 * Enquanto `when` for verdadeiro, avisa antes de sair: pela navegação interna (links, voltar do navegador) com uma confirmação, e ao
 * fechar ou recarregar a aba com o aviso padrão do navegador (`beforeunload`).
 */
export function useLeaveGuard(when: boolean, message = LEAVE_MESSAGE) {
  const { setGuard } = useRouter();
  useEffect(() => {
    if (!when) return;
    setGuard(message);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      setGuard(null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [when, message, setGuard]);
}

/** Link interno: navega sem recarregar, mas mantém o comportamento normal com Ctrl/Cmd, botão do meio e nova aba. */
export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { go } = useRouter();
  return (
    <a
      {...rest}
      href={to}
      onClick={e => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          rest.target === '_blank'
        )
          return;
        e.preventDefault();
        go(to);
      }}
    />
  );
}
