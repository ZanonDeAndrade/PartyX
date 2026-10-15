import { lazy, Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/public.css';
import { Layout, MaintenanceScreen, ToastHost } from './components';
import { onMaintenance, type MaintenanceContact } from './api';
import {
  ConsentUpdatePage,
  FirstAccessPage,
  ForgotPasswordPage,
  LegalPage,
  LoginPage,
  ResetPasswordPage,
  SignupPage,
} from './authPages';
import { SessionProvider, useSession } from './session';
import { EventPage, EventsPage, HomePage, NotFoundPage } from './pages';
import { IntroSplash } from './IntroSplash';
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
        path.startsWith('/ingressos/') ||
        path.startsWith('/autorizacao-menor/')
      ? 'cliente'
      : path === '/admin' || path.startsWith('/admin/')
        ? 'admin'
        : path === '/portaria' || path.startsWith('/portaria/')
          ? 'portaria'
          : null;

/** Páginas que continuam abertas durante o novo aceite: os documentos, para a pessoa ler antes de aceitar. */
const LEGAL_PATHS = new Set([
  '/termos-de-uso',
  '/privacidade',
  '/politica-de-cancelamento',
  '/meia-entrada',
  '/termo-menor',
]);

function Routes() {
  const { loc } = useRouter();
  const session = useSession();
  useEffect(() => {
    document.body.classList.add('px-site');
    return () => document.body.classList.remove('px-site');
  }, []);
  // Termos ou Privacidade atualizados: o comprador aceita as versões novas antes de continuar (no login ou no checkout).
  const where = area(loc.path);
  // Área no <html> (antes da pintura): o movimento muda por área (base.css). Painel só esmaece; portaria não anima entradas.
  useLayoutEffect(() => {
    document.documentElement.dataset.area = where ?? 'site';
  }, [where]);
  if (session.status === 'user' && session.pendingConsent && !LEGAL_PATHS.has(loc.path)) return <ConsentUpdatePage />;
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
  if (loc.path === '/termo-menor') return <LegalPage kind="termo-menor" />;
  const m = /^\/eventos\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(loc.path);
  if (m) return <EventPage key={m[1]} slug={m[1]!} />;
  return <NotFoundPage />;
}

/** Manutenção (G06) com o site já aberto: a primeira resposta `manutencao` da API troca a tela inteira pelo aviso. */
function MaintenanceGate({ children }: { children: ReactNode }) {
  const [down, setDown] = useState<{ message: string; contact: MaintenanceContact | null } | null>(null);
  useEffect(() => onMaintenance((message, contact) => setDown({ message, contact })), []);
  return down ? <MaintenanceScreen message={down.message} contact={down.contact} /> : <>{children}</>;
}

/** Vitrine pública do PartyX (Prompt 08). O protótipo navegável fica em `/prototipo`. */
export function SiteApp() {
  return (
    <Router>
      <SessionProvider>
        <MaintenanceGate>
          <Routes />
          <ToastHost />
        </MaintenanceGate>
      </SessionProvider>
      {/* Depois das rotas: a página já está montada por baixo quando a abertura aparece. */}
      <IntroSplash />
    </Router>
  );
}
