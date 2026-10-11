/** Painel administrativo (ADM01 a ADM24): carregado sob demanda, com o próprio CSS. */
import { NotFoundPage } from '../pages';
import '../styles/admin.css';
import { AdminExceptionsPage, AdminOrderPage, AdminOrdersPage, AdminOverviewPage } from '../adminPages';
import { AdminEventFormPage, AdminEventPage, AdminEventPreviewPage, AdminEventsPage } from '../adminEvents';
import {
  AdminAccountPage,
  AdminBuyerPage,
  AdminBuyersPage,
  AdminEntriesPage,
  AdminPromoterPage,
  AdminPromotersPage,
  AdminTeamPage,
  AdminTicketPage,
  AdminTicketsPage,
} from '../adminPeople';
import { FeeReportPage, PromoterReportPage, SalesReportPage } from '../reportPages';

const ID = '([0-9a-f-]{36})';

export default function AdminArea({ path }: { path: string }) {
  if (path === '/admin') return <AdminOverviewPage />;
  if (path === '/admin/pedidos') return <AdminOrdersPage />;
  if (path === '/admin/eventos') return <AdminEventsPage />;
  if (path === '/admin/eventos/novo') return <AdminEventFormPage />;
  if (path === '/admin/excecoes') return <AdminExceptionsPage />;
  if (path === '/admin/promoters') return <AdminPromotersPage />;
  if (path === '/admin/compradores') return <AdminBuyersPage />;
  if (path === '/admin/ingressos') return <AdminTicketsPage />;
  if (path === '/admin/entradas') return <AdminEntriesPage />;
  if (path === '/admin/equipe') return <AdminTeamPage />;
  if (path === '/admin/conta') return <AdminAccountPage />;
  if (path === '/admin/relatorios/vendas') return <SalesReportPage />;
  if (path === '/admin/relatorios/promoters') return <PromoterReportPage />;
  if (path === '/admin/relatorios/taxa-mensal') return <FeeReportPage />;
  const match = (re: string) => new RegExp(`^${re}$`).exec(path)?.[1];
  let id: string | undefined;
  if ((id = match(`/admin/promoters/${ID}`))) return <AdminPromoterPage key={id} id={id} />;
  if ((id = match(`/admin/compradores/${ID}`))) return <AdminBuyerPage key={id} id={id} />;
  if ((id = match(`/admin/ingressos/${ID}`))) return <AdminTicketPage key={id} id={id} />;
  if ((id = match(`/admin/pedidos/${ID}`))) return <AdminOrderPage key={id} id={id} />;
  if ((id = match(`/admin/eventos/${ID}`))) return <AdminEventPage key={id} id={id} />;
  if ((id = match(`/admin/eventos/${ID}/editar`))) return <AdminEventFormPage key={id} id={id} />;
  if ((id = match(`/admin/eventos/${ID}/previa`))) return <AdminEventPreviewPage key={id} id={id} />;
  return <NotFoundPage />;
}
