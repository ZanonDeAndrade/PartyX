import { Fragment, useState, type ReactNode } from 'react';
import { api } from './api';
import { ExportLink, Gate, Loading, Pager, TableWrap, useAdmin } from './adminPages';
import { usePageTitle } from './components';
import { brl, dateShort, timeOf } from './format';
import { Link } from './router';
import { useFetch } from './useFetch';

/** Hoje e o primeiro dia do mês, no fuso do evento (Brasília), em AAAA-MM-DD. */
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const monthStart = () => `${todayKey().slice(0, 8)}01`;

function ReportNav({ active }: { active: 'vendas' | 'promoters' | 'taxa' }) {
  return (
    <nav className="px-subnav px-subnav-2" aria-label="Relatórios">
      <Link to="/admin/relatorios/vendas" aria-current={active === 'vendas' ? 'page' : undefined}>
        Vendas
      </Link>
      <Link to="/admin/relatorios/promoters" aria-current={active === 'promoters' ? 'page' : undefined}>
        Promoters
      </Link>
      <Link to="/admin/relatorios/taxa-mensal" aria-current={active === 'taxa' ? 'page' : undefined}>
        Taxa mensal
      </Link>
    </nav>
  );
}

function Note({ tone = 'neu', children }: { tone?: 'neu' | 'info' | 'err' | 'ok'; children: ReactNode }) {
  return (
    <p className={`px-notice px-notice-${tone}`} role="note">
      {children}
    </p>
  );
}

// ---------- vendas por evento e tipo (RF-58) ----------

export function SalesReportPage() {
  usePageTitle('Relatório de vendas · PartyX');
  const access = useAdmin('/admin/relatorios/vendas');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayKey());
  const [eventId, setEventId] = useState('');
  const query = new URLSearchParams(Object.entries({ from, to, eventId }).filter(([, v]) => v)).toString();
  const [events] = useFetch(s => api.admin.events(s), access === 'ok' ? 'events' : 'espera');
  const [state, retry] = useFetch(s => api.admin.salesReport(query, s), access === 'ok' ? `vendas|${query}` : 'espera');
  const r = state.status === 'ok' ? state.data : null;
  const max = r ? Math.max(1, ...r.daily.map(d => d.cents)) : 1;
  return (
    <Gate access={access} active="relatorios">
      <ReportNav active="vendas" />
      <h1 className="px-h1">Relatório de vendas</h1>
      <ExportLink path="/admin/exports/sales.csv" query={query} />
      <form className="px-filters" onSubmit={e => e.preventDefault()} aria-label="Filtros do relatório">
        <div className="px-field">
          <label htmlFor="r-ev">Evento</label>
          <select id="r-ev" value={eventId} onChange={e => setEventId(e.target.value)}>
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
          <label htmlFor="r-de">De</label>
          <input id="r-de" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="px-field">
          <label htmlFor="r-ate">Até</label>
          <input id="r-ate" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </form>
      <Loading state={state} retry={retry} />
      {r ? (
        <>
          <Note>{r.criterion}</Note>
          <div className="px-kpis">
            <section className="px-panel" aria-label="Total vendido">
              <h2 className="px-h3">Vendido no período</h2>
              <p className="px-kpi">
                {brl(r.totals.cents)}
                <small>{r.totals.tickets} ingressos, sem a taxa de serviço</small>
              </p>
              <ul className="px-minilist">
                <li>
                  Desconto dos códigos de promoter: <b>{brl(r.totals.discountCents ?? 0)}</b>
                </li>
                <li>
                  Valor líquido dos ingressos: <b>{brl(r.totals.netCents ?? r.totals.cents)}</b>
                </li>
                <li>
                  Taxa de serviço: <b>{brl(r.totals.serviceFeeCents ?? 0)}</b>
                </li>
                <li>
                  Total cobrado dos compradores: <b>{brl(r.totals.chargedCents ?? r.totals.cents)}</b>
                </li>
              </ul>
              <p className={r.reconciliation.ok === false ? 'px-error' : 'px-ok'}>
                {r.reconciliation.ok === false
                  ? `Atenção: os itens somam ${brl(r.reconciliation.itemsCents)}, o desconto ${brl(r.reconciliation.discountCents ?? 0)}, a taxa de serviço ${brl(r.reconciliation.serviceFeeCents ?? 0)} e os pedidos pagos ${brl(r.reconciliation.ordersCents)}.`
                  : `Confere com a soma de ${r.reconciliation.orders} pedido(s) pago(s): ${brl(r.reconciliation.ordersCents)}.`}
              </p>
            </section>
            <section className="px-panel" aria-label="Taxa de serviço e tarifa do Mercado Pago">
              <h2 className="px-h3">Taxa de serviço x tarifa do Mercado Pago</h2>
              {r.totals.gatewayFeeCents === null || r.totals.gatewayFeeCents === undefined ? (
                <p className="px-muted">A tarifa é do pedido inteiro: não se divide por tipo de ingresso.</p>
              ) : (
                <>
                  <p className="px-kpi">
                    {brl((r.totals.serviceFeeCents ?? 0) - r.totals.gatewayFeeCents)}
                    <small>
                      {(r.totals.serviceFeeCents ?? 0) >= r.totals.gatewayFeeCents
                        ? '= taxa cobrada menos a tarifa paga (a taxa cobriu a tarifa)'
                        : '= taxa cobrada menos a tarifa paga (a taxa não cobriu a tarifa)'}
                    </small>
                  </p>
                  <ul className="px-minilist">
                    <li>
                      Taxa de serviço cobrada: <b>{brl(r.totals.serviceFeeCents ?? 0)}</b>
                    </li>
                    <li>
                      Tarifa do Mercado Pago: <b>{brl(r.totals.gatewayFeeCents)}</b>
                    </li>
                    <li>
                      Líquido recebido do Mercado Pago: <b>{brl(r.totals.gatewayNetCents ?? 0)}</b>
                    </li>
                    {r.totals.ordersWithoutGatewayFee ? (
                      <li>
                        Pedidos pagos ainda sem a tarifa informada: <b>{r.totals.ordersWithoutGatewayFee}</b> (a rotina diária
                        consulta)
                      </li>
                    ) : null}
                  </ul>
                </>
              )}
            </section>
            <section className="px-panel" aria-label="Receita líquida">
              <h2 className="px-h3">Receita líquida</h2>
              <p className="px-kpi">
                {brl(r.reversals.netCents)}
                <small>= vendas pagas, sem estornos e contestações</small>
              </p>
              <ul className="px-minilist">
                <li>
                  Bruta (inclui devolvidos): <b>{brl(r.reversals.grossCents)}</b>
                </li>
                <li>
                  Estornados: <b>{r.reversals.refunded.orders}</b> pedido(s) · {brl(r.reversals.refunded.cents)}
                </li>
                <li>
                  Contestados: <b>{r.reversals.contested.orders}</b> pedido(s) · {brl(r.reversals.contested.cents)}
                </li>
              </ul>
            </section>
          </div>
          {r.exceptions.paidWithoutStock.orders > 0 ? (
            <Note tone="err">
              {r.exceptions.paidWithoutStock.orders} pagamento(s) aprovado(s) sem estoque (
              {brl(r.exceptions.paidWithoutStock.cents)}) ficam fora das vendas: o cliente estorna no gateway.
            </Note>
          ) : null}

          <h2 className="px-h3">Por evento e tipo de ingresso</h2>
          {r.lines.length === 0 ? <p className="px-box">Nenhuma venda paga neste período.</p> : null}
          <TableWrap>
            <table className="px-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Tipo</th>
                  <th>Ingressos</th>
                  <th>Valor dos ingressos</th>
                  <th>Desconto</th>
                  <th>Valor líquido</th>
                  <th>Taxa de serviço</th>
                  <th>Total cobrado</th>
                </tr>
              </thead>
              <tbody>
                {r.lines.map(l => {
                  // Vendas por lote (0013), logo abaixo do tipo; o "Lote único" não abre linhas.
                  const lots = (l.lots ?? []).some(x => x.lotName !== 'Lote único') ? (l.lots ?? []) : [];
                  return (
                    <Fragment key={l.typeId}>
                      <tr>
                        <td>{l.eventName}</td>
                        <td>{l.typeName}</td>
                        <td>{l.tickets}</td>
                        <td className="px-nowrap">{brl(l.cents)}</td>
                        <td className="px-nowrap">{brl(l.discountCents ?? 0)}</td>
                        <td className="px-nowrap">{brl(l.netCents ?? l.cents)}</td>
                        <td className="px-nowrap">{brl(l.serviceFeeCents ?? 0)}</td>
                        <td className="px-nowrap">{brl((l.netCents ?? l.cents) + (l.serviceFeeCents ?? 0))}</td>
                      </tr>
                      {lots.map(x => (
                        <tr key={x.lotId} className="px-lot-row">
                          <td aria-hidden="true" />
                          <td>
                            <span className="px-sr">{l.typeName}, </span>
                            {x.lotName}
                          </td>
                          <td>{x.tickets}</td>
                          <td className="px-nowrap">{brl(x.cents)}</td>
                          <td className="px-nowrap">{brl(x.discountCents ?? 0)}</td>
                          <td className="px-nowrap">{brl(x.netCents ?? x.cents)}</td>
                          <td className="px-nowrap">{brl(x.serviceFeeCents ?? 0)}</td>
                          <td className="px-nowrap">{brl((x.netCents ?? x.cents) + (x.serviceFeeCents ?? 0))}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                {r.byEvent.length > 1
                  ? r.byEvent.map(e => (
                      <tr key={`s${e.eventId}`} className="px-subtotal">
                        <th scope="row" colSpan={2}>
                          Subtotal · {e.eventName}
                        </th>
                        <td>{e.tickets}</td>
                        <td className="px-nowrap">{brl(e.cents)}</td>
                        <td className="px-nowrap">{brl(e.discountCents ?? 0)}</td>
                        <td className="px-nowrap">{brl(e.netCents ?? e.cents)}</td>
                        <td className="px-nowrap">{brl(e.serviceFeeCents ?? 0)}</td>
                        <td className="px-nowrap">{brl(e.chargedCents ?? e.cents)}</td>
                      </tr>
                    ))
                  : null}
                <tr className="px-total-row">
                  <th scope="row" colSpan={2}>
                    Total
                  </th>
                  <td>
                    <b>{r.totals.tickets}</b>
                  </td>
                  <td className="px-nowrap">
                    <b>{brl(r.totals.cents)}</b>
                  </td>
                  <td className="px-nowrap">
                    <b>{brl(r.totals.discountCents ?? 0)}</b>
                  </td>
                  <td className="px-nowrap">
                    <b>{brl(r.totals.netCents ?? r.totals.cents)}</b>
                  </td>
                  <td className="px-nowrap">
                    <b>{brl(r.totals.serviceFeeCents ?? 0)}</b>
                  </td>
                  <td className="px-nowrap">
                    <b>{brl(r.totals.chargedCents ?? r.totals.cents)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </TableWrap>

          {r.daily.length > 0 ? (
            <section aria-labelledby="dia">
              <h2 id="dia" className="px-h3">
                Por dia
              </h2>
              <ul className="px-bars">
                {r.daily.map(d => (
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
          ) : null}
          {r.notes.map(n => (
            <p key={n} className="px-small px-muted">
              {n}
            </p>
          ))}
        </>
      ) : null}
    </Gate>
  );
}

// ---------- promoters (RF-59) ----------

export function PromoterReportPage() {
  usePageTitle('Promoters · PartyX');
  const access = useAdmin('/admin/relatorios/promoters');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [eventId, setEventId] = useState('');
  const [metric, setMetric] = useState<'qtd' | 'valor'>('qtd');
  const query = new URLSearchParams(Object.entries({ from, to, eventId, metric }).filter(([, v]) => v)).toString();
  const [events] = useFetch(s => api.admin.events(s), access === 'ok' ? 'events' : 'espera');
  const [state, retry] = useFetch(
    s => api.admin.promoterRanking(query, s),
    access === 'ok' ? `rank|${query}` : 'espera',
  );
  const r = state.status === 'ok' ? state.data : null;
  // Por valor, o ranking usa o valor líquido (valor atribuído menos o desconto do código, D-91).
  const valueOf = (p: { cents: number; netCents?: number }) => p.netCents ?? p.cents;
  const top = r ? Math.max(1, ...r.ranking.map(p => (metric === 'qtd' ? p.tickets : valueOf(p)))) : 1;
  return (
    <Gate access={access} active="relatorios">
      <ReportNav active="promoters" />
      <h1 className="px-h1">Ranking de promoters</h1>
      <ExportLink path="/admin/exports/promoters.csv" query={query} />
      <form className="px-filters" onSubmit={e => e.preventDefault()} aria-label="Filtros do ranking">
        <div className="px-field">
          <label htmlFor="p-ev">Evento</label>
          <select id="p-ev" value={eventId} onChange={e => setEventId(e.target.value)}>
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
          <label htmlFor="p-de">De</label>
          <input id="p-de" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="px-field">
          <label htmlFor="p-ate">Até</label>
          <input id="p-ate" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="px-field">
          <label htmlFor="p-m">Ordenar por</label>
          <select id="p-m" value={metric} onChange={e => setMetric(e.target.value as 'qtd' | 'valor')}>
            <option value="qtd">Quantidade de ingressos</option>
            <option value="valor">Valor líquido</option>
          </select>
        </div>
      </form>
      <Loading state={state} retry={retry} />
      {r ? (
        <>
          <Note>{r.criterion}</Note>
          {r.ranking.length === 0 ? <p className="px-box">Nenhum promoter cadastrado.</p> : null}
          <TableWrap>
            <table className="px-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Promoter</th>
                  <th aria-label="Participação" />
                  <th>Ingressos</th>
                  <th>Valor atribuído</th>
                  <th>Desconto concedido</th>
                  <th>Valor líquido</th>
                  <th>Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {r.ranking.map(p => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.position}º</b>
                    </td>
                    <td>
                      <Link to={`/admin/promoters/${p.id}`}>{p.name}</Link>
                      <br />
                      <span className="px-muted">
                        <span className="px-mono">{p.code}</span>
                        {p.isActive ? '' : ' · inativo'}
                      </span>
                    </td>
                    <td className="px-bar-cell" aria-hidden="true">
                      <span className="px-bars-track">
                        <span
                          className="px-bars-fill"
                          style={{ width: `${((metric === 'qtd' ? p.tickets : valueOf(p)) / top) * 100}%` }}
                        />
                      </span>
                    </td>
                    <td>{metric === 'qtd' ? <b>{p.tickets}</b> : p.tickets}</td>
                    <td className="px-nowrap">{brl(p.cents)}</td>
                    <td className="px-nowrap">{brl(p.discountCents ?? 0)}</td>
                    <td className="px-nowrap">{metric === 'valor' ? <b>{brl(valueOf(p))}</b> : brl(valueOf(p))}</td>
                    <td>{p.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="px-small px-muted">
            Vendas sem código de promoter: {r.withoutPromoter.tickets} ingressos · {brl(r.withoutPromoter.cents)} (
            {r.withoutPromoter.orders} pedido(s)). Fora do ranking.
          </p>
        </>
      ) : null}
    </Gate>
  );
}

// ---------- taxa mensal (RF-60) ----------

export function FeeReportPage() {
  usePageTitle('Taxa mensal · PartyX');
  const access = useAdmin('/admin/relatorios/taxa-mensal');
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ month, page: String(page), pageSize: '25' }).toString();
  const [state, retry] = useFetch(s => api.admin.feeReport(query, s), access === 'ok' ? `taxa|${query}` : 'espera');
  const r = state.status === 'ok' ? state.data : null;
  const [y, m] = month.split('-');
  return (
    <Gate access={access} active="relatorios">
      <ReportNav active="taxa" />
      <h1 className="px-h1">Relatório mensal da taxa</h1>
      <ExportLink path="/admin/exports/fee.csv" query={new URLSearchParams({ month }).toString()} />
      <div className="px-field px-inline">
        <label htmlFor="t-mes">Mês de aprovação do pagamento</label>
        <input
          id="t-mes"
          type="month"
          value={month}
          onChange={e => {
            setMonth(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <Loading state={state} retry={retry} />
      {r ? (
        <>
          <Note tone="info">
            <b>Critério.</b> {r.criterion}
          </Note>
          <div className="px-kpis">
            <section className="px-panel" aria-label="Ingressos apurados">
              <h2 className="px-h3">
                Ingressos apurados em {m}/{y}
              </h2>
              <p className="px-kpi">
                {r.units}
                <small>unidades (não pedidos) · {r.originOrders} pedido(s) de origem</small>
              </p>
            </section>
            <section className="px-panel" aria-label="Valor da taxa">
              <h2 className="px-h3">Valor da taxa</h2>
              <p className="px-kpi">
                {brl(r.feeCents)}
                <small>
                  {r.units} × {brl(r.feePerTicketCents)} (Cláusula 6ª)
                </small>
              </p>
            </section>
          </div>

          <section aria-labelledby="conc">
            <h2 id="conc" className="px-h3">
              Conciliação
            </h2>
            <p className={r.reconciliation.ok ? 'px-ok' : 'px-error'} role="status">
              {r.reconciliation.ok
                ? `Confere: ${r.reconciliation.issuedUnits} ingressos emitidos para ${r.reconciliation.expectedUnits} unidades previstas pelos pedidos aprovados.`
                : `Divergência: ${r.reconciliation.issuedUnits} ingressos emitidos para ${r.reconciliation.expectedUnits} unidades previstas. Investigue antes de cobrar.`}
            </p>
            {r.reconciliation.anomalies.map(a => (
              <p key={a.orderId} className="px-notice px-notice-err" role="alert">
                Pedido <Link to={`/admin/pedidos/${a.orderId}`} className="px-nowrap">PX-{a.number}</Link> ({a.status}) aprovado sem
                ingressos: {a.expectedUnits} unidade(s) previstas.
              </p>
            ))}
          </section>

          <h2 className="px-h3">Situação atual das unidades apuradas</h2>
          <p className="px-small px-muted">
            Todas as situações contam na taxa, inclusive cancelados, reembolsados e estornados.
          </p>
          <TableWrap>
            <table className="px-table">
              <thead>
                <tr>
                  <th>Situação</th>
                  <th>Unidades</th>
                </tr>
              </thead>
              <tbody>
                {r.byCurrentStatus.map(s => (
                  <tr key={s.label}>
                    <td>{s.label}</td>
                    <td>{s.units}</td>
                  </tr>
                ))}
                <tr className="px-total-row">
                  <th scope="row">Total</th>
                  <td>
                    <b>{r.units}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </TableWrap>

          <h2 className="px-h3">Por evento</h2>
          <TableWrap>
            <table className="px-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Unidades</th>
                  <th>Taxa</th>
                </tr>
              </thead>
              <tbody>
                {r.byEvent.map(e => (
                  <tr key={e.eventId}>
                    <td>{e.eventName}</td>
                    <td>{e.units}</td>
                    <td className="px-nowrap">{brl(e.feeCents)}</td>
                  </tr>
                ))}
                <tr className="px-total-row">
                  <th scope="row">Total</th>
                  <td>
                    <b>{r.units}</b>
                  </td>
                  <td className="px-nowrap">
                    <b>{brl(r.feeCents)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </TableWrap>

          <section aria-labelledby="excecoes">
            <h2 id="excecoes" className="px-h3">
              {r.exceptions.title}
            </h2>
            <p className="px-small px-muted">{r.exceptions.note}</p>
            {r.exceptions.paidWithoutStock.length === 0 ? (
              <p className="px-muted">Nenhum pagamento aprovado sem estoque neste mês.</p>
            ) : (
              <TableWrap>
                <table className="px-table">
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Unidades pagas</th>
                      <th>Valor</th>
                      <th>Aprovado em</th>
                      <th>Referência no gateway</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.exceptions.paidWithoutStock.map(o => (
                      <tr key={o.orderId}>
                        <td>
                          <Link to={`/admin/pedidos/${o.orderId}`} className="px-nowrap">PX-{o.number}</Link>
                        </td>
                        <td>{o.units}</td>
                        <td className="px-nowrap">{brl(o.totalCents)}</td>
                        <td>{dateShort(o.paidAt)}</td>
                        <td>
                          <code>{o.gatewayRef ?? 'não informada'}</code>
                        </td>
                        <td>{o.treated ? 'Tratado' : <Link to="/admin/excecoes">Em aberto</Link>}</td>
                      </tr>
                    ))}
                    <tr className="px-total-row">
                      <th scope="row">Total</th>
                      <td>
                        <b>{r.exceptions.totals.units}</b>
                      </td>
                      <td className="px-nowrap">
                        <b>{brl(r.exceptions.totals.cents)}</b>
                      </td>
                      <td colSpan={3}>{r.exceptions.totals.open} em aberto</td>
                    </tr>
                  </tbody>
                </table>
              </TableWrap>
            )}
          </section>

          <section aria-labelledby="rec">
            <h2 id="rec" className="px-h3">
              Receita do mês (separada da taxa)
            </h2>
            <ul className="px-minilist">
              <li>
                Aprovada (bruta): <b>{brl(r.revenue.grossCents)}</b>
              </li>
              <li>
                Estornada: <b>{brl(r.revenue.refundedCents)}</b>
              </li>
              <li>
                Contestada: <b>{brl(r.revenue.contestedCents)}</b>
              </li>
              <li>
                Receita líquida: <b>{brl(r.revenue.netCents)}</b>
              </li>
            </ul>
            <p className="px-small px-muted">
              A taxa é devida por unidade emitida, não sobre a receita. Cobrança e boleto acontecem fora do sistema.
            </p>
          </section>

          <h2 className="px-h3">Detalhe por unidade</h2>
          <TableWrap>
            <table className="px-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Pedido</th>
                  <th>Evento</th>
                  <th>Pagamento aprovado em</th>
                  <th>Situação atual</th>
                </tr>
              </thead>
              <tbody>
                {r.units_detail.map(u => (
                  <tr key={u.ticketId}>
                    <td className="px-mono">{u.shortCode}</td>
                    <td>
                      <Link to={`/admin/pedidos/${u.orderId}`} className="px-nowrap">PX-{u.orderNumber}</Link>
                    </td>
                    <td>{u.eventName}</td>
                    <td className="px-nowrap">
                      {dateShort(u.paidAt)} {timeOf(u.paidAt)}
                    </td>
                    <td>{u.current}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pager page={r.page} pageSize={r.pageSize} total={r.total} onPage={setPage} />
        </>
      ) : null}
    </Gate>
  );
}
