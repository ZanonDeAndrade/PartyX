import { describe, expect, it } from 'vitest';
import { checkAccentColor, suggestAccent } from './accent';

/** Pixels RGB repetidos: `[cor, quantidade]`. */
const pixels = (...parts: [[number, number, number], number][]) =>
  Uint8Array.from(parts.flatMap(([rgb, n]) => Array.from({ length: n }, () => rgb).flat()));

describe('cor de destaque (0014)', () => {
  it('aceita só #RRGGBB, grava em maiúsculas; vazio ou nulo é o padrão', () => {
    expect(checkAccentColor('#15803d')).toEqual({ value: '#15803D' });
    expect(checkAccentColor('  #FACC15 ')).toEqual({ value: '#FACC15' });
    expect(checkAccentColor(null)).toEqual({ value: null });
    expect(checkAccentColor(undefined)).toEqual({ value: null });
    expect(checkAccentColor('   ')).toEqual({ value: null });
    for (const bad of ['red', '#fff', '#12345G', '15803D', '#15803D;color:red', '#15803D00', 'var(--x)']) {
      expect(checkAccentColor(bad), bad).toHaveProperty('problem');
    }
  });

  it('sugestão: a cor viva mais presente, ignorando preto, branco e cinza', () => {
    const green: [number, number, number] = [22, 163, 74];
    const out = suggestAccent(pixels([[0, 0, 0], 500], [[255, 255, 255], 500], [[128, 128, 128], 500], [green, 200]), 3);
    expect(out).toBe('#16A34A');
  });

  it('entre duas cores vivas, pesa a quantidade e a saturação', () => {
    const red: [number, number, number] = [220, 38, 38];
    const paleBlue: [number, number, number] = [150, 170, 230]; // pouco saturado
    expect(suggestAccent(pixels([red, 100], [paleBlue, 120]), 3)).toBe('#DC2626');
    expect(suggestAccent(pixels([red, 100], [[37, 99, 235], 300]), 3)).toBe('#2563EB');
  });

  it('aceita pixels com canal alfa e devolve nulo sem cor viva', () => {
    expect(suggestAccent(Uint8Array.from([250, 204, 21, 255, 250, 204, 21, 255]), 4)).toBe('#FACC15');
    expect(suggestAccent(pixels([[20, 20, 20], 50], [[240, 240, 240], 50]), 3)).toBeNull();
    expect(suggestAccent(new Uint8Array(0), 3)).toBeNull();
  });
});
