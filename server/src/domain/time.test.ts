import { describe, expect, it } from 'vitest';
import { formatEventDateTime, monthKeyInEventZone } from './time';

describe('tempo', () => {
  it('exibe o instante UTC no fuso do evento', () => {
    // 18/10/2026 02:00 UTC é 17/10/2026 23:00 em São Paulo (UTC-3)
    expect(formatEventDateTime(new Date('2026-10-18T02:00:00Z'))).toBe('17/10/2026 23:00');
  });

  it('decide o mês pelo fuso do evento, não pelo UTC', () => {
    // 01/11 01:30 UTC ainda é 31/10 22:30 em São Paulo: pertence a outubro
    expect(monthKeyInEventZone(new Date('2026-11-01T01:30:00Z'))).toBe('2026-10');
    expect(monthKeyInEventZone(new Date('2026-11-01T03:00:00Z'))).toBe('2026-11');
  });
});
