/**
 * Montagem do Card Payment Brick do Mercado Pago, fora do componente para ser testada sem navegador. O Brick avisa que está
 * pronto por `onReady`; a falha de carregar chega por caminhos diferentes, medidos no navegador em 18/10/2026:
 * - o SDK não carrega (rede, bloqueador de anúncio): o `<script>` dá erro, ou nada acontece;
 * - o navegador corta um arquivo do Brick (proteção contra rastreamento do Firefox): `create` resolve sem controlador e não chama
 *   `onError` nem `onReady`, e a área do cartão ficava cinza para sempre;
 * - `onError` antes de `onReady`.
 * Sem `onReady` em 10 s, a tela também mostra a falha. Se o Brick ficar pronto depois disso, volta ao formulário.
 */
export const CARD_BRICK_TIMEOUT_MS = 10_000;

export type CardBrickState = 'carregando' | 'pronto' | 'erro';

export interface BrickController {
  unmount?: () => void;
}
export interface BrickCallbacks {
  onReady: () => void;
  onError: (error?: unknown) => void;
}
export type MercadoPagoConstructor = new (
  publicKey: string,
  options?: { locale?: string; deviceProfileCspNonce?: string },
) => {
  bricks(): { create(name: string, containerId: string, settings: unknown): Promise<BrickController | undefined> };
};

/**
 * Nonce da CSP desta página (o servidor põe num `<meta>`), para o SDK liberar o script do perfil do aparelho do antifraude.
 * A propriedade `nonce` vem primeiro: o navegador esvazia o atributo depois de ler. Sem nonce, o SDK segue sem esse script.
 */
export function cspNonce(doc: Pick<Document, 'querySelector'>): string | null {
  const meta = doc.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]');
  const value = meta?.nonce || meta?.getAttribute('nonce') || '';
  return value && !/\s/.test(value) ? value : null;
}

/** Cria o Brick no contêiner e informa o estado da tela. Devolve a limpeza (desmonta o Brick e para o prazo). */
export function mountCardBrick(o: {
  loadSdk: () => Promise<MercadoPagoConstructor>;
  publicKey: string;
  nonce: string | null;
  containerId: string;
  /** Configuração do Brick, com os callbacks de pronto e de erro já ligados à tela. */
  settings: (callbacks: BrickCallbacks) => unknown;
  onState: (state: CardBrickState) => void;
  timeoutMs?: number;
}): () => void {
  let live = true;
  let ready = false;
  let controller: BrickController | undefined;
  const fail = () => {
    if (live && !ready) o.onState('erro');
  };
  const timer = setTimeout(fail, o.timeoutMs ?? CARD_BRICK_TIMEOUT_MS);
  const callbacks: BrickCallbacks = {
    onReady: () => {
      ready = true;
      clearTimeout(timer);
      if (live) o.onState('pronto');
    },
    // Erros de campo o próprio Brick mostra, depois de pronto; antes disso, é o componente que não carregou.
    onError: fail,
  };
  o.loadSdk()
    .then(async MercadoPago => {
      if (!live) return;
      const mp = new MercadoPago(o.publicKey, {
        locale: 'pt-BR',
        ...(o.nonce ? { deviceProfileCspNonce: o.nonce } : {}),
      });
      const created = await mp.bricks().create('cardPayment', o.containerId, o.settings(callbacks));
      if (!live) return created?.unmount?.();
      if (!created) return fail();
      controller = created;
    })
    .catch(fail);
  return () => {
    live = false;
    clearTimeout(timer);
    controller?.unmount?.();
  };
}
