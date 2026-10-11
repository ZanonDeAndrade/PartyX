import { describe, expect, it } from 'vitest';
import { brl, dateShort, eventPath, searchPath, shareLinks, timeOf } from './format';

describe('formatação da vitrine', () => {
  it('valor em reais a partir de centavos', () => {
    expect(brl(8000).replace(/\s/g, ' ')).toBe('R$ 8.000,00'.replace('8.000', '80'));
    expect(brl(15050).replace(/\s/g, ' ')).toBe('R$ 150,50');
  });
  it('hora e data no fuso de Brasília, não no do navegador', () => {
    expect(timeOf('2026-12-13T01:00:00.000Z')).toBe('22:00');
    expect(dateShort('2026-12-13T01:00:00.000Z')).toMatch(/12/); // ainda dia 12 em Brasília
  });
  it('monta a busca só com o que foi preenchido e codifica o texto', () => {
    expect(searchPath('', '')).toBe('/eventos');
    expect(searchPath(' festa neon ', '2026-12-12')).toBe('/eventos?q=festa+neon&date=2026-12-12');
    expect(searchPath('a&b=c', '')).toBe('/eventos?q=a%26b%3Dc');
    expect(eventPath('noite-neon')).toBe('/eventos/noite-neon');
  });
  it('links de compartilhamento codificam o endereço e o título', () => {
    const l = shareLinks('https://x.test/eventos/a?b=1&c=2', 'Festa & Cia');
    expect(l.whatsapp).toBe(
      'https://wa.me/?text=Festa%20%26%20Cia%20https%3A%2F%2Fx.test%2Feventos%2Fa%3Fb%3D1%26c%3D2',
    );
    expect(l.facebook).toContain('u=https%3A%2F%2Fx.test%2Feventos%2Fa%3Fb%3D1%26c%3D2');
  });
});
