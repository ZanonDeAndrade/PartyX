import { pgEnum } from 'drizzle-orm/pg-core';

// Valores em português sem acento, como na documentação (seção 6.1). Nomes de tabelas e colunas em inglês.

export const userRole = pgEnum('user_role', ['cliente', 'validador', 'administrador']);
export const eventStatus = pgEnum('event_status', ['rascunho', 'publicado', 'encerrado']);

/**
 * A documentação lista pendente, pago, expirado, cancelado e estornado. Os demais vêm de requisitos:
 * `nao_concluido` (CA-P2, cartão recusado), `contestado` (chargeback, seção 10.1) e
 * `pago_sem_estoque` (pagamento aprovado depois da expiração, sem estoque, seção 10.1).
 */
export const orderStatus = pgEnum('order_status', [
  'pendente',
  'pago',
  'expirado',
  'nao_concluido',
  'cancelado',
  'estornado',
  'contestado',
  'pago_sem_estoque',
]);
export const paymentMethod = pgEnum('payment_method', ['pix', 'cartao']);
export const reservationStatus = pgEnum('reservation_status', ['ativa', 'convertida', 'expirada', 'liberada']);
export const ticketStatus = pgEnum('ticket_status', ['valido', 'utilizado', 'cancelado']);

/** `cancelado` (RF-48) e `outro_evento` (RF-54) não constam na tabela da documentação. */
export const checkinResult = pgEnum('checkin_result', [
  'valido',
  'ja_utilizado',
  'invalido',
  'cancelado',
  'outro_evento',
]);
export const checkinMethod = pgEnum('checkin_method', ['camera', 'manual']);
/** `pagamento_sem_estoque`: aviso aos administradores ativos de um pagamento aprovado sem ingresso disponível (D-13, provisório). */
export const emailTemplate = pgEnum('email_template', [
  'cadastro',
  'recuperacao_senha',
  'compra_confirmada',
  'pagamento_sem_estoque',
]);
export const emailStatus = pgEnum('email_status', ['pendente', 'enviado', 'falhou']);
