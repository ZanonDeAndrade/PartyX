import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { PasswordDialog } from './accountPages';
import { ConfirmDialog, described, errorText, EventStatusBadge, fieldErrors, FormField } from './adminEvents';
import { CancelDialog, ExportLink, Gate, LiveEntriesPanel, Loading, Pager, TicketsPanel, useAdmin } from './adminPages';
import { api, ApiError, type AdminEventRow, type Promoter, type TeamMember } from './api';
import { toast, usePageTitle } from './components';
import {
  brl,
  dateShort,
  isCouponValid,
  isCpfValid,
  isEmailLike,
  maskCpfInput,
  normalizeCoupon,
  timeOf,
} from './format';
import { IconBack } from './icons';
import { Link, useLeaveGuard, useRouter } from './router';
import { useSession } from './session';
import { useFetch } from './useFetch';

/**
 * Painel: promoters (ADM07 a ADM09), compradores (ADM12, ADM13), ingressos (ADM14, ADM15), entradas (ADM19), equipe (ADM20 a ADM22)
 * e conta do administrador (ADM24). Toda regra fica na API (perfil, validação, auditoria); a tela orienta e mostra o erro no campo.
 */

const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const when = (iso: string | null) => (iso ? `${dateShort(iso)} ${timeOf(iso)}` : 'nunca');
const ORDER_LABEL: Record<string, [string, string]> = {
  pendente: ['warn', 'Aguardando pagamento'],
  pago: ['ok', 'Pago'],
  expirado: ['neu', 'Expirado'],
  nao_concluido: ['err', 'Não concluído'],
  cancelado: ['neu', 'Cancelado'],
  estornado: ['info', 'Estornado'],
  contestado: ['err', 'Contestado'],
  pago_sem_estoque: ['err', 'Pago sem estoque'],
};
const TICKET_LABEL: Record<string, [string, string]> = {
  valido: ['ok', 'Válido'],
  utilizado: ['info', 'Utilizado'],
  cancelado: ['err', 'Cancelado'],
};
const Badge = ({ map, value }: { map: Record<string, [string, string]>; value: string }) => {
  const [tone, label] = map[value] ?? ['neu', value];
  return <span className={`px-badge px-badge-${tone}`}>{label}</span>;
};

/** Seletor de evento reaproveitado por Ingressos e Entradas; a escolha fica no endereço (`?evento=`). */
function EventPicker({
  id,
  events,
  value,
  onChange,
  filter,
}: {
  id: string;
  events: AdminEventRow[];
  value: string;
  onChange: (v: string) => void;
  filter?: (e: AdminEventRow) => boolean;
}) {
  const list = filter ? events.filter(filter) : events;
  return (
    <div className="px-field">
      <label htmlFor={id}>Evento</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Escolha o evento</option>
        {list.map(e => (
          <option key={e.id} value={e.id}>
            {e.name} · {dateShort(e.startsAt)}
            {e.status !== 'publicado' ? ` (${e.status})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function useQueryParam(key: string): [string, (v: string) => void] {
  const { loc } = useRouter();
  const [value, setValue] = useState(() => new URLSearchParams(loc.search).get(key) ?? '');
  const set = (v: string) => {
    setValue(v);
    const q = new URLSearchParams(window.location.search);
    if (v) q.set(key, v);
    else q.delete(key);
    window.history.replaceState(null, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}`);
  };
  return [value, set];
}

// ---------- ADM07 a ADM09: promoters ----------

export function AdminPromotersPage() {
  usePageTitle('Promoters · PartyX');
  const access = useAdmin('/admin/promoters');
  const [version, setVersion] = useState(0);
  const [state, retry] = useFetch(s => api.admin.promoters(s), access === 'ok' ? `promoters|${version}` : 'espera');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'ativo' | 'inativo'>('');
  const [editing, setEditing] = useState<Promoter | 'novo' | null>(null);
  const [toggling, setToggling] = useState<Promoter | null>(null);
  const [busy, setBusy] = useState(false);
  const [toggleError, setToggleError] = useState('');
  const all = state.status === 'ok' ? state.data : [];
  const rows = useMemo(
    () =>
      all.filter(
        p =>
          (!status || (status === 'ativo') === p.isActive) &&
          (!q.trim() || fold(p.name).includes(fold(q.trim())) || p.couponCode.includes(q.trim().toUpperCase())),
      ),
    [all, q, status],
  );
  const toggle = async () => {
    if (!toggling) return;
    setBusy(true);
    setToggleError('');
    try {
      await api.admin.updatePromoter(toggling.id, { isActive: !toggling.isActive });
      toast(toggling.isActive ? `${toggling.name} foi desativado.` : `${toggling.name} foi ativado.`);
      setToggling(null);
      setVersion(v => v + 1);
    } catch (err) {
      setToggleError(errorText(err, 'Não foi possível alterar.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Gate access={access} active="promoters">
      <div className="px-adm-head">
        <h1 className="px-h1">Promoters</h1>
        <button type="button" className="px-btn px-btn-pri" onClick={() => setEditing('novo')}>
          Novo promoter
        </button>
      </div>
      <p className="px-small px-muted">
        O código do promoter só rastreia as vendas feitas com ele. <b>Não dá desconto</b> ao comprador e o sistema não
        calcula comissão, saldo nem pagamento.
      </p>
      <form className="px-filters" role="search" onSubmit={e => e.preventDefault()}>
        <div className="px-field">
          <label htmlFor="pr-q">Buscar por nome ou código</label>
          <input id="pr-q" type="search" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="px-field">
          <label htmlFor="pr-st">Situação</label>
          <select id="pr-st" value={status} onChange={e => setStatus(e.target.value as '' | 'ativo' | 'inativo')}>
            <option value="">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
        </div>
      </form>
      <Loading state={state} retry={retry} />
      {state.status === 'ok' ? (
        all.length === 0 ? (
          <div className="px-box">
            <p>Nenhum promoter cadastrado.</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-muted">Nenhum promoter com esses filtros.</p>
        ) : (
          <ul className="px-adm-list">
            {rows.map(p => (
              <li key={p.id} className="px-adm-card">
                <div className="px-adm-card-main">
                  <Link to={`/admin/promoters/${p.id}`} className="px-adm-card-title">
                    {p.name}
                  </Link>
                  <span className="px-small">
                    Código <b className="px-mono">{p.couponCode}</b> · {p.phone ?? 'sem telefone'}
                  </span>
                </div>
                <div className="px-adm-card-status">
                  <span className={`px-badge px-badge-${p.isActive ? 'ok' : 'neu'}`}>
                    {p.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="px-adm-actions" role="group" aria-label={`Ações de ${p.name}`}>
                  <Link to={`/admin/promoters/${p.id}`} className="px-btn">
                    Vendas
                  </Link>
                  <button type="button" className="px-btn" onClick={() => setEditing(p)}>
                    Editar
                  </button>
                  <button type="button" className="px-btn" onClick={() => setToggling(p)}>
                    {p.isActive ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {editing ? (
        <PromoterDialog
          promoter={editing === 'novo' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setVersion(v => v + 1);
          }}
        />
      ) : null}
      {toggling ? (
        <ConfirmDialog
          title={toggling.isActive ? `Desativar ${toggling.name}?` : `Ativar ${toggling.name}?`}
          confirmLabel={toggling.isActive ? 'Desativar' : 'Ativar'}
          danger={toggling.isActive}
          busy={busy}
          error={toggleError || null}
          onConfirm={toggle}
          onCancel={() => {
            setToggling(null);
            setToggleError('');
          }}
        >
          {toggling.isActive ? (
            <p>
              O código <b className="px-mono">{toggling.couponCode}</b> deixa de ser aceito no checkout. As vendas já
              atribuídas continuam no relatório.
            </p>
          ) : (
            <p>
              O código <b className="px-mono">{toggling.couponCode}</b> volta a ser aceito no checkout.
            </p>
          )}
        </ConfirmDialog>
      ) : null}
    </Gate>
  );
}

function PromoterDialog({
  promoter,
  onCancel,
  onSaved,
}: {
  promoter: Promoter | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const initial = {
    name: promoter?.name ?? '',
    code: promoter?.couponCode ?? '',
    phone: promoter?.phone ?? '',
    isActive: promoter?.isActive ?? true,
  };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useLeaveGuard(dirty);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => ref.current?.querySelector<HTMLElement>('#pr-name')?.focus(), []);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k === 'code' ? 'couponCode' : k]: '' }));
  };
  const cancel = () => {
    if (dirty && !window.confirm('Descartar as alterações deste promoter?')) return;
    onCancel();
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const code = normalizeCoupon(form.code);
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Informe o nome do promoter.';
    if (!isCouponValid(code)) errs.couponCode = 'Use de 3 a 20 letras ou números, sem acento, espaço ou símbolo.';
    if (form.phone.trim() && form.phone.replace(/\D/g, '').length < 10) errs.phone = 'Informe o telefone com DDD.';
    if (Object.keys(errs).length) {
      setErrors(errs);
      ref.current
        ?.querySelector<HTMLElement>(`#pr-${Object.keys(errs)[0] === 'couponCode' ? 'code' : Object.keys(errs)[0]}`)
        ?.focus();
      return;
    }
    setBusy(true);
    setFormError('');
    const body = {
      name: form.name.trim(),
      couponCode: code,
      phone: form.phone.trim() || null,
      isActive: form.isActive,
    };
    try {
      if (promoter) await api.admin.updatePromoter(promoter.id, body);
      else await api.admin.createPromoter(body);
      toast(promoter ? 'Promoter salvo.' : `Promoter criado com o código ${code}.`);
      onSaved();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else setFormError(errorText(err, 'Não foi possível salvar.'));
      setBusy(false);
    }
  };
  return (
    <div className="px-modal-bg" onClick={() => !busy && cancel()}>
      <form
        ref={ref}
        className="px-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pr-title"
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        noValidate
      >
        <h2 id="pr-title" className="px-h3">
          {promoter ? `Editar ${promoter.name}` : 'Novo promoter'}
        </h2>
        <p className="px-notice px-notice-info">
          O código rastreia as vendas do promoter. <b>Não dá desconto</b> e não gera comissão no sistema.
        </p>
        {formError ? (
          <p className="px-notice px-notice-err" role="alert">
            {formError}
          </p>
        ) : null}
        <FormField id="pr-name" label="Nome" error={errors.name}>
          <input
            id="pr-name"
            value={form.name}
            maxLength={80}
            onChange={e => set('name', e.target.value)}
            {...described('pr-name', errors.name)}
          />
        </FormField>
        <FormField
          id="pr-code"
          label="Código"
          error={errors.couponCode}
          hint="De 3 a 20 letras ou números. Guardado em maiúsculas; não pode repetir o de outro promoter."
        >
          <input
            id="pr-code"
            className="px-mono"
            value={form.code}
            maxLength={20}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={e => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))}
            {...described('pr-code', errors.couponCode, true)}
          />
        </FormField>
        <FormField id="pr-phone" label="Telefone (opcional)" error={errors.phone}>
          <input
            id="pr-phone"
            inputMode="tel"
            value={form.phone}
            maxLength={20}
            onChange={e => set('phone', e.target.value)}
            {...described('pr-phone', errors.phone)}
          />
        </FormField>
        <div className="px-check">
          <input
            id="pr-active"
            type="checkbox"
            checked={form.isActive}
            onChange={e => set('isActive', e.target.checked)}
          />
          <label htmlFor="pr-active">Ativo (o código é aceito no checkout)</label>
        </div>
        <div className="px-actions">
          <button type="button" className="px-btn" onClick={cancel} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="px-btn px-btn-pri" disabled={busy}>
            {busy ? 'Salvando…' : promoter ? 'Salvar' : 'Criar promoter'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AdminPromoterPage({ id }: { id: string }) {
  usePageTitle('Promoter · PartyX');
  const access = useAdmin(`/admin/promoters/${id}`);
  const ok = access === 'ok';
  const [eventId, setEventId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = new URLSearchParams(Object.entries({ eventId, from, to }).filter(([, v]) => v)).toString();
  const [state, retry] = useFetch(s => api.admin.promoterOrders(id, query, s), ok ? `po|${id}|${query}` : 'espera');
  const [events] = useFetch(s => api.admin.events(s), ok ? 'events' : 'espera');
  const [list] = useFetch(s => api.admin.promoters(s), ok ? 'promoters' : 'espera');
  const contact = list.status === 'ok' ? list.data.find(p => p.id === id) : undefined;
  const p = state.status === 'ok' ? state.data.promoter : null;
  return (
    <Gate access={access} active="promoters">
      <p>
        <Link to="/admin/promoters" className="px-textlink px-textlink-sm">
          <IconBack size={18} />
          Promoters
        </Link>
      </p>
      <h1 className="px-h1">{p?.name ?? 'Promoter'}</h1>
      {p ? (
        <p>
          Código <b className="px-mono">{p.code}</b> · {contact?.phone ?? 'sem telefone'} ·{' '}
          <span className={`px-badge px-badge-${p.isActive ? 'ok' : 'neu'}`}>{p.isActive ? 'Ativo' : 'Inativo'}</span>
        </p>
      ) : null}
      <p className="px-small px-muted">
        Vendas atribuídas: pedidos <b>pagos</b> com este código, pela data da aprovação. Sem desconto, comissão, saldo
        ou acesso do promoter.
      </p>
      <form className="px-filters" onSubmit={e => e.preventDefault()}>
        {events.status === 'ok' ? (
          <EventPicker id="po-ev" events={events.data} value={eventId} onChange={setEventId} />
        ) : null}
        <div className="px-field">
          <label htmlFor="po-from">De</label>
          <input id="po-from" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="px-field">
          <label htmlFor="po-to">Até</label>
          <input id="po-to" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </form>
      <ExportLink path={`/admin/exports/promoters/${id}/orders.csv`} query={query} />
      <Loading state={state} retry={retry} />
      {state.status === 'ok' ? (
        <>
          <p className="px-count" role="status">
            <b>{state.data.totals.tickets}</b> ingressos · <b>{brl(state.data.totals.cents)}</b> em{' '}
            {state.data.orders.length} pedido{state.data.orders.length === 1 ? '' : 's'}
          </p>
          {state.data.orders.length === 0 ? (
            <p className="px-muted">Nenhuma venda atribuída com esses filtros.</p>
          ) : (
            <ul className="px-adm-list">
              {state.data.orders.map(o => (
                <li key={o.id} className="px-adm-card">
                  <div className="px-adm-card-main">
                    <Link to={`/admin/pedidos/${o.id}`} className="px-adm-card-title">
                      PX-{o.number}
                    </Link>
                    <span className="px-small px-muted">
                      {o.eventName} · aprovado em {when(o.paidAt)}
                    </span>
                  </div>
                  <div className="px-adm-card-status">
                    {o.tickets} ingresso{o.tickets === 1 ? '' : 's'} · <b>{brl(o.cents)}</b>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </Gate>
  );
}

// ---------- ADM12, ADM13: compradores ----------

export function AdminBuyersPage() {
  usePageTitle('Compradores · PartyX');
  const access = useAdmin('/admin/compradores');
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams(
    Object.entries({ q: applied, page: String(page) }).filter(([, v]) => v && v !== '1'),
  ).toString();
  const [state, retry] = useFetch(s => api.admin.buyersAll(query, s), access === 'ok' ? `buyers|${query}` : 'espera');
  return (
    <Gate access={access} active="compradores">
      <h1 className="px-h1">Compradores</h1>
      <p className="px-small px-muted">
        Contas de cliente de todos os eventos. CPF sempre mascarado na lista. Para compradores de um evento só, use a
        aba "Compradores" do evento.
      </p>
      <form
        className="px-filters"
        role="search"
        onSubmit={e => {
          e.preventDefault();
          setApplied(q.trim());
          setPage(1);
        }}
      >
        <div className="px-field">
          <label htmlFor="cp-q">Nome, e-mail ou CPF completo</label>
          <input id="cp-q" type="search" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button type="submit" className="px-btn px-btn-pri">
          Buscar
        </button>
      </form>
      {state.status === 'error' && state.code === 422 ? (
        <p className="px-notice px-notice-err" role="alert">
          Use pelo menos 3 letras, um e-mail ou o CPF completo.
        </p>
      ) : (
        <Loading state={state} retry={retry} />
      )}
      {state.status === 'ok' ? (
        <>
          <p className="px-count" role="status">
            {state.data.total} comprador{state.data.total === 1 ? '' : 'es'}
          </p>
          {state.data.rows.length === 0 ? (
            <p className="px-muted">Nenhum comprador encontrado.</p>
          ) : (
            <ul className="px-adm-list">
              {state.data.rows.map(b => (
                <li key={b.id} className="px-adm-card">
                  <div className="px-adm-card-main">
                    <Link to={`/admin/compradores/${b.id}`} className="px-adm-card-title">
                      {b.name}
                    </Link>
                    <span className="px-small px-muted px-break">
                      {b.email} · CPF {b.cpf ?? 'não informado'}
                    </span>
                  </div>
                  <div className="px-adm-card-status px-small">
                    {b.orders} pedido{b.orders === 1 ? '' : 's'} · {b.tickets} ingresso{b.tickets === 1 ? '' : 's'}
                    {b.anonymized ? <span className="px-badge px-badge-neu">Anonimizado</span> : null}
                    {!b.isActive && !b.anonymized ? <span className="px-badge px-badge-neu">Inativo</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pager page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onPage={setPage} />
        </>
      ) : null}
    </Gate>
  );
}

export function AdminBuyerPage({ id }: { id: string }) {
  usePageTitle('Comprador · PartyX');
  const access = useAdmin(`/admin/compradores/${id}`);
  const [version, setVersion] = useState(0);
  const [state, retry] = useFetch(s => api.admin.buyer(id, s), access === 'ok' ? `buyer|${id}|${version}` : 'espera');
  const [fullCpf, setFullCpf] = useState<string | null>(null);
  const [cpfError, setCpfError] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const d = state.status === 'ok' ? state.data : null;
  const reveal = async () => {
    setCpfError('');
    try {
      setFullCpf((await api.admin.revealCpf(id)).cpf);
    } catch (err) {
      setCpfError(errorText(err, 'Não foi possível mostrar o CPF.'));
    }
  };
  return (
    <Gate access={access} active="compradores">
      <p>
        <Link to="/admin/compradores" className="px-textlink px-textlink-sm">
          <IconBack size={18} />
          Compradores
        </Link>
      </p>
      <Loading state={state} retry={retry} />
      {d ? (
        <>
          <h1 className="px-h1">{d.buyer.name}</h1>
          {d.buyer.anonymized ? (
            <p className="px-notice px-notice-neu">
              Dados anonimizados a pedido do titular (LGPD). Não há o que corrigir.
            </p>
          ) : null}
          <dl className="px-facts">
            <div>
              <dt>E-mail</dt>
              <dd className="px-break">{d.buyer.email}</dd>
            </div>
            <div>
              <dt>CPF</dt>
              <dd className="px-mono">{fullCpf ? maskCpfInput(fullCpf) : (d.buyer.cpf ?? 'não informado')}</dd>
              {d.buyer.cpf && !d.buyer.anonymized ? (
                <dd>
                  {fullCpf ? (
                    <button type="button" className="px-btn" onClick={() => setFullCpf(null)}>
                      Ocultar CPF
                    </button>
                  ) : (
                    <button type="button" className="px-btn" onClick={reveal}>
                      Mostrar CPF completo
                    </button>
                  )}
                  <small className="px-hint">Cada visualização fica registrada na trilha de auditoria.</small>
                  {cpfError ? (
                    <small className="px-error" role="alert">
                      {cpfError}
                    </small>
                  ) : null}
                </dd>
              ) : null}
            </div>
            <div>
              <dt>Telefone</dt>
              <dd>{d.buyer.phone ?? 'não informado'}</dd>
            </div>
            <div>
              <dt>Conta</dt>
              <dd>
                Criada em {dateShort(d.buyer.createdAt)} · último acesso {when(d.buyer.lastLoginAt)}
              </dd>
            </div>
          </dl>
          {!d.buyer.anonymized ? (
            <div className="px-adm-actions">
              <button type="button" className="px-btn" onClick={() => setCorrecting(true)}>
                Corrigir e-mail, CPF ou nascimento
              </button>
            </div>
          ) : null}

          <h2 className="px-h3">Pedidos ({d.orders.length})</h2>
          {d.orders.length === 0 ? <p className="px-muted">Nenhum pedido.</p> : null}
          <ul className="px-adm-list">
            {d.orders.map(o => (
              <li key={o.id} className="px-adm-card">
                <div className="px-adm-card-main">
                  <Link to={`/admin/pedidos/${o.id}`} className="px-adm-card-title">
                    PX-{o.number}
                  </Link>
                  <span className="px-small px-muted">
                    {o.event.name} · {o.units} ingresso{o.units === 1 ? '' : 's'} · {brl(o.totalCents)} · criado em{' '}
                    {when(o.createdAt)}
                  </span>
                </div>
                <div className="px-adm-card-status">
                  <Badge map={ORDER_LABEL} value={o.status} />
                </div>
              </li>
            ))}
          </ul>

          <h2 className="px-h3">Ingressos ({d.tickets.length})</h2>
          {d.tickets.length === 0 ? <p className="px-muted">Nenhum ingresso emitido.</p> : null}
          <ul className="px-adm-list">
            {d.tickets.map(t => (
              <li key={t.id} className="px-adm-card">
                <div className="px-adm-card-main">
                  <Link to={`/admin/ingressos/${t.id}`} className="px-adm-card-title px-mono">
                    {t.shortCode}
                  </Link>
                  <span className="px-small px-muted">
                    {t.eventName} · {t.typeName} · pedido PX-{t.orderNumber}
                    {t.usedAt ? ` · entrou ${when(t.usedAt)}` : ''}
                  </span>
                </div>
                <div className="px-adm-card-status">
                  <Badge map={TICKET_LABEL} value={t.status} />
                </div>
              </li>
            ))}
          </ul>

          {d.corrections.length ? (
            <>
              <h2 className="px-h3">Correções de dados</h2>
              <ul className="px-trail">
                {d.corrections.map((c, i) => (
                  <li key={i}>
                    {when(c.at)} · {c.fields.map(f => (f === 'cpf' ? 'CPF' : 'e-mail')).join(' e ') || 'dados'} por{' '}
                    {c.actor ?? 'sistema'}: {c.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {correcting ? (
            <IdentityDialog
              buyer={d.buyer}
              onCancel={() => setCorrecting(false)}
              onDone={() => {
                setCorrecting(false);
                setFullCpf(null);
                setVersion(v => v + 1);
              }}
            />
          ) : null}
        </>
      ) : null}
    </Gate>
  );
}

/** Correção de e-mail ou CPF (RF-06, ADM13): validação, confirmação em dois passos, motivo obrigatório, trilha e sessões encerradas. */
function IdentityDialog({
  buyer,
  onCancel,
  onDone,
}: {
  buyer: { id: string; name: string; email: string };
  onCancel: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState(buyer.email);
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const emailChanged = email.trim().toLowerCase() !== buyer.email.toLowerCase();
  const cpfDigits = cpf.replace(/\D/g, '');
  const dirty = emailChanged || cpfDigits !== '' || birthDate !== '' || reason !== '';
  useLeaveGuard(dirty);
  const cancel = () => {
    if (dirty && !window.confirm('Descartar a correção?')) return;
    onCancel();
  };
  const check = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!emailChanged && !cpfDigits && !birthDate)
      errs.email = 'Altere o e-mail, ou informe o CPF ou a data de nascimento correta.';
    if (emailChanged && !isEmailLike(email)) errs.email = 'Informe um e-mail válido.';
    if (cpfDigits && !isCpfValid(cpfDigits)) errs.cpf = 'CPF inválido: confira os números.';
    if (reason.trim().length < 5) errs.reason = 'Informe o motivo (pelo menos 5 caracteres).';
    setErrors(errs);
    if (!Object.keys(errs).length) setStep('confirm');
  };
  const confirm = async () => {
    setBusy(true);
    setFormError('');
    try {
      await api.admin.correctIdentity(buyer.id, {
        ...(emailChanged ? { email: email.trim() } : {}),
        ...(cpfDigits ? { cpf: cpfDigits } : {}),
        ...(birthDate ? { birthDate } : {}),
        reason: reason.trim(),
      });
      toast('Dados corrigidos. O comprador precisa entrar de novo.');
      onDone();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      setFormError(Object.keys(fe).length ? '' : errorText(err, 'Não foi possível corrigir.'));
      setStep('form');
      setBusy(false);
    }
  };
  if (step === 'confirm')
    return (
      <ConfirmDialog
        title={`Confirmar a correção de ${buyer.name}?`}
        confirmLabel="Confirmar correção"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setStep('form')}
      >
        <ul className="px-minilist">
          {emailChanged ? (
            <li>
              E-mail: <span className="px-break">{buyer.email}</span> passa a ser{' '}
              <b className="px-break">{email.trim()}</b>
            </li>
          ) : null}
          {cpfDigits ? (
            <li>
              CPF passa a ser <b className="px-mono">{maskCpfInput(cpfDigits)}</b>
            </li>
          ) : null}
          {birthDate ? (
            <li>
              Data de nascimento passa a ser <b>{birthDate.split('-').reverse().join('/')}</b>. O aviso de menor dos
              pedidos de eventos futuros é refeito.
            </li>
          ) : null}
          <li>Motivo: {reason.trim()}</li>
        </ul>
        <p className="px-small">
          A correção fica na trilha de auditoria com o seu nome e o motivo. As sessões abertas do comprador são
          encerradas e ele entra de novo com o e-mail corrigido.
        </p>
      </ConfirmDialog>
    );
  return (
    <div className="px-modal-bg" onClick={() => cancel()}>
      <form
        className="px-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="id-title"
        onSubmit={check}
        onClick={e => e.stopPropagation()}
        noValidate
      >
        <h2 id="id-title" className="px-h3">
          Corrigir e-mail, CPF ou data de nascimento
        </h2>
        <p className="px-small">
          Só o administrador corrige esses dados, para evitar fraude. O comprador não altera e-mail nem CPF pela própria
          conta.
        </p>
        {formError ? (
          <p className="px-notice px-notice-err" role="alert">
            {formError}
          </p>
        ) : null}
        <FormField id="id-email" label="E-mail" error={errors.email}>
          <input
            id="id-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={e => setEmail(e.target.value)}
            {...described('id-email', errors.email)}
          />
        </FormField>
        <FormField id="id-cpf" label="CPF correto (deixe vazio para não mudar)" error={errors.cpf}>
          <input
            id="id-cpf"
            inputMode="numeric"
            autoComplete="off"
            value={cpf}
            onChange={e => setCpf(maskCpfInput(e.target.value))}
            {...described('id-cpf', errors.cpf)}
          />
        </FormField>
        <FormField
          id="id-birthDate"
          label="Data de nascimento correta (deixe vazio para não mudar)"
          error={errors.birthDate}
        >
          <input
            id="id-birthDate"
            type="date"
            value={birthDate}
            onChange={e => setBirthDate(e.target.value)}
            {...described('id-birthDate', errors.birthDate)}
          />
        </FormField>
        <FormField id="id-reason" label="Motivo (fica na trilha de auditoria)" error={errors.reason}>
          <textarea
            id="id-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={e => setReason(e.target.value)}
            {...described('id-reason', errors.reason)}
          />
        </FormField>
        <div className="px-actions">
          <button type="button" className="px-btn" onClick={cancel}>
            Cancelar
          </button>
          <button type="submit" className="px-btn px-btn-pri">
            Revisar correção
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- ADM14, ADM15: ingressos ----------

export function AdminTicketsPage() {
  usePageTitle('Ingressos · PartyX');
  const access = useAdmin('/admin/ingressos');
  const [events, retry] = useFetch(s => api.admin.events(s), access === 'ok' ? 'events' : 'espera');
  const [eventId, setEventId] = useQueryParam('evento');
  return (
    <Gate access={access} active="ingressos">
      <h1 className="px-h1">Ingressos</h1>
      <Loading state={events} retry={retry} />
      {events.status === 'ok' ? (
        <>
          <form className="px-filters" onSubmit={e => e.preventDefault()}>
            <EventPicker
              id="tk-ev"
              events={events.data}
              value={eventId}
              onChange={setEventId}
              filter={e => e.status !== 'rascunho'}
            />
          </form>
          {eventId ? (
            <TicketsPanel key={eventId} eventId={eventId} />
          ) : (
            <p className="px-muted">Escolha o evento para ver os ingressos emitidos.</p>
          )}
        </>
      ) : null}
    </Gate>
  );
}

export function AdminTicketPage({ id }: { id: string }) {
  usePageTitle('Ingresso · PartyX');
  const access = useAdmin(`/admin/ingressos/${id}`);
  const [version, setVersion] = useState(0);
  const [state, retry] = useFetch(s => api.admin.ticket(id, s), access === 'ok' ? `tk|${id}|${version}` : 'espera');
  const [cancelling, setCancelling] = useState(false);
  const t = state.status === 'ok' ? state.data.ticket : null;
  return (
    <Gate access={access} active="ingressos">
      <p>
        <Link
          to={t ? `/admin/ingressos?evento=${t.event.id}` : '/admin/ingressos'}
          className="px-textlink px-textlink-sm"
        >
          <IconBack size={18} />
          Ingressos
        </Link>
      </p>
      <Loading state={state} retry={retry} />
      {t ? (
        <>
          <h1 className="px-h1 px-mono">{t.shortCode}</h1>
          <p>
            <Badge map={TICKET_LABEL} value={t.status} /> {t.typeName} · {brl(t.priceCents)} · {t.event.name}
          </p>
          {t.status === 'cancelado' && t.cancellation ? (
            <p className="px-notice px-notice-err" role="note">
              Cancelado em {when(t.cancellation.at)}
              {t.cancellation.by ? ` por ${t.cancellation.by}` : ' pelo sistema (estorno ou contestação no gateway)'}
              {t.cancellation.reason ? `. Motivo: ${t.cancellation.reason}` : ''}. A portaria recusa este ingresso.
            </p>
          ) : null}
          <dl className="px-facts">
            <div>
              <dt>Titular</dt>
              <dd>{t.holderName}</dd>
            </div>
            <div>
              <dt>Comprador</dt>
              <dd>
                <Link to={`/admin/compradores/${t.buyer.id}`}>{t.buyer.name}</Link>
              </dd>
              <dd className="px-facts-sub px-break">
                {t.buyer.email} · CPF {t.buyer.cpf ?? 'não informado'}
              </dd>
            </div>
            <div>
              <dt>Pedido</dt>
              <dd>
                <Link to={`/admin/pedidos/${t.order.id}`}>PX-{t.order.number}</Link> ·{' '}
                {ORDER_LABEL[t.order.status]?.[1] ?? t.order.status}
              </dd>
              <dd className="px-facts-sub">Pagamento aprovado em {when(t.order.paidAt)}</dd>
            </div>
            <div>
              <dt>Emissão</dt>
              <dd>{when(t.issuedAt)}</dd>
            </div>
            <div>
              <dt>Entrada</dt>
              <dd>{t.entry ? `${when(t.entry.at)} por ${t.entry.validator ?? 'validador'}` : 'ainda não entrou'}</dd>
            </div>
          </dl>
          {t.status === 'valido' ? (
            <div className="px-adm-actions">
              <button type="button" className="px-btn px-btn-danger" onClick={() => setCancelling(true)}>
                Cancelar ingresso
              </button>
            </div>
          ) : null}
          <h2 className="px-h3">Tentativas na portaria</h2>
          {state.status === 'ok' && state.data.attempts.length ? (
            <ul className="px-trail">
              {state.data.attempts.map((a, i) => (
                <li key={i}>
                  {when(a.at)} ·{' '}
                  {a.result === 'valido' ? 'Entrou' : a.result === 'ja_utilizado' ? 'Já utilizado' : a.result}
                  {a.method === 'manual' ? ' (manual)' : ''} · {a.validator}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-muted">Nenhuma leitura deste ingresso.</p>
          )}
          {cancelling ? (
            <CancelDialog
              title={`Cancelar o ingresso ${t.shortCode}?`}
              onCancel={() => setCancelling(false)}
              onConfirm={async reason => {
                await api.admin.cancelTicket(t.id, reason);
                setCancelling(false);
                toast(`Ingresso ${t.shortCode} cancelado. A portaria passa a recusá-lo.`);
                setVersion(v => v + 1);
              }}
            />
          ) : null}
        </>
      ) : null}
    </Gate>
  );
}

// ---------- ADM19: entradas ----------

export function AdminEntriesPage() {
  usePageTitle('Entradas · PartyX');
  const access = useAdmin('/admin/entradas');
  const [events, retry] = useFetch(s => api.admin.events(s), access === 'ok' ? 'events' : 'espera');
  const [eventId, setEventId] = useQueryParam('evento');
  const candidates = events.status === 'ok' ? events.data.filter(e => e.status !== 'rascunho') : [];
  // Sem escolha ainda: o próximo evento (ou o que está acontecendo).
  useEffect(() => {
    if (eventId || !candidates.length) return;
    const now = Date.now();
    const next =
      [...candidates]
        .filter(e => new Date(e.startsAt).getTime() > now - 24 * 3_600_000)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? candidates[0]!;
    setEventId(next.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.length]);
  const ev = candidates.find(e => e.id === eventId);
  return (
    <Gate access={access} active="entradas">
      <h1 className="px-h1">Entradas</h1>
      <Loading state={events} retry={retry} />
      {events.status === 'ok' ? (
        candidates.length === 0 ? (
          <p className="px-muted">Nenhum evento publicado ainda.</p>
        ) : (
          <>
            <form className="px-filters" onSubmit={e => e.preventDefault()}>
              <EventPicker id="en-ev" events={candidates} value={eventId} onChange={setEventId} />
            </form>
            {ev ? (
              <p className="px-small">
                <EventStatusBadge status={ev.status} /> {dateShort(ev.startsAt)} às {timeOf(ev.startsAt)} · {ev.venue}
              </p>
            ) : null}
            {eventId ? <LiveEntriesPanel key={eventId} eventId={eventId} /> : null}
          </>
        )
      ) : null}
    </Gate>
  );
}

// ---------- ADM20 a ADM22: equipe ----------

const ROLE_LABEL: Record<TeamMember['role'], string> = { administrador: 'Administrador', validador: 'Validador' };

export function AdminTeamPage() {
  usePageTitle('Equipe · PartyX');
  const access = useAdmin('/admin/equipe');
  const session = useSession();
  const me = session.user?.id;
  const [version, setVersion] = useState(0);
  const [state, retry] = useFetch(s => api.admin.team(s), access === 'ok' ? `team|${version}` : 'espera');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<TeamMember | 'novo' | null>(null);
  const [action, setAction] = useState<{ member: TeamMember; kind: 'ativar' | 'desativar' | 'senha' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [password, setPassword] = useState<{ member: TeamMember; value: string } | null>(null);
  const all = state.status === 'ok' ? state.data : [];
  const rows = all.filter(m => !q.trim() || fold(`${m.name} ${m.email}`).includes(fold(q.trim())));
  const run = async () => {
    if (!action) return;
    setBusy(true);
    setActionError('');
    try {
      if (action.kind === 'senha') {
        const r = await api.admin.temporaryPassword(action.member.id);
        setPassword({ member: r.member, value: r.temporaryPassword });
      } else {
        await api.admin.setMemberActive(action.member.id, action.kind === 'ativar');
        toast(
          action.kind === 'ativar' ? `${action.member.name} foi ativado.` : `${action.member.name} foi desativado.`,
        );
      }
      setAction(null);
      setVersion(v => v + 1);
    } catch (err) {
      setActionError(errorText(err, 'Não foi possível concluir.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Gate access={access} active="equipe">
      <div className="px-adm-head">
        <h1 className="px-h1">Equipe</h1>
        <button type="button" className="px-btn px-btn-pri" onClick={() => setEditing('novo')}>
          Novo usuário
        </button>
      </div>
      <p className="px-small px-muted">Perfis: administrador (painel e portaria) e validador (só a portaria).</p>
      <form className="px-filters" role="search" onSubmit={e => e.preventDefault()}>
        <div className="px-field">
          <label htmlFor="eq-q">Buscar por nome ou e-mail</label>
          <input id="eq-q" type="search" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </form>
      <Loading state={state} retry={retry} />
      {state.status === 'ok' ? (
        rows.length === 0 ? (
          <p className="px-muted">Ninguém encontrado.</p>
        ) : (
          <ul className="px-adm-list">
            {rows.map(m => (
              <li key={m.id} className="px-adm-card">
                <div className="px-adm-card-main">
                  <span className="px-adm-card-title">
                    {m.name}
                    {m.id === me ? ' (você)' : ''}
                  </span>
                  <span className="px-small px-muted px-break">
                    {m.email} · último acesso {when(m.lastLoginAt)}
                  </span>
                </div>
                <div className="px-adm-card-status">
                  <span className="px-badge px-badge-info">{ROLE_LABEL[m.role]}</span>
                  <span className={`px-badge px-badge-${m.isActive ? 'ok' : 'neu'}`}>
                    {m.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                  {m.mustChangePassword ? (
                    <span className="px-badge px-badge-warn">Troca de senha pendente</span>
                  ) : null}
                </div>
                <div className="px-adm-actions" role="group" aria-label={`Ações de ${m.name}`}>
                  <button type="button" className="px-btn" onClick={() => setEditing(m)}>
                    Editar
                  </button>
                  {m.id !== me ? (
                    <>
                      <button
                        type="button"
                        className="px-btn"
                        onClick={() => setAction({ member: m, kind: m.isActive ? 'desativar' : 'ativar' })}
                      >
                        {m.isActive ? 'Desativar' : 'Ativar'}
                      </button>
                      <button type="button" className="px-btn" onClick={() => setAction({ member: m, kind: 'senha' })}>
                        Nova senha temporária
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {editing ? (
        <MemberDialog
          member={editing === 'novo' ? null : editing}
          isSelf={editing !== 'novo' && editing.id === me}
          onCancel={() => setEditing(null)}
          onSaved={created => {
            setEditing(null);
            if (created) setPassword(created);
            setVersion(v => v + 1);
          }}
        />
      ) : null}
      {action ? (
        <ConfirmDialog
          title={
            action.kind === 'desativar'
              ? `Desativar ${action.member.name}?`
              : action.kind === 'ativar'
                ? `Ativar ${action.member.name}?`
                : `Gerar nova senha temporária para ${action.member.name}?`
          }
          confirmLabel={action.kind === 'desativar' ? 'Desativar' : action.kind === 'ativar' ? 'Ativar' : 'Gerar senha'}
          danger={action.kind !== 'ativar'}
          busy={busy}
          error={actionError || null}
          onConfirm={run}
          onCancel={() => {
            setAction(null);
            setActionError('');
          }}
        >
          {action.kind === 'desativar' ? (
            <p>
              <b>{action.member.name} perde o acesso na hora</b>: não consegue mais entrar e as sessões abertas
              (inclusive na portaria) são encerradas. O histórico de validações e ações continua registrado.
            </p>
          ) : action.kind === 'ativar' ? (
            <p>O acesso volta com a senha que a pessoa já tinha.</p>
          ) : (
            <p>
              A senha atual deixa de valer, as sessões abertas são encerradas e a nova senha só aparece uma vez. No
              próximo acesso, a pessoa precisa trocá-la.
            </p>
          )}
        </ConfirmDialog>
      ) : null}
      {password ? (
        <TemporaryPasswordDialog name={password.member.name} value={password.value} onClose={() => setPassword(null)} />
      ) : null}
    </Gate>
  );
}

function MemberDialog({
  member,
  isSelf,
  onCancel,
  onSaved,
}: {
  member: TeamMember | null;
  isSelf: boolean;
  onCancel: () => void;
  onSaved: (created: { member: TeamMember; value: string } | null) => void;
}) {
  const initial = {
    name: member?.name ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    role: member?.role ?? ('validador' as TeamMember['role']),
  };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useLeaveGuard(dirty);
  const accessChanges = Boolean(member) && (form.role !== initial.role || form.email.trim() !== initial.email);
  const cancel = () => {
    if (dirty && !window.confirm('Descartar as alterações?')) return;
    onCancel();
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Informe o nome.';
    if (!isEmailLike(form.email)) errs.email = 'Informe um e-mail válido.';
    if (form.phone.trim() && form.phone.replace(/\D/g, '').length < 10) errs.phone = 'Informe o telefone com DDD.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (
      accessChanges &&
      !window.confirm('O perfil ou o e-mail mudou: as sessões abertas desta pessoa serão encerradas. Continuar?')
    )
      return;
    setBusy(true);
    setFormError('');
    const body = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      role: form.role,
    };
    try {
      if (member) {
        await api.admin.updateMember(
          member.id,
          isSelf ? { name: body.name, email: body.email, phone: body.phone } : body,
        );
        toast('Usuário salvo.');
        onSaved(null);
      } else {
        const r = await api.admin.createMember(body);
        toast(`${r.member.name} foi criado.`);
        onSaved({ member: r.member, value: r.temporaryPassword });
      }
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else setFormError(errorText(err, 'Não foi possível salvar.'));
      setBusy(false);
    }
  };
  return (
    <div className="px-modal-bg" onClick={() => !busy && cancel()}>
      <form
        className="px-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mb-title"
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        noValidate
      >
        <h2 id="mb-title" className="px-h3">
          {member ? `Editar ${member.name}` : 'Novo usuário da equipe'}
        </h2>
        {formError ? (
          <p className="px-notice px-notice-err" role="alert">
            {formError}
          </p>
        ) : null}
        <FormField id="mb-name" label="Nome" error={errors.name}>
          <input
            id="mb-name"
            value={form.name}
            maxLength={120}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            {...described('mb-name', errors.name)}
          />
        </FormField>
        <FormField id="mb-email" label="E-mail (login)" error={errors.email}>
          <input
            id="mb-email"
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            {...described('mb-email', errors.email)}
          />
        </FormField>
        <FormField id="mb-phone" label="Telefone (opcional)" error={errors.phone}>
          <input
            id="mb-phone"
            inputMode="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            {...described('mb-phone', errors.phone)}
          />
        </FormField>
        <FormField
          id="mb-role"
          label="Perfil"
          hint={
            isSelf
              ? 'Você não pode alterar o seu próprio perfil.'
              : 'Validador só acessa a portaria; administrador acessa o painel e a portaria.'
          }
        >
          <select
            id="mb-role"
            value={form.role}
            disabled={isSelf}
            onChange={e => setForm(f => ({ ...f, role: e.target.value as TeamMember['role'] }))}
            {...described('mb-role', undefined, true)}
          >
            <option value="validador">Validador</option>
            <option value="administrador">Administrador</option>
          </select>
        </FormField>
        {!member ? (
          <p className="px-small px-muted">
            O sistema gera uma senha temporária segura, que aparece uma única vez depois de criar. No primeiro acesso, a
            pessoa troca a senha.
          </p>
        ) : accessChanges ? (
          <p className="px-notice px-notice-info">
            Mudar o perfil ou o e-mail encerra as sessões abertas desta pessoa.
          </p>
        ) : null}
        <div className="px-actions">
          <button type="button" className="px-btn" onClick={cancel} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="px-btn px-btn-pri" disabled={busy}>
            {busy ? 'Salvando…' : member ? 'Salvar' : 'Criar usuário'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Senha temporária: aparece uma vez só, com cópia e orientação de entrega por canal seguro. */
function TemporaryPasswordDialog({ name, value, onClose }: { name: string; value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="px-modal-bg">
      <div className="px-modal" role="alertdialog" aria-modal="true" aria-labelledby="tp-title">
        <h2 id="tp-title" className="px-h3">
          Senha temporária de {name}
        </h2>
        <p className="px-temp-password px-mono" aria-label="Senha temporária">
          {value}
        </p>
        <p className="px-small">
          Ela <b>só aparece agora</b>. Entregue por um canal seguro (pessoalmente ou mensagem direta), nunca em grupo.
          No primeiro acesso, a pessoa define a própria senha.
        </p>
        <p role="status" className="px-small">
          {copied ? 'Copiada.' : ''}
        </p>
        <div className="px-actions">
          <button
            type="button"
            className="px-btn"
            onClick={() =>
              navigator.clipboard
                .writeText(value)
                .then(() => setCopied(true))
                .catch(() => setCopied(false))
            }
          >
            Copiar
          </button>
          <button ref={ref} type="button" className="px-btn px-btn-pri" onClick={onClose}>
            Já anotei, fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- ADM24: conta do administrador ----------

export function AdminAccountPage() {
  usePageTitle('Minha conta · PartyX');
  const access = useAdmin('/admin/conta');
  const session = useSession();
  const { go } = useRouter();
  const user = session.user;
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState(false);
  useEffect(() => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
  }, [user?.name, user?.phone]);
  const dirty = Boolean(user) && (name !== user!.name || phone !== (user!.phone ?? ''));
  useLeaveGuard(dirty);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api.updateProfile(name.trim(), phone.trim());
      await session.reload();
      toast('Dados salvos.');
    } catch (err) {
      setErrors(err instanceof ApiError ? err.fields : {});
      if (!(err instanceof ApiError && Object.keys(err.fields).length))
        toast(errorText(err, 'Não foi possível salvar.'), 'err');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Gate access={access} active="conta">
      <h1 className="px-h1">Minha conta</h1>
      {user ? (
        <>
          <dl className="px-facts">
            <div>
              <dt>E-mail (login)</dt>
              <dd className="px-break">{user.email}</dd>
            </div>
            <div>
              <dt>Perfil</dt>
              <dd>Administrador</dd>
            </div>
          </dl>
          <form className="px-form-grid" onSubmit={save} noValidate>
            <FormField id="ac-name" label="Nome" error={errors.name}>
              <input
                id="ac-name"
                value={name}
                maxLength={120}
                onChange={e => setName(e.target.value)}
                {...described('ac-name', errors.name)}
              />
            </FormField>
            <FormField id="ac-phone" label="Telefone" error={errors.phone}>
              <input
                id="ac-phone"
                inputMode="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                {...described('ac-phone', errors.phone)}
              />
            </FormField>
            <div className="px-actions px-field-wide px-adm-actions">
              <button type="submit" className="px-btn px-btn-pri" disabled={busy || !dirty}>
                {busy ? 'Salvando…' : 'Salvar dados'}
              </button>
              <button type="button" className="px-btn" onClick={() => setPw(true)}>
                Alterar senha
              </button>
              <button
                type="button"
                className="px-btn"
                onClick={() => void session.logout().then(() => go('/', { force: true }))}
              >
                Sair
              </button>
            </div>
          </form>
          <p className="px-small px-muted">
            O e-mail de login é alterado por outro administrador, em Equipe. Credenciais de infraestrutura (banco,
            nuvem, gateway) não ficam no painel.
          </p>
        </>
      ) : null}
      {pw ? (
        <PasswordDialog
          onClose={() => setPw(false)}
          onDone={() => {
            setPw(false);
            toast('Senha alterada.');
          }}
        />
      ) : null}
    </Gate>
  );
}
