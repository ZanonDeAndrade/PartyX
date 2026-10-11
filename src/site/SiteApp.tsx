import { lazy, Suspense, useEffect } from 'react';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/public.css';
import { Layout, ToastHost } from './components';
import { FirstAccessPage, ForgotPasswordPage, LegalPage, LoginPage, ResetPasswordPage, SignupPage } from './authPages';
import { SessionProvider } from './session';
import { EventPage, EventsPage, HomePage, NotFoundPage } from './pages';
import { IntroSplash } from './IntroSplash';
import { MotionRoot } from './motion';
import { Router, useRouter } from './router';

// Cada área tem o próprio pacote (JavaScript e CSS), carregado só quando alguém entra nela. A vitrine e o acesso vão no
// pacote principal: são a porta de entrada e precisam abrir rápido.
const CheckoutArea = lazy(() => import('./areas/checkout'));
const ClientArea = lazy(() => import('./areas/client'));
const AdminArea = lazy(() => import('./areas/admin'));
const GateArea = lazy(() => import('./areas/gate'));

/** Enquanto o pacote da área chega: o mesmo cabeçalho e rodapé, sem piscar uma página vazia de outra cor. */
function AreaLoading({ dark = false }: { dark?: boolean }) {
  return (
    <Layout dark={dark}>
      <div className="px-wrap px-area-loading" aria-busy="true" aria-label="Carregando">
        <span className="px-skel-line" style={{ width: '40%', height: 36 }} />
        <span className="px-skel-line" style={{ width: '70%' }} />
        <span className="px-skel-line" style={{ width: '55%' }} />
      </div>
    </Layout>
  );
}

const area = (path: string) =>
  path.startsWith('/checkout/') || path.startsWith('/pedido/')
    ? 'checkout'
    : path === '/meus-ingressos' ||
        path === '/minhas-compras' ||
        path === '/minha-conta' ||
        path.startsWith('/ingressos/')
      ? 'cliente'
      : path === '/admin' || path.startsWith('/admin/')
        ? 'admin'
        : path === '/portaria' || path.startsWith('/portaria/')
          ? 'portaria'
          : null;

function Routes() {
  const { loc } = useRouter();
  useEffect(() => {
    document.body.classList.add('px-site');
    return () => document.body.classList.remove('px-site');
  }, []);
  const where = area(loc.path);
  if (where === 'checkout')
    return (
      <Suspense fallback={<AreaLoading />}>
        <CheckoutArea path={loc.path} />
      </Suspense>
    );
  if (where === 'cliente')
    return (
      <Suspense fallback={<AreaLoading />}>
        <ClientArea path={loc.path} />
      </Suspense>
    );
  if (where === 'admin')
    return (
      <Suspense fallback={<AreaLoading />}>
        <AdminArea path={loc.path} />
      </Suspense>
    );
  if (where === 'portaria')
    return (
      <Suspense fallback={<AreaLoading dark />}>
        <GateArea path={loc.path} />
      </Suspense>
    );
  if (loc.path === '/') return <HomePage />;
  if (loc.path === '/eventos') return <EventsPage />;
  if (loc.path === '/entrar') return <LoginPage />;
  if (loc.path === '/criar-conta') return <SignupPage />;
  if (loc.path === '/recuperar-senha') return <ForgotPasswordPage />;
  if (loc.path === '/redefinir-senha') return <ResetPasswordPage />;
  if (loc.path === '/primeiro-acesso') return <FirstAccessPage />;
  if (loc.path === '/termos-de-uso') return <LegalPage kind="termos-de-uso" />;
  if (loc.path === '/privacidade') return <LegalPage kind="privacidade" />;
  if (loc.path === '/politica-de-cancelamento') return <LegalPage kind="cancelamento" />;
  if (loc.path === '/meia-entrada') return <LegalPage kind="meia-entrada" />;
  const m = /^\/eventos\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(loc.path);
  if (m) return <EventPage key={m[1]} slug={m[1]!} />;
  return <NotFoundPage />;
}

/** Vitrine pública do PartyX (Prompt 08). O protótipo navegável fica em `/prototipo`. */
export function SiteApp() {
  return (
    <MotionRoot>
      <Router>
        <SessionProvider>
          <Routes />
          <ToastHost />
        </SessionProvider>
        {/* Depois das rotas: a página já está montada por baixo quando a abertura aparece. */}
        <IntroSplash />
      </Router>
    </MotionRoot>
  );
}
