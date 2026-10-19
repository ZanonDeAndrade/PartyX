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

/** Como foi a última troca de página: por View Transition, só esmaecendo (menos movimento, navegador sem suporte) ou nenhuma ainda. */
let lastSwap: 'vt' | 'plain' | null = null;

/**
 * Como a página do evento entra ao montar (pages.tsx):
 * - `first`: primeira página aberta no site (endereço digitado, recarregar): a cascata de sempre (.px-in);
 * - `vt`: desenhada dentro da View Transition: quem anima são os pseudo-elementos da troca (public.css), não a página;
 * - `late`: veio por View Transition, mas os dados chegaram depois (esqueleto): as peças entram como na troca, a partir de agora;
 * - `none`: a troca só esmaeceu a página inteira (menos movimento, sem suporte): nada mais anima.
 */
export function eventEntrance(): 'first' | 'vt' | 'late' | 'none' {
  if (insideViewTransition) return 'vt';
  return lastSwap === 'vt' ? 'late' : lastSwap === 'plain' ? 'none' : 'first';
}

/** Esmaece o conteúdo da página nova (Web Animations): troca sem View Transitions ou com menos movimento. */
function fadeIn(ms: number) {
  document.getElementById('conteudo')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
}

/** Valor em milissegundos de uma variável de tempo do CSS (tokens.css), com um padrão se faltar. */
function cssMs(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const v = parseFloat(raw);
  // O navegador pode devolver o tempo em segundos ("0.15s").
  return !Number.isFinite(v) ? fallback : raw.endsWith('ms') ? v : raw.endsWith('s') ? v * 1000 : v;
}

const vitrinePage = (path: string) => path === '/' || path === '/eventos';
const eventPage = (path: string) => /^\/eventos\/[^/]+$/.test(path);

/**
 * Troca da vitrine (início ou eventos) para a página do evento (`ida`) e de volta (`volta`), 19/10/2026: coreografia própria em
 * public.css, ligada por html[data-vt]. As outras trocas do site seguem a troca cruzada.
 */
function eventSwap(from: string, to: string): 'ida' | 'volta' | null {
  if (vitrinePage(from) && eventPage(to)) return 'ida';
  if (eventPage(from) && vitrinePage(to)) return 'volta';
  return null;
}
let swapToken = 0;

/**
 * Troca de página com a View Transitions API, quando existe: o navegador fotografa a página antiga, o React desenha a nova de forma
 * síncrona (`flushSync`) e as duas se cruzam em 450 ms. Cabeçalho parado. Durações em public.css; os cliques passam para a página
 * nova durante a troca.
 * Da vitrine para o evento e de volta, a coreografia própria de public.css (html[data-vt]): a capa do cartão vira a capa da página
 * (e encolhe de volta), a página que sai esmaece e a que entra chega em cascata; com menos movimento, só esmaece (--px-vt-reduced).
 * Sem suporte: a página nova esmaece em 350 ms (Web Animations). Com menos movimento: só esmaece, 250 ms, sem View Transition.
 * Ficam fora as páginas com QR Code de ingresso (o QR não pode aparecer com transparência nem em movimento) e a portaria; o painel
 * troca na hora e só esmaece 180 ms (CSS, html[data-area='admin']).
 * `after` roda logo depois de a página nova estar no DOM (rolagem da página nova), antes de o navegador fotografá-la.
 */
function withTransition(update: () => void, from: string, to: string, after?: () => void) {
  type Transition = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => Transition };
  const qrPage = (path: string) => path.startsWith('/ingressos/') || path.startsWith('/portaria');
  const adminPage = (path: string) => path === '/admin' || path.startsWith('/admin/');
  const apply = () => {
    flushSync(update);
    after?.();
  };
  if (qrPage(from) || qrPage(to) || adminPage(to)) {
    lastSwap = 'plain';
    update();
    after?.();
    return;
  }
  const swap = eventSwap(from, to);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    lastSwap = 'plain';
    apply();
    fadeIn(swap ? cssMs('--px-vt-reduced', 150) : 250);
    return;
  }
  if (!doc.startViewTransition) {
    lastSwap = 'plain';
    apply();
    fadeIn(350);
    return;
  }
  const root = document.documentElement;
  const token = ++swapToken;
  if (swap) root.dataset.vt = swap;
  else delete root.dataset.vt;
  const done = () => {
    if (token === swapToken) delete root.dataset.vt;
  };
  try {
    lastSwap = 'vt';
    const t = doc.startViewTransition!(() => {
      insideViewTransition = true;
      try {
        apply();
      } finally {
        insideViewTransition = false;
      }
    });
    // Duas navegações seguidas (entrar e ser redirecionado, por exemplo) fazem o navegador pular a primeira transição e
    // rejeitar as promessas dela. A página já foi atualizada; a rejeição não é erro.
    const ignore = () => {};
    t.ready.catch(ignore);
    t.finished.then(done, done);
    t.updateCallbackDone.catch(ignore);
  } catch {
    done();
    lastSwap = 'plain';
    apply();
  }
}

/**
 * Rolagem de cada entrada do histórico (19/10/2026): o site guarda e devolve a posição ele mesmo, dentro da troca de página, para a
 * vitrine voltar no mesmo lugar antes de o navegador fotografá-la (a capa encolhe até o cartão, sem salto). Cada entrada leva uma
 * chave em `history.state`; a posição fica na memória da aba. Ao sair da aba, a restauração volta ao navegador (recarregar).
 */
const scrollByEntry = new Map<string, number>();
const newEntryKey = () => Math.random().toString(36).slice(2, 10);
const entryKey = (state: unknown): string | null =>
  state && typeof state === 'object' && typeof (state as { pxKey?: unknown }).pxKey === 'string' ? (state as { pxKey: string }).pxKey : null;

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
  const key = useRef('');
  useEffect(() => {
    key.current = entryKey(window.history.state) ?? newEntryKey();
    window.history.replaceState({ ...(window.history.state ?? {}), pxKey: key.current }, '');
    window.history.scrollRestoration = 'manual';
    const onHide = () => {
      window.history.scrollRestoration = 'auto';
    };
    const onShow = () => {
      window.history.scrollRestoration = 'manual';
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    const onPop = (e: PopStateEvent) => {
      if (guard.current && !window.confirm(guard.current)) {
        // O navegador já voltou o endereço: devolve a página atual sem recarregar nada.
        window.history.pushState({ pxKey: key.current }, '', current.current.path + current.current.search);
        return;
      }
      guard.current = null;
      scrollByEntry.set(key.current, window.scrollY);
      const next = entryKey(e.state);
      key.current = next ?? newEntryKey();
      const y = next ? (scrollByEntry.get(next) ?? 0) : 0;
      const from = current.current.path;
      const loc = read();
      withTransition(
        () => setLoc(loc),
        from,
        loc.path,
        () => window.scrollTo({ top: y, left: 0, behavior: 'instant' }),
      );
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
    };
  }, []);
  const go = useCallback<Go>((to, options) => {
    if (!options?.force && guard.current && !window.confirm(guard.current)) return;
    guard.current = null;
    scrollByEntry.set(key.current, window.scrollY);
    const from = current.current.path;
    withTransition(
      () => {
        key.current = newEntryKey();
        window.history.pushState({ pxKey: key.current }, '', to);
        setLoc(read());
      },
      from,
      to.split('?')[0].replace(/\/+$/, '') || '/',
      () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }),
    );
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
