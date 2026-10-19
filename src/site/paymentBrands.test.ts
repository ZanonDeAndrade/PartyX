import { describe, expect, it } from 'vitest';
import { acceptedText, CARD_BRANDS, PAYMENT_LOGOS_CHECKED_AT, PIX_LOGO, PIX_TEXT } from './paymentBrands';

describe('logos das formas de pagamento (configuração do site)', () => {
  it('bandeiras escolhidas pelo responsável, na ordem, com a data da consulta ao Mercado Pago', () => {
    expect(CARD_BRANDS.map(b => b.name)).toEqual(['Visa', 'Mastercard', 'Elo', 'American Express']);
    expect(PAYMENT_LOGOS_CHECKED_AT).toBe('2026-10-19T14:09:00Z');
    for (const b of [...CARD_BRANDS, PIX_LOGO]) {
      expect(b.src).toBeTruthy();
      expect(b.width).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
    }
  });

  it('texto alternativo do bloco montado da lista', () => {
    expect(acceptedText(true, true)).toBe('Aceitamos Visa, Mastercard, Elo, American Express e Pix');
    expect(acceptedText(true, false)).toBe('Aceitamos Visa, Mastercard, Elo e American Express');
    expect(acceptedText(false, true)).toBe('Aceitamos Pix');
    expect(acceptedText(false, false)).toBe('');
  });

  it('texto ao lado do símbolo Pix sem a palavra Pix (Manual de Uso da Marca Pix 1.6); o nome fica no alt', () => {
    expect(PIX_TEXT).not.toMatch(/pix/i);
    expect(PIX_LOGO.name).toBe('Pix');
  });
});
