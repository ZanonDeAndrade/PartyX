import { readFileSync } from 'node:fs';
import path from 'node:path';

export const AUDIT_ROOT = path.resolve(import.meta.dirname, '../..');
export const RUN_DIR = path.join(AUDIT_ROOT, '.run');
export const PORT = 8111;

export interface Buyer {
  id: string;
  name: string;
  email: string;
  cpf: string;
  birth: string;
  password: string;
}
export interface SeedEvent {
  id: string;
  slug: string;
  name: string;
  startsAt: string;
  types: Record<string, string>;
}
export interface AuditState {
  base: string;
  db: string;
  team: Record<'admin' | 'validador' | 'validador2', { email: string; password: string }>;
  buyers: Record<string, Buyer>;
  events: Record<string, SeedEvent>;
  promoters: { ativo: string; inativo: string };
  /** Pedidos pagos criados no setup pela API (gateway fictício). */
  orders: Record<string, { id: string; tickets: { id: string; shortCode: string; qr: string }[] }>;
  lots: { pista1: string; pista2: string };
  serverDir: string;
}

export const readState = (): AuditState => JSON.parse(readFileSync(path.join(RUN_DIR, 'state.json'), 'utf8')) as AuditState;
