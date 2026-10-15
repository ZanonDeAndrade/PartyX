import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  api,
  ApiError,
  type CardTokenData,
  type CartItem,
  type DeclineReason,
  type LegalDocument,
  minorAuthorizationUrl,
  type OrderLineLot,
  type OrderView,
  type PaymentOptions,
  type PaymentView,
  type Summary,
  type TicketSummary,
} from './api';
import { loadCart, saveCart } from './cart';
import { CardBrick } from './cardBrick';
import { DateStub, ErrorBox, Layout, PartyxContact, usePageTitle } from './components';
import { mmss, useCountdown } from './countdown';
import { brl, dateParts, maskEmail, phoneBr, timeOf } from './format';
import { IconCheck, IconCopy } from './icons';
import { cascade } from './motion';
import { Link, useRouter } from './router';
import { useSession } from './session';

/** Redireciona visitante ao login e volta para cá com o carrinho intacto (RF-29). */
function useRequireLogin(returnTo: string) {
  const { go } = useRouter();
  const session = useSession();
  useEffect(() => {
    if (session.status === 'anon') go(`/entrar?voltar=${encodeURIComponent(returnTo)}`);
  }, [session.status, returnTo, go]);
  return session.status === 'user';
}

interface AsideData {
  event: { name: string; startsAt: string; venue: string };
  items: LineWithLots[];
  totalCents: number;
  coupon: { code: string } | null;
}

interface LineWithLots {
  ticketTypeId?: string;
  name: string;
  quantity: number;
  unitPriceCents?: number;
  subtotalCents: number;
  lots?: OrderLineLot[];
}

/**
 * Uma linha por lote (0013): a compra que se dividiu entre lotes aparece como "Pista · 1º lote" e "Pista · 2º lote", cada uma com o
 * preço dela. O "Lote único" (tipo que não vende em lotes) e o pedido anterior aos lotes ficam numa linha só, como antes.
 */
function linesByLot(items: LineWithLots[]) {
  return items.flatMap(i => {
    const lots = i.lots ?? [];
    if (!lots.some(l => l.name !== 'Lote único'))
      return [
        {
          key: i.ticketTypeId ?? i.name,
          name: i.name,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents ?? Math.round(i.subtotalCents / i.quantity),
          subtotalCents: i.subtotalCents,
        },
      ];
    return lots.map(l => ({
      key: `${i.ticketTypeId ?? i.name}:${l.lotId}`,
      name: `${i.name} · ${l.name}`,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      subtotalCents: l.subtotalCents,
    }));
  });
}

const STEPS = ['Revisão', 'Pagamento', 'Confirmação'] as const;
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Estrutura das telas de compra: etapas no alto, conteúdo à esquerda e resumo do pedido à direita (C02–C10). */
function CheckoutShell({
  step,
  aside,
  badge,
  children,
  mobileBar,
}: {
  step: 0 | 1 | 2;
  aside: AsideData | null;
  badge?: ReactNode;
  children: ReactNode;
  mobileBar?: ReactNode;
}) {
  const session = useSession();
  const buyer = session.user?.name ?? '';
  return (
    <Layout>
      <div className={`px-wrap px-ck${mobileBar ? ' px-ck-bar' : ''}`}>
        <ol className="px-steps" aria-label="Etapas da compra">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? 'step' : undefined} className={i <= step ? 'px-step-on' : ''}>
              <span className="px-step-n" aria-hidden="true">
                {i < step ? <IconCheck size={14} /> : i + 1}
              </span>
              <span className="px-step-label">{label}</span>
              {i < step ? <span className="px-sr">(concluída)</span> : null}
            </li>
          ))}
        </ol>
        <div className="px-ck-grid">
          <div className="px-ck-main">{children}</div>
          {aside ? (
            <aside className="px-ck-aside" aria-label="Resumo do pedido">
              <div className="px-ck-event">
                <DateStub iso={aside.event.startsAt} />
                <div>
                  <b>{aside.event.name}</b>
                  <small className="px-ck-date">
                    {capitalize(dateParts(aside.event.startsAt).weekday)}, {timeOf(aside.event.startsAt)}
                  </small>
                  <small>{aside.event.venue}</small>
                </div>
              </div>
              {badge ? <div className="px-ck-badges">{badge}</div> : null}
              <ul className="px-ck-lines">
                {linesByLot(aside.items).map(i => (
                  <li key={i.key}>
                    <span>
                      {i.quantity} × {i.name}
                    </span>
                    <span className="px-nowrap">{brl(i.subtotalCents)}</span>
                  </li>
                ))}
                {aside.coupon ? (
                  <li className="px-ck-promo">
                    <span className="px-nowrap">Promoter</span>
                    <span>
                      <span className="px-mono">{aside.coupon.code}</span>, valor inalterado
                    </span>
                  </li>
                ) : null}
              </ul>
              <p className="px-ck-total">
                <b>Total</b>
                <b className="px-nowrap">{brl(aside.totalCents)}</b>
              </p>
              <small className="px-fine">
                Ingressos em nome de {buyer}. Pagamento processado pelo gateway na conta da PartyX.
              </small>
            </aside>
          ) : null}
        </div>
      </div>
      {mobileBar}
    </Layout>
  );
}

/**
 * Prazo da reserva (C04). A barra encolhe com `transform` (sem mexer no layout). Nos últimos 60 s o bloco fica âmbar e diz
 * que falta menos de um minuto, sem piscar nem alarmar: o prazo é do servidor e a página atualiza sozinha.
 */
function TimerCard({ secondsLeft }: { secondsLeft: number }) {
  const peak = useRef(secondsLeft);
  if (secondsLeft > peak.current) peak.current = secondsLeft;
  const warn = secondsLeft <= 60;
  const fraction = peak.current > 0 ? Math.min(1, secondsLeft / peak.current) : 0;
  return (
    <div className={`px-timerbar${warn ? ' px-timerbar-warn' : ''}`} role="timer" aria-live="off">
      <div className="px-timerbar-top">
        <b>{warn ? 'Menos de um minuto para pagar' : 'Ingressos reservados para você'}</b>
        <span className="px-timerbar-clock" aria-label={`Faltam ${mmss(secondsLeft)}`}>
          {mmss(secondsLeft)}
        </span>
      </div>
      <div className="px-timerbar-track" aria-hidden="true">
        <div style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <small>
        {warn
          ? 'Se o prazo terminar, a reserva é liberada. Se você já pagou, aguarde: a confirmação chega mesmo assim.'
          : 'Conclua o pagamento dentro do prazo. Depois disso a reserva é liberada e os ingressos voltam para venda.'}
      </small>
    </div>
  );
}

/**
 * Ingresso "entrando na carteira" na confirmação: entra com o padrão do site, um depois do outro, logo depois do título. Momento
 * discreto, sem confete. Com menos movimento, só esmaece (tokens).
 */
function WalletItem({ index, children }: { index: number; children: ReactNode }) {
  return (
    <li className="px-in" style={cascade(2 + Math.min(index, 5))}>
      {children}
    </li>
  );
}

/** Troca de etapa dentro do pedido (forma de pagamento, Pix, resultado): o conteúdo novo entra com o padrão do site. */
function Stage({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div key={id} className="px-ck-stage px-in-block">
      {children}
    </div>
  );
}

/** Cartão de resultado (C07–C10): ícone, pedido, título, explicação e ações. */
function ResultCard({
  tone,
  icon,
  order,
  title,
  children,
  box,
  actions,
}: {
  tone: 'ok' | 'neu' | 'warn' | 'err';
  icon: string;
  order?: number;
  title: string;
  children: ReactNode;
  box?: { tone: 'neu' | 'warn'; title: string; text: ReactNode };
  actions: ReactNode;
}) {
  return (
    <section className="px-ck-card px-result" aria-labelledby="res-title">
      <span className={`px-done-icon px-result-icon px-tone-${tone}`} aria-hidden="true">
        {icon}
      </span>
      {order ? <span className="px-mono px-muted">Pedido PX-{order}</span> : null}
      <h1 id="res-title">{title}</h1>
      <p>{children}</p>
      {box ? (
        <div className={`px-result-box px-result-box-${box.tone}`}>
          <b>{box.title}</b>
          <br />
          {box.text}
        </div>
      ) : null}
      <div className="px-done-actions">{actions}</div>
    </section>
  );
}

/** Revisão do pedido (RF-32): tipos, quantidades e total recalculados pelo servidor, e o cupom do promoter (RF-30, RF-31). */
export function CheckoutPage({ slug }: { slug: string }) {
  usePageTitle('Revisão do pedido · PartyX');
  const { go } = useRouter();
  const ready = useRequireLogin(`/checkout/${slug}`);
  const session = useSession();
  const cart = loadCart();
  const items: CartItem[] = cart && cart.slug === slug ? cart.items : [];
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<{ message: string; coupon?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Regras de menores: caixa do Termo de Ciência (nunca pré-marcada) e o texto dele, quando a pessoa terá 16 ou 17 anos.
  const [minorAccepted, setMinorAccepted] = useState(false);
  const [minorTerm, setMinorTerm] = useState<LegalDocument | null>(null);

  const load = useCallback(
    async (code: string) => {
      setLoading(true);
      setError(null);
      try {
        setSummary(await api.quote(slug, items, code));
        setApplied(code);
      } catch (e) {
        // Cupom errado não derruba o resumo: o pedido segue válido sem ele.
        if (!(e instanceof ApiError && e.code === 'cupom_invalido')) setSummary(null);
        if (e instanceof ApiError && e.code === 'cupom_invalido')
          setError({ message: '', coupon: e.fields.couponCode ?? e.message });
        else setError({ message: stockMessage(e) });
      } finally {
        setLoading(false);
      }
    },
    // `items` vem do sessionStorage a cada render; a identidade do carrinho é o slug e o conteúdo serializado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug, JSON.stringify(items)],
  );

  useEffect(() => {
    if (ready && items.length) void load(applied);
    else if (ready) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, load]);

  const isMinor = Boolean(summary?.buyer?.minor);
  useEffect(() => {
    if (!isMinor || minorTerm) return;
    const ctl = new AbortController();
    api
      .legalDocument('termo-menor', ctl.signal)
      .then(setMinorTerm)
      .catch(() => {});
    return () => ctl.abort();
  }, [isMinor, minorTerm]);

  if (!ready)
    return (
      <Layout>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );
  if (items.length === 0) {
    return (
      <Layout>
        <div className="px-wrap px-narrow">
          <div className="px-box px-box-light">
            <h1 className="px-h2">Seu carrinho está vazio</h1>
            <p>Escolha os ingressos na página do evento.</p>
            <Link to={`/eventos/${slug}`} className="px-btn px-btn-pri">
              Voltar ao evento
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const pay = async () => {
    if (!summary) return;
    setBusy(true);
    setError(null);
    try {
      // `expectedTotalCents` só avisa se o preço mudou; o servidor cobra o valor do banco.
      const buyer = summary.buyer;
      const order = await api.createOrder(
        slug,
        items,
        applied,
        summary.totalCents,
        buyer?.minor ? { accepted: minorAccepted, version: buyer.minorTermVersion } : undefined,
      );
      saveCart(null);
      go(`/pedido/${order.id}`);
    } catch (e) {
      const recheck = ['preco_alterado', 'data_nascimento_obrigatoria', 'aceite_pendente', 'versao_desatualizada'];
      if (e instanceof ApiError && e.code && recheck.includes(e.code)) {
        if (e.code === 'versao_desatualizada') {
          setMinorTerm(null);
          setMinorAccepted(false);
        }
        await load(applied);
      }
      setError({ message: stockMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const user = session.user;
  const refusal = summary?.buyer?.refusal ?? null;
  const blocked = Boolean(refusal) || (isMinor && !minorAccepted);
  const goPay = (
    <button type="button" className="px-btn px-btn-pri px-btn-lg" disabled={!summary || busy || blocked} onClick={pay}>
      {busy ? 'Reservando…' : 'Ir para o pagamento'}
    </button>
  );
  return (
    <CheckoutShell
      step={0}
      aside={summary}
      mobileBar={
        <div className="px-ck-mobbar">
          <div>
            <small>Total</small>
            <b className="px-nowrap">{summary ? brl(summary.totalCents) : '...'}</b>
          </div>
          {goPay}
        </div>
      }
    >
      <h1 className="px-ck-title">Revise seu pedido</h1>
      {error?.message ? (
        <p className="px-notice px-notice-warn" role="alert">
          <b>Atenção.</b> {error.message}
        </p>
      ) : null}
      {loading ? <p aria-busy="true">Conferindo disponibilidade…</p> : null}
      {summary ? (
        <section aria-labelledby="resumo" className="px-ck-card">
          <div className="px-ck-card-head">
            <h2 id="resumo">Ingressos</h2>
            <Link to={`/eventos/${slug}`} className="px-textlink px-textlink-sm">
              Alterar seleção
            </Link>
          </div>
          <ul className="px-ck-review-lines">
            {linesByLot(summary.items).map(i => (
              <li key={i.key}>
                <span>
                  <span>
                    <b>{i.quantity} ×</b> {i.name}
                  </span>
                  <small>{brl(i.unitPriceCents)} cada</small>
                </span>
                <b className="px-nowrap">{brl(i.subtotalCents)}</b>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="comprador" className="px-ck-card">
        <h2 id="comprador">Dados do comprador</h2>
        <dl className="px-ck-buyer">
          <div>
            <dt>Nome</dt>
            <dd>{user?.name}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt>CPF</dt>
            <dd>{user?.cpf ?? 'Não informado'}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{user?.phone ? phoneBr(user.phone) : 'Não informado'}</dd>
          </div>
        </dl>
        <p className="px-ck-note">
          Todos os ingressos deste pedido serão emitidos em nome de <b>{user?.name}</b>.
        </p>
      </section>

      {summary?.buyer ? (
        <BuyerAgeSection
          summary={summary}
          minorTerm={minorTerm}
          minorAccepted={minorAccepted}
          onMinorAccepted={setMinorAccepted}
          onBirthDateSaved={async () => {
            await session.reload();
            await load(applied);
          }}
        />
      ) : null}

      <section aria-labelledby="promoter" className="px-ck-card">
        <h2 id="promoter">
          Código do promoter <small>(opcional)</small>
        </h2>
        <p className="px-ck-text">
          Se alguém indicou o evento, informe o código dessa pessoa. O código registra a indicação e não altera o valor
          do pedido.
        </p>
        {applied && !error?.coupon ? (
          <div className="px-promo-ok">
            <span>
              <b className="px-mono">{summary?.coupon?.code ?? applied}</b> aplicado. Total inalterado.
            </span>
            <button
              type="button"
              className="px-btn"
              onClick={() => {
                setCoupon('');
                void load('');
              }}
            >
              Remover
            </button>
          </div>
        ) : (
          <form
            className="px-coupon"
            onSubmit={e => {
              e.preventDefault();
              if (coupon.trim()) void load(coupon.trim());
            }}
          >
            <div className="px-field">
              <label htmlFor="cupom">Código</label>
              <input
                id="cupom"
                className="px-mono px-upper"
                value={coupon}
                maxLength={40}
                autoComplete="off"
                placeholder="Ex.: DUDA"
                onChange={e => setCoupon(e.target.value.toUpperCase())}
                aria-invalid={error?.coupon ? true : undefined}
                aria-describedby={error?.coupon ? 'cupom-erro' : undefined}
              />
              {error?.coupon ? (
                <small id="cupom-erro" className="px-error" role="alert">
                  {error.coupon}
                </small>
              ) : null}
            </div>
            <button type="submit" className="px-btn" disabled={loading || !coupon.trim()}>
              Aplicar
            </button>
          </form>
        )}
      </section>

      <p className="px-fine px-fine-dark">
        Antes de pagar, consulte a <Link to="/politica-de-cancelamento">Política de Cancelamento</Link>. Ao continuar,
        reservamos seus ingressos por alguns minutos para você concluir o pagamento.
      </p>
      <div className="px-ck-desk-cta">{goPay}</div>
    </CheckoutShell>
  );
}

/**
 * Regras de menores no checkout, decididas pelo servidor na DATA DO EVENTO: conta antiga informa a data de nascimento; quem não pode
 * comprar vê o motivo; quem terá 16 ou 17 anos lê e aceita o Termo de Ciência (caixa nunca pré-marcada) antes de continuar.
 */
function BuyerAgeSection({
  summary,
  minorTerm,
  minorAccepted,
  onMinorAccepted,
  onBirthDateSaved,
}: {
  summary: Summary;
  minorTerm: LegalDocument | null;
  minorAccepted: boolean;
  onMinorAccepted: (v: boolean) => void;
  onBirthDateSaved: () => Promise<void>;
}) {
  const buyer = summary.buyer!;
  const [birthDate, setBirthDate] = useState('');
  const [birthError, setBirthError] = useState('');
  const [saving, setSaving] = useState(false);
  const code = buyer.refusal?.code;

  if (code === 'data_nascimento_obrigatoria') {
    const save = async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setBirthError('');
      try {
        await api.setBirthDate(birthDate);
        await onBirthDateSaved();
      } catch (err) {
        setBirthError(
          err instanceof ApiError
            ? (err.fields.birthDate ?? err.message)
            : 'Não foi possível salvar a data de nascimento.',
        );
      } finally {
        setSaving(false);
      }
    };
    return (
      <section aria-labelledby="nascimento" className="px-ck-card">
        <h2 id="nascimento">Data de nascimento</h2>
        <p className="px-ck-text">
          Para continuar, informe sua data de nascimento. Ela define as regras de idade de cada evento e, depois de
          salva, só a PartyX pode corrigir.
        </p>
        <form className="px-coupon" onSubmit={save}>
          <div className="px-field">
            <label htmlFor="ck-nascimento">Data de nascimento</label>
            <input
              id="ck-nascimento"
              type="date"
              value={birthDate}
              autoComplete="bday"
              onChange={e => setBirthDate(e.target.value)}
              aria-invalid={birthError ? true : undefined}
              aria-describedby={birthError ? 'ck-nascimento-erro' : undefined}
            />
            {birthError ? (
              <small id="ck-nascimento-erro" className="px-error" role="alert">
                {birthError}
              </small>
            ) : null}
          </div>
          <button type="submit" className="px-btn" disabled={saving || !birthDate}>
            {saving ? 'Salvando…' : 'Salvar e continuar'}
          </button>
        </form>
      </section>
    );
  }
  if (code === 'idade_minima' || code === 'evento_para_maiores' || code === 'aceite_pendente') {
    return (
      <p className="px-notice px-notice-err" role="alert">
        <b>Não é possível continuar.</b> {buyer.refusal!.message}
      </p>
    );
  }
  if (!buyer.minor) return null;
  return (
    <section aria-labelledby="termo-menor" className="px-ck-card">
      <h2 id="termo-menor">Termo de Ciência para Menores de Idade</h2>
      <p className="px-ck-text">
        Você terá {buyer.age} anos na data do evento. Para continuar, leia e aceite o termo. Depois da compra, baixe o
        Termo de Autorização e Responsabilidade em Meus ingressos: ele é preenchido e assinado pelo seu responsável e
        entregue na portaria.
      </p>
      <div className="px-ck-term" tabIndex={0} aria-label="Texto do Termo de Ciência para Menores de Idade">
        {minorTerm ? (
          minorTerm.blocks.map((b, i) => (b.type === 'heading' ? <h3 key={i}>{b.text}</h3> : <p key={i}>{b.text}</p>))
        ) : (
          <p aria-busy="true">Carregando o termo…</p>
        )}
      </div>
      <div className="px-check">
        <input
          id="aceite-menor"
          type="checkbox"
          checked={minorAccepted}
          disabled={!minorTerm}
          onChange={e => onMinorAccepted(e.target.checked)}
          aria-describedby="aceite-menor-dica"
        />
        <label htmlFor="aceite-menor">Li e aceito o Termo de Ciência para Menores de Idade.</label>
      </div>
      <small id="aceite-menor-dica" className="px-hint px-indent">
        Versão {buyer.minorTermVersion}. Registramos a versão, a data, o IP e o pedido do aceite.{' '}
        <a href={minorAuthorizationUrl.blank(summary.event.slug)} download className="px-textlink">
          Ver o Termo de Autorização (PDF)
        </a>
      </small>
    </section>
  );
}

function stockMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const itens = (e.details as { itens?: { mensagem: string }[] } | undefined)?.itens;
    if (e.code === 'estoque_alterado' && itens?.length) return `${e.message} ${itens.map(i => i.mensagem).join(' ')}`;
    return e.message;
  }
  return 'Não foi possível concluir. Tente de novo.';
}

function PixBox({ pix, total }: { pix: NonNullable<PaymentView['pix']>; total: number }) {
  const [qr, setQr] = useState<string | null>(pix.qrCodeImage);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (pix.qrCodeImage) return;
    let live = true;
    QRCode.toDataURL(pix.copyPaste, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then(
      url => live && setQr(url),
    );
    return () => {
      live = false;
    };
  }, [pix.copyPaste, pix.qrCodeImage]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pix.copyPaste);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copie o código Pix:', pix.copyPaste);
    }
  };
  return (
    <section aria-labelledby="pix" className="px-pix">
      <div className="px-pix-qr">
        <div className="px-pix-qr-head">
          <span>Pagamento Pix</span>
          <span className="px-nowrap">{brl(total)}</span>
        </div>
        <div className="px-pix-qr-box">
          {qr ? (
            <img className="px-in-block" src={qr} alt="QR Code do Pix de pagamento" width={204} height={204} />
          ) : (
            <span className="px-skel px-pix-qr-skel" aria-busy="true" aria-label="Gerando QR Code" />
          )}
        </div>
        <small>QR de pagamento Pix. Não é o seu ingresso.</small>
      </div>
      <div className="px-pix-side">
        <div className="px-ck-card">
          <h2 id="pix">Pix copia e cola</h2>
          <textarea
            className="px-copy"
            readOnly
            value={pix.copyPaste}
            rows={3}
            aria-label="Pix copia e cola"
            onFocus={e => e.currentTarget.select()}
          />
          <button
            type="button"
            className={`px-btn px-btn-block ${copied ? 'px-btn-copied' : 'px-btn-dark'}`}
            onClick={copy}
          >
            {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
            {copied ? 'Código copiado' : 'Copiar código Pix'}
          </button>
          <p role="status" aria-live="polite" className="px-sr">
            {copied ? 'Código Pix copiado. Cole no aplicativo do banco.' : ''}
          </p>
        </div>
        <ol className="px-pix-steps">
          <li>Abra o aplicativo do seu banco e escolha pagar com Pix.</li>
          <li>Leia o QR Code ou cole o código copiado.</li>
          <li>Confirme o valor de {brl(total)} e conclua.</li>
        </ol>
        <div className="px-awaiting" aria-live="polite">
          <i aria-hidden="true" />
          <span>
            <b>Aguardando pagamento.</b> Esta página atualiza sozinha quando o pagamento for confirmado. Os ingressos
            aparecem depois da confirmação; não é preciso recarregar.
          </span>
        </div>
      </div>
    </section>
  );
}

const POLL_MS = 4000;

/** Texto ao comprador para cada motivo de recusa (o código técnico do gateway nunca aparece na tela). */
const DECLINE_TEXT: Record<DeclineReason, string> = {
  dados_do_cartao: 'Algum dado do cartão não conferiu. Confira número, validade e código de segurança.',
  saldo_insuficiente: 'O cartão não tem limite ou saldo suficiente para esta compra.',
  nao_autorizado: 'O banco do cartão não autorizou o pagamento. Fale com o banco ou use outro cartão.',
  cartao_desabilitado: 'O cartão está desabilitado para compras pela internet. Fale com o banco ou use outro cartão.',
  pagamento_duplicado:
    'Já existe um pagamento igual e recente neste cartão. Se precisar pagar de novo, use outro cartão.',
  seguranca: 'O pagamento foi recusado pela análise de segurança. Tente com outro cartão.',
  limite_de_tentativas: 'Este cartão atingiu o limite de tentativas. Use outro cartão.',
  autenticacao: 'A confirmação com o banco não foi concluída. Tente de novo.',
  outro: 'O pagamento não foi aprovado.',
};

/** Só aparece no ambiente local com o gateway fictício: simula o gateway avisando o servidor, pelo mesmo caminho do webhook. */
function LocalSimulator({ id, onDone }: { id: string; onDone: () => void }) {
  const [env, setEnv] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .site()
      .then(s => setEnv(s.environment))
      .catch(() => {});
  }, []);
  if (env !== 'local') return null;
  const run = async (status: 'aprovado' | 'recusado' | 'expirado' | 'estornado') => {
    setBusy(true);
    try {
      await api.devSimulate(id, status);
    } catch {
      // Sem gateway fictício ativo, a rota não existe: nada a fazer.
    } finally {
      setBusy(false);
      onDone();
    }
  };
  return (
    <section className="px-panel" aria-label="Simulador do ambiente local">
      <h2 className="px-h3">Simulador (só ambiente local)</h2>
      <p className="px-small px-muted">
        O gateway real não existe ainda. Estes botões fazem o gateway fictício avisar o servidor.
      </p>
      <div className="px-actions">
        {(['aprovado', 'recusado', 'expirado', 'estornado'] as const).map(s => (
          <button key={s} type="button" className="px-btn" disabled={busy} onClick={() => run(s)}>
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Pedido: forma de pagamento, Pix, contador e estado atualizado sozinho (RF-33, RF-34, RF-37). */
export function OrderPage({ id }: { id: string }) {
  usePageTitle('Seu pedido · PartyX');
  const ready = useRequireLogin(`/pedido/${id}`);
  const session = useSession();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [method, setMethod] = useState<'pix' | 'cartao'>('pix');
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [options, setOptions] = useState<PaymentOptions | null>(null);
  const [cardOpen, setCardOpen] = useState(false);

  // Forma de pagamento disponível neste ambiente: componente de cartão do gateway e se o Pix cabe na reserva (D-03).
  useEffect(() => {
    if (!ready) return;
    const ctrl = new AbortController();
    api
      .paymentOptions(ctrl.signal)
      .then(o => {
        setOptions(o);
        if (!o.pixAvailable) setMethod('cartao');
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [ready]);

  const refresh = useCallback(async () => {
    try {
      setOrder(await api.order(id));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError(e instanceof ApiError ? e.message : 'Não foi possível atualizar.');
    }
  }, [id]);

  // Atualiza sozinho enquanto o pedido espera pagamento. Para quando muda de estado.
  useEffect(() => {
    if (!ready) return;
    void refresh();
    const t = setInterval(() => {
      setTick(n => n + 1);
      void refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [ready, refresh]);

  // Pedido que já tem forma de pagamento: busca o Pix de novo (recarregar a página não perde o código).
  const hasMethod = order?.paymentMethod ?? null;
  useEffect(() => {
    if (!hasMethod || order?.status !== 'pendente' || payment) return;
    api
      .payment(id)
      .then(setPayment)
      .catch(e => setError(e instanceof ApiError ? e.message : 'Não foi possível carregar o pagamento.'));
  }, [hasMethod, order?.status, id, payment]);

  // Pago: os ingressos são emitidos logo depois da confirmação. Pergunta de novo até aparecerem.
  const paid = order?.status === 'pago';
  useEffect(() => {
    if (!paid || tickets.length > 0) return;
    api
      .tickets()
      .then(all => setTickets(all.filter(t => t.orderId === id)))
      .catch(() => {});
  }, [paid, tickets.length, id, tick]);

  const secondsLeft = useCountdown(
    order?.status === 'pendente' && order.reservation ? order.reservation.secondsLeft : null,
    tick,
  );

  if (!ready)
    return (
      <Layout>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );
  if (notFound) {
    return (
      <Layout>
        <div className="px-wrap px-narrow">
          <div className="px-box px-box-light">
            <h1 className="px-h2">Pedido não encontrado</h1>
            <Link to="/eventos" className="px-btn px-btn-pri">
              Ver eventos
            </Link>
          </div>
        </div>
      </Layout>
    );
  }
  if (!order) {
    return (
      <Layout>
        <div className="px-wrap px-narrow">
          {error ? <ErrorBox onRetry={() => void refresh()} /> : <p aria-busy="true">Carregando pedido…</p>}
        </div>
      </Layout>
    );
  }

  const start = async (m: 'pix' | 'cartao') => {
    // Cartão com token: primeiro o formulário seguro do gateway; a cobrança só é criada quando ele devolve o token.
    if (m === 'cartao' && options?.cardMode === 'token') {
      setError(null);
      setCardOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const p = await api.startPayment(id, m);
      setPayment(p);
      await refresh();
      if (p.redirectUrl) window.location.assign(p.redirectUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível iniciar o pagamento.');
    } finally {
      setBusy(false);
    }
  };
  const payWithCard = async (card: CardTokenData) => {
    setError(null);
    try {
      const p = await api.startPayment(id, 'cartao', card);
      setPayment(p);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível concluir o pagamento. Tente de novo.');
      throw e; // o formulário do gateway volta a aceitar o envio
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      setOrder(await api.cancelOrder(id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível cancelar.');
    } finally {
      setBusy(false);
    }
  };

  const pending = order.status === 'pendente';
  const email = session.user?.email ?? '';
  const units = order.items.reduce((t, i) => t + i.quantity, 0);
  const back = (
    <Link to={`/eventos/${order.event.slug}`} className="px-btn px-btn-pri px-btn-lg">
      Voltar à seleção
    </Link>
  );
  const others = (
    <Link to="/eventos" className="px-btn px-btn-outline px-btn-lg">
      Ver outros eventos
    </Link>
  );

  let body: ReactNode;
  if (pending && !payment && !order.paymentMethod && cardOpen && options?.publicKey) {
    body = (
      <>
        <h1 className="px-ck-title">Pague com cartão</h1>
        {secondsLeft !== null ? <TimerCard secondsLeft={secondsLeft} /> : null}
        <CardBrick
          publicKey={options.publicKey}
          amountCents={order.totalCents}
          payerEmail={email}
          onToken={payWithCard}
        />
        <div className="px-done-actions px-done-actions-start">
          {options.pixAvailable ? (
            <button type="button" className="px-btn px-btn-outline px-btn-lg" onClick={() => setCardOpen(false)}>
              Escolher outra forma
            </button>
          ) : null}
          <button type="button" className="px-btn px-btn-outline px-btn-lg" disabled={busy} onClick={cancel}>
            Cancelar pedido
          </button>
        </div>
      </>
    );
  } else if (pending && !payment && !order.paymentMethod) {
    body = (
      <>
        <h1 className="px-ck-title">Como você quer pagar?</h1>
        {secondsLeft !== null ? <TimerCard secondsLeft={secondsLeft} /> : null}
        <div role="radiogroup" aria-label="Forma de pagamento" className="px-methods">
          {(
            [
              ['pix', 'Pix', 'Aprovação em instantes. O QR Code e o código copia e cola valem até o fim da reserva.'],
              [
                'cartao',
                'Cartão de crédito ou débito',
                options?.cardMode === 'token'
                  ? 'À vista, nos campos seguros do Mercado Pago. Os dados do cartão não passam pela PartyX.'
                  : 'Pagamento em campos seguros do gateway. À vista.',
              ],
            ] as const
          )
            .filter(([k]) => k !== 'pix' || options?.pixAvailable !== false)
            .map(([k, label, text]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={method === k}
                className={`px-method${method === k ? ' px-method-on' : ''}`}
                onClick={() => setMethod(k)}
              >
                <span className="px-radio" aria-hidden="true" />
                <span>
                  <b>{label}</b>
                  <small>{text}</small>
                </span>
              </button>
            ))}
        </div>
        <p className="px-ck-note px-ck-note-box">
          O pagamento é processado pelo gateway na conta da PartyX. Ao continuar, seus ingressos ficam reservados pelo
          prazo exibido. Leia a <Link to="/politica-de-cancelamento">Política de Cancelamento, Troca e Reembolso</Link>.
        </p>
        <div className="px-done-actions px-done-actions-start">
          <button type="button" className="px-btn px-btn-pri px-btn-lg" disabled={busy} onClick={() => start(method)}>
            {busy ? 'Aguarde…' : method === 'pix' ? `Gerar Pix de ${brl(order.totalCents)}` : 'Continuar para o cartão'}
          </button>
          <button type="button" className="px-btn px-btn-outline px-btn-lg" disabled={busy} onClick={cancel}>
            Cancelar pedido
          </button>
        </div>
      </>
    );
  } else if (pending && payment?.pix) {
    body = (
      <>
        <h1 className="px-ck-title">Pague com Pix</h1>
        {secondsLeft !== null ? <TimerCard secondsLeft={secondsLeft} /> : null}
        <PixBox pix={payment.pix} total={order.totalCents} />
      </>
    );
  } else if (pending && order.paymentMethod === 'pix' && !payment && !error) {
    // Pix já gerado, dados do pagamento ainda a caminho: esqueleto do mesmo tamanho (sem mensagem errada nem salto de layout).
    body = (
      <>
        <h1 className="px-ck-title">Pague com Pix</h1>
        {secondsLeft !== null ? <TimerCard secondsLeft={secondsLeft} /> : null}
        <div className="px-pix" aria-busy="true" aria-label="Carregando o Pix">
          <div className="px-skel px-pix-skel-qr" />
          <div className="px-skel px-pix-skel-side" />
        </div>
      </>
    );
  } else if (pending && order.paymentMethod === 'cartao' && options?.cardMode === 'token') {
    // Cartão em análise (o banco ou o antifraude ainda não decidiram): a página atualiza sozinha.
    body = (
      <section className="px-ck-card px-result" aria-live="polite">
        <span className="px-spinner" aria-hidden="true" />
        <h1>Pagamento em análise</h1>
        <p>
          O banco ainda está confirmando o pagamento. Esta página atualiza sozinha e os ingressos aparecem aqui assim
          que ele for aprovado. Não faça um novo pedido.
        </p>
      </section>
    );
  } else if (pending) {
    body = (
      <section className="px-ck-card px-result" aria-live="polite">
        <span className="px-spinner" aria-hidden="true" />
        <h1>Você será levado ao pagamento seguro</h1>
        <p>Se nada acontecer em alguns segundos, use o botão abaixo. Não faça um novo pedido.</p>
        <div className="px-done-actions">
          {payment?.redirectUrl ? (
            <a className="px-btn px-btn-pri px-btn-lg" href={payment.redirectUrl}>
              Ir para o pagamento
            </a>
          ) : null}
        </div>
      </section>
    );
  } else if (order.status === 'pago') {
    body =
      tickets.length === 0 ? (
        <section className="px-ck-card px-result" aria-live="polite">
          <span className="px-done-icon px-result-icon px-tone-ok" aria-hidden="true">
            ✓
          </span>
          <h1>Pagamento confirmado. Preparando seus ingressos</h1>
          <p>Estamos emitindo um ingresso para cada unidade. Os QR Codes aparecem aqui assim que estiverem prontos.</p>
          <div className="px-skel-rows" aria-hidden="true">
            {Array.from({ length: Math.min(units, 4) }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        </section>
      ) : (
        <section className="px-ck-card px-result px-result-ok">
          <span className="px-done-icon px-result-icon px-tone-ok" aria-hidden="true">
            ✓
          </span>
          <span className="px-mono px-muted">Pedido PX-{order.number}</span>
          <h1>Compra confirmada</h1>
          <p>
            {units === 1 ? 'Seu ingresso' : `Seus ${units} ingressos`} para {order.event.name}{' '}
            {units === 1 ? 'já está' : 'já estão'} em Meus ingressos, com um QR Code para cada ingresso. Enviamos a
            confirmação para <b>{maskEmail(email)}</b>.
          </p>
          <ul className="px-ck-tickets" aria-label="Seus ingressos">
            {tickets.map((t, i) => (
              <WalletItem key={t.id} index={i}>
                <Link to={`/ingressos/${t.id}`}>
                  <span>
                    <b>{t.typeName}</b>
                    <small>
                      <span className="px-mono">{t.shortCode}</span>, ingresso {i + 1} de {tickets.length}
                    </small>
                  </span>
                  <span className="px-badge px-badge-ok">Válido</span>
                </Link>
              </WalletItem>
            ))}
          </ul>
          <div className="px-done-actions">
            <Link to="/meus-ingressos" className="px-btn px-btn-pri px-btn-lg">
              Ver meus ingressos
            </Link>
            <a className="px-btn px-btn-outline px-btn-lg" href={`/api/orders/${id}/tickets/pdf`}>
              Baixar ingressos (PDF)
            </a>
          </div>
          {order.event.allowsMinors ? (
            <div className="px-ck-minor">
              <p>
                {order.buyerMinor
                  ? 'Você tem 16 ou 17 anos na data do evento. Na portaria, entregue o Termo de Autorização e Responsabilidade preenchido e assinado pelo seu responsável, com a cópia do documento dele, e apresente o seu documento original com foto.'
                  : 'Acompanhante com 16 ou 17 anos na data do evento entra com o Termo de Autorização e Responsabilidade preenchido e assinado pelo responsável, com a cópia do documento dele.'}
              </p>
              <a className="px-btn px-btn-outline" href={minorAuthorizationUrl.order(id)} download>
                Baixar o Termo de Autorização (PDF)
              </a>
            </div>
          ) : null}
        </section>
      );
  } else if (order.status === 'expirado') {
    body = (
      <ResultCard
        tone="neu"
        icon="◷"
        order={order.number}
        title="O prazo para pagamento terminou"
        actions={
          <>
            {back}
            <Link to="/minhas-compras" className="px-btn px-btn-outline px-btn-lg">
              Ver pedido
            </Link>
          </>
        }
      >
        A reserva foi liberada e este Pix não pode mais ser pago. Se ainda houver ingressos, você pode fazer um novo
        pedido. As quantidades são conferidas de novo. Se você já pagou, aguarde: confirmamos o pagamento mesmo depois
        do prazo.
      </ResultCard>
    );
  } else if (order.status === 'nao_concluido') {
    body = (
      <ResultCard
        tone="err"
        icon="×"
        order={order.number}
        title="Pagamento não aprovado"
        box={{
          tone: 'neu',
          title: 'A disponibilidade é conferida de novo.',
          text: 'Uma nova tentativa cria uma nova reserva. Não há pedido nem ingresso duplicado.',
        }}
        actions={back}
      >
        {order.declineReason && order.declineReason !== 'outro' ? `${DECLINE_TEXT[order.declineReason]} ` : null}O
        pagamento não foi aprovado. Nenhum ingresso foi emitido e nada foi cobrado. Você pode tentar de novo
        {options?.pixAvailable === false ? ', com outro cartão.' : ', com outro cartão ou com Pix.'}
      </ResultCard>
    );
  } else if (order.status === 'pago_sem_estoque') {
    // Contato SÓ da PartyX, vindo da configuração do servidor. Sem ele, mensagem neutra: nada de prazo nem promessa (D-13 pendente).
    const support = order.support ?? null;
    const whatsappDigits = support?.whatsapp?.replace(/\D/g, '') ?? '';
    body = (
      <ResultCard
        tone="warn"
        icon="!"
        order={order.number}
        title="Pagamento confirmado, mas os ingressos esgotaram"
        box={
          support && (support.email || support.whatsapp)
            ? {
                tone: 'warn',
                title: 'Fale com o atendimento da PartyX',
                text: (
                  <>
                    Informe o número do pedido PX-{order.number}.{' '}
                    {support.email ? (
                      <>
                        E-mail: <a href={`mailto:${support.email}`}>{support.email}</a>
                      </>
                    ) : null}
                    {support.email && support.whatsapp ? '. ' : null}
                    {support.whatsapp ? (
                      <>
                        WhatsApp:{' '}
                        <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noopener noreferrer">
                          {support.whatsapp}
                        </a>
                      </>
                    ) : null}
                  </>
                ),
              }
            : {
                tone: 'warn',
                title: 'Seu pagamento ficou registrado.',
                text: 'O caso fica registrado com o número deste pedido para análise da PartyX. Guarde o número do pedido.',
              }
        }
        actions={
          <>
            <Link to="/minhas-compras" className="px-btn px-btn-pri px-btn-lg">
              Ver pedido
            </Link>
            {others}
          </>
        }
      >
        Seu pagamento foi aprovado depois do fim da reserva e, nesse intervalo, as unidades foram vendidas. Nenhum
        ingresso foi emitido para este pedido.
      </ResultCard>
    );
  } else {
    const label: Record<string, string> = {
      estornado: 'Pedido estornado',
      contestado: 'Pagamento contestado',
      cancelado: 'Pedido cancelado',
    };
    body = (
      <ResultCard
        tone="neu"
        icon="i"
        order={order.number}
        title={label[order.status] ?? 'Pedido encerrado'}
        actions={
          <>
            <Link to="/minhas-compras" className="px-btn px-btn-pri px-btn-lg">
              Ver minhas compras
            </Link>
            {others}
          </>
        }
      >
        Este pedido não tem mais ingressos válidos. Em caso de dúvida, <PartyxContact />.
      </ResultCard>
    );
  }

  const step: 0 | 1 | 2 = pending ? 1 : 2;
  return (
    <CheckoutShell
      step={step}
      aside={order}
      badge={
        <span className="px-badge-line">
          Pedido: <StatusBadge status={order.status} />
        </span>
      }
    >
      <p className="px-sr" role="status" aria-live="polite">
        Situação do pedido: {order.status}
      </p>
      <Stage
        key={
          pending
            ? payment?.pix || (order.paymentMethod === 'pix' && !payment)
              ? 'pix'
              : order.paymentMethod || payment
                ? 'gateway'
                : 'metodo'
            : order.status
        }
        id={order.status}
      >
        {body}
      </Stage>
      {order.paymentMethod && order.status !== 'estornado' && options?.provider === 'mock' ? (
        <LocalSimulator id={id} onDone={() => void refresh()} />
      ) : null}
      {error ? (
        <p className="px-notice px-notice-err" role="alert">
          {error}
        </p>
      ) : null}
    </CheckoutShell>
  );
}

function StatusBadge({ status }: { status: OrderView['status'] }) {
  const map: Record<string, ['ok' | 'warn' | 'err' | 'neu' | 'info', string]> = {
    pendente: ['warn', 'Aguardando pagamento'],
    pago: ['ok', 'Pago'],
    expirado: ['neu', 'Expirado'],
    nao_concluido: ['err', 'Não concluído'],
    estornado: ['info', 'Estornado'],
    contestado: ['err', 'Contestado'],
    cancelado: ['neu', 'Cancelado'],
    pago_sem_estoque: ['err', 'Pago sem estoque'],
  };
  const [tone, label] = map[status] ?? ['neu', status];
  // Reaproveita o estilo das etiquetas da vitrine pelo mesmo conjunto de classes.
  return <span className={`px-badge px-badge-${tone}`}>{label}</span>;
}
