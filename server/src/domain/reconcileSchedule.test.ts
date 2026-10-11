import { describe, expect, it } from 'vitest';
import { checkPlan, deadlineAttempt, delayUntil, finalAttempt, nextCheck, type CheckOffsets } from './reconcileSchedule';

const DEFAULT: CheckOffsets = { early: [60, 120, 240, 480], late: [900, 1800, 3600, 10800, 28800, 86400] };
const charged = new Date('2026-10-10T15:00:00Z');
const at = (seconds: number) => new Date(charged.getTime() + seconds * 1000);

/** Todas as verificações de uma cobrança, rodando cada uma na hora marcada (como o Cloud Tasks faria). */
function chain(deadlineSeconds: number, o = DEFAULT) {
  const out: [number, number][] = [];
  let attempt = 0;
  let now = charged;
  for (;;) {
    const next = nextCheck({ attempt, chargedAt: charged, deadline: at(deadlineSeconds), now }, o);
    if (!next) return out;
    out.push([next.attempt, (next.at.getTime() - charged.getTime()) / 1000]);
    attempt = next.attempt;
    now = next.at;
  }
}

describe('cadência da conciliação sob demanda', () => {
  it('padrão: 1, 2, 4 e 8 min, o limite (reserva de 10 min + 2), e as tardias de 15 min a 24 h', () => {
    expect(chain(12 * 60)).toEqual([
      [1, 60],
      [2, 120],
      [3, 240],
      [4, 480],
      [5, 720],
      [6, 900],
      [7, 1800],
      [8, 3600],
      [9, 10800],
      [10, 28800],
      [11, 86400],
    ]);
    expect(deadlineAttempt(DEFAULT)).toBe(5);
    expect(finalAttempt(DEFAULT)).toBe(11);
  });

  it('nenhuma inicial passa do limite e nenhuma tardia cai antes dele', () => {
    // Cobrança com só 3 min de reserva restante e margem de 2: limite aos 5 min.
    expect(chain(5 * 60).slice(0, 5)).toEqual([
      [1, 60],
      [2, 120],
      [3, 240],
      [5, 300],
      [6, 900],
    ]);
    // Reserva longa (limite aos 40 min): as tardias de 15 e 30 min são absorvidas pelas iniciais e pelo limite.
    expect(chain(40 * 60)).toEqual([
      [1, 60],
      [2, 120],
      [3, 240],
      [4, 480],
      [5, 2400],
      [8, 3600],
      [9, 10800],
      [10, 28800],
      [11, 86400],
    ]);
  });

  it('tarefa atrasada: pula as que já passaram (a execução atual acabou de conferir) e segue para a próxima futura', () => {
    // A tentativa 2 só rodou aos 20 min: a próxima é a de 30 min, não as de 4, 8, 12 e 15 que ficaram para trás.
    expect(nextCheck({ attempt: 2, chargedAt: charged, deadline: at(720), now: at(1200) }, DEFAULT)).toEqual({
      attempt: 7,
      at: at(1800),
    });
  });

  it('depois da última tardia não há mais nada', () => {
    expect(nextCheck({ attempt: 11, chargedAt: charged, deadline: at(720), now: at(86400) }, DEFAULT)).toBeNull();
    expect(nextCheck({ attempt: 10, chargedAt: charged, deadline: at(720), now: at(90000) }, DEFAULT)).toBeNull();
  });

  it('listas configuradas pelo ambiente são respeitadas', () => {
    expect(checkPlan(charged, at(600), { early: [30, 90], late: [3600] }).map(p => p.attempt)).toEqual([1, 2, 3, 4]);
    expect(chain(600, { early: [30, 90], late: [3600] })).toEqual([
      [1, 30],
      [2, 90],
      [3, 600],
      [4, 3600],
    ]);
  });

  it('a espera nunca é negativa', () => {
    expect(delayUntil(at(60), at(90))).toBe(0);
    expect(delayUntil(at(60), at(0.5))).toBe(60);
  });
});
