/** Área de compra (C02 a C10): carregada sob demanda, com o próprio CSS. */
import { NotFoundPage } from '../pages';
import '../styles/checkout.css';
import { CheckoutPage, OrderPage } from '../checkoutPages';

export default function CheckoutArea({ path }: { path: string }) {
  const checkout = /^\/checkout\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  if (checkout) return <CheckoutPage key={checkout[1]} slug={checkout[1]!} />;
  const order = /^\/pedido\/([0-9a-f-]{36})$/.exec(path);
  if (order) return <OrderPage key={order[1]} id={order[1]!} />;
  return <NotFoundPage />;
}
