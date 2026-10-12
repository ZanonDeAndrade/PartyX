/**
 * Pagamento no domínio da PartyX, sem nenhuma palavra de SDK de gateway. Cada adaptador traduz a resposta do seu
 * provedor para estes tipos; o resto do sistema só conhece isto (RF-34, seção 9.1: "módulo de pagamento isolado").
 */

export type PaymentMethod = 'pix' | 'cartao';

/**
 * Estado do pagamento visto pela PartyX, já normalizado:
 * - `pendente`: criado, aguardando o comprador.
 * - `aprovado`: dinheiro confirmado pelo gateway.
 * - `recusado`: cartão recusado ou pagamento negado.
 * - `expirado`: prazo do Pix passou sem pagamento.
 * - `cancelado`: cancelado antes de pagar.
 * - `estornado`: devolvido ao comprador (estorno ou reembolso).
 * - `contestado`: chargeback aberto.
 */
export type GatewayStatus =
  'pendente' | 'aprovado' | 'recusado' | 'expirado' | 'cancelado' | 'estornado' | 'contestado';

/** O que a PartyX faz com cada estado. A decisão final é sempre do servidor, depois de reconsultar o gateway (Prompt 12). */
export type PaymentIntent =
  | 'aguardar'
  | 'confirmar' // aprovar o pedido e emitir ingressos (com a regra de estoque da confirmação tardia)
  | 'recusar' // pedido vira nao_concluido, estoque volta
  | 'expirar' // pedido expira, estoque volta
  | 'estornar' // cancela os ingressos; pedido estornado
  | 'contestar'; // cancela os ingressos; pedido contestado

const INTENT: Record<GatewayStatus, PaymentIntent> = {
  pendente: 'aguardar',
  aprovado: 'confirmar',
  recusado: 'recusar',
  expirado: 'expirar',
  cancelado: 'expirar',
  estornado: 'estornar',
  contestado: 'contestar',
};

export const intentFor = (status: GatewayStatus): PaymentIntent => INTENT[status];

/**
 * Motivo de uma recusa, já traduzido do código do gateway para uma categoria da PartyX. A tela mostra um texto amigável
 * para cada uma; o código original do gateway fica guardado no pedido para o atendimento (`gateway_status_detail`).
 */
export type DeclineReason =
  | 'dados_do_cartao'
  | 'saldo_insuficiente'
  | 'nao_autorizado'
  | 'cartao_desabilitado'
  | 'pagamento_duplicado'
  | 'seguranca'
  | 'limite_de_tentativas'
  | 'autenticacao'
  | 'outro';

export const DECLINE_REASONS: readonly DeclineReason[] = [
  'dados_do_cartao',
  'saldo_insuficiente',
  'nao_autorizado',
  'cartao_desabilitado',
  'pagamento_duplicado',
  'seguranca',
  'limite_de_tentativas',
  'autenticacao',
  'outro',
];

/** Foto de um pagamento no gateway, no formato da PartyX. */
export interface PaymentSnapshot {
  gatewayPaymentId: string;
  status: GatewayStatus;
  /** `outro`: forma que a PartyX não oferece (ex.: saldo em conta). Nunca confere com o pedido. */
  method: PaymentMethod | 'outro';
  /** Nosso identificador do pedido, devolvido pelo gateway (referência externa). */
  orderRef: string;
  amountCents: number;
  currency: string;
  /** Conta do gateway que recebeu. Precisa ser a da PartyX (a CONTRATADA nunca recebe repasse). */
  accountId: string | null;
  paidAt: Date | null;
  /** Só enquanto Pix pendente: para mostrar o código de novo ao recarregar a página. */
  pix: PixData | null;
  /** Código de detalhe do gateway (ex.: motivo da recusa), como veio. Nunca contém dado do comprador. */
  statusDetail: string | null;
  /** Recusa: categoria para a mensagem ao comprador. Nulo nos demais estados. */
  declineReason: DeclineReason | null;
}

export interface PixData {
  /** Pix copia e cola (EMV). */
  copyPaste: string;
  /** Imagem do QR já pronta (data URL), se o gateway fornecer. Senão a tela gera a partir do copia e cola. */
  qrCodeImage: string | null;
  expiresAt: Date;
}

/** Valor em centavos: inteiro positivo e dentro de um teto sensato. Nunca ponto flutuante. */
export const MAX_CHARGE_CENTS = 100_000_000; // R$ 1.000.000,00
export function isValidAmount(cents: unknown): cents is number {
  return typeof cents === 'number' && Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_CHARGE_CENTS;
}

export interface ChargeCheck {
  ok: boolean;
  /** Campos que não conferem, para o registro de auditoria. */
  mismatches: ('pedido' | 'valor' | 'moeda' | 'conta' | 'metodo')[];
}

/**
 * Antes de aprovar um pedido, a foto reconsultada no gateway precisa bater com o pedido: referência, valor, moeda,
 * conta da PartyX e forma de pagamento (CA-P1 a CA-P5, Prompt 12). Função pura, testada aqui; usada na confirmação.
 */
export function checkSnapshotAgainstOrder(
  snapshot: Pick<PaymentSnapshot, 'orderRef' | 'amountCents' | 'currency' | 'accountId' | 'method'>,
  order: { id: string; totalCents: number; paymentMethod: PaymentMethod | null },
  expectedAccountId: string | null,
): ChargeCheck {
  const mismatches: ChargeCheck['mismatches'] = [];
  if (snapshot.orderRef !== order.id) mismatches.push('pedido');
  if (snapshot.amountCents !== order.totalCents) mismatches.push('valor');
  if (snapshot.currency !== 'BRL') mismatches.push('moeda');
  // Sem conta esperada configurada, a conferência de conta não pode ser feita: falha em vez de aprovar às cegas.
  if (!expectedAccountId || snapshot.accountId !== expectedAccountId) mismatches.push('conta');
  if (order.paymentMethod && snapshot.method !== order.paymentMethod) mismatches.push('metodo');
  return { ok: mismatches.length === 0, mismatches };
}

/** Algoritmo de Luhn: usado só para **reconhecer** número de cartão colado onde só um token cabe. */
function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Verdadeiro se o texto parece um número de cartão (13 a 19 dígitos, com ou sem separador, que passa no Luhn). */
export function looksLikeCardNumber(value: string): boolean {
  const digits = value.replace(/[\s.-]/g, '');
  return /^\d{13,19}$/.test(digits) && luhn(digits);
}
