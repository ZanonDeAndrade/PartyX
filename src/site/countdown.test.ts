import { describe, expect, it } from 'vitest';
import { mmss } from './countdown';

describe('contador', () => {
  it('formata minutos e segundos', () => {
    expect(mmss(600)).toBe('10:00');
    expect(mmss(61)).toBe('01:01');
    expect(mmss(0)).toBe('00:00');
    expect(mmss(5)).toBe('00:05');
  });
});
