import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api, type OrderRow, type TicketDetail, type TicketSummary } from './api';
import { ErrorBox, Layout, stripesFor, usePageTitle } from './components';
import { brl, dateLong, timeOf } from './format';
import { Link, useRouter } from './router';
import { useSession } from './session';
import { useFetch } from './useFetch';

/** Leva o visitante ao login e de volta (como no checkout). */
function useLoggedIn(returnTo: string): boolean {
  const { go } = useRouter();
  const session = useSession();
  useEffect(() => {
    if (session.status === 'anon') go(`/entrar?voltar=${encodeURIComponent(returnTo)}`);
  }, [session.status, returnTo, go]);
  return session.status === 'user';
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const dayMonthYear = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(iso),
  );

const ME_TABS = [
  { to: '/meus-ingressos', label: 'Meus ingressos', icon: '▣', also: ['/ingressos'] },
  { to: '/minhas-compras', label: 'Minhas compras', icon: '≡', also: ['/pedido'] },
  { to: '/minha-conta', label: 'Minha conta', icon: '○', also: [] as string[] },
] as const;

/** Área do cliente (U01–U06): abas sob o cabeçalho no computador e barra inferior no celular. */
export function MeShell({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  const { loc } = useRouter();
  const on = (t: (typeof ME_TABS)[number]) =>
    loc.path === t.to || t.also.some(prefix => loc.path.startsWith(`${prefix}/`));
  return (
    <Layout>
      <nav className="px-me-tabs" aria-label="Área do cliente">
        <div className="px-wrap">
          {ME_TABS.map(t => (
            <Link key={t.to} to={t.to} aria-current={on(t) ? 'page' : undefined}>
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
      <div className={`px-wrap px-me${narrow ? ' px-me-narrow' : ''}`}>{children}</div>
    </Layout>
  );
}

const STATUS: Record<TicketSummary['status'], { label: string; tone: 'ok' | 'neu' | 'err' }> = {
  valido: { label: 'Válido', tone: 'ok' },
  utilizado: { label: 'Utilizado', tone: 'neu' },
  cancelado: { label: 'Cancelado', tone: 'err' },
};
function StatusBadge({ status }: { status: TicketSummary['status'] }) {
  const s = STATUS[status];
  return <span className={`px-badge px-badge-${s.tone}`}>{s.label}</span>;
}

/** QR Code gerado no navegador a partir do conteúdo assinado. Margem de 4 módulos (zona de silêncio) e correção de erro M. */
export function QrImage({ payload, size, label }: { payload: string; size: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // Gera grande (1024 px) e o navegador reduz: nítido em telas de alta densidade.
    QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 4, width: 1024 }).then(url => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [payload]);
  return src ? (
    <img className="px-qrbig" src={src} alt={label} width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <div className="px-qrbig px-skel" style={{ width: size, height: size }} aria-busy="true" />
  );
}

/** Fim do dia do evento + folga: depois disso o ingresso passa para o histórico. */
const isPast = (startsAt: string) => new Date(startsAt).getTime() + 12 * 3600_000 < Date.now();

/** Meus ingressos (RF-42): por evento, com o estado de cada um. Próximos e histórico em abas. */
export function MyTicketsPage() {
  usePageTitle('Meus ingressos · PartyX');
  const ready = useLoggedIn('/meus-ingressos');
  const [state, retry] = useFetch(s => api.tickets(s), ready ? 'tickets' : 'espera');
  const [tab, setTab] = useState<'proximos' | 'historico'>('proximos');
  if (!ready)
    return (
      <Layout>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );
  const all = state.status === 'ok' ? state.data : [];
  const inHistory = (t: TicketSummary) => t.status === 'utilizado' || isPast(t.event.startsAt);
  const list = all.filter(t => (tab === 'historico' ? inHistory(t) : !inHistory(t)));
  // Agrupa por evento, mantendo a ordem do servidor (evento mais próximo primeiro).
  const groups = new Map<string, TicketSummary[]>();
  for (const t of list) groups.set(t.event.slug, [...(groups.get(t.event.slug) ?? []), t]);

  return (
    <MeShell>
      <h1 className="px-me-title">Meus ingressos</h1>
      <div role="tablist" aria-label="Ingressos" className="px-seg">
        {(
          [
            ['proximos', 'Próximos'],
            ['historico', 'Histórico'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {state.status === 'loading' ? (
        <div aria-busy="true" aria-label="Carregando ingressos" className="px-me-skel">
          <span />
          <span />
        </div>
      ) : null}
      {state.status === 'error' ? <ErrorBox onRetry={retry} /> : null}
      {state.status === 'ok' && list.length === 0 ? (
        <div className="px-me-empty">
          <b>{tab === 'historico' ? 'Nada no histórico' : 'Você ainda não tem ingressos'}</b>
          <p>
            {tab === 'historico'
              ? 'Ingressos utilizados e de eventos que já passaram aparecem aqui.'
              : 'Quando um pagamento for confirmado, os ingressos aparecem aqui.'}
          </p>
          <Link to="/eventos" className="px-btn px-btn-pri">
            Ver eventos
          </Link>
        </div>
      ) : null}
      {[...groups.entries()].map(([slug, items]) => {
        const first = items[0]!;
        return (
          <section key={slug} className="px-me-group" aria-label={first.event.name}>
            <div className="px-me-grouphead">
              <span className="px-me-thumb" style={{ background: stripesFor(first.event.name, 6) }} aria-hidden="true" />
              <div>
                <b>{first.event.name}</b>
                <span>
                  {capital(dateLong(first.event.startsAt))} · {timeOf(first.event.startsAt)}
                </span>
                <small>{first.event.venue}</small>
              </div>
              <em>
                {items.length} {items.length === 1 ? 'ingresso' : 'ingressos'}
              </em>
            </div>
            <ul>
              {items.map(t => (
                <li key={t.id}>
                  <Link to={`/ingressos/${t.id}`} className="px-me-ticket">
                    <span className={`px-me-icon px-me-icon-${t.status}`} aria-hidden="true">
                      {t.status === 'cancelado' ? '×' : 'QR'}
                    </span>
                    <span className="px-me-ticket-text">
                      <b>{t.typeName}</b>
                      <small>
                        <span className="px-mono">{t.shortCode}</span> · {t.holderName}
                      </small>
                    </span>
                    <StatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </MeShell>
  );
}

/** Ingresso (U04): dados, QR, tela cheia e PDF. */
export function TicketPage({ id }: { id: string }) {
  usePageTitle('Ingresso · PartyX');
  const ready = useLoggedIn(`/ingressos/${id}`);
  const [state, retry] = useFetch<TicketDetail>(s => api.ticket(id, s), ready ? id : 'espera');
  if (!ready)
    return (
      <Layout>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );
  if (state.status === 'error' && state.code === 404) {
    return (
      <MeShell narrow>
        <div className="px-me-empty">
          <b>Ingresso não encontrado</b>
          <Link to="/meus-ingressos" className="px-btn px-btn-pri">
            Meus ingressos
          </Link>
        </div>
      </MeShell>
    );
  }
  const t = state.status === 'ok' ? state.data : null;
  const invalid =
    t?.status === 'cancelado'
      ? { title: 'Ingresso cancelado', text: 'Este ingresso não vale para entrada. O pagamento foi estornado ou contestado.' }
      : t?.status === 'utilizado'
        ? {
            title: 'Ingresso já utilizado',
            text: t.usedAt ? `A entrada foi registrada em ${dayMonthYear(t.usedAt)} às ${timeOf(t.usedAt)}.` : 'A entrada já foi registrada.',
          }
        : null;
  return (
    <MeShell narrow>
      <Link to="/meus-ingressos" className="px-textlink px-textlink-sm px-self-start">
        ‹ Meus ingressos
      </Link>
      {state.status === 'loading' ? <p aria-busy="true">Carregando…</p> : null}
      {state.status === 'error' ? <ErrorBox onRetry={retry} /> : null}
      {t ? (
        <>
          <article className="px-tk">
            <div className={`px-tk-head px-tk-head-${t.status}`}>
              <div>
                <small>Pedido PX-{t.orderNumber}</small>
                <h1>{t.event.name}</h1>
                <b>{t.typeName}</b>
              </div>
              <StatusBadge status={t.status} />
            </div>
            <div className="px-tk-qr">
              {t.qrPayload && !invalid ? (
                <>
                  <div className="px-tk-qrbox">
                    <QrImage payload={t.qrPayload} size={232} label={`QR Code do ingresso ${t.shortCode}`} />
                  </div>
                  <span className="px-mono px-tk-code">{t.shortCode}</span>
                </>
              ) : (
                <>
                  <div className={`px-tk-invalid px-tk-invalid-${t.status}`} role="status">
                    <b>{invalid?.title}</b>
                    <span>{invalid?.text}</span>
                  </div>
                  <span className="px-mono px-tk-code px-tk-strike">{t.shortCode}</span>
                </>
              )}
            </div>
            <dl className="px-tk-fields">
              <div>
                <dt>Data</dt>
                <dd>{dayMonthYear(t.event.startsAt)}</dd>
              </div>
              <div>
                <dt>Horário</dt>
                <dd>{timeOf(t.event.startsAt)}</dd>
              </div>
              <div className="px-span-2">
                <dt>Local</dt>
                <dd>
                  {t.event.venue}, {t.event.address}
                </dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{t.typeName}</dd>
              </div>
              <div>
                <dt>Comprador</dt>
                <dd>{t.holderName}</dd>
              </div>
              <div>
                <dt>Código</dt>
                <dd className="px-mono">{t.shortCode}</dd>
              </div>
              <div>
                <dt>Pedido</dt>
                <dd className="px-mono">PX-{t.orderNumber}</dd>
              </div>
            </dl>
            <div className="px-tk-actions">
              {t.qrPayload && !invalid ? (
                <Link to={`/ingressos/${t.id}/tela-cheia`} className="px-btn px-btn-pri px-btn-lg">
                  Abrir em tela cheia
                </Link>
              ) : null}
              <a className="px-btn px-btn-outline px-btn-lg" href={`/api/tickets/${t.id}/pdf`} download>
                Baixar PDF
              </a>
            </div>
          </article>
          <p className="px-fine px-fine-dark">
            Cada ingresso vale uma única entrada. Não compartilhe a imagem do QR Code: quem entrar primeiro com ele usa o
            ingresso.
          </p>
        </>
      ) : null}
    </MeShell>
  );
}

/**
 * Tela cheia para a portaria (RF-43, U05): fundo branco, QR do maior tamanho que cabe, código em letras grandes.
 * A página não controla o brilho do aparelho (o navegador não permite); pede para a tela não apagar e orienta a aumentar o brilho.
 */
export function TicketFullscreenPage({ id }: { id: string }) {
  usePageTitle('Ingresso em tela cheia · PartyX');
  const { go } = useRouter();
  const ready = useLoggedIn(`/ingressos/${id}/tela-cheia`);
  const [state] = useFetch<TicketDetail>(s => api.ticket(id, s), ready ? id : 'espera');
  const [size, setSize] = useState(() => qrSize());

  useEffect(() => {
    const onResize = () => setSize(qrSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Mantém a tela acesa enquanto o ingresso está aberto, quando o navegador permite.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const wake = (
      navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    ).wakeLock;
    wake
      ?.request('screen')
      .then(l => (lock = l))
      .catch(() => {});
    return () => {
      void lock?.release().catch(() => {});
    };
  }, []);

  const t = state.status === 'ok' ? state.data : null;
  return (
    <div className="px-fullscreen" role="dialog" aria-label="Ingresso em tela cheia">
      <div className="px-fs-bar">
        <span>{t ? `Pedido PX-${t.orderNumber}` : ''}</span>
        <button type="button" className="px-btn px-btn-outline" onClick={() => go(`/ingressos/${id}`)}>
          Fechar ×
        </button>
      </div>
      {state.status === 'loading' || !ready ? <p aria-busy="true">Carregando…</p> : null}
      {state.status === 'error' ? <p role="alert">Não foi possível abrir o ingresso.</p> : null}
      {t ? (
        <>
          <div className="px-fs-event">
            <b>{t.event.name}</b>
            <span>
              {dayMonthYear(t.event.startsAt)} · {timeOf(t.event.startsAt)}
            </span>
          </div>
          <div className="px-fs-type">{t.typeName}</div>
        </>
      ) : null}
      {t && t.qrPayload ? (
        <>
          <QrImage payload={t.qrPayload} size={size} label={`QR Code do ingresso ${t.shortCode}`} />
          <p className="px-mono px-fs-code">{t.shortCode}</p>
          <p className="px-fs-info">{t.holderName}</p>
          <p className="px-fs-hint">Aumente o brilho da tela e segure o celular parado para facilitar a leitura.</p>
        </>
      ) : null}
      {t && !t.qrPayload ? (
        <>
          <div className="px-fs-invalid" role="alert">
            <b>Ingresso cancelado</b>
            <span>Este ingresso não vale para entrada.</span>
          </div>
          <p className="px-mono px-fs-code px-tk-strike">{t.shortCode}</p>
        </>
      ) : null}
    </div>
  );
}

/** Maior QR quadrado que cabe na tela deixando espaço para o resto. */
function qrSize(): number {
  return Math.max(220, Math.min(window.innerWidth - 32, window.innerHeight - 260, 560));
}

const ORDER_LABEL: Record<string, string> = {
  pendente: 'Aguardando pagamento',
  pago: 'Pago',
  expirado: 'Expirado',
  nao_concluido: 'Não concluído',
  estornado: 'Estornado',
  contestado: 'Contestado',
  cancelado: 'Cancelado',
  pago_sem_estoque: 'Pago sem estoque',
};
const ORDER_TONE: Record<string, 'ok' | 'warn' | 'err' | 'neu' | 'info'> = {
  pendente: 'warn',
  pago: 'ok',
  expirado: 'neu',
  nao_concluido: 'err',
  estornado: 'info',
  contestado: 'err',
  cancelado: 'neu',
  pago_sem_estoque: 'err',
};
const PAYMENT_LABEL: Record<string, string> = {
  pendente: 'Aguardando',
  pago: 'Aprovado',
  expirado: 'Expirado',
  nao_concluido: 'Recusado',
  estornado: 'Estornado',
  contestado: 'Contestado',
  cancelado: 'Não realizado',
  pago_sem_estoque: 'Aprovado',
};

/** Histórico de compras: todos os pedidos e o estado de cada um. */
export function MyOrdersPage() {
  usePageTitle('Minhas compras · PartyX');
  const ready = useLoggedIn('/minhas-compras');
  const [state, retry] = useFetch<OrderRow[]>(s => api.orders(s), ready ? 'orders' : 'espera');
  if (!ready)
    return (
      <Layout>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );
  return (
    <MeShell>
      <h1 className="px-me-title">Minhas compras</h1>
      {state.status === 'loading' ? (
        <div aria-busy="true" aria-label="Carregando compras" className="px-me-skel">
          <span />
          <span />
        </div>
      ) : null}
      {state.status === 'error' ? <ErrorBox onRetry={retry} /> : null}
      {state.status === 'ok' && state.data.length === 0 ? (
        <div className="px-me-empty">
          <b>Você ainda não fez nenhuma compra</b>
          <Link to="/eventos" className="px-btn px-btn-pri">
            Ver eventos
          </Link>
        </div>
      ) : null}
      {state.status === 'ok' ? (
        <ul className="px-orders">
          {state.data.map(o => (
            <li key={o.id}>
              <Link to={`/pedido/${o.id}`} className="px-order">
                <span className="px-order-main">
                  <span className="px-mono">
                    PX-{o.number} · {dayMonthYear(o.createdAt)}
                  </span>
                  <b>{o.eventName}</b>
                </span>
                <span className="px-order-qty">
                  {o.ticketCount} {o.ticketCount === 1 ? 'ingresso' : 'ingressos'}
                </span>
                <b className="px-order-total">{brl(o.totalCents)}</b>
                <span className="px-order-badges">
                  <span className={`px-badge px-badge-${ORDER_TONE[o.status] ?? 'neu'}`}>
                    Pedido: {ORDER_LABEL[o.status] ?? o.status}
                  </span>
                  <span className={`px-badge px-badge-${ORDER_TONE[o.status] ?? 'neu'}`}>
                    Pagamento: {PAYMENT_LABEL[o.status] ?? '—'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </MeShell>
  );
}
