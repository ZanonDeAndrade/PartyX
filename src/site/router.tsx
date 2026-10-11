import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';

interface Location {
  path: string;
  search: string;
}
const RouterContext = createContext<{ loc: Location; go: (to: string) => void }>({
  loc: { path: '/', search: '' },
  go: () => {},
});

const read = (): Location => ({
  path: window.location.pathname.replace(/\/+$/, '') || '/',
  search: window.location.search,
});

/** Roteador mínimo por History API: a vitrine tem poucas rotas e não precisa de biblioteca. */
export function Router({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<Location>(read);
  useEffect(() => {
    const onPop = () => setLoc(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((to: string) => {
    window.history.pushState(null, '', to);
    setLoc(read());
    window.scrollTo(0, 0);
  }, []);
  const value = useMemo(() => ({ loc, go }), [loc, go]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export const useRouter = () => useContext(RouterContext);

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
