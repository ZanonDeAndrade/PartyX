import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, type LegalKind, type LegalVersions } from './api';
import { Layout, PartyxContact, usePageTitle } from './components';
import { calendarDate, cpfInput, maskEmail, phoneInput } from './format';
import { HumanCheck } from './HumanCheck';
import { HUMAN_INITIAL, humanGate, type HumanState } from './humanGate';
import { IconBack } from './icons';
import { Link, useRouter } from './router';
import { safeReturnPath, takeSessionExpired, useSession } from './session';
import { useFetch } from './useFetch';

function useReturnTo() {
  const { loc } = useRouter();
  return safeReturnPath(new URLSearchParams(loc.search).get('voltar'));
}

export function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: 'numeric' | 'tel' | 'email' | 'text';
  hint?: string;
  placeholder?: string;
  wide?: boolean;
}) {
  const describedBy = [props.error ? `${props.id}-erro` : '', props.hint ? `${props.id}-dica` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={`px-field${props.wide === false ? '' : ' px-field-wide'}`}>
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={e => props.onChange(e.target.value)}
      />
      {props.error ? (
        <small id={`${props.id}-erro`} className="px-error" role="alert">
          {props.error}
        </small>
      ) : null}
      {props.hint ? (
        <small id={`${props.id}-dica`} className="px-hint">
          {props.hint}
        </small>
      ) : null}
    </div>
  );
}

/** Regras de senha mostradas ao vivo. O servidor confere de novo: isto só orienta. */
const PASSWORD_RULES: ReadonlyArray<{ label: string; ok: (v: string) => boolean }> = [
  { label: 'Pelo menos 8 caracteres', ok: v => v.length >= 8 },
  { label: 'Letras e números', ok: v => /[A-Za-z]/.test(v) && /\d/.test(v) },
];

/** Senha com botão Mostrar/Ocultar e, se pedido, a lista de regras. */
export function PasswordField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete: string;
  rules?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="px-field px-field-wide">
      <label htmlFor={props.id}>{props.label}</label>
      <span className={`px-pw${props.error ? ' px-pw-bad' : ''}`}>
        <input
          id={props.id}
          type={shown ? 'text' : 'password'}
          value={props.value}
          autoComplete={props.autoComplete}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.error ? `${props.id}-erro` : undefined}
          onChange={e => props.onChange(e.target.value)}
        />
        <button type="button" className="px-pw-toggle" aria-pressed={shown} onClick={() => setShown(v => !v)}>
          {shown ? 'Ocultar' : 'Mostrar'}
        </button>
      </span>
      {props.rules ? (
        <ul className="px-rules" aria-label="Regras da senha">
          {PASSWORD_RULES.map(r => {
            const ok = r.ok(props.value);
            return (
              <li key={r.label} className={ok ? 'px-rule-ok' : ''}>
                <span aria-hidden="true">{ok ? '✓' : '○'}</span> {r.label}
                <span className="px-sr">{ok ? ': atendida' : ': pendente'}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {props.error ? (
        <small id={`${props.id}-erro`} className="px-error" role="alert">
          {props.error}
        </small>
      ) : null}
    </div>
  );
}

/** Cartão de mensagem (A04–A06, G04): ícone, título, explicação e ações. */
function MessageCard({
  tone = 'info',
  icon,
  title,
  children,
  list,
  actions,
}: {
  tone?: 'info' | 'ok' | 'warn';
  icon: string;
  title: string;
  children: React.ReactNode;
  list?: string[];
  actions: React.ReactNode;
}) {
  return (
    <section className="px-authcard px-done" aria-labelledby="msg-title">
      <span className={`px-done-icon px-done-${tone}`} aria-hidden="true">
        {icon}
      </span>
      <h1 id="msg-title">{title}</h1>
      <p>{children}</p>
      {list ? (
        <ul className="px-done-list">
          {list.map(l => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      <div className="px-done-actions">{actions}</div>
    </section>
  );
}

/** Cartão branco dos formulários de conta (A01–A06). */
function AuthCard({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`px-auth${wide ? ' px-auth-wide' : ''}`}>{children}</div>;
}

export function LoginPage() {
  usePageTitle('Entrar · PartyX');
  const { go } = useRouter();
  const session = useSession();
  const back = useReturnTo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expired] = useState(takeSessionExpired);

  useEffect(() => {
    if (session.status === 'user') go(back);
  }, [session.status, back, go]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await session.login(email, password);
      // Senha temporária da equipe: troca obrigatória antes de qualquer coisa. Validador sem destino pedido vai direto à portaria.
      if (user?.mustChangePassword) go('/primeiro-acesso');
      else if (user?.role === 'validador' && back === '/') go('/portaria');
      else go(back);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'login_bloqueado'
          ? 'Acesso bloqueado por alguns minutos, depois de várias tentativas sem sucesso.'
          : err instanceof ApiError
            ? err.message
            : 'Não foi possível entrar.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <AuthCard>
        {expired ? (
          <p className="px-notice px-notice-warn" role="alert">
            <b>Sua sessão terminou.</b> Por segurança, entre de novo. Depois de entrar, você volta para onde estava
            {back.startsWith('/checkout/') ? ', com a seleção de ingressos guardada' : ''}.
          </p>
        ) : back.startsWith('/checkout/') ? (
          <p className="px-notice px-notice-info" role="note">
            <b>Entre para continuar sua compra.</b> Sua seleção de ingressos continua guardada.
          </p>
        ) : back !== '/' ? (
          <p className="px-notice px-notice-info" role="note">
            <b>Entre para continuar.</b> Depois de entrar, você volta para a página que estava abrindo.
          </p>
        ) : null}
        <section className="px-authcard" aria-labelledby="auth-title">
          <header>
            <h1 id="auth-title">Entrar</h1>
            <p>Use o e-mail e a senha da sua conta PartyX.</p>
          </header>
          {error ? (
            <p className="px-notice px-notice-err" role="alert">
              {error}
            </p>
          ) : null}
          <form onSubmit={submit} className="px-form" noValidate>
            <Field
              id="email"
              label="E-mail"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              inputMode="email"
              placeholder="nome@exemplo.com"
            />
            <PasswordField
              id="senha"
              label="Senha"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
            <Link to="/recuperar-senha" className="px-textlink px-textlink-sm px-self-start">
              Esqueci minha senha
            </Link>
            <button type="submit" className="px-btn px-btn-pri px-btn-lg" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          <div className="px-alt">
            <span>Ainda não tem conta?</span>
            <Link to={`/criar-conta?voltar=${encodeURIComponent(back)}`} className="px-btn px-btn-outline">
              Criar conta
            </Link>
          </div>
        </section>
      </AuthCard>
    </Layout>
  );
}

export function SignupPage() {
  usePageTitle('Criar conta · PartyX');
  const { go } = useRouter();
  const session = useSession();
  const back = useReturnTo();
  const [f, setF] = useState({ name: '', email: '', cpf: '', phone: '', password: '' });
  const [accept, setAccept] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState('');
  const [busy, setBusy] = useState(false);
  const [human, setHuman] = useState<HumanState>(HUMAN_INITIAL);
  const [humanReset, setHumanReset] = useState(0);
  // Depois do cadastro a pessoa já está conectada: a tela "Conta criada" aparece antes de seguir, sem redirecionar de imediato.
  const [created, setCreated] = useState<string | null>(null);
  const justRegistered = useRef(false);
  const [legal, setLegal] = useState<LegalVersions | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF(s => ({ ...s, [k]: v }));

  useEffect(() => {
    api
      .legal()
      .then(setLegal)
      .catch(() => setGeneral('Não foi possível carregar os termos. Tente de novo.'));
  }, []);
  useEffect(() => {
    if (session.status === 'user' && !justRegistered.current) go(back);
  }, [session.status, back, go]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!legal) return;
    setErrors({});
    setGeneral('');
    setBusy(true);
    justRegistered.current = true;
    try {
      await session.register({
        ...f,
        acceptedTermsVersion: legal.terms,
        acceptedPrivacyVersion: legal.privacy,
        // O aceite só vale se a pessoa marcou. Nunca vem pré-marcado (CA-03).
        accept,
        captchaToken: human.token ?? undefined,
      });
      setCreated(maskEmail(f.email));
    } catch (err) {
      justRegistered.current = false;
      setHumanReset(n => n + 1); // o token vale uma vez só
      if (err instanceof ApiError && err.code?.startsWith('verificacao_humana')) setGeneral(err.message);
      else if (err instanceof ApiError && err.status === 422) setErrors(err.fields);
      else setGeneral(err instanceof ApiError ? err.message : 'Não foi possível criar a conta.');
    } finally {
      setBusy(false);
    }
  };

  if (created !== null) {
    return (
      <Layout>
        <AuthCard wide>
          <section className="px-authcard px-done" aria-labelledby="auth-title">
            <span className="px-done-icon" aria-hidden="true">
              ✓
            </span>
            <h1 id="auth-title">Conta criada</h1>
            <p>
              Você já está conectado. Enviamos uma confirmação de cadastro para <b>{created}</b>. Não é preciso
              confirmar o e-mail para continuar.
            </p>
            <button type="button" className="px-btn px-btn-pri px-btn-lg" onClick={() => go(back)}>
              {back === '/' ? 'Ver eventos' : 'Continuar para o pedido'}
            </button>
          </section>
        </AuthCard>
      </Layout>
    );
  }

  const failed = Object.keys(errors).length;
  return (
    <Layout>
      <AuthCard wide>
        {back !== '/' ? (
          <p className="px-notice px-notice-info" role="note">
            <b>Sua seleção está guardada.</b> Depois de criar a conta, você volta para o pedido.
          </p>
        ) : null}
        <section className="px-authcard" aria-labelledby="auth-title">
          <header>
            <h1 id="auth-title">Criar conta</h1>
            <p>Seus ingressos são emitidos no nome informado aqui.</p>
          </header>
          {legal?.provisional ? (
            <p className="px-notice px-notice-info" role="note">
              <b>Ambiente de homologação.</b> Os Termos de Uso e a Política de Privacidade oficiais da PartyX ainda não
              foram publicados. O aceite aqui registra uma versão de teste, sem valor jurídico.
            </p>
          ) : null}
          {legal && !legal.ready ? (
            <p className="px-notice px-notice-err" role="alert">
              O cadastro está temporariamente indisponível.
            </p>
          ) : null}
          {failed > 0 ? (
            <p className="px-notice px-notice-err" role="alert">
              <b>Revise os campos destacados.</b>{' '}
              {failed === 1 ? '1 campo precisa de atenção.' : `${failed} campos precisam de atenção.`}
            </p>
          ) : null}
          {general ? (
            <p className="px-notice px-notice-err" role="alert">
              {general}
            </p>
          ) : null}
          <form onSubmit={submit} className="px-form px-form-grid" noValidate>
            <Field
              id="nome"
              label="Nome completo"
              value={f.name}
              onChange={set('name')}
              error={errors.name}
              autoComplete="name"
            />
            <Field
              id="email"
              label="E-mail"
              type="email"
              value={f.email}
              onChange={set('email')}
              error={errors.email}
              autoComplete="email"
              inputMode="email"
              placeholder="nome@exemplo.com"
            />
            <Field
              id="cpf"
              label="CPF"
              value={f.cpf}
              onChange={v => set('cpf')(cpfInput(v))}
              error={errors.cpf}
              inputMode="numeric"
              placeholder="000.000.000-00"
              hint="Usado para identificar sua conta. Não aparece no ingresso."
              wide={false}
            />
            <Field
              id="tel"
              label="Telefone com DDD"
              value={f.phone}
              onChange={v => set('phone')(phoneInput(v))}
              error={errors.phone}
              autoComplete="tel"
              inputMode="tel"
              placeholder="(11) 98765-4321"
              wide={false}
            />
            <PasswordField
              id="senha"
              label="Senha"
              value={f.password}
              onChange={set('password')}
              error={errors.password}
              autoComplete="new-password"
              rules
            />
            <div className="px-field-wide px-accept">
              <div className="px-check">
                <input
                  id="aceite"
                  type="checkbox"
                  checked={accept}
                  onChange={e => setAccept(e.target.checked)}
                  aria-describedby={errors.accept ? 'aceite-erro' : 'aceite-dica'}
                />
                <label htmlFor="aceite">
                  Li e aceito os <Link to="/termos-de-uso">Termos de Uso</Link> e a{' '}
                  <Link to="/privacidade">Política de Privacidade</Link>.
                </label>
              </div>
              {errors.accept ? (
                <small id="aceite-erro" className="px-error px-indent" role="alert">
                  {errors.accept}
                </small>
              ) : null}
              <small id="aceite-dica" className="px-hint px-indent">
                {legal && !legal.provisional
                  ? `Você aceita os Termos de Uso, versão ${legal.terms}${legal.termsDate ? ` de ${calendarDate(legal.termsDate)}` : ''}, e a Política de Privacidade, versão ${legal.privacy}${legal.privacyDate ? ` de ${calendarDate(legal.privacyDate)}` : ''}. `
                  : ''}
                Registramos a versão dos documentos, a data e o IP do aceite.
              </small>
            </div>
            <div className="px-field-wide">
              <HumanCheck onChange={setHuman} resetKey={humanReset} />
            </div>
            <button
              type="submit"
              className="px-btn px-btn-pri px-btn-lg px-field-wide"
              disabled={busy || !legal || !legal.ready || humanGate(human).blocked}
            >
              {busy ? 'Criando…' : humanGate(human).checking ? 'Verificando…' : 'Criar conta'}
            </button>
          </form>
          <div className="px-alt px-alt-row">
            <span>Já tem conta?</span>
            <Link to={`/entrar?voltar=${encodeURIComponent(back)}`} className="px-textlink px-textlink-sm">
              Entrar
            </Link>
          </div>
        </section>
      </AuthCard>
    </Layout>
  );
}

/** Páginas legais: o texto é do cliente e ainda não foi entregue (Prompt 19). Não há texto provisório com valor jurídico. */
export function LegalPage({ kind }: { kind: LegalKind }) {
  const [state] = useFetch(signal => api.legalDocument(kind, signal), kind);
  const doc = state.status === 'ok' ? state.data : null;
  usePageTitle(`${doc?.title ?? 'Documento'} · PartyX`);
  const docs: ReadonlyArray<{ to: string; label: string; kind: LegalKind }> = [
    { to: '/termos-de-uso', label: 'Termos de Uso', kind: 'termos-de-uso' },
    { to: '/privacidade', label: 'Política de Privacidade', kind: 'privacidade' },
    { to: '/politica-de-cancelamento', label: 'Cancelamento, troca e reembolso', kind: 'cancelamento' },
    { to: '/meia-entrada', label: 'Meia-entrada', kind: 'meia-entrada' },
  ];
  return (
    <Layout>
      <div className="px-wrap px-legal-page">
        <nav className="px-legal-nav" aria-label="Documentos">
          <b>Documentos</b>
          {docs.map(d => (
            <Link key={d.kind} to={d.to} aria-current={d.kind === kind ? 'page' : undefined}>
              {d.label}
            </Link>
          ))}
        </nav>
        <article className="px-legal-card">
          <h1>{doc?.title ?? ''}</h1>
          {doc?.status === 'oficial' && doc.version ? (
            <p className="px-legal-meta">
              <span>Versão {doc.version}</span>
              {doc.effectiveDate ? <span>Vigente desde {calendarDate(doc.effectiveDate)}</span> : null}
            </p>
          ) : null}
          {state.status === 'loading' ? <p role="status">Carregando…</p> : null}
          {state.status === 'error' ? (
            <p className="px-notice px-notice-err">Não foi possível carregar o documento. Tente de novo.</p>
          ) : null}
          {doc?.status === 'homologacao' ? (
            <p className="px-notice px-notice-neu" role="note">
              <b>Ambiente de homologação.</b> O texto oficial ainda não foi fornecido pela PartyX.
            </p>
          ) : null}
          {doc?.status === 'pendente' ? (
            <p className="px-notice px-notice-neu" role="note">
              Este documento ainda não está disponível. Em caso de dúvida, <PartyxContact />.
            </p>
          ) : null}
          <div className="px-legal">
            {doc?.blocks.map((b, n) =>
              b.type === 'heading' ? (
                <h2 key={n} className="px-h2">
                  {b.text}
                </h2>
              ) : (
                <p key={n}>{b.text}</p>
              ),
            )}
          </div>
        </article>
      </div>
    </Layout>
  );
}

/** Pede o link de recuperação. A resposta é a mesma exista o e-mail ou não (não revela quem tem conta). */
export function ForgotPasswordPage() {
  usePageTitle('Recuperar senha · PartyX');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [human, setHuman] = useState<HumanState>(HUMAN_INITIAL);
  const [humanReset, setHumanReset] = useState(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.forgotPassword(email, human.token);
      setSent(true);
    } catch (err) {
      setHumanReset(n => n + 1); // o token vale uma vez só
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Layout>
        <AuthCard wide>
          <MessageCard
            icon="✉"
            title="Verifique seu e-mail"
            list={[
              'O link vale por 1 hora e só pode ser usado uma vez.',
              'Confira também a caixa de spam ou promoções.',
              'Não recebeu? Aguarde alguns minutos e faça uma nova solicitação.',
            ]}
            actions={
              <>
                <Link to="/entrar" className="px-btn px-btn-pri px-btn-lg">
                  Voltar para entrar
                </Link>
                <button type="button" className="px-btn px-btn-outline px-btn-lg" onClick={() => setSent(false)}>
                  Nova solicitação
                </button>
              </>
            }
          >
            Se houver uma conta PartyX com o e-mail <b>{email.trim()}</b>, você receberá um link para criar uma nova
            senha nos próximos minutos.
          </MessageCard>
        </AuthCard>
      </Layout>
    );
  }
  return (
    <Layout>
      <AuthCard>
        <section className="px-authcard" aria-labelledby="auth-title">
          <Link to="/entrar" className="px-textlink px-textlink-sm px-self-start">
            <IconBack size={18} />
            Voltar para entrar
          </Link>
          <header>
            <h1 id="auth-title">Recuperar senha</h1>
            <p>
              Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um link para criar uma nova senha. O
              link vale por 1 hora e só pode ser usado uma vez.
            </p>
          </header>
          <form onSubmit={submit} className="px-form" noValidate>
            <Field
              id="email"
              label="E-mail"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              inputMode="email"
              placeholder="nome@exemplo.com"
            />
            {error ? (
              <p className="px-notice px-notice-err" role="alert">
                {error}
              </p>
            ) : null}
            <HumanCheck onChange={setHuman} resetKey={humanReset} />
            <button
              type="submit"
              className="px-btn px-btn-pri px-btn-lg"
              disabled={busy || !email.trim() || humanGate(human).blocked}
            >
              {busy ? 'Enviando…' : humanGate(human).checking ? 'Verificando…' : 'Enviar link'}
            </button>
          </form>
        </section>
      </AuthCard>
    </Layout>
  );
}

/** Define a nova senha com o link do e-mail. O token sai do endereço assim que é lido (não fica no histórico nem vaza em compartilhamento). */
export function ResetPasswordPage() {
  usePageTitle('Nova senha · PartyX');
  const { loc } = useRouter();
  const [token] = useState(() => new URLSearchParams(loc.search).get('token') ?? '');
  const [state, setState] = useState<'verificando' | 'valido' | 'expirado' | 'utilizado' | 'invalido' | 'concluido'>(
    'verificando',
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Tira o token do endereço visível, mantendo-o só em memória.
    if (token) window.history.replaceState(null, '', '/redefinir-senha');
    if (!token) {
      setState('invalido');
      return;
    }
    api
      .checkResetToken(token)
      .then(setState)
      .catch(() => setState('invalido'));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGeneral('');
    if (password !== confirm) {
      setErrors({ confirm: 'As senhas não são iguais.' });
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      setState('concluido');
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.fields);
      else if (err instanceof ApiError && err.status === 400)
        setState(err.code === 'link_expirado' ? 'expirado' : err.code === 'link_utilizado' ? 'utilizado' : 'invalido');
      else setGeneral(err instanceof ApiError ? err.message : 'Não foi possível salvar a senha.');
    } finally {
      setBusy(false);
    }
  };

  const bad: Record<string, { title: string; text: string }> = {
    expirado: {
      title: 'Este link expirou',
      text: 'Por segurança, o link de recuperação vale por 1 hora. Solicite um novo link para criar sua senha.',
    },
    utilizado: {
      title: 'Este link já foi utilizado',
      text: 'Cada link de recuperação pode ser usado uma única vez. Se você não alterou sua senha, solicite um novo link.',
    },
    invalido: {
      title: 'Este link não é válido',
      text: 'O endereço está incompleto ou foi alterado. Solicite um novo link para criar sua senha.',
    },
  };
  return (
    <Layout>
      <AuthCard wide={state !== 'valido'}>
        {state === 'verificando' ? (
          <section className="px-authcard" aria-busy="true">
            <p role="status">Conferindo o link…</p>
          </section>
        ) : null}
        {state in bad ? (
          <MessageCard
            tone="warn"
            icon="!"
            title={bad[state]!.title}
            actions={
              <>
                <Link to="/recuperar-senha" className="px-btn px-btn-pri px-btn-lg">
                  Solicitar novo link
                </Link>
                <Link to="/entrar" className="px-btn px-btn-outline px-btn-lg">
                  Voltar para entrar
                </Link>
              </>
            }
          >
            {bad[state]!.text}
          </MessageCard>
        ) : null}
        {state === 'valido' ? (
          <section className="px-authcard" aria-labelledby="auth-title">
            <header>
              <h1 id="auth-title">Criar nova senha</h1>
              <p>Escolha uma senha que você não usa em outros sites.</p>
            </header>
            {general ? (
              <p className="px-notice px-notice-err" role="alert">
                {general}
              </p>
            ) : null}
            <form onSubmit={submit} className="px-form" noValidate>
              <PasswordField
                id="nova"
                label="Nova senha"
                value={password}
                onChange={setPassword}
                error={errors.password}
                autoComplete="new-password"
                rules
              />
              <PasswordField
                id="confirma"
                label="Confirmar nova senha"
                value={confirm}
                onChange={setConfirm}
                error={errors.confirm}
                autoComplete="new-password"
              />
              <button type="submit" className="px-btn px-btn-pri px-btn-lg" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar nova senha'}
              </button>
            </form>
          </section>
        ) : null}
        {state === 'concluido' ? (
          <MessageCard
            tone="ok"
            icon="✓"
            title="Senha alterada"
            actions={
              <Link to="/entrar" className="px-btn px-btn-pri px-btn-lg">
                Entrar
              </Link>
            }
          >
            Sua nova senha já está valendo. Entre com ela para acessar seus ingressos. Os outros aparelhos foram
            desconectados.
          </MessageCard>
        ) : null}
      </AuthCard>
    </Layout>
  );
}

/** Primeiro acesso da equipe (ADM22): troca a senha temporária. Sem isso a portaria e o painel ficam bloqueados. */
export function FirstAccessPage() {
  usePageTitle('Primeiro acesso · PartyX');
  const { go } = useRouter();
  const session = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session.status === 'anon') go('/entrar?voltar=%2Fprimeiro-acesso');
    else if (session.status === 'user' && session.user?.role === 'cliente') go('/minha-conta');
  }, [session.status, go]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGeneral('');
    if (next !== confirm) {
      setErrors({ confirm: 'As senhas não são iguais.' });
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      await session.logout();
      go('/entrar');
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.fields);
      else setGeneral(err instanceof ApiError ? err.message : 'Não foi possível trocar a senha.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <AuthCard>
        <section className="px-authcard" aria-labelledby="auth-title">
          <header>
            <p className="px-kicker">Primeiro acesso</p>
            <h1 id="auth-title">Crie sua senha</h1>
            <p>A senha temporária que você recebeu deixa de valer. Até a troca, nenhuma outra área fica disponível.</p>
          </header>
          {general ? (
            <p className="px-notice px-notice-err" role="alert">
              {general}
            </p>
          ) : null}
          <form onSubmit={submit} className="px-form" noValidate>
            <PasswordField
              id="atual"
              label="Senha temporária"
              value={current}
              onChange={setCurrent}
              error={errors.currentPassword}
              autoComplete="current-password"
            />
            <PasswordField
              id="nova"
              label="Nova senha"
              value={next}
              onChange={setNext}
              error={errors.newPassword}
              autoComplete="new-password"
              rules
            />
            <PasswordField
              id="confirma"
              label="Confirmar nova senha"
              value={confirm}
              onChange={setConfirm}
              error={errors.confirm}
              autoComplete="new-password"
            />
            <button type="submit" className="px-btn px-btn-pri px-btn-lg" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar senha'}
            </button>
          </form>
        </section>
      </AuthCard>
    </Layout>
  );
}
