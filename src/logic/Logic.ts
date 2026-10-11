/**
 * Base de lógica com `setState` síncrono.
 *
 * O protótipo original mescla o patch em `this.state` imediatamente e só depois agenda a
 * renderização. Vários fluxos (ex.: `setState(...)` seguido de `go(...)`) dependem de ler o
 * estado já atualizado, então o `React.Component#setState` (assíncrono) não serve aqui.
 */
export type StateUpdate<S> = Partial<S> | ((prev: S) => Partial<S>);

export abstract class Logic<S extends object> {
  declare state: S;
  private notify: ((cb?: () => void) => void) | null = null;

  attach(notify: (cb?: () => void) => void): void {
    this.notify = notify;
  }

  setState(update: StateUpdate<S>, cb?: () => void): void {
    const prev = this.state;
    const patch = typeof update === 'function' ? update(prev) : update;
    this.state = { ...prev, ...patch };
    this.notify?.(cb);
  }

  componentDidMount(): void {}
  componentDidUpdate(): void {}
  componentWillUnmount(): void {}
}
