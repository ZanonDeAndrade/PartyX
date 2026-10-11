import { describe, expect, it } from 'vitest';
import { createMemoryLimiter } from './limits';
import { clientIp } from './middleware';

describe('clientIp', () => {
  it('usa o IP que o proxy confiável acrescentou, não o que o cliente forjou', () => {
    expect(clientIp('1.1.1.1, 203.0.113.9', 1)).toBe('203.0.113.9');
    expect(clientIp('203.0.113.9', 1)).toBe('203.0.113.9');
    expect(clientIp('6.6.6.6, 1.1.1.1, 203.0.113.9, 10.0.0.1', 2)).toBe('203.0.113.9');
  });

  it('sem proxy confiável ou sem cabeçalho, não confia em nada', () => {
    expect(clientIp('1.1.1.1', 0)).toBeNull();
    expect(clientIp(undefined, 1)).toBeNull();
  });
});

describe('limitador em memória', () => {
  it('bloqueia depois do máximo e libera quando a janela passa', () => {
    let t = 0;
    const limiter = createMemoryLimiter({ max: 2, windowMs: 1000, now: () => t });
    expect(limiter.hit('a')).toBe(false);
    expect(limiter.hit('a')).toBe(false);
    expect(limiter.hit('a')).toBe(true);
    expect(limiter.hit('b')).toBe(false); // outra chave não é afetada
    t = 1500;
    expect(limiter.hit('a')).toBe(false);
  });
});
