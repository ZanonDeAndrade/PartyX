import { useEffect, useId, useRef, useState } from 'react';
import type { CardTokenData } from './api';

/**
 * Card Payment Brick do Mercado Pago (MercadoPago.js v2), carregado do domínio oficial do Mercado Pago só nesta tela.
 * Número, validade e código de segurança ficam nos campos do Mercado Pago e viram um token de uso único no navegador: a PartyX
 * recebe só o token, a bandeira e o tipo (crédito ou débito). À vista: a D-02 (parcelamento) está em aberto.
 * Documentação: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/cards
 */
const SDK_URL = 'https://sdk.mercadopago.com/js/v2';

interface BrickController {
  unmount?: () => void;
}
interface MercadoPagoInstance {
  bricks(): { create(name: string, containerId: string, settings: unknown): Promise<BrickController> };
}
declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => MercadoPagoInstance;
  }
}

let loading: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('sdk'));
    };
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
}: {
  publicKey: string;
  amountCents: number;
  payerEmail: string;
  /** Envia o token ao servidor. Rejeitar devolve o formulário ao comprador para tentar de novo. */
  onToken: (data: CardTokenData) => Promise<void>;
}) {
  const containerId = `px-card-brick-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [state, setState] = useState<'carregando' | 'pronto' | 'erro'>('carregando');
  const send = useRef(onToken);
  send.current = onToken;

  useEffect(() => {
    let live = true;
    let controller: BrickController | undefined;
    loadSdk()
      .then(async () => {
        if (!live || !window.MercadoPago) return;
        const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
        controller = await mp.bricks().create('cardPayment', containerId, {
          initialization: { amount: amountCents / 100, payer: { email: payerEmail } },
          customization: {
            paymentMethods: { minInstallments: 1, maxInstallments: 1 },
            visual: { style: { theme: 'default', customVariables: { baseColor: '#7C3AED' } } },
          },
          callbacks: {
            onReady: () => live && setState('pronto'),
            onSubmit: (formData: BrickFormData, additionalData?: { paymentTypeId?: string }) => {
              const type = additionalData?.paymentTypeId ?? formData.payment_type_id;
              if (!formData.token || !formData.payment_method_id) return Promise.reject(new Error('dados'));
              return send.current({
                cardToken: formData.token,
                paymentMethodId: formData.payment_method_id,
                paymentTypeId: type === 'debit_card' ? 'debit_card' : 'credit_card',
              });
            },
            onError: () => {
              // Erros de campo o próprio Brick mostra; aqui só a falha de carregar o componente.
              if (live && !controller) setState('erro');
            },
          },
        });
        if (!live) controller.unmount?.();
      })
      .catch(() => live && setState('erro'));
    return () => {
      live = false;
      controller?.unmount?.();
    };
  }, [publicKey, amountCents, payerEmail, containerId]);

  return (
    <div className="px-card-brick">
      {state === 'carregando' ? (
        <div className="px-skel px-card-brick-skel" aria-busy="true" aria-label="Carregando o pagamento com cartão" />
      ) : null}
      {state === 'erro' ? (
        <p className="px-notice px-notice-err" role="alert">
          Não foi possível carregar o pagamento com cartão. Confira a conexão e recarregue a página.
        </p>
      ) : null}
      <div id={containerId} />
    </div>
  );
}
