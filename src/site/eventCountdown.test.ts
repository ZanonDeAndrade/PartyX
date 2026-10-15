import { describe, expect, it } from 'vitest';
import {
  clockOffsetMs,
  countdownView,
  nextChangeIn,
  pad2,
  remainingSentence,
  stateAnnouncement,
} from './eventCountdown';

const START = '2026-10-18T17:35:00.000Z'; // 14:35 em São Paulo
const UNTIL = '2026-10-18T23:35:00.000Z';
const at = (iso: string) => Date.parse(iso);
const S = 1000;

describe('cronômetro da página do evento (15/10/2026)', () => {
  it('antes do início: dias, horas, minutos e segundos que faltam', () => {
    const now = at(START) - ((3 * 24 + 14) * 3600 + 27 * 60 + 40) * S;
    expect(countdownView(now, START, UNTIL)).toEqual({
      kind: 'antes',
      msLeft: ((3 * 24 + 14) * 3600 + 27 * 60 + 40) * S,
      parts: { days: 3, hours: 14, minutes: 27, seconds: 40 },
    });
  });

  it('vira no zero: o último mostrado é 1 segundo, e no instante do início já é "acontecendo agora"', () => {
    expect(countdownView(at(START) - 1500, START, UNTIL)).toMatchObject({ kind: 'antes', parts: { seconds: 2 } });
    expect(countdownView(at(START) - 1, START, UNTIL)).toMatchObject({
      kind: 'antes',
      parts: { days: 0, hours: 0, minutes: 0, seconds: 1 },
    });
    expect(countdownView(at(START), START, UNTIL)).toEqual({ kind: 'agora', msLeft: at(UNTIL) - at(START) });
  });

  it('durante: "acontecendo agora" até o fim; depois do fim, some', () => {
    expect(countdownView(at(START) + 3600 * S, START, UNTIL)).toMatchObject({ kind: 'agora' });
    expect(countdownView(at(UNTIL) - 1, START, UNTIL)).toMatchObject({ kind: 'agora', msLeft: 1 });
    expect(countdownView(at(UNTIL), START, UNTIL)).toEqual({ kind: 'oculto' });
    expect(countdownView(at(UNTIL) + 86_400 * S, START, UNTIL)).toEqual({ kind: 'oculto' });
  });

  it('a próxima mudança é a virada do segundo seguinte, e em "agora" a hora de sumir (até 1 minuto por vez)', () => {
    expect(nextChangeIn(countdownView(at(START) - 5300, START, UNTIL))).toBe(315); // de 6 para 5 em 300 ms
    expect(nextChangeIn(countdownView(at(START) - 5000, START, UNTIL))).toBe(1015);
    expect(nextChangeIn(countdownView(at(START) - 1, START, UNTIL))).toBe(16); // e aí vira "agora"
    expect(nextChangeIn(countdownView(at(UNTIL) - 2000, START, UNTIL))).toBe(2015);
    expect(nextChangeIn(countdownView(at(START), START, UNTIL))).toBe(60_000);
    expect(nextChangeIn({ kind: 'oculto' })).toBe(Number.POSITIVE_INFINITY);
  });

  it('relógio do aparelho adiantado ou atrasado: com a diferença medida na resposta, a contagem é a do servidor', () => {
    const serverNow = '2026-10-15T03:00:00.000Z';
    const right = countdownView(at(serverNow) + 250, START, UNTIL); // 250 ms depois da resposta
    for (const skew of [7 * 3600 * S, -7 * 3600 * S, 3 * 86_400 * S, -45 * 60 * S]) {
      // O aparelho manda o pedido 100 ms antes de o servidor responder e recebe 100 ms depois.
      const sent = at(serverNow) + skew - 100;
      const received = at(serverNow) + skew + 100;
      const offset = clockOffsetMs(serverNow, sent, received);
      expect(offset).toBe(-skew);
      expect(countdownView(received + 150 + offset, START, UNTIL)).toEqual(right);
    }
    // Sem a hora do servidor (resposta antiga): conta pelo aparelho.
    expect(clockOffsetMs(undefined, 1000, 2000)).toBe(0);
    expect(clockOffsetMs('não é data', 1000, 2000)).toBe(0);
  });

  it('dois dígitos no mínimo, e dias acima de 99 inteiros', () => {
    expect(pad2(0)).toBe('00');
    expect(pad2(7)).toBe('07');
    expect(pad2(59)).toBe('59');
    expect(pad2(120)).toBe('120');
    expect(countdownView(at(START) - 120 * 86_400 * S, START, UNTIL)).toMatchObject({ parts: { days: 120 } });
  });

  it('texto para leitor de tela só até os minutos, no singular e no plural', () => {
    expect(remainingSentence({ days: 3, hours: 14, minutes: 27, seconds: 40 })).toBe('Faltam 3 dias, 14 horas e 27 minutos');
    expect(remainingSentence({ days: 1, hours: 0, minutes: 0, seconds: 5 })).toBe('Falta 1 dia');
    expect(remainingSentence({ days: 0, hours: 1, minutes: 1, seconds: 0 })).toBe('Faltam 1 hora e 1 minuto');
    expect(remainingSentence({ days: 0, hours: 0, minutes: 2, seconds: 9 })).toBe('Faltam 2 minutos');
    expect(remainingSentence({ days: 0, hours: 0, minutes: 0, seconds: 30 })).toBe('Falta menos de um minuto');
  });

  it('o aviso falado só existe na troca de estado', () => {
    expect(stateAnnouncement('antes', 'antes')).toBe('');
    expect(stateAnnouncement('antes', 'agora')).toBe('O evento começou: acontecendo agora.');
    expect(stateAnnouncement('agora', 'oculto')).toBe('O evento terminou.');
    expect(stateAnnouncement('agora', 'agora')).toBe('');
  });
});
