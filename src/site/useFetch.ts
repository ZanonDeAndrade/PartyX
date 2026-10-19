import { useCallback, useEffect, useRef, useState } from 'react';

export type Fetched<T> = { status: 'loading' } | { status: 'error'; code: number } | { status: 'ok'; data: T };

/**
 * Busca na montagem e quando `key` muda. Cancela a requisição anterior para uma resposta lenta não sobrescrever a nova.
 * Com `initial` (dados que vieram no HTML), a primeira busca é pulada: a tela já nasce pronta. Com `revalidate`, a tela nasce com
 * `initial` (dados de uma visita anterior) e busca de novo por trás, sem esqueleto; se essa busca falhar, ficam os dados que já estão.
 */
export function useFetch<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
  initial?: T,
  revalidate = false,
): [Fetched<T>, () => void] {
  const [state, setState] = useState<Fetched<T>>(() =>
    initial === undefined ? { status: 'loading' } : { status: 'ok', data: initial },
  );
  const [attempt, setAttempt] = useState(0);
  const skip = useRef(initial !== undefined && !revalidate);
  const quiet = useRef(initial !== undefined && revalidate);
  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const controller = new AbortController();
    const silent = quiet.current;
    quiet.current = false;
    if (!silent) setState({ status: 'loading' });
    // Busca cancelada não grava nada: o cancelamento no meio da leitura do corpo fazia `request` devolver `null` como se fosse
    // sucesso, e a tela recebia `{ status: 'ok', data: null }` (ex.: formulário de evento sem `meta`, tela em branco).
    load(controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setState({ status: 'ok', data });
      })
      .catch((e: { name?: string; status?: number }) => {
        if (e?.name === 'AbortError' || controller.signal.aborted || silent) return;
        setState({ status: 'error', code: e?.status ?? 0 });
      });
    return () => controller.abort();
    // `load` troca a cada render; a identidade da busca é `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  return [state, useCallback(() => setAttempt(a => a + 1), [])];
}
