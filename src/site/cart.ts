import type { CartItem } from './api';

/**
 * Carrinho do visitante, guardado só na aba (sessionStorage): sobrevive ao login e ao cadastro, que é o que
 * RF-29 pede ("volta ao carrinho"), e some ao fechar a aba. Não guarda preço: o servidor recalcula tudo.
 */
const KEY = 'px.cart';

export interface Cart {
  slug: string;
  items: CartItem[];
}

export function loadCart(): Cart | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cart;
    if (typeof parsed.slug !== 'string' || !Array.isArray(parsed.items)) return null;
    const items = parsed.items.filter(
      i => typeof i.ticketTypeId === 'string' && Number.isInteger(i.quantity) && i.quantity > 0,
    );
    return items.length ? { slug: parsed.slug, items } : null;
  } catch {
    return null;
  }
}

export function saveCart(cart: Cart | null) {
  try {
    if (!cart || cart.items.length === 0) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(cart));
  } catch {
    // Navegação privada ou armazenamento bloqueado: o carrinho vale só nesta tela.
  }
}
