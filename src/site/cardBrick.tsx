import { useEffect, useId, useRef, useState } from 'react';
import type { CardTokenData } from './api';
import { cspNonce, mountCardBrick, type CardBrickState, type MercadoPagoConstructor } from './cardBrickMount';

/**
 * Card Payment Brick do Mercado Pago (MercadoPago.js v2), carregado do domínio oficial do Mercado Pago só nesta tela.
 * Número, validade e código de segurança ficam nos campos do Mercado Pago e viram um token de uso único no navegador: a PartyX
 * recebe só o token, a bandeira e o tipo (crédito ou débito). À vista: a D-02 (parcelamento) está em aberto. Se o Brick não
 * carregar (bloqueio de rastreamento do navegador, SDK fora), a tela diz isso e oferece o Pix (cardBrickMount.ts).
 * Documentação: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/cards
 */
const SDK_URL = 'https://sdk.mercadopago.com/js/v2';

declare global {
  interface Window {
    MercadoPago?: MercadoPagoConstructor;
  }
}

let loading: Promise<MercadoPagoConstructor> | null = null;
function loadSdk(): Promise<MercadoPagoConstructor> {
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago);
  loading ??= new Promise<MercadoPagoConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    const failed = () => {
      loading = null;
      script.remove();
      reject(new Error('sdk'));
    };
    script.onload = () => (window.MercadoPago ? resolve(window.MercadoPago) : failed());
    script.onerror = failed;
    document.head.appendChild(script);
  });
  return loading;
}

interface BrickFormData {
  token?: string;
  payment_method_id?: string;
  payment_type_id?: string;
}

export function CardBrick({
  publicKey,
  amountCents,
  payerEmail,
  onToken,
  onPix,
}: {
  publicKey: string;
  amountCents: number;
  payerEmail: string;
  /** Envia o token ao servidor. Rejeitar devolve o formulário ao comprador para tentar de novo. */
  onToken: (data: CardTokenData) => Promise<void>;
  /** Troca para Pix quando o cartão não carrega. Ausente: o Pix não cabe na reserva (D-03). */
  onPix?: () => void;
}) {
  const containerId = `px-card-brick-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [state, setState] = useState<CardBrickState>('carregando');
  const send = useRef(onToken);
  send.current = onToken;

  useEffect(
    () =>
      mountCardBrick({
        loadSdk,
        publicKey,
        nonce: cspNonce(document),
        containerId,
        onState: setState,
        settings: ({ onReady, onError }) => ({
          initialization: { amount: amountCents / 100, payer: { email: payerEmail } },
          customization: {
            paymentMethods: { minInstallments: 1, maxInstallments: 1 },
            visual: { style: { theme: 'default', customVariables: { baseColor: '#7C3AED' } } },
          },
          callbacks: {
            onReady,
            onError,
            onSubmit: (formData: BrickFormData, additionalData?: { paymentTypeId?: string }) => {
              const type = additionalData?.paymentTypeId ?? formData.payment_type_id;
              if (!formData.token || !formData.payment_method_id) return Promise.reject(new Error('dados'));
              return send.current({
                cardToken: formData.token,
                paymentMethodId: formData.payment_method_id,
                paymentTypeId: type === 'debit_card' ? 'debit_card' : 'credit_card',
              });
            },
          },
        }),
      }),
    [publicKey, amountCents, payerEmail, containerId],
  );

  return (
    <div className="px-card-brick">
      {state === 'carregando' ? (
        <div className="px-skel px-card-brick-skel" aria-busy="true" aria-label="Carregando o pagamento com cartão" />
      ) : null}
      {state === 'erro' ? (
        <div className="px-notice px-notice-err" role="alert">
          <p>
            {onPix
              ? 'Não foi possível carregar o pagamento com cartão. Desative o bloqueio de rastreamento para este site ou pague por Pix.'
              : 'Não foi possível carregar o pagamento com cartão. Desative o bloqueio de rastreamento para este site e recarregue a página.'}
          </p>
          {onPix ? (
            <button type="button" className="px-btn px-btn-pri" onClick={onPix}>
              Pagar com Pix
            </button>
          ) : null}
        </div>
      ) : null}
      <div id={containerId} />
    </div>
  );
}
