import { useEffect, useReducer, useRef, useState } from 'react';
import type { Logic } from './Logic';

/**
 * Hospeda uma `Logic` em um componente React.
 *
 * A lógica aplica `setState` de forma síncrona. Aqui só agendamos a renderização e,
 * depois do commit, chamamos `componentDidUpdate` e os callbacks pendentes de `setState`.
 */
export function useLogic<L extends Logic<object>>(create: () => L): L {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const callbacks = useRef<(() => void)[]>([]);
  const [logic] = useState(() => {
    const instance = create();
    instance.attach(cb => {
      if (cb) callbacks.current.push(cb);
      rerender();
    });
    return instance;
  });

  useEffect(() => {
    logic.componentDidMount();
    return () => logic.componentWillUnmount();
  }, [logic]);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    logic.componentDidUpdate();
    const pending = callbacks.current;
    callbacks.current = [];
    pending.forEach(cb => cb());
  });

  return logic;
}
