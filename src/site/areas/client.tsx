/** Área do cliente (U01 a U07): ingressos, compras e conta. Carregada sob demanda, com o próprio CSS. */
import { NotFoundPage } from '../pages';
import '../styles/client.css';
import { MyAccountPage } from '../accountPages';
import { MyOrdersPage, MyTicketsPage, TicketFullscreenPage, TicketPage } from '../ticketPages';

export default function ClientArea({ path }: { path: string }) {
  if (path === '/meus-ingressos') return <MyTicketsPage />;
  if (path === '/minhas-compras') return <MyOrdersPage />;
  if (path === '/minha-conta') return <MyAccountPage />;
  const full = /^\/ingressos\/([0-9a-f-]{36})\/tela-cheia$/.exec(path);
  if (full) return <TicketFullscreenPage key={full[1]} id={full[1]!} />;
  const ticket = /^\/ingressos\/([0-9a-f-]{36})$/.exec(path);
  if (ticket) return <TicketPage key={ticket[1]} id={ticket[1]!} />;
  return <NotFoundPage />;
}
