import type { Config } from '../config';
import type { Db } from '../db/client';
import type { EmailSender } from '../providers/email';
import type { BannerStorage } from '../providers/bannerStorage';
import type { PaymentGateway } from '../payments/gateway';
import type { TicketIssuer } from '../payments/reconcile';
import type { TaskQueue } from '../payments/taskQueue';
import type { HumanVerifier } from '../security/humanCheck';
import type { PasswordHasher } from '../providers/passwordHasher';
import type { Clock } from '../providers/clock';

export interface AuthDeps {
  db: Db;
  clock: Clock;
  hasher: PasswordHasher;
  mailer: EmailSender;
  config: Config;
  /** Armazenamento dos banners. Ausente quando não há bucket nem ambiente local: o upload é recusado. */
  banners?: BannerStorage;
  /** Gateway de pagamento. Ausente quando não há um configurado: criar pagamento responde 503. */
  gateway?: PaymentGateway;
  /** Conciliação sob demanda (Cloud Tasks). Ausente: só o webhook e a varredura diária conciliam. */
  taskQueue?: TaskQueue;
  /** Verificação humana (Turnstile) no cadastro e na recuperação. Ausente: não exige (local, testes e homologação sem chave). */
  human?: HumanVerifier;
  /** Emissão dos ingressos na confirmação (a mesma do webhook), para a conciliação imediata do cartão. */
  issueTickets?: TicketIssuer;
}

export type Role = 'cliente' | 'validador' | 'administrador';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
  /** AAAA-MM-DD. Nula em contas anteriores à 0009 (pedida no próximo checkout) e na equipe. */
  birthDate: string | null;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface AuthState {
  sessionId: string;
  user: AuthUser;
  csrfToken: string;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** Variáveis que o Hono carrega por requisição. */
export interface AuthVariables {
  auth: AuthState | null;
  meta: RequestMeta;
}
