import { useEffect, useState, type FormEvent } from 'react';
import { ConfirmDialog, described, errorText, FormField } from './adminEvents';
import { Gate, Loading, useAdmin } from './adminPages';
import { api, ApiError, type ServiceFeeSettings } from './api';
import { toast, usePageTitle } from './components';
import { brl, centsFromMasked, dateShort, maskedFromCents, timeOf } from './format';
import { useLeaveGuard } from './router';
import { formatRate, rateBpsFromText, unitServiceFee } from './serviceFee';
import { useFetch } from './useFetch';

/** Limites aceitos pelo servidor (server/src/domain/serviceFee.ts). */
const RATE_MAX_BPS = 2000;
const MIN_MAX_CENTS = 5000;
/** Ingresso de exemplo da prévia (o mesmo da página de opções enviada à PartyX, D-90). */
const EXAMPLE_CENTS = 3000;

const rateText = (bps: number) => formatRate(bps).replace('%', '');
const onSaleText = (n: number) => `${n} evento${n === 1 ? '' : 's'} à venda`;

/**
 * Configurações do painel (D-90): a taxa de serviço da PartyX, única para Pix e cartão, em porcentagem com valor mínimo. Vale para
 * pedidos novos; cada pedido guarda a taxa dele. A regra fica no servidor (limites, trilha); a tela mostra a conta antes de salvar.
 */
export function AdminSettingsPage() {
  usePageTitle('Configurações · PartyX');
  const access = useAdmin('/admin/configuracoes');
  const [state, reload] = useFetch(signal => api.admin.serviceFee(signal), access === 'ok' ? 'taxa' : '');
  const current = state.status === 'ok' ? state.data : null;
  return (
    <Gate access={access} active="configuracoes">
      <h1 className="px-h1">Configurações</h1>
      <Loading state={state} retry={reload} />
      {current ? <ServiceFeeForm key={current.updatedAt} current={current} onSaved={reload} /> : null}
    </Gate>
  );
}

function ServiceFeeForm({ current, onSaved }: { current: ServiceFeeSettings; onSaved: () => void }) {
  const [rate, setRate] = useState(rateText(current.rateBps));
  const [min, setMin] = useState(current.minCents ? maskedFromCents(current.minCents) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    setRate(rateText(current.rateBps));
    setMin(current.minCents ? maskedFromCents(current.minCents) : '');
  }, [current]);

  const rateBps = rateBpsFromText(rate);
  const minCents = min ? centsFromMasked(min) : 0;
  const valid = rateBps !== null && rateBps <= RATE_MAX_BPS && minCents <= MIN_MAX_CENTS;
  const dirty = rateBps !== current.rateBps || minCents !== current.minCents;
  useLeaveGuard(dirty);
  const example = valid ? unitServiceFee(EXAMPLE_CENTS, { rateBps: rateBps!, minCents }) : null;

  const check = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (rateBps === null || rateBps > RATE_MAX_BPS)
      found.rateBps = 'Informe uma porcentagem de 0 a 20, com até 2 casas depois da vírgula (ex.: 5 ou 2,99).';
    if (minCents > MIN_MAX_CENTS) found.minCents = 'O mínimo vai até R$ 50,00.';
    setErrors(found);
    if (Object.keys(found).length === 0) {
      setSaveError(null);
      setConfirm(true);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const saved = await api.admin.updateServiceFee({ rateBps: rateBps!, minCents });
      setConfirm(false);
      // Com evento à venda, o aviso fica também aqui: a taxa nova vale só para os pedidos feitos a partir deste momento (D-90).
      toast(
        saved.eventsOnSale > 0
          ? `Taxa de serviço salva com ${onSaleText(saved.eventsOnSale)}: vale só para os pedidos feitos a partir de agora.`
          : 'Taxa de serviço salva. Vale para os pedidos novos.',
      );
      onSaved();
    } catch (err) {
      setSaveError(errorText(err, 'Não foi possível salvar a taxa.'));
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="px-panel" aria-labelledby="taxa-servico">
      <h2 id="taxa-servico" className="px-h3">
        Taxa de serviço
      </h2>
      <p className="px-muted">
        Cobrada por ingresso e somada ao valor dele, a mesma no Pix e no cartão. A conta é feita sobre o total, para o valor do
        ingresso chegar inteiro: taxa = valor × porcentagem ÷ (1 − porcentagem), arredondada para cima ao centavo e nunca menor que o
        mínimo. Mudar a taxa vale só para os pedidos novos; os já feitos guardam a deles. Com 0% e mínimo de R$ 0,00, o site não
        mostra taxa.
      </p>
      <form className="px-form-grid" onSubmit={check} noValidate>
        <FormField id="fee-rate" label="Porcentagem" error={errors.rateBps}>
          <div className="px-money px-money-suffix">
            <input
              id="fee-rate"
              inputMode="decimal"
              autoComplete="off"
              placeholder="5"
              value={rate}
              onChange={e => setRate(e.target.value.replace(/[^\d,.]/g, ''))}
              aria-label="Porcentagem da taxa de serviço"
              {...described('fee-rate', errors.rateBps)}
            />
            <span aria-hidden="true">%</span>
          </div>
        </FormField>
        <FormField id="fee-min" label="Valor mínimo por ingresso" error={errors.minCents}>
          <div className="px-money">
            <span aria-hidden="true">R$</span>
            <input
              id="fee-min"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0,00"
              value={min}
              onChange={e => setMin(e.target.value ? maskedFromCents(centsFromMasked(e.target.value)) : '')}
              aria-label="Valor mínimo em reais"
              {...described('fee-min', errors.minCents)}
            />
          </div>
        </FormField>
        <p className="px-field-wide px-notice px-notice-info" aria-live="polite">
          {example === null
            ? 'Confira a porcentagem e o mínimo para ver o exemplo.'
            : example === 0
              ? `Exemplo: ingresso de ${brl(EXAMPLE_CENTS)}, sem taxa de serviço.`
              : `Exemplo: ingresso de ${brl(EXAMPLE_CENTS)} + ${brl(example)} de taxa de serviço. O comprador paga ${brl(EXAMPLE_CENTS + example)}.`}
        </p>
        <p className="px-field-wide px-small px-muted">
          Última mudança:{' '}
          {current.updatedBy
            ? `${current.updatedBy}, em ${dateShort(current.updatedAt)} às ${timeOf(current.updatedAt)}`
            : current.rateBps === 0 && current.minCents === 0
              ? 'nenhuma (sem taxa de serviço até alguém salvar uma porcentagem ou um mínimo aqui)'
              : `valor inicial (${formatRate(current.rateBps)}, mínimo ${brl(current.minCents)})`}
          .
        </p>
        <div className="px-actions px-field-wide px-adm-actions">
          <button type="submit" className="px-btn px-btn-pri" disabled={!dirty}>
            Salvar taxa
          </button>
        </div>
      </form>
      {confirm && rateBps !== null ? (
        <ConfirmDialog
          title="Mudar a taxa de serviço?"
          confirmLabel="Mudar a taxa"
          busy={busy}
          error={saveError}
          onConfirm={() => void save()}
          onCancel={() => setConfirm(false)}
        >
          <p>
            De {formatRate(current.rateBps)} (mínimo {brl(current.minCents)}) para {formatRate(rateBps)} (mínimo {brl(minCents)}).
          </p>
          {current.eventsOnSale > 0 ? (
            <p className="px-notice px-notice-warn" role="status">
              Há {onSaleText(current.eventsOnSale)} agora. A taxa nova vale só para os pedidos feitos a partir deste momento; os
              pedidos já feitos, inclusive os que aguardam pagamento, mantêm a taxa deles. A página do evento passa a mostrar a nova
              taxa. A mudança fica registrada na trilha.
            </p>
          ) : (
            <p>
              Nenhum evento à venda agora. A taxa vale para os pedidos feitos a partir deste momento e fica registrada na trilha.
            </p>
          )}
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
