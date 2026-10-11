import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './session';

describe('caminho de retorno depois do login', () => {
  it('aceita só caminho interno', () => {
    expect(safeReturnPath('/checkout/noite-neon')).toBe('/checkout/noite-neon');
    expect(safeReturnPath('/eventos?q=a')).toBe('/eventos?q=a');
  });
  it('recusa endereço externo, protocolo relativo, barra invertida e vazio', () => {
    for (const bad of [
      'https://mal.example',
      '//mal.example',
      '/\\mal.example',
      'javascript:alert(1)',
      '',
      null,
      undefined,
    ]) {
      expect(safeReturnPath(bad as string | null), String(bad)).toBe('/');
    }
    expect(safeReturnPath('//x', '/eventos')).toBe('/eventos');
  });
});
