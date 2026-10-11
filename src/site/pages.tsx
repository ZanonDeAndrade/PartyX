import { useEffect, useRef, useState } from 'react';
import { api, type EventDetail, type SiteInfo } from './api';
import { loadCart, saveCart } from './cart';
import { Badge, Banner, CardSkeletons, ErrorBox, EventCardView, Layout, SearchForm, usePageTitle } from './components';
import { brl, dateLong, dateShort, searchPath, shareLinks, timeOf } from './format';
import { Link, useRouter } from './router';
import { useFetch } from './useFetch';

export function HomePage() {
  usePageTitle('PartyX · Ingressos');
  const { go } = useRouter();
  const [state, retry] = useFetch(s => api.home(s), 'home');
  const featured = state.status === 'ok' ? state.data.featured[0] : undefined;
  const list = state.status === 'ok' ? state.data.upcoming.filter(e => e.slug !== featured?.slug) : [];
  const fromCents = featured?.sale.kind === 'open' ? featured.sale.minPriceCents : null;

  return (
    <Layout dark>
      <h1 className="px-sr">Ingressos para os melhores eventos</h1>
      {featured ? (
        <section className="px-wrap px-hero-wrap" aria-label="Evento em destaque">
          <div className="px-hero">
            <Banner event={featured} className="px-hero-bg" step={14} />
            <div className="px-hero-in">
              <p className="px-eyebrow">Em destaque</p>
              <h2 className="px-hero-title">{featured.name}</h2>
              <p className="px-hero-date">
                {dateShort(featured.startsAt)} · {timeOf(featured.startsAt)}
              </p>
              <p className="px-hero-venue">{featured.venue}</p>
              <div className="px-hero-cta">
                <Link to={`/eventos/${featured.slug}`} className="px-btn px-btn-pri px-btn-lg">
                  {featured.sale.kind === 'open' ? 'Comprar ingressos' : 'Ver evento'}
                </Link>
                {fromCents !== null ? (
                  <span className="px-hero-price">
                    a partir de <b>{brl(fromCents)}</b>
                  </span>
                ) : null}
              </div>
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
          {state.status === 'loading' ? <CardSkeletons /> : null}
          {state.status === 'error' ? <ErrorBox onRetry={retry} /> : null}
          {state.status === 'ok' && !featured && list.length === 0 ? (
            <div className="px-box">
              <h3>Nenhum evento à venda no momento</h3>
              <p>Quando a PartyX abrir as vendas de um novo evento, ele aparece aqui.</p>
            </div>
          ) : null}
          {state.status === 'ok' && list.length > 0 ? (
            <ul className="px-grid">
              {list.map(e => (
                <EventCardView key={e.slug} event={e} />
              ))}
            </ul>
          ) : null}
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
      <div className="px-wrap">
        <h1 className="px-h1">Eventos</h1>
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
        {state.status === 'loading' ? <CardSkeletons /> : null}
        {state.status === 'error' ? <ErrorBox onRetry={retry} /> : null}
        {state.status === 'ok' && events.length === 0 ? (
          <div className="px-box">
            <h2>{filtering ? 'Nenhum evento encontrado' : 'Nenhuma venda disponível no momento'}</h2>
            <p>
              {filtering
                ? 'Não há eventos com esse nome ou nessa data. Tente outra palavra ou limpe os filtros.'
                : 'Quando a PartyX abrir as vendas de um novo evento, ele aparece aqui.'}
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
            {events.map(e => (
              <EventCardView key={e.slug} event={e} />
            ))}
          </ul>
        ) : null}
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
          <button ref={closeRef} type="button" className="px-icon-btn px-icon-btn-light" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="px-og">
          <Banner event={event} className="px-og-img" />
          <div className="px-og-text">
            <small>{window.location.host}</small>
            <b>
              {event.name} · {dateLong(event.startsAt)} · PartyX
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
            Copiar link
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
  const total = chosen.reduce((t, [id, n]) => t + n * buyable.get(id)!.priceCents, 0);
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
        {hasBuyable ? <span>Até {limit} por compra</span> : null}
      </div>
      {notices}
      {event.ticketTypes.length === 0 ? <p className="px-muted">Nenhum ingresso cadastrado.</p> : null}
      <ul className="px-types">
        {event.ticketTypes.map(t => {
          const n = qty[t.id] ?? 0;
          return (
            <li key={t.id} className={`px-type ${t.canBuy ? '' : 'px-type-off'}`}>
              <div className="px-type-info">
                <h3>{t.name}</h3>
                <p className="px-type-price">{brl(t.priceCents)}</p>
                {t.note ? <p className="px-type-note">{t.note}</p> : null}
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
                  <output aria-live="polite">{n}</output>
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
              {chosen.map(([id, n]) => (
                <li key={id}>
                  <span>
                    {n} × {buyable.get(id)!.name}
                  </span>
                  <span>{brl(n * buyable.get(id)!.priceCents)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="px-total px-total-row-side">
            <span>Total</span>
            <b>{brl(total)}</b>
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
            <p className="px-notice px-notice-neu">As vendas ainda não foram abertas neste ambiente.</p>
          ) : null}
          <p className="px-fine">
            Selecionar quantidades não reserva ingressos. A reserva começa quando você iniciar o pagamento.{' '}
            <Link to="/politica-de-cancelamento">Política de cancelamento</Link>
          </p>
          <div className="px-mobbar">
            <div>
              <small>{units === 0 ? 'Nenhum ingresso' : `${units} ${units === 1 ? 'ingresso' : 'ingressos'}`}</small>
              <b>{brl(total)}</b>
            </div>
            <button type="button" className="px-btn px-btn-pri px-btn-lg" disabled={blocked} onClick={goCheckout}>
              Continuar
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}

export function EventPage({ slug }: { slug: string }) {
  const [state, retry] = useFetch(s => api.event(slug, s), slug);
  usePageTitle(state.status === 'ok' ? `${state.data.name} · PartyX` : 'Evento · PartyX');
  const [share, setShare] = useState(false);
  const [copied, setCopied] = useState(false);

  if (state.status === 'error' && state.code === 404) return <NotFoundPage />;
  const event = state.status === 'ok' ? state.data : null;
  const sale = event?.sale;

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
  const shareNow = () => {
    if (!event) return;
    // No celular, a folha de compartilhamento do sistema; no computador, a pré-visualização com as opções.
    if (typeof navigator.share === 'function' && window.matchMedia('(max-width: 639px)').matches) {
      navigator.share({ title: event.name, url: `${window.location.origin}/eventos/${event.slug}` }).catch(() => {});
    } else setShare(true);
  };

  return (
    <Layout dark>
      {state.status === 'loading' ? (
        <div className="px-wrap" aria-busy="true" aria-label="Carregando evento">
          <div className="px-banner px-skel px-event-banner" />
          <span className="px-skel-line" style={{ width: '60%', height: 32, marginTop: 24 }} />
        </div>
      ) : null}
      {state.status === 'error' ? (
        <div className="px-wrap">
          <ErrorBox onRetry={retry} />
        </div>
      ) : null}
      {event && sale ? (
        <>
          <div className="px-wrap">
            <Banner event={event} className="px-event-banner" step={14}>
              {sale.kind === 'ended' ? <span className="px-ended-tag">Evento encerrado</span> : null}
            </Banner>
          </div>
          <div className="px-wrap px-event">
            <article className="px-event-main">
              <div className="px-event-title">
                <h1>{event.name}</h1>
                <dl className="px-facts">
                  <div>
                    <dt>Data e horário</dt>
                    <dd>{capital(dateLong(event.startsAt))}</dd>
                    <dd className="px-facts-sub">Início às {timeOf(event.startsAt)}</dd>
                  </div>
                  <div>
                    <dt>Local</dt>
                    <dd>{event.venue}</dd>
                    <dd className="px-facts-sub">{event.address}</dd>
                  </div>
                  <div>
                    <dt>Classificação</dt>
                    <dd>{event.ageRating}</dd>
                  </div>
                </dl>
                <div className="px-share-row">
                  <button type="button" className="px-btn px-btn-ghost" onClick={shareNow} aria-haspopup="dialog">
                    Compartilhar
                  </button>
                  <button type="button" className="px-btn px-btn-ghost" onClick={copyLink}>
                    Copiar link
                  </button>
                </div>
                <p role="status" aria-live="polite" className="px-copied">
                  {copied ? 'Link copiado.' : ''}
                </p>
              </div>
              {sale.kind === 'ended' ? (
                <div className="px-notice px-notice-dark" role="status">
                  <b>Este evento já aconteceu</b>
                  <span>
                    As vendas não estão mais disponíveis. Esta página continua acessível para consulta pelo link.
                  </span>
                  <Link to="/eventos" className="px-btn px-btn-dark">
                    Ver próximos eventos
                  </Link>
                </div>
              ) : null}
              <section aria-labelledby="sobre">
                <h2 id="sobre" className="px-h3">
                  Sobre o evento
                </h2>
                <p className="px-desc">{event.description}</p>
              </section>
              {event.attractions.length > 0 ? (
                <section aria-labelledby="atracoes">
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

            <aside className="px-event-side" aria-labelledby="ingressos">
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
                        <span>As vendas online deste evento foram encerradas. Em caso de dúvida, fale com a PartyX.</span>
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
        </>
      ) : null}
    </Layout>
  );
}

export function NotFoundPage() {
  usePageTitle('Página não encontrada · PartyX');
  return (
    <Layout dark>
      <div className="px-wrap">
        <div className="px-404">
          <p className="px-404-code">Erro 404</p>
          <h1>Não encontramos esta página</h1>
          <p>
            O endereço pode estar incorreto ou o evento não está disponível no site. Eventos que já aconteceram continuam
            acessíveis pelo link original, com o aviso de evento encerrado.
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
