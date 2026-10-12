import type { DeclineReason, GatewayStatus, PaymentMethod, PaymentSnapshot } from '../../domain/payment';

/**
 * Tradução das respostas do Mercado Pago (API de Orders, `/v1/orders`) para o domínio da PartyX. Fontes:
 * https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/order-status
 * https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/transaction-status
 * https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/get-order/get
 */

export interface MpTransaction {
  id?: string;
  amount?: string | null;
  status?: string;
  status_detail?: string | null;
  date_of_expiration?: string | null;
  payment_method?: {
    id?: string | null;
    type?: string | null;
    qr_code?: string | null;
    qr_code_base64?: string | null;
  } | null;
}

/** Só os campos que a PartyX lê. Tudo opcional: o adaptador nunca confia no formato sem conferir. */
export interface MpOrder {
  id?: string;
  status?: string;
  status_detail?: string | null;
  external_reference?: string | null;
  total_amount?: string | number | null;
  currency?: string | null;
  /** Conta que recebe (a da PartyX). */
  user_id?: string | number | null;
  transactions?: { payments?: MpTransaction[] | null } | null;
}

/** Id de uma order do Mercado Pago (`ORD…`; no ambiente de teste, `ORDTST…`). */
export const ORDER_ID = /^ORD[A-Z0-9]{10,40}$/;

/**
 * Estado da order → estado da PartyX:
 * processed → aprovado; failed → recusado; canceled e expired (inclusive Pix vencido) → expirado; refunded → estornado;
 * charged_back → contestado; created, processing, action_required e in_review → aguardando.
 * Estado desconhecido devolve `null`: quem chama trata como "não confirmado", nunca como aprovado.
 */
export function toGatewayStatus(status: string | undefined): GatewayStatus | null {
  switch (status) {
    case 'processed':
      return 'aprovado';
    case 'failed':
      return 'recusado';
    case 'canceled':
    case 'expired':
      return 'expirado';
    case 'refunded':
      return 'estornado';
    case 'charged_back':
      return 'contestado';
    case 'created':
    case 'processing':
    case 'action_required':
    case 'in_review':
      return 'pendente';
    default:
      return null;
  }
}

/** Categoria da recusa para a mensagem ao comprador, a partir do `status_detail` da transação (tabela da documentação). */
export function declineReasonFor(detail: string | null | undefined): DeclineReason {
  switch (detail) {
    case 'bad_filled_card_data':
    case 'invalid_card_token':
      return 'dados_do_cartao';
    case 'insufficient_amount':
    case 'card_insufficient_amount':
    case 'amount_limit_exceeded':
      return 'saldo_insuficiente';
    case 'rejected_by_issuer':
    case 'required_call_for_authorize':
      return 'nao_autorizado';
    case 'card_disabled':
      return 'cartao_desabilitado';
    case 'high_risk':
      return 'seguranca';
    case 'max_attempts_exceeded':
      return 'limite_de_tentativas';
    case '3ds_challenge_expired':
      return 'autenticacao';
    default:
      return 'outro';
  }
}

/** Centavos inteiros → reais com 2 casas, como texto (formato pedido pela API, sem conta em ponto flutuante). */
export function amountFromCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('valor em centavos inválido');
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/**
 * Reais (como o Mercado Pago devolve, "90.00") → centavos inteiros. Mais de 2 casas, negativo ou ilegível vira `NaN`,
 * que nunca confere com o pedido (a conferência então registra divergência e não aprova).
 */
export function centsFromAmount(value: number | string | null | undefined): number {
  const text = typeof value === 'number' ? String(value) : (value ?? '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return Number.NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}

const CARD_TYPES = new Set(['credit_card', 'debit_card', 'prepaid_card']);

function methodOf(tx: MpTransaction | undefined): PaymentMethod | 'outro' {
  const pm = tx?.payment_method;
  if (pm?.id === 'pix') return 'pix';
  if (pm?.type && CARD_TYPES.has(pm.type)) return 'cartao';
  return 'outro';
}

/** Código de detalhe guardado no pedido: só letras minúsculas, números e sublinhado, até 80 caracteres. */
function safeDetail(detail: string | null | undefined): string | null {
  if (!detail) return null;
  return /^[a-z0-9_]{1,80}$/.test(detail) ? detail : 'formato_desconhecido';
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Order do Mercado Pago → foto do pagamento da PartyX. A conferência com o pedido (valor, moeda, referência, conta, forma) é
 * feita depois, em `checkSnapshotAgainstOrder`; aqui só se traduz, sem decidir nada. A PartyX cria sempre **uma** transação
 * por order: mais de uma é tratada como forma desconhecida (nunca confere).
 */
export function snapshotFrom(o: MpOrder): PaymentSnapshot {
  const mapped = toGatewayStatus(o.status);
  // Estado desconhecido: "não confirmado". Nunca vira aprovado.
  const status: GatewayStatus = mapped ?? 'pendente';
  const txs = o.transactions?.payments ?? [];
  const tx = txs.length === 1 ? txs[0] : undefined;
  const method = methodOf(tx);
  const pm = tx?.payment_method;
  const pixExpiry = parseDate(tx?.date_of_expiration);
  const pix =
    method === 'pix' && status === 'pendente' && pm?.qr_code && pixExpiry
      ? {
          copyPaste: pm.qr_code,
          qrCodeImage:
            pm.qr_code_base64 && /^[A-Za-z0-9+/=]{100,}$/.test(pm.qr_code_base64)
              ? `data:image/png;base64,${pm.qr_code_base64}`
              : null,
          expiresAt: pixExpiry,
        }
      : null;
  return {
    gatewayPaymentId: o.id ?? '',
    status,
    method,
    orderRef: o.external_reference ?? '',
    amountCents: centsFromAmount(o.total_amount),
    currency: o.currency ?? '',
    accountId: o.user_id === null || o.user_id === undefined ? null : String(o.user_id),
    // A order não traz o instante da aprovação: a confirmação usa o relógio do servidor.
    paidAt: null,
    pix,
    statusDetail: mapped === null ? 'estado_desconhecido' : safeDetail(tx?.status_detail ?? o.status_detail),
    declineReason: status === 'recusado' ? declineReasonFor(tx?.status_detail) : null,
  };
}
