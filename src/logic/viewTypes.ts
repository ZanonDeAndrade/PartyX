import type { AppState, Database, Loose, User } from '../types';

export type { Loose };

/** Contexto repassado a cada construtor de view-model. */
export interface ViewCtx {
  s: AppState;
  db: Database;
  route: string;
  mob: boolean;
  desk: boolean;
  fw: number;
  role: string | null;
  /** Pode ser nulo quando não há sessão; as telas protegidas só são montadas com usuário. */
  u: User;
}

/** Objeto que os templates consomem; o formato muda por tela. */
export type ViewModel = Loose;
