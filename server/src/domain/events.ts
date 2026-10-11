/** Regras puras de eventos, tipos de ingresso e promoters. Sem I/O. */

export const AGE_RATINGS = ['Livre', '10 anos', '12 anos', '14 anos', '16 anos', '18 anos'] as const;
export type AgeRating = (typeof AGE_RATINGS)[number];

/** Endereço amigável a partir do nome: sem acento, minúsculo, com hífens. Cabe na restrição `events_slug_format`. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'evento';
}

/** Código do promoter: 3 a 20 letras maiúsculas sem acento ou números. Minúsculas viram maiúsculas; acento é recusado. */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}
export const isCouponCodeValid = (code: string): boolean => /^[A-Z0-9]{3,20}$/.test(code);

export type SalesState = 'a_venda' | 'em_breve' | 'encerrada' | 'indisponivel' | 'esgotado' | 'reservado';

export interface SalesInput {
  isActive: boolean;
  salesStartAt: Date;
  salesEndAt: Date;
  quantityTotal: number;
  quantitySold: number;
  /** Reservas ativas e ainda dentro do prazo. */
  quantityReserved: number;
}

/** Quantas unidades ainda podem ser reservadas: capacidade menos vendidas menos reservas válidas. Nunca negativo. */
export const availableQuantity = (t: Pick<SalesInput, 'quantityTotal' | 'quantitySold' | 'quantityReserved'>): number =>
  Math.max(0, t.quantityTotal - t.quantitySold - t.quantityReserved);

/**
 * Estado de venda de um tipo, para a vitrine (CA-08, CA-09) e para o painel.
 * Ordem: desativado → fora do período (em breve / encerrada) → esgotado → reservado → à venda.
 * `esgotado` conta só as vendidas. `reservado` é "tudo vendido ou reservado por quem está pagando": as unidades
 * podem voltar se a reserva expirar, então a vitrine não diz "esgotado". A conferência definitiva é a do checkout.
 */
export function salesState(t: SalesInput, now: Date): SalesState {
  if (!t.isActive) return 'indisponivel';
  if (now < t.salesStartAt) return 'em_breve';
  if (now >= t.salesEndAt) return 'encerrada';
  if (t.quantitySold >= t.quantityTotal) return 'esgotado';
  if (availableQuantity(t) <= 0) return 'reservado';
  return 'a_venda';
}
