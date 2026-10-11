import { describe, expect, it } from 'vitest';
import { delayUntil, finalAttempt, nextCheck } from './reconcileSchedule';

const OFFSETS = [60, 120, 240, 480];
const charged = new Date('2026-10-10T15:00:00Z');
const at = (seconds: number) => new Date(charged.getTime() + seconds * 1000);

/** Todas as verificações de uma cobrança, rodando cada uma na hora marcada. */
function plan(deadlineSeconds: number, offsets = OFFSETS) {
  const out: [number, number][] = [];
  let attempt = 0;
  let now = charged;
  for (;;) {
    const next = nextCheck({ attempt, chargedAt: charged, deadline: at(deadlineSeconds), now }, offsets);
    if (!next) return out;
    out.push([next.attempt, (next.at.getTime() - charged.getTime()) / 1000]);
    attempt = next.attempt;
    now = next.at;
  }
}

describe('cadência da conciliação sob demanda', () => {
  it('padrão: 1, 2, 4 e 8 minutos depois da cobrança e a última no fim da reserva mais a margem', () => {
    // Reserva de 10 min criada junto com a cobrança, margem de 2 min.
    expect(plan(12 * 60)).toEqual([
      [1, 60],
      [2, 120],
      [3, 240],
      [4, 480],
      [5, 720],
    ]);
    expect(finalAttempt(OFFSETS)).toBe(5);
  });

  it('nenhuma verificação passa do limite: as que cairiam depois dele viram uma só, no limite', () => {
    // Cobrança criada com só 3 min de reserva restante e margem de 2 min: limite em 5 min.
    expect(plan(5 * 60)).toEqual([
      [1, 60],
      [2, 120],
      [3, 240],
      [5, 300],
    ]);
    // Limite antes da primeira espera: só a verificação do limite.
    expect(plan(45)).toEqual([[5, 45]]);
  });

  it('limite já passado: não agenda mais nada', () => {
    expect(nextCheck({ attempt: 2, chargedAt: charged, deadline: at(100), now: at(130) }, OFFSETS)).toBeNull();
    expect(nextCheck({ attempt: 5, chargedAt: charged, deadline: at(9999), now: at(10) }, OFFSETS)).toBeNull();
  });

  it('lista configurada pelo ambiente é respeitada', () => {
    expect(plan(600, [30, 90])).toEqual([
      [1, 30],
      [2, 90],
      [3, 600],
    ]);
  });

  it('tarefa atrasada: a espera nunca é negativa', () => {
    expect(delayUntil(at(60), at(90))).toBe(0);
    expect(delayUntil(at(60), at(0.5))).toBe(60);
  });
});
