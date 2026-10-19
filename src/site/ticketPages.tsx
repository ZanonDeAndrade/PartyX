import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import {
  api,
  ApiError,
  minorAuthorizationUrl,
  type LegalDocument,
  type OrderRow,
  type OrderView,
  type TicketDetail,
  type TicketSummary,
} from './api';
import { DateStub, ErrorBox, Layout, usePageTitle } from './components';
import { brl, dateParts, timeOf } from './format';
import {
  IconBack,
  IconChevron,
  IconDownload,
  IconExpand,
  IconReceipt,
  IconShare,
  IconTicket,
  IconUser,
} from './icons';
import { cascade, useReducedMotion } from './motion';
import { Link, useRouter } from './router';
import { useSession } from './session';
import { useFetch } from './useFetch';

/** Leva o visitante ao login e de volta (como no checkout). */
/** Valor do ingresso e taxa de serviço separados (D-90): "R$ 30,00 + R$ 1,58 de taxa de serviço"; sem taxa, só o valor. */
const ticketValue = (t: TicketSummary) =>
  t.serviceFeeCents ? `${brl(t.priceCents ?? 0)} + ${brl(t.serviceFeeCents)} de taxa de serviço` : brl(t.priceCents ?? 0);

export function useLoggedIn(returnTo: string): boolean {
  const { go } = useRouter();
  const session = useSession();
  useEffect(() => {
    if (session.status === 'anon') go(`/entrar?voltar=${encodeURIComponent(returnTo)}`);
  }, [session.status, returnTo, go]);
  return session.status === 'user';
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const dayMonthYear = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));

const ME_TABS = [
  { to: '/meus-ingressos', label: 'Meus ingressos', Icon: IconTicket, also: ['/ingressos'] },
  { to: '/minhas-compras', label: 'Minhas compras', Icon: IconReceipt, also: ['/pedido'] },
  { to: '/minha-conta', label: 'Minha conta', Icon: IconUser, also: [] as string[] },
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
              <t.Icon size={20} />
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
      {[...groups.entries()].map(([slug, items]) => (
        <WalletGroup key={slug} items={items} />
      ))}
    </MeShell>
  );
}

/**
 * Um evento na carteira (U01): cabeçalho do evento e os ingressos empilhados. Com dois ou mais, a pilha mostra o primeiro e
 * as bordas dos outros; "Mostrar todos" abre a lista (os itens novos entram com opacidade e deslocamento, sem animar altura).
 */
/** Na pilha, o ingresso que ainda vale fica por cima. */
const STATUS_ORDER: Record<TicketSummary['status'], number> = { valido: 0, utilizado: 1, cancelado: 2 };

function WalletGroup({ items: raw }: { items: TicketSummary[] }) {
  const items = [...raw].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const first = items[0]!;
  const stacked = items.length > 1;
  const [open, setOpen] = useState(false);
  const shown = stacked && !open ? items.slice(0, 1) : items;
  const listId = `carteira-${first.event.slug}`;
  return (
    <section className={`px-wallet${stacked && !open ? ' px-wallet-stacked' : ''}`} aria-label={first.event.name}>
      <header className="px-wallet-head">
        <DateStub iso={first.event.startsAt} />
        <div>
          <h2>{first.event.name}</h2>
          <span>
            {capital(dateParts(first.event.startsAt).weekday)}, às {timeOf(first.event.startsAt)}
          </span>
          <small>{first.event.venue}</small>
        </div>
      </header>
      <ul id={listId} className="px-wallet-list">
        {shown.map((t, i) => (
          <li key={t.id} className={i > 0 ? 'px-in' : undefined} style={i > 0 ? cascade(Math.min(i - 1, 6)) : undefined}>
            <Link to={`/ingressos/${t.id}`} className={`px-me-ticket px-me-ticket-${t.status}`}>
              <span className="px-me-ticket-text">
                <b>{t.typeName}</b>
                <small>
                  <span className="px-mono">{t.shortCode}</span>
                  <span>{t.receivedFrom ? `Recebido de ${t.receivedFrom.name}` : t.holderName}</span>
                  {t.priceCents !== undefined ? <span className="px-nowrap">{ticketValue(t)}</span> : null}
                </small>
              </span>
              <StatusBadge status={t.status} />
              <IconChevron size={18} className="px-me-chev" />
            </Link>
          </li>
        ))}
      </ul>
      {stacked ? (
        <button
          type="button"
          className="px-wallet-toggle"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(v => !v)}
        >
          {open ? 'Mostrar só o primeiro' : `Mostrar os ${items.length} ingressos`}
        </button>
      ) : null}
      {first.event.allowsMinors ? <MinorAuthorizationLinks items={items} /> : null}
    </section>
  );
}

/**
 * Evento que permite menores de 16 e 17 anos: o Termo de Autorização e Responsabilidade de cada pedido (preenchido com os dados do
 * comprador quando ele é menor; em branco para acompanhante). Quem tiver 16 ou 17 anos entrega o termo assinado na portaria.
 */
function MinorAuthorizationLinks({ items }: { items: TicketSummary[] }) {
  // Ingresso recebido numa transferência (D-87): o pedido é de outra pessoa; a autorização sai por ingresso, em nome de quem recebeu.
  const orders = [...new Map(items.filter(t => !t.receivedFrom).map(t => [t.orderId, t.orderNumber])).entries()];
  const received = items.filter(t => t.receivedFrom);
  const many = orders.length + received.length > 1;
  return (
    <div className="px-wallet-minor">
      <p>
        Quem tiver 16 ou 17 anos na data do evento entra com o Termo de Autorização e Responsabilidade preenchido e
        assinado pelo responsável, mais a cópia do documento dele.
      </p>
      {orders.map(([orderId, number]) => (
        <a key={orderId} href={minorAuthorizationUrl.order(orderId)} download className="px-btn px-btn-sec">
          <IconDownload size={18} />
          {many ? `Autorização para menores · pedido PX-${number}` : 'Autorização para menores (PDF)'}
        </a>
      ))}
      {received.map(t => (
        <a key={t.id} href={minorAuthorizationUrl.ticket(t.id)} download className="px-btn px-btn-sec">
          <IconDownload size={18} />
          {many ? `Autorização para menores · ingresso ${t.shortCode}` : 'Autorização para menores (PDF)'}
        </a>
      ))}
    </div>
  );
}

/**
 * Página do link do e-mail de compra: entra na conta (se preciso) e oferece o Termo de Autorização e Responsabilidade do pedido. O
 * PDF sai do servidor só para o dono do pedido.
 */
export function MinorAuthorizationPage({ orderId }: { orderId: string }) {
  usePageTitle('Autorização para menores · PartyX');
  const ready = useLoggedIn(`/autorizacao-menor/pedido/${orderId}`);
  const [state, retry] = useFetch<OrderView>(s => api.order(orderId, s), ready ? orderId : 'espera');
  if (!ready)
    return (
      <Layout>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );
  const order = state.status === 'ok' ? state.data : null;
  return (
    <MeShell narrow>
      <h1 className="px-me-title">Termo de Autorização e Responsabilidade</h1>
      {state.status === 'loading' ? <div aria-busy="true" className="px-me-skel" /> : null}
      {state.status === 'error' ? (
        state.code === 404 ? (
          <div className="px-me-empty">
            <b>Pedido não encontrado</b>
            <Link to="/meus-ingressos" className="px-btn px-btn-pri">
              Meus ingressos
            </Link>
          </div>
        ) : (
          <ErrorBox onRetry={retry} />
        )
      ) : null}
      {order && !order.event.allowsMinors ? (
        <p className="px-notice px-notice-neu" role="status">
          O evento <b>{order.event.name}</b> é só para quem tiver 18 anos ou mais na data do evento: não há autorização
          para menores.
        </p>
      ) : null}
      {order?.event.allowsMinors ? (
        <div className="px-wallet-minor">
          <p>
            Evento <b>{order.event.name}</b>, pedido PX-{order.number}.{' '}
            {order.buyerMinor
              ? 'O termo já sai com o seu nome e a sua data de nascimento.'
              : 'Os dados do menor ficam em branco, para o acompanhante preencher.'}{' '}
            O responsável legal preenche à mão e assina. Na portaria, o menor entrega o termo com a cópia do documento
            com foto do responsável e apresenta o próprio documento original com foto.
          </p>
          <a href={minorAuthorizationUrl.order(order.id)} download className="px-btn px-btn-pri px-btn-lg">
            <IconDownload size={20} />
            Baixar o termo (PDF)
          </a>
        </div>
      ) : null}
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
  // Transferência (D-87): até 2 horas antes do evento, só ingresso válido.
  const canTransfer = t?.status === 'valido' && Date.now() < new Date(t.transferUntil).getTime();
  const invalid =
    t?.status === 'cancelado'
      ? {
          title: 'Ingresso cancelado',
          text: 'Este ingresso não vale para entrada. O pagamento foi estornado ou contestado.',
        }
      : t?.status === 'utilizado'
        ? {
            title: 'Ingresso já utilizado',
            text: t.usedAt
              ? `A entrada foi registrada em ${dayMonthYear(t.usedAt)} às ${timeOf(t.usedAt)}.`
              : 'A entrada já foi registrada.',
          }
        : null;
  return (
    <MeShell narrow>
      <Link to="/meus-ingressos" className="px-textlink px-textlink-sm px-self-start">
        <IconBack size={18} />
        Meus ingressos
      </Link>
      {state.status === 'loading' ? (
        <div className="px-skel px-tk-skel" aria-busy="true" aria-label="Carregando ingresso" />
      ) : null}
      {state.status === 'error' ? <ErrorBox onRetry={retry} /> : null}
      {t ? (
        <>
          <article className="px-tk">
            <div className={`px-tk-head px-tk-head-${t.status}`}>
              <DateStub iso={t.event.startsAt} />
              <div>
                <h1>{t.event.name}</h1>
                <b>{t.typeName}</b>
              </div>
              <StatusBadge status={t.status} />
            </div>
            <div className="px-tk-qr">
              {t.minorTermPending && !invalid ? (
                <MinorTermGate ticket={t} onAccepted={retry} />
              ) : t.qrPayload && !invalid ? (
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
              {t.priceCents !== undefined ? (
                <div>
                  <dt>Valor</dt>
                  <dd>{ticketValue(t)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Titular</dt>
                <dd>{t.holderName}</dd>
              </div>
              <div>
                <dt>Código</dt>
                <dd className="px-mono">{t.shortCode}</dd>
              </div>
              {t.receivedFrom ? (
                <div>
                  <dt>Recebido de</dt>
                  <dd>
                    {t.receivedFrom.name}, {dayMonthYear(t.receivedFrom.at)}
                  </dd>
                </div>
              ) : (
                <div>
                  <dt>Pedido</dt>
                  <dd className="px-mono">PX-{t.orderNumber}</dd>
                </div>
              )}
            </dl>
            <div className="px-tk-actions">
              {t.qrPayload && !invalid ? (
                <Link to={`/ingressos/${t.id}/tela-cheia`} className="px-btn px-btn-pri px-btn-lg">
                  <IconExpand size={18} />
                  Abrir em tela cheia
                </Link>
              ) : null}
              {t.minorTermPending ? null : (
                <a className="px-btn px-btn-outline px-btn-lg" href={`/api/tickets/${t.id}/pdf`} download>
                  <IconDownload size={18} />
                  Baixar PDF
                </a>
              )}
              {canTransfer ? (
                <Link to={`/ingressos/${t.id}/transferir`} className="px-btn px-btn-outline px-btn-lg">
                  <IconShare size={18} />
                  Transferir
                </Link>
              ) : null}
            </div>
          </article>
          <p className="px-fine px-fine-dark">
            Cada ingresso vale uma entrada. Não envie a imagem do QR Code para ninguém: quem passar primeiro na portaria
            usa o ingresso.
            {canTransfer
              ? ` Para passar o ingresso a outra pessoa, use Transferir até ${dayMonthYear(t.transferUntil)} às ${timeOf(t.transferUntil)}.`
              : ''}
          </p>
        </>
      ) : null}
    </MeShell>
  );
}

/**
 * Recebido numa transferência com 16 ou 17 anos (D-87): no lugar do QR, o Termo de Ciência para Menores de Idade, com a caixa nunca
 * pré-marcada. Aceito, o QR aparece. Na portaria, a pessoa entrega a autorização assinada pelo responsável.
 */
function MinorTermGate({ ticket, onAccepted }: { ticket: TicketDetail; onAccepted: () => void }) {
  const [term, setTerm] = useState<LegalDocument | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const ctl = new AbortController();
    api
      .legalDocument('termo-menor', ctl.signal)
      .then(setTerm)
      .catch(() => setError('Não foi possível carregar o termo. Tente de novo.'));
    return () => ctl.abort();
  }, []);
  const accept = async () => {
    if (!term?.version) return;
    setBusy(true);
    setError('');
    try {
      await api.acceptTicketMinorTerm(ticket.id, term.version);
      onAccepted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível registrar o aceite. Tente de novo.');
      if (e instanceof ApiError && e.code === 'versao_desatualizada') setTerm(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="px-tk-term" aria-labelledby="termo-recebido">
      <h2 id="termo-recebido">Aceite o Termo de Ciência para ver o QR Code</h2>
      <p>
        Você recebeu este ingresso e terá 16 ou 17 anos na data do evento. Leia e aceite o termo; na portaria, entregue o
        Termo de Autorização e Responsabilidade assinado pelo seu responsável.
      </p>
      <div className="px-tk-termtext" tabIndex={0} aria-label="Texto do Termo de Ciência para Menores de Idade">
        {term ? (
          term.blocks.map((b, i) => (b.type === 'heading' ? <h3 key={i}>{b.text}</h3> : <p key={i}>{b.text}</p>))
        ) : (
          <p aria-busy="true">Carregando o termo…</p>
        )}
      </div>
      <div className="px-check">
        <input
          id="aceite-termo-recebido"
          type="checkbox"
          checked={accepted}
          disabled={!term}
          onChange={e => setAccepted(e.target.checked)}
        />
        <label htmlFor="aceite-termo-recebido">Li e aceito o Termo de Ciência para Menores de Idade.</label>
      </div>
      {error ? (
        <p className="px-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="px-btn px-btn-pri" disabled={!accepted || busy || !term} onClick={accept}>
        {busy ? 'Registrando…' : 'Aceitar e mostrar o QR Code'}
      </button>
    </section>
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
  // O QR só aparece depois que a folha branca termina de entrar: ele nunca é animado nem fica transparente.
  const reduce = useReducedMotion();
  const [settled, setSettled] = useState(Boolean(reduce));
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(true), 500); // garantia, se a animação não terminar (aba em segundo plano)
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div
      className="px-fullscreen px-fs-in"
      role="dialog"
      aria-label="Ingresso em tela cheia"
      onAnimationEnd={e => {
        if (e.target === e.currentTarget) setSettled(true);
      }}
    >
      <div className="px-fs-bar">
        <span>{t ? `Pedido PX-${t.orderNumber}` : ''}</span>
        <button type="button" className="px-btn px-btn-outline" onClick={() => go(`/ingressos/${id}`)}>
          Fechar
        </button>
      </div>
      {state.status === 'loading' || !ready ? <p aria-busy="true">Carregando…</p> : null}
      {state.status === 'error' ? <p role="alert">Não foi possível abrir o ingresso.</p> : null}
      {t ? (
        <>
          <div className="px-fs-event">
            <b>{t.event.name}</b>
            <span>
              {dayMonthYear(t.event.startsAt)}, às {timeOf(t.event.startsAt)}
            </span>
          </div>
          <div className="px-fs-type">{t.typeName}</div>
        </>
      ) : null}
      {t && t.qrPayload ? (
        <>
          {settled ? (
            <QrImage payload={t.qrPayload} size={size} label={`QR Code do ingresso ${t.shortCode}`} />
          ) : (
            <div className="px-qrbig" style={{ width: size, height: size }} aria-hidden="true" />
          )}
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
                  <span className="px-order-meta">
                    <span className="px-mono">PX-{o.number}</span> <span>{dayMonthYear(o.createdAt)}</span>
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
                    Pagamento: {PAYMENT_LABEL[o.status] ?? 'Não informado'}
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
