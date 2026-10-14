import { describe, expect, it } from 'vitest';
import { maskIp } from './ip';

describe('maskIp', () => {
  it('IPv4 mantém só os dois primeiros octetos', () => {
    expect(maskIp('177.86.10.20')).toBe('177.86.x.x');
    expect(maskIp(' 203.0.113.7 ')).toBe('203.0.x.x');
    expect(maskIp('::ffff:177.86.10.20')).toBe('177.86.x.x');
  });

  it('IPv6 mantém só os dois primeiros grupos', () => {
    expect(maskIp('2804:14c:5b8:8e00::1')).toBe('2804:14c::x');
    expect(maskIp('2001:db8::')).toBe('2001:db8::x');
    expect(maskIp('::1')).toBe('0::x');
  });

  it('sem IP ou com valor que não é IP, nunca devolve o texto recebido', () => {
    expect(maskIp(null)).toBeNull();
    expect(maskIp(undefined)).toBeNull();
    expect(maskIp('')).toBeNull();
    expect(maskIp('nao-e-ip')).toBe('invalido');
    expect(maskIp('177.86.10.20.5')).toBe('invalido');
  });
});
