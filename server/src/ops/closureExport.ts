import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { toCsv, safeFilename, type Cell } from '../exports/csv';

/**
 * Exportação de encerramento (Anexo II, item 5): CSV dos dados da PartyX, entregue **uma vez** e disponível por 30 dias.
 * Colunas listadas uma a uma, de propósito: coluna nova do banco só sai daqui se alguém a acrescentar. **Nunca** saem hash de
 * senha, código secreto e conteúdo do QR dos ingressos, sessões, tokens, segredos nem o corpo de eventos do gateway.
 * Não inclui código-fonte nem esquema (Cl. 9.4). A exclusão posterior respeita a retenção e a rotação dos backups.
 */
interface Spec {
  file: string;
  table: string;
  columns: { sql: string; header: string; kind?: 'text' | 'int' }[];
  orderBy: string;
}
const c = (name: string, header: string, kind: 'text' | 'int' = 'text') => ({ sql: name, header, kind });

export const CLOSURE_SPECS: Spec[] = [
  {
    file: 'eventos',
    table: 'events',
    orderBy: 'created_at, id',
    columns: [
      c('slug', 'Endereço'),
      c('name', 'Evento'),
      c('starts_at::text', 'Início'),
      c('venue', 'Local'),
      c('address', 'Endereço do local'),
      c('description', 'Descrição'),
      c('age_rating', 'Classificação'),
      c('allows_minors::text', 'Permite menores de 16 e 17'),
      c('ends_at::text', 'Fim'),
      c('status::text', 'Situação'),
      c('created_at::text', 'Criado em'),
    ],
  },
  {
    file: 'tipos-de-ingresso',
    table: 'ticket_types',
    orderBy: 'created_at, id',
    columns: [
      c('name', 'Tipo'),
      c('event_id::text', 'Evento (código)'),
      c('price_cents', 'Preço (centavos)', 'int'),
      c('quantity_total', 'Capacidade', 'int'),
      c('quantity_sold', 'Vendidos', 'int'),
      c('sales_start_at::text', 'Início das vendas'),
      c('sales_end_at::text', 'Fim das vendas'),
    ],
  },
  {
    file: 'promoters',
    table: 'promoters',
    orderBy: 'created_at, id',
    columns: [
      c('name', 'Promoter'),
      c('coupon_code', 'Código'),
      c('phone', 'Telefone'),
      c('is_active::text', 'Ativo'),
      c('created_at::text', 'Criado em'),
    ],
  },
  {
    file: 'usuarios',
    table: 'users',
    orderBy: 'created_at, id',
    columns: [
      c('id::text', 'Código do usuário'),
      c('name', 'Nome'),
      c('email', 'E-mail'),
      c('cpf', 'CPF'),
      c('birth_date::text', 'Data de nascimento'),
      c('phone', 'Telefone'),
      c('role::text', 'Perfil'),
      c('is_active::text', 'Ativo'),
      c('created_at::text', 'Criado em'),
      c('last_login_at::text', 'Último acesso'),
      c('anonymized_at::text', 'Anonimizado em'),
    ],
  },
  {
    file: 'aceites',
    table: 'consents',
    orderBy: 'accepted_at, id',
    columns: [
      c('user_id::text', 'Código do usuário'),
      c('terms_version', 'Versão dos Termos'),
      c('privacy_version', 'Versão da Privacidade'),
      c('accepted_at::text', 'Aceito em'),
      c('ip::text', 'IP'),
    ],
  },
  {
    file: 'aceites-termo-de-menor',
    table: 'minor_term_acceptances',
    orderBy: 'accepted_at, id',
    columns: [
      c('user_id::text', 'Código do usuário'),
      c('order_id::text', 'Pedido (código)'),
      c('term_version', 'Versão do termo'),
      c('age_at_event', 'Idade na data do evento', 'int'),
      c('accepted_at::text', 'Aceito em'),
      c('ip::text', 'IP'),
    ],
  },
  {
    file: 'aceites-politica-de-cancelamento',
    table: 'cancellation_acceptances',
    orderBy: 'accepted_at, id',
    columns: [
      c('user_id::text', 'Código do usuário'),
      c('order_id::text', 'Pedido (código)'),
      c('policy_version', 'Versão da Política'),
      c('accepted_at::text', 'Aceito em'),
      c('ip::text', 'IP'),
    ],
  },
  {
    file: 'transferencias-de-ingresso',
    table: 'ticket_transfers',
    orderBy: 'created_at, id',
    columns: [
      c('ticket_id::text', 'Ingresso (código interno)'),
      c('event_id::text', 'Evento (código)'),
      c('from_user_id::text', 'Conta de origem (código)'),
      c('to_user_id::text', 'Conta de destino (código)'),
      c('actor_id::text', 'Feita por (código)'),
      c('reverts_id::text', 'Desfaz a transferência (código)'),
      c('reason', 'Motivo do desfazer'),
      c('old_short_code', 'Código antigo'),
      c('new_short_code', 'Código novo'),
      c('created_at::text', 'Feita em'),
    ],
  },
  {
    file: 'aceites-termo-de-menor-na-transferencia',
    table: 'ticket_minor_acceptances',
    orderBy: 'accepted_at, id',
    columns: [
      c('user_id::text', 'Código do usuário'),
      c('ticket_transfer_id::text', 'Transferência (código)'),
      c('term_version', 'Versão do termo'),
      c('age_at_event', 'Idade na data do evento', 'int'),
      c('accepted_at::text', 'Aceito em'),
      c('ip::text', 'IP'),
    ],
  },
  {
    file: 'pedidos',
    table: 'orders',
    orderBy: 'number',
    columns: [
      c('number', 'Número', 'int'),
      c('user_id::text', 'Código do usuário'),
      c('event_id::text', 'Evento (código)'),
      c('promoter_id::text', 'Promoter (código)'),
      c('total_cents', 'Total (centavos)', 'int'),
      c('status::text', 'Situação'),
      c('payment_method::text', 'Forma de pagamento'),
      c('buyer_minor::text', 'Comprador menor na data do evento'),
      c('paid_at::text', 'Aprovado em (original)'),
      c('created_at::text', 'Criado em'),
    ],
  },
  {
    file: 'itens-dos-pedidos',
    table: 'order_items',
    orderBy: 'order_id, id',
    columns: [
      c('order_id::text', 'Pedido (código)'),
      c('ticket_type_id::text', 'Tipo (código)'),
      c('quantity', 'Quantidade', 'int'),
      c('unit_price_cents', 'Preço unitário (centavos)', 'int'),
    ],
  },
  {
    file: 'ingressos',
    table: 'tickets',
    orderBy: 'issued_at, id',
    columns: [
      c('short_code', 'Código do ingresso'),
      c('order_id::text', 'Pedido (código)'),
      c('ticket_type_id::text', 'Tipo (código)'),
      c('event_id::text', 'Evento (código)'),
      c('holder_name', 'Titular'),
      c('holder_user_id::text', 'Conta do titular (código)'),
      c('holder_minor::text', 'Titular menor na data do evento'),
      c('status::text', 'Situação'),
      c('issued_at::text', 'Emitido em'),
      c('used_at::text', 'Usado em'),
      c('cancelled_at::text', 'Cancelado em'),
      c('cancel_reason', 'Motivo do cancelamento'),
    ],
  },
  {
    file: 'entradas-na-portaria',
    table: 'checkins',
    orderBy: 'created_at, id',
    columns: [
      c('ticket_id::text', 'Ingresso (código interno)'),
      c('event_id::text', 'Evento (código)'),
      c('validator_id::text', 'Validador (código)'),
      c('result::text', 'Resultado'),
      c('method::text', 'Método'),
      c('minor_authorization_received::text', 'Autorização de menor recebida'),
      c('created_at::text', 'Momento'),
    ],
  },
  {
    file: 'trilha-de-auditoria',
    table: 'audit_log',
    orderBy: 'created_at, id',
    columns: [
      c('created_at::text', 'Momento'),
      c('actor_id::text', 'Autor (código)'),
      c('action', 'Ação'),
      c('entity', 'Entidade'),
      c('entity_id::text', 'Entidade (código)'),
      c('reason', 'Motivo'),
    ],
  },
];

export interface ClosureFile {
  name: string;
  rows: number;
  content: string;
}

export async function buildClosureExport(db: Db): Promise<ClosureFile[]> {
  const files: ClosureFile[] = [];
  for (const spec of CLOSURE_SPECS) {
    const cols = spec.columns.map((x, i) => `${x.sql} as c${i}`).join(', ');
    const res = await db.execute(sql.raw(`select ${cols} from ${spec.table} order by ${spec.orderBy}`));
    const rows: Cell[][] = res.rows.map(r =>
      spec.columns.map((x, i) => {
        const v = (r as Record<string, unknown>)[`c${i}`];
        if (v === null || v === undefined) return null;
        return x.kind === 'int' ? { n: Number(v) } : String(v);
      }),
    );
    files.push({
      name: `${safeFilename(spec.file)}.csv`,
      rows: rows.length,
      content: toCsv(
        spec.columns.map(x => x.header),
        rows,
      ),
    });
  }
  return files;
}

export const README_TEXT = `Exportação de encerramento do PartyX\r\n\r\nArquivos CSV em UTF-8 com BOM, separador ponto e vírgula, abrem no Excel com acentos.\r\nDinheiro em centavos inteiros. Datas em UTC (ISO 8601).\r\nNão contêm senhas, códigos secretos de ingresso, sessões, segredos nem o corpo de notificações do gateway.\r\nContêm dados pessoais (nome, e-mail, CPF, telefone): guarde com cuidado. A PartyX é a controladora.\r\nDisponível por 30 dias após o encerramento; depois os dados são excluídos, respeitando a rotação dos backups e eventual obrigação legal de retenção.\r\n`;
