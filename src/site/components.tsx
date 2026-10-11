import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { type EventCard, type SaleKind, type TypeState } from './api';
import { brl, dateShort, eventPath, searchPath, timeOf } from './format';
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
            ×
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
                  ⌕
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
                  ≡
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

export function Footer() {
  return (
    <footer className="px-footer">
      <div className="px-wrap px-footer-in">
        <div className="px-footer-col">
          <span className="px-logo px-logo-sm">
            <img src={LOGO} width={58} height={32} alt="PartyX" loading="lazy" decoding="async" />
          </span>
          <span>Razão social e CNPJ: a fornecer pela PartyX</span>
        </div>
        <div className="px-footer-col">
          <b>Atendimento ao comprador</b>
          <span>E-mail: a fornecer pela PartyX</span>
          <span>WhatsApp: a fornecer pela PartyX</span>
          <span className="px-footer-dim">Horário de atendimento: a definir</span>
        </div>
        <nav className="px-footer-col px-footer-links" aria-label="Documentos">
          <b>Documentos</b>
          <Link to="/termos-de-uso">Termos de Uso</Link>
          <Link to="/privacidade">Política de Privacidade</Link>
          <Link to="/politica-de-cancelamento">Cancelamento, troca e reembolso</Link>
        </nav>
      </div>
    </footer>
  );
}

/** Páginas de vitrine (início, eventos, evento, 404) usam o tema escuro do protótipo; o resto fica no claro. */
export function Layout({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
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
      <Footer />
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

/** Banner do evento. Sem imagem, listras discretas (como no protótipo), para o cartão não ficar vazio. */
export function Banner({
  event,
  className = '',
  children,
  step = 10,
}: {
  event: Pick<EventCard, 'name' | 'bannerUrl'>;
  className?: string;
  children?: ReactNode;
  step?: number;
}) {
  return (
    <div
      className={`px-banner ${className}`}
      style={event.bannerUrl ? undefined : { background: stripesFor(event.name, step) }}
    >
      {event.bannerUrl ? <img src={event.bannerUrl} alt="" loading="lazy" decoding="async" /> : null}
      {children}
    </div>
  );
}

export function EventCardView({ event }: { event: EventCard }) {
  const open = event.sale.kind === 'open';
  return (
    <li className="px-card">
      <Link to={eventPath(event.slug)} className="px-card-link" aria-label={`${event.name}, ${event.sale.label}`}>
        <Banner event={event}>
          {open ? null : (
            <span className="px-banner-state">
              <Badge kind={event.sale.kind}>{event.sale.label}</Badge>
            </span>
          )}
        </Banner>
        <div className="px-card-body">
          <p className="px-card-date">
            {dateShort(event.startsAt)} · {timeOf(event.startsAt)}
          </p>
          <h3 className="px-card-title">{event.name}</h3>
          <p className="px-card-venue">{event.venue}</p>
          <div className="px-card-foot">
            {open && event.sale.minPriceCents !== null ? (
              <p className="px-price">
                a partir de <b>{brl(event.sale.minPriceCents)}</b>
              </p>
            ) : (
              <span />
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
    <ul className="px-grid" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="px-card px-skel">
          <div className="px-banner" />
          <div className="px-card-body">
            <span className="px-skel-line" style={{ width: '40%' }} />
            <span className="px-skel-line" style={{ width: '80%', height: 20 }} />
            <span className="px-skel-line" style={{ width: '55%' }} />
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
      <p>Verifique a conexão e tente de novo.</p>
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
