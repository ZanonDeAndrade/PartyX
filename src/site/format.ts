/** Formatação de datas e valores da vitrine. Datas chegam em UTC; a exibição é sempre no fuso do evento. */
const ZONE = 'America/Sao_Paulo';

const part = (d: Date, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: ZONE, ...o }).format(d);

export const brl = (cents: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

/** sáb., 12 de dezembro de 2026 */
export const dateLong = (iso: string): string =>
  part(new Date(iso), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** sáb, 12 dez (sem o "de" que o Intl põe entre dia e mês) */
export const dateShort = (iso: string): string =>
  part(new Date(iso), { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '').replace(/ de /g, ' ');

export const timeOf = (iso: string): string =>
  part(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Início de uma query string da busca, sempre com os valores codificados. */
export function searchPath(q: string, date: string): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (date) params.set('date', date);
  const s = params.toString();
  return s ? `/eventos?${s}` : '/eventos';
}

export const eventPath = (slug: string): string => `/eventos/${slug}`;

/** Links de compartilhamento. O endereço do evento vai sempre codificado. */
export function shareLinks(url: string, title: string) {
  const u = encodeURIComponent(url);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://twitter.com/intent/tweet?url=${u}&text=${encodeURIComponent(title)}`,
  };
}

/** j***@gmail.com: confirma o destino sem expor o endereço inteiro na tela. */
export function maskEmail(email: string) {
  const [user = '', domain = ''] = email.trim().split('@');
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(user.length - 1, 6)))}@${domain}`;
}
