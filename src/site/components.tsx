import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { accentPalette, stubVars } from './accent';
import { api, type EventCard, type MaintenanceContact, type SaleKind, type SiteInfo, type TypeState } from './api';
import { brl, dateParts, eventPath, searchPath, timeOf } from './format';
import { IconClose, IconMenu, IconSearch } from './icons';
import { useReveal } from './motion';
import { Link, useRouter } from './router';
import { useSession } from './session';

/** Logo branca com fundo transparente (gerada por reference/tools/brand-assets.mjs). Cabeçalho e rodapé são escuros. */
const LOGO = '/brand/partyx-logo.png';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '?';
}

/** Menu lateral do celular (G07): navegação, conta e documentos. Fecha com Esc, com toque fora e devolve o foco ao botão. */
function MenuDrawer({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const { go, loc } = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const role = session.status === 'user' ? session.user?.role : null;
  const item = (to: string, label: string, sub = false) => (
    <Link
      key={to}
      to={to}
      onClick={onClose}
      className={`px-drawer-item${sub ? ' px-drawer-sub' : ''}`}
      aria-current={loc.path === to ? 'page' : undefined}
    >
      {label}
    </Link>
  );
  return (
    <div className="px-drawer-bg" onClick={onClose}>
      <aside className="px-drawer" role="dialog" aria-modal="true" aria-label="Menu" onClick={e => e.stopPropagation()}>
        <div className="px-drawer-head">
          <h2>Menu</h2>
          <button ref={closeRef} type="button" className="px-icon-btn" aria-label="Fechar menu" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <nav className="px-drawer-nav" aria-label="Menu">
          {item('/eventos', 'Eventos')}
          {role === 'cliente' ? (
            <>
              {item('/meus-ingressos', 'Meus ingressos')}
              {item('/minhas-compras', 'Minhas compras')}
              {item('/minha-conta', 'Minha conta')}
            </>
          ) : null}
          {role === 'administrador' ? item('/admin', 'Painel') : null}
          {role === 'administrador' || role === 'validador' ? item('/portaria', 'Portaria') : null}
          {session.status === 'anon' ? (
            <>
              {item('/entrar', 'Entrar')}
              {item('/criar-conta', 'Criar conta')}
            </>
          ) : null}
          {session.status === 'user' ? (
            <button
              type="button"
              className="px-drawer-item"
              onClick={() => {
                onClose();
                void session.logout().then(() => go('/'));
              }}
            >
              Sair
            </button>
          ) : null}
          {item('/termos-de-uso', 'Termos de Uso', true)}
          {item('/privacidade', 'Política de Privacidade', true)}
          {item('/politica-de-cancelamento', 'Cancelamento e reembolso', true)}
        </nav>
      </aside>
    </div>
  );
}

export function Header() {
  const session = useSession();
  const { go, loc } = useRouter();
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState('');
  const menuBtn = useRef<HTMLButtonElement>(null);
  const user = session.status === 'user' ? session.user : null;
  const staff = user && user.role !== 'cliente';
  const close = () => {
    setMenu(false);
    menuBtn.current?.focus();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(searchPath(q.trim(), ''));
  };
  // Na tela de compra o cabeçalho encolhe: nada compete com o pagamento.
  const checkout = loc.path.startsWith('/checkout/') || loc.path.startsWith('/pedido/');
  return (
    <>
      <a className="px-skip" href="#conteudo">
        Ir para o conteúdo
      </a>
      <header className="px-header">
        <div className="px-wrap px-header-in">
          <Link to="/" className="px-logo" aria-label="PartyX, página inicial">
            <img src={LOGO} width={65} height={36} alt="PartyX" />
          </Link>
          {checkout ? (
            <span className="px-secure">
              <i aria-hidden="true" />
              Compra segura
            </span>
          ) : (
            <>
              <nav aria-label="Principal" className="px-nav px-nav-desk">
                <Link to="/eventos" className="px-navlink">
                  Eventos
                </Link>
              </nav>
              <form className="px-hsearch" role="search" onSubmit={submit}>
                <IconSearch size={18} />
                <input
                  type="search"
                  aria-label="Buscar evento"
                  placeholder="Buscar evento por nome"
                  value={q}
                  maxLength={100}
                  onChange={e => setQ(e.target.value)}
                />
              </form>
              <div className="px-header-end">
                <Link to="/eventos" className="px-icon-btn px-only-mob" aria-label="Buscar eventos">
                  <IconSearch />
                </Link>
                {session.status === 'anon' ? (
                  <Link to="/entrar" className="px-enter">
                    Entrar
                  </Link>
                ) : null}
                {user?.role === 'cliente' ? (
                  <Link to="/meus-ingressos" className="px-navlink px-only-desk">
                    Meus ingressos
                  </Link>
                ) : null}
                {staff ? (
                  <Link to={user.role === 'administrador' ? '/admin' : '/portaria'} className="px-enter px-enter-pri">
                    {user.role === 'administrador' ? 'Painel' : 'Portaria'}
                  </Link>
                ) : null}
                {user?.role === 'cliente' ? (
                  <Link
                    to="/minha-conta"
                    className="px-avatar"
                    title="Minha conta"
                    aria-label={`Minha conta, ${user.name}`}
                  >
                    {initialsOf(user.name)}
                  </Link>
                ) : null}
                {staff ? (
                  <span className="px-avatar" title={user.email} aria-label={`Conectado como ${user.name}`}>
                    {initialsOf(user.name)}
                  </span>
                ) : null}
                <button
                  ref={menuBtn}
                  type="button"
                  className="px-icon-btn px-only-mob"
                  aria-label="Abrir menu"
                  aria-haspopup="dialog"
                  aria-expanded={menu}
                  onClick={() => setMenu(true)}
                >
                  <IconMenu />
                </button>
                {user ? (
                  <button
                    type="button"
                    className="px-navlink px-navbtn px-only-desk"
                    onClick={() => {
                      void session.logout().then(() => go('/'));
                    }}
                  >
                    Sair
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </header>
      {menu ? <MenuDrawer onClose={close} /> : null}
    </>
  );
}

/** Informações públicas do site (ambiente, dados da PartyX). Uma busca por carregamento da página, compartilhada entre as telas. */
export function useSiteInfo(): SiteInfo | null {
  const [site, setSite] = useState<SiteInfo | null>(null);
  useEffect(() => {
    let live = true;
    api
      .siteCached()
      .then(s => {
        if (live) setSite(s);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return site;
}

/** Link do WhatsApp a partir do número com DDI que a PartyX informou. */
export const whatsappHref = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;

/**
 * "Fale com a PartyX" com o canal que a PartyX informou na configuração (D-16): e-mail e WhatsApp, quando existirem. Sem nenhum canal,
 * só o texto. Nunca mostra contato da contratada: o dado vem só de `PARTYX_SUPPORT_*`.
 */
export function PartyxContact({ lead = 'fale com a PartyX' }: { lead?: string }) {
  const p = useSiteInfo()?.partyx;
  const email = p?.supportEmail ?? null;
  const whatsapp = p?.supportWhatsapp ?? null;
  if (!email && !whatsapp) return <>{lead}</>;
  return (
    <>
      {lead} pelo{' '}
      {email ? (
        <>
          e-mail <a href={`mailto:${email}`}>{email}</a>
        </>
      ) : null}
      {email && whatsapp ? ' ou pelo ' : null}
      {whatsapp ? (
        <>
          WhatsApp{' '}
          <a href={whatsappHref(whatsapp)} target="_blank" rel="noopener noreferrer" className="px-nowrap">
            {whatsapp}
          </a>
        </>
      ) : null}
    </>
  );
}

/**
 * Rodapé com os dados e contatos públicos da PartyX vindos da configuração (D-16). Desde 14/10/2026 (pedido do responsável) a
 * identificação é só o logo e o CNPJ: sem razão social e sem endereço (a razão social segue nos Termos, na Privacidade, nos e-mails e
 * na autorização de menor). Fora de produção, o que faltar aparece como "a fornecer pela PartyX"; em produção, é omitido.
 */
export function Footer() {
  const site = useSiteInfo();
  const p = site?.partyx;
  const testing = site ? site.environment !== 'producao' : false;
  const pending = (label: string) =>
    testing ? <span className="px-footer-dim">{label}: a fornecer pela PartyX</span> : null;
  const hasContact = Boolean(p?.supportEmail || p?.supportWhatsapp);
  return (
    <footer className="px-footer">
      <div className="px-wrap px-footer-in">
        <div className="px-footer-col">
          <span className="px-logo px-logo-sm">
            <img src={LOGO} width={58} height={32} alt="PartyX" loading="lazy" decoding="async" />
          </span>
          {p?.cnpj ? <span>CNPJ {p.cnpj}</span> : pending('CNPJ')}
        </div>
        {hasContact || testing ? (
          <div className="px-footer-col px-footer-contact">
            <b>Atendimento ao comprador</b>
            {p?.supportEmail ? <a href={`mailto:${p.supportEmail}`}>E-mail: {p.supportEmail}</a> : pending('E-mail')}
            {p?.supportWhatsapp ? (
              <a href={whatsappHref(p.supportWhatsapp)} target="_blank" rel="noopener noreferrer">
                {/* Um só item do link (que é flex): "WhatsApp:" quebra antes do número, e o número fica inteiro. */}
                <span>
                  WhatsApp: <span className="px-nowrap">{p.supportWhatsapp}</span>
                </span>
              </a>
            ) : (
              pending('WhatsApp')
            )}
            {p?.supportHours ? (
              <span className="px-footer-dim">Horário de atendimento: {p.supportHours}</span>
            ) : (
              pending('Horário de atendimento')
            )}
          </div>
        ) : null}
        <nav className="px-footer-col px-footer-links" aria-label="Documentos">
          <b>Documentos</b>
          <Link to="/termos-de-uso">Termos de Uso</Link>
          <Link to="/privacidade">Política de Privacidade</Link>
          <Link to="/politica-de-cancelamento">Cancelamento, troca e reembolso</Link>
        </nav>
        <p className="px-footer-credit">
          Desenvolvido por Zanon de Andrade Softwares - <span className="px-nowrap">CNPJ 57.971.378/0001-50</span>
        </p>
      </div>
    </footer>
  );
}

/** Páginas de vitrine (início, eventos, evento, 404) usam o tema escuro do protótipo; o resto fica no claro. */
export function Layout({
  children,
  dark = false,
  footer = true,
}: {
  children: ReactNode;
  dark?: boolean;
  /** Portaria: sem rodapé, para nada competir com a leitura. */
  footer?: boolean;
}) {
  useEffect(() => {
    document.body.classList.toggle('px-dark', dark);
    return () => document.body.classList.remove('px-dark');
  }, [dark]);
  return (
    <>
      <Header />
      <main id="conteudo" tabIndex={-1}>
        {children}
      </main>
      {footer ? <Footer /> : null}
    </>
  );
}

const BADGE: Record<SaleKind | TypeState, string> = {
  open: 'ok',
  a_venda: 'ok',
  soon: 'info',
  em_breve: 'info',
  out: 'err',
  esgotado: 'err',
  held: 'warn',
  reservado: 'warn',
  closed: 'neu',
  encerrada: 'neu',
  indisponivel: 'neu',
  ended: 'dark',
};

/** Estado em texto, nunca só por cor. */
export function Badge({ kind, children }: { kind: SaleKind | TypeState; children: ReactNode }) {
  return <span className={`px-badge px-badge-${BADGE[kind]}`}>{children}</span>;
}

/** Pares de cores do protótipo para o fundo listrado de quem ainda não tem imagem. A escolha é fixa por nome, então o evento mantém a cor. */
const STRIPES: ReadonlyArray<readonly [string, string]> = [
  ['#1F1838', '#2A2050'],
  ['#221A2A', '#2D2238'],
  ['#1A1A24', '#24242F'],
  ['#24242C', '#2E2E38'],
  ['#1C1830', '#262040'],
  ['#221C1C', '#2C2424'],
];
export function stripesFor(name: string, step = 10): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [c1, c2] = STRIPES[h % STRIPES.length]!;
  return `repeating-linear-gradient(135deg, ${c1} 0 ${step}px, ${c2} ${step}px ${step * 2}px)`;
}

/**
 * Nome da transição compartilhada do banner (View Transitions): o banner do cartão "vira" o banner da página do evento.
 * Precisa ser um identificador CSS válido e único na página.
 */
export const bannerTransitionName = (slug: string) => `px-banner-${slug}`;

/** Banner do evento. Sem imagem, listras discretas (como no protótipo), para o cartão não ficar vazio. */
/** Miniatura aceita na variável CSS: só o formato que o servidor grava (a regra do banco é a mesma). */
const PLACEHOLDER = /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/;

export function Banner({
  event,
  className = '',
  children,
  step = 10,
  transitionName,
  eager = false,
  sizes = '100vw',
}: {
  event: Pick<EventCard, 'name' | 'bannerUrl' | 'bannerSrcSet' | 'bannerPlaceholder'>;
  className?: string;
  children?: ReactNode;
  step?: number;
  transitionName?: string;
  eager?: boolean;
  /** Largura em que a imagem aparece, para o navegador escolher a versão (`srcset`). Padrão: a tela toda. */
  sizes?: string;
}) {
  // Capa desfocada que fica nítida (0015): a miniatura em data: fica por cima, desfocada, e esmaece quando a capa termina de carregar
  // (base.css). A capa em si pinta opaca assim que chega, então o LCP não espera o efeito. Capa já em cache: sem efeito.
  const [ready, setReady] = useState(false);
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setReady(true);
  }, []);
  const placeholder = event.bannerUrl && event.bannerPlaceholder && PLACEHOLDER.test(event.bannerPlaceholder) ? event.bannerPlaceholder : null;
  return (
    <div
      className={`px-banner ${placeholder ? 'px-banner-ph ' : ''}${className}`}
      data-cover={event.bannerUrl ? (ready ? 'ready' : 'loading') : undefined}
      style={{
        ...(event.bannerUrl ? null : { background: stripesFor(event.name, step) }),
        ...(transitionName ? { viewTransitionName: transitionName } : null),
        ...(placeholder ? ({ '--px-ph': `url("${placeholder}")` } as CSSProperties) : null),
      }}
    >
      {event.bannerUrl ? (
        <img
          ref={imgRef}
          onLoad={() => setReady(true)}
          onError={() => setReady(true)}
          src={event.bannerUrl}
          srcSet={event.bannerSrcSet ?? undefined}
          sizes={event.bannerSrcSet ? sizes : undefined}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
        />
      ) : null}
      {children}
    </div>
  );
}

/**
 * Bloco de data no formato de cartaz: dia grande, mês abaixo, com o canto cortado na diagonal do X do logotipo.
 * O texto completo fica para o leitor de tela (o visual abrevia).
 */
export function DateStub({ iso, size = 'md', accent }: { iso: string; size?: 'md' | 'lg'; accent?: string | null }) {
  const p = dateParts(iso);
  // Cor de destaque do evento (0014), só no card da vitrine: fundo e texto calculados, por variável CSS.
  const palette = accent ? accentPalette(accent) : null;
  return (
    <span className={`px-stub px-stub-${size}`} style={palette ? (stubVars(palette) as CSSProperties) : undefined}>
      <span className="px-stub-day" aria-hidden="true">
        {p.day}
      </span>
      <span className="px-stub-month" aria-hidden="true">
        {p.month}
      </span>
      <span className="px-sr">
        {p.day} de {p.month}
      </span>
    </span>
  );
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Cartão da vitrine. Entra quando aparece na tela, só na primeira vez nesta visita (useReveal), em cascata com os vizinhos. */
export function EventCardView({ event }: { event: EventCard }) {
  const open = event.sale.kind === 'open';
  const when = dateParts(event.startsAt);
  const reveal = useReveal(`card:${event.slug}`);
  return (
    <li className="px-card" ref={reveal.ref} {...reveal.props}>
      <Link to={eventPath(event.slug)} className="px-card-link" aria-label={`${event.name}, ${event.sale.label}`}>
        <div className="px-card-media">
          <Banner
            event={event}
            transitionName={bannerTransitionName(event.slug)}
            sizes="(min-width: 1024px) 66vw, (min-width: 640px) 50vw, 100vw"
          >
            {open ? null : (
              <span className="px-banner-state">
                <Badge kind={event.sale.kind}>{event.sale.label}</Badge>
              </span>
            )}
          </Banner>
          <DateStub iso={event.startsAt} accent={event.accentColor} />
        </div>
        <div className="px-card-body">
          <h3 className="px-card-title">{event.name}</h3>
          <p className="px-card-when">
            {capitalize(when.weekday)}, {timeOf(event.startsAt)}
          </p>
          <p className="px-card-venue">{event.venue}</p>
          <div className="px-card-foot">
            {open && event.sale.minPriceCents !== null ? (
              <p className="px-price">
                <span>a partir de</span> <b>{brl(event.sale.minPriceCents)}</b>
              </p>
            ) : (
              <p className="px-price px-price-off">{event.sale.label}</p>
            )}
            <span className={`px-cta ${open ? 'px-cta-pri' : ''}`} aria-hidden="true">
              {open ? 'Comprar' : 'Ver evento'}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

export function CardSkeletons({ n = 3 }: { n?: number }) {
  return (
    <ul className="px-grid px-grid-skel" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="px-card">
          <div className="px-card-media">
            <div className="px-banner px-skel" />
          </div>
          <div className="px-card-body">
            <span className="px-skel-line" style={{ width: '80%', height: 26 }} />
            <span className="px-skel-line" style={{ width: '45%' }} />
            <span className="px-skel-line" style={{ width: '60%' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-box" role="alert">
      <h2>Não foi possível carregar</h2>
      <p>A conexão falhou ou o servidor não respondeu. O que você estava fazendo continua aqui: tente de novo.</p>
      <button type="button" className="px-btn px-btn-pri" onClick={onRetry}>
        Tentar de novo
      </button>
    </div>
  );
}

/** Formulário de busca por nome ou data (RF-22). Vai para /eventos com a busca na URL. */
export function SearchForm({
  q,
  date,
  onSubmit,
  idPrefix,
}: {
  q: string;
  date: string;
  onSubmit: (q: string, date: string) => void;
  idPrefix: string;
}) {
  const [name, setName] = useState(q);
  const [day, setDay] = useState(date);
  useEffect(() => {
    setName(q);
    setDay(date);
  }, [q, date]);
  return (
    <form
      className="px-search"
      role="search"
      aria-label="Buscar eventos"
      onSubmit={e => {
        e.preventDefault();
        onSubmit(name, day);
      }}
    >
      <div className="px-field">
        <label htmlFor={`${idPrefix}-q`}>Nome do evento</label>
        <input
          id={`${idPrefix}-q`}
          type="search"
          value={name}
          maxLength={100}
          autoComplete="off"
          placeholder="Ex.: Neon"
          onChange={e => setName(e.target.value)}
        />
      </div>
      <div className="px-field">
        <label htmlFor={`${idPrefix}-d`}>Data</label>
        <input id={`${idPrefix}-d`} type="date" value={day} onChange={e => setDay(e.target.value)} />
      </div>
      <button type="submit" className="px-btn px-btn-light">
        Buscar
      </button>
    </form>
  );
}

// ---------- avisos rápidos (toast) ----------

interface ToastItem {
  id: number;
  text: string;
  tone: 'ok' | 'err';
}
let pushToast: ((t: Omit<ToastItem, 'id'>) => void) | null = null;

/** Aviso rápido de sucesso ou erro, lido pelo leitor de tela. Sem `ToastHost` montado, não faz nada. */
export function toast(text: string, tone: ToastItem['tone'] = 'ok') {
  pushToast?.({ text, tone });
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    let next = 1;
    pushToast = t => {
      const id = next++;
      setItems(list => [...list.slice(-2), { ...t, id }]);
      window.setTimeout(() => setItems(list => list.filter(x => x.id !== id)), 5000);
    };
    return () => {
      pushToast = null;
    };
  }, []);
  return (
    <div className="px-toasts" role="status" aria-live="polite">
      {items.map(t => (
        <p key={t.id} className={`px-toast px-toast-${t.tone}`}>
          {t.text}
          <button
            type="button"
            className="px-toast-close"
            aria-label="Fechar aviso"
            onClick={() => setItems(list => list.filter(x => x.id !== t.id))}
          >
            ×
          </button>
        </p>
      ))}
    </div>
  );
}

/**
 * Manutenção (G06), quando a API responde `manutencao` com o site já aberto. Sem cabeçalho nem rodapé, que chamariam a API de novo. O
 * contato é o da PartyX que veio na resposta. Sem prazo de retorno e sem prometer atendimento 24 horas.
 */
export function MaintenanceScreen({ message, contact }: { message: string; contact: MaintenanceContact | null }) {
  usePageTitle('Em manutenção · PartyX');
  return (
    <main id="conteudo" className="px-maint" data-screen="G06">
      <div className="px-wrap px-maint-in">
        <img src={LOGO} width={65} height={36} alt="PartyX" />
        <h1>Site em manutenção</h1>
        <p>{message || 'O site da PartyX está em manutenção. Tente novamente mais tarde.'}</p>
        {contact && (contact.email || contact.whatsapp) ? (
          <>
            <h2>Atendimento da PartyX</h2>
            <ul>
              {contact.email ? (
                <li>
                  E-mail: <a href={`mailto:${contact.email}`}>{contact.email}</a>
                </li>
              ) : null}
              {contact.whatsapp ? (
                <li>
                  WhatsApp:{' '}
                  <a href={whatsappHref(contact.whatsapp)} target="_blank" rel="noopener noreferrer">
                    {contact.whatsapp}
                  </a>
                </li>
              ) : null}
            </ul>
            {contact.hours ? <p className="px-maint-dim">Horário de atendimento: {contact.hours}.</p> : null}
          </>
        ) : null}
        <button type="button" className="px-btn px-btn-pri" onClick={() => window.location.reload()}>
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
