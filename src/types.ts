export type Role = 'cliente' | 'admin' | 'validador';
export type Area = 'pub' | 'adm' | 'gate' | 'bare';
export type Need = 'any' | 'cli' | 'adm' | 'gate';
/** Código de rota do protótipo (P01, C04, ADM11, V02...). */
export type RouteId = string;

export interface Customer {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  created: number;
  active: boolean;
  pw: string;
  role?: undefined;
  temp?: boolean;
  last?: number | null;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'validador';
  active: boolean;
  pw: string;
  temp?: boolean;
  created: number;
  last: number | null;
  phone?: string;
  cpf?: string;
}

export type User = Customer | StaffUser;

export interface Promoter {
  id: string;
  name: string;
  code: string;
  phone: string;
  active: boolean;
  created: number;
}

export type EventStatus = 'rascunho' | 'publicado' | 'encerrado';

export interface PartyEvent {
  id: string;
  slug: string;
  name: string;
  start: number;
  venue: string;
  address: string;
  desc: string;
  attractions: string[];
  age: string;
  status: EventStatus;
  featured: boolean;
  limit: number;
  c1: string;
  c2: string;
  banner?: boolean;
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  price: number;
  total: number;
  start: number;
  end: number;
  active: boolean;
  half: boolean;
  taken?: number;
}

export type OrderStatus =
  'pendente' | 'pago' | 'expirado' | 'nao_concluido' | 'estornado' | 'contestado' | 'pago_sem_estoque';
export type PayMethod = 'pix' | 'card';

export interface OrderItem {
  typeId: string;
  qty: number;
  unit: number;
}

export interface HistoryEntry {
  t: number;
  l: string;
}

export interface Order {
  id: string;
  num: string;
  userId: string;
  eventId: string;
  promoterId: string | null;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  method: PayMethod;
  created: number;
  paidAt: number | null;
  expiresAt: number;
  attempts: number;
  gw: string;
  hist: HistoryEntry[];
  card4?: string | null;
  refundAt?: number;
  issuing?: boolean;
}

export type TicketStatus = 'valido' | 'utilizado' | 'cancelado';

export interface Ticket {
  id: string;
  code: string;
  orderId: string;
  typeId: string;
  eventId: string;
  holder: string;
  status: TicketStatus;
  issued: number;
  usedAt: number | null;
  usedBy: string | null;
  method?: string | null;
  cancelAt?: number;
  cancelBy?: string;
  cancelReason?: string;
}

export type CheckinResult = 'valido' | 'ja_utilizado' | 'invalido' | 'cancelado';

export interface Checkin {
  ticketId: string | null;
  code: string;
  eventId: string;
  by: string;
  result: CheckinResult;
  method: string;
  at: number;
}

export interface AuditEntry {
  t: number;
  by: string;
  l: string;
  ent: string;
}

export interface Database {
  customers: Customer[];
  staff: StaffUser[];
  promoters: Promoter[];
  events: PartyEvent[];
  types: TicketType[];
  orders: Order[];
  tickets: Ticket[];
  checkins: Checkin[];
  audit: AuditEntry[];
  nextNum: number;
}

export type BadgeTone = 'ok' | 'warn' | 'err' | 'info' | 'neu' | 'ref' | 'con' | 'dark';

export interface Badge {
  label: string;
  bg: string;
  fg: string;
}

/** Estado completo da aplicação. Sub-objetos de formulário usam formas soltas de propósito. */
/** Estruturas dinâmicas (view-models e formulários) cujo formato muda por tela. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any;

export interface AppState {
  rev: number;
  db: Database;
  route: RouteId;
  uid: string | null;
  frame: string;
  winW: number;
  winH?: number;
  notes: boolean;
  index: boolean;
  idxQ: string;
  ev: string;
  order: string | null;
  ticket: string | null;
  prom: string | null;
  buyer: string | null;
  admTab: string;
  preview: boolean;
  v: Loose;
  q: string;
  qDate: string;
  lq: string;
  lqDate: string;
  listLoading: boolean;
  hq: string;
  cart: { eventId: string; q: Record<string, number> };
  ck: Loose;
  ckAlert: string | null;
  auth: Loose;
  reg: Loose;
  rec: Loose;
  first: Loose;
  acct: Loose | null;
  pwf: Loose | null;
  evf: Loose | null;
  tf: Loose | null;
  pf: Loose | null;
  sf: Loose | null;
  corr: Loose | null;
  f: Record<string, string>;
  pg: Record<string, number>;
  modal: Loose | null;
  drawer: Loose | null;
  toast: Loose | null;
  dirty: boolean;
  menu: boolean;
  reveal: boolean;
  g: Loose;
}
