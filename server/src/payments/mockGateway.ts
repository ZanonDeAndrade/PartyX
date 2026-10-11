import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Clock } from '../providers/clock';
import { isValidAmount, looksLikeCardNumber, type GatewayStatus, type PaymentSnapshot } from '../domain/payment';
import {
  GatewayError,
  GatewayRejectedError,
  type CreatedPayment,
  type CreateCardInput,
  type CreatePixInput,
  type NotificationCheck,
  type PaymentGateway,
} from './gateway';

/**
 * **Adaptador FICTÍCIO.** Não fala com nenhum provedor, não move dinheiro e não vale como evidência de nada
 * do gateway real. Existe só para desenvolver e testar o fluxo no ambiente local. Em homologação e produção a
 * configuração recusa subir com ele (`config.ts`) e `createGateway` também (defesa em duas camadas).
 *
 * Não há segredo escrito no código: a chave de assinatura dos webhooks fictícios é aleatória a cada instância
 * e só circula dentro do processo (`simulate.sign`).
 */
export const MOCK_ACCOUNT_ID = 'conta-ficticia-partyx';

interface StoredPayment {
  snapshot: PaymentSnapshot;
}

export interface MockGateway extends PaymentGateway {
  /** Simulações para testes e para o desenvolvimento local. Não existem em nenhum adaptador real. */
  simulate: {
    setStatus(gatewayPaymentId: string, status: GatewayStatus): void;
    failNext(error: GatewayError): void;
    /** Altera o que a próxima consulta devolve (valor, conta, referência), para provar a conferência. */
    tamper(gatewayPaymentId: string, patch: Partial<PaymentSnapshot>): void;
    sign(rawBody: string, timestamp?: number): string;
    all(): PaymentSnapshot[];
    readonly createCalls: number;
  };
}

export function createMockGateway(clock: Clock): MockGateway {
  const signingKey = randomBytes(32);
  const payments = new Map<string, StoredPayment>();
  const byKey = new Map<string, string>();
  let nextFailure: GatewayError | null = null;
  let createCalls = 0;

  const takeFailure = () => {
    if (nextFailure) {
      const e = nextFailure;
      nextFailure = null;
      throw e;
    }
  };

  const base = (
    id: string,
    input: { orderId: string; amountCents: number },
    method: 'pix' | 'cartao',
  ): PaymentSnapshot => ({
    gatewayPaymentId: id,
    status: 'pendente',
    method,
    orderRef: input.orderId,
    amountCents: input.amountCents,
    currency: 'BRL',
    accountId: MOCK_ACCOUNT_ID,
    paidAt: null,
    pix: null,
  });

  const sign = (rawBody: string, timestamp: number) =>
    `t=${timestamp},v1=${createHmac('sha256', signingKey).update(`${timestamp}.${rawBody}`).digest('hex')}`;

  const again = (key: string, hosted: boolean): CreatedPayment | null => {
    const existing = byKey.get(key);
    if (!existing) return null;
    const { snapshot } = payments.get(existing)!;
    return {
      gatewayPaymentId: existing,
      status: snapshot.status,
      redirectUrl: hosted ? `https://pagamento.ficticio.invalid/${existing}` : null,
      snapshot,
    };
  };

  const gateway: MockGateway = {
    capabilities: {
      providerId: 'mock',
      cardMode: 'hosted',
      pixExpiry: { minSeconds: 30, maxSeconds: 86_400 },
      maxInstallments: 1,
    },
    accountId: MOCK_ACCOUNT_ID,

    async createPix(input: CreatePixInput): Promise<CreatedPayment> {
      createCalls++;
      takeFailure();
      if (!isValidAmount(input.amountCents)) throw new GatewayRejectedError('valor_invalido');
      const repeated = again(input.idempotencyKey, false);
      if (repeated) return repeated;
      const id = `mock_pix_${randomBytes(6).toString('hex')}`;
      const snapshot = base(id, input, 'pix');
      snapshot.pix = {
        copyPaste: `00020126FICTICIO${randomBytes(8).toString('hex')}5204000053039865802BR5909PARTYX6009SAOPAULO6304ABCD`,
        qrCodeImage: null,
        expiresAt: input.expiresAt,
      };
      payments.set(id, { snapshot });
      byKey.set(input.idempotencyKey, id);
      return { gatewayPaymentId: id, status: 'pendente', redirectUrl: null, snapshot };
    },

    async createCard(input: CreateCardInput): Promise<CreatedPayment> {
      createCalls++;
      takeFailure();
      if (!isValidAmount(input.amountCents)) throw new GatewayRejectedError('valor_invalido');
      if (input.mode === 'token' && looksLikeCardNumber(input.cardToken)) {
        // Até o fictício recusa número de cartão onde só token cabe.
        throw new GatewayRejectedError('numero_de_cartao_nao_aceito');
      }
      const repeated = again(input.idempotencyKey, true);
      if (repeated) return repeated;
      const id = `mock_card_${randomBytes(6).toString('hex')}`;
      const snapshot = base(id, input, 'cartao');
      payments.set(id, { snapshot });
      byKey.set(input.idempotencyKey, id);
      return {
        gatewayPaymentId: id,
        status: 'pendente',
        redirectUrl: `https://pagamento.ficticio.invalid/${id}`,
        snapshot,
      };
    },

    async getPayment(id: string): Promise<PaymentSnapshot> {
      takeFailure();
      const found = payments.get(id);
      if (!found) throw new GatewayRejectedError('pagamento_inexistente');
      return { ...found.snapshot };
    },

    async verifyNotification({ headers, rawBody }): Promise<NotificationCheck> {
      const header = headers.get('x-mock-signature');
      if (!header) return { valid: false, reason: 'assinatura_ausente' };
      const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
      if (!m) return { valid: false, reason: 'formato_invalido' };
      const ts = Number(m[1]);
      if (Math.abs(clock.now().getTime() / 1000 - ts) > 300) return { valid: false, reason: 'fora_do_prazo' };
      const expected = createHmac('sha256', signingKey).update(`${ts}.${rawBody}`).digest();
      const given = Buffer.from(m[2]!, 'hex');
      if (given.length !== expected.length || !timingSafeEqual(given, expected))
        return { valid: false, reason: 'assinatura_invalida' };
      try {
        const body = JSON.parse(rawBody) as { id?: string; paymentId?: string; type?: string };
        if (!body.id || !body.paymentId || !body.type) return { valid: false, reason: 'formato_invalido' };
        return { valid: true, eventId: body.id, gatewayPaymentId: body.paymentId, type: body.type };
      } catch {
        return { valid: false, reason: 'formato_invalido' };
      }
    },

    simulate: {
      setStatus(id, status) {
        const found = payments.get(id);
        if (!found) throw new Error('pagamento fictício inexistente');
        found.snapshot = {
          ...found.snapshot,
          status,
          paidAt: status === 'aprovado' ? clock.now() : found.snapshot.paidAt,
        };
      },
      failNext(error) {
        nextFailure = error;
      },
      tamper(id, patch) {
        const found = payments.get(id);
        if (!found) throw new Error('pagamento fictício inexistente');
        found.snapshot = { ...found.snapshot, ...patch };
      },
      sign: (rawBody, timestamp = Math.floor(clock.now().getTime() / 1000)) => sign(rawBody, timestamp),
      all: () => [...payments.values()].map(p => ({ ...p.snapshot })),
      get createCalls() {
        return createCalls;
      },
    },
  };
  return gateway;
}
