import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  api,
  ApiError,
  type DuplicateChargeCase,
  type PaidWithoutStockCase,
  type AdminOrderDetail,
  type AdminTicketRow,
  type LiveEntries,
  type OrderStatus,
  type SalesGroup,
} from './api';
import { Layout, usePageTitle } from './components';
import { brl, dateShort, timeOf } from './format';
import { IconBack, IconClose, IconMenu } from './icons';
import { animate, useReducedMotion } from 'motion/react';
import { EASE_OUT } from './motion';
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

export type AdminTab =
  | 'geral'
  | 'pedidos'
  | 'eventos'
  | 'compradores'
  | 'ingressos'
  | 'promoters'
  | 'relatorios'
  | 'entradas'
  | 'equipe'
  | 'excecoes'
  | 'conta';

/** Avisa o painel de que a lista de exceções mudou (um caso foi tratado), para o contador do alerta se atualizar. */
const EXCEPTIONS_CHANGED = 'px-excecoes-mudaram';

/**
 * Casos de pagamento aprovado sem ingresso ainda não tratados. Alimenta o contador da aba e o alerta que fica em todas as páginas do
 * painel até cada caso ser marcado como tratado. Falha ao buscar não bloqueia o painel (o alerta só não aparece).
 */
function useOpenExceptions(): { semEstoque: number; duplicadas: number } {
  const [open, setOpen] = useState({ semEstoque: 0, duplicadas: 0 });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    window.addEventListener(EXCEPTIONS_CHANGED, bump);
    return () => window.removeEventListener(EXCEPTIONS_CHANGED, bump);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api.admin
      .paymentExceptions(controller.signal)
      .then(r => setOpen({ semEstoque: r.abertos, duplicadas: r.duplicadasAbertas ?? 0 }))
      .catch(() => {});
    return () => controller.abort();
  }, [version]);
  return open;
}

const NAV: { tab: AdminTab; label: string; to: string }[] = [
  { tab: 'geral', label: 'Visão geral', to: '/admin' },
  { tab: 'eventos', label: 'Eventos', to: '/admin/eventos' },
  { tab: 'pedidos', label: 'Pedidos', to: '/admin/pedidos' },
  { tab: 'compradores', label: 'Compradores', to: '/admin/compradores' },
  { tab: 'ingressos', label: 'Ingressos', to: '/admin/ingressos' },
  { tab: 'promoters', label: 'Promoters', to: '/admin/promoters' },
];
const REPORTS: { label: string; to: string }[] = [
  { label: 'Vendas', to: '/admin/relatorios/vendas' },
  { label: 'Promoters (ranking)', to: '/admin/relatorios/promoters' },
  { label: 'Taxa mensal', to: '/admin/relatorios/taxa-mensal' },
];
const NAV_END: { tab: AdminTab; label: string; to: string }[] = [
  { tab: 'entradas', label: 'Entradas', to: '/admin/entradas' },
  { tab: 'equipe', label: 'Equipe', to: '/admin/equipe' },
];

/** Itens do painel: no computador, coluna lateral; no celular, dentro da gaveta. */
function AdminNav({ active, open, onNavigate }: { active: AdminTab; open: number; onNavigate?: () => void }) {
  const { loc } = useRouter();
  const session = useSession();
  const { go } = useRouter();
  const item = (tab: AdminTab, label: string, to: string, extra?: ReactNode) => (
    <li key={to}>
      <Link to={to} aria-current={active === tab ? 'page' : undefined} onClick={onNavigate}>
        {label}
        {extra}
      </Link>
    </li>
  );
  return (
    <nav className="px-adm-nav" aria-label="Painel">
      <ul>
        {NAV.map(n => item(n.tab, n.label, n.to))}
        <li>
          <span className={`px-adm-nav-group${active === 'relatorios' ? ' px-adm-nav-group-on' : ''}`}>Relatórios</span>
          <ul>
            {REPORTS.map(r => (
              <li key={r.to}>
                <Link to={r.to} aria-current={loc.path === r.to ? 'page' : undefined} onClick={onNavigate}>
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </li>
        {NAV_END.map(n => item(n.tab, n.label, n.to))}
        {item(
          'excecoes',
          'Exceções',
          '/admin/excecoes',
          open > 0 ? (
            <span className="px-badge px-badge-err" aria-label={`${open} em aberto`}>
              {open}
            </span>
          ) : null,
        )}
      </ul>
      <ul className="px-adm-nav-foot">
        {item('conta', 'Minha conta', '/admin/conta')}
        <li>
          <button
            type="button"
            className="px-adm-nav-out"
            onClick={() => {
              onNavigate?.();
              void session.logout().then(() => go('/', { force: true }));
            }}
          >
            Sair
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Painel administrativo: menu lateral no computador e gaveta no celular (o botão "Menu do painel" abre). */
function AdminShell({ children, active }: { children: ReactNode; active: AdminTab }) {
  const pending = useOpenExceptions();
  const open = pending.semEstoque + pending.duplicadas;
  const [drawer, setDrawer] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const label =
    [...NAV, ...NAV_END, { tab: 'excecoes', label: 'Exceções' }, { tab: 'conta', label: 'Minha conta' }].find(
      n => n.tab === active,
    )?.label ?? (active === 'relatorios' ? 'Relatórios' : 'Painel');
  useEffect(() => {
    if (!drawer) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [drawer]);
  return (
    <Layout>
      <div className="px-wrap px-adm-layout">
        <aside className="px-adm-side">
          <AdminNav active={active} open={open} />
        </aside>
        <div className="px-adm-main">
          <div className="px-adm-mobilebar">
            <button
              type="button"
              className="px-btn"
              aria-expanded={drawer}
              aria-controls="px-adm-drawer"
              onClick={() => setDrawer(true)}
            >
              <IconMenu size={18} />
              Menu do painel
            </button>
            <span className="px-adm-where">
              {label}
              {open > 0 ? (
                <span className="px-badge px-badge-err">
                  {open} {open === 1 ? 'exceção' : 'exceções'}
                </span>
              ) : null}
            </span>
          </div>
          {open > 0 && active !== 'excecoes' ? (
            <p className="px-notice px-notice-err" role="alert">
              {pending.semEstoque > 0 ? (
                <>
                  <b>{pending.semEstoque}</b> {pending.semEstoque === 1 ? 'pagamento aprovado' : 'pagamentos aprovados'}{' '}
                  sem ingresso disponível
                </>
              ) : null}
              {pending.semEstoque > 0 && pending.duplicadas > 0 ? ' e ' : null}
              {pending.duplicadas > 0 ? (
                <>
                  <b>{pending.duplicadas}</b> {pending.duplicadas === 1 ? 'cobrança em dobro' : 'cobranças em dobro'}
                </>
              ) : null}{' '}
              {open === 1 ? 'aguarda' : 'aguardam'} tratamento: o estorno é feito pela PartyX no gateway.{' '}
              <Link to="/admin/excecoes">Ver exceções</Link>
            </p>
          ) : null}
          {children}
        </div>
      </div>
      {drawer ? (
        <div className="px-drawer-bg" onClick={() => setDrawer(false)}>
          <div
            id="px-adm-drawer"
            className="px-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu do painel"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-drawer-head">
              <b>Painel</b>
              <button
                ref={closeRef}
                type="button"
                className="px-icon-btn"
                aria-label="Fechar menu do painel"
                onClick={() => setDrawer(false)}
              >
                <IconClose />
              </button>
            </div>
            <AdminNav active={active} open={open} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      ) : null}
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
  const session = useSession();
  if (access === 'negado') {
    return (
      <Layout>
        <div className="px-wrap px-narrow">
          <div className="px-box">
            <h1 className="px-h2">Acesso negado</h1>
            <p>Esta área é só para administradores.</p>
            <Link to={session.user?.role === 'validador' ? '/portaria' : '/minha-conta'} className="px-btn px-btn-pri">
              Ir para minha área
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
  // Esqueleto de tabela (G01): reserva a altura e mostra a forma do que vem, sem texto piscando.
  if (state.status === 'loading')
    return (
      <div className="px-table-skel" aria-busy="true" aria-label="Carregando">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
    );
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

/** Número que conta de 0 até o valor na primeira exibição (indicadores do painel). Depois, troca direto. */
function useCountUp(target: number, duration = 0.7): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  const done = useRef(false);
  useEffect(() => {
    if (reduce || done.current) {
      setValue(target);
      return;
    }
    done.current = true;
    const controls = animate(0, target, { duration, ease: EASE_OUT, onUpdate: v => setValue(Math.round(v)) });
    return () => controls.stop();
  }, [target, duration, reduce]);
  return value;
}

/** Valor que conta de zero até o total na primeira carga; o leitor de tela recebe só o valor final. */
function KpiMoney({ cents }: { cents: number }) {
  const shown = useCountUp(cents);
  return (
    <span>
      <span aria-hidden="true">{brl(shown)}</span>
      <span className="px-sr">{brl(cents)}</span>
    </span>
  );
}

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
        <KpiMoney cents={group.paid.cents} />
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
          {/* O alerta de pagamento sem estoque fica no topo de todas as páginas do painel (AdminShell). */}
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
/**
 * Exportação reutilizável (ADM23): gera o arquivo na hora com os filtros desta tela (o caminho e a consulta vêm de quem chama),
 * com estados "gerando", "concluído" e "falha", e mostra a data e a hora da geração: é um retrato daquele momento.
 * O download sai do próprio navegador (sem URL pública); a API exige sessão de administrador e registra cada geração.
 */
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
  const pdf = path.endsWith('.pdf');
  const [state, setState] = useState<
    { s: 'idle' } | { s: 'busy' } | { s: 'ok'; at: Date; file: string } | { s: 'err'; message: string }
  >({ s: 'idle' });
  // Filtros mudaram: o arquivo gerado antes já não corresponde à tela.
  useEffect(() => setState({ s: 'idle' }), [href]);
  const run = async () => {
    setState({ s: 'busy' });
    try {
      const res = await fetch(href, { headers: { accept: pdf ? 'application/pdf' : 'text/csv' } });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { erro?: { mensagem?: string } } | null;
        throw new Error(data?.erro?.mensagem ?? 'Não foi possível gerar o arquivo.');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') ?? '';
      const file = /filename="([^"]+)"/.exec(disposition)?.[1] ?? (pdf ? 'exportacao.pdf' : 'exportacao.csv');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState({ s: 'ok', at: new Date(), file });
    } catch (err) {
      setState({
        s: 'err',
        message:
          err instanceof TypeError ? 'Sem conexão. Verifique a internet e tente de novo.' : (err as Error).message,
      });
    }
  };
  return (
    <div className="px-export">
      <button
        type="button"
        className="px-btn"
        onClick={run}
        disabled={state.s === 'busy'}
        aria-describedby={`${path}-st`}
      >
        {state.s === 'busy' ? 'Gerando…' : label}
      </button>{' '}
      <span id={`${path}-st`} className="px-small" role="status" aria-live="polite">
        {state.s === 'idle' ? (
          <span className="px-muted">
            {pdf ? 'PDF para imprimir' : 'Planilha para o Excel (UTF-8, separador “;”)'}, com os filtros desta tela.
          </span>
        ) : state.s === 'busy' ? (
          'Gerando o arquivo…'
        ) : state.s === 'ok' ? (
          <>
            <b>Concluído:</b> {state.file}, gerado em {dateShort(state.at.toISOString())} às{' '}
            {state.at.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. É um retrato deste momento: o que
            mudar depois não entra.
          </>
        ) : (
          <span className="px-error">
            Falha: {state.message}{' '}
            <button type="button" className="px-link" onClick={run}>
              Tentar de novo
            </button>
          </span>
        )}
      </span>
    </div>
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
export function CancelDialog({
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
        <Link to="/admin/pedidos" className="px-textlink px-textlink-sm">
          <IconBack size={18} />
          Pedidos
        </Link>
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
              no painel do gateway. A plataforma não estorna sozinha. <Link to="/admin/excecoes">Ver em Exceções</Link>
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
              <dd>{o.paidAt ? `${dateShort(o.paidAt)} ${timeOf(o.paidAt)}` : 'Não pago'}</dd>
            </div>
            <div>
              <dt>Id no gateway</dt>
              <dd className="px-mono">{o.gatewayPaymentId ?? 'Sem referência'}</dd>
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
                {a.reason ? <span className="px-muted">: {a.reason}</span> : null}
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

export function LiveEntriesPanel({ eventId }: { eventId: string }) {
  const [data, setData] = useState<LiveEntries | null>(null);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api.admin.entries(eventId));
      setFailed(false);
      setUpdatedAt(new Date());
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
      <p className="px-small" role="status" aria-live="polite">
        <span className={`px-badge ${failed ? 'px-badge-err' : 'px-badge-ok'}`}>
          {failed ? 'Sem conexão: tentando de novo' : 'Conectado'}
        </span>{' '}
        Atualiza sozinho a cada 4 segundos.{' '}
        {updatedAt
          ? `Última atualização: ${updatedAt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`
          : 'Carregando…'}
      </p>
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
          <p className="px-small">
            Ainda não entraram: <b>{Math.max(0, data.counter.total - data.counter.entered)}</b> · horário do servidor{' '}
            {timeOf(data.serverTime)}. Leituras repetidas ou inválidas não contam como entrada.
          </p>
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
                    <td className="px-mono">{r.shortCode ?? 'Sem código'}</td>
                    <td>{r.typeName ?? 'Não identificado'}</td>
                    <td>{r.holderName ?? 'Não identificado'}</td>
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

export function TicketsPanel({ eventId }: { eventId: string }) {
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
                    <td className="px-mono">
                      <Link to={`/admin/ingressos/${t.id}`}>{t.shortCode}</Link>
                    </td>
                    <td>{t.typeName}</td>
                    <td>
                      {t.holderName}
                      <br />
                      <span className="px-muted">{t.buyerEmail}</span>
                    </td>
                    <td>{t.buyerCpf ?? 'Não informado'}</td>
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

export function BuyersPanel({ eventId }: { eventId: string }) {
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
                    <td>{b.cpf ?? 'Não informado'}</td>
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

export function ContingencyPanel({ eventId }: { eventId: string }) {
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

// ---------- exceções: pagamento aprovado sem ingresso disponível (seção 10.1; D-13 pendente) ----------

export function AdminExceptionsPage() {
  usePageTitle('Exceções de pagamento · PartyX');
  const access = useAdmin('/admin/excecoes');
  const [state, retry] = useFetch(s => api.admin.paymentExceptions(s), access === 'ok' ? 'excecoes' : 'espera');
  const [target, setTarget] = useState<PaidWithoutStockCase | null>(null);
  const [dupTarget, setDupTarget] = useState<DuplicateChargeCase | null>(null);
  const [done, setDone] = useState('');
  const data = state.status === 'ok' ? state.data : null;
  const open = data?.semEstoque.filter(c => !c.treated) ?? [];
  const treated = data?.semEstoque.filter(c => c.treated) ?? [];
  const dupOpen = data?.cobrancasDuplicadas.filter(c => !c.treated) ?? [];
  const dupTreated = data?.cobrancasDuplicadas.filter(c => c.treated) ?? [];
  const changed = (message: string) => {
    setDone(message);
    window.dispatchEvent(new Event(EXCEPTIONS_CHANGED));
    retry();
  };
  return (
    <Gate access={access} active="excecoes">
      <h1 className="px-h1">Exceções de pagamento</h1>
      <p>
        Pagamentos aprovados pelo gateway depois do fim da reserva, quando os ingressos já tinham sido vendidos. Nenhum
        ingresso foi emitido. O estorno é feito pela PartyX no painel do gateway; a plataforma não estorna. Depois de
        tratar, marque o caso como tratado informando o motivo.
      </p>
      {done ? (
        <p className="px-notice px-notice-info" role="status">
          {done}
        </p>
      ) : null}
      <Loading state={state} retry={retry} />
      {data ? (
        <>
          <h2 className="px-h3">Em aberto ({open.length})</h2>
          {open.length === 0 ? <p className="px-muted">Nenhum caso em aberto.</p> : null}
          {open.length > 0 ? <ExceptionTable rows={open} onTreat={setTarget} /> : null}
          {treated.length > 0 ? (
            <>
              <h2 className="px-h3">Tratados ({treated.length})</h2>
              <ExceptionTable rows={treated} />
            </>
          ) : null}
          <h2 className="px-h2">Cobranças em dobro</h2>
          <p>
            Um mesmo pedido foi cobrado duas vezes no gateway. Os ingressos são emitidos uma vez só, pela cobrança que
            vale para o pedido. A PartyX estorna a cobrança em dobro no painel do gateway, usando a referência abaixo, e
            depois marca o caso como tratado.
          </p>
          <h3 className="px-h3">Em aberto ({dupOpen.length})</h3>
          {dupOpen.length === 0 ? <p className="px-muted">Nenhuma cobrança em dobro em aberto.</p> : null}
          {dupOpen.length > 0 ? <DuplicateChargeTable rows={dupOpen} onTreat={setDupTarget} /> : null}
          {dupTreated.length > 0 ? (
            <>
              <h3 className="px-h3">Tratadas ({dupTreated.length})</h3>
              <DuplicateChargeTable rows={dupTreated} />
            </>
          ) : null}
        </>
      ) : null}
      {target ? (
        <TreatDialog
          title={`Marcar o pedido PX-${target.number} como tratado`}
          note="A marcação só registra que o caso foi tratado. O pedido continua como pago sem estoque, nenhum estorno é feito pela plataforma e o relatório da taxa não muda."
          onCancel={() => setTarget(null)}
          onConfirm={async reason => {
            await api.admin.treatException(target.orderId, reason);
            setTarget(null);
            changed(`Pedido PX-${target.number} marcado como tratado.`);
          }}
        />
      ) : null}
      {dupTarget ? (
        <TreatDialog
          title={`Marcar a cobrança em dobro do pedido PX-${dupTarget.number} como tratada`}
          note="A marcação só registra que o caso foi tratado. O pedido e os ingressos não mudam, nenhum estorno é feito pela plataforma e o relatório da taxa não muda."
          onCancel={() => setDupTarget(null)}
          onConfirm={async reason => {
            await api.admin.treatDuplicateCharge(dupTarget.orderId, dupTarget.duplicateRef, reason);
            setDupTarget(null);
            changed(`Cobrança em dobro do pedido PX-${dupTarget.number} marcada como tratada.`);
          }}
        />
      ) : null}
    </Gate>
  );
}

function ExceptionTable({
  rows,
  onTreat,
}: {
  rows: PaidWithoutStockCase[];
  onTreat?: (c: PaidWithoutStockCase) => void;
}) {
  return (
    <TableWrap>
      <table className="px-table">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Comprador</th>
            <th>Valor</th>
            <th>Aprovado em</th>
            <th>Referência no gateway</th>
            <th>{onTreat ? 'Ação' : 'Tratamento'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.orderId}>
              <td>
                <Link to={`/admin/pedidos/${c.orderId}`}>PX-{c.number}</Link>
                <br />
                <span className="px-small px-muted">{c.event}</span>
              </td>
              <td>
                {c.buyerName}
                <br />
                <span className="px-small px-muted">{c.buyerEmail}</span>
              </td>
              <td>{brl(c.totalCents)}</td>
              <td>{c.paidAt ? `${dateShort(c.paidAt)} ${timeOf(c.paidAt)}` : 'não informado'}</td>
              <td>
                <code>{c.gatewayRef ?? 'não informada'}</code>
              </td>
              <td>
                {c.treated ? (
                  <>
                    {dateShort(c.treated.at)} {timeOf(c.treated.at)}
                    {c.treated.by ? ` por ${c.treated.by}` : ''}
                    <br />
                    <span className="px-small px-muted">{c.treated.reason}</span>
                  </>
                ) : onTreat ? (
                  <button type="button" className="px-btn" onClick={() => onTreat(c)}>
                    Marcar como tratado
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

const GATEWAY_STATUS: Record<string, string> = {
  aprovado: 'aprovada',
  pendente: 'em aberto',
  estornado: 'estornada',
  contestado: 'contestada',
};

function DuplicateChargeTable({
  rows,
  onTreat,
}: {
  rows: DuplicateChargeCase[];
  onTreat?: (c: DuplicateChargeCase) => void;
}) {
  return (
    <TableWrap>
      <table className="px-table">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Comprador</th>
            <th>Valor do pedido</th>
            <th>Detectada em</th>
            <th>Cobrança em dobro (estornar)</th>
            <th>Cobrança do pedido</th>
            <th>{onTreat ? 'Ação' : 'Tratamento'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={`${c.orderId}:${c.duplicateRef}`}>
              <td>
                <Link to={`/admin/pedidos/${c.orderId}`}>PX-{c.number}</Link>
                <br />
                <span className="px-small px-muted">{c.event}</span>
              </td>
              <td>
                {c.buyerName}
                <br />
                <span className="px-small px-muted">{c.buyerEmail}</span>
              </td>
              <td>{brl(c.totalCents)}</td>
              <td>
                {dateShort(c.detectedAt)} {timeOf(c.detectedAt)}
              </td>
              <td>
                <code>{c.duplicateRef}</code>
                {c.duplicateStatus ? (
                  <>
                    <br />
                    <span className="px-small px-muted">
                      {GATEWAY_STATUS[c.duplicateStatus] ?? c.duplicateStatus} quando detectada
                    </span>
                  </>
                ) : null}
              </td>
              <td>
                <code>{c.gatewayRef ?? 'não informada'}</code>
              </td>
              <td>
                {c.treated ? (
                  <>
                    {dateShort(c.treated.at)} {timeOf(c.treated.at)}
                    {c.treated.by ? ` por ${c.treated.by}` : ''}
                    <br />
                    <span className="px-small px-muted">{c.treated.reason}</span>
                  </>
                ) : onTreat ? (
                  <button type="button" className="px-btn" onClick={() => onTreat(c)}>
                    Marcar como tratada
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

/** Marcação de "tratado": motivo obrigatório, que fica na trilha de auditoria. Não estorna nem muda o pedido. */
function TreatDialog({
  title,
  note,
  onCancel,
  onConfirm,
}: {
  title: string;
  note: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
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
      setError(err instanceof ApiError ? (err.fields.reason ?? err.message) : 'Não foi possível marcar como tratado.');
      setBusy(false);
    }
  };
  return (
    <div className="px-modal-bg" onClick={onCancel}>
      <form
        className="px-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="treat-title"
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
      >
        <h2 id="treat-title" className="px-h3">
          {title}
        </h2>
        <p>{note}</p>
        <div className="px-field">
          <label htmlFor="motivo-tratado">Motivo (fica na trilha de auditoria)</label>
          <textarea
            id="motivo-tratado"
            ref={first}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
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
          <button type="submit" className="px-btn px-btn-pri" disabled={busy || reason.trim().length < 5}>
            {busy ? 'Salvando…' : 'Marcar como tratado'}
          </button>
        </div>
      </form>
    </div>
  );
}
