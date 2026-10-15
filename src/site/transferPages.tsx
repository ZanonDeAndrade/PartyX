import { useState } from 'react';
import { api, ApiError, type TicketDetail } from './api';
import { DateStub, ErrorBox, Layout, usePageTitle } from './components';
import { cpfInput, isCpfValid, isEmailLike, timeOf } from './format';
import { IconBack } from './icons';
import { Link } from './router';
import { MeShell, useLoggedIn } from './ticketPages';
import { useFetch } from './useFetch';

const dayMonthYear = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(iso),
  );

/** E-mail como está; CPF com a máscara enquanto a pessoa digita só números (e pontos e traço). */
const shapeDestination = (v: string) => (/^[\d.\-\s]+$/.test(v) && v.replace(/\D/g, '').length <= 11 ? cpfInput(v) : v);
const destinationProblem = (v: string): string | null => {
  const value = v.trim();
  if (!value) return 'Informe o e-mail ou o CPF de quem vai receber.';
  if (value.includes('@')) return isEmailLike(value) ? null : 'Confira o e-mail.';
  return isCpfValid(value) ? null : 'Confira o CPF.';
};

type Step =
  | { kind: 'destino' }
  | { kind: 'confirmar'; recipient: string; allowsMinors: boolean }
  | { kind: 'feito'; recipient: string };

/**
 * Transferir um ingresso (D-87; Política de Cancelamento, Troca e Reembolso, seção 2): a pessoa informa o e-mail ou o CPF da conta de
 * destino, confere o nome mascarado ("Maria S. O.") e confirma. O servidor confere tudo de novo (titular, prazo de 2 horas, idade
 * na data do evento) e troca o QR.
 */
export function TransferPage({ id }: { id: string }) {
  usePageTitle('Transferir ingresso · PartyX');
  const ready = useLoggedIn(`/ingressos/${id}/transferir`);
  const [state, retry] = useFetch<TicketDetail>(s => api.ticket(id, s), ready ? id : 'espera');
  const [destination, setDestination] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'destino' });

  if (!ready)
    return (
      <Layout>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );
  const t = state.status === 'ok' ? state.data : null;

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = destinationProblem(destination);
    setFieldError(problem);
    setError(null);
    if (problem) return;
    setBusy(true);
    try {
      const r = await api.transferPreview(id, destination.trim());
      setStep({ kind: 'confirmar', recipient: r.recipient, allowsMinors: r.allowsMinors });
    } catch (err) {
      if (err instanceof ApiError && err.fields.destination) setFieldError(err.fields.destination);
      else setError(err instanceof ApiError ? err.message : 'Não foi possível conferir agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.transfer(id, destination.trim());
      setStep({ kind: 'feito', recipient: r.recipient });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível transferir agora. Tente de novo.');
      setStep({ kind: 'destino' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <MeShell narrow>
      {step.kind !== 'feito' ? (
        <Link to={`/ingressos/${id}`} className="px-textlink px-textlink-sm px-self-start">
          <IconBack size={18} />
          Voltar ao ingresso
        </Link>
      ) : null}
      {state.status === 'loading' ? <div className="px-skel px-tf-skel" aria-busy="true" aria-label="Carregando" /> : null}
      {state.status === 'error' && state.code === 404 && step.kind !== 'feito' ? (
        <div className="px-me-empty">
          <b>Ingresso não encontrado</b>
          <Link to="/meus-ingressos" className="px-btn px-btn-pri">
            Meus ingressos
          </Link>
        </div>
      ) : state.status === 'error' ? (
        <ErrorBox onRetry={retry} />
      ) : null}
      {t ? (
        <section className="px-tf" aria-labelledby="tf-titulo">
          <h1 id="tf-titulo" className="px-me-title">
            {step.kind === 'feito' ? 'Ingresso transferido' : 'Transferir ingresso'}
          </h1>
          <div className="px-tf-ticket">
            <DateStub iso={t.event.startsAt} />
            <div>
              <b>{t.event.name}</b>
              <span>{t.typeName}</span>
              <small className="px-mono">{t.shortCode}</small>
            </div>
          </div>

          {step.kind === 'destino' ? (
            <form className="px-tf-form" onSubmit={check} noValidate>
              <p className="px-tf-lead">
                Quem recebe precisa ter conta na PartyX. Informe o e-mail ou o CPF da conta dessa pessoa. Prazo: até{' '}
                {dayMonthYear(t.transferUntil)} às {timeOf(t.transferUntil)} (2 horas antes do evento).
              </p>
              <div className="px-field">
                <label htmlFor="tf-destino">E-mail ou CPF de quem vai receber</label>
                <input
                  id="tf-destino"
                  value={destination}
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={254}
                  onChange={e => {
                    setDestination(shapeDestination(e.target.value));
                    setFieldError(null);
                  }}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? 'tf-destino-erro' : undefined}
                />
                {fieldError ? (
                  <small id="tf-destino-erro" className="px-error" role="alert">
                    {fieldError}
                  </small>
                ) : null}
              </div>
              {error ? (
                <p className="px-notice px-notice-err" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="px-btn px-btn-pri px-btn-lg" disabled={busy}>
                {busy ? 'Conferindo…' : 'Continuar'}
              </button>
            </form>
          ) : null}

          {step.kind === 'confirmar' ? (
            <div className="px-tf-confirm">
              <p className="px-tf-who">
                Transferir para <b>{step.recipient}</b>?
              </p>
              <ul className="px-tf-rules">
                <li>O ingresso sai de Meus ingressos e vai para a conta dessa pessoa, em nome dela.</li>
                <li>O QR Code atual deixa de valer, inclusive capturas de tela, impressões e PDFs. Ela recebe um QR novo.</li>
                <li>Você não consegue desfazer a transferência pelo site.</li>
                {step.allowsMinors ? (
                  <li>
                    Se a pessoa tiver 16 ou 17 anos na data do evento, ela aceita o Termo de Ciência na conta dela e entrega
                    na portaria a autorização assinada pelo responsável.
                  </li>
                ) : null}
                <li>
                  A PartyX não participa de venda entre pessoas: se for vender, transfira só depois de receber o pagamento.
                </li>
              </ul>
              {error ? (
                <p className="px-notice px-notice-err" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="px-tf-actions">
                <button type="button" className="px-btn px-btn-pri px-btn-lg" disabled={busy} onClick={confirm}>
                  {busy ? 'Transferindo…' : 'Confirmar transferência'}
                </button>
                <button type="button" className="px-btn px-btn-outline px-btn-lg" disabled={busy} onClick={() => setStep({ kind: 'destino' })}>
                  Corrigir
                </button>
              </div>
            </div>
          ) : null}

          {step.kind === 'feito' ? (
            <div className="px-tf-done" role="status">
              <p>
                O ingresso foi transferido para <b>{step.recipient}</b> e já está na conta dessa pessoa, com um QR Code novo. O
                que você tinha deixou de valer.
              </p>
              <Link to="/meus-ingressos" className="px-btn px-btn-pri px-btn-lg">
                Meus ingressos
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}
    </MeShell>
  );
}
