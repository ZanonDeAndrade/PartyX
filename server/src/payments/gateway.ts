import type { GatewayStatus, PaymentMethod, PaymentSnapshot } from '../domain/payment';

/**
 * Contrato interno com o gateway de pagamento. **Um único gateway** (D-01: Mercado Pago, `payments/mercadopago/`); o adaptador
 * fictício segue só para o ambiente local e os testes. Nenhum tipo de SDK aparece aqui: cada adaptador
 * converte a resposta do provedor para os tipos de `domain/payment.ts`.
 *
 * Regras que todo adaptador cumpre:
 * - Valor sempre em centavos inteiros; a moeda é BRL.
 * - **Cartão: nunca recebe número, validade ou CVV.** Ou o comprador paga numa página hospedada pelo gateway (`hosted`),
 *   ou o navegador troca os dados por um token com o SDK oficial e só o token chega aqui (`token`).
 * - Toda criação de cobrança leva `idempotencyKey`: repetir a chamada devolve a mesma cobrança.
 * - O destinatário é a conta da PartyX. A CONTRATADA não recebe repasse.
 */
export interface GatewayCapabilities {
  /** Identificador do provedor (`mock`, e depois o nome do escolhido). */
  providerId: string;
  /** Como o cartão entra: página hospedada pelo gateway ou token gerado no navegador. */
  cardMode: 'hosted' | 'token';
  /** Limites de expiração do Pix no provedor, em segundos. Têm de ser compatíveis com a reserva (D-03). */
  pixExpiry: { minSeconds: number; maxSeconds: number };
  /** Parcelamento só existe se o cliente e o gateway aprovarem (D-02). */
  maxInstallments: number;
  /** Chave PÚBLICA do gateway para o componente de cartão no navegador (modo `token`). Nula no modo hospedado. */
  publicKey: string | null;
}

export interface Payer {
  name: string;
  email: string;
  /** Só dígitos. Vai ao gateway para o Pix; nunca para log. */
  cpf: string | null;
}

interface CommonInput {
  /** Nosso id do pedido: volta como referência externa na reconsulta e no webhook. */
  orderId: string;
  amountCents: number;
  payer: Payer;
  description: string;
  idempotencyKey: string;
}

export interface CreatePixInput extends CommonInput {
  /** Instante em que a cobrança deixa de valer (já ajustado ao que o provedor aceita). */
  expiresAt: Date;
}

export type CreateCardInput = CommonInput &
  (
    | { mode: 'hosted'; returnUrl: string }
    | {
        mode: 'token';
        cardToken: string;
        installments: number;
        /** Bandeira escolhida no componente do gateway (ex.: `visa`). */
        paymentMethodId: string;
        /** Crédito ou débito, como o componente do gateway informa. */
        paymentTypeId: string;
        returnUrl?: undefined;
      }
  );

export interface CreatedPayment {
  gatewayPaymentId: string;
  status: GatewayStatus;
  /** Cartão hospedado: para onde levar o comprador. */
  redirectUrl: string | null;
  snapshot: PaymentSnapshot;
}

/**
 * Do que trata uma notificação autêntica: uma cobrança (que será reconsultada) ou um assunto que a PartyX não usa
 * (responde 200 e não faz nada).
 */
export type NotificationSubject = { kind: 'payment'; id: string } | { kind: 'ignored' };

/** Resultado de autenticar uma notificação (webhook). Nunca lança por assinatura inválida: devolve `valid: false`. */
export type NotificationCheck =
  | { valid: true; eventId: string; type: string; subject: NotificationSubject }
  | { valid: false; reason: 'assinatura_ausente' | 'assinatura_invalida' | 'formato_invalido' | 'fora_do_prazo' };

export interface PaymentGateway {
  readonly capabilities: GatewayCapabilities;
  createPix(input: CreatePixInput): Promise<CreatedPayment>;
  createCard(input: CreateCardInput): Promise<CreatedPayment>;
  /** Consulta o estado real no gateway. É a fonte da verdade antes de aprovar qualquer pedido. */
  getPayment(gatewayPaymentId: string): Promise<PaymentSnapshot>;
  /** Autentica a notificação segundo o método do provedor, sobre o corpo **bruto** recebido e os parâmetros da URL. */
  verifyNotification(input: { headers: Headers; rawBody: string; query: URLSearchParams }): Promise<NotificationCheck>;
  /** Conta do provedor que deve receber (a da PartyX). Usada na conferência antes de aprovar. */
  readonly accountId: string;
}

/** Erro de rede, tempo esgotado ou resposta inesperada do gateway. A cobrança pode ou não ter sido criada: repetir com a mesma chave é seguro. */
export class GatewayError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = 'GatewayError';
    this.retryable = retryable;
  }
}

/** Recusa definitiva do gateway (dados inválidos, cartão negado na criação). Não adianta repetir. */
export class GatewayRejectedError extends GatewayError {
  readonly reason: string;
  constructor(reason: string) {
    super('pagamento recusado pelo gateway', false);
    this.name = 'GatewayRejectedError';
    this.reason = reason;
  }
}

export type { PaymentMethod };
