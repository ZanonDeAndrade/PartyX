import { and, eq, isNull, sql } from 'drizzle-orm';
import { orders, reservations, users } from '../db/schema';
import { AppError } from '../domain/errors';
import { looksLikeCardNumber, type DeclineReason, type PaymentMethod } from '../domain/payment';
import { logger } from '../logger';
import { delayUntil, nextCheck } from '../domain/reconcileSchedule';
import { GatewayError, GatewayRejectedError, type CreatedPayment, type PaymentGateway } from '../payments/gateway';
import { enqueueSafely } from '../payments/taskQueue';
import { expireOverdue, type OrdersDeps } from './service';

export interface PaymentDeps extends OrdersDeps {
  gateway: PaymentGateway | undefined;
  /** Endereço público, para a volta do cartão hospedado. */
  publicBaseUrl: string;
  /**
   * Conciliação imediata: quando o gateway já responde com um estado final na criação (cartão aprovado ou recusado), o pedido é
   * resolvido na hora, sempre **reconsultando** o gateway (mesmo caminho do webhook). Ausente: o webhook e as tarefas resolvem.
   */
  settle?: (gatewayPaymentId: string) => Promise<void>;
}

export type StartPaymentInput =
  | { method: 'pix' }
  | { method: 'cartao'; cardToken?: string; installments?: number; paymentMethodId?: string; paymentTypeId?: string };

/** O que a tela precisa para pagar. Nunca inclui conta nem dados de cartão. */
export interface PaymentView {
  method: PaymentMethod;
  status: 'pendente' | 'aprovado' | 'recusado' | 'expirado' | 'cancelado' | 'estornado' | 'contestado';
  pix: { copyPaste: string; qrCodeImage: string | null; expiresAt: string } | null;
  /** Cartão hospedado: para onde levar o comprador. */
  redirectUrl: string | null;
  /** Recusa: categoria para o texto amigável. */
  declineReason: DeclineReason | null;
}

/** Como a tela de pagamento deve se montar: forma do cartão, chave pública e se o Pix cabe no prazo da reserva (D-03). */
export interface PaymentOptions {
  provider: string | null;
  cardMode: 'hosted' | 'token' | null;
  publicKey: string | null;
  maxInstallments: number;
  pixAvailable: boolean;
}

/**
 * O Pix só é oferecido se o prazo mínimo do gateway couber na reserva: o QR vence junto com a reserva (D-03). No Mercado Pago o
 * mínimo é 30 minutos; com a reserva de 10 minutos o Pix fica fora até a decisão da PartyX.
 */
export function pixFits(gateway: PaymentGateway | undefined, reservationMinutes: number): boolean {
  return Boolean(gateway && reservationMinutes * 60 >= gateway.capabilities.pixExpiry.minSeconds);
}

export function paymentOptions(gateway: PaymentGateway | undefined, reservationMinutes: number): PaymentOptions {
  return {
    provider: gateway?.capabilities.providerId ?? null,
    cardMode: gateway?.capabilities.cardMode ?? null,
    publicKey: gateway?.capabilities.publicKey ?? null,
    maxInstallments: gateway?.capabilities.maxInstallments ?? 1,
    pixAvailable: pixFits(gateway, reservationMinutes),
  };
}

/** Folga mínima para criar a cobrança: abaixo disso o Pix nasceria praticamente vencido. */
const MIN_REMAINING_SECONDS = 30;

/**
 * Nomes de campo que denunciam dado de cartão no corpo da requisição. O servidor **nunca** recebe número, validade
 * ou CVV: ou o cartão é pago na página do gateway, ou o navegador manda só um token. Se algo assim chegar, é erro do
 * cliente (ou ataque) e a requisição é recusada antes de qualquer outra coisa, sem ecoar o valor.
 */
const CARD_FIELD_NAMES =
  /^(card_?number|number|pan|cvv|cvc|cvv2|security_?code|expir\w*|exp_?(month|year)|holder\w*|card_?holder\w*)$/i;

export function rejectCardData(body: unknown, depth = 0): void {
  const refuse = () => {
    throw new AppError(
      422,
      'dado_de_cartao_nao_aceito',
      'Dados de cartão não devem ser enviados à PartyX. Use o pagamento seguro do gateway.',
    );
  };
  if (depth > 4 || body === null) return;
  if (typeof body === 'string') {
    if (looksLikeCardNumber(body)) refuse();
    return;
  }
  if (Array.isArray(body)) {
    body.forEach(v => rejectCardData(v, depth + 1));
    return;
  }
  if (typeof body === 'object') {
    for (const [key, value] of Object.entries(body)) {
      if (CARD_FIELD_NAMES.test(key)) refuse();
      rejectCardData(value, depth + 1);
    }
  }
}

function present(
  created: Pick<CreatedPayment, 'status' | 'redirectUrl' | 'snapshot'>,
  orderMethod: PaymentMethod,
): PaymentView {
  const { snapshot } = created;
  return {
    method: snapshot.method === 'outro' ? orderMethod : snapshot.method,
    status: created.status,
    pix: snapshot.pix
      ? {
          copyPaste: snapshot.pix.copyPaste,
          qrCodeImage: snapshot.pix.qrCodeImage,
          expiresAt: snapshot.pix.expiresAt.toISOString(),
        }
      : null,
    redirectUrl: created.redirectUrl,
    declineReason: created.status === 'recusado' ? (snapshot.declineReason ?? 'outro') : null,
  };
}

async function loadOwn(deps: PaymentDeps, userId: string, orderId: string) {
  const [row] = await deps.db
    .select({ order: orders, name: users.name, email: users.email, cpf: users.cpf })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  if (!row) throw new AppError(404, 'nao_encontrado', 'Pedido não encontrado.');
  return row;
}

/**
 * Desfaz a escolha da forma de pagamento quando a cobrança não chegou a existir, para o comprador poder tentar de novo ou trocar.
 * `newAttempt`: o gateway recusou criar a cobrança, então a próxima tentativa leva chave de idempotência nova. Em falha de rede a
 * cobrança pode ter sido criada: a tentativa (e a chave) continua a mesma, e repetir devolve a mesma cobrança.
 */
async function unclaim(deps: PaymentDeps, orderId: string, newAttempt = false) {
  await deps.db
    .update(orders)
    .set({
      paymentMethod: null,
      ...(newAttempt ? { paymentAttempt: sql`${orders.paymentAttempt} + 1` } : {}),
    })
    .where(and(eq(orders.id, orderId), isNull(orders.gatewayPaymentId), eq(orders.status, 'pendente')));
}

/** Chave de idempotência da tentativa de cobrança: estável por pedido, forma e tentativa (a primeira mantém o formato antigo). */
export function chargeKey(orderId: string, method: PaymentMethod, attempt: number): string {
  return attempt > 0 ? `order:${orderId}:${method}:${attempt}` : `order:${orderId}:${method}`;
}

/**
 * Inicia o pagamento de um pedido pendente (RF-34). Fluxo:
 * valida → marca a forma escolhida (curta transação) → **chama o gateway fora de qualquer transação** →
 * guarda o id da cobrança. Valor, referência e prazo vêm do pedido no banco, nunca do navegador.
 *
 * Seguro de repetir: a chave de idempotência é `order:<id>:<método>[:<tentativa>]`, então repetir (clique duplo, falha de rede,
 * queda entre a criação e o registro) devolve a mesma cobrança; só uma recusa na criação abre tentativa nova (chave nova).
 * O retorno do navegador **não** aprova nada: só o servidor, depois de reconsultar o gateway, muda o pedido para pago (Prompt 12).
 */
export async function startPayment(
  deps: PaymentDeps,
  userId: string,
  orderId: string,
  input: StartPaymentInput,
): Promise<{ payment: PaymentView }> {
  const gateway = deps.gateway;
  if (!gateway) {
    throw new AppError(503, 'pagamento_indisponivel', 'O pagamento ainda não está disponível neste ambiente.');
  }
  const now = deps.clock.now();
  await loadOwn(deps, userId, orderId);
  await expireOverdue(deps, { orderId });
  const { order, name, email, cpf } = await loadOwn(deps, userId, orderId);

  if (order.status !== 'pendente') {
    throw new AppError(409, 'pedido_nao_pendente', 'Este pedido não está mais aguardando pagamento.', {
      status: order.status,
    });
  }
  if (order.paymentMethod && order.paymentMethod !== input.method) {
    // Trocar de forma exigiria cancelar a cobrança no gateway; fica para quando o gateway for escolhido (D-36).
    throw new AppError(
      409,
      'metodo_ja_escolhido',
      'A forma de pagamento deste pedido já foi escolhida. Para trocar, comece um novo pedido.',
    );
  }
  const [reservation] = await deps.db
    .select({ expiresAt: reservations.expiresAt, status: reservations.status })
    .from(reservations)
    .where(eq(reservations.orderId, orderId))
    .limit(1);
  if (!reservation || reservation.status !== 'ativa') {
    throw new AppError(
      409,
      'reserva_expirada',
      'A reserva deste pedido expirou. Volte ao evento e escolha os ingressos de novo.',
    );
  }
  const remaining = Math.floor((reservation.expiresAt.getTime() - now.getTime()) / 1000);
  if (remaining < MIN_REMAINING_SECONDS) {
    throw new AppError(
      409,
      'reserva_expirada',
      'A reserva está acabando. Volte ao evento e escolha os ingressos de novo.',
    );
  }

  const { capabilities } = gateway;
  const common = {
    orderId,
    amountCents: order.totalCents,
    payer: { name, email, cpf },
    description: `Ingressos PartyX, pedido ${order.number}`,
    idempotencyKey: chargeKey(orderId, input.method, order.paymentAttempt),
  };

  // Prepara a chamada antes de marcar o pedido, para erro de entrada não deixar rastro.
  let call: () => Promise<CreatedPayment>;
  if (input.method === 'pix') {
    if (!pixFits(gateway, deps.config.RESERVATION_MINUTES)) {
      throw new AppError(409, 'pix_indisponivel', 'O Pix não está disponível no momento. Pague com cartão.');
    }
    // A cobrança vence junto com a reserva (D-03), dentro dos limites do provedor. Se faltar menos que o mínimo do provedor (no
    // Mercado Pago, 30 minutos, com a reserva também de 30), o Pix vence no mínimo dele, um pouco depois da reserva: pagamento
    // nesse intervalo segue a regra da aprovação tardia (emite se ainda houver estoque; senão, "pago sem estoque").
    const floor = capabilities.pixExpiry.minSeconds + (capabilities.pixExpiry.minSeconds >= 600 ? 60 : 0);
    const seconds = Math.min(Math.max(remaining, floor), capabilities.pixExpiry.maxSeconds);
    const expiresAt = new Date(now.getTime() + seconds * 1000);
    call = () => gateway.createPix({ ...common, expiresAt });
  } else {
    const installments = input.installments ?? 1;
    if (!Number.isInteger(installments) || installments < 1 || installments > capabilities.maxInstallments) {
      throw new AppError(422, 'parcelamento_indisponivel', 'Parcelamento indisponível. O pagamento é à vista.', [
        { campo: 'installments', mensagem: 'Parcelamento indisponível.' },
      ]);
    }
    if (capabilities.cardMode === 'token') {
      if (!input.cardToken || !input.paymentMethodId || !input.paymentTypeId)
        throw new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', [
          { campo: 'cardToken', mensagem: 'Informe o token do cartão gerado pelo gateway.' },
        ]);
      const { cardToken, paymentMethodId, paymentTypeId } = input;
      call = () =>
        gateway.createCard({ ...common, mode: 'token', cardToken, installments, paymentMethodId, paymentTypeId });
    } else {
      call = () =>
        gateway.createCard({
          ...common,
          mode: 'hosted',
          returnUrl: `${deps.publicBaseUrl.replace(/\/$/, '')}/pedido/${orderId}`,
        });
    }
  }

  // Escolha da forma de pagamento: só se ainda pendente e sem outra forma. Protege contra duas formas ao mesmo tempo.
  const claimed = await deps.db
    .update(orders)
    .set({ paymentMethod: input.method, updatedAt: now })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.status, 'pendente'),
        sql`(${orders.paymentMethod} is null or ${orders.paymentMethod} = ${input.method})`,
      ),
    )
    .returning({ id: orders.id });
  if (claimed.length === 0) {
    throw new AppError(409, 'pedido_nao_pendente', 'Este pedido não está mais aguardando pagamento.');
  }

  let created: CreatedPayment;
  try {
    created = await call(); // chamada externa: fora de qualquer transação
  } catch (error) {
    await unclaim(deps, orderId, error instanceof GatewayRejectedError);
    if (error instanceof GatewayRejectedError) {
      logger.warn('gateway recusou a criação da cobrança', {
        orderId,
        provider: capabilities.providerId,
        reason: error.reason,
      });
      throw new AppError(
        422,
        'pagamento_nao_criado',
        'Não foi possível iniciar o pagamento. Confira os dados e tente de novo.',
      );
    }
    logger.error('falha ao falar com o gateway', {
      orderId,
      provider: capabilities.providerId,
      error: error instanceof GatewayError ? error.name : 'desconhecido',
    });
    throw new AppError(
      503,
      'gateway_indisponivel',
      'O pagamento está instável no momento. Tente novamente em instantes.',
    );
  }

  // A cobrança precisa referir este pedido e este valor; resposta estranha do gateway nunca vira vínculo.
  if (created.snapshot.orderRef !== orderId || created.snapshot.amountCents !== order.totalCents) {
    logger.error('cobrança do gateway não confere com o pedido', { orderId, provider: capabilities.providerId });
    await unclaim(deps, orderId);
    throw new AppError(
      503,
      'gateway_indisponivel',
      'O pagamento está instável no momento. Tente novamente em instantes.',
    );
  }

  // Guarda o id mesmo se o pedido expirou no meio do caminho: uma aprovação tardia precisa achar o pedido (Prompt 12).
  const saved = await deps.db
    .update(orders)
    .set({ gatewayPaymentId: created.gatewayPaymentId, updatedAt: now })
    .where(and(eq(orders.id, orderId), isNull(orders.gatewayPaymentId)))
    .returning({ id: orders.id });
  if (saved.length > 0) {
    // Rede de segurança contra webhook perdido ou atrasado: verificações só deste pedido, contadas desta cobrança (1, 2, 4 e 8 min,
    // no fim da reserva + margem e as tardias até 24 h). Agenda só a primeira; cada uma agenda a seguinte se o pagamento seguir sem
    // decisão. Nunca derruba a criação da cobrança (falha vira alerta e a rotina diária cobre).
    const schedule = deps.config.reconcile;
    const deadline = new Date(reservation.expiresAt.getTime() + schedule.taskMarginSeconds * 1000);
    const first = nextCheck(
      { attempt: 0, chargedAt: now, deadline, now },
      { early: schedule.taskOffsetsSeconds, late: schedule.lateOffsetsSeconds },
    );
    if (first)
      await enqueueSafely(deps.taskQueue, {
        orderId,
        attempt: first.attempt,
        delaySeconds: delayUntil(first.at, now),
        chargedAt: now.toISOString(),
      });
  } else {
    const [current] = await deps.db
      .select({ gatewayPaymentId: orders.gatewayPaymentId })
      .from(orders)
      .where(eq(orders.id, orderId));
    if (current?.gatewayPaymentId !== created.gatewayPaymentId) {
      throw new AppError(409, 'pedido_nao_pendente', 'Este pedido já tem um pagamento em andamento.');
    }
  }
  // Estado final já na criação (cartão aprovado ou recusado): resolve o pedido agora, reconsultando o gateway. Falha aqui não
  // desfaz a cobrança: o webhook e as verificações agendadas resolvem depois.
  if (created.status !== 'pendente' && deps.settle) {
    try {
      await deps.settle(created.gatewayPaymentId);
    } catch (error) {
      logger.warn('conciliação imediata adiada', {
        orderId,
        provider: capabilities.providerId,
        error: error instanceof GatewayError ? error.name : 'desconhecido',
      });
    }
  }
  return { payment: present(created, input.method) };
}

/** Situação do pagamento do pedido, consultada no gateway (mostra o Pix de novo ao recarregar a página). */
export async function getPayment(deps: PaymentDeps, userId: string, orderId: string): Promise<PaymentView | null> {
  const { order } = await loadOwn(deps, userId, orderId);
  if (!order.gatewayPaymentId || !order.paymentMethod) return null;
  if (!deps.gateway)
    throw new AppError(503, 'pagamento_indisponivel', 'O pagamento ainda não está disponível neste ambiente.');
  try {
    const snapshot = await deps.gateway.getPayment(order.gatewayPaymentId);
    if (snapshot.orderRef !== order.id) {
      logger.error('consulta ao gateway devolveu outro pedido', { orderId });
      throw new AppError(
        503,
        'gateway_indisponivel',
        'O pagamento está instável no momento. Tente novamente em instantes.',
      );
    }
    return present({ status: snapshot.status, redirectUrl: null, snapshot }, order.paymentMethod);
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('falha ao consultar o gateway', {
      orderId,
      error: error instanceof GatewayError ? error.name : 'desconhecido',
    });
    throw new AppError(
      503,
      'gateway_indisponivel',
      'O pagamento está instável no momento. Tente novamente em instantes.',
    );
  }
}
