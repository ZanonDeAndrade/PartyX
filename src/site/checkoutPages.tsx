import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  api,
  ApiError,
  type CartItem,
  type OrderView,
  type PaymentView,
  type Summary,
  type TicketSummary,
} from './api';
import { loadCart, saveCart } from './cart';
import { ErrorBox, Layout, stripesFor, usePageTitle } from './components';
import { mmss, useCountdown } from './countdown';
import { brl, dateShort, maskEmail, timeOf } from './format';
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
  items: { name: string; quantity: number; subtotalCents: number }[];
  totalCents: number;
  coupon: { code: string } | null;
}

const STEPS = ['Revisão', 'Pagamento', 'Confirmação'] as const;

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
                {i < step ? '✓' : i + 1}
              </span>
              {label}
              {i < STEPS.length - 1 ? (
                <span className="px-step-sep" aria-hidden="true">
                  ›
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="px-ck-grid">
          <div className="px-ck-main">{children}</div>
          {aside ? (
            <aside className="px-ck-aside" aria-label="Resumo do pedido">
              <div className="px-ck-event">
                <span className="px-ck-thumb" style={{ background: stripesFor(aside.event.name, 6) }} aria-hidden="true" />
                <div>
                  <b>{aside.event.name}</b>
                  <small className="px-ck-date">
                    {dateShort(aside.event.startsAt)} · {timeOf(aside.event.startsAt)}
                  </small>
                  <small>{aside.event.venue}</small>
                </div>
              </div>
              {badge ? <div className="px-ck-badges">{badge}</div> : null}
              <ul className="px-ck-lines">
                {aside.items.map(i => (
                  <li key={i.name}>
                    <span>
                      {i.quantity} × {i.name}
                    </span>
                    <span>{brl(i.subtotalCents)}</span>
                  </li>
                ))}
                {aside.coupon ? (
                  <li className="px-ck-promo">
                    <span>Promoter</span>
                    <span className="px-mono">{aside.coupon.code} · sem alteração de valor</span>
                  </li>
                ) : null}
              </ul>
              <p className="px-ck-total">
                <b>Total</b>
                <b>{brl(aside.totalCents)}</b>
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

/** Prazo da reserva (C04): faixa que vira amarela nos dois últimos minutos. */
function TimerCard({ secondsLeft }: { secondsLeft: number }) {
  const peak = useRef(secondsLeft);
  if (secondsLeft > peak.current) peak.current = secondsLeft;
  const warn = secondsLeft < 120;
  const pct = peak.current > 0 ? Math.min(100, (secondsLeft / peak.current) * 100) : 0;
  return (
    <div className={`px-timerbar${warn ? ' px-timerbar-warn' : ''}`} role="timer" aria-live="off">
      <div>
        <b>Ingressos reservados para você</b>
        <span className="px-mono">{mmss(secondsLeft)}</span>
      </div>
      <div className="px-timerbar-track">
        <div style={{ width: `${pct}%` }} />
      </div>
      <small>
        Conclua o pagamento dentro do prazo. Depois disso a reserva é liberada e os ingressos voltam para venda.
      </small>
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
      <span className={`px-done-icon px-tone-${tone}`} aria-hidden="true">
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
      const order = await api.createOrder(slug, items, applied, summary.totalCents);
      saveCart(null);
      go(`/pedido/${order.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'preco_alterado') await load(applied);
      setError({ message: stockMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const user = session.user;
  const goPay = (
    <button type="button" className="px-btn px-btn-pri px-btn-lg" disabled={!summary || busy} onClick={pay}>
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
            <b>{summary ? brl(summary.totalCents) : '—'}</b>
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
            {summary.items.map(i => (
              <li key={i.ticketTypeId}>
                <span>
                  <b>{i.quantity} ×</b> {i.name}
                  <small>{brl(i.unitPriceCents)} cada</small>
                </span>
                <b>{brl(i.subtotalCents)}</b>
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
            <dd>{user?.cpf ?? '—'}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{user?.phone ?? '—'}</dd>
          </div>
        </dl>
        <p className="px-ck-note">
          Todos os ingressos deste pedido serão emitidos em nome de <b>{user?.name}</b>.
        </p>
      </section>

      <section aria-labelledby="promoter" className="px-ck-card">
        <h2 id="promoter">
          Código do promoter <small>(opcional)</small>
        </h2>
        <p className="px-ck-text">
          Se alguém indicou o evento, informe o código dessa pessoa. O código registra a indicação e não altera o valor do
          pedido.
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
          <span>{brl(total)}</span>
        </div>
        <div className="px-pix-qr-box">
          {qr ? (
            <img src={qr} alt="QR Code do Pix de pagamento" width={204} height={204} />
          ) : (
            <p aria-busy="true">Gerando QR Code…</p>
          )}
        </div>
        <small>QR de pagamento. Não é o seu ingresso.</small>
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
          <button type="button" className="px-btn px-btn-dark px-btn-block" onClick={copy}>
            Copiar código Pix
          </button>
          <p role="status" aria-live="polite" className="px-copied px-copied-light">
            {copied ? 'Código copiado.' : ''}
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
            <b>Aguardando pagamento.</b> Esta página atualiza sozinha quando o gateway confirmar. Os ingressos são
            liberados depois da confirmação.
          </span>
        </div>
      </div>
    </section>
  );
}

const POLL_MS = 4000;

/** Só aparece no ambiente local: simula o gateway fictício avisando o servidor, pelo mesmo caminho do webhook. */
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
  if (pending && !payment && !order.paymentMethod) {
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
                'Cartão de crédito',
                'Pagamento em campos seguros do gateway. Parcelamento aparece somente se estiver habilitado e aprovado no gateway escolhido.',
              ],
            ] as const
          ).map(([k, label, text]) => (
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
          <span className="px-done-icon px-tone-ok" aria-hidden="true">
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
        <section className="px-ck-card px-result">
          <span className="px-done-icon px-tone-ok" aria-hidden="true">
            ✓
          </span>
          <span className="px-mono px-muted">Pedido PX-{order.number}</span>
          <h1>Compra confirmada</h1>
          <p>
            Seus {units} {units === 1 ? 'ingresso' : 'ingressos'} para {order.event.name} estão em Meus ingressos.
            Enviamos a confirmação com o link de acesso para <b>{maskEmail(email)}</b>.
          </p>
          <ul className="px-ck-tickets">
            {tickets.map((t, i) => (
              <li key={t.id}>
                <Link to={`/ingressos/${t.id}`}>
                  <span>
                    <b>{t.typeName}</b>
                    <small className="px-mono">
                      {t.shortCode} · {i + 1} de {tickets.length}
                    </small>
                  </span>
                  <span className="px-badge px-badge-ok">Válido</span>
                </Link>
              </li>
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
        pedido. As quantidades são conferidas de novo. Se você já pagou, aguarde: confirmamos o pagamento mesmo depois do
        prazo.
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
        O pagamento não foi aprovado. Nenhum ingresso foi emitido e nada foi cobrado. Você pode tentar de novo, com outro
        cartão ou com Pix.
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
                    {support.email && support.whatsapp ? ' · ' : null}
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
        Seu pagamento foi aprovado depois do fim da reserva e, nesse intervalo, as unidades foram vendidas. Nenhum ingresso
        foi emitido para este pedido.
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
        Este pedido não tem mais ingressos válidos. Em caso de dúvida, fale com a PartyX.
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
      {body}
      {order.paymentMethod && order.status !== 'estornado' ? (
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
