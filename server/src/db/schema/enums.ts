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
  // Transferência de ingresso (D-87, 0016): para quem transferiu, para quem recebeu e, no desfazer pelo administrador, para os dois.
  'transferencia_enviada',
  'transferencia_recebida',
  'transferencia_desfeita',
]);
export const emailStatus = pgEnum('email_status', ['pendente', 'enviado', 'falhou']);

/** Lotes por tipo de ingresso (0013, 15/10/2026): só um à venda por vez em cada tipo; o encerrado não volta. */
export const lotStatus = pgEnum('lot_status', ['aguardando', 'a_venda', 'encerrado']);
/** Por que o lote encerrou: esgotou (com próximo lote), passou a data de fim, ou virada manual no painel. */
export const lotCloseReason = pgEnum('lot_close_reason', ['esgotado', 'data', 'manual']);
/** O que fazer com as unidades que sobram na virada automática: passam para o próximo lote ou são descartadas. */
export const lotLeftover = pgEnum('lot_leftover', ['passar', 'descartar']);

/** Desconto do promoter (D-91, 0018): nenhum, porcentagem (centésimos de ponto percentual) ou valor fixo (centavos) por ingresso. */
export const promoterDiscountKind = pgEnum('promoter_discount_kind', ['nenhum', 'percentual', 'fixo']);
/** Onde o desconto do promoter vale: em todos os eventos ou só nos escolhidos (`promoter_discount_events`). */
export const promoterDiscountScope = pgEnum('promoter_discount_scope', ['todos', 'eventos']);
