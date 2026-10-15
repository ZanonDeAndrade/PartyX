import { describe, expect, it } from 'vitest';
import { accentPalette, accentVars, contrast, luminance, normalizeHex, parseHex, stubVars, TEXT_MIN } from './accent';

const INK = '#0B0B10';
const WHITE = '#FFFFFF';

describe('cor de destaque: paleta com contraste conferido', () => {
  it('campo do painel: aceita sem # e em minúsculas, devolve #RRGGBB', () => {
    expect(normalizeHex(' 15803d ')).toBe('#15803D');
    expect(normalizeHex('#facc15')).toBe('#FACC15');
    for (const bad of ['', '#', 'red', '#fff', '#12345G', '##15803D', '#15803D;']) expect(normalizeHex(bad)).toBeNull();
  });

  it('recusa o que não for #RRGGBB', () => {
    for (const bad of ['red', '#fff', '#12345G', '#7C3AED;color:red', '', 'url(x)']) expect(accentPalette(bad)).toBeNull();
  });

  it('roxo da PartyX: texto branco a 5,7:1, links e linhas mais claros no preto', () => {
    const p = accentPalette('#7c3aed')!;
    expect(p.base).toBe('#7C3AED');
    expect(p.fill).toBe('#7C3AED');
    expect(p.onFill).toBe(WHITE);
    expect(p.fillContrast).toBeGreaterThan(5.6);
    expect(p.onLight).toBe('#7C3AED');
    expect(contrast(p.onDark, INK)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('cor clara (amarelo): texto escuro e borda no quadro branco', () => {
    const p = accentPalette('#FACC15')!;
    expect(p.onFill).toBe(INK);
    expect(p.fill).toBe('#FACC15');
    expect(p.edge).not.toBeNull();
    expect(contrast(p.edge!, WHITE)).toBeGreaterThanOrEqual(3);
    expect(p.notes.some(n => n.includes('borda'))).toBe(true);
  });

  it('cor escura (azul-marinho e vermelho): texto branco', () => {
    expect(accentPalette('#1E3A8A')!.onFill).toBe(WHITE);
    expect(accentPalette('#DC2626')!.onFill).toBe(WHITE);
    expect(accentPalette('#15803D')!.onFill).toBe(WHITE);
  });

  it('na faixa em que nem branco nem preto chegam a 4,5:1, ajusta o fundo para o tom mais próximo e avisa', () => {
    expect(Math.max(contrast(WHITE, '#787878'), contrast(INK, '#787878'))).toBeLessThan(TEXT_MIN);
    const p = accentPalette('#787878')!;
    expect(p.fill).not.toBe('#787878');
    expect(p.fillContrast).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(contrast(p.onFill, p.fill)).toBeGreaterThanOrEqual(TEXT_MIN);
    // Perto da escolhida: no máximo alguns pontos de luminância de diferença.
    expect(Math.abs(luminance(parseHex(p.fill)!) - luminance(parseHex('#787878')!))).toBeLessThan(0.03);
    expect(p.notes[0]).toContain('4,5:1');
  });

  it('todos os tons derivados respeitam o contraste, para qualquer cor', () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % 256;
    };
    const samples = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#787878', '#7C3AED'];
    for (let i = 0; i < 300; i++) {
      samples.push(`#${[rand(), rand(), rand()].map(n => n.toString(16).padStart(2, '0')).join('')}`);
    }
    for (const hex of samples) {
      const p = accentPalette(hex)!;
      expect(contrast(p.onFill, p.fill), hex).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(contrast(p.onFill, p.hover), `${hex} hover`).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(contrast(p.onFill, p.press), `${hex} press`).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(contrast(p.onDark, INK), `${hex} links no preto`).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(contrast(p.line, INK), `${hex} linhas`).toBeGreaterThanOrEqual(3);
      expect(contrast(p.onLight, WHITE), `${hex} texto no branco`).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(contrast(p.softInk, p.soft), `${hex} fundo suave`).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(contrast(p.focus, INK), `${hex} foco no preto`).toBeGreaterThanOrEqual(3);
      expect(contrast(p.focus, WHITE), `${hex} foco no branco`).toBeGreaterThanOrEqual(3);
      expect(p.hover, `${hex} hover diferente`).not.toBe(p.fill);
    }
  });

  it('variáveis só com valores calculados (hexadecimal ou rgb), nunca o texto recebido', () => {
    const vars = accentVars(accentPalette('#15803d')!);
    expect(vars['--px-violet']).toBe('#15803D');
    for (const value of Object.values(vars)) expect(value).toMatch(/^(#[0-9A-F]{6}|rgb\(\d+ \d+ \d+ \/ 0\.\d+\))$/);
    expect(stubVars(accentPalette('#FACC15')!)).toEqual({ '--px-violet': '#FACC15', '--px-on-accent': INK });
  });
});
