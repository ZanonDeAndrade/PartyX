import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ConfirmDialog, errorText, fieldErrors, FormField } from './adminEvents';
import { ExportLink, Gate, Loading, Pager, TableWrap, useAdmin } from './adminPages';
import { api, type AccessImportResult, type AccessRow, type AccessStatus, type AdminEvent } from './api';
import { toast, usePageTitle } from './components';
import { dateShort, timeOf } from './format';
import { Link } from './router';
import { useFetch } from './useFetch';

/**
 * Evento privado (D-92): aba "Acesso" da edição do evento e página "Solicitações". Quem decide é o servidor; a tela só mostra o que ele
 * devolve. CPF sempre mascarado, como no resto do painel. A busca vai no corpo da requisição (pode ser um CPF).
 */

/** Avisa o menu e a Visão geral de que as solicitações mudaram, para o contador se atualizar. */
const ACCESS_CHANGED = 'px-acesso-mudou';
const accessChanged = () => window.dispatchEvent(new Event(ACCESS_CHANGED));

/** Solicitações pendentes de todos os eventos. Falha ao buscar não bloqueia o painel: o contador só não aparece. */
export function usePendingAccess(): number {
  const [count, setCount] = useState(0);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    window.addEventListener(ACCESS_CHANGED, bump);
    return () => window.removeEventListener(ACCESS_CHANGED, bump);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api.admin
      .accessRequestsCount(controller.signal)
      .then(setCount)
      .catch(() => {});
    return () => controller.abort();
  }, [version]);
  return count;
}

const STATUS_LABEL: Record<AccessStatus, string> = {
  autorizada: 'Autorizada',
  pendente: 'Pendente',
  recusada: 'Recusada',
};
const STATUS_TONE: Record<AccessStatus, string> = { autorizada: 'ok', pendente: 'warn', recusada: 'neu' };
const ORIGIN_LABEL: Record<AccessRow['origin'], string> = {
  painel: 'Cadastrada pelo painel',
  solicitacao: 'Solicitação',
};
const when = (iso: string) => `${dateShort(iso)} às ${timeOf(iso)}`;

function AccessBadge({ status }: { status: AccessStatus }) {
  return <span className={`px-badge px-badge-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

/** Aprovar ou recusar o que está marcado, com observação opcional. */
function DecisionBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const decide = async (decision: 'aprovar' | 'recusar') => {
    setBusy(true);
    setError('');
    try {
      const r = await api.admin.decideAccess(ids, decision, note.trim());
      toast(
        r.alteradas === 0
          ? 'Nada mudou: as pessoas marcadas já estavam assim.'
          : `${r.alteradas} ${r.alteradas === 1 ? 'pessoa' : 'pessoas'} ${decision === 'aprovar' ? 'autorizada' : 'recusada'}${r.alteradas === 1 ? '' : 's'}.`,
      );
      setNote('');
      accessChanged();
      onDone();
    } catch (err) {
      setError(errorText(err, 'Não foi possível salvar a decisão.'));
    } finally {
      setBusy(false);
    }
  };
  if (ids.length === 0) return null;
  return (
    <div className="px-panel px-access-bar" role="group" aria-label="Decisão para as pessoas marcadas">
      <p>
        <b>{ids.length}</b> {ids.length === 1 ? 'pessoa marcada' : 'pessoas marcadas'}
      </p>
      <FormField id="acesso-obs" label="Observação (opcional)" hint="Só o painel vê. Fica na trilha de auditoria.">
        <input id="acesso-obs" value={note} maxLength={500} onChange={e => setNote(e.target.value)} />
      </FormField>
      {error ? (
        <p className="px-notice px-notice-err" role="alert">
          {error}
        </p>
      ) : null}
      <div className="px-adm-actions">
        <button type="button" className="px-btn px-btn-pri" disabled={busy} onClick={() => decide('aprovar')}>
          Aprovar
        </button>
        <button type="button" className="px-btn" disabled={busy} onClick={() => decide('recusar')}>
          Recusar
        </button>
      </div>
      <p className="px-small px-muted">
        Aprovar uma solicitação envia o e-mail "Acesso liberado" com o link do evento. Recusar não envia nada.
      </p>
    </div>
  );
}

/** Uma pessoa por vez: e-mail ou CPF basta; nome opcional. */
function AddPersonForm({ eventId, onAdded }: { eventId: string; onAdded: () => void }) {
  const [form, setForm] = useState({ email: '', cpf: '', name: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() && !form.cpf.trim()) {
      setErrors({ email: 'Informe o e-mail ou o CPF da pessoa.' });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const r = await api.admin.addAccess(eventId, {
        email: form.email.trim() || undefined,
        cpf: form.cpf.trim() || undefined,
        name: form.name.trim() || undefined,
      });
      toast(
        r.resultado === 'adicionada'
          ? 'Pessoa autorizada.'
          : r.resultado === 'atualizada'
            ? 'Esta pessoa já estava na lista: agora está autorizada.'
            : 'Esta pessoa já estava autorizada.',
      );
      setForm({ email: '', cpf: '', name: '' });
      accessChanged();
      onAdded();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(Object.keys(fe).length ? fe : { email: errorText(err, 'Não foi possível adicionar.') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="px-panel px-form-grid px-access-add" onSubmit={submit} noValidate>
      <h3 className="px-h3 px-field-wide">Adicionar pessoa</h3>
      <FormField id="acesso-email" label="E-mail" error={errors.email}>
        <input
          id="acesso-email"
          type="email"
          autoComplete="off"
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
        />
      </FormField>
      <FormField id="acesso-cpf" label="CPF" error={errors.cpf} hint="Um dos dois basta: e-mail ou CPF.">
        <input
          id="acesso-cpf"
          inputMode="numeric"
          autoComplete="off"
          value={form.cpf}
          onChange={e => setForm({ ...form, cpf: e.target.value })}
        />
      </FormField>
      <FormField id="acesso-nome" label="Nome (opcional)" error={errors.name}>
        <input
          id="acesso-nome"
          value={form.name}
          maxLength={120}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
      </FormField>
      <div className="px-field-wide">
        <button type="submit" className="px-btn px-btn-pri" disabled={busy}>
          {busy ? 'Adicionando…' : 'Adicionar'}
        </button>
      </div>
    </form>
  );
}

/** Lista colada, uma pessoa por linha (e-mail, CPF e nome em qualquer ordem). */
function ImportForm({ eventId, onImported }: { eventId: string; onImported: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AccessImportResult | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await api.admin.importAccess(eventId, text);
      setResult(r);
      if (r.erros.length === 0) setText('');
      accessChanged();
      onImported();
    } catch (err) {
      setError(errorText(err, 'Não foi possível importar.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="px-panel px-access-import">
      <summary>Colar uma lista</summary>
      <form className="px-form-grid" onSubmit={submit} noValidate>
        <FormField
          id="acesso-lista"
          label="Uma pessoa por linha"
          wide
          hint="Em cada linha, e-mail ou CPF e, se quiser, o nome, separados por vírgula, ponto e vírgula ou tabulação (o que sai de uma planilha). Até 1.000 linhas."
          error={error}
        >
          <textarea id="acesso-lista" rows={6} value={text} onChange={e => setText(e.target.value)} />
        </FormField>
        <div className="px-field-wide">
          <button type="submit" className="px-btn px-btn-pri" disabled={busy || !text.trim()}>
            {busy ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </form>
      {result ? (
        <div className="px-notice px-notice-info" role="status">
          <b>
            {result.adicionadas} {result.adicionadas === 1 ? 'adicionada' : 'adicionadas'}
            {result.atualizadas ? `, ${result.atualizadas} já na lista e agora autorizadas` : ''}
            {result.jaAutorizadas ? `, ${result.jaAutorizadas} já autorizadas` : ''}.
          </b>
          {result.repetidas.length ? (
            <span>Repetidas na própria lista (ignoradas): linhas {result.repetidas.join(', ')}.</span>
          ) : null}
          {result.erros.length ? (
            <>
              <span>Linhas que não entraram (corrija e importe de novo):</span>
              <ul className="px-minilist">
                {result.erros.map(e => (
                  <li key={e.line}>
                    Linha {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

/** Aba "Acesso" da edição do evento. */
export function AccessPanel({ event }: { event: AdminEvent }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<{ q: string; status: AccessStatus | '' }>({ q: '', status: '' });
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [removing, setRemoving] = useState<AccessRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const key = `${event.id}|${filter.q}|${filter.status}|${page}|${version}`;
  const [state, retry] = useFetch(
    s => api.admin.accessList(event.id, { q: filter.q || undefined, status: filter.status || undefined, page }, s),
    key,
  );
  const reload = () => {
    setSelected([]);
    setVersion(v => v + 1);
  };
  const data = state.status === 'ok' ? state.data : null;
  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const allOnPage = data ? data.people.map(p => p.id) : [];
  const allChecked = allOnPage.length > 0 && allOnPage.every(id => selected.includes(id));
  const remove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError('');
    try {
      await api.admin.removeAccess(removing.id);
      toast('Pessoa removida da lista.');
      setRemoving(null);
      accessChanged();
      reload();
    } catch (err) {
      setRemoveError(errorText(err, 'Não foi possível remover.'));
    } finally {
      setRemoveBusy(false);
    }
  };
  return (
    <section aria-label="Acesso ao evento" className="px-access">
      {event.isPrivate ? (
        <p className="px-notice px-notice-info" role="note">
          <b>Evento privado.</b> Só compra quem está autorizado nesta lista. Quem não está vê "Solicitar acesso a este
          evento" na página do evento.
        </p>
      ) : (
        <p className="px-notice px-notice-neu" role="note">
          <b>Evento aberto a todos.</b> A lista fica guardada, mas só vale quando a chave "Evento privado" estiver
          ligada.{' '}
          {event.status !== 'encerrado' ? (
            <Link to={`/admin/eventos/${event.id}/editar`}>Editar informações</Link>
          ) : null}
        </p>
      )}
      {data ? (
        <p className="px-access-counts">
          <span>
            <b>{data.counts.autorizada}</b> {data.counts.autorizada === 1 ? 'autorizada' : 'autorizadas'}
          </span>
          <span>
            <b>{data.counts.pendente}</b> {data.counts.pendente === 1 ? 'pendente' : 'pendentes'}
          </span>
          <span>
            <b>{data.counts.recusada}</b> {data.counts.recusada === 1 ? 'recusada' : 'recusadas'}
          </span>
        </p>
      ) : null}
      <div className="px-access-tools">
        <AddPersonForm eventId={event.id} onAdded={reload} />
        <ImportForm eventId={event.id} onImported={reload} />
      </div>
      <form
        className="px-filters"
        role="search"
        onSubmit={e => {
          e.preventDefault();
          setFilter(f => ({ ...f, q: q.trim() }));
          setPage(1);
        }}
      >
        <div className="px-field">
          <label htmlFor="acesso-q">Nome, e-mail ou CPF</label>
          <input id="acesso-q" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="px-field">
          <label htmlFor="acesso-situacao">Situação</label>
          <select
            id="acesso-situacao"
            value={filter.status}
            onChange={e => {
              setFilter(f => ({ ...f, status: e.target.value as AccessStatus | '' }));
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="pendente">Pendentes</option>
            <option value="autorizada">Autorizadas</option>
            <option value="recusada">Recusadas</option>
          </select>
        </div>
        <button type="submit" className="px-btn px-btn-pri">
          Buscar
        </button>
      </form>
      <ExportLink
        path={`/admin/exports/events/${event.id}/access.csv`}
        query={filter.status ? new URLSearchParams({ status: filter.status }).toString() : ''}
      />
      <DecisionBar ids={selected} onDone={reload} />
      <Loading state={state} retry={retry} />
      {data ? (
        data.people.length === 0 ? (
          <p className="px-muted">
            {filter.q || filter.status
              ? 'Ninguém com esses filtros.'
              : 'Ninguém na lista ainda. Adicione pessoas acima.'}
          </p>
        ) : (
          <>
            <label className="px-check px-access-all">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() =>
                  setSelected(s =>
                    allChecked ? s.filter(id => !allOnPage.includes(id)) : [...new Set([...s, ...allOnPage])],
                  )
                }
              />
              <span>Marcar todas desta página</span>
            </label>
            <TableWrap>
              <table className="px-table px-access-table">
                <thead>
                  <tr>
                    <th>
                      <span className="px-sr">Marcar</span>
                    </th>
                    <th>Pessoa</th>
                    <th>CPF</th>
                    <th>Situação</th>
                    <th>Origem</th>
                    <th>Datas</th>
                    <th>
                      <span className="px-sr">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.people.map(p => (
                    <AccessTableRow
                      key={p.id}
                      row={p}
                      checked={selected.includes(p.id)}
                      onToggle={() => toggle(p.id)}
                      onRemove={() => {
                        setRemoveError('');
                        setRemoving(p);
                      }}
                      onChanged={reload}
                    />
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )
      ) : null}
      {removing ? (
        <ConfirmDialog
          title="Remover da lista?"
          confirmLabel="Remover"
          danger
          busy={removeBusy}
          error={removeError}
          onConfirm={remove}
          onCancel={() => setRemoving(null)}
        >
          <p>
            {removing.name ?? removing.email ?? removing.cpf} sai da lista deste evento. Pedidos e ingressos já pagos
            não mudam. Se o evento for privado, a pessoa deixa de poder comprar e pode solicitar acesso de novo.
          </p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function AccessTableRow({
  row,
  checked,
  onToggle,
  onRemove,
  onChanged,
  eventCell,
}: {
  row: AccessRow;
  checked: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  onChanged: () => void;
  eventCell?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const decide = async (decision: 'aprovar' | 'recusar') => {
    setBusy(true);
    try {
      await api.admin.decideAccess([row.id], decision);
      toast(decision === 'aprovar' ? 'Pessoa autorizada.' : 'Solicitação recusada.');
      accessChanged();
      onChanged();
    } catch (err) {
      toast(errorText(err, 'Não foi possível salvar a decisão.'), 'err');
    } finally {
      setBusy(false);
    }
  };
  const who = row.name ?? row.email ?? row.cpf ?? 'Pessoa';
  return (
    <tr>
      <td>
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Marcar ${who}`} />
      </td>
      {eventCell}
      <td>
        <div>
          {row.name ?? <span className="px-muted">Sem nome</span>}
          {row.email ? (
            <>
              <br />
              <span className="px-muted px-break">{row.email}</span>
            </>
          ) : null}
          <br />
          <span className="px-small px-muted">{row.hasAccount ? 'Tem conta na PartyX' : 'Ainda sem conta'}</span>
        </div>
      </td>
      <td className="px-nowrap">{row.cpf ?? <span className="px-muted">Não informado</span>}</td>
      <td>
        <div>
          <AccessBadge status={row.status} />
          {row.note ? <p className="px-small px-muted">{row.note}</p> : null}
        </div>
      </td>
      <td>{ORIGIN_LABEL[row.origin]}</td>
      <td className="px-small">
        <div>
          {row.origin === 'solicitacao' ? 'Solicitada' : 'Cadastrada'} em {when(row.createdAt)}
          {row.decidedAt && !(row.origin === 'painel' && row.decidedAt === row.createdAt) ? (
            <>
              <br />
              {row.status === 'recusada' ? 'Recusada' : 'Autorizada'} em {when(row.decidedAt)}
              {row.decidedBy ? ` por ${row.decidedBy}` : ''}
            </>
          ) : null}
        </div>
      </td>
      <td>
        <div className="px-adm-actions">
          {row.status !== 'autorizada' ? (
            <button type="button" className="px-btn px-btn-pri" disabled={busy} onClick={() => decide('aprovar')}>
              Aprovar
            </button>
          ) : null}
          {row.status !== 'recusada' ? (
            <button type="button" className="px-btn" disabled={busy} onClick={() => decide('recusar')}>
              Recusar
            </button>
          ) : null}
          {onRemove ? (
            <button type="button" className="px-btn px-btn-danger-line" disabled={busy} onClick={onRemove}>
              Remover
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

/** Página "Solicitações": pendentes de todos os eventos, da mais antiga para a mais nova. */
export function AdminAccessRequestsPage() {
  usePageTitle('Solicitações · PartyX');
  const access = useAdmin('/admin/solicitacoes');
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, retry] = useFetch(
    s => api.admin.accessRequests(page, s),
    access === 'ok' ? `solicitacoes|${page}|${version}` : 'espera',
  );
  const reload = () => {
    setSelected([]);
    setVersion(v => v + 1);
  };
  const data = state.status === 'ok' ? state.data : null;
  const ids = data ? data.requests.map(r => r.id) : [];
  const allChecked = ids.length > 0 && ids.every(id => selected.includes(id));
  return (
    <Gate access={access} active="solicitacoes">
      <h1 className="px-h1">Solicitações de acesso</h1>
      <p className="px-muted">
        Pedidos de acesso a eventos privados que aguardam decisão. A aprovação é decisão do organizador; aprovar envia o
        e-mail "Acesso liberado", recusar não envia nada. Para ver a lista inteira de um evento, abra a aba Acesso dele.
      </p>
      <DecisionBar ids={selected} onDone={reload} />
      <Loading state={state} retry={retry} />
      {data ? (
        data.requests.length === 0 ? (
          <p className="px-notice px-notice-neu" role="status">
            Nenhuma solicitação pendente.
          </p>
        ) : (
          <>
            <label className="px-check px-access-all">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() =>
                  setSelected(s => (allChecked ? s.filter(id => !ids.includes(id)) : [...new Set([...s, ...ids])]))
                }
              />
              <span>Marcar todas desta página</span>
            </label>
            <TableWrap>
              <table className="px-table px-access-table">
                <thead>
                  <tr>
                    <th>
                      <span className="px-sr">Marcar</span>
                    </th>
                    <th>Evento</th>
                    <th>Pessoa</th>
                    <th>CPF</th>
                    <th>Situação</th>
                    <th>Origem</th>
                    <th>Datas</th>
                    <th>
                      <span className="px-sr">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.requests.map(r => (
                    <AccessTableRow
                      key={r.id}
                      row={r}
                      checked={selected.includes(r.id)}
                      onToggle={() => setSelected(s => (s.includes(r.id) ? s.filter(x => x !== r.id) : [...s, r.id]))}
                      onChanged={reload}
                      eventCell={
                        <td>
                          <div>
                            <Link to={`/admin/eventos/${r.event.id}?aba=acesso`}>{r.event.name}</Link>
                            <br />
                            <span className="px-small px-muted">{dateShort(r.event.startsAt)}</span>
                          </div>
                        </td>
                      }
                    />
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )
      ) : null}
    </Gate>
  );
}

/** Card da Visão geral: solicitações pendentes, com o caminho para decidir. */
export function PendingAccessCard() {
  const pending = usePendingAccess();
  return (
    <section className="px-panel" aria-label="Solicitações de acesso">
      <h2 className="px-h3">Solicitações de acesso</h2>
      <p className="px-kpi">
        <span>{pending}</span>
        <small>{pending === 1 ? 'pendente em evento privado' : 'pendentes em eventos privados'}</small>
      </p>
      <Link to="/admin/solicitacoes" className="px-textlink px-textlink-sm">
        {pending > 0 ? 'Decidir agora' : 'Ver solicitações'}
      </Link>
    </section>
  );
}
