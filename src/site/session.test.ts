import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './session';

describe('caminho de retorno depois do login', () => {
  it('aceita só caminho relativo do próprio site', () => {
    expect(safeReturnPath('/checkout/noite-neon')).toBe('/checkout/noite-neon');
    expect(safeReturnPath('/eventos?q=a')).toBe('/eventos?q=a');
    expect(safeReturnPath('/eventos/festa-fechada')).toBe('/eventos/festa-fechada');
    expect(safeReturnPath('/admin/pedidos?q=1#topo')).toBe('/admin/pedidos?q=1#topo');
    expect(safeReturnPath('/eventos?hora=22:00')).toBe('/eventos?hora=22:00'); // dois-pontos só na busca
    expect(safeReturnPath('/%2F%2Fmal.example')).toBe('/%2F%2Fmal.example'); // codificado, continua um caminho do site
  });
  it('recusa endereço externo, protocolo relativo, barra invertida, esquema, espaço e controle: volta para a vitrine', () => {
    for (const bad of [
      'https://mal.example',
      '//mal.example',
      '///mal.example',
      '/\\mal.example',
      '/a//mal.example',
      '/\t/mal.example',
      '/\n/mal.example',
      '/ /mal.example',
      'javascript:alert(1)',
      '/javascript:alert(1)',
      'eventos',
      '',
      null,
      undefined,
      `/${'a'.repeat(2001)}`,
    ]) {
      expect(safeReturnPath(bad as string | null), String(bad)).toBe('/');
    }
    expect(safeReturnPath('//x', '/eventos')).toBe('/eventos');
  });
});
