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
import { flushSync } from 'react-dom';

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

/** Verdadeiro só enquanto o React desenha a página nova dentro de uma View Transition: a página então não repete a própria entrada. */
let insideViewTransition = false;
export const enteringByViewTransition = (): boolean => insideViewTransition;

/** Nome compartilhado do título do evento (cartão, destaque e página), para ele acompanhar a capa na troca de página. */
export const titleTransitionName = (slug: string) => `px-titulo-${slug}`;
/** Nome compartilhado do bloco da data do evento (cartão, destaque e página). */
export const dateTransitionName = (slug: string) => `px-data-${slug}`;

/** Esmaece o conteúdo da página nova (Web Animations): troca sem View Transitions ou com menos movimento. */
function fadeIn(ms: number) {
  document.getElementById('conteudo')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
}

/**
 * Troca de página com a View Transitions API, quando existe: o navegador fotografa a página antiga, o React desenha a nova de forma
 * síncrona (`flushSync`) e as duas se cruzam em 450 ms; os elementos com o mesmo `view-transition-name` (capa e título do cartão e
 * da página do evento) se transformam um no outro em 600 ms. Cabeçalho parado. Durações em public.css; os cliques passam para a
 * página nova durante a troca.
 * Sem suporte: a página nova esmaece em 350 ms (Web Animations). Com menos movimento: só esmaece, 250 ms, sem View Transition.
 * Ficam fora as páginas com QR Code de ingresso (o QR não pode aparecer com transparência nem em movimento) e a portaria; o painel
 * troca na hora e só esmaece 180 ms (CSS, html[data-area='admin']).
 */
function withTransition(update: () => void, to?: string) {
  type Transition = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => Transition };
  const qrPage = (path: string) => path.startsWith('/ingressos/') || path.startsWith('/portaria');
  const adminPage = (path: string) => path === '/admin' || path.startsWith('/admin/');
  const from = window.location.pathname;
  if (qrPage(from) || (to !== undefined && (qrPage(to) || adminPage(to)))) {
    update();
    return;
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    flushSync(update);
    fadeIn(250);
    return;
  }
  if (!doc.startViewTransition) {
    flushSync(update);
    fadeIn(350);
    return;
  }
  try {
    const t = doc.startViewTransition!(() => {
      insideViewTransition = true;
      try {
        flushSync(update);
      } finally {
        insideViewTransition = false;
      }
    });
    // Duas navegações seguidas (entrar e ser redirecionado, por exemplo) fazem o navegador pular a primeira transição e
    // rejeitar as promessas dela. A página já foi atualizada; a rejeição não é erro.
    const ignore = () => {};
    t.ready.catch(ignore);
    t.finished.catch(ignore);
    t.updateCallbackDone.catch(ignore);
  } catch {
    update();
  }
}

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
      withTransition(() => setLoc(read()));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback<Go>((to, options) => {
    if (!options?.force && guard.current && !window.confirm(guard.current)) return;
    guard.current = null;
    withTransition(() => {
      window.history.pushState(null, '', to);
      setLoc(read());
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, to.split('?')[0]);
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
