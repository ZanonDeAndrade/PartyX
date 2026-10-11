/**
 * Estados do pedido e transições permitidas. É o contrato que a confirmação de pagamento (Prompt 12) vai seguir;
 * aqui só a reserva usa `pendente → expirado`. Nada neste prompt marca pedido como pago.
 *
 *   pendente ──pagamento aprovado────────────▶ pago
 *   pendente ──reserva venceu / abandonado───▶ expirado        (reserva: expirada ou liberada)
 *   pendente ──cartão recusado───────────────▶ nao_concluido
 *   nao_concluido ──nova tentativa na reserva▶ pendente
 *   nao_concluido ──reserva venceu───────────▶ expirado
 *   nao_concluido ──aprovado depois──────────▶ pago | pago_sem_estoque (mesma regra de estoque)
 *   expirado ──aprovado depois, COM estoque──▶ pago             (confirmação tardia; emite)
 *   expirado ──aprovado depois, SEM estoque──▶ pago_sem_estoque (não emite; cliente estorna no gateway)
 *   pago ──estorno / chargeback / cancelado──▶ estornado | contestado | cancelado
 *   contestado ──decidido─────────────────────▶ estornado | pago
 *   pago_sem_estoque ──estorno no gateway─────▶ estornado
 */
export type OrderStatus =
  'pendente' | 'pago' | 'expirado' | 'nao_concluido' | 'cancelado' | 'estornado' | 'contestado' | 'pago_sem_estoque';

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pendente: ['pago', 'pago_sem_estoque', 'expirado', 'nao_concluido'],
  // `pago`/`pago_sem_estoque`: cartão recusado e depois aprovado pelo mesmo gateway (a reconsulta é a verdade).
  nao_concluido: ['pendente', 'expirado', 'pago', 'pago_sem_estoque'],
  expirado: ['pago', 'pago_sem_estoque'],
  pago: ['estornado', 'contestado', 'cancelado'],
  contestado: ['estornado', 'pago'],
  pago_sem_estoque: ['estornado'],
  cancelado: [],
  estornado: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => ORDER_TRANSITIONS[from].includes(to);

export type ReservationStatus = 'ativa' | 'convertida' | 'expirada' | 'liberada';

export type LateOutcome =
  /** Pedido ainda pendente com reserva ativa: confirmação normal. */
  | 'confirmar'
  /** Reserva já tinha vencido, mas ainda há estoque: emitir. */
  | 'emitir_tardio'
  /** Reserva vencida e sem estoque: não emitir, marcar `pago_sem_estoque`, avisar o administrador. */
  | 'sem_estoque'
  /** Já pago ou em estado final: a notificação é repetida, não faz nada (idempotência). */
  | 'ignorar';

/**
 * Decide o que fazer quando o gateway informa pagamento aprovado. `availableNow` é o estoque do tipo
 * (capacidade menos vendidos menos reservas válidas de **outros** pedidos) lido com a linha trancada.
 */
export function approvalOutcome(input: {
  orderStatus: OrderStatus;
  reservationStatus: ReservationStatus | null;
  reservationValid: boolean;
  availableNow: number;
  needed: number;
}): LateOutcome {
  const { orderStatus } = input;
  if (
    orderStatus === 'pago' ||
    orderStatus === 'pago_sem_estoque' ||
    orderStatus === 'estornado' ||
    orderStatus === 'contestado' ||
    orderStatus === 'cancelado'
  ) {
    return 'ignorar';
  }
  if (orderStatus === 'pendente' && input.reservationStatus === 'ativa' && input.reservationValid) return 'confirmar';
  // pendente com reserva vencida, expirado ou nao_concluido: depende do estoque.
  return input.availableNow >= input.needed ? 'emitir_tardio' : 'sem_estoque';
}
