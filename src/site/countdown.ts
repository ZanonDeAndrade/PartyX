import { useEffect, useState } from 'react';

/**
 * Contador da reserva. O prazo vem do servidor em segundos (`secondsLeft`, calculado com o relógio do servidor);
 * aqui só se anda de 1 em 1 s a partir do instante em que a resposta chegou. Relógio errado do aparelho não muda nada.
 * Cada nova resposta do servidor reancora o contador.
 */
export function useCountdown(secondsLeft: number | null, anchor: unknown): number | null {
  const [left, setLeft] = useState<number | null>(secondsLeft);
  useEffect(() => {
    if (secondsLeft === null) {
      setLeft(null);
      return;
    }
    const start = Date.now();
    setLeft(secondsLeft);
    const id = setInterval(() => setLeft(Math.max(0, secondsLeft - Math.floor((Date.now() - start) / 1000))), 500);
    return () => clearInterval(id);
  }, [secondsLeft, anchor]);
  return left;
}

export const mmss = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
