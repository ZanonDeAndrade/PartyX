import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { accentPalette, accentVars } from './accent';
import { api, minorAuthorizationUrl, type EventCard, type EventDetail, type SiteInfo } from './api';
import { takeEmbedded } from './embedded';
import { loadCart, saveCart } from './cart';
import {
  Badge,
  Banner,
  bannerTransitionName,
  CardSkeletons,
  DateStub,
  ErrorBox,
  EventCardView,
  Layout,
  PartyxContact,
  SearchForm,
  SkeletonSwap,
  usePageTitle,
} from './components';
import { stateAnnouncement, type CountdownView } from './eventCountdown';
import { EventCountdown, readCountdown } from './eventCountdownView';
import { brl, dateLong, dateParts, searchPath, shareLinks, timeOf } from './format';
import { IconCheck, IconClose, IconLink, IconShare } from './icons';
import { cascade, Roll } from './motion';
import { eventLinkProps, pendingEvent, prefetchedEvent } from './prefetch';
import { dateTransitionName, enteringByViewTransition, Link, titleTransitionName, useRouter } from './router';
import { useFetch } from './useFetch';

/**
 * Estilo de entrada do destaque na primeira renderização. Com o destaque do HTML do servidor ainda na tela (primeira carga), lê o
 * esmaecer dele (Web Animations) e continua do mesmo ponto; se ele já terminou, não anima. Vindo por View Transition, não anima.
 */
function heroEntrance(): CSSProperties | undefined {
  const shell = document.querySelector('#root .px-hero-in');
  if (shell) {
    const fade = shell.getAnimations()[0];
    return fade ? { animationDelay: `-${Math.round(Number(fade.currentTime ?? 0))}ms` } : { animation: 'none' };
  }
  return enteringByViewTransition() ? { animation: 'none' } : undefined;
}

export function HomePage() {
  usePageTitle('PartyX · Ingressos');
  const { go } = useRouter();
  // Na primeira visita, os dados vêm no HTML (o servidor embute a vitrine): o destaque aparece sem esperar a API.
  const [embedded] = useState(() => takeEmbedded<{ featured: EventCard[]; upcoming: EventCard[] }>('px-home-data'));
  const [state, retry] = useFetch(s => api.home(s), 'home', embedded);
  const featured = state.status === 'ok' ? state.data.featured[0] : undefined;
  const list = state.status === 'ok' ? state.data.upcoming.filter(e => e.slug !== featured?.slug) : [];
  const fromCents = featured?.sale.kind === 'open' ? featured.sale.minPriceCents : null;
  // Texto do destaque: esmaece em 600 ms ao abrir o site (CSS, .px-hero-in). Se o HTML do servidor já está na tela, a versão do React
  // continua o esmaecer de onde ele parou (atraso negativo), sem recomeçar; vindo de outra página por View Transition, não repete.
  const [heroStyle] = useState(heroEntrance);

  return (
    <Layout dark>
      <h1 className="px-sr">PartyX: ingressos para os próximos eventos</h1>
      {state.status === 'loading' ? (
        // Reserva a altura do destaque enquanto os eventos chegam: o resto da página não pula depois (CLS).
        <section className="px-hero px-hero-skel" aria-hidden="true">
          <div className="px-banner px-skel px-hero-media" />
        </section>
      ) : null}
      {featured ? (
        <section className="px-hero" aria-label="Evento em destaque">
          <Banner
            event={featured}
            className="px-hero-media"
            step={14}
            eager
            transitionName={bannerTransitionName(featured.slug)}
          />
          <div className="px-wrap px-hero-in" style={heroStyle}>
            <p className="px-hero-tag">Em destaque</p>
            <h2 className="px-hero-title" style={{ viewTransitionName: titleTransitionName(featured.slug) }}>
              <Link to={`/eventos/${featured.slug}`} {...eventLinkProps(featured, () => go(`/eventos/${featured.slug}`))}>
                {featured.name}
              </Link>
            </h2>
            <div className="px-hero-meta">
              <DateStub iso={featured.startsAt} size="lg" transitionName={dateTransitionName(featured.slug)} />
              <p>
                <b>
                  {capital(dateParts(featured.startsAt).weekday)}, às {timeOf(featured.startsAt)}
                </b>
                <span>{featured.venue}</span>
              </p>
            </div>
            <div className="px-hero-cta">
              <Link
                to={`/eventos/${featured.slug}`}
                className="px-btn px-btn-pri px-btn-lg"
                {...eventLinkProps(featured, () => go(`/eventos/${featured.slug}`))}
              >
                {featured.sale.kind === 'open' ? 'Comprar ingressos' : 'Ver evento'}
              </Link>
              {fromCents !== null ? (
                <span className="px-hero-price">
                  a partir de <b>{brl(fromCents)}</b>
                </span>
              ) : featured.sale.kind !== 'open' ? (
                <Badge kind={featured.sale.kind}>{featured.sale.label}</Badge>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <div className="px-wrap">
        <div className="px-searchbar">
          <SearchForm idPrefix="home" q="" date="" onSubmit={(q, d) => go(searchPath(q, d))} />
        </div>

        <section aria-labelledby="proximos" className="px-section">
          <div className="px-section-head">
            <h2 id="proximos" className="px-h2">
              Próximos eventos
            </h2>
            <Link to="/eventos" className="px-textlink">
              Ver todos os eventos
            </Link>
          </div>
          <SkeletonSwap loading={state.status === 'loading'} skeleton={<CardSkeletons className="px-grid px-grid-editorial" />}>
          {state.status === 'error' ? <ErrorBox onRetry={retry} /> : null}
          {state.status === 'ok' && !featured && list.length === 0 ? (
            <div className="px-box">
              <h3>Nenhum evento à venda agora</h3>
              <p>Quando a PartyX abrir as vendas de um novo evento, ele aparece aqui primeiro.</p>
            </div>
          ) : null}
          {state.status === 'ok' && featured && list.length === 0 ? (
            <p className="px-muted">Por enquanto, o evento em destaque é o único com venda aberta.</p>
          ) : null}
          {state.status === 'ok' && list.length > 0 ? (
            <ul className="px-grid px-grid-editorial">
              {list.map(e => (
                <EventCardView key={e.slug} event={e} />
              ))}
            </ul>
          ) : null}
          </SkeletonSwap>
        </section>
      </div>
    </Layout>
  );
}

/** Valida `AAAA-MM-DD` para não mandar lixo da URL à API. */
const validDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

export function EventsPage() {
  usePageTitle('Eventos · PartyX');
  const { loc, go } = useRouter();
  const params = new URLSearchParams(loc.search);
  const q = (params.get('q') ?? '').slice(0, 100);
  const date = validDate(params.get('date'));
  const [state, retry] = useFetch(s => api.events(q, date, s), `${q}|${date}`);
  const filtering = Boolean(q || date);
  const events = state.status === 'ok' ? state.data.events : [];

  const count =
    state.status === 'loading'
      ? 'Buscando eventos…'
      : state.status === 'ok'
        ? events.length === 0
          ? ''
          : `${events.length} ${events.length === 1 ? 'evento encontrado' : 'eventos encontrados'}`
        : '';

  return (
    <Layout dark>
      <div className="px-wrap px-events-page">
        <h1 className="px-h1 px-page-title">Eventos</h1>
        <SearchForm idPrefix="lista" q={q} date={date} onSubmit={(nq, nd) => go(searchPath(nq, nd))} />
        {filtering ? (
          <ul className="px-chips" aria-label="Filtros aplicados">
            <li className="px-chips-label" aria-hidden="true">
              Filtros:
            </li>
            {q ? (
              <li>
                <button
                  type="button"
                  onClick={() => go(searchPath('', date))}
                  aria-label={`Remover filtro de nome: ${q}`}
                >
                  Nome: {q} <span aria-hidden="true">×</span>
                </button>
              </li>
            ) : null}
            {date ? (
              <li>
                <button
                  type="button"
                  onClick={() => go(searchPath(q, ''))}
                  aria-label={`Remover filtro de data: ${date.split('-').reverse().join('/')}`}
                >
                  Data: {date.split('-').reverse().join('/')} <span aria-hidden="true">×</span>
                </button>
              </li>
            ) : null}
            <li>
              <Link to="/eventos" className="px-textlink px-textlink-sm">
                Limpar filtros
              </Link>
            </li>
          </ul>
        ) : null}

        <p className="px-count" role="status" aria-live="polite">
          {count}
        </p>
        <SkeletonSwap loading={state.status === 'loading'} skeleton={<CardSkeletons />}>
        {state.status === 'error' ? <ErrorBox onRetry={retry} /> : null}
        {state.status === 'ok' && events.length === 0 ? (
          <div className="px-box">
            <h2>{filtering ? 'Nenhum evento encontrado' : 'Nenhuma venda aberta agora'}</h2>
            <p>
              {filtering
                ? 'Nenhum evento à venda combina com essa busca. Tente parte do nome ou outra data.'
                : 'Quando a PartyX abrir as vendas de um novo evento, ele aparece aqui primeiro.'}
            </p>
            {filtering ? (
              <Link to="/eventos" className="px-btn">
                Limpar filtros
              </Link>
            ) : null}
          </div>
        ) : null}
        {state.status === 'ok' && events.length > 0 ? (
          <ul className="px-grid">
            {events.map((e, i) => (
              // O primeiro cartão costuma ser o maior conteúdo da tela (LCP): a imagem dele não espera o carregamento preguiçoso.
              <EventCardView key={e.slug} event={e} priority={i === 0} />
            ))}
          </ul>
        ) : null}
        </SkeletonSwap>
      </div>
    </Layout>
  );
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Compartilhar (E05): pré-visualização do que aparece em redes e mensageiros, com os quatro caminhos. */
function ShareDialog({ event, onClose }: { event: EventDetail; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const url = `${window.location.origin}/eventos/${event.slug}`;
  const links = shareLinks(url, event.name);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt('Copie o link do evento:', url);
    }
  };
  return (
    <div className="px-modal-bg" onClick={onClose}>
      <div
        className="px-modal px-share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-modal-head">
          <h2 id="share-title">{event.name}</h2>
          <button
            ref={closeRef}
            type="button"
            className="px-icon-btn px-icon-btn-light"
            aria-label="Fechar"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
        <div className="px-og">
          <Banner event={event} className="px-og-img" />
          <div className="px-og-text">
            <small>{window.location.host}</small>
            <b>
              {event.name}, {dateLong(event.startsAt)} | PartyX
            </b>
            <span>{event.venue}. Ingressos online na PartyX.</span>
          </div>
        </div>
        <div className="px-share-grid">
          <a className="px-btn" href={links.whatsapp} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <a className="px-btn" href={links.facebook} target="_blank" rel="noopener noreferrer">
            Facebook
          </a>
          <a className="px-btn" href={links.x} target="_blank" rel="noopener noreferrer">
            X
          </a>
          <button type="button" className="px-btn" onClick={copy}>
            {copied ? <IconCheck size={18} /> : <IconLink size={18} />}
            {copied ? 'Link copiado' : 'Copiar link'}
          </button>
        </div>
        <p role="status" aria-live="polite" className="px-copied">
          {copied ? 'Link copiado.' : ''}
        </p>
        <div className="px-modal-actions">
          <button type="button" className="px-btn" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Seleção de tipo e quantidade (RF-28). O limite mostrado vem do servidor, que também o impõe (CA-15). */
function TicketPicker({ event, notices }: { event: EventDetail; notices: React.ReactNode }) {
  const { go } = useRouter();
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [qty, setQty] = useState<Record<string, number>>(() => {
    const cart = loadCart();
    return cart && cart.slug === event.slug
      ? Object.fromEntries(cart.items.map(i => [i.ticketTypeId, i.quantity]))
      : {};
  });
  useEffect(() => {
    api
      .site()
      .then(setSite)
      .catch(() => {});
  }, []);
  const limit = site?.maxTicketsPerOrder ?? 6;
  const buyable = new Map(event.ticketTypes.filter(t => t.canBuy).map(t => [t.id, t]));
  // Remove do carrinho o que deixou de estar à venda.
  const chosen = Object.entries(qty).filter(([id, n]) => n > 0 && buyable.has(id));
  const units = chosen.reduce((t, [, n]) => t + n, 0);
  // Lotes: o que passar do que resta no lote à venda sai do próximo, com o preço dele, que só aparece no resumo (antes de pagar).
  const inLot = (id: string, n: number) => Math.min(n, buyable.get(id)!.lotRemaining ?? n);
  const total = chosen.reduce((t, [id, n]) => t + inLot(id, n) * (buyable.get(id)!.priceCents ?? 0), 0);
  const fromNextLot = chosen.reduce((t, [id, n]) => t + n - inLot(id, n), 0);
  // O total mostra só o que já tem preço; o que sai do próximo lote aparece na linha pequena e no resumo, com o valor.
  const unitsText = `${units} ${units === 1 ? 'ingresso' : 'ingressos'}${fromNextLot > 0 ? `, ${fromNextLot} do próximo lote` : ''}`;
  const change = (id: string, delta: number) =>
    setQty(q => {
      const next = Math.max(0, (q[id] ?? 0) + delta);
      const others = Object.entries(q).reduce((t, [k, n]) => (k === id ? t : t + n), 0);
      return { ...q, [id]: Math.min(next, Math.max(0, limit - others)) };
    });
  const goCheckout = () => {
    saveCart({ slug: event.slug, items: chosen.map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })) });
    go(`/checkout/${event.slug}`);
  };
  const salesClosed = site !== null && !site.salesOpen;
  const hasBuyable = buyable.size > 0;
  const blocked = units === 0 || salesClosed;

  return (
    <>
      <div className="px-side-head">
        <h2 id="ingressos">Ingressos</h2>
        {hasBuyable ? <span>Até {limit} por pedido</span> : null}
      </div>
      {notices}
      {event.ticketTypes.length === 0 ? <p className="px-muted">Nenhum ingresso cadastrado.</p> : null}
      <ul className="px-types">
        {event.ticketTypes.map(t => {
          const n = qty[t.id] ?? 0;
          return (
            <li key={t.id} className={`px-type ${t.canBuy ? '' : 'px-type-off'}`}>
              <div className="px-type-info">
                <h3>
                  {t.name}
                  {t.lot ? <span className="px-type-lot"> · {t.lot.name}</span> : null}
                </h3>
                {t.priceCents !== null ? <p className="px-type-price">{brl(t.priceCents)}</p> : null}
                {t.lastUnits ? <p className="px-type-flag">Últimas unidades deste lote</p> : null}
                {t.note ? <p className="px-type-note">{t.note}</p> : null}
                {t.nextLot ? <p className="px-type-note">Próximo lote: em breve.</p> : null}
              </div>
              {t.canBuy ? (
                <div className="px-stepper" role="group" aria-label={`Quantidade de ${t.name}`}>
                  <button
                    type="button"
                    aria-label={`Menos um ${t.name}`}
                    disabled={n === 0}
                    onClick={() => change(t.id, -1)}
                  >
                    −
                  </button>
                  <output aria-live="polite">
                    <Roll value={String(n)} />
                  </output>
                  <button
                    type="button"
                    aria-label={`Mais um ${t.name}`}
                    disabled={units >= limit}
                    onClick={() => change(t.id, 1)}
                  >
                    +
                  </button>
                </div>
              ) : (
                <Badge kind={t.state}>{t.label}</Badge>
              )}
            </li>
          );
        })}
      </ul>
      {hasBuyable ? (
        <>
          {units > 0 ? (
            <ul className="px-lines px-sel-lines">
              {chosen.map(([id, n]) => {
                const extra = n - inLot(id, n);
                return (
                  <li key={id}>
                    <span>
                      {n} × {buyable.get(id)!.name}
                      {extra > 0 ? (
                        <small className="px-sel-note">
                          {inLot(id, n)} {inLot(id, n) === 1 ? 'sai' : 'saem'} deste lote e {extra} do próximo, com o preço
                          dele. Você vê o valor no resumo, antes de pagar.
                        </small>
                      ) : null}
                    </span>
                    <span className="px-nowrap">{brl(inLot(id, n) * (buyable.get(id)!.priceCents ?? 0))}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p className="px-total px-total-row-side">
            <span>
              Total
              {units > 0 ? <small>{unitsText}</small> : null}
            </span>
            <b className="px-nowrap">
              <Roll value={brl(total)} />
            </b>
          </p>
          <button
            type="button"
            className="px-btn px-btn-pri px-btn-lg px-continue"
            disabled={blocked}
            aria-disabled={blocked}
            onClick={goCheckout}
          >
            Continuar
          </button>
          {salesClosed ? (
            <p className="px-notice px-notice-neu">As vendas deste evento ainda não estão abertas.</p>
          ) : null}
          <p className="px-fine">
            Escolher a quantidade ainda não reserva nada. A reserva começa quando você for para o pagamento.{' '}
            <Link to="/politica-de-cancelamento">Política de cancelamento, troca e reembolso</Link>
          </p>
          <div className="px-mobbar">
            <div>
              <small>{units === 0 ? 'Escolha a quantidade' : unitsText}</small>
              <b className="px-nowrap">
                <Roll value={brl(total)} />
              </b>
            </div>
            {units === 0 && !salesClosed ? (
              // Sem ingresso escolhido, a barra leva até a lista (no celular ela fica abaixo da descrição).
              <a href="#ingressos" className="px-btn px-btn-light px-btn-lg">
                Escolher ingressos
              </a>
            ) : (
              <button type="button" className="px-btn px-btn-pri px-btn-lg" disabled={blocked} onClick={goCheckout}>
                Continuar
              </button>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}

/** Esqueleto da página do evento com as mesmas peças e classes da página (capa, data, título, cronômetro, Quando, Onde e Classificação). */
function EventSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando evento">
      <div className="px-event-hero">
        <div className="px-banner px-skel px-event-banner" />
        <div className="px-wrap px-event-head">
          <span className="px-stub px-stub-lg px-stub-skel" aria-hidden="true">
            <span className="px-stub-day">00</span>
            <span className="px-stub-month">out</span>
          </span>
          <p className="px-event-name">
            <span className="px-skel-text" style={{ width: '72%' }} />
          </p>
        </div>
        <div className="px-wrap px-countdown-row">
          <div className="px-countdown" aria-hidden="true">
            {['Dias', 'Horas', 'Min', 'Seg'].map(l => (
              <span key={l} className="px-cd-block px-stub-skel">
                <span className="px-cd-num">00</span>
                <span className="px-cd-label">{l}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="px-wrap px-event">
        <div className="px-event-main">
          <dl className="px-facts">
            {[60, 70, 40].map(w => (
              <div key={w}>
                <dt>
                  <span className="px-skel-text" style={{ width: 64 }} />
                </dt>
                <dd>
                  <span className="px-skel-text" style={{ width: `${w}%` }} />
                </dd>
                <dd className="px-facts-sub">
                  <span className="px-skel-text" style={{ width: '50%' }} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

export function EventPage({ slug }: { slug: string }) {
  // Pré-carregado no toque ou mouse sobre o cartão (prefetch.ts): a página nasce com o conteúdo; se a busca ainda está andando,
  // espera por ela em vez de buscar de novo.
  const [state, retry] = useFetch(s => pendingEvent(slug) ?? api.event(slug, s), slug, prefetchedEvent(slug));
  usePageTitle(state.status === 'ok' ? `${state.data.name} · PartyX` : 'Evento · PartyX');

  if (state.status === 'error' && state.code === 404) return <NotFoundPage />;
  const event = state.status === 'ok' ? state.data : null;

  return (
    <Layout dark>
      {state.status === 'error' ? (
        <div className="px-wrap">
          <ErrorBox onRetry={retry} />
        </div>
      ) : null}
      <SkeletonSwap loading={state.status === 'loading'} skeleton={<EventSkeleton />}>
        {event ? <EventView event={event} /> : null}
      </SkeletonSwap>
    </Layout>
  );
}

/**
 * Conteúdo da página do evento. Usado pela vitrine e pela pré-visualização do painel (ADM03): em `preview`, sem compartilhar e com
 * os tipos só para conferência (o servidor já manda nada à venda).
 */
export function EventView({ event, preview = false }: { event: EventDetail; preview?: boolean }) {
  const [share, setShare] = useState(false);
  // Entrada em cascata só quando a página não vem de uma View Transition (do cartão, a capa e o título já chegam transformados e o
  // resto da página esmaece junto com a troca).
  const [entrance] = useState(() => !enteringByViewTransition());
  const IN = entrance ? ' px-in' : '';
  const [copied, setCopied] = useState(false);
  const sale = event.sale;
  const slug = event.slug;
  // Cronômetro: a página guarda só o último estado (antes, agora, oculto), para anunciar a troca; os segundos andam dentro do
  // cronômetro e a página não redesenha.
  const [countdownSaid, setCountdownSaid] = useState('');
  const lastKind = useRef<CountdownView['kind'] | null>(null);
  lastKind.current ??= readCountdown(event).kind;
  const onCountdownKind = useCallback((next: CountdownView['kind']) => {
    const said = stateAnnouncement(lastKind.current!, next);
    lastKind.current = next;
    if (said) setCountdownSaid(said);
  }, []);

  const copyLink = async () => {
    const url = `${window.location.origin}/eventos/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copie o link do evento:', url);
    }
  };
  // Cor de destaque (0014): as variáveis valem só dentro da página do evento; cabeçalho, menu e rodapé ficam com o roxo da PartyX.
  const accent = useMemo(() => (event.accentColor ? accentPalette(event.accentColor) : null), [event.accentColor]);
  const shareNow = () => {
    // No celular, a folha de compartilhamento do sistema; no computador, a pré-visualização com as opções.
    if (typeof navigator.share === 'function' && window.matchMedia('(max-width: 639px)').matches) {
      navigator.share({ title: event.name, url: `${window.location.origin}/eventos/${event.slug}` }).catch(() => {});
    } else setShare(true);
  };

  return (
    <div
      className="px-event-scope"
      data-accent={accent ? accent.base : undefined}
      style={accent ? (accentVars(accent) as CSSProperties) : undefined}
    >
      <div className="px-event-hero">
        <Banner
          event={event}
          className="px-event-banner"
          step={14}
          eager
          transitionName={preview ? undefined : bannerTransitionName(event.slug)}
        >
          {sale.kind === 'ended' ? <span className="px-ended-tag">Evento encerrado</span> : null}
        </Banner>
        {/* Entrada da página (15/10/2026): data e título primeiro, depois o cronômetro, depois Quando, Onde e Classificação, em
            cascata (--i de 0 a 4); a primeira tela fica completa em 640 ms. A capa fica nítida por conta própria (Banner). */}
        {/* Cabeçalho com nome próprio na troca de página: fica por cima da capa que cresce (senão a base escura da capa o cobriria
            até o fim da troca). Data e título têm nomes compartilhados com o cartão. */}
        <div
          className={`px-wrap px-event-head${IN}`}
          style={{ ...cascade(0), ...(preview ? null : { viewTransitionName: 'px-event-head' }) }}
        >
          <DateStub iso={event.startsAt} size="lg" transitionName={preview ? undefined : dateTransitionName(event.slug)} />
          {/* Só o bloco da data e o título, centrados um no outro (sem a frase acima do título desde 15/10/2026). */}
          <h1 className="px-event-name" style={preview ? undefined : { viewTransitionName: titleTransitionName(event.slug) }}>
            {event.name}
          </h1>
        </div>
        {event.countdown ? (
          <>
            <EventCountdown event={event} onKind={onCountdownKind} entrance={entrance} />
            {/* Só a troca de estado é anunciada (começou, terminou); os segundos nunca. */}
            <p className="px-sr" aria-live="polite" data-countdown-aviso="">
              {countdownSaid}
            </p>
          </>
        ) : null}
      </div>
      <div className="px-wrap px-event">
        <article className="px-event-main">
          <div className="px-event-title">
            <dl className="px-facts">
              <div className={IN.trim() || undefined} style={cascade(2)}>
                <dt>Quando</dt>
                <dd>{capital(dateLong(event.startsAt))}</dd>
                <dd className="px-facts-sub">
                  Início às {timeOf(event.startsAt)}
                  {event.endsAt ? `, fim às ${timeOf(event.endsAt)}` : ''}
                </dd>
              </div>
              <div className={IN.trim() || undefined} style={cascade(3)}>
                <dt>Onde</dt>
                <dd>{event.venue}</dd>
                <dd className="px-facts-sub">{event.address}</dd>
              </div>
              <div className={IN.trim() || undefined} style={cascade(4)}>
                <dt>Classificação</dt>
                <dd>{event.ageRating}</dd>
                <dd className="px-facts-sub">
                  {event.allowsMinors
                    ? 'A partir de 16 anos na data do evento. Com 16 ou 17, entrada com autorização do responsável.'
                    : 'Só para quem tiver 18 anos ou mais na data do evento.'}
                </dd>
              </div>
            </dl>
            {event.allowsMinors && !preview ? (
              <p className={`px-event-minor${IN}`} style={cascade(4)}>
                Quem tiver 16 ou 17 anos entrega na portaria o Termo de Autorização e Responsabilidade preenchido e
                assinado pelo responsável, com a cópia do documento dele, e apresenta o próprio documento com foto. Vale
                também para acompanhantes.{' '}
                <a href={minorAuthorizationUrl.blank(event.slug)} download className="px-textlink">
                  Baixar o termo em branco (PDF)
                </a>
                {' · '}
                <Link to="/termo-menor" className="px-textlink">
                  Termo de ciência para menores
                </Link>
              </p>
            ) : null}
            {preview ? null : (
              <div className={`px-share-row${IN}`} style={cascade(4)}>
                <button type="button" className="px-btn px-btn-ghost" onClick={shareNow} aria-haspopup="dialog">
                  <IconShare size={18} />
                  Compartilhar
                </button>
                <button type="button" className="px-btn px-btn-ghost" onClick={copyLink}>
                  {copied ? <IconCheck size={18} /> : <IconLink size={18} />}
                  {copied ? 'Link copiado' : 'Copiar link'}
                </button>
              </div>
            )}
            <p role="status" aria-live="polite" className="px-sr">
              {copied ? 'Link copiado.' : ''}
            </p>
          </div>
          {sale.kind === 'ended' ? (
            <div className={`px-notice px-notice-dark${IN}`} role="status" style={cascade(4)}>
              <b>Este evento já aconteceu</b>
              <span>As vendas não estão mais disponíveis. Esta página continua acessível para consulta pelo link.</span>
              <Link to="/eventos" className="px-btn px-btn-dark">
                Ver próximos eventos
              </Link>
            </div>
          ) : null}
          <section aria-labelledby="sobre" className={IN.trim() || undefined} style={cascade(4)}>
            <h2 id="sobre" className="px-h3">
              Sobre o evento
            </h2>
            <p className="px-desc">{event.description}</p>
          </section>
          {event.attractions.length > 0 ? (
            <section aria-labelledby="atracoes" className={IN.trim() || undefined} style={cascade(4)}>
              <h2 id="atracoes" className="px-h3">
                Atrações
              </h2>
              <ul className="px-attractions">
                {event.attractions.map(a => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>

        <aside className={`px-event-side${entrance ? ' px-in-block' : ''}`} aria-labelledby="ingressos" style={cascade(2)}>
          <TicketPicker
            event={event}
            notices={
              <>
                {sale.kind === 'soon' ? (
                  <div className="px-notice px-notice-info" role="status">
                    <b>Vendas ainda não iniciadas</b>
                    <span>{sale.label}.</span>
                  </div>
                ) : null}
                {sale.kind === 'out' ? (
                  <div className="px-notice px-notice-err" role="status">
                    <b>Ingressos esgotados</b>
                    <span>Todos os ingressos disponíveis foram vendidos.</span>
                  </div>
                ) : null}
                {sale.kind === 'closed' ? (
                  <div className="px-notice px-notice-neu" role="status">
                    <b>Vendas encerradas</b>
                    <span>
                      As vendas online deste evento foram encerradas. Em caso de dúvida, <PartyxContact />.
                    </span>
                  </div>
                ) : null}
                {event.ticketTypes.some(t => /meia/i.test(t.name)) ? (
                  <p className="px-fine">
                    Ingresso de meia-entrada: <Link to="/meia-entrada">veja as regras e os documentos exigidos</Link>.
                  </p>
                ) : null}
              </>
            }
          />
        </aside>
      </div>
      {share ? <ShareDialog event={event} onClose={() => setShare(false)} /> : null}
    </div>
  );
}

export function NotFoundPage() {
  usePageTitle('Página não encontrada · PartyX');
  return (
    <Layout dark>
      <div className="px-wrap">
        <div className="px-404">
          <p className="px-404-code" aria-hidden="true">
            404
          </p>
          <h1>Esta página não existe</h1>
          <p>
            Confira o endereço ou procure o evento na lista. Um evento que já aconteceu continua abrindo pelo link
            original, com o aviso de evento encerrado.
          </p>
          <div className="px-404-actions">
            <Link to="/eventos" className="px-btn px-btn-pri px-btn-lg">
              Ver eventos
            </Link>
            <Link to="/" className="px-btn px-btn-ghost px-btn-lg">
              Página inicial
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
