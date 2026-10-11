import { useEffect } from 'react';
import './site.css';
import {
  AdminEventPage,
  AdminEventsPage,
  AdminExceptionsPage,
  AdminOrderPage,
  AdminOrdersPage,
  AdminOverviewPage,
} from './adminPages';
import { GateEventsPage, GatePage } from './gatePages';
import { FeeReportPage, PromoterReportPage, SalesReportPage } from './reportPages';
import { FirstAccessPage, ForgotPasswordPage, LegalPage, LoginPage, ResetPasswordPage, SignupPage } from './authPages';
import { CheckoutPage, OrderPage } from './checkoutPages';
import { SessionProvider } from './session';
import { MyAccountPage } from './accountPages';
import { MyOrdersPage, MyTicketsPage, TicketFullscreenPage, TicketPage } from './ticketPages';
import { EventPage, EventsPage, HomePage, NotFoundPage } from './pages';
import { IntroSplash } from './IntroSplash';
import { Router, useRouter } from './router';

function Routes() {
  const { loc } = useRouter();
  useEffect(() => {
    document.body.classList.add('px-site');
    return () => document.body.classList.remove('px-site');
  }, []);
  if (loc.path === '/') return <HomePage />;
  if (loc.path === '/eventos') return <EventsPage />;
  if (loc.path === '/entrar') return <LoginPage />;
  if (loc.path === '/criar-conta') return <SignupPage />;
  if (loc.path === '/recuperar-senha') return <ForgotPasswordPage />;
  if (loc.path === '/redefinir-senha') return <ResetPasswordPage />;
  if (loc.path === '/primeiro-acesso') return <FirstAccessPage />;
  if (loc.path === '/admin') return <AdminOverviewPage />;
  if (loc.path === '/admin/pedidos') return <AdminOrdersPage />;
  if (loc.path === '/admin/eventos') return <AdminEventsPage />;
  if (loc.path === '/admin/excecoes') return <AdminExceptionsPage />;
  if (loc.path === '/admin/relatorios/vendas') return <SalesReportPage />;
  if (loc.path === '/admin/relatorios/promoters') return <PromoterReportPage />;
  if (loc.path === '/admin/relatorios/taxa-mensal') return <FeeReportPage />;
  const adminOrder = /^\/admin\/pedidos\/([0-9a-f-]{36})$/.exec(loc.path);
  if (adminOrder) return <AdminOrderPage key={adminOrder[1]} id={adminOrder[1]!} />;
  const adminEvent = /^\/admin\/eventos\/([0-9a-f-]{36})$/.exec(loc.path);
  if (adminEvent) return <AdminEventPage key={adminEvent[1]} id={adminEvent[1]!} />;
  if (loc.path === '/portaria') return <GateEventsPage />;
  const gate = /^\/portaria\/([0-9a-f-]{36})$/.exec(loc.path);
  if (gate) return <GatePage key={gate[1]} eventId={gate[1]!} />;
  if (loc.path === '/termos-de-uso') return <LegalPage kind="termos-de-uso" />;
  if (loc.path === '/privacidade') return <LegalPage kind="privacidade" />;
  if (loc.path === '/politica-de-cancelamento') return <LegalPage kind="cancelamento" />;
  if (loc.path === '/meia-entrada') return <LegalPage kind="meia-entrada" />;
  const checkout = /^\/checkout\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(loc.path);
  if (checkout) return <CheckoutPage key={checkout[1]} slug={checkout[1]!} />;
  const order = /^\/pedido\/([0-9a-f-]{36})$/.exec(loc.path);
  if (order) return <OrderPage key={order[1]} id={order[1]!} />;
  if (loc.path === '/meus-ingressos') return <MyTicketsPage />;
  if (loc.path === '/minhas-compras') return <MyOrdersPage />;
  if (loc.path === '/minha-conta') return <MyAccountPage />;
  const full = /^\/ingressos\/([0-9a-f-]{36})\/tela-cheia$/.exec(loc.path);
  if (full) return <TicketFullscreenPage key={full[1]} id={full[1]!} />;
  const ticket = /^\/ingressos\/([0-9a-f-]{36})$/.exec(loc.path);
  if (ticket) return <TicketPage key={ticket[1]} id={ticket[1]!} />;
  const m = /^\/eventos\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(loc.path);
  if (m) return <EventPage key={m[1]} slug={m[1]!} />;
  return <NotFoundPage />;
}

/** Vitrine pública do PartyX (Prompt 08). O protótipo navegável fica em `/prototipo`. */
export function SiteApp() {
  return (
    <Router>
      <SessionProvider>
        <Routes />
      </SessionProvider>
      {/* Depois das rotas: a página já está montada por baixo quando a abertura aparece. */}
      <IntroSplash />
    </Router>
  );
}
