/** Cliente da API da vitrine e da compra. Tipos espelham `server/src/vitrine/service.ts` e `server/src/orders/`. */
import { clockOffsetMs } from './eventCountdown';

export type SaleKind = 'open' | 'soon' | 'out' | 'held' | 'closed' | 'ended';
export type TypeState = 'a_venda' | 'em_breve' | 'encerrada' | 'esgotado' | 'reservado' | 'indisponivel';

export interface EventCard {
  slug: string;
  name: string;
  startsAt: string;
  venue: string;
  ageRating: string;
  bannerUrl: string | null;
  /** Versões do banner por largura (`srcset`); nula em banners antigos. */
  bannerSrcSet?: string | null;
  isFeatured: boolean;
  sale: { kind: SaleKind; label: string; minPriceCents: number | null; startsAt: string | null };
  /** Cor de destaque (`#RRGGBB`, 0014); nula: o roxo da PartyX. Na vitrine, só o bloco da data; na página, o destaque inteiro. */
  accentColor?: string | null;
}

export interface TicketTypeView {
  id: string;
  name: string;
  /** Preço do lote à venda; nulo quando nenhum lote está à venda (o do próximo não aparece antes de ele abrir). */
  priceCents: number | null;
  /** Lote à venda, quando o tipo vende em lotes; nulo no tipo de lote único. */
  lot?: { name: string; position: number } | null;
  /** Unidades que restam no lote à venda quando há próximo lote (o excedente sai do próximo, com o preço dele). */
  lotRemaining?: number | null;
  /** "Últimas unidades deste lote". */
  lastUnits?: boolean;
  /** "Próximo lote: em breve" (sem o preço). */
  nextLot?: boolean;
  state: TypeState;
  label: string;
  note: string;
  canBuy: boolean;
}

export interface EventDetail extends EventCard {
  address: string;
  description: string;
  attractions: string[];
  shareImageUrl: string | null;
  ticketTypes: TicketTypeView[];
  /** Fim previsto, quando informado. */
  endsAt?: string | null;
  /** Entra quem terá 16 ou 17 anos na data do evento, com o Termo de Autorização (regras de menores). Falso: só 18+. */
  allowsMinors?: boolean;
  /** Cronômetro até o início (`src/site/countdown.ts`). Nulo: desligado no painel ou evento encerrado. */
  countdown?: { phrase: string; liveUntil: string } | null;
  /** Hora do servidor ao montar a resposta. */
  serverNow?: string;
  /** Só no navegador: diferença entre a hora do servidor e o relógio do aparelho, medida na chegada da resposta. */
  clockOffsetMs?: number;
}

/** Busca um evento público (ou a prévia) e anota a diferença de relógio no momento da resposta, para o cronômetro. */
async function withClock<T extends { serverNow?: string }>(load: () => Promise<T>): Promise<T & { clockOffsetMs: number }> {
  const sentAt = Date.now();
  const data = await load();
  return { ...data, clockOffsetMs: clockOffsetMs(data.serverNow, sentAt, Date.now()) };
}

export interface SiteInfo {
  environment: 'local' | 'homologacao' | 'producao';
  provisionalTheme: boolean;
  maxTicketsPerOrder: number;
  salesOpen: boolean;
  /** Chave pública do Turnstile; nula quando o desafio não está ligado. */
  turnstileSiteKey: string | null;
  /** Dados e contatos públicos da PartyX (configuração do servidor). Cada campo nulo enquanto a PartyX não informar. */
  partyx: PartyxInfo;
}

export interface PartyxInfo {
  legalName: string | null;
  cnpj: string | null;
  address: string | null;
  supportEmail: string | null;
  supportWhatsapp: string | null;
  supportHours: string | null;
}

/** Contato que a API devolve com o erro `manutencao` (G06). */
export interface MaintenanceContact {
  email: string | null;
  whatsapp: string | null;
  hours: string | null;
}

export interface FieldProblem {
  campo: string;
  mensagem: string;
}

/** Erro da API no formato `{ erro: { codigo, mensagem, detalhes } }`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, message: string, code = 'erro', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  /** Mensagens por campo, quando a API devolveu `detalhes` de validação. */
  get fields(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as FieldProblem[]) if (d && typeof d.campo === 'string') out[d.campo] = d.mensagem;
    }
    return out;
  }
}

let csrfToken = '';
export const setCsrfToken = (token: string) => {
  csrfToken = token;
};

/**
 * Sessão expirada (G05): uma chamada respondeu 401 `nao_autenticado` fora das rotas em que isso é normal (`/auth/me` de visitante,
 * login e saída). Quem escuta (`SessionProvider`) encerra a sessão na tela; as páginas protegidas levam ao login com o retorno.
 */
type ExpiredListener = () => void;
const expiredListeners = new Set<ExpiredListener>();
export function onSessionExpired(listener: ExpiredListener): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}
const EXPECTED_401 = new Set(['/auth/me', '/auth/login', '/auth/logout']);

/**
 * Manutenção (G06): o servidor respondeu 503 `manutencao`. Quem escuta (`MaintenanceGate`) troca a tela aberta pelo aviso, com o
 * contato da PartyX que veio na resposta. Uma página nova já chega pronta do servidor; isto cobre quem estava com o site aberto.
 */
type MaintenanceListener = (message: string, contact: MaintenanceContact | null) => void;
const maintenanceListeners = new Set<MaintenanceListener>();
export function onMaintenance(listener: MaintenanceListener): () => void {
  maintenanceListeners.add(listener);
  return () => maintenanceListeners.delete(listener);
}

/** Chamada à API. Alterações levam o token CSRF da sessão; o token fica só em memória, nunca em localStorage. */
export async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new ApiError(0, 'Sem conexão. Verifique a internet e tente de novo.', 'sem_conexao');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch((e: { name?: string }) => {
    // Cancelada durante a leitura do corpo: é cancelamento, não resposta vazia.
    if (e?.name === 'AbortError') throw e;
    return null;
  })) as {
    erro?: { codigo?: string; mensagem?: string; detalhes?: unknown };
  } | null;
  if (!res.ok) {
    if (res.status === 401 && data?.erro?.codigo === 'nao_autenticado' && !EXPECTED_401.has(path))
      expiredListeners.forEach(l => l());
    if (res.status === 503 && data?.erro?.codigo === 'manutencao') {
      const contact = (data.erro.detalhes as { contato?: MaintenanceContact } | undefined)?.contato ?? null;
      maintenanceListeners.forEach(l => l(data.erro?.mensagem ?? '', contact));
    }
    throw new ApiError(
      res.status,
      data?.erro?.mensagem ?? 'Não foi possível concluir a ação.',
      data?.erro?.codigo,
      data?.erro?.detalhes,
    );
  }
  return data as T;
}

const get = <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal);
let siteOnce: Promise<SiteInfo> | null = null;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  /** Já mascarado pelo servidor (***.***.***-00). */
  cpf?: string | null;
  phone?: string | null;
  /** AAAA-MM-DD. Nula em conta antiga (o checkout pede) e na equipe. Só a PartyX corrige depois de informada. */
  birthDate?: string | null;
  role: 'cliente' | 'validador' | 'administrador';
  mustChangePassword: boolean;
}

/** O que falta ao comprador para o evento escolhido, ou por que não pode comprar (calculado no servidor, na data do evento). */
export interface BuyerCheck {
  consentPending: boolean;
  birthDateMissing: boolean;
  age: number | null;
  /** 16 ou 17 anos na data do evento: precisa aceitar o Termo de Ciência para Menores. */
  minor: boolean;
  minorTermVersion: string | null;
  refusal: {
    code: 'aceite_pendente' | 'data_nascimento_obrigatoria' | 'idade_minima' | 'evento_para_maiores';
    message: string;
  } | null;
}

/** Parte de uma linha que saiu de um lote, pelo preço dele (a compra se divide quando o lote à venda não basta). */
export interface OrderLineLot {
  lotId: string;
  name: string;
  position: number;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}
export interface OrderLine {
  ticketTypeId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  /** Lotes de onde saíram as unidades. Vazio em pedido anterior aos lotes. */
  lots?: OrderLineLot[];
}

export interface Summary {
  event: { slug: string; name: string; startsAt: string; venue: string; allowsMinors?: boolean };
  items: OrderLine[];
  totalCents: number;
  units: number;
  coupon: { code: string } | null;
  buyer?: BuyerCheck | null;
}

export type OrderStatus =
  'pendente' | 'pago' | 'expirado' | 'nao_concluido' | 'cancelado' | 'estornado' | 'contestado' | 'pago_sem_estoque';

export interface OrderView {
  id: string;
  number: number;
  status: OrderStatus;
  event: { slug: string; name: string; startsAt: string; venue: string; allowsMinors?: boolean };
  /** Comprador com 16 ou 17 anos na data do evento. */
  buyerMinor?: boolean;
  items: OrderLine[];
  totalCents: number;
  coupon: { code: string } | null;
  paymentMethod: 'pix' | 'cartao' | null;
  reservation: { status: string; expiresAt: string; serverNow: string; secondsLeft: number } | null;
  /** Contato de atendimento da PartyX, só no pedido pago sem estoque. Nulo: a PartyX ainda não forneceu (mensagem neutra). */
  support?: { email: string | null; whatsapp: string | null } | null;
  /** Pagamento recusado: categoria para o texto ao comprador. */
  declineReason?: DeclineReason | null;
}

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

export interface PaymentView {
  method: 'pix' | 'cartao';
  status: string;
  pix: { copyPaste: string; qrCodeImage: string | null; expiresAt: string } | null;
  redirectUrl: string | null;
  declineReason?: DeclineReason | null;
}

/** Como montar a tela de pagamento (servidor): componente de cartão, chave pública do gateway e Pix disponível. */
export interface PaymentOptions {
  provider: string | null;
  cardMode: 'hosted' | 'token' | null;
  publicKey: string | null;
  maxInstallments: number;
  pixAvailable: boolean;
}

/** Só o que o componente do gateway devolve para o servidor: nunca número, validade nem CVV. */
export interface CardTokenData {
  cardToken: string;
  paymentMethodId: string;
  paymentTypeId: 'credit_card' | 'debit_card';
}

export interface TicketSummary {
  id: string;
  orderId: string;
  orderNumber: number;
  event: {
    slug: string;
    name: string;
    startsAt: string;
    venue: string;
    address: string;
    ageRating: string;
    allowsMinors?: boolean;
  };
  typeName: string;
  holderName: string;
  shortCode: string;
  status: 'valido' | 'utilizado' | 'cancelado';
  usedAt: string | null;
}
/** Detalhe: o conteúdo do QR só vem aqui, e nunca para ingresso cancelado. */
export interface TicketDetail extends TicketSummary {
  qrPayload: string | null;
}
export interface OrderRow {
  id: string;
  number: number;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  eventSlug: string;
  eventName: string;
  eventStartsAt: string;
  ticketCount: number;
}

/** `menor_confirmar`: ingresso de pedido de comprador menor; nada foi consumido, o validador confere a idade e confirma. */
export type GateResultKind = 'valido' | 'ja_utilizado' | 'invalido' | 'cancelado' | 'outro_evento' | 'menor_confirmar';
export type MinorCheck = 'autorizacao_recebida' | 'maior_de_idade';
export interface GateOutcome {
  result: GateResultKind;
  message: string;
  ticket: { id: string; shortCode: string; typeName: string; holderName: string; buyerMinor?: boolean } | null;
  firstEntry: { at: string; validatorName: string } | null;
  otherEvent: { name: string } | null;
  counter: { entered: number; total: number };
  method: 'camera' | 'manual';
}
export interface GateEvent {
  id: string;
  name: string;
  slug: string;
  startsAt: string;
  venue: string;
  entered: number;
  total: number;
  /** Evento encerrado dentro da janela operacional: vendas encerradas, portaria funcionando até `gateClosesAt`. */
  salesClosed: boolean;
  gateClosesAt: string | null;
}
export interface GateHit {
  ticketId: string;
  shortCode: string;
  typeName: string;
  holderName: string;
  cpf: string | null;
  email: string;
  status: 'valido' | 'utilizado' | 'cancelado';
  usedAt: string | null;
  /** Pedido de comprador menor: marca MENOR e a entrada pede a conferência da idade. */
  buyerMinor?: boolean;
}

export interface Bucket {
  orders: number;
  tickets: number;
  cents: number;
}
export interface SalesGroup {
  paid: Bucket;
  refunded: Bucket;
  contested: Bucket;
  withoutStock: Bucket;
}
export interface AdminOverview {
  today: string;
  month: string;
  day: SalesGroup;
  monthSales: SalesGroup;
  daily: { day: string; orders: number; tickets: number; cents: number }[];
  events: {
    id: string;
    name: string;
    slug: string;
    startsAt: string;
    types: {
      id: string;
      name: string;
      capacity: number;
      sold: number;
      reserved: number;
      remaining: number;
      isActive: boolean;
    }[];
    totals: { capacity: number; sold: number; reserved: number; remaining: number };
  }[];
  /** `paidWithoutStock`: casos ainda não tratados (alerta persistente). */
  attention: { paidWithoutStock: number; paidWithoutStockTreated?: number };
}

export interface PaidWithoutStockCase {
  orderId: string;
  number: number;
  totalCents: number;
  paidAt: string | null;
  paymentMethod: 'pix' | 'cartao' | null;
  event: string;
  buyerName: string;
  buyerEmail: string;
  buyerCpf: string | null;
  gatewayRef: string | null;
  treated: { at: string; reason: string; by: string | null } | null;
}
/** Cobrança em dobro de um pedido (D-83): a PartyX estorna no gateway e marca como tratada. */
export interface DuplicateChargeCase {
  orderId: string;
  number: number;
  totalCents: number;
  event: string;
  buyerName: string;
  buyerEmail: string;
  buyerCpf: string | null;
  gatewayRef: string | null;
  duplicateRef: string;
  duplicateStatus: string | null;
  detectedAt: string;
  treated: { at: string; reason: string; by: string | null } | null;
}
export interface PaymentExceptions {
  semEstoque: PaidWithoutStockCase[];
  abertos: number;
  cobrancasDuplicadas: DuplicateChargeCase[];
  duplicadasAbertas: number;
  orientacao: string;
}
export interface AdminOrderRow {
  id: string;
  number: number;
  status: OrderStatus;
  situation: string;
  paymentMethod: 'pix' | 'cartao' | null;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  event: { id: string; name: string };
  buyer: { name: string; email: string; cpf: string | null };
  tickets: number;
  cancelledTickets: number;
  coupon: string | null;
}
export interface Paged<T> {
  page: number;
  pageSize: number;
  total: number;
  rows: T[];
}
export interface AdminTicketRow {
  id: string;
  shortCode: string;
  status: 'valido' | 'utilizado' | 'cancelado';
  typeName: string;
  holderName: string;
  buyerEmail: string;
  buyerCpf: string | null;
  orderId: string;
  orderNumber: number;
  usedAt: string | null;
  validatorName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}
export interface AdminBuyerRow {
  id: string;
  name: string;
  email: string;
  cpf: string | null;
  orders: number;
  tickets: number;
  cancelled: number;
  entered: number;
  paidCents: number;
}
export interface LiveEntries {
  event: { id: string; name: string; status: string };
  counter: { entered: number; total: number };
  byType: { typeName: string; entered: number; total: number }[];
  attempts: Record<string, number>;
  byValidator: { name: string; entered: number }[];
  recent: {
    at: string;
    result: string;
    method: string;
    shortCode: string | null;
    typeName: string | null;
    holderName: string | null;
    validator: string;
  }[];
  serverTime: string;
}
export interface AdminOrderDetail {
  id: string;
  number: number;
  status: OrderStatus;
  situation: string;
  paymentMethod: string | null;
  gatewayPaymentId: string | null;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  event: { id: string; name: string };
  buyer: { id: string; name: string; email: string; phone: string | null; cpf: string | null };
  items: { name: string; quantity: number; unitPriceCents: number; subtotalCents: number }[];
  tickets: {
    id: string;
    shortCode: string;
    status: 'valido' | 'utilizado' | 'cancelado';
    typeName: string;
    holderName: string;
    usedAt: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
  }[];
  trail: { action: string; entity: string; at: string; actor: string | null; reason: string | null }[];
  gatewayEvents: {
    type: string;
    receivedAt: string;
    processedAt: string | null;
    error: string | null;
    attempts: number;
  }[];
}
export type EventStatus = 'rascunho' | 'publicado' | 'encerrado';
/** Evento como o painel recebe (`server/src/events/service.ts`). */
export interface AdminEventRow {
  id: string;
  name: string;
  slug: string;
  startsAt: string;
  status: EventStatus;
  venue: string;
  address: string;
  description: string;
  attractions: string[];
  ageRating: string;
  bannerUrl: string | null;
  isFeatured: boolean;
  endsAt: string | null;
  allowsMinors: boolean;
  /** Quando foi encerrado (nulo se não encerrado, ou encerrado por versão anterior: vale `updatedAt`). */
  closedAt: string | null;
  /** Arquivado: fora da vitrine, da busca, do link público e da lista padrão do painel, sem compra nova. Nulo: não arquivado. */
  archivedAt: string | null;
  /** Cronômetro na página do evento (ligado por padrão) e a frase personalizada (nula: a padrão). */
  countdownEnabled: boolean;
  countdownPhrase: string | null;
  /** Cor de destaque da página do evento (`#RRGGBB`); nula: o roxo da PartyX. */
  accentColor: string | null;
  createdAt: string;
  updatedAt: string;
}
export type AdminEvent = AdminEventRow;

/** O que impede apagar o evento (`GET /admin/events/:id/removal`). Qualquer número acima de zero: só arquivar. */
export interface EventRemovalCheck {
  deletable: boolean;
  usage: { orders: number; tickets: number; checkins: number; minorAcceptances: number };
  ticketTypes: number;
  hasBanner: boolean;
  archived: boolean;
}

/** Tipo de ingresso no painel: vendidos (pagos) separados de reservados (temporários, de quem está pagando). */
export interface AdminTicketType {
  id: string;
  eventId: string;
  name: string;
  priceCents: number;
  quantityTotal: number;
  quantitySold: number;
  quantityReserved: number;
  available: number;
  salesStartAt: string;
  salesEndAt: string;
  isActive: boolean;
  /** "Últimas unidades deste lote" na página do evento. */
  lastUnitsNotice: boolean;
  salesState: 'a_venda' | 'em_breve' | 'encerrada' | 'indisponivel' | 'esgotado' | 'reservado';
  /** Lotes em ordem, com a situação de agora. */
  lots: AdminLot[];
}

/** Lote no painel (`server/src/events/service.ts`, `LotView`). */
export interface AdminLot {
  id: string;
  position: number;
  name: string;
  priceCents: number;
  quantity: number;
  carriedIn: number;
  passedOut: number;
  discarded: number;
  capacity: number;
  sold: number;
  reserved: number;
  available: number;
  status: 'aguardando' | 'a_venda' | 'encerrado';
  closeReason: 'esgotado' | 'data' | 'manual' | null;
  closedAt: string | null;
  salesStartAt: string | null;
  salesEndAt: string | null;
  leftoverPolicy: 'passar' | 'descartar';
  hasOrders: boolean;
}
export interface LotBody {
  name?: string;
  priceCents: number;
  quantity: number;
  salesStartAt?: string | null;
  salesEndAt?: string | null;
  leftoverPolicy?: 'passar' | 'descartar';
}

export interface Promoter {
  id: string;
  name: string;
  couponCode: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}
export interface PromoterOrders {
  promoter: { id: string; name: string; code: string; isActive: boolean };
  orders: { id: string; number: number; eventName: string; tickets: number; cents: number; paidAt: string }[];
  totals: { tickets: number; cents: number };
}
export interface BuyerRow {
  id: string;
  name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
  isActive: boolean;
  anonymized: boolean;
  orders: number;
  tickets: number;
  lastOrderAt: string | null;
}
export interface BuyerDetail {
  buyer: {
    id: string;
    name: string;
    email: string;
    cpf: string | null;
    phone: string | null;
    isActive: boolean;
    anonymized: boolean;
    createdAt: string;
    lastLoginAt: string | null;
  };
  orders: {
    id: string;
    number: number;
    status: OrderStatus;
    totalCents: number;
    units: number;
    paymentMethod: string | null;
    createdAt: string;
    paidAt: string | null;
    event: { id: string; name: string };
  }[];
  tickets: {
    id: string;
    shortCode: string;
    status: 'valido' | 'utilizado' | 'cancelado';
    typeName: string;
    eventName: string;
    orderNumber: number;
    usedAt: string | null;
    cancelledAt: string | null;
  }[];
  corrections: { at: string; actor: string | null; reason: string; fields: ('email' | 'cpf')[] }[];
}
export interface AdminTicketDetail {
  ticket: {
    id: string;
    shortCode: string;
    status: 'valido' | 'utilizado' | 'cancelado';
    holderName: string;
    typeName: string;
    priceCents: number;
    issuedAt: string;
    event: { id: string; name: string; startsAt: string };
    order: { id: string; number: number; status: OrderStatus; paidAt: string | null };
    buyer: { id: string; name: string; email: string; cpf: string | null };
    entry: { at: string; validator: string | null } | null;
    cancellation: { at: string; reason: string | null; by: string | null } | null;
  };
  attempts: { at: string; result: string; method: string; validator: string }[];
}
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
  role: 'validador' | 'administrador';
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Regras para os formulários do painel, lidas do servidor (`GET /admin/events/meta`). */
export interface EventsMeta {
  banner: { maxBytes: number; minWidth: number; storedWidth: number; formats: string[]; available: boolean };
  ageRatings: string[];
  limits: {
    nameMax: number;
    descriptionMax: number;
    attractionsMax: number;
    attractionMax: number;
    typeNameMax: number;
    countdownPhraseMax: number;
    priceMaxCents: number;
    quantityMax: number;
  };
  /** Janela em que a portaria ainda abre um evento encerrado, em horas em torno do início (D-79). */
  gateWindow: { beforeHours: number; afterHours: number };
  reservationMinutes: number;
  maxTicketsPerOrder: number;
  /** Frase do cronômetro quando o painel deixa em branco ("Falta pouco para"). */
  countdownPhraseDefault: string;
}

export interface EventInputBody {
  name: string;
  startsAt: string;
  venue: string;
  address: string;
  description: string;
  attractions: string[];
  ageRating: string;
  isFeatured: boolean;
  endsAt: string | null;
  allowsMinors: boolean;
  countdownEnabled: boolean;
  countdownPhrase: string | null;
  accentColor: string | null;
}
export interface TicketTypeBody {
  name: string;
  priceCents: number;
  quantityTotal: number;
  salesStartAt: string;
  salesEndAt: string;
  isActive: boolean;
  lastUnitsNotice?: boolean;
}

/**
 * Envio do banner com progresso (o `fetch` não informa o progresso do envio). Mesmo contrato de erro e o mesmo token CSRF das
 * outras chamadas. `onProgress` recebe de 0 a 1.
 */
export function uploadBanner(
  eventId: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<{ event: AdminEvent }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/admin/events/${encodeURIComponent(eventId)}/banner`);
    xhr.setRequestHeader('accept', 'application/json');
    if (csrfToken) xhr.setRequestHeader('x-csrf-token', csrfToken);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiError(0, 'Sem conexão. Verifique a internet e tente de novo.', 'sem_conexao'));
    xhr.onload = () => {
      let data: { erro?: { codigo?: string; mensagem?: string; detalhes?: unknown } } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(data as unknown as { event: AdminEvent });
      } else
        reject(
          new ApiError(
            xhr.status,
            data?.erro?.mensagem ?? 'Não foi possível enviar a imagem.',
            data?.erro?.codigo,
            data?.erro?.detalhes,
          ),
        );
    };
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export interface SalesReport {
  criterion: string;
  period: { from: string | null; to: string | null };
  lines: {
    eventId: string;
    eventName: string;
    typeId: string;
    typeName: string;
    tickets: number;
    cents: number;
    /** Vendas por lote dentro do tipo, na ordem dos lotes. */
    lots?: { lotId: string; lotName: string; tickets: number; cents: number }[];
  }[];
  byEvent: { eventId: string; eventName: string; tickets: number; cents: number }[];
  totals: { tickets: number; cents: number };
  reconciliation: { ok: boolean | null; ordersCents: number; itemsCents: number; orders: number };
  daily: { day: string; tickets: number; cents: number }[];
  reversals: { refunded: Bucket; contested: Bucket; grossCents: number; netCents: number };
  exceptions: { paidWithoutStock: Bucket };
  notes: string[];
}
export interface PromoterRanking {
  metric: 'qtd' | 'valor';
  criterion: string;
  ranking: {
    position: number;
    id: string;
    name: string;
    code: string;
    isActive: boolean;
    tickets: number;
    cents: number;
    orders: number;
  }[];
  withoutPromoter: { tickets: number; cents: number; orders: number };
}
export interface FeeReport {
  month: string;
  criterion: string;
  feePerTicketCents: number;
  units: number;
  feeCents: number;
  originOrders: number;
  byCurrentStatus: { label: string; units: number }[];
  byEvent: { eventId: string; eventName: string; units: number; feeCents: number }[];
  reconciliation: {
    expectedUnits: number;
    issuedUnits: number;
    ok: boolean;
    anomalies: { orderId: string; number: number; status: string; expectedUnits: number }[];
  };
  exceptions: {
    title: string;
    paidWithoutStock: {
      orderId: string;
      number: number;
      units: number;
      totalCents: number;
      paidAt: string;
      gatewayRef: string | null;
      treated: boolean;
    }[];
    totals: { orders: number; units: number; cents: number; open: number };
    note: string;
  };
  revenue: { grossCents: number; refundedCents: number; contestedCents: number; netCents: number };
  page: number;
  pageSize: number;
  total: number;
  units_detail: {
    ticketId: string;
    shortCode: string;
    orderId: string;
    orderNumber: number;
    eventName: string;
    paidAt: string;
    current: string;
  }[];
}

export interface CartItem {
  ticketTypeId: string;
  quantity: number;
}

export const api = {
  site: (signal?: AbortSignal) => get<SiteInfo>('/public/site', signal),
  /** As mesmas informações, buscadas uma vez por carregamento da página (rodapé e textos de atendimento em toda tela). */
  siteCached: () => {
    siteOnce ??= get<SiteInfo>('/public/site').catch(error => {
      siteOnce = null; // falhou: a próxima tela tenta de novo
      throw error;
    });
    return siteOnce;
  },
  legalDocument: async (kind: LegalKind, signal?: AbortSignal) =>
    (await get<{ document: LegalDocument }>(`/public/legal/${kind}`, signal)).document,
  home: (signal?: AbortSignal) => get<{ featured: EventCard[]; upcoming: EventCard[] }>('/public/home', signal),
  events: (q: string, date: string, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (date) params.set('date', date);
    const s = params.toString();
    return get<{ events: EventCard[]; filtering: boolean }>(`/public/events${s ? `?${s}` : ''}`, signal);
  },
  event: (slug: string, signal?: AbortSignal) =>
    withClock(async () => (await get<{ event: EventDetail }>(`/public/events/${encodeURIComponent(slug)}`, signal)).event),

  me: (signal?: AbortSignal) =>
    get<{ user: SessionUser; csrfToken: string; pendingConsent?: boolean }>('/auth/me', signal),
  login: (email: string, password: string) =>
    request<{ user: SessionUser; pendingConsent?: boolean }>('POST', '/auth/login', { email, password }),
  /** Conta antiga: informa a data de nascimento uma vez (depois, só a PartyX corrige). */
  setBirthDate: (birthDate: string) => request<{ birthDate: string }>('POST', '/me/birth-date', { birthDate }),
  /** Novo aceite dos Termos e da Privacidade vigentes. */
  acceptTerms: (acceptedTermsVersion: string, acceptedPrivacyVersion: string) =>
    request<{ pendingConsent: boolean }>('POST', '/me/consents', {
      acceptedTermsVersion,
      acceptedPrivacyVersion,
      accept: true,
    }),
  register: (body: Record<string, unknown>) => request<{ user: SessionUser }>('POST', '/auth/register', body),
  logout: () => request<void>('POST', '/auth/logout'),
  forgotPassword: (email: string, captchaToken?: string | null) =>
    request<{ mensagem: string }>('POST', '/auth/password/forgot', { email, captchaToken: captchaToken ?? undefined }),
  checkResetToken: (token: string) =>
    request<{ estado: 'valido' | 'expirado' | 'utilizado' | 'invalido' }>('POST', '/auth/password/check', {
      token,
    }).then(r => r.estado),
  resetPassword: (token: string, password: string) =>
    request<{ mensagem: string }>('POST', '/auth/password/reset', { token, password }),
  legal: () => get<LegalVersions>('/legal/versions'),

  quote: (eventSlug: string, items: CartItem[], couponCode?: string) =>
    request<{ summary: Summary }>('POST', '/checkout/quote', {
      eventSlug,
      items,
      couponCode: couponCode || null,
    }).then(r => r.summary),
  createOrder: (
    eventSlug: string,
    items: CartItem[],
    couponCode: string | undefined,
    expectedTotalCents: number,
    minorTerm?: { accepted: boolean; version: string | null },
  ) =>
    request<{ order: OrderView }>('POST', '/orders', {
      eventSlug,
      items,
      couponCode: couponCode || null,
      expectedTotalCents,
      ...(minorTerm ? { minorTermAccepted: minorTerm.accepted, minorTermVersion: minorTerm.version } : {}),
    }).then(r => r.order),
  order: (id: string, signal?: AbortSignal) =>
    get<{ order: OrderView }>(`/orders/${encodeURIComponent(id)}`, signal).then(r => r.order),
  cancelOrder: (id: string) =>
    request<{ order: OrderView }>('POST', `/orders/${encodeURIComponent(id)}/cancel`).then(r => r.order),
  startPayment: (id: string, method: 'pix' | 'cartao', card?: CardTokenData) =>
    request<{ payment: PaymentView }>('POST', `/orders/${encodeURIComponent(id)}/payment`, {
      method,
      ...(card ? { ...card, installments: 1 } : {}),
    }).then(r => r.payment),
  paymentOptions: (signal?: AbortSignal) =>
    get<{ options: PaymentOptions }>('/payments/options', signal).then(r => r.options),
  tickets: (signal?: AbortSignal) => get<{ tickets: TicketSummary[] }>('/tickets', signal).then(r => r.tickets),
  ticket: (id: string, signal?: AbortSignal) =>
    get<{ ticket: TicketDetail }>(`/tickets/${encodeURIComponent(id)}`, signal).then(r => r.ticket),
  orders: (signal?: AbortSignal) => get<{ orders: OrderRow[] }>('/orders', signal).then(r => r.orders),
  gateEvents: (signal?: AbortSignal) => get<{ events: GateEvent[] }>('/gate/events', signal).then(r => r.events),
  gateCounter: (id: string, signal?: AbortSignal) =>
    get<{
      counter: { entered: number; total: number };
      byType: { typeName: string; entered: number; total: number }[];
    }>(`/gate/events/${encodeURIComponent(id)}/counter`, signal),
  gateScan: (eventId: string, qr: string) => request<GateOutcome>('POST', '/gate/scan', { eventId, qr }),
  gateSearch: (eventId: string, q: string) =>
    request<{ kind: string; hits: GateHit[] }>('POST', '/gate/search', { eventId, q }),
  gateAdmit: (eventId: string, ticketId: string, confirm?: { method: 'camera' | 'manual'; minorCheck: MinorCheck }) =>
    request<GateOutcome>('POST', '/gate/admit', { eventId, ticketId, ...confirm }),
  gateMinorRefused: (eventId: string, ticketId: string) =>
    request<{ recusado: boolean }>('POST', '/gate/minor-refused', { eventId, ticketId }),
  updateProfile: (name: string, phone: string) => request<{ user: SessionUser }>('PATCH', '/me', { name, phone }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ mensagem: string }>('POST', '/me/password', { currentPassword, newPassword }),
  admin: {
    overview: (month?: string, signal?: AbortSignal) =>
      get<AdminOverview>(`/admin/overview${month ? `?month=${month}` : ''}`, signal),
    events: (signal?: AbortSignal) => get<{ events: AdminEventRow[] }>('/admin/events', signal).then(r => r.events),
    eventsMeta: (signal?: AbortSignal) => get<EventsMeta>('/admin/events/meta', signal),
    event: (id: string, signal?: AbortSignal) =>
      get<{ event: AdminEvent; ticketTypes: AdminTicketType[] }>(`/admin/events/${encodeURIComponent(id)}`, signal),
    eventPreview: (id: string, signal?: AbortSignal) =>
      withClock(() =>
        get<{ event: EventDetail & { status: EventStatus } }>(
          `/admin/events/${encodeURIComponent(id)}/preview`,
          signal,
        ).then(r => r.event),
      ),
    createEvent: (body: EventInputBody) => request<{ event: AdminEvent }>('POST', '/admin/events', body),
    updateEvent: (id: string, body: Partial<EventInputBody>) =>
      request<{ event: AdminEvent }>('PATCH', `/admin/events/${encodeURIComponent(id)}`, body),
    publishEvent: (id: string) =>
      request<{ event: AdminEvent }>('POST', `/admin/events/${encodeURIComponent(id)}/publish`),
    closeEvent: (id: string) => request<{ event: AdminEvent }>('POST', `/admin/events/${encodeURIComponent(id)}/close`),
    reopenEvent: (id: string, reason: string) =>
      request<{ event: AdminEvent; typesOnSale: number }>('POST', `/admin/events/${encodeURIComponent(id)}/reopen`, {
        reason,
      }),
    stopSales: (id: string) =>
      request<{ event: AdminEvent; typesClosed: number }>('POST', `/admin/events/${encodeURIComponent(id)}/stop-sales`),
    removeBanner: (id: string) =>
      request<{ event: AdminEvent }>('DELETE', `/admin/events/${encodeURIComponent(id)}/banner`),
    /** Cor viva mais presente na capa salva (nula se a capa só tem preto, branco e cinza). Não grava nada. */
    accentSuggestion: (id: string) =>
      request<{ color: string | null }>('POST', `/admin/events/${encodeURIComponent(id)}/accent-suggestion`),
    eventRemoval: (id: string, signal?: AbortSignal) =>
      get<EventRemovalCheck>(`/admin/events/${encodeURIComponent(id)}/removal`, signal),
    deleteEvent: (id: string, confirmName: string) =>
      request<{
        deleted: { id: string; name: string; ticketTypes: number };
        imagesRemoved: number | null;
        imagesPending: boolean;
      }>('POST', `/admin/events/${encodeURIComponent(id)}/delete`, { confirmName }),
    archiveEvent: (id: string) =>
      request<{ event: AdminEvent }>('POST', `/admin/events/${encodeURIComponent(id)}/archive`),
    unarchiveEvent: (id: string) =>
      request<{ event: AdminEvent }>('POST', `/admin/events/${encodeURIComponent(id)}/unarchive`),
    createTicketType: (eventId: string, body: TicketTypeBody) =>
      request<{ ticketType: AdminTicketType }>(
        'POST',
        `/admin/events/${encodeURIComponent(eventId)}/ticket-types`,
        body,
      ),
    updateTicketType: (id: string, body: Partial<TicketTypeBody>) =>
      request<{ ticketType: AdminTicketType }>('PATCH', `/admin/ticket-types/${encodeURIComponent(id)}`, body),
    createLot: (typeId: string, body: LotBody) =>
      request<{ ticketType: AdminTicketType }>('POST', `/admin/ticket-types/${encodeURIComponent(typeId)}/lots`, body),
    updateLot: (id: string, body: Partial<LotBody>) =>
      request<{ ticketType: AdminTicketType }>('PATCH', `/admin/lots/${encodeURIComponent(id)}`, body),
    deleteLot: (id: string) => request<{ ticketType: AdminTicketType }>('DELETE', `/admin/lots/${encodeURIComponent(id)}`),
    moveLot: (id: string, direction: 'subir' | 'descer') =>
      request<{ ticketType: AdminTicketType }>('POST', `/admin/lots/${encodeURIComponent(id)}/move`, { direction }),
    turnLot: (typeId: string, leftover: 'passar' | 'descartar') =>
      request<{ ticketType: AdminTicketType }>('POST', `/admin/ticket-types/${encodeURIComponent(typeId)}/turn-lot`, {
        leftover,
      }),
    orders: (query: string, signal?: AbortSignal) =>
      get<{ page: number; pageSize: number; total: number; orders: AdminOrderRow[] }>(
        `/admin/orders?${query}`,
        signal,
      ).then(r => ({ ...r, rows: r.orders })),
    order: (id: string, signal?: AbortSignal) =>
      get<{ order: AdminOrderDetail }>(`/admin/orders/${id}`, signal).then(r => r.order),
    buyers: (eventId: string, query: string, signal?: AbortSignal) =>
      get<{ page: number; pageSize: number; total: number; buyers: AdminBuyerRow[] }>(
        `/admin/events/${eventId}/buyers?${query}`,
        signal,
      ).then(r => ({ ...r, rows: r.buyers })),
    tickets: (eventId: string, query: string, signal?: AbortSignal) =>
      get<{ page: number; pageSize: number; total: number; tickets: AdminTicketRow[] }>(
        `/admin/events/${eventId}/tickets?${query}`,
        signal,
      ).then(r => ({ ...r, rows: r.tickets })),
    entries: (eventId: string, signal?: AbortSignal) => get<LiveEntries>(`/admin/events/${eventId}/entries`, signal),
    salesReport: (query: string, signal?: AbortSignal) => get<SalesReport>(`/admin/reports/sales?${query}`, signal),
    promoters: (signal?: AbortSignal) =>
      get<{ promoters: Promoter[] }>('/admin/promoters', signal).then(r => r.promoters),
    createPromoter: (body: { name: string; couponCode: string; phone: string | null; isActive: boolean }) =>
      request<{ promoter: Promoter }>('POST', '/admin/promoters', body),
    updatePromoter: (
      id: string,
      body: Partial<{ name: string; couponCode: string; phone: string | null; isActive: boolean }>,
    ) => request<{ promoter: Promoter }>('PATCH', `/admin/promoters/${encodeURIComponent(id)}`, body),
    promoterOrders: (id: string, query: string, signal?: AbortSignal) =>
      get<PromoterOrders>(`/admin/reports/promoters/${encodeURIComponent(id)}?${query}`, signal),
    buyersAll: (query: string, signal?: AbortSignal) =>
      get<{ page: number; pageSize: number; total: number; buyers: BuyerRow[] }>(`/admin/buyers?${query}`, signal).then(
        r => ({ ...r, rows: r.buyers }),
      ),
    buyer: (id: string, signal?: AbortSignal) => get<BuyerDetail>(`/admin/buyers/${encodeURIComponent(id)}`, signal),
    revealCpf: (id: string) => request<{ cpf: string }>('POST', `/admin/buyers/${encodeURIComponent(id)}/cpf`),
    correctIdentity: (id: string, body: { email?: string; cpf?: string; birthDate?: string; reason: string }) =>
      request<{ mensagem: string }>('PATCH', `/admin/users/${encodeURIComponent(id)}/identity`, body),
    ticket: (id: string, signal?: AbortSignal) =>
      get<AdminTicketDetail>(`/admin/tickets/${encodeURIComponent(id)}`, signal),
    team: (signal?: AbortSignal) => get<{ team: TeamMember[] }>('/admin/team', signal).then(r => r.team),
    createMember: (body: { name: string; email: string; phone: string | null; role: TeamMember['role'] }) =>
      request<{ member: TeamMember; temporaryPassword: string }>('POST', '/admin/team', body),
    updateMember: (
      id: string,
      body: Partial<{ name: string; email: string; phone: string | null; role: TeamMember['role'] }>,
    ) => request<{ member: TeamMember }>('PATCH', `/admin/team/${encodeURIComponent(id)}`, body),
    setMemberActive: (id: string, active: boolean) =>
      request<{ member: TeamMember }>(
        'POST',
        `/admin/team/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`,
      ),
    temporaryPassword: (id: string) =>
      request<{ member: TeamMember; temporaryPassword: string }>(
        'POST',
        `/admin/team/${encodeURIComponent(id)}/temporary-password`,
      ),
    promoterRanking: (query: string, signal?: AbortSignal) =>
      get<PromoterRanking>(`/admin/reports/promoters?${query}`, signal),
    feeReport: (query: string, signal?: AbortSignal) => get<FeeReport>(`/admin/reports/fee?${query}`, signal),
    paymentExceptions: (signal?: AbortSignal) => get<PaymentExceptions>('/admin/payments/exceptions', signal),
    treatDuplicateCharge: (orderId: string, chargeId: string, reason: string) =>
      request<{ orderId: string; chargeId: string; treated: { at: string; reason: string } }>(
        'POST',
        `/admin/payments/exceptions/${encodeURIComponent(orderId)}/duplicates/${encodeURIComponent(chargeId)}/treat`,
        { reason },
      ),
    treatException: (orderId: string, reason: string) =>
      request<{ orderId: string; treated: { at: string; reason: string } }>(
        'POST',
        `/admin/payments/exceptions/${encodeURIComponent(orderId)}/treat`,
        { reason },
      ),
    cancelTicket: (id: string, reason: string) =>
      request<{ cancelled: number; alreadyCancelled: number; used: number; guidance: string }>(
        'POST',
        `/admin/tickets/${id}/cancel`,
        { reason, confirm: true },
      ),
    cancelOrderTickets: (id: string, reason: string) =>
      request<{ cancelled: number; alreadyCancelled: number; used: number; guidance: string }>(
        'POST',
        `/admin/orders/${id}/cancel-tickets`,
        { reason, confirm: true },
      ),
  },
  /** Só no ambiente local, com o gateway fictício: a rota não existe em homologação nem em produção. */
  devSimulate: (id: string, status: 'aprovado' | 'recusado' | 'expirado' | 'estornado') =>
    request<{ status: string; outcome: string | null }>(
      'POST',
      `/dev/mock-gateway/${encodeURIComponent(id)}/${status}`,
    ),
  payment: (id: string, signal?: AbortSignal) =>
    get<{ payment: PaymentView | null }>(`/orders/${encodeURIComponent(id)}/payment`, signal).then(r => r.payment),
};

export type LegalKind =
  'termos-de-uso' | 'privacidade' | 'cancelamento' | 'meia-entrada' | 'termo-menor' | 'autorizacao-menor';

/** Endereços dos PDFs da autorização de menor (o navegador baixa direto; o do pedido exige a sessão). */
export const minorAuthorizationUrl = {
  order: (orderId: string) => `/api/orders/${encodeURIComponent(orderId)}/autorizacao-menor.pdf`,
  blank: (slug: string) => `/api/public/events/${encodeURIComponent(slug)}/autorizacao-menor.pdf`,
};
export interface LegalDocument {
  kind: LegalKind;
  title: string;
  status: 'oficial' | 'homologacao' | 'pendente';
  version: string | null;
  /** Data de vigência da versão (AAAA-MM-DD), quando a PartyX informou. */
  effectiveDate: string | null;
  blocks: { type: 'heading' | 'paragraph'; text: string }[];
}

/** Versões vigentes que o cadastro aceita (RF-03). `ready` falso: cadastro fechado. `provisional`: homologação sem texto oficial. */
export interface LegalVersions {
  terms: string;
  privacy: string;
  termsDate: string | null;
  privacyDate: string | null;
  ready: boolean;
  provisional: boolean;
}
