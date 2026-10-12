import { describe, expect, it } from 'vitest';
import { eventZoneFormatter, formatEventDateTime, formatInEventZone, monthKeyInEventZone } from './time';

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

  it('reaproveita o formatador de cada combinação de opções (memória nativa do ICU)', () => {
    const a = eventZoneFormatter('pt-BR', { day: '2-digit', month: '2-digit' });
    expect(eventZoneFormatter('pt-BR', { day: '2-digit', month: '2-digit' })).toBe(a);
    expect(eventZoneFormatter('en-CA', { day: '2-digit', month: '2-digit' })).not.toBe(a);
    expect(formatInEventZone(new Date('2026-10-18T02:00:00Z'), { day: '2-digit', month: '2-digit' })).toBe('17/10');
  });
});
