/** Relógio injetável: permite controlar o tempo em testes de reserva, expiração e relatórios. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function createFakeClock(start: Date | string) {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    set: (to: Date | string) => {
      current = new Date(to);
    },
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}
