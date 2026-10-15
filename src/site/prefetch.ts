/**
 * Pré-carregamento da página do evento (15/10/2026): quando o dedo encosta no cartão, o mouse passa por cima ou o teclado chega
 * nele, o site já busca os dados do evento e a capa no tamanho da página. Ao abrir, a página nasce com o conteúdo, sem esqueleto.
 * Os dados valem 30 s (estado da venda e hora do servidor; a compra confere tudo de novo no servidor). Uma busca por evento por vez.
 */
import { api, type EventCard, type EventDetail } from './api';

const FRESH_MS = 30_000;

interface Entry {
  at: number;
  promise: Promise<EventDetail>;
  data?: EventDetail;
}
const cache = new Map<string, Entry>();

const fresh = (e: Entry | undefined): e is Entry => e !== undefined && Date.now() - e.at < FRESH_MS;

/** Começa a buscar o evento e a capa (sem repetir se já buscou há menos de 30 s). */
export function prefetchEvent(card: Pick<EventCard, 'slug' | 'bannerUrl' | 'bannerSrcSet'>): void {
  if (fresh(cache.get(card.slug))) return;
  const entry: Entry = {
    at: Date.now(),
    promise: api.event(card.slug).then(data => {
      entry.data = data;
      return data;
    }),
  };
  entry.promise.catch(() => cache.delete(card.slug));
  cache.set(card.slug, entry);
  // A capa na largura em que a página do evento a mostra (a tela toda): o navegador escolhe a mesma versão do srcset.
  if (card.bannerUrl) {
    const img = new Image();
    img.decoding = 'async';
    if (card.bannerSrcSet) {
      img.sizes = '100vw';
      img.srcset = card.bannerSrcSet;
    }
    img.src = card.bannerUrl;
    // Já decodificada: a troca de página não para para decodificar a capa ao fotografar a página nova.
    img.decode().catch(() => {});
  }
}

/** Dados já chegados e recentes (a página nasce com eles), ou nada. */
export const prefetchedEvent = (slug: string): EventDetail | undefined => {
  const e = cache.get(slug);
  return fresh(e) ? e.data : undefined;
};

/** Busca ainda em andamento (a página espera por ela em vez de buscar de novo), ou nada. */
export const pendingEvent = (slug: string): Promise<EventDetail> | undefined => {
  const e = cache.get(slug);
  return fresh(e) && !e.data ? e.promise : undefined;
};

/** Para a navegação: espera a busca em andamento por até `ms`, para a página abrir já com o conteúdo. Nunca falha. */
export function settlePrefetch(slug: string, ms = 500): Promise<void> {
  const p = pendingEvent(slug);
  if (!p) return Promise.resolve();
  return Promise.race([p.then(() => undefined), new Promise<void>(r => setTimeout(r, ms))]).catch(() => undefined);
}

/** Eventos do cartão (ou do destaque) que disparam o pré-carregamento. */
export const prefetchHandlers = (card: Pick<EventCard, 'slug' | 'bannerUrl' | 'bannerSrcSet'>) => {
  const go = () => prefetchEvent(card);
  return { onPointerEnter: go, onPointerDown: go, onTouchStart: go, onFocus: go };
};

/**
 * Props de um link para a página do evento (cartão, destaque): pré-carrega no toque, foco ou mouse por cima e, no clique simples,
 * espera até 500 ms a busca terminar antes de navegar (Ctrl, Shift, botão do meio e nova aba seguem o comportamento normal).
 */
export function eventLinkProps(card: Pick<EventCard, 'slug' | 'bannerUrl' | 'bannerSrcSet'>, open: () => void) {
  return {
    ...prefetchHandlers(card),
    onClick: (e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault(): void }) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      void settlePrefetch(card.slug).then(open);
    },
  };
}

