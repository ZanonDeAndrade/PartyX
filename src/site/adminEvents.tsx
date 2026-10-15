import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  api,
  ApiError,
  uploadBanner,
  type AdminEvent,
  type AdminLot,
  type AdminTicketType,
  type EventRemovalCheck,
  type EventsMeta,
  type EventStatus,
  type FieldProblem,
} from './api';
import { BuyersPanel, ContingencyPanel, Gate, LiveEntriesPanel, Loading, TicketsPanel, useAdmin } from './adminPages';
import { Layout, toast, usePageTitle } from './components';
import {
  attractionsFromText,
  brl,
  centsFromMasked,
  dateShort,
  isoToZonedInputs,
  maskedFromCents,
  timeOf,
  zonedInputsToIso,
} from './format';
import { EventView } from './pages';
import { IconBack } from './icons';
import { Link, useLeaveGuard, useRouter } from './router';
import { useFetch } from './useFetch';

/**
 * Painel de eventos e tipos de ingresso (ADM02 a ADM06). Toda regra é conferida pela API (`server/src/api/events.ts`): perfil de
 * administrador, estado do evento, valor maior que zero, capacidade mínima, período. A tela só orienta e mostra o que a API responde.
 * Publicar, encerrar, editar, banner e tipos ficam na trilha de auditoria pelo próprio serviço.
 */

const STATUS_LABEL: Record<EventStatus, string> = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  encerrado: 'Encerrado',
};
const STATUS_TONE: Record<EventStatus, string> = { rascunho: 'warn', publicado: 'ok', encerrado: 'neu' };

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <span className={`px-badge px-badge-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

const TYPE_STATE: Record<AdminTicketType['salesState'], [string, string]> = {
  a_venda: ['ok', 'À venda'],
  em_breve: ['info', 'Vendas em breve'],
  encerrada: ['neu', 'Vendas encerradas'],
  indisponivel: ['neu', 'Inativo'],
  esgotado: ['err', 'Esgotado'],
  reservado: ['warn', 'Tudo reservado no momento'],
};

/** Campos com erro da API (`detalhes: [{ campo, mensagem }]`), traduzidos para os campos da tela. */
export function fieldErrors(error: unknown, map: Record<string, string> = {}): Record<string, string> {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return {};
  const out: Record<string, string> = {};
  for (const d of error.details as FieldProblem[]) {
    if (d && typeof d.campo === 'string') out[map[d.campo] ?? d.campo] ??= d.mensagem;
  }
  return out;
}

export const errorText = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Campo com rótulo, dica e erro ligados por `aria-describedby`, no mesmo padrão dos formulários da conta. */
export function FormField({
  id,
  label,
  error,
  hint,
  wide,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`px-field${wide ? ' px-field-wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <small id={`${id}-erro`} className="px-error" role="alert">
          {error}
        </small>
      ) : null}
      {hint ? (
        <small id={`${id}-dica`} className="px-hint">
          {hint}
        </small>
      ) : null}
    </div>
  );
}
export const described = (id: string, error?: string, hint?: unknown) => ({
  'aria-invalid': error ? true : undefined,
  'aria-describedby': [error ? `${id}-erro` : '', hint ? `${id}-dica` : ''].filter(Boolean).join(' ') || undefined,
});

/** Diálogo de confirmação, com o impacto explicado no corpo. Esc e o fundo cancelam (exceto durante o envio). */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);
  return (
    <div className="px-modal-bg" onClick={() => !busy && onCancel()}>
      <div
        className="px-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="px-h3">
          {title}
        </h2>
        <div id="confirm-body">{children}</div>
        {error ? (
          <div className="px-notice px-notice-err" role="alert">
            {error}
          </div>
        ) : null}
        <div className="px-actions">
          <button ref={first} type="button" className="px-btn" onClick={onCancel} disabled={busy}>
            Voltar
          </button>
          <button
            type="button"
            className={`px-btn ${danger ? 'px-btn-danger' : 'px-btn-pri'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Aguarde…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type StatusAction = 'publicar' | 'vendas' | 'encerrar';

const whenText = (iso: string) => `${dateShort(iso)} às ${timeOf(iso)}`;
const sameDayAsToday = (iso: string) => isoToZonedInputs(iso).date === isoToZonedInputs(new Date().toISOString()).date;

/**
 * Publicar, encerrar vendas agora ou encerrar o evento, com o impacto explicado (ADM02, ADM04).
 * - "Encerrar vendas agora": ninguém mais compra; o evento segue publicado e a portaria funciona normalmente.
 * - "Encerrar evento": sai do site e para as vendas; a portaria ainda abre o evento dentro da janela operacional (D-79).
 * Nenhum dos dois cancela ingressos ou faz estorno. O motivo de recusa da API aparece no próprio diálogo, com o caminho para corrigir.
 */
function StatusChangeDialog({
  event,
  action: initialAction,
  meta,
  onDone,
  onCancel,
}: {
  event: Pick<AdminEvent, 'id' | 'name' | 'startsAt'>;
  action: StatusAction;
  meta: EventsMeta | null;
  onDone: (event: AdminEvent) => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState<StatusAction>(initialAction);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'publicar') {
        const res = await api.admin.publishEvent(event.id);
        toast(`"${event.name}" foi publicado.`);
        onDone(res.event);
      } else if (action === 'vendas') {
        const res = await api.admin.stopSales(event.id);
        toast(
          res.typesClosed > 0
            ? `Vendas encerradas: ${res.typesClosed} tipo${res.typesClosed === 1 ? '' : 's'} fora de venda a partir de agora.`
            : 'Nenhum tipo estava à venda: nada mudou.',
        );
        onDone(res.event);
      } else {
        const res = await api.admin.closeEvent(event.id);
        toast(`"${event.name}" foi encerrado.`);
        onDone(res.event);
      }
    } catch (err) {
      const fields = fieldErrors(err);
      setError(
        <>
          <b>{errorText(err, 'Não foi possível concluir.')}</b>
          {Object.keys(fields).length ? (
            <ul className="px-minilist">
              {Object.entries(fields).map(([campo, msg]) => (
                <li key={campo}>
                  {msg}{' '}
                  {campo === 'ticketTypes' ? (
                    <Link to={`/admin/eventos/${event.id}?aba=tipos`}>Cadastrar tipos de ingresso</Link>
                  ) : campo === 'startsAt' ? (
                    <Link to={`/admin/eventos/${event.id}/editar`}>Corrigir a data</Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>,
      );
      setBusy(false);
    }
  };
  const noReturn = 'Isso não cancela ingressos nem faz estorno: pedidos e ingressos emitidos continuam valendo.';

  if (action === 'publicar')
    return (
      <ConfirmDialog
        title={`Publicar "${event.name}"?`}
        confirmLabel="Publicar evento"
        busy={busy}
        error={error}
        onConfirm={confirm}
        onCancel={onCancel}
      >
        <p>
          O evento passa a aparecer na página inicial, na busca e no link próprio. Os tipos de ingresso <b>ativos</b>{' '}
          ficam à venda conforme o período de cada um.
        </p>
        <p className="px-small px-muted">
          É preciso data futura e ao menos um tipo de ingresso ativo. Depois de publicado, o evento não volta a
          rascunho; ainda é possível editar as informações e os tipos.
        </p>
      </ConfirmDialog>
    );

  if (action === 'vendas')
    return (
      <ConfirmDialog
        title={`Encerrar as vendas de "${event.name}" agora?`}
        confirmLabel="Encerrar vendas agora"
        busy={busy}
        error={error}
        onConfirm={confirm}
        onCancel={onCancel}
      >
        <p>
          <b>Encerrar vendas agora: ninguém mais compra; a portaria continua funcionando.</b>
        </p>
        <p>
          O fim das vendas de todos os tipos ativos passa a ser este momento. O evento continua publicado e a página
          dele mostra "vendas encerradas". Para reabrir, edite o período de vendas de um tipo.
        </p>
        <p className="px-small px-muted">
          Quem já estava pagando uma reserva (até {meta?.reservationMinutes ?? '…'} minutos) ainda pode concluir.{' '}
          {noReturn}
        </p>
      </ConfirmDialog>
    );

  // Encerrar evento: até quando a portaria ainda abre o evento (janela operacional, D-79).
  const w = meta?.gateWindow;
  const starts = new Date(event.startsAt).getTime();
  const opensAt = w ? new Date(starts - w.beforeHours * 3_600_000).toISOString() : null;
  const closesAt = w ? new Date(starts + w.afterHours * 3_600_000).toISOString() : null;
  const now = Date.now();
  const gateText = !closesAt
    ? 'a portaria continua funcionando durante a janela do evento.'
    : new Date(closesAt).getTime() < now
      ? `a janela da portaria para este evento terminou em ${whenText(closesAt)}: ela não abre mais este evento.`
      : opensAt && new Date(opensAt).getTime() > now
        ? `como faltam mais de ${w!.beforeHours} h para o início, é um cancelamento antecipado: a portaria não vai abrir este evento.`
        : `a portaria continua funcionando até ${whenText(closesAt)}.`;
  return (
    <ConfirmDialog
      title={`Encerrar "${event.name}"?`}
      confirmLabel="Encerrar evento"
      danger
      busy={busy}
      error={error}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      {sameDayAsToday(event.startsAt) ? (
        <div className="px-notice px-notice-info" role="note">
          <b>O evento é hoje.</b> "Encerrar vendas agora" costuma ser o mais indicado: para as vendas e mantém tudo
          funcionando, sem prazo para a portaria.{' '}
          <button type="button" className="px-btn" onClick={() => setAction('vendas')} disabled={busy}>
            Encerrar vendas agora
          </button>
        </div>
      ) : null}
      <p>
        <b>Encerrar evento: sai do site e para as vendas; {gateText}</b>
      </p>
      <p>
        A página pelo link continua no ar, marcada como encerrada. <b>Encerrar não cancela ingressos</b> nem faz
        estorno: pedidos e ingressos emitidos continuam registrados e válidos na portaria dentro desse período.
      </p>
      <p className="px-small px-muted">Não há como reabrir nem editar um evento encerrado.</p>
    </ConfirmDialog>
  );
}

/** Situação da portaria para um evento encerrado (D-79): aberta na janela, se encerrado dentro dela; fechada se encerrado antes. */
function gateNote(ev: AdminEvent, meta: EventsMeta | null): string {
  if (!meta) return '';
  const starts = new Date(ev.startsAt).getTime();
  const opensAt = starts - meta.gateWindow.beforeHours * 3_600_000;
  const closesAt = new Date(starts + meta.gateWindow.afterHours * 3_600_000).toISOString();
  const closed = new Date(ev.closedAt ?? ev.updatedAt).getTime();
  if (closed < opensAt)
    return 'Foi encerrado antes da data (cancelamento antecipado): a portaria não abre este evento.';
  if (Date.now() > new Date(closesAt).getTime()) return `A portaria funcionou até ${whenText(closesAt)}.`;
  return `A portaria continua funcionando até ${whenText(closesAt)}.`;
}

/**
 * Reabrir evento encerrado (só administrador): volta a publicado, a portaria volta a abrir, motivo obrigatório na trilha.
 * Os tipos mantêm o período: se as vendas já terminaram, o diálogo avisa que é preciso editar o período para voltar a vender.
 */
function ReopenDialog({ event, onCancel, onDone }: { event: AdminEvent; onCancel: () => void; onDone: () => void }) {
  const [detail] = useFetch(s => api.admin.event(event.id, s), `reabrir|${event.id}`);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);
  const types = detail.status === 'ok' ? detail.data.ticketTypes : null;
  const onSale = types?.filter(t => t.salesState === 'a_venda' || t.salesState === 'em_breve').length ?? 0;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.admin.reopenEvent(event.id, reason.trim());
      toast(
        res.typesOnSale > 0
          ? `"${event.name}" foi reaberto e está à venda.`
          : `"${event.name}" foi reaberto. Edite o período de um tipo para voltar a vender.`,
      );
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.reason ?? err.message) : 'Não foi possível reabrir.');
      setBusy(false);
    }
  };
  return (
    <div className="px-modal-bg" onClick={() => !busy && onCancel()}>
      <form
        className="px-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reopen-title"
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
      >
        <h2 id="reopen-title" className="px-h3">
          Reabrir "{event.name}"?
        </h2>
        <p>
          O evento volta a ficar <b>publicado</b>: aparece de novo no site e a <b>portaria volta a validar</b> os
          ingressos dele. Pedidos e ingressos não mudam.
        </p>
        {types === null ? (
          <p aria-busy="true" className="px-small">
            Conferindo os tipos de ingresso…
          </p>
        ) : onSale === 0 ? (
          <p className="px-notice px-notice-info" role="note">
            As vendas de todos os tipos estão encerradas ou inativas. Para voltar a vender, depois de reabrir, edite o
            período de vendas de um tipo.
          </p>
        ) : (
          <p className="px-small">
            {onSale} tipo{onSale === 1 ? '' : 's'} ainda dentro do período de vendas volta{onSale === 1 ? '' : 'm'} a
            vender na hora.
          </p>
        )}
        <div className="px-field">
          <label htmlFor="reopen-motivo">Motivo (fica na trilha de auditoria)</label>
          <textarea
            id="reopen-motivo"
            ref={first}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={e => setReason(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'reopen-erro' : undefined}
          />
          {error ? (
            <small id="reopen-erro" className="px-error" role="alert">
              {error}
            </small>
          ) : null}
        </div>
        <div className="px-actions">
          <button type="button" className="px-btn" onClick={onCancel} disabled={busy}>
            Voltar
          </button>
          <button type="submit" className="px-btn px-btn-pri" disabled={busy || reason.trim().length < 5}>
            {busy ? 'Reabrindo…' : 'Reabrir evento'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- excluir, arquivar e desarquivar (pedido de 15/10/2026) ----------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Mesma normalização do servidor (`normalizeName`): espaços nas pontas e repetidos não contam. */
const sameName = (a: string, b: string) => {
  const norm = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ');
  return norm(a) === norm(b);
};

/** O que impede a exclusão, só os números acima de zero. */
function UsageList({ usage }: { usage: EventRemovalCheck['usage'] }) {
  const items = [
    usage.orders ? `${plural(usage.orders, 'pedido', 'pedidos')} (em qualquer situação, inclusive pendente ou expirado)` : '',
    usage.tickets ? plural(usage.tickets, 'ingresso emitido', 'ingressos emitidos') : '',
    usage.checkins ? plural(usage.checkins, 'leitura na portaria', 'leituras na portaria') : '',
    usage.minorAcceptances ? plural(usage.minorAcceptances, 'aceite do termo de menor', 'aceites do termo de menor') : '',
  ].filter(Boolean);
  return (
    <ul className="px-effects">
      {items.map(t => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

/** O que arquivar faz: o mesmo texto no diálogo de exclusão recusada e no de arquivar direto. */
function ArchiveEffects() {
  return (
    <ul className="px-effects">
      <li>Sai da página inicial, da busca e do link público: quem abrir o link vê "evento não encontrado".</li>
      <li>Para de vender: ninguém faz compra nova.</li>
      <li>Sai da lista de eventos do painel. Para ver, escolha "Arquivados" em Situação.</li>
      <li>
        Pedidos, ingressos, relatórios e exportações continuam como estão, e a portaria continua validando os ingressos.
      </li>
      <li>Dá para desfazer com "Desarquivar".</li>
    </ul>
  );
}

/**
 * Excluir evento. Pergunta ao servidor se pode: sem pedido (em qualquer situação), ingresso, leitura de portaria nem aceite de termo de
 * menor, exclui de vez, com o nome do evento digitado como confirmação; com qualquer um deles, explica o motivo e oferece arquivar.
 * O servidor confere tudo de novo dentro da transação da exclusão: se um pedido entrar no meio, recusa e o diálogo passa a oferecer
 * arquivar. Só administrador (rotas sob /admin).
 */
function RemoveEventDialog({
  event,
  onCancel,
  onDone,
}: {
  event: AdminEvent;
  onCancel: () => void;
  onDone: (result: 'excluido' | 'arquivado') => void;
}) {
  const [check, retry] = useFetch(s => api.admin.eventRemoval(event.id, s), `remover|${event.id}`);
  const [archiveInstead, setArchiveInstead] = useState(false);
  /** Recusado na hora de excluir (um pedido entrou no meio): o que o servidor contou. */
  const [raced, setRaced] = useState<EventRemovalCheck['usage'] | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);
  const data = check.status === 'ok' ? check.data : null;
  const usage = raced ?? data?.usage ?? null;
  const deletable = data !== null && raced === null && data.deletable;
  const mode = !data ? 'carregando' : deletable && !archiveInstead ? 'excluir' : data.archived ? 'ja-arquivado' : 'arquivar';
  // Foco no primeiro controle útil de cada etapa (campo do nome, botão de arquivar ou voltar).
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, .px-actions button:last-child')?.focus();
  }, [mode]);

  const remove = async (e: FormEvent) => {
    e.preventDefault();
    if (!sameName(typed, event.name)) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.admin.deleteEvent(event.id, typed);
      toast(
        res.imagesPending
          ? `"${event.name}" foi excluído. As imagens não saíram do armazenamento agora; o erro ficou registrado para o suporte técnico.`
          : `"${event.name}" foi excluído.`,
      );
      onDone('excluido');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'evento_com_registros') {
        setRaced(err.details as EventRemovalCheck['usage']);
      } else {
        setError(err instanceof ApiError ? (err.fields.confirmName ?? err.message) : 'Não foi possível excluir.');
      }
      setBusy(false);
    }
  };
  const archive = async () => {
    setBusy(true);
    setError('');
    try {
      await api.admin.archiveEvent(event.id);
      toast(`"${event.name}" foi arquivado. Para ver, escolha "Arquivados" em Situação.`);
      onDone('arquivado');
    } catch (err) {
      setError(errorText(err, 'Não foi possível arquivar.'));
      setBusy(false);
    }
  };

  return (
    <div className="px-modal-bg" onClick={() => !busy && onCancel()}>
      <div
        ref={box}
        className="px-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remover-titulo"
        aria-describedby="remover-corpo"
        onClick={e => e.stopPropagation()}
      >
        {mode === 'carregando' ? (
          <>
            <h2 id="remover-titulo" className="px-h3">
              Excluir "{event.name}"?
            </h2>
            <div id="remover-corpo">
              {check.status === 'error' ? (
                <p className="px-notice px-notice-err" role="alert">
                  {check.code === 404 ? 'Este evento não existe mais.' : 'Não foi possível conferir o evento.'}{' '}
                  <button type="button" className="px-btn" onClick={retry}>
                    Tentar de novo
                  </button>
                </p>
              ) : (
                <p aria-busy="true">Conferindo pedidos, ingressos e leituras na portaria…</p>
              )}
            </div>
            <div className="px-actions">
              <button type="button" className="px-btn" onClick={onCancel}>
                Voltar
              </button>
            </div>
          </>
        ) : mode === 'excluir' ? (
          <form onSubmit={remove}>
            <h2 id="remover-titulo" className="px-h3">
              Excluir "{event.name}" de vez?
            </h2>
            <div id="remover-corpo">
              <p>
                <b>A exclusão é definitiva: não dá para desfazer.</b>
              </p>
              <ul className="px-effects">
                <li>
                  O evento e {plural(data!.ticketTypes, 'tipo de ingresso', 'tipos de ingresso')} saem do sistema.
                </li>
                {data!.hasBanner ? <li>O banner e as versões dele são apagados do armazenamento de imagens.</li> : null}
                <li>
                  O link <span className="px-mono px-break">/eventos/{event.slug}</span> deixa de funcionar.
                </li>
                <li>A trilha de auditoria guarda quem excluiu, quando, o id e o nome do evento.</li>
              </ul>
              <p className="px-small px-muted">
                Só é possível porque o evento não tem pedidos, ingressos, leituras na portaria nem aceites do termo de
                menor.
              </p>
            </div>
            <div className="px-field">
              <label htmlFor="remover-nome">
                Para confirmar, digite o nome do evento: <b className="px-break">{event.name}</b>
              </label>
              <input
                id="remover-nome"
                autoComplete="off"
                spellCheck={false}
                value={typed}
                onChange={e => setTyped(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'remover-erro' : undefined}
              />
              {error ? (
                <small id="remover-erro" className="px-error" role="alert">
                  {error}
                </small>
              ) : null}
            </div>
            <div className="px-actions">
              <button type="button" className="px-btn" onClick={onCancel} disabled={busy}>
                Voltar
              </button>
              <button type="submit" className="px-btn px-btn-danger" disabled={busy || !sameName(typed, event.name)}>
                {busy ? 'Excluindo…' : 'Excluir evento'}
              </button>
            </div>
            {!data!.archived ? (
              <p className="px-small">
                Prefere só tirar do ar, sem apagar?{' '}
                <button type="button" className="px-btn" onClick={() => setArchiveInstead(true)} disabled={busy}>
                  Arquivar em vez de excluir
                </button>
              </p>
            ) : null}
          </form>
        ) : (
          <>
            <h2 id="remover-titulo" className="px-h3">
              {usage && (usage.orders || usage.tickets || usage.checkins || usage.minorAcceptances)
                ? `"${event.name}" não pode ser excluído`
                : `Arquivar "${event.name}"?`}
            </h2>
            <div id="remover-corpo">
              {usage && (usage.orders || usage.tickets || usage.checkins || usage.minorAcceptances) ? (
                <>
                  <p>
                    {raced ? 'Um registro entrou enquanto você confirmava. ' : ''}O evento tem registros que precisam ficar
                    no histórico:
                  </p>
                  <UsageList usage={usage} />
                </>
              ) : null}
              {mode === 'ja-arquivado' ? (
                <p>Ele já está arquivado. Para devolver ao site, use "Desarquivar".</p>
              ) : (
                <>
                  <p>
                    <b>Você pode arquivar:</b>
                  </p>
                  <ArchiveEffects />
                </>
              )}
            </div>
            {error ? (
              <div className="px-notice px-notice-err" role="alert">
                {error}
              </div>
            ) : null}
            <div className="px-actions">
              <button type="button" className="px-btn" onClick={onCancel} disabled={busy}>
                Voltar
              </button>
              {mode === 'arquivar' ? (
                <button type="button" className="px-btn px-btn-pri" onClick={archive} disabled={busy}>
                  {busy ? 'Arquivando…' : 'Arquivar evento'}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Desarquivar: volta para a lista do painel e, se estiver publicado, para o site e para a venda, no período de cada tipo. */
function UnarchiveDialog({ event, onCancel, onDone }: { event: AdminEvent; onCancel: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await api.admin.unarchiveEvent(event.id);
      toast(`"${event.name}" foi desarquivado.`);
      onDone();
    } catch (err) {
      setError(errorText(err, 'Não foi possível desarquivar.'));
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog
      title={`Desarquivar "${event.name}"?`}
      confirmLabel="Desarquivar"
      busy={busy}
      error={error || null}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      <p>Volta para a lista de eventos do painel.</p>
      <p>
        {event.status === 'publicado'
          ? 'Como está publicado, volta para a página inicial, para a busca e para o link próprio, e as vendas seguem o período de cada tipo de ingresso.'
          : event.status === 'rascunho'
            ? 'Continua em rascunho: fora do site até ser publicado.'
            : 'Continua encerrado: a página pelo link volta a ficar acessível, sem venda.'}
      </p>
      <p className="px-small px-muted">O destaque na página inicial não volta sozinho.</p>
    </ConfirmDialog>
  );
}

// ---------- ADM02: lista de eventos ----------

export function AdminEventsPage() {
  usePageTitle('Eventos · PartyX');
  const access = useAdmin('/admin/eventos');
  const [version, setVersion] = useState(0);
  const [state, retry] = useFetch(s => api.admin.events(s), access === 'ok' ? `events|${version}` : 'espera');
  const [q, setQ] = useState('');
  // A lista padrão deixa os arquivados de fora; "Arquivados" mostra só eles, em qualquer situação.
  const [status, setStatus] = useState<'' | EventStatus | 'arquivados'>('');
  const [meta] = useFetch(s => api.admin.eventsMeta(s), access === 'ok' ? 'meta' : 'espera');
  const [target, setTarget] = useState<{ event: AdminEvent; action: StatusAction } | null>(null);
  const [reopening, setReopening] = useState<AdminEvent | null>(null);
  const [removing, setRemoving] = useState<AdminEvent | null>(null);
  const [unarchiving, setUnarchiving] = useState<AdminEvent | null>(null);
  const all = state.status === 'ok' ? state.data : [];
  const archivedCount = all.filter(e => e.archivedAt).length;
  const pool = useMemo(
    () => (status === 'arquivados' ? all.filter(e => e.archivedAt) : all.filter(e => !e.archivedAt)),
    [all, status],
  );
  const rows = useMemo(
    () =>
      pool.filter(
        e =>
          (!status || status === 'arquivados' || e.status === status) &&
          (!q.trim() || fold(e.name).includes(fold(q.trim()))),
      ),
    [pool, q, status],
  );
  return (
    <Gate access={access} active="eventos">
      <div className="px-adm-head">
        <h1 className="px-h1">Eventos</h1>
        <Link to="/admin/eventos/novo" className="px-btn px-btn-pri">
          Criar evento
        </Link>
      </div>
      <form className="px-filters" role="search" onSubmit={e => e.preventDefault()}>
        <div className="px-field">
          <label htmlFor="ev-q">Buscar pelo nome</label>
          <input id="ev-q" type="search" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="px-field">
          <label htmlFor="ev-st">Situação</label>
          <select
            id="ev-st"
            value={status}
            onChange={e => setStatus(e.target.value as '' | EventStatus | 'arquivados')}
          >
            <option value="">Todas</option>
            <option value="rascunho">Rascunho</option>
            <option value="publicado">Publicado</option>
            <option value="encerrado">Encerrado</option>
            <option value="arquivados">Arquivados</option>
          </select>
        </div>
      </form>
      <Loading state={state} retry={retry} />
      {state.status === 'ok' ? (
        <>
          <p className="px-count" role="status" aria-live="polite">
            {status === 'arquivados'
              ? plural(rows.length, 'evento arquivado', 'eventos arquivados')
              : rows.length === pool.length
                ? plural(pool.length, 'evento', 'eventos')
                : `${rows.length} de ${pool.length} eventos`}
            {status !== 'arquivados' && archivedCount > 0
              ? ` · ${plural(archivedCount, 'arquivado fora da lista', 'arquivados fora da lista')} (Situação: Arquivados)`
              : ''}
          </p>
          {all.length === 0 ? (
            <div className="px-box">
              <p>Nenhum evento cadastrado ainda.</p>
              <Link to="/admin/eventos/novo" className="px-btn px-btn-pri">
                Criar o primeiro evento
              </Link>
            </div>
          ) : rows.length === 0 ? (
            <p className="px-muted">Nenhum evento com esses filtros.</p>
          ) : (
            <ul className="px-adm-list">
              {rows.map(e => (
                <li key={e.id} className="px-adm-card">
                  <div className="px-adm-card-main">
                    <Link to={`/admin/eventos/${e.id}`} className="px-adm-card-title">
                      {e.name}
                    </Link>
                    <span className="px-muted px-small">
                      {dateShort(e.startsAt)} · {timeOf(e.startsAt)} · {e.venue}
                    </span>
                  </div>
                  <div className="px-adm-card-status">
                    <EventStatusBadge status={e.status} />
                    {e.archivedAt ? <span className="px-badge px-badge-dark">Arquivado</span> : null}
                    {e.isFeatured ? <span className="px-badge px-badge-info">Destaque</span> : null}
                  </div>
                  <div className="px-adm-actions" aria-label={`Ações de ${e.name}`} role="group">
                    {e.status !== 'encerrado' ? (
                      <Link to={`/admin/eventos/${e.id}/editar`} className="px-btn">
                        Editar
                      </Link>
                    ) : null}
                    <Link to={`/admin/eventos/${e.id}?aba=tipos`} className="px-btn">
                      Ingressos
                    </Link>
                    {e.archivedAt ? (
                      <button type="button" className="px-btn" onClick={() => setUnarchiving(e)}>
                        Desarquivar
                      </button>
                    ) : e.status === 'rascunho' ? (
                      <>
                        <Link to={`/admin/eventos/${e.id}/previa`} className="px-btn">
                          Pré-visualizar
                        </Link>
                        <button
                          type="button"
                          className="px-btn px-btn-pri"
                          onClick={() => setTarget({ event: e, action: 'publicar' })}
                        >
                          Publicar
                        </button>
                      </>
                    ) : (
                      <a href={`/eventos/${e.slug}`} target="_blank" rel="noopener noreferrer" className="px-btn">
                        Ver página pública
                      </a>
                    )}
                    {e.status === 'publicado' && !e.archivedAt ? (
                      <>
                        <button
                          type="button"
                          className="px-btn"
                          onClick={() => setTarget({ event: e, action: 'vendas' })}
                        >
                          Encerrar vendas agora
                        </button>
                        <button
                          type="button"
                          className="px-btn"
                          onClick={() => setTarget({ event: e, action: 'encerrar' })}
                        >
                          Encerrar evento
                        </button>
                      </>
                    ) : null}
                    {e.status === 'encerrado' && !e.archivedAt ? (
                      <button type="button" className="px-btn" onClick={() => setReopening(e)}>
                        Reabrir evento
                      </button>
                    ) : null}
                    <button type="button" className="px-btn px-btn-danger-line" onClick={() => setRemoving(e)}>
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      {target ? (
        <StatusChangeDialog
          event={target.event}
          action={target.action}
          meta={meta.status === 'ok' ? meta.data : null}
          onCancel={() => setTarget(null)}
          onDone={() => {
            setTarget(null);
            setVersion(v => v + 1);
          }}
        />
      ) : null}
      {reopening ? (
        <ReopenDialog
          event={reopening}
          onCancel={() => setReopening(null)}
          onDone={() => {
            setReopening(null);
            setVersion(v => v + 1);
          }}
        />
      ) : null}
      {removing ? (
        <RemoveEventDialog
          event={removing}
          onCancel={() => setRemoving(null)}
          onDone={() => {
            setRemoving(null);
            setVersion(v => v + 1);
          }}
        />
      ) : null}
      {unarchiving ? (
        <UnarchiveDialog
          event={unarchiving}
          onCancel={() => setUnarchiving(null)}
          onDone={() => {
            setUnarchiving(null);
            setVersion(v => v + 1);
          }}
        />
      ) : null}
    </Gate>
  );
}

// ---------- ADM03: criar e editar evento ----------

interface EventForm {
  name: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  description: string;
  attractions: string;
  ageRating: string;
  isFeatured: boolean;
  /** Fim previsto (vai na autorização de menores). */
  endDate: string;
  endTime: string;
  allowsMinors: boolean;
  /** Cronômetro na página do evento até o início. */
  countdownEnabled: boolean;
  /** Vazia: a frase padrão. */
  countdownPhrase: string;
}
const EMPTY_FORM: EventForm = {
  name: '',
  date: '',
  time: '',
  venue: '',
  address: '',
  description: '',
  attractions: '',
  ageRating: '',
  isFeatured: false,
  endDate: '',
  endTime: '',
  allowsMinors: false,
  countdownEnabled: true,
  countdownPhrase: '',
};
function formOf(e: AdminEvent): EventForm {
  const { date, time } = isoToZonedInputs(e.startsAt);
  const end = e.endsAt ? isoToZonedInputs(e.endsAt) : { date: '', time: '' };
  return {
    name: e.name,
    date,
    time,
    venue: e.venue,
    address: e.address,
    description: e.description,
    attractions: e.attractions.join('\n'),
    ageRating: e.ageRating,
    isFeatured: e.isFeatured,
    endDate: end.date,
    endTime: end.time,
    allowsMinors: e.allowsMinors,
    countdownEnabled: e.countdownEnabled,
    countdownPhrase: e.countdownPhrase ?? '',
  };
}
const SERVER_FIELD: Record<string, string> = { startsAt: 'date', slug: 'name', endsAt: 'endDate' };

export function AdminEventFormPage({ id }: { id?: string }) {
  usePageTitle(id ? 'Editar evento · PartyX' : 'Novo evento · PartyX');
  const access = useAdmin(id ? `/admin/eventos/${id}/editar` : '/admin/eventos/novo');
  const ok = access === 'ok';
  const [meta, retryMeta] = useFetch(s => api.admin.eventsMeta(s), ok ? 'meta' : 'espera');
  const [loaded, retryLoaded] = useFetch(
    s => (id ? api.admin.event(id, s) : Promise.resolve(null)),
    ok ? `ev|${id ?? 'novo'}` : 'espera',
  );
  const existing = loaded.status === 'ok' ? (loaded.data?.event ?? null) : null;
  return (
    <Gate access={access} active="eventos">
      <p>
        <Link to={id ? `/admin/eventos/${id}` : '/admin/eventos'} className="px-textlink px-textlink-sm">
          <IconBack size={18} />
          {id ? 'Evento' : 'Eventos'}
        </Link>
      </p>
      <h1 className="px-h1">{id ? 'Editar evento' : 'Criar evento'}</h1>
      <Loading state={meta} retry={retryMeta} />
      <Loading state={loaded} retry={retryLoaded} />
      {meta.status === 'ok' && loaded.status === 'ok' ? (
        existing?.status === 'encerrado' ? (
          <div className="px-notice px-notice-neu" role="status">
            <b>Este evento está encerrado.</b> Informações, banner e tipos não podem mais ser alterados.
          </div>
        ) : (
          <EventFormBody key={existing?.updatedAt ?? 'novo'} meta={meta.data} existing={existing} />
        )
      ) : null}
    </Gate>
  );
}

function EventFormBody({ meta, existing }: { meta: EventsMeta; existing: AdminEvent | null }) {
  const { go } = useRouter();
  const [event, setEvent] = useState<AdminEvent | null>(existing);
  const [saved, setSaved] = useState<EventForm>(existing ? formOf(existing) : EMPTY_FORM);
  const [form, setForm] = useState<EventForm>(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState<'' | 'salvar' | 'previa' | 'publicar'>('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved) || file !== null || removeBanner;
  useLeaveGuard(dirty);
  useEffect(() => () => void (filePreview && URL.revokeObjectURL(filePreview)), [filePreview]);

  const set = <K extends keyof EventForm>(key: K, value: EventForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => (e[key] ? { ...e, [key]: '' } : e));
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Informe o nome do evento.';
    else if (form.name.trim().length > meta.limits.nameMax) e.name = `Use no máximo ${meta.limits.nameMax} caracteres.`;
    if (!form.date) e.date = 'Informe a data.';
    if (!form.time) e.time = 'Informe o horário.';
    if (form.date && form.time && !zonedInputsToIso(form.date, form.time)) e.date = 'Data ou horário inválido.';
    if (!form.venue.trim()) e.venue = 'Informe o local.';
    if (!form.address.trim()) e.address = 'Informe o endereço.';
    if (!form.description.trim()) e.description = 'Informe a descrição.';
    else if (form.description.length > meta.limits.descriptionMax)
      e.description = `Use no máximo ${meta.limits.descriptionMax} caracteres.`;
    const attractions = attractionsFromText(form.attractions);
    if (attractions.length > meta.limits.attractionsMax || attractions.some(a => a.length > meta.limits.attractionMax))
      e.attractions = `Até ${meta.limits.attractionsMax} atrações, com até ${meta.limits.attractionMax} caracteres cada.`;
    if (!form.ageRating) e.ageRating = 'Escolha a classificação etária.';
    // Fim e regras de menores (as mesmas do servidor, que confere de novo).
    const hasEnd = Boolean(form.endDate || form.endTime);
    const endIso = form.endDate && form.endTime ? zonedInputsToIso(form.endDate, form.endTime) : null;
    const startIso = form.date && form.time ? zonedInputsToIso(form.date, form.time) : null;
    if (hasEnd && !endIso) e.endDate = 'Informe a data e o horário de fim.';
    else if (endIso && startIso && endIso <= startIso) e.endDate = 'O fim precisa ser depois do início.';
    if (form.allowsMinors) {
      if (!endIso && !e.endDate) e.endDate = 'Informe o fim: ele vai na autorização de menores.';
      if (form.ageRating === '18 anos') e.allowsMinors = 'Evento com classificação 18 anos não permite menores.';
    }
    // Frase do cronômetro: as mesmas regras do servidor (`checkCountdownPhrase`), que confere de novo.
    const phrase = form.countdownPhrase.trim().replace(/\s+/g, ' ');
    if (phrase.length > meta.limits.countdownPhraseMax)
      e.countdownPhrase = `Use no máximo ${meta.limits.countdownPhraseMax} caracteres.`;
    else if (/[<>]/.test(phrase)) e.countdownPhrase = 'Use só texto, sem os sinais < e >.';
    return e;
  };

  const focusFirstError = (e: Record<string, string>) => {
    const first = Object.keys(e).find(k => e[k]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#ev-${first}`)?.focus();
  };

  const chooseFile = (f: File | null) => {
    setErrors(e => ({ ...e, banner: '' }));
    if (!f) return;
    if (!meta.banner.formats.includes(f.type)) {
      setErrors(e => ({ ...e, banner: 'Formato não aceito. Use uma imagem JPG, PNG ou WebP.' }));
      return;
    }
    if (f.size > meta.banner.maxBytes) {
      setErrors(e => ({
        ...e,
        banner: `A imagem passa de ${megabytes(meta.banner.maxBytes)}. Escolha um arquivo menor.`,
      }));
      return;
    }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth < meta.banner.minWidth) {
        URL.revokeObjectURL(url);
        setErrors(e => ({ ...e, banner: `A imagem precisa ter pelo menos ${meta.banner.minWidth} px de largura.` }));
        return;
      }
      setFile(f);
      setFilePreview(url);
      setRemoveBanner(false);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErrors(e => ({ ...e, banner: 'Não foi possível ler a imagem. Escolha outro arquivo.' }));
    };
    img.src = url;
  };

  /** Salva os campos e, em seguida, o banner. Devolve o evento salvo, ou nulo se algo impediu. */
  const save = async (): Promise<AdminEvent | null> => {
    setFormError('');
    const local = validate();
    if (Object.values(local).some(Boolean)) {
      setErrors(local);
      focusFirstError(local);
      return null;
    }
    const body = {
      name: form.name.trim(),
      startsAt: zonedInputsToIso(form.date, form.time)!,
      venue: form.venue.trim(),
      address: form.address.trim(),
      description: form.description.trim(),
      attractions: attractionsFromText(form.attractions),
      ageRating: form.ageRating,
      isFeatured: form.isFeatured,
      endsAt: form.endDate && form.endTime ? zonedInputsToIso(form.endDate, form.endTime) : null,
      allowsMinors: form.allowsMinors,
      countdownEnabled: form.countdownEnabled,
      countdownPhrase: form.countdownPhrase.trim().replace(/\s+/g, ' ') || null,
    };
    let current: AdminEvent;
    try {
      current = event ? (await api.admin.updateEvent(event.id, body)).event : (await api.admin.createEvent(body)).event;
    } catch (err) {
      const fe = fieldErrors(err, SERVER_FIELD);
      setErrors(fe);
      if (Object.keys(fe).length) focusFirstError(fe);
      else setFormError(errorText(err, 'Não foi possível salvar o evento.'));
      return null;
    }
    setEvent(current);
    const values = formOf(current);
    setSaved(values);
    setForm(values);
    if (removeBanner && current.bannerUrl) {
      try {
        current = (await api.admin.removeBanner(current.id)).event;
        setEvent(current);
        setRemoveBanner(false);
      } catch (err) {
        setErrors(e => ({ ...e, banner: errorText(err, 'Não foi possível remover o banner.') }));
      }
    } else setRemoveBanner(false);
    if (file) {
      setProgress(0);
      try {
        current = (await uploadBanner(current.id, file, setProgress)).event;
        setEvent(current);
        setFile(null);
        setFilePreview(null);
      } catch (err) {
        setErrors(e => ({ ...e, banner: errorText(err, 'Não foi possível enviar a imagem.') }));
        toast('As informações foram salvas, mas a imagem não foi enviada.', 'err');
        if (!existing) go(`/admin/eventos/${current.id}/editar`, { force: true });
        return null;
      } finally {
        setProgress(null);
      }
    }
    return current;
  };

  const onSave = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy('salvar');
    const ev = await save();
    setBusy('');
    if (!ev) return;
    if (!existing) {
      toast('Rascunho criado. Agora cadastre os tipos de ingresso.');
      go(`/admin/eventos/${ev.id}?aba=tipos`, { force: true });
    } else toast(ev.status === 'rascunho' ? 'Rascunho salvo.' : 'Alterações salvas.');
  };

  const isDraft = !event || event.status === 'rascunho';
  const onPreview = async () => {
    setBusy('previa');
    const ev = dirty || !event ? await save() : event;
    setBusy('');
    if (ev) go(`/admin/eventos/${ev.id}/previa`, { force: true });
  };
  const onPublish = async () => {
    setBusy('publicar');
    const ev = dirty || !event ? await save() : event;
    setBusy('');
    if (ev) setPublishing(true);
  };

  const bannerShown = filePreview ?? (removeBanner ? null : (event?.bannerUrl ?? null));
  const attractionsCount = attractionsFromText(form.attractions).length;

  return (
    <form ref={formRef} className="px-form-grid" onSubmit={onSave} noValidate>
      {event ? (
        <p className="px-field-wide">
          Situação: <EventStatusBadge status={event.status} />{' '}
          {event.status === 'publicado' ? (
            <span className="px-small px-muted">As alterações aparecem na página pública assim que forem salvas.</span>
          ) : null}
        </p>
      ) : null}
      {formError ? (
        <p className="px-notice px-notice-err px-field-wide" role="alert">
          {formError}
        </p>
      ) : null}

      <FormField id="ev-name" label="Nome do evento" error={errors.name} wide>
        <input
          id="ev-name"
          value={form.name}
          maxLength={meta.limits.nameMax}
          onChange={e => set('name', e.target.value)}
          {...described('ev-name', errors.name)}
        />
      </FormField>
      <FormField id="ev-date" label="Data" error={errors.date} hint="Horário de Brasília (fuso do evento).">
        <input
          id="ev-date"
          type="date"
          value={form.date}
          onChange={e => set('date', e.target.value)}
          {...described('ev-date', errors.date, true)}
        />
      </FormField>
      <FormField id="ev-time" label="Horário de início" error={errors.time}>
        <input
          id="ev-time"
          type="time"
          value={form.time}
          onChange={e => set('time', e.target.value)}
          {...described('ev-time', errors.time)}
        />
      </FormField>
      <FormField
        id="ev-endDate"
        label="Data do fim"
        error={errors.endDate}
        hint="Opcional, exceto se o evento permitir menores."
      >
        <input
          id="ev-endDate"
          type="date"
          value={form.endDate}
          onChange={e => set('endDate', e.target.value)}
          {...described('ev-endDate', errors.endDate, true)}
        />
      </FormField>
      <FormField id="ev-endTime" label="Horário do fim" error={errors.endTime}>
        <input
          id="ev-endTime"
          type="time"
          value={form.endTime}
          onChange={e => set('endTime', e.target.value)}
          {...described('ev-endTime', errors.endTime)}
        />
      </FormField>
      <FormField id="ev-venue" label="Local" error={errors.venue}>
        <input
          id="ev-venue"
          value={form.venue}
          maxLength={meta.limits.nameMax}
          onChange={e => set('venue', e.target.value)}
          {...described('ev-venue', errors.venue)}
        />
      </FormField>
      <FormField id="ev-address" label="Endereço" error={errors.address}>
        <input
          id="ev-address"
          value={form.address}
          maxLength={200}
          autoComplete="off"
          onChange={e => set('address', e.target.value)}
          {...described('ev-address', errors.address)}
        />
      </FormField>
      <FormField
        id="ev-description"
        label="Descrição"
        error={errors.description}
        hint={`${form.description.length} de ${meta.limits.descriptionMax} caracteres.`}
        wide
      >
        <textarea
          id="ev-description"
          rows={6}
          value={form.description}
          maxLength={meta.limits.descriptionMax}
          onChange={e => set('description', e.target.value)}
          {...described('ev-description', errors.description, true)}
        />
      </FormField>
      <FormField
        id="ev-attractions"
        label="Atrações (uma por linha, opcional)"
        error={errors.attractions}
        hint={`${attractionsCount} de até ${meta.limits.attractionsMax}.`}
        wide
      >
        <textarea
          id="ev-attractions"
          rows={4}
          value={form.attractions}
          onChange={e => set('attractions', e.target.value)}
          {...described('ev-attractions', errors.attractions, true)}
        />
      </FormField>
      <FormField id="ev-ageRating" label="Classificação etária" error={errors.ageRating}>
        <select
          id="ev-ageRating"
          value={form.ageRating}
          onChange={e => set('ageRating', e.target.value)}
          {...described('ev-ageRating', errors.ageRating)}
        >
          <option value="">Escolha</option>
          {meta.ageRatings.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </FormField>
      <fieldset className="px-field-wide px-fieldset">
        <legend>Menores de idade</legend>
        <div className="px-check">
          <input
            id="ev-allowsMinors"
            type="checkbox"
            checked={form.allowsMinors}
            onChange={e => set('allowsMinors', e.target.checked)}
            aria-invalid={errors.allowsMinors ? true : undefined}
            aria-describedby={errors.allowsMinors ? 'ev-allowsMinors-erro' : 'ev-allowsMinors-ajuda'}
          />
          <label htmlFor="ev-allowsMinors">Permite menores de 16 e 17 anos</label>
        </div>
        <small id="ev-allowsMinors-ajuda" className="px-muted">
          Marcado: quem tiver 16 ou 17 anos na data do evento compra com o Termo de Ciência e entra com o Termo de
          Autorização assinado pelo responsável. Desmarcado: só quem tiver 18 anos ou mais na data do evento compra.
        </small>
        {errors.allowsMinors ? (
          <small id="ev-allowsMinors-erro" className="px-error" role="alert">
            {errors.allowsMinors}
          </small>
        ) : null}
      </fieldset>
      <fieldset className="px-field-wide px-fieldset">
        <legend>Cronômetro na página do evento</legend>
        <div className="px-check">
          <input
            id="ev-countdownEnabled"
            type="checkbox"
            checked={form.countdownEnabled}
            onChange={e => set('countdownEnabled', e.target.checked)}
            aria-describedby="ev-countdownEnabled-ajuda"
          />
          <label htmlFor="ev-countdownEnabled">Mostrar cronômetro</label>
        </div>
        <small id="ev-countdownEnabled-ajuda" className="px-muted">
          Contagem regressiva até o início, no topo da página. Entre o início e o fim aparece "Acontecendo agora"; depois
          do fim, ou com o evento encerrado, o cronômetro some.
        </small>
        <FormField
          id="ev-countdownPhrase"
          label="Frase do cronômetro (opcional)"
          error={errors.countdownPhrase}
          hint={`Aparece acima do nome do evento durante a contagem. Em branco: "${meta.countdownPhraseDefault}". ${form.countdownPhrase.trim().length} de ${meta.limits.countdownPhraseMax} caracteres, só texto.`}
        >
          <input
            id="ev-countdownPhrase"
            value={form.countdownPhrase}
            maxLength={meta.limits.countdownPhraseMax}
            placeholder={meta.countdownPhraseDefault}
            disabled={!form.countdownEnabled}
            onChange={e => set('countdownPhrase', e.target.value)}
            {...described('ev-countdownPhrase', errors.countdownPhrase, true)}
          />
        </FormField>
      </fieldset>
      <div className="px-check px-field-wide">
        <input
          id="ev-isFeatured"
          type="checkbox"
          checked={form.isFeatured}
          onChange={e => set('isFeatured', e.target.checked)}
        />
        <label htmlFor="ev-isFeatured">
          Destaque na página inicial{' '}
          <span className="px-small px-muted">(aparece entre os destaques enquanto houver ingresso à venda)</span>
        </label>
      </div>

      <fieldset className="px-field-wide px-banner-edit">
        <legend>Banner</legend>
        {!meta.banner.available ? (
          <p className="px-notice px-notice-neu">
            O armazenamento de imagens não está configurado neste ambiente: o envio do banner fica indisponível.
          </p>
        ) : null}
        {bannerShown ? (
          <div className="px-banner px-banner-preview">
            <img src={bannerShown} alt="Pré-visualização do banner" />
          </div>
        ) : (
          <p className="px-muted">Sem banner. A vitrine mostra um fundo padrão.</p>
        )}
        <div className="px-field">
          <label htmlFor="ev-banner">{bannerShown ? 'Trocar a imagem' : 'Escolher imagem'}</label>
          <input
            id="ev-banner"
            type="file"
            accept={meta.banner.formats.join(',')}
            disabled={!meta.banner.available || busy !== ''}
            onChange={e => {
              chooseFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
            {...described('ev-banner', errors.banner, true)}
          />
          {errors.banner ? (
            <small id="ev-banner-erro" className="px-error" role="alert">
              {errors.banner}
            </small>
          ) : null}
          <small id="ev-banner-dica" className="px-hint">
            JPG, PNG ou WebP, até {megabytes(meta.banner.maxBytes)} e com pelo menos {meta.banner.minWidth} px de
            largura (limites configurados neste servidor). Use imagem horizontal, de preferência 16:9 (por exemplo,{' '}
            {meta.banner.storedWidth} × {Math.round((meta.banner.storedWidth * 9) / 16)} px), com o essencial no centro:
            ela aparece recortada em 16:9 nos cartões, 4:3 no celular, 21:8 na página do evento no computador e 1,91:1
            nas prévias de compartilhamento.
          </small>
        </div>
        {progress !== null ? (
          <div className="px-progress" role="status" aria-live="polite">
            <progress max={1} value={progress} aria-label="Envio da imagem" />
            <span>Enviando imagem… {Math.round(progress * 100)}%</span>
          </div>
        ) : null}
        {file ? <p className="px-small">A imagem nova é enviada ao salvar.</p> : null}
        {bannerShown ? (
          <button
            type="button"
            className="px-btn"
            disabled={busy !== ''}
            onClick={() => {
              if (file) {
                setFile(null);
                setFilePreview(null);
              } else setRemoveBanner(true);
            }}
          >
            {file ? 'Descartar imagem nova' : 'Remover banner'}
          </button>
        ) : null}
        {removeBanner ? <p className="px-small">O banner é removido ao salvar.</p> : null}
      </fieldset>

      <div className="px-actions px-field-wide px-adm-actions">
        <button type="submit" className="px-btn px-btn-pri" disabled={busy !== ''}>
          {busy === 'salvar' ? 'Salvando…' : isDraft ? 'Salvar rascunho' : 'Salvar alterações'}
        </button>
        {isDraft ? (
          <>
            <button type="button" className="px-btn" disabled={busy !== ''} onClick={onPreview}>
              {busy === 'previa' ? 'Salvando…' : 'Pré-visualizar'}
            </button>
            <button type="button" className="px-btn" disabled={busy !== ''} onClick={onPublish}>
              {busy === 'publicar' ? 'Salvando…' : 'Publicar'}
            </button>
          </>
        ) : event ? (
          <a href={`/eventos/${event.slug}`} target="_blank" rel="noopener noreferrer" className="px-btn">
            Ver página pública
          </a>
        ) : null}
        {dirty ? (
          <span className="px-small px-muted" role="status">
            Alterações não salvas.
          </span>
        ) : null}
      </div>
      {publishing && event ? (
        <StatusChangeDialog
          event={event}
          action="publicar"
          meta={meta}
          onCancel={() => setPublishing(false)}
          onDone={ev => {
            setPublishing(false);
            go(`/admin/eventos/${ev.id}`, { force: true });
          }}
        />
      ) : null}
    </form>
  );
}

const megabytes = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`.replace('.', ',');

// ---------- pré-visualização ----------

export function AdminEventPreviewPage({ id }: { id: string }) {
  usePageTitle('Pré-visualização · PartyX');
  const access = useAdmin(`/admin/eventos/${id}/previa`);
  const [state, retry] = useFetch(s => api.admin.eventPreview(id, s), access === 'ok' ? `previa|${id}` : 'espera');
  // Mesmo fundo escuro da página pública; o acesso continua só do administrador (Gate cuida de negado e espera).
  if (access !== 'ok')
    return (
      <Gate access={access} active="eventos">
        {null}
      </Gate>
    );
  return (
    <Layout dark>
      <div className="px-wrap">
        <div className="px-preview-bar" role="note">
          <b>Pré-visualização.</b>{' '}
          {state.status === 'ok' && state.data.status === 'rascunho'
            ? 'O público ainda não vê esta página: o evento está em rascunho.'
            : 'É assim que a página aparece para o público.'}{' '}
          Nada pode ser comprado aqui. <Link to={`/admin/eventos/${id}/editar`}>Voltar à edição</Link> ·{' '}
          <Link to={`/admin/eventos/${id}`}>Ver o evento no painel</Link>
        </div>
        <Loading state={state} retry={retry} />
      </div>
      {state.status === 'ok' ? <EventView event={state.data} preview /> : null}
    </Layout>
  );
}

// ---------- ADM04: detalhe do evento ----------

type Tab = 'informacoes' | 'tipos' | 'entradas' | 'ingressos' | 'compradores' | 'contingencia';
const TABS: [Tab, string][] = [
  ['informacoes', 'Informações'],
  ['tipos', 'Tipos de ingresso'],
  ['entradas', 'Entradas ao vivo'],
  ['ingressos', 'Ingressos'],
  ['compradores', 'Compradores'],
  ['contingencia', 'Contingência'],
];

export function AdminEventPage({ id }: { id: string }) {
  const access = useAdmin(`/admin/eventos/${id}`);
  const { loc, go } = useRouter();
  const initial = new URLSearchParams(loc.search).get('aba') as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && TABS.some(([t]) => t === initial) ? initial : 'informacoes');
  const [version, setVersion] = useState(0);
  const [state, retry] = useFetch(s => api.admin.event(id, s), access === 'ok' ? `ev|${id}|${version}` : 'espera');
  const [meta] = useFetch(s => api.admin.eventsMeta(s), access === 'ok' ? 'meta' : 'espera');
  const [target, setTarget] = useState<StatusAction | null>(null);
  const [reopening, setReopening] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [unarchiving, setUnarchiving] = useState(false);
  const data = state.status === 'ok' ? state.data : null;
  const ev = data?.event;
  usePageTitle(ev ? `${ev.name} · PartyX` : 'Evento · PartyX');
  return (
    <Gate access={access} active="eventos">
      <p>
        <Link to="/admin/eventos" className="px-textlink px-textlink-sm">
          <IconBack size={18} />
          Eventos
        </Link>
      </p>
      <Loading state={state} retry={retry} />
      {ev ? (
        <>
          <div className="px-adm-head">
            <div>
              <h1 className="px-h1">{ev.name}</h1>
              <p className="px-muted">
                <EventStatusBadge status={ev.status} />{' '}
                {ev.archivedAt ? (
                  <>
                    <span className="px-badge px-badge-dark">Arquivado</span>{' '}
                  </>
                ) : null}
                {dateShort(ev.startsAt)} · {timeOf(ev.startsAt)} · {ev.venue}
              </p>
            </div>
          </div>
          <div className="px-adm-actions" role="group" aria-label="Ações do evento">
            {ev.status !== 'encerrado' ? (
              <Link to={`/admin/eventos/${ev.id}/editar`} className="px-btn">
                Editar informações
              </Link>
            ) : null}
            {ev.archivedAt ? (
              <>
                <Link to={`/admin/eventos/${ev.id}/previa`} className="px-btn">
                  Pré-visualizar
                </Link>
                <button type="button" className="px-btn px-btn-pri" onClick={() => setUnarchiving(true)}>
                  Desarquivar
                </button>
              </>
            ) : ev.status === 'rascunho' ? (
              <>
                <Link to={`/admin/eventos/${ev.id}/previa`} className="px-btn">
                  Pré-visualizar
                </Link>
                <button type="button" className="px-btn px-btn-pri" onClick={() => setTarget('publicar')}>
                  Publicar
                </button>
              </>
            ) : (
              <a href={`/eventos/${ev.slug}`} target="_blank" rel="noopener noreferrer" className="px-btn">
                Ver página pública
              </a>
            )}
            {ev.status === 'publicado' && !ev.archivedAt ? (
              <>
                <button type="button" className="px-btn" onClick={() => setTarget('vendas')}>
                  Encerrar vendas agora
                </button>
                <button type="button" className="px-btn" onClick={() => setTarget('encerrar')}>
                  Encerrar evento
                </button>
              </>
            ) : null}
            {ev.status === 'encerrado' && !ev.archivedAt ? (
              <button type="button" className="px-btn" onClick={() => setReopening(true)}>
                Reabrir evento
              </button>
            ) : null}
            <button type="button" className="px-btn px-btn-danger-line" onClick={() => setRemoving(true)}>
              Excluir
            </button>
          </div>
          {ev.archivedAt ? (
            <p className="px-notice px-notice-neu" role="note">
              Arquivado em {whenText(ev.archivedAt)}: fora da página inicial, da busca e do link público, sem compra nova.
              Pedidos, ingressos, portaria, relatórios e exportações continuam como estão.
            </p>
          ) : null}
          {ev.status === 'rascunho' ? (
            <p className="px-notice px-notice-info" role="note">
              Rascunho: o evento não aparece no site. Para publicar, é preciso data futura e ao menos um tipo de
              ingresso ativo.
            </p>
          ) : null}
          {ev.status === 'encerrado' ? (
            <p className="px-notice px-notice-neu" role="note">
              Encerrado: sem novas vendas e fora da vitrine. Ingressos e pedidos continuam registrados.{' '}
              {gateNote(ev, meta.status === 'ok' ? meta.data : null)}
            </p>
          ) : null}
          <div className="px-tabs" role="tablist" aria-label="Seções do evento">
            {TABS.map(([t, label]) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'informacoes' ? <EventInfoPanel event={ev} /> : null}
          {tab === 'tipos' ? (
            <TicketTypesPanel
              event={ev}
              types={data!.ticketTypes}
              meta={meta.status === 'ok' ? meta.data : null}
              onChanged={() => setVersion(v => v + 1)}
            />
          ) : null}
          {tab === 'entradas' ? <LiveEntriesPanel eventId={id} /> : null}
          {tab === 'ingressos' ? <TicketsPanel eventId={id} /> : null}
          {tab === 'compradores' ? <BuyersPanel eventId={id} /> : null}
          {tab === 'contingencia' ? <ContingencyPanel eventId={id} /> : null}
          {target ? (
            <StatusChangeDialog
              event={ev}
              action={target}
              meta={meta.status === 'ok' ? meta.data : null}
              onCancel={() => setTarget(null)}
              onDone={() => {
                setTarget(null);
                setVersion(v => v + 1);
              }}
            />
          ) : null}
          {reopening ? (
            <ReopenDialog
              event={ev}
              onCancel={() => setReopening(false)}
              onDone={() => {
                setReopening(false);
                setVersion(v => v + 1);
              }}
            />
          ) : null}
          {removing ? (
            <RemoveEventDialog
              event={ev}
              onCancel={() => setRemoving(false)}
              onDone={result => {
                setRemoving(false);
                if (result === 'excluido') go('/admin/eventos', { force: true });
                else setVersion(v => v + 1);
              }}
            />
          ) : null}
          {unarchiving ? (
            <UnarchiveDialog
              event={ev}
              onCancel={() => setUnarchiving(false)}
              onDone={() => {
                setUnarchiving(false);
                setVersion(v => v + 1);
              }}
            />
          ) : null}
        </>
      ) : null}
    </Gate>
  );
}

function EventInfoPanel({ event }: { event: AdminEvent }) {
  return (
    <section aria-label="Informações do evento" className="px-adm-info">
      {event.bannerUrl ? (
        <div className="px-banner px-banner-preview">
          <img src={event.bannerUrl} alt="" />
        </div>
      ) : (
        <p className="px-muted">Sem banner.</p>
      )}
      <dl className="px-facts">
        <div>
          <dt>Data e horário</dt>
          <dd>
            {dateShort(event.startsAt)} às {timeOf(event.startsAt)}
          </dd>
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
        <div>
          <dt>Menores de 16 e 17 anos</dt>
          <dd>
            {event.allowsMinors
              ? 'Permitidos, com o Termo de Autorização do responsável'
              : 'Não: só 18 anos ou mais na data do evento'}
          </dd>
        </div>
        {event.endsAt ? (
          <div>
            <dt>Fim</dt>
            <dd>
              {dateShort(event.endsAt)} às {timeOf(event.endsAt)}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Destaque na página inicial</dt>
          <dd>{event.isFeatured ? 'Sim' : 'Não'}</dd>
        </div>
        <div>
          <dt>Endereço da página</dt>
          <dd className="px-mono px-break">/eventos/{event.slug}</dd>
        </div>
      </dl>
      <h2 className="px-h3">Descrição</h2>
      <p className="px-desc">{event.description}</p>
      {event.attractions.length ? (
        <>
          <h2 className="px-h3">Atrações</h2>
          <ul className="px-minilist">
            {event.attractions.map(a => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

// ---------- ADM05: tipos de ingresso do evento ----------

const period = (t: Pick<AdminTicketType, 'salesStartAt' | 'salesEndAt'>) =>
  `${dateShort(t.salesStartAt)} ${timeOf(t.salesStartAt)} até ${dateShort(t.salesEndAt)} ${timeOf(t.salesEndAt)}`;

function TicketTypesPanel({
  event,
  types,
  meta,
  onChanged,
}: {
  event: AdminEvent;
  types: AdminTicketType[];
  meta: EventsMeta | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<AdminTicketType | 'novo' | null>(null);
  const [toggling, setToggling] = useState<AdminTicketType | null>(null);
  const [busy, setBusy] = useState(false);
  const [toggleError, setToggleError] = useState('');
  const closed = event.status === 'encerrado';
  const totals = types.reduce(
    (t, x) => ({
      total: t.total + x.quantityTotal,
      sold: t.sold + x.quantitySold,
      reserved: t.reserved + x.quantityReserved,
      available: t.available + x.available,
    }),
    { total: 0, sold: 0, reserved: 0, available: 0 },
  );
  const toggle = async () => {
    if (!toggling) return;
    setBusy(true);
    setToggleError('');
    try {
      await api.admin.updateTicketType(toggling.id, { isActive: !toggling.isActive });
      toast(toggling.isActive ? `"${toggling.name}" foi desativado.` : `"${toggling.name}" foi ativado.`);
      setToggling(null);
      onChanged();
    } catch (err) {
      setToggleError(errorText(err, 'Não foi possível alterar.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="tipos-titulo">
      <div className="px-adm-head">
        <h2 id="tipos-titulo" className="px-h2">
          Tipos de ingresso
        </h2>
        {!closed ? (
          <button type="button" className="px-btn px-btn-pri" disabled={!meta} onClick={() => setEditing('novo')}>
            Novo tipo de ingresso
          </button>
        ) : null}
      </div>
      <p className="px-small px-muted">
        <b>Vendidos</b> são unidades pagas. <b>Reservados</b> são temporários: seguram as unidades de quem está pagando
        por até {meta?.reservationMinutes ?? '…'} minutos e voltam ao estoque se o pagamento não for concluído.{' '}
        <b>Disponíveis</b> = capacidade − vendidos − reservados.
      </p>
      {types.length === 0 ? (
        <div className="px-box">
          <p>Nenhum tipo de ingresso cadastrado. O evento só pode ser publicado com ao menos um tipo ativo.</p>
        </div>
      ) : (
        <>
          <ul className="px-adm-list">
            {types.map(t => {
              const [tone, label] = TYPE_STATE[t.salesState];
              return (
                <li key={t.id} className="px-adm-card px-adm-type">
                  <div className="px-adm-card-main">
                    <span className="px-adm-card-title">{t.name}</span>
                    <span className="px-small px-muted">Vendas: {period(t)}</span>
                  </div>
                  <div className="px-adm-card-status">
                    <span className={`px-badge px-badge-${tone}`}>{label}</span>
                    {t.isActive && t.salesState !== 'a_venda' ? (
                      <span className="px-badge px-badge-neu">Ativo</span>
                    ) : null}
                  </div>
                  <dl className="px-adm-stats">
                    <div>
                      <dt>{t.lots.length > 1 ? 'Preço do lote à venda' : 'Preço'}</dt>
                      <dd>{t.lots.some(l => l.status === 'a_venda') ? brl(t.priceCents) : '—'}</dd>
                    </div>
                    <div>
                      <dt>Capacidade</dt>
                      <dd>{t.quantityTotal}</dd>
                    </div>
                    <div>
                      <dt>Vendidos</dt>
                      <dd>{t.quantitySold}</dd>
                    </div>
                    <div>
                      <dt>Reservados agora</dt>
                      <dd>{t.quantityReserved}</dd>
                    </div>
                    <div>
                      <dt>Disponíveis</dt>
                      <dd>
                        <b>{t.available}</b>
                      </dd>
                    </div>
                  </dl>
                  {!closed ? (
                    <div className="px-adm-actions" role="group" aria-label={`Ações de ${t.name}`}>
                      <button type="button" className="px-btn" disabled={!meta} onClick={() => setEditing(t)}>
                        Editar tipo
                      </button>
                      <button type="button" className="px-btn" onClick={() => setToggling(t)}>
                        {t.isActive ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  ) : null}
                  {meta ? <LotsSection type={t} closed={closed} meta={meta} onChanged={onChanged} /> : null}
                </li>
              );
            })}
          </ul>
          <p className="px-small">
            Total: {totals.total} de capacidade · {totals.sold} vendidos · {totals.reserved} reservados ·{' '}
            <b>{totals.available} disponíveis</b>
          </p>
        </>
      )}
      {editing && meta ? (
        <TicketTypeDialog
          event={event}
          meta={meta}
          type={editing === 'novo' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
      {toggling ? (
        <ConfirmDialog
          title={toggling.isActive ? `Desativar "${toggling.name}"?` : `Ativar "${toggling.name}"?`}
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
              O tipo sai de venda na hora. Ingressos já vendidos continuam válidos e reservas em andamento ainda podem
              ser pagas.
            </p>
          ) : (
            <p>O tipo volta a ser vendido dentro do período de vendas dele.</p>
          )}
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

// ---------- ADM06: criar e editar tipo de ingresso ----------

interface TypeForm {
  name: string;
  price: string;
  quantity: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  isActive: boolean;
  lastUnitsNotice: boolean;
}
const TYPE_FIELD: Record<string, string> = {
  priceCents: 'price',
  quantityTotal: 'quantity',
  salesStartAt: 'startDate',
  salesEndAt: 'endDate',
};

function TicketTypeDialog({
  event,
  meta,
  type,
  onCancel,
  onSaved,
}: {
  event: AdminEvent;
  meta: EventsMeta;
  type: AdminTicketType | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const initial = useMemo<TypeForm>(() => {
    if (type) {
      const s = isoToZonedInputs(type.salesStartAt);
      const e = isoToZonedInputs(type.salesEndAt);
      return {
        name: type.name,
        price: maskedFromCents(type.priceCents),
        quantity: String(type.quantityTotal),
        startDate: s.date,
        startTime: s.time,
        endDate: e.date,
        endTime: e.time,
        isActive: type.isActive,
        lastUnitsNotice: type.lastUnitsNotice,
      };
    }
    const now = isoToZonedInputs(new Date().toISOString());
    const end = isoToZonedInputs(event.startsAt);
    return {
      name: '',
      price: '',
      quantity: '',
      startDate: now.date,
      startTime: now.time,
      endDate: end.date,
      endTime: end.time,
      isActive: true,
      lastUnitsNotice: true,
    };
  }, [type, event.startsAt]);
  // Lotes (0013): com mais de um lote, o preço fica em cada lote; com lote único, o preço do tipo é o dele (travado se já vendeu).
  const inLots = Boolean(type && type.lots.length > 1);
  const priceLocked = Boolean(type && type.lots.length === 1 && type.lots[0]!.sold > 0);
  const [form, setForm] = useState<TypeForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useLeaveGuard(dirty);
  const committed = type ? type.quantitySold + type.quantityReserved : 0;

  const set = <K extends keyof TypeForm>(key: K, value: TypeForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => (e[key] ? { ...e, [key]: '' } : e));
  };
  const cancel = () => {
    if (dirty && !window.confirm('Descartar as alterações deste tipo de ingresso?')) return;
    onCancel();
  };
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('#tt-name')?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const errs: Record<string, string> = {};
    const name = form.name.trim();
    if (!name) errs.name = 'Informe o nome do tipo de ingresso.';
    else if (name.length > meta.limits.typeNameMax) errs.name = `Use no máximo ${meta.limits.typeNameMax} caracteres.`;
    const priceCents = inLots ? type!.priceCents : centsFromMasked(form.price);
    if (priceCents < 1)
      errs.price = 'Informe um valor maior que zero. Ingresso gratuito e cortesia não fazem parte do sistema.';
    else if (priceCents > meta.limits.priceMaxCents) errs.price = `O valor máximo é ${brl(meta.limits.priceMaxCents)}.`;
    const quantity = Number(form.quantity);
    if (!/^\d+$/.test(form.quantity.trim()) || quantity < 1 || quantity > meta.limits.quantityMax)
      errs.quantity = `Informe uma quantidade inteira de 1 a ${meta.limits.quantityMax.toLocaleString('pt-BR')}.`;
    else if (type && quantity < committed)
      errs.quantity = `A capacidade não pode ser menor que ${committed}: ${type.quantitySold} vendidos e ${type.quantityReserved} reservados agora. As reservas voltam ao estoque se o pagamento não for concluído.`;
    const start = zonedInputsToIso(form.startDate, form.startTime);
    const end = zonedInputsToIso(form.endDate, form.endTime);
    if (!start) errs.startDate = 'Informe a data e o horário do início das vendas.';
    if (!end) errs.endDate = 'Informe a data e o horário do fim das vendas.';
    if (start && end && new Date(end) <= new Date(start))
      errs.endDate = 'O fim das vendas precisa ser depois do início.';
    if (Object.keys(errs).length) {
      setErrors(errs);
      formRef.current?.querySelector<HTMLElement>(`#tt-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    const body = {
      name,
      priceCents,
      quantityTotal: quantity,
      salesStartAt: start!,
      salesEndAt: end!,
      isActive: form.isActive,
      lastUnitsNotice: form.lastUnitsNotice,
    };
    setBusy(true);
    try {
      if (type) await api.admin.updateTicketType(type.id, body);
      else await api.admin.createTicketType(event.id, body);
      toast(type ? `"${name}" foi salvo.` : `"${name}" foi criado.`);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'capacidade_abaixo_do_comprometido') {
        setErrors({ quantity: err.message });
      } else {
        const fe = fieldErrors(err, TYPE_FIELD);
        if (Object.keys(fe).length) setErrors(fe);
        else setFormError(errorText(err, 'Não foi possível salvar o tipo de ingresso.'));
      }
      setBusy(false);
    }
  };

  return (
    <div className="px-modal-bg" onClick={() => !busy && cancel()}>
      <form
        ref={formRef}
        className="px-modal px-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tt-title"
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        noValidate
      >
        <h2 id="tt-title" className="px-h3">
          {type ? `Editar "${type.name}"` : 'Novo tipo de ingresso'}
        </h2>
        {formError ? (
          <p className="px-notice px-notice-err" role="alert">
            {formError}
          </p>
        ) : null}
        <FormField
          id="tt-name"
          label="Nome"
          error={errors.name}
          hint="Ex.: Pista, Camarote, Meia-entrada. Para vender em lotes, salve o tipo e crie os lotes dentro dele."
        >
          <input
            id="tt-name"
            value={form.name}
            maxLength={meta.limits.typeNameMax}
            onChange={e => set('name', e.target.value)}
            {...described('tt-name', errors.name, true)}
          />
        </FormField>
        <div className="px-form-grid">
          {inLots ? (
            <p className="px-small px-muted px-field-wide">
              Este tipo vende em lotes: o preço fica em cada lote, na lista de lotes do tipo.
            </p>
          ) : (
            <FormField
              id="tt-price"
              label="Valor"
              error={errors.price}
              hint={priceLocked ? 'O lote já tem vendas: o preço não muda. Para outro preço, crie um novo lote.' : undefined}
            >
              <div className="px-money">
                <span aria-hidden="true">R$</span>
                <input
                  id="tt-price"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0,00"
                  value={form.price}
                  disabled={priceLocked}
                  onChange={e => set('price', e.target.value ? maskedFromCents(centsFromMasked(e.target.value)) : '')}
                  aria-label="Valor em reais"
                  {...described('tt-price', errors.price, priceLocked)}
                />
              </div>
            </FormField>
          )}
          <FormField
            id="tt-quantity"
            label="Quantidade total"
            error={errors.quantity}
            hint={
              type
                ? `Mínimo agora: ${Math.max(1, committed)} (${type.quantitySold} vendidos + ${type.quantityReserved} reservados).`
                : undefined
            }
          >
            <input
              id="tt-quantity"
              inputMode="numeric"
              value={form.quantity}
              onChange={e => set('quantity', e.target.value.replace(/\D/g, '').slice(0, 6))}
              {...described('tt-quantity', errors.quantity, Boolean(type))}
            />
          </FormField>
          <FormField id="tt-startDate" label="Início das vendas: data" error={errors.startDate}>
            <input
              id="tt-startDate"
              type="date"
              value={form.startDate}
              onChange={e => set('startDate', e.target.value)}
              {...described('tt-startDate', errors.startDate)}
            />
          </FormField>
          <FormField id="tt-startTime" label="Início: horário">
            <input
              id="tt-startTime"
              type="time"
              value={form.startTime}
              onChange={e => set('startTime', e.target.value)}
            />
          </FormField>
          <FormField id="tt-endDate" label="Fim das vendas: data" error={errors.endDate}>
            <input
              id="tt-endDate"
              type="date"
              value={form.endDate}
              onChange={e => set('endDate', e.target.value)}
              {...described('tt-endDate', errors.endDate)}
            />
          </FormField>
          <FormField id="tt-endTime" label="Fim: horário">
            <input id="tt-endTime" type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} />
          </FormField>
        </div>
        <div className="px-check">
          <input
            id="tt-active"
            type="checkbox"
            checked={form.isActive}
            onChange={e => set('isActive', e.target.checked)}
          />
          <label htmlFor="tt-active">Ativo (à venda dentro do período)</label>
        </div>
        <div className="px-check">
          <input
            id="tt-lastUnits"
            type="checkbox"
            checked={form.lastUnitsNotice}
            onChange={e => set('lastUnitsNotice', e.target.checked)}
          />
          <label htmlFor="tt-lastUnits">
            Avisar "Últimas unidades deste lote" na página do evento{' '}
            <span className="px-small px-muted">(com menos de 10 unidades, ou menos de 10% do lote)</span>
          </label>
        </div>
        <p className="px-small px-muted">
          Horários de Brasília. O limite de {meta.maxTicketsPerOrder} ingressos por compra vale para o pedido inteiro,
          somando os tipos, e é configurado no servidor (MAX_TICKETS_PER_ORDER), não por tipo. Tipos de meia-entrada
          podem existir: o documento é conferido na portaria, sem envio de comprovante.
        </p>
        <div className="px-actions">
          <button type="button" className="px-btn" onClick={cancel} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="px-btn px-btn-pri" disabled={busy}>
            {busy ? 'Salvando…' : type ? 'Salvar tipo' : 'Criar tipo'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- lotes de cada tipo (0013, 15/10/2026) ----------

const LOT_STATE: Record<AdminLot['status'], [string, string]> = {
  aguardando: ['neu', 'Aguardando'],
  a_venda: ['ok', 'À venda'],
  encerrado: ['dark', 'Encerrado'],
};
const CLOSE_REASON: Record<NonNullable<AdminLot['closeReason']>, string> = {
  esgotado: 'esgotou',
  data: 'pela data de fim',
  manual: 'virada manual',
};
const lotWhen = (l: Pick<AdminLot, 'salesStartAt' | 'salesEndAt'>) =>
  l.salesStartAt && l.salesEndAt
    ? `De ${whenText(l.salesStartAt)} até ${whenText(l.salesEndAt)}`
    : l.salesStartAt
      ? `A partir de ${whenText(l.salesStartAt)}`
      : l.salesEndAt
        ? `Até ${whenText(l.salesEndAt)}`
        : '';

/**
 * Lotes de um tipo: preço, quantidade, vendidos, reservados, disponíveis e situação de cada um, e as ações (novo lote, virar, editar,
 * reordenar, apagar). As regras ficam no servidor (`server/src/events/lotsAdmin.ts`); a tela só orienta e mostra o que ele responde.
 */
function LotsSection({
  type,
  closed,
  meta,
  onChanged,
}: {
  type: AdminTicketType;
  closed: boolean;
  meta: EventsMeta;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<AdminLot | 'novo' | null>(null);
  const [turning, setTurning] = useState(false);
  const [removing, setRemoving] = useState<AdminLot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lots = type.lots;
  const current = lots.find(l => l.status === 'a_venda') ?? null;
  const next = current ? lots.find(l => l.status === 'aguardando' && l.position > current.position) : undefined;
  const single = lots.length === 1;
  const move = async (lot: AdminLot, direction: 'subir' | 'descer') => {
    try {
      await api.admin.moveLot(lot.id, direction);
      onChanged();
    } catch (err) {
      toast(errorText(err, 'Não foi possível mudar a ordem.'));
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setError('');
    try {
      await api.admin.deleteLot(removing.id);
      toast(`"${removing.name}" foi apagado.`);
      setRemoving(null);
      onChanged();
    } catch (err) {
      setError(errorText(err, 'Não foi possível apagar o lote.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="px-lots" aria-label={`Lotes de ${type.name}`}>
      <div className="px-lots-head">
        <h3 className="px-lots-title">{single ? 'Lote' : `Lotes (${lots.length})`}</h3>
        {!closed ? (
          <div className="px-adm-actions" role="group" aria-label={`Ações dos lotes de ${type.name}`}>
            <button type="button" className="px-btn" onClick={() => setEditing('novo')}>
              Novo lote
            </button>
            {current ? (
              <button type="button" className="px-btn" onClick={() => setTurning(true)}>
                {next ? 'Virar para o próximo lote' : 'Encerrar o lote'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {single && lots[0]!.name === 'Lote único' ? (
        <p className="px-small px-muted">
          Vende num lote só. Para vender em lotes, reduza a quantidade deste e crie os próximos: cada lote tem preço e
          quantidade próprios, e o próximo abre quando este esgota, chega ao fim ou é virado à mão.
        </p>
      ) : null}
      <ol className="px-lot-list">
        {lots.map((l, i) => {
          const [tone, label] = LOT_STATE[l.status];
          const prev = lots[i - 1];
          const after = lots[i + 1];
          const moves = !closed && l.status === 'aguardando';
          return (
            <li key={l.id} className={`px-lot px-lot-${l.status}`}>
              <div className="px-lot-main">
                <span className="px-lot-name">
                  {l.name} · <span className="px-nowrap">{brl(l.priceCents)}</span>
                </span>
                <span className={`px-badge px-badge-${tone}`}>
                  {label}
                  {l.status === 'encerrado' && l.closeReason ? ` (${CLOSE_REASON[l.closeReason]})` : ''}
                </span>
              </div>
              <dl className="px-lot-stats">
                <div>
                  <dt>Quantidade</dt>
                  <dd>
                    {l.capacity}
                    {l.capacity !== l.quantity ? <small> de {l.quantity}</small> : null}
                  </dd>
                </div>
                <div>
                  <dt>Vendidos</dt>
                  <dd>{l.sold}</dd>
                </div>
                <div>
                  <dt>Reservados</dt>
                  <dd>{l.reserved}</dd>
                </div>
                <div>
                  <dt>Disponíveis</dt>
                  <dd>
                    <b>{l.available}</b>
                  </dd>
                </div>
              </dl>
              {l.carriedIn || l.passedOut || l.discarded || lotWhen(l) ? (
                <p className="px-small px-muted">
                  {[
                    lotWhen(l),
                    l.carriedIn ? `${l.carriedIn} recebidas de lotes anteriores` : '',
                    l.passedOut ? `${l.passedOut} passadas adiante` : '',
                    l.discarded ? `${l.discarded} descartadas` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
              {!closed && l.status !== 'encerrado' ? (
                <div className="px-adm-actions" role="group" aria-label={`Ações de ${l.name}`}>
                  <button type="button" className="px-btn" onClick={() => setEditing(l)}>
                    Editar
                  </button>
                  {moves && prev?.status === 'aguardando' ? (
                    <button type="button" className="px-btn" aria-label={`Subir ${l.name}`} onClick={() => move(l, 'subir')}>
                      Subir
                    </button>
                  ) : null}
                  {moves && after?.status === 'aguardando' ? (
                    <button type="button" className="px-btn" aria-label={`Descer ${l.name}`} onClick={() => move(l, 'descer')}>
                      Descer
                    </button>
                  ) : null}
                  {l.status === 'aguardando' && !l.hasOrders && !single ? (
                    <button type="button" className="px-btn px-btn-danger-line" onClick={() => setRemoving(l)}>
                      Apagar
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {editing ? (
        <LotDialog
          type={type}
          lot={editing === 'novo' ? null : editing}
          meta={meta}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
      {turning && current ? (
        <TurnLotDialog
          type={type}
          current={current}
          next={next ?? null}
          onCancel={() => setTurning(false)}
          onDone={() => {
            setTurning(false);
            onChanged();
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          title={`Apagar "${removing.name}"?`}
          confirmLabel="Apagar lote"
          danger
          busy={busy}
          error={error || null}
          onConfirm={remove}
          onCancel={() => {
            setRemoving(null);
            setError('');
          }}
        >
          <p>O lote ainda não começou a vender e nenhum pedido o usou. Os lotes depois dele sobem uma posição.</p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

/**
 * Virar o lote à mão: o lote à venda encerra agora e o próximo começa (se a data de início dele permitir). Pergunta o que fazer com as
 * unidades que sobraram (nem vendidas nem reservadas): passam para o próximo (padrão) ou são descartadas. Sem próximo, o tipo para.
 */
function TurnLotDialog({
  type,
  current,
  next,
  onCancel,
  onDone,
}: {
  type: AdminTicketType;
  current: AdminLot;
  next: AdminLot | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [leftover, setLeftover] = useState<'passar' | 'descartar'>(next ? 'passar' : 'descartar');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const left = current.available;
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await api.admin.turnLot(type.id, leftover);
      toast(next ? `${type.name}: "${next.name}" é o lote à venda.` : `${type.name}: "${current.name}" foi encerrado.`);
      onDone();
    } catch (err) {
      setError(errorText(err, 'Não foi possível virar o lote.'));
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog
      title={next ? `Virar ${type.name} para "${next.name}"?` : `Encerrar "${current.name}" de ${type.name}?`}
      confirmLabel={next ? 'Virar lote' : 'Encerrar lote'}
      danger={!next}
      busy={busy}
      error={error || null}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      <p>
        {next ? (
          <>
            <b>{current.name}</b> ({brl(current.priceCents)}) encerra agora e <b>{next.name}</b> ({brl(next.priceCents)})
            {next.salesStartAt && new Date(next.salesStartAt).getTime() > Date.now()
              ? ` começa a vender em ${whenText(next.salesStartAt)}.`
              : ' começa a vender na hora.'}
          </>
        ) : (
          <>
            Não há próximo lote: <b>{type.name}</b> para de vender e aparece como esgotado.
          </>
        )}
      </p>
      {left > 0 && next ? (
        <fieldset className="px-fieldset">
          <legend>
            {left} {left === 1 ? 'unidade sobrou' : 'unidades sobraram'} neste lote
          </legend>
          <div className="px-check">
            <input
              id="turn-passar"
              type="radio"
              name="sobra"
              checked={leftover === 'passar'}
              onChange={() => setLeftover('passar')}
            />
            <label htmlFor="turn-passar">Passar para {next.name} (padrão)</label>
          </div>
          <div className="px-check">
            <input
              id="turn-descartar"
              type="radio"
              name="sobra"
              checked={leftover === 'descartar'}
              onChange={() => setLeftover('descartar')}
            />
            <label htmlFor="turn-descartar">Descartar: não serão vendidas</label>
          </div>
        </fieldset>
      ) : left > 0 ? (
        <p className="px-small">{left} unidades que sobraram não serão vendidas.</p>
      ) : null}
      <p className="px-small px-muted">
        Quem está pagando uma reserva deste lote continua com o preço dele. A virada fica na trilha de auditoria.
      </p>
    </ConfirmDialog>
  );
}

interface LotForm {
  name: string;
  price: string;
  quantity: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  leftoverPolicy: 'passar' | 'descartar';
}
const LOT_FIELD: Record<string, string> = {
  priceCents: 'price',
  salesStartAt: 'startDate',
  salesEndAt: 'endDate',
};

/** Criar ou editar um lote. Com vendas, o preço fica travado; a soma das quantidades não passa da capacidade do tipo. */
function LotDialog({
  type,
  lot,
  meta,
  onCancel,
  onSaved,
}: {
  type: AdminTicketType;
  lot: AdminLot | null;
  meta: EventsMeta;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const position = lot?.position ?? (type.lots.at(-1)?.position ?? 0) + 1;
  const initial = useMemo<LotForm>(() => {
    const s = lot?.salesStartAt ? isoToZonedInputs(lot.salesStartAt) : { date: '', time: '' };
    const e = lot?.salesEndAt ? isoToZonedInputs(lot.salesEndAt) : { date: '', time: '' };
    return {
      name: lot?.name ?? '',
      price: lot ? maskedFromCents(lot.priceCents) : '',
      quantity: lot ? String(lot.quantity) : '',
      startDate: s.date,
      startTime: s.time,
      endDate: e.date,
      endTime: e.time,
      leftoverPolicy: lot?.leftoverPolicy ?? 'passar',
    };
  }, [lot]);
  const [form, setForm] = useState<LotForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const priceLocked = Boolean(lot && lot.sold > 0);
  const others = type.lots.filter(l => l.id !== lot?.id).reduce((t, l) => t + l.quantity, 0);
  const room = type.quantityTotal - others;
  const set = <K extends keyof LotForm>(key: K, value: LotForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => (e[key] ? { ...e, [key]: '' } : e));
  };
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('#lot-name')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const errs: Record<string, string> = {};
    const priceCents = centsFromMasked(form.price);
    if (priceCents < 1) errs.price = 'Informe um valor maior que zero.';
    else if (priceCents > meta.limits.priceMaxCents) errs.price = `O valor máximo é ${brl(meta.limits.priceMaxCents)}.`;
    const quantity = Number(form.quantity);
    if (!/^\d+$/.test(form.quantity.trim()) || quantity < 1)
      errs.quantity = 'Informe uma quantidade inteira maior que zero.';
    else if (quantity > room)
      errs.quantity = `Cabem no máximo ${room} neste lote: a capacidade do tipo é ${type.quantityTotal} e os outros lotes somam ${others}.`;
    const start = form.startDate ? zonedInputsToIso(form.startDate, form.startTime || '00:00') : null;
    const end = form.endDate ? zonedInputsToIso(form.endDate, form.endTime || '23:59') : null;
    if (form.startDate && !start) errs.startDate = 'Data ou horário inválido.';
    if (form.endDate && !end) errs.endDate = 'Data ou horário inválido.';
    if (start && end && new Date(end) <= new Date(start)) errs.endDate = 'O fim precisa ser depois do início.';
    if (Object.keys(errs).length) {
      setErrors(errs);
      formRef.current?.querySelector<HTMLElement>(`#lot-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    const body = {
      ...(form.name.trim() ? { name: form.name.trim() } : {}),
      priceCents,
      quantity,
      salesStartAt: start,
      salesEndAt: end,
      leftoverPolicy: form.leftoverPolicy,
    };
    setBusy(true);
    try {
      if (lot) await api.admin.updateLot(lot.id, priceLocked ? { ...body, priceCents: lot.priceCents } : body);
      else await api.admin.createLot(type.id, body);
      toast(lot ? `"${form.name.trim() || lot.name}" foi salvo.` : 'Lote criado.');
      onSaved();
    } catch (err) {
      const fe = fieldErrors(err, LOT_FIELD);
      if (Object.keys(fe).length) setErrors(fe);
      else setFormError(errorText(err, 'Não foi possível salvar o lote.'));
      setBusy(false);
    }
  };

  return (
    <div className="px-modal-bg" onClick={() => !busy && onCancel()}>
      <form
        ref={formRef}
        className="px-modal px-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lot-title"
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        noValidate
      >
        <h2 id="lot-title" className="px-h3">
          {lot ? `Editar "${lot.name}" de ${type.name}` : `Novo lote de ${type.name}`}
        </h2>
        {formError ? (
          <p className="px-notice px-notice-err" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="px-form-grid">
          <FormField id="lot-name" label="Nome (opcional)" error={errors.name}>
            <input
              id="lot-name"
              value={form.name}
              maxLength={60}
              placeholder={`${position}º lote`}
              onChange={e => set('name', e.target.value)}
              {...described('lot-name', errors.name)}
            />
          </FormField>
          <FormField
            id="lot-price"
            label="Valor"
            error={errors.price}
            hint={priceLocked ? 'O lote já tem vendas: o preço não muda.' : undefined}
          >
            <div className="px-money">
              <span aria-hidden="true">R$</span>
              <input
                id="lot-price"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0,00"
                value={form.price}
                disabled={priceLocked}
                onChange={e => set('price', e.target.value ? maskedFromCents(centsFromMasked(e.target.value)) : '')}
                aria-label="Valor em reais"
                {...described('lot-price', errors.price, priceLocked)}
              />
            </div>
          </FormField>
          <FormField
            id="lot-quantity"
            label="Quantidade"
            error={errors.quantity}
            hint={`Cabem até ${room}: capacidade do tipo ${type.quantityTotal}, outros lotes ${others}.`}
          >
            <input
              id="lot-quantity"
              inputMode="numeric"
              value={form.quantity}
              onChange={e => set('quantity', e.target.value.replace(/\D/g, '').slice(0, 6))}
              {...described('lot-quantity', errors.quantity, true)}
            />
          </FormField>
          <FormField id="lot-startDate" label="Início: data (opcional)" error={errors.startDate}>
            <input
              id="lot-startDate"
              type="date"
              value={form.startDate}
              onChange={e => set('startDate', e.target.value)}
              {...described('lot-startDate', errors.startDate)}
            />
          </FormField>
          <FormField id="lot-startTime" label="Início: horário">
            <input id="lot-startTime" type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} />
          </FormField>
          <FormField id="lot-endDate" label="Fim: data (opcional)" error={errors.endDate}>
            <input
              id="lot-endDate"
              type="date"
              value={form.endDate}
              onChange={e => set('endDate', e.target.value)}
              {...described('lot-endDate', errors.endDate)}
            />
          </FormField>
          <FormField id="lot-endTime" label="Fim: horário">
            <input id="lot-endTime" type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} />
          </FormField>
        </div>
        <fieldset className="px-fieldset">
          <legend>Na virada automática (esgotou ou chegou ao fim), as unidades que sobrarem</legend>
          <div className="px-check">
            <input
              id="lot-passar"
              type="radio"
              name="lot-leftover"
              checked={form.leftoverPolicy === 'passar'}
              onChange={() => set('leftoverPolicy', 'passar')}
            />
            <label htmlFor="lot-passar">Passam para o próximo lote (padrão)</label>
          </div>
          <div className="px-check">
            <input
              id="lot-descartar"
              type="radio"
              name="lot-leftover"
              checked={form.leftoverPolicy === 'descartar'}
              onChange={() => set('leftoverPolicy', 'descartar')}
            />
            <label htmlFor="lot-descartar">São descartadas</label>
          </div>
        </fieldset>
        <p className="px-small px-muted">
          Horários de Brasília. Só um lote fica à venda por vez: o próximo abre quando este esgota, chega ao fim ou é
          virado à mão. Sem datas, o lote vende até esgotar ou ser virado.
        </p>
        <div className="px-actions">
          <button type="button" className="px-btn" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="px-btn px-btn-pri" disabled={busy}>
            {busy ? 'Salvando…' : lot ? 'Salvar lote' : 'Criar lote'}
          </button>
        </div>
      </form>
    </div>
  );
}
