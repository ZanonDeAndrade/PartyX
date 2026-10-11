import { and, eq, isNull, sql } from 'drizzle-orm';
import { orders, reservations, users } from '../db/schema';
import { AppError } from '../domain/errors';
import { looksLikeCardNumber, type PaymentMethod } from '../domain/payment';
import { logger } from '../logger';
import { delayUntil, nextCheck } from '../domain/reconcileSchedule';
import { GatewayError, GatewayRejectedError, type CreatedPayment, type PaymentGateway } from '../payments/gateway';
import { enqueueSafely } from '../payments/taskQueue';
import { expireOverdue, type OrdersDeps } from './service';

export interface PaymentDeps extends OrdersDeps {
  gateway: PaymentGateway | undefined;
  /** Endereço público, para a volta do cartão hospedado. */
  publicBaseUrl: string;
}

export type StartPaymentInput = { method: 'pix' } | { method: 'cartao'; cardToken?: string; installments?: number };

/** O que a tela precisa para pagar. Nunca inclui id do gateway, conta nem dados de cartão. */
export interface PaymentView {
  method: PaymentMethod;
  status: 'pendente' | 'aprovado' | 'recusado' | 'expirado' | 'cancelado' | 'estornado' | 'contestado';
  pix: { copyPaste: string; qrCodeImage: string | null; expiresAt: string } | null;
  /** Cartão hospedado: para onde levar o comprador. */
  redirectUrl: string | null;
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

function present(created: Pick<CreatedPayment, 'status' | 'redirectUrl' | 'snapshot'>): PaymentView {
  const { snapshot } = created;
  return {
    method: snapshot.method,
    status: created.status,
    pix: snapshot.pix
      ? {
          copyPaste: snapshot.pix.copyPaste,
          qrCodeImage: snapshot.pix.qrCodeImage,
          expiresAt: snapshot.pix.expiresAt.toISOString(),
        }
      : null,
    redirectUrl: created.redirectUrl,
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

/** Desfaz a escolha da forma de pagamento quando a cobrança não chegou a existir, para o comprador poder tentar de novo ou trocar. */
async function unclaim(deps: PaymentDeps, orderId: string) {
  await deps.db
    .update(orders)
    .set({ paymentMethod: null })
    .where(and(eq(orders.id, orderId), isNull(orders.gatewayPaymentId), eq(orders.status, 'pendente')));
}

/**
 * Inicia o pagamento de um pedido pendente (RF-34). Fluxo:
 * valida → marca a forma escolhida (curta transação) → **chama o gateway fora de qualquer transação** →
 * guarda o id da cobrança. Valor, referência e prazo vêm do pedido no banco, nunca do navegador.
 *
 * Seguro de repetir: a chave de idempotência é `order:<id>:<método>`, então repetir (clique duplo, falha de rede,
 * queda entre a criação e o registro) devolve a mesma cobrança. O retorno do navegador **não** aprova nada:
 * só o servidor, depois de reconsultar o gateway, muda o pedido para pago (Prompt 12).
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
    idempotencyKey: `order:${orderId}:${input.method}`,
  };

  // Prepara a chamada antes de marcar o pedido, para erro de entrada não deixar rastro.
  let call: () => Promise<CreatedPayment>;
  if (input.method === 'pix') {
    // A cobrança vence junto com a reserva, mas nunca além do que o provedor aceita (D-03).
    const seconds = Math.min(remaining, capabilities.pixExpiry.maxSeconds);
    if (seconds < capabilities.pixExpiry.minSeconds) {
      throw new AppError(
        409,
        'reserva_expirada',
        'A reserva está acabando. Volte ao evento e escolha os ingressos de novo.',
      );
    }
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
      if (!input.cardToken)
        throw new AppError(422, 'dados_invalidos', 'Alguns campos precisam de ajuste.', [
          { campo: 'cardToken', mensagem: 'Informe o token do cartão gerado pelo gateway.' },
        ]);
      const cardToken = input.cardToken;
      call = () => gateway.createCard({ ...common, mode: 'token', cardToken, installments });
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
    await unclaim(deps, orderId);
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
    // Rede de segurança contra webhook perdido ou atrasado: verificações só deste pedido, contadas desta cobrança (1, 2, 4 e 8 min e
    // a última no fim da reserva mais a margem). Agenda só a primeira; cada uma agenda a seguinte se o pagamento seguir pendente.
    // Nunca derruba a criação da cobrança (falha vira alerta e a varredura agendada cobre).
    const schedule = deps.config.reconcile;
    const deadline = new Date(reservation.expiresAt.getTime() + schedule.taskMarginSeconds * 1000);
    const first = nextCheck({ attempt: 0, chargedAt: now, deadline, now }, schedule.taskOffsetsSeconds);
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
  return { payment: present(created) };
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
    return present({ status: snapshot.status, redirectUrl: null, snapshot });
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
