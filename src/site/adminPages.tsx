import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  api,
  ApiError,
  type AdminOrderDetail,
  type AdminTicketRow,
  type LiveEntries,
  type OrderStatus,
  type SalesGroup,
} from './api';
import { Layout, usePageTitle } from './components';
import { brl, dateShort, timeOf } from './format';
import { Link, useRouter } from './router';
import { useSession } from './session';
import { useFetch } from './useFetch';

/** Só administrador. Visitante vai ao login (voltando aqui); outros perfis veem o aviso de acesso negado. */
export function useAdmin(returnTo: string): 'espera' | 'ok' | 'negado' {
  const { go } = useRouter();
  const session = useSession();
  useEffect(() => {
    if (session.status === 'anon') go(`/entrar?voltar=${encodeURIComponent(returnTo)}`);
    else if (session.user?.mustChangePassword) go('/primeiro-acesso');
  }, [session.status, session.user, returnTo, go]);
  if (session.status !== 'user') return 'espera';
  return session.user?.role === 'administrador' ? 'ok' : 'negado';
}

export type AdminTab = 'geral' | 'pedidos' | 'eventos' | 'relatorios';

function AdminShell({ children, active }: { children: ReactNode; active: AdminTab }) {
  return (
    <Layout>
      <div className="px-wrap">
        <nav className="px-subnav" aria-label="Painel">
          <Link to="/admin" aria-current={active === 'geral' ? 'page' : undefined}>
            Visão geral
          </Link>
          <Link to="/admin/pedidos" aria-current={active === 'pedidos' ? 'page' : undefined}>
            Pedidos
          </Link>
          <Link to="/admin/eventos" aria-current={active === 'eventos' ? 'page' : undefined}>
            Eventos
          </Link>
          <Link to="/admin/relatorios/vendas" aria-current={active === 'relatorios' ? 'page' : undefined}>
            Relatórios
          </Link>
        </nav>
        {children}
      </div>
    </Layout>
  );
}

export function Gate({
  access,
  children,
  active,
}: {
  access: 'espera' | 'ok' | 'negado';
  children: ReactNode;
  active: AdminTab;
}) {
  if (access === 'negado') {
    return (
      <Layout>
        <div className="px-wrap px-narrow">
          <div className="px-box">
            <h1 className="px-h2">Acesso negado</h1>
            <p>Esta área é só para administradores.</p>
            <Link to="/" className="px-btn px-btn-pri">
              Voltar ao início
            </Link>
          </div>
        </div>
      </Layout>
    );
  }
  if (access === 'espera')
    return (
      <Layout>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );
  return <AdminShell active={active}>{children}</AdminShell>;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pendente: 'Aguardando pagamento',
  pago: 'Pago',
  expirado: 'Expirado',
  nao_concluido: 'Não concluído',
  cancelado: 'Cancelado',
  estornado: 'Estornado',
  contestado: 'Contestado',
  pago_sem_estoque: 'Pago sem estoque',
};
const STATUS_TONE: Record<OrderStatus, string> = {
  pendente: 'warn',
  pago: 'ok',
  expirado: 'neu',
  nao_concluido: 'err',
  cancelado: 'neu',
  estornado: 'info',
  contestado: 'err',
  pago_sem_estoque: 'err',
};
function StatusPill({ status }: { status: OrderStatus }) {
  return <span className={`px-badge px-badge-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}
const TICKET_TONE = { valido: 'ok', utilizado: 'warn', cancelado: 'err' } as const;
const TICKET_LABEL = { valido: 'Válido', utilizado: 'Utilizado', cancelado: 'Cancelado' } as const;

/**
 * Tabela que vira lista de cartões em celular (CA-32): sem rolagem horizontal. O cabeçalho continua para leitores de tela;
 * cada célula recebe o rótulo da sua coluna (`data-label`), que o CSS mostra antes do valor quando a largura é estreita.
 */
export function TableWrap({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const table = ref.current?.querySelector('table');
    if (!table) return;
    const labels: string[] = [];
    table.querySelectorAll('thead th').forEach(th => labels.push(th.textContent?.trim() ?? ''));
    table.querySelectorAll('tbody tr').forEach(tr => {
      let col = 0;
      tr.querySelectorAll('td').forEach(td => {
        const span = td.colSpan || 1;
        if (span === 1 && labels[col]) td.setAttribute('data-label', labels[col]!);
        else td.removeAttribute('data-label');
        col += span;
      });
    });
  });
  return (
    <div className="px-tablewrap" ref={ref}>
      {children}
    </div>
  );
}

export function Loading({ state, retry }: { state: { status: string }; retry: () => void }) {
  if (state.status === 'loading') return <p aria-busy="true">Carregando…</p>;
  if (state.status === 'error') {
    return (
      <p className="px-notice px-notice-err" role="alert">
        Não foi possível carregar.{' '}
        <button type="button" className="px-link" onClick={retry}>
          Tentar de novo
        </button>
      </p>
    );
  }
  return null;
}

// ---------- visão geral (RF-55) ----------

function Kpi({ title, group }: { title: string; group: SalesGroup }) {
  const rows: [string, keyof SalesGroup][] = [
    ['Pagos', 'paid'],
    ['Estornados', 'refunded'],
    ['Contestados', 'contested'],
    ['Pagos sem estoque', 'withoutStock'],
  ];
  return (
    <section className="px-panel" aria-label={title}>
      <h2 className="px-h3">{title}</h2>
      <p className="px-kpi">
        {brl(group.paid.cents)}
        <small>
          {group.paid.tickets} {group.paid.tickets === 1 ? 'ingresso' : 'ingressos'} · {group.paid.orders}{' '}
          {group.paid.orders === 1 ? 'pedido pago' : 'pedidos pagos'}
        </small>
      </p>
      <ul className="px-minilist">
        {rows.slice(1).map(([label, key]) =>
          group[key].orders > 0 ? (
            <li key={key}>
              {label}: <b>{group[key].orders}</b> pedido{group[key].orders === 1 ? '' : 's'} · {brl(group[key].cents)}
            </li>
          ) : null,
        )}
      </ul>
    </section>
  );
}

export function AdminOverviewPage() {
  usePageTitle('Painel · PartyX');
  const access = useAdmin('/admin');
  const [month, setMonth] = useState('');
  const [state, retry] = useFetch(
    s => api.admin.overview(month || undefined, s),
    access === 'ok' ? `overview|${month}` : 'espera',
  );
  const data = state.status === 'ok' ? state.data : null;
  const max = data ? Math.max(1, ...data.daily.map(d => d.cents)) : 1;
  return (
    <Gate access={access} active="geral">
      <h1 className="px-h1">Visão geral</h1>
      <Loading state={state} retry={retry} />
      {data ? (
        <>
          {data.attention.paidWithoutStock > 0 ? (
            <p className="px-notice px-notice-err" role="alert">
              <b>{data.attention.paidWithoutStock}</b> pagamento(s) aprovado(s) sem estoque: o cliente precisa estornar
              no gateway. <Link to="/admin/pedidos?status=pago_sem_estoque">Ver pedidos</Link>
            </p>
          ) : null}
          <div className="px-kpis">
            <Kpi title={`Hoje (${data.today.split('-').reverse().join('/')})`} group={data.day} />
            <Kpi title={`Mês ${data.month.split('-').reverse().join('/')}`} group={data.monthSales} />
          </div>
          <div className="px-field px-inline">
            <label htmlFor="mes">Mês</label>
            <input id="mes" type="month" value={month || data.month} onChange={e => setMonth(e.target.value)} />
          </div>

          <section aria-labelledby="diario">
            <h2 id="diario" className="px-h3">
              Vendas por dia
            </h2>
            {data.daily.length === 0 ? <p className="px-muted">Nenhuma venda paga neste mês.</p> : null}
            <ul className="px-bars">
              {data.daily.map(d => (
                <li key={d.day}>
                  <span className="px-bars-label">
                    {d.day.slice(8)}/{d.day.slice(5, 7)}
                  </span>
                  <span className="px-bars-track" aria-hidden="true">
                    <span className="px-bars-fill" style={{ width: `${Math.max(2, (d.cents / max) * 100)}%` }} />
                  </span>
                  <span className="px-bars-value">
                    {brl(d.cents)} · {d.tickets} ing.
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="eventos">
            <h2 id="eventos" className="px-h3">
              Eventos em andamento
            </h2>
            {data.events.length === 0 ? <p className="px-muted">Nenhum evento publicado.</p> : null}
            {data.events.map(e => (
              <div key={e.id} className="px-panel">
                <h3 className="px-h3">
                  <Link to={`/admin/eventos/${e.id}`}>{e.name}</Link>
                </h3>
                <p className="px-muted">
                  {dateShort(e.startsAt)} · {timeOf(e.startsAt)}
                </p>
                <TableWrap>
                  <table className="px-table">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Capacidade</th>
                        <th>Vendidos</th>
                        <th>Reservados</th>
                        <th>Restantes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.types.map(t => (
                        <tr key={t.id}>
                          <td>
                            {t.name} {!t.isActive ? <span className="px-badge px-badge-neu">desativado</span> : null}
                          </td>
                          <td>{t.capacity}</td>
                          <td>{t.sold}</td>
                          <td>{t.reserved}</td>
                          <td>
                            <b>{t.remaining}</b>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <th scope="row">Total</th>
                        <td>{e.totals.capacity}</td>
                        <td>{e.totals.sold}</td>
                        <td>{e.totals.reserved}</td>
                        <td>
                          <b>{e.totals.remaining}</b>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </TableWrap>
              </div>
            ))}
          </section>
        </>
      ) : null}
    </Gate>
  );
}

// ---------- pedidos (RF-56) ----------

/** Baixa o arquivo gerado na hora, com os mesmos filtros da tela. Link comum: a sessão vai no cookie, não há URL pública. */
export function ExportLink({
  path,
  query = '',
  label = 'Exportar CSV',
}: {
  path: string;
  query?: string;
  label?: string;
}) {
  const href = `/api${path}${query ? `?${query}` : ''}`;
  return (
    <p className="px-export">
      <a className="px-btn" href={href} download>
        {label}
      </a>{' '}
      <span className="px-muted">Planilha para o Excel (UTF-8, separador “;”), com os filtros desta tela.</span>
    </p>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="px-pager" aria-label="Páginas">
      <button type="button" className="px-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Anterior
      </button>
      <span>
        Página {page} de {pages} · {total} {total === 1 ? 'resultado' : 'resultados'}
      </span>
      <button type="button" className="px-btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Próxima
      </button>
    </nav>
  );
}

export function AdminOrdersPage() {
  usePageTitle('Pedidos · PartyX');
  const { loc, go } = useRouter();
  const access = useAdmin('/admin/pedidos');
  const params = new URLSearchParams(loc.search);
  const filters = {
    status: params.get('status') ?? '',
    eventId: params.get('eventId') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    q: params.get('q') ?? '',
    page: Number(params.get('page') ?? 1) || 1,
  };
  const toQuery = (f: typeof filters) =>
    new URLSearchParams(
      Object.entries(f)
        .filter(([, v]) => v !== '' && v !== 1)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
  const query = toQuery(filters);
  const [state, retry] = useFetch(s => api.admin.orders(query, s), access === 'ok' ? `orders|${query}` : 'espera');
  const [events] = useFetch(s => api.admin.events(s), access === 'ok' ? 'events' : 'espera');
  const apply = (next: Partial<typeof filters>) => {
    const merged = { ...filters, page: 1, ...next };
    const qs = toQuery(merged);
    go(`/admin/pedidos${qs ? `?${qs}` : ''}`);
  };
  const [draft, setDraft] = useState(filters.q);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    apply({ q: draft.trim() });
  };
  const data = state.status === 'ok' ? state.data : null;
  return (
    <Gate access={access} active="pedidos">
      <h1 className="px-h1">Pedidos</h1>
      <ExportLink path="/admin/exports/orders.csv" query={toQuery({ ...filters, page: 1 })} />
      <form className="px-filters" onSubmit={submit} role="search" aria-label="Filtrar pedidos">
        <div className="px-field">
          <label htmlFor="f-ev">Evento</label>
          <select id="f-ev" value={filters.eventId} onChange={e => apply({ eventId: e.target.value })}>
            <option value="">Todos</option>
            {events.status === 'ok'
              ? events.data.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))
              : null}
          </select>
        </div>
        <div className="px-field">
          <label htmlFor="f-st">Situação</label>
          <select id="f-st" value={filters.status} onChange={e => apply({ status: e.target.value })}>
            <option value="">Todas</option>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map(s => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="px-field">
          <label htmlFor="f-de">De</label>
          <input id="f-de" type="date" value={filters.from} onChange={e => apply({ from: e.target.value })} />
        </div>
        <div className="px-field">
          <label htmlFor="f-ate">Até</label>
          <input id="f-ate" type="date" value={filters.to} onChange={e => apply({ to: e.target.value })} />
        </div>
        <div className="px-field">
          <label htmlFor="f-q">Pedido, nome ou e-mail</label>
          <input id="f-q" value={draft} onChange={e => setDraft(e.target.value)} placeholder="PX-10001, Ana, ana@..." />
        </div>
        <button type="submit" className="px-btn px-btn-pri">
          Buscar
        </button>
      </form>
      <Loading state={state} retry={retry} />
      {data ? (
        <>
          {data.rows.length === 0 ? <p className="px-box">Nenhum pedido com estes filtros.</p> : null}
          <TableWrap>
            <table className="px-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Comprador</th>
                  <th>Evento</th>
                  <th>Situação do pagamento</th>
                  <th>Total</th>
                  <th>Ingressos</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(o => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/admin/pedidos/${o.id}`}>PX-{o.number}</Link>
                    </td>
                    <td>
                      {o.buyer.name}
                      <br />
                      <span className="px-muted">{o.buyer.cpf ?? ''}</span>
                    </td>
                    <td>{o.event.name}</td>
                    <td>
                      <StatusPill status={o.status} />
                      {o.paymentMethod ? (
                        <span className="px-muted"> {o.paymentMethod === 'pix' ? 'Pix' : 'Cartão'}</span>
                      ) : null}
                    </td>
                    <td>{brl(o.totalCents)}</td>
                    <td>
                      {o.tickets}
                      {o.cancelledTickets ? <span className="px-muted"> ({o.cancelledTickets} canc.)</span> : null}
                    </td>
                    <td>
                      {dateShort(o.createdAt)} {timeOf(o.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={p => apply({ page: p })} />
        </>
      ) : null}
    </Gate>
  );
}

// ---------- cancelamento (RF-62) ----------

/** Confirmação do cancelamento: motivo obrigatório e aviso de que o estorno financeiro é do cliente, no gateway. */
function CancelDialog({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.reason ?? err.message) : 'Não foi possível cancelar.');
      setBusy(false);
    }
  };
  return (
    <div className="px-modal-bg" onClick={onCancel}>
      <form
        className="px-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
      >
        <h2 id="cancel-title" className="px-h3">
          {title}
        </h2>
        <p>
          O ingresso deixa de valer na portaria. Pedido, ingresso e data do pagamento continuam registrados, e o estoque
          não é reposto.
        </p>
        <div className="px-field">
          <label htmlFor="motivo">Motivo (fica na trilha de auditoria)</label>
          <textarea
            id="motivo"
            ref={first}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <div className="px-check">
          <input id="ciente" type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
          <label htmlFor="ciente">
            Estou ciente de que o <b>estorno financeiro</b> não é feito pela plataforma: eu faço no painel do gateway,
            se for o caso.
          </label>
        </div>
        {error ? (
          <p className="px-notice px-notice-err" role="alert">
            {error}
          </p>
        ) : null}
        <div className="px-actions">
          <button type="button" className="px-btn" onClick={onCancel} disabled={busy}>
            Voltar
          </button>
          <button type="submit" className="px-btn px-btn-danger" disabled={busy || !ack || reason.trim().length < 5}>
            {busy ? 'Cancelando…' : 'Cancelar ingresso'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AdminOrderPage({ id }: { id: string }) {
  usePageTitle('Pedido · PartyX');
  const access = useAdmin(`/admin/pedidos/${id}`);
  const [state, retry] = useFetch<AdminOrderDetail>(s => api.admin.order(id, s), access === 'ok' ? id : 'espera');
  const [target, setTarget] = useState<{ kind: 'ticket'; id: string; code: string } | { kind: 'order' } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const o = state.status === 'ok' ? state.data : null;
  return (
    <Gate access={access} active="pedidos">
      <p>
        <Link to="/admin/pedidos">← Pedidos</Link>
      </p>
      <Loading state={state} retry={retry} />
      {o ? (
        <>
          <h1 className="px-h1">Pedido PX-{o.number}</h1>
          <p role="status">
            <StatusPill status={o.status} /> <span className="px-muted">{o.situation}</span>
          </p>
          {o.status === 'pago_sem_estoque' ? (
            <p className="px-notice px-notice-err" role="note">
              Pagamento aprovado depois do prazo, sem estoque: nenhum ingresso foi emitido. O cliente precisa estornar
              no painel do gateway. A plataforma não estorna sozinha.
            </p>
          ) : null}
          {done ? (
            <p className="px-notice px-notice-info" role="status">
              {done}
            </p>
          ) : null}
          <dl className="px-facts">
            <div>
              <dt>Comprador</dt>
              <dd>
                {o.buyer.name}
                <br />
                <span className="px-muted">
                  {o.buyer.email} · {o.buyer.cpf ?? 'sem CPF'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Evento</dt>
              <dd>{o.event.name}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>
                {brl(o.totalCents)} {o.paymentMethod ? `· ${o.paymentMethod === 'pix' ? 'Pix' : 'Cartão'}` : ''}
              </dd>
            </div>
            <div>
              <dt>Pago em</dt>
              <dd>{o.paidAt ? `${dateShort(o.paidAt)} ${timeOf(o.paidAt)}` : '—'}</dd>
            </div>
            <div>
              <dt>Id no gateway</dt>
              <dd className="px-mono">{o.gatewayPaymentId ?? '—'}</dd>
            </div>
          </dl>

          <h2 className="px-h3">Itens</h2>
          <ul className="px-lines">
            {o.items.map(i => (
              <li key={i.name}>
                <span>
                  {i.quantity} × {i.name} ({brl(i.unitPriceCents)})
                </span>
                <b>{brl(i.subtotalCents)}</b>
              </li>
            ))}
          </ul>

          <h2 className="px-h3">Ingressos</h2>
          {o.tickets.length === 0 ? <p className="px-muted">Nenhum ingresso emitido neste pedido.</p> : null}
          <ul className="px-tickets">
            {o.tickets.map(t => (
              <li key={t.id} className="px-hit">
                <div>
                  <span className="px-mono">{t.shortCode}</span> · {t.typeName}
                  <br />
                  <span className={`px-badge px-badge-${TICKET_TONE[t.status]}`}>{TICKET_LABEL[t.status]}</span>
                  {t.usedAt ? <span className="px-muted"> entrou {timeOf(t.usedAt)}</span> : null}
                  {t.cancelReason ? <span className="px-muted"> · {t.cancelReason}</span> : null}
                </div>
                <button
                  type="button"
                  className="px-btn"
                  disabled={t.status !== 'valido'}
                  onClick={() => setTarget({ kind: 'ticket', id: t.id, code: t.shortCode })}
                >
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
          {o.tickets.some(t => t.status === 'valido') ? (
            <button type="button" className="px-btn px-btn-danger" onClick={() => setTarget({ kind: 'order' })}>
              Cancelar todos os ingressos válidos do pedido
            </button>
          ) : null}

          <h2 className="px-h3">Histórico</h2>
          {o.trail.length === 0 && o.gatewayEvents.length === 0 ? <p className="px-muted">Sem registros.</p> : null}
          <ul className="px-trail">
            {o.trail.map((a, i) => (
              <li key={`a${i}`}>
                <b>{a.action}</b> · {dateShort(a.at)} {timeOf(a.at)} · {a.actor ?? 'sistema'}
                {a.reason ? <span className="px-muted"> — {a.reason}</span> : null}
              </li>
            ))}
            {o.gatewayEvents.map((g, i) => (
              <li key={`g${i}`}>
                <b>gateway: {g.type}</b> · {dateShort(g.receivedAt)} {timeOf(g.receivedAt)} ·{' '}
                {g.processedAt ? 'processado' : 'pendente'}
                {g.error ? <span className="px-muted"> ({g.error})</span> : null}
              </li>
            ))}
          </ul>

          {target ? (
            <CancelDialog
              title={
                target.kind === 'ticket'
                  ? `Cancelar o ingresso ${target.code}?`
                  : 'Cancelar todos os ingressos válidos deste pedido?'
              }
              onCancel={() => setTarget(null)}
              onConfirm={async reason => {
                const r =
                  target.kind === 'ticket'
                    ? await api.admin.cancelTicket(target.id, reason)
                    : await api.admin.cancelOrderTickets(o.id, reason);
                setDone(`${r.cancelled} ingresso(s) cancelado(s). ${r.guidance}`);
                setTarget(null);
                retry();
              }}
            />
          ) : null}
        </>
      ) : null}
    </Gate>
  );
}

// ---------- eventos: estoque, compradores, ingressos e entradas (RF-57, RF-61) ----------

export function AdminEventsPage() {
  usePageTitle('Eventos · PartyX');
  const access = useAdmin('/admin/eventos');
  const [state, retry] = useFetch(s => api.admin.events(s), access === 'ok' ? 'events' : 'espera');
  return (
    <Gate access={access} active="eventos">
      <h1 className="px-h1">Eventos</h1>
      <Loading state={state} retry={retry} />
      {state.status === 'ok' ? (
        <ul className="px-tickets">
          {state.data.map(e => (
            <li key={e.id}>
              <Link to={`/admin/eventos/${e.id}`} className="px-ticketrow">
                <span>
                  <b>{e.name}</b>
                  <br />
                  <span className="px-muted">
                    {dateShort(e.startsAt)} · {timeOf(e.startsAt)} · {e.venue}
                  </span>
                </span>
                <span className="px-badge px-badge-neu">{e.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Gate>
  );
}

function LiveEntriesPanel({ eventId }: { eventId: string }) {
  const [data, setData] = useState<LiveEntries | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api.admin.entries(eventId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [eventId]);
  // Atualiza sozinho a cada 4 s enquanto a aba está visível.
  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, 4000);
    return () => clearInterval(id);
  }, [load]);
  const RESULT: Record<string, string> = {
    valido: 'Entrou',
    ja_utilizado: 'Já utilizado',
    invalido: 'Inválido',
    cancelado: 'Cancelado',
    outro_evento: 'Outro evento',
  };
  return (
    <section aria-label="Entradas ao vivo">
      {failed ? (
        <p className="px-notice px-notice-err" role="alert">
          Sem conexão com o servidor. Os números abaixo podem estar desatualizados.
        </p>
      ) : null}
      {data ? (
        <>
          <p className="px-gate-counter" role="status" aria-live="polite">
            <b className="px-gate-count">{data.counter.entered}</b> entradas{' '}
            <span className="px-muted">de {data.counter.total} ingressos</span>
          </p>
          <p className="px-small px-muted">Atualiza sozinho a cada 4 segundos · servidor {timeOf(data.serverTime)}</p>
          <ul className="px-gate-types">
            {data.byType.map(t => (
              <li key={t.typeName}>
                {t.typeName}: <b>{t.entered}</b>/{t.total}
              </li>
            ))}
          </ul>
          <p className="px-small">
            Tentativas:{' '}
            {Object.entries(data.attempts)
              .map(([k, v]) => `${RESULT[k] ?? k} ${v}`)
              .join(' · ') || 'nenhuma'}
          </p>
          {data.byValidator.length > 0 ? (
            <p className="px-small">Por validador: {data.byValidator.map(v => `${v.name} ${v.entered}`).join(' · ')}</p>
          ) : null}
          <h3 className="px-h3">Últimas leituras</h3>
          <TableWrap>
            <table className="px-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Resultado</th>
                  <th>Ingresso</th>
                  <th>Tipo</th>
                  <th>Titular</th>
                  <th>Validador</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r, i) => (
                  <tr key={i}>
                    <td>{timeOf(r.at)}</td>
                    <td>
                      <b>{RESULT[r.result] ?? r.result}</b>
                      {r.method === 'manual' ? ' (manual)' : ''}
                    </td>
                    <td className="px-mono">{r.shortCode ?? '—'}</td>
                    <td>{r.typeName ?? '—'}</td>
                    <td>{r.holderName ?? '—'}</td>
                    <td>{r.validator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </>
      ) : (
        <p aria-busy="true">Carregando…</p>
      )}
    </section>
  );
}

function TicketsPanel({ eventId }: { eventId: string }) {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams(
    Object.entries({ status, q: applied, page: String(page) }).filter(([, v]) => v && v !== '1'),
  ).toString();
  const [version, setVersion] = useState(0);
  const [state, retry] = useFetch(s => api.admin.tickets(eventId, query, s), `${eventId}|${query}|${version}`);
  const [target, setTarget] = useState<AdminTicketRow | null>(null);
  return (
    <section aria-label="Ingressos emitidos">
      <ExportLink
        path={`/admin/exports/events/${eventId}/tickets.csv`}
        query={new URLSearchParams(Object.entries({ status, q: applied }).filter(([, v]) => v)).toString()}
      />
      <form
        className="px-filters"
        onSubmit={e => {
          e.preventDefault();
          setApplied(q.trim());
          setPage(1);
        }}
        role="search"
      >
        <div className="px-field">
          <label htmlFor="t-st">Situação</label>
          <select
            id="t-st"
            value={status}
            onChange={e => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="valido">Válidos</option>
            <option value="utilizado">Utilizados</option>
            <option value="cancelado">Cancelados</option>
          </select>
        </div>
        <div className="px-field">
          <label htmlFor="t-q">Código, nome ou e-mail</label>
          <input id="t-q" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button type="submit" className="px-btn px-btn-pri">
          Buscar
        </button>
      </form>
      <Loading state={state} retry={retry} />
      {state.status === 'ok' ? (
        <>
          <TableWrap>
            <table className="px-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tipo</th>
                  <th>Titular</th>
                  <th>CPF</th>
                  <th>Pedido</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.data.rows.map(t => (
                  <tr key={t.id}>
                    <td className="px-mono">{t.shortCode}</td>
                    <td>{t.typeName}</td>
                    <td>
                      {t.holderName}
                      <br />
                      <span className="px-muted">{t.buyerEmail}</span>
                    </td>
                    <td>{t.buyerCpf ?? '—'}</td>
                    <td>
                      <Link to={`/admin/pedidos/${t.orderId}`}>PX-{t.orderNumber}</Link>
                    </td>
                    <td>
                      <span className={`px-badge px-badge-${TICKET_TONE[t.status]}`}>{TICKET_LABEL[t.status]}</span>
                      {t.usedAt ? (
                        <span className="px-muted">
                          {' '}
                          {timeOf(t.usedAt)} por {t.validatorName}
                        </span>
                      ) : null}
                      {t.cancelReason ? <span className="px-muted"> {t.cancelReason}</span> : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="px-btn"
                        disabled={t.status !== 'valido'}
                        onClick={() => setTarget(t)}
                      >
                        Cancelar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pager page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onPage={setPage} />
        </>
      ) : null}
      {target ? (
        <CancelDialog
          title={`Cancelar o ingresso ${target.shortCode}?`}
          onCancel={() => setTarget(null)}
          onConfirm={async reason => {
            await api.admin.cancelTicket(target.id, reason);
            setTarget(null);
            setVersion(v => v + 1);
          }}
        />
      ) : null}
    </section>
  );
}

function BuyersPanel({ eventId }: { eventId: string }) {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams(
    Object.entries({ q: applied, page: String(page) }).filter(([, v]) => v && v !== '1'),
  ).toString();
  const [state, retry] = useFetch(s => api.admin.buyers(eventId, query, s), `${eventId}|${query}`);
  return (
    <section aria-label="Compradores">
      <ExportLink
        path={`/admin/exports/events/${eventId}/buyers.csv`}
        query={new URLSearchParams(Object.entries({ q: applied }).filter(([, v]) => v)).toString()}
      />
      <form
        className="px-filters"
        onSubmit={e => {
          e.preventDefault();
          setApplied(q.trim());
          setPage(1);
        }}
        role="search"
      >
        <div className="px-field">
          <label htmlFor="b-q">Nome ou e-mail</label>
          <input id="b-q" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button type="submit" className="px-btn px-btn-pri">
          Buscar
        </button>
      </form>
      <Loading state={state} retry={retry} />
      {state.status === 'ok' ? (
        <>
          <TableWrap>
            <table className="px-table">
              <thead>
                <tr>
                  <th>Comprador</th>
                  <th>CPF</th>
                  <th>Pedidos</th>
                  <th>Ingressos</th>
                  <th>Cancelados</th>
                  <th>Entraram</th>
                  <th>Pago</th>
                </tr>
              </thead>
              <tbody>
                {state.data.rows.map(b => (
                  <tr key={b.id}>
                    <td>
                      {b.name}
                      <br />
                      <span className="px-muted">{b.email}</span>
                    </td>
                    <td>{b.cpf ?? '—'}</td>
                    <td>{b.orders}</td>
                    <td>{b.tickets}</td>
                    <td>{b.cancelled}</td>
                    <td>{b.entered}</td>
                    <td>{brl(b.paidCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pager page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onPage={setPage} />
        </>
      ) : null}
    </section>
  );
}

function ContingencyPanel({ eventId }: { eventId: string }) {
  const base = `/admin/exports/events/${eventId}/contingency`;
  return (
    <section aria-label="Contingência da portaria">
      <h2 className="px-h2">Lista para a portaria</h2>
      <p>
        Plano B em papel, caso a internet ou o sistema falhe no dia. <strong>Não substitui a validação:</strong> com o
        sistema no ar, a entrada é sempre pelo QR Code. A lista é um retrato do momento em que é gerada.
      </p>
      <p role="note" className="px-note">
        <strong>Gere e imprima no dia anterior ao evento</strong> (e de novo algumas horas antes da abertura, se houver
        vendas até a hora). Ingressos vendidos ou cancelados depois da geração não constam.
      </p>
      <ExportLink path={`${base}.pdf`} label="Baixar PDF para imprimir" />
      <ExportLink path={`${base}.csv`} label="Baixar planilha (CSV)" />
      <p className="px-muted">
        A lista tem nome e CPF mascarado. Guarde as folhas em local fechado, não fotografe nem compartilhe e destrua
        (picote) tudo depois do evento, inclusive os arquivos baixados. Cada download fica registrado em seu nome.
      </p>
    </section>
  );
}

export function AdminEventPage({ id }: { id: string }) {
  usePageTitle('Evento · PartyX');
  const access = useAdmin(`/admin/eventos/${id}`);
  const [events] = useFetch(s => api.admin.events(s), access === 'ok' ? 'events' : 'espera');
  const name = events.status === 'ok' ? events.data.find(e => e.id === id)?.name : undefined;
  const [tab, setTab] = useState<'entradas' | 'ingressos' | 'compradores' | 'contingencia'>('entradas');
  return (
    <Gate access={access} active="eventos">
      <p>
        <Link to="/admin/eventos">← Eventos</Link>
      </p>
      <h1 className="px-h1">{name ?? 'Evento'}</h1>
      <div className="px-tabs" role="tablist" aria-label="Seções do evento">
        {(['entradas', 'ingressos', 'compradores', 'contingencia'] as const).map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'entradas'
              ? 'Entradas ao vivo'
              : t === 'ingressos'
                ? 'Ingressos'
                : t === 'compradores'
                  ? 'Compradores'
                  : 'Contingência'}
          </button>
        ))}
      </div>
      {tab === 'entradas' ? <LiveEntriesPanel eventId={id} /> : null}
      {tab === 'ingressos' ? <TicketsPanel eventId={id} /> : null}
      {tab === 'compradores' ? <BuyersPanel eventId={id} /> : null}
      {tab === 'contingencia' ? <ContingencyPanel eventId={id} /> : null}
    </Gate>
  );
}
