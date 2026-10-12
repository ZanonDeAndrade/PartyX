import type { Clock } from '../../providers/clock';
import { isValidAmount, looksLikeCardNumber } from '../../domain/payment';
import {
  GatewayError,
  GatewayRejectedError,
  type CreateCardInput,
  type CreatedPayment,
  type CreatePixInput,
  type NotificationCheck,
  type Payer,
  type PaymentGateway,
} from '../gateway';
import { createMpHttp, type MpHttpOptions } from './http';
import { amountFromCents, ORDER_ID, snapshotFrom, type MpOrder } from './mapping';
import { verifySignature } from './signature';

/**
 * Adaptador do **Mercado Pago** (D-01): Checkout Transparente pela **API de Orders** (`/v1/orders`), com o cartão tokenizado
 * no navegador pelo Card Payment Brick. Decisão de 11/10/2026: as credenciais de teste do painel são recusadas pela API de
 * pagamentos (`/v1/payments`, 401 "Unauthorized use of live credentials") e aceitas pela de Orders, que é a recomendada pela
 * documentação para integrações novas. Documentação consultada em 11/10/2026:
 * - Pix: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix
 * - Cartão: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/cards
 * - Webhooks: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
 * - Consultar order: https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/get-order/get
 * - Testes: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/cards
 *
 * Uma cobrança da PartyX = uma order do Mercado Pago com **uma** transação. O id guardado no pedido (`gateway_payment_id`) é o
 * id da order. O dinheiro vai para a conta da PartyX (a das credenciais); a contratada não recebe nem repassa nada.
 */

/** Limites do vencimento do Pix na documentação: de 30 minutos a 30 dias depois da criação. */
export const MP_PIX_EXPIRY = { minSeconds: 30 * 60, maxSeconds: 30 * 86_400 } as const;

/** No ambiente de teste, o e-mail do pagador precisa ser este (documentação dos testes de cartão e Pix). */
export const SANDBOX_PAYER_EMAIL = 'test@testuser.com';

export interface MercadoPagoOptions {
  accessToken: string;
  publicKey: string;
  webhookSecret: string;
  /** Conta da PartyX no Mercado Pago (`user_id` da order). Toda order conferida precisa ter este recebedor. */
  collectorId: string;
  /** `true` com credenciais de produção (`GATEWAY_ENVIRONMENT=producao`). */
  liveMode: boolean;
  clock: Clock;
  http?: Omit<MpHttpOptions, 'accessToken'>;
}

export interface MercadoPagoGateway extends PaymentGateway {
  /** Confere, na partida, que as credenciais são da conta configurada. Não lança: devolve o problema. */
  checkAccount(): Promise<'ok' | 'conta_diferente' | 'credencial_recusada' | 'indisponivel'>;
}

const CARD_TYPES = new Set(['credit_card', 'debit_card']);

interface NotificationBody {
  type?: unknown;
  action?: unknown;
  date_created?: unknown;
  data?: { id?: unknown } | null;
}

function parseNotification(rawBody: string): NotificationBody | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as NotificationBody) : null;
  } catch {
    return null;
  }
}

export function createMercadoPagoGateway(o: MercadoPagoOptions): MercadoPagoGateway {
  const http = createMpHttp({ ...o.http, accessToken: o.accessToken });

  const payerOf = (p: Payer) => {
    const parts = p.name.trim().split(/\s+/);
    const first = parts[0] ?? '';
    const last = parts.slice(1).join(' ');
    const cpf = p.cpf && /^\d{11}$/.test(p.cpf) ? p.cpf : null;
    return {
      // Teste: a documentação só aceita o e-mail de comprador de teste. Produção: o e-mail do comprador.
      email: o.liveMode ? p.email : SANDBOX_PAYER_EMAIL,
      ...(first ? { first_name: first.slice(0, 60) } : {}),
      ...(last ? { last_name: last.slice(0, 60) } : {}),
      // CPF só neste payload ao Mercado Pago. Nunca em log, erro ou resposta.
      ...(cpf ? { identification: { type: 'CPF', number: cpf } } : {}),
    };
  };

  const createOrder = async (
    input: { orderId: string; amountCents: number; description: string; payer: Payer; idempotencyKey: string },
    payment: Record<string, unknown>,
  ): Promise<CreatedPayment> => {
    if (!isValidAmount(input.amountCents)) throw new GatewayRejectedError('valor_invalido');
    const amount = amountFromCents(input.amountCents);
    const order = await http.request<MpOrder>({
      method: 'POST',
      path: '/v1/orders',
      idempotencyKey: input.idempotencyKey,
      idempotent: true,
      acceptFailedOrder: true,
      body: {
        type: 'online',
        processing_mode: 'automatic',
        external_reference: input.orderId,
        total_amount: amount,
        description: input.description.slice(0, 200),
        payer: payerOf(input.payer),
        transactions: { payments: [{ amount, ...payment }] },
      },
    });
    const snapshot = snapshotFrom(order);
    if (!ORDER_ID.test(snapshot.gatewayPaymentId))
      throw new GatewayError('mercadopago: resposta sem id de order', true);
    return { gatewayPaymentId: snapshot.gatewayPaymentId, status: snapshot.status, redirectUrl: null, snapshot };
  };

  return {
    capabilities: {
      providerId: 'mercadopago',
      cardMode: 'token',
      pixExpiry: MP_PIX_EXPIRY,
      // D-02 (parcelamento) em aberto: à vista, sem opção de parcelas no Brick.
      maxInstallments: 1,
      publicKey: o.publicKey,
    },
    accountId: o.collectorId,

    async createPix(input: CreatePixInput): Promise<CreatedPayment> {
      const seconds = Math.round((input.expiresAt.getTime() - o.clock.now().getTime()) / 1000);
      if (seconds < MP_PIX_EXPIRY.minSeconds || seconds > MP_PIX_EXPIRY.maxSeconds) {
        throw new GatewayRejectedError('vencimento_do_pix_fora_do_limite');
      }
      return createOrder(input, {
        payment_method: { id: 'pix', type: 'bank_transfer' },
        // Duração ISO 8601 (a documentação aceita, por exemplo, PT30M).
        expiration_time: `PT${seconds}S`,
      });
    },

    async createCard(input: CreateCardInput): Promise<CreatedPayment> {
      if (input.mode !== 'token') throw new GatewayRejectedError('modo_de_cartao_nao_suportado');
      if (looksLikeCardNumber(input.cardToken)) throw new GatewayRejectedError('numero_de_cartao_nao_aceito');
      if (!/^[a-z0-9_-]{2,40}$/.test(input.paymentMethodId)) throw new GatewayRejectedError('bandeira_invalida');
      if (!CARD_TYPES.has(input.paymentTypeId)) throw new GatewayRejectedError('tipo_de_cartao_invalido');
      return createOrder(input, {
        payment_method: {
          id: input.paymentMethodId,
          type: input.paymentTypeId,
          token: input.cardToken,
          installments: input.installments,
        },
      });
    },

    async getPayment(gatewayPaymentId: string) {
      if (!ORDER_ID.test(gatewayPaymentId)) throw new GatewayRejectedError('id_de_order_invalido');
      const order = await http.request<MpOrder>({
        method: 'GET',
        path: `/v1/orders/${gatewayPaymentId}`,
        idempotent: true,
      });
      const snapshot = snapshotFrom(order);
      if (snapshot.gatewayPaymentId !== gatewayPaymentId) {
        throw new GatewayError('mercadopago: consulta devolveu outra order', true);
      }
      return snapshot;
    },

    /**
     * Busca de orders (`GET /v1/orders`, com `begin_date`, `end_date` e `external_reference`; até 3 páginas de 50). A busca do
     * Mercado Pago indexa a order com alguns segundos de atraso (observado no ambiente de teste em 12/10/2026): vazio não prova
     * que a order não existe, só que ainda não apareceu.
     */
    async findPaymentsByOrderRef(orderId: string, since: Date) {
      const begin = new Date(since.getTime() - 5 * 60_000).toISOString();
      const end = new Date(o.clock.now().getTime() + 60_000).toISOString();
      const found: ReturnType<typeof snapshotFrom>[] = [];
      for (let page = 1; page <= 3; page++) {
        const params = new URLSearchParams({
          begin_date: begin,
          end_date: end,
          external_reference: orderId,
          page: String(page),
          page_size: '50',
        });
        const res = await http.request<{ data?: MpOrder[] | null; paging?: { total_pages?: unknown } | null }>({
          method: 'GET',
          path: `/v1/orders?${params.toString()}`,
          idempotent: true,
        });
        for (const order of res.data ?? []) {
          const snapshot = snapshotFrom(order);
          // A busca é filtrada pelo Mercado Pago, mas a referência é conferida de novo aqui.
          if (snapshot.orderRef === orderId && ORDER_ID.test(snapshot.gatewayPaymentId)) found.push(snapshot);
        }
        if (page >= Number(res.paging?.total_pages ?? 1)) break;
      }
      return found;
    },

    async verifyNotification({ headers, rawBody, query }): Promise<NotificationCheck> {
      const body = parseNotification(rawBody);
      const queryId = query.get('data.id');
      const bodyId = body?.data?.id === undefined || body?.data?.id === null ? null : String(body.data.id);
      const dataId = queryId ?? bodyId;
      const result = verifySignature({
        xSignature: headers.get('x-signature'),
        xRequestId: headers.get('x-request-id'),
        dataId,
        secret: o.webhookSecret,
        nowMs: o.clock.now().getTime(),
      });
      if (result !== 'ok') return { valid: false, reason: result };
      // A assinatura cobre o id da URL: o corpo precisa falar do mesmo recurso (o id da order chega em maiúsculas).
      if (!body || !dataId || (queryId && bodyId && queryId.toUpperCase() !== bodyId.toUpperCase())) {
        return { valid: false, reason: 'formato_invalido' };
      }
      const type = String(body.type ?? query.get('type') ?? '').slice(0, 40);
      const action = String(body.action ?? '').slice(0, 60);
      const created = String(body.date_created ?? headers.get('x-request-id') ?? '').slice(0, 40);
      const eventId = `mp:${type}:${dataId.toUpperCase()}:${action}:${created}`;
      if (type === 'order') {
        const id = dataId.toUpperCase();
        // Autêntica, mas sem id de order (ex.: "Simular notificação" do painel, que usa o id fictício 123456): nada a reconsultar.
        if (!ORDER_ID.test(id)) return { valid: true, eventId, type: action || 'order', subject: { kind: 'ignored' } };
        // Inclui `order.charged_back`: a contestação chega pelo mesmo tópico e a reconsulta mostra o estado.
        return { valid: true, eventId, type: action || 'order', subject: { kind: 'payment', id } };
      }
      return { valid: true, eventId, type: type || 'desconhecido', subject: { kind: 'ignored' } };
    },

    async checkAccount() {
      try {
        const me = await http.request<{ id?: unknown }>({ method: 'GET', path: '/users/me', idempotent: true });
        return String(me.id) === o.collectorId ? 'ok' : 'conta_diferente';
      } catch (error) {
        return error instanceof GatewayError && !error.retryable ? 'credencial_recusada' : 'indisponivel';
      }
    },
  };
}
