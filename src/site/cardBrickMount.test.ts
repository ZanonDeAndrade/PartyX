import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CARD_BRICK_TIMEOUT_MS,
  cspNonce,
  mountCardBrick,
  type BrickCallbacks,
  type CardBrickState,
  type MercadoPagoConstructor,
} from './cardBrickMount';

/** SDK falso: `create` faz o que o teste mandar com os callbacks do Brick e devolve o controlador (ou nada). */
function fakeSdk(create: (callbacks: BrickCallbacks) => Promise<{ unmount: () => void } | undefined>) {
  const built: { publicKey: string; options?: { locale?: string; deviceProfileCspNonce?: string } }[] = [];
  const MercadoPago = class {
    constructor(publicKey: string, options?: { locale?: string; deviceProfileCspNonce?: string }) {
      built.push({ publicKey, options });
    }
    bricks() {
      return { create: (_name: string, _id: string, settings: unknown) => create(settings as BrickCallbacks) };
    }
  } as unknown as MercadoPagoConstructor;
  return { MercadoPago, built };
}

function mount(loadSdk: () => Promise<MercadoPagoConstructor>, nonce: string | null = null) {
  const states: CardBrickState[] = [];
  const cleanup = mountCardBrick({
    loadSdk,
    publicKey: 'APP_USR-chave-publica-de-teste',
    nonce,
    containerId: 'px-card-brick-1',
    settings: callbacks => callbacks,
    onState: s => states.push(s),
  });
  return { states, cleanup };
}

describe('mountCardBrick: o pagamento com cartão nunca fica numa área cinza sem aviso', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('Brick pronto: estado "pronto", com o nonce da CSP entregue ao SDK; o prazo não dispara depois', async () => {
    const { MercadoPago, built } = fakeSdk(async cb => {
      cb.onReady();
      return { unmount: vi.fn() };
    });
    const { states } = mount(() => Promise.resolve(MercadoPago), 'bm9uY2UtZGUtdGVzdGU=');
    await vi.advanceTimersByTimeAsync(CARD_BRICK_TIMEOUT_MS + 1000);
    expect(states).toEqual(['pronto']);
    expect(built).toEqual([
      {
        publicKey: 'APP_USR-chave-publica-de-teste',
        options: { locale: 'pt-BR', deviceProfileCspNonce: 'bm9uY2UtZGUtdGVzdGU=' },
      },
    ]);
  });

  it('sem nonce na página: o SDK é criado sem a opção (e segue sem o script do antifraude)', async () => {
    const { MercadoPago, built } = fakeSdk(async cb => {
      cb.onReady();
      return { unmount: vi.fn() };
    });
    mount(() => Promise.resolve(MercadoPago));
    await vi.advanceTimersByTimeAsync(0);
    expect(built[0]!.options).toEqual({ locale: 'pt-BR' });
  });

  it('bloqueio do navegador (create resolve sem controlador, sem onError nem onReady): "erro" na hora, sem esperar o prazo', async () => {
    const { MercadoPago } = fakeSdk(async () => undefined);
    const { states } = mount(() => Promise.resolve(MercadoPago));
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(['erro']);
  });

  it('SDK com erro ao carregar: "erro"', async () => {
    const { states } = mount(() => Promise.reject(new Error('sdk')));
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(['erro']);
  });

  it('SDK que nem carrega: "erro" aos 10 s, não antes', async () => {
    const { states } = mount(() => new Promise<MercadoPagoConstructor>(() => {}));
    await vi.advanceTimersByTimeAsync(CARD_BRICK_TIMEOUT_MS - 1);
    expect(states).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(states).toEqual(['erro']);
  });

  it('onError antes de pronto: "erro"; erro de campo depois de pronto não troca a tela', async () => {
    let callbacks!: BrickCallbacks;
    const { MercadoPago } = fakeSdk(async cb => {
      callbacks = cb;
      return { unmount: vi.fn() };
    });
    const { states } = mount(() => Promise.resolve(MercadoPago));
    await vi.advanceTimersByTimeAsync(0);
    callbacks.onError({ type: 'critical' });
    expect(states).toEqual(['erro']);
    callbacks.onReady();
    callbacks.onError({ type: 'non_critical' });
    expect(states).toEqual(['erro', 'pronto']);
  });

  it('Brick lento que fica pronto depois do prazo: o aviso sai e o formulário volta', async () => {
    let callbacks!: BrickCallbacks;
    const { MercadoPago } = fakeSdk(async cb => {
      callbacks = cb;
      return { unmount: vi.fn() };
    });
    const { states } = mount(() => Promise.resolve(MercadoPago));
    await vi.advanceTimersByTimeAsync(CARD_BRICK_TIMEOUT_MS);
    callbacks.onReady();
    expect(states).toEqual(['erro', 'pronto']);
  });

  it('tela fechada (troca para Pix): desmonta o Brick e não muda mais o estado', async () => {
    const unmount = vi.fn();
    let callbacks!: BrickCallbacks;
    const { MercadoPago } = fakeSdk(async cb => {
      callbacks = cb;
      return { unmount };
    });
    const { states, cleanup } = mount(() => Promise.resolve(MercadoPago));
    await vi.advanceTimersByTimeAsync(0);
    cleanup();
    expect(unmount).toHaveBeenCalledOnce();
    callbacks.onReady();
    await vi.advanceTimersByTimeAsync(CARD_BRICK_TIMEOUT_MS * 2);
    expect(states).toEqual([]);
  });

  it('tela fechada antes de o create terminar: o Brick criado depois é desmontado', async () => {
    const unmount = vi.fn();
    let finish!: () => void;
    const { MercadoPago } = fakeSdk(() => new Promise(ok => (finish = () => ok({ unmount }))));
    const { states, cleanup } = mount(() => Promise.resolve(MercadoPago));
    await vi.advanceTimersByTimeAsync(0);
    cleanup();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(unmount).toHaveBeenCalledOnce();
    expect(states).toEqual([]);
  });
});

describe('cspNonce', () => {
  const doc = (meta: { nonce?: string; attr?: string | null } | null) => ({
    querySelector: () => (meta ? { nonce: meta.nonce ?? '', getAttribute: () => meta.attr ?? null } : null),
  }) as unknown as Pick<Document, 'querySelector'>;

  it('lê a propriedade nonce (o navegador esvazia o atributo depois de ler)', () => {
    expect(cspNonce(doc({ nonce: 'abc123+/=', attr: '' }))).toBe('abc123+/=');
  });
  it('navegador sem a propriedade: lê o atributo', () => {
    expect(cspNonce(doc({ attr: 'abc123' }))).toBe('abc123');
  });
  it('sem meta, vazio ou com espaço (o SDK recusaria): nenhum', () => {
    expect(cspNonce(doc(null))).toBeNull();
    expect(cspNonce(doc({ nonce: '' }))).toBeNull();
    expect(cspNonce(doc({ nonce: 'a b' }))).toBeNull();
  });
});
