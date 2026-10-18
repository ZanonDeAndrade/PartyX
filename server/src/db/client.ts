import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Config } from '../config';
import { logger } from '../logger';
import * as schema from './schema';

export interface Database {
  db: Db;
  /** Consulta mínima para o health check. */
  ping(): Promise<void>;
  /** Consulta direta (usada na conferência da marca de ambiente do banco). */
  query(text: string): Promise<{ rows: unknown[] }>;
  close(): Promise<void>;
}

export function createDrizzle(pool: pg.Pool) {
  return drizzle(pool, { schema });
}

/** Cliente Drizzle tipado com o esquema. */
export type Db = ReturnType<typeof createDrizzle>;

/**
 * Pool do PostgreSQL (Neon). Use a URL pooled da aplicação; migrações usam `DATABASE_URL_DIRECT`.
 * Transações e SQL explícito (`SELECT ... FOR UPDATE`, `UPDATE ... WHERE status = 'valido'`) ficam
 * em módulos de domínio próprios, não espalhados pelas rotas.
 */
export function createDatabase(config: Pick<Config, 'DATABASE_URL' | 'DB_POOL_MAX'>): Database {
  // Conexões paradas fecham em 30 s, antes de o Neon dormir (5 min sem uso): quando ele dorme, o pool já está vazio e a próxima
  // consulta abre uma conexão nova, que acorda o banco (até 5 s de espera).
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  // Conexão PARADA encerrada pelo servidor (o Neon ao dormir ou numa manutenção, uma queda de rede): o pool já a descarta e a
  // próxima consulta abre outra. Sem este ouvinte, o node-postgres transforma o evento em erro não tratado e derruba o processo.
  pool.on('error', error => {
    logger.warn('conexão parada com o banco encerrada; a próxima consulta abre outra', {
      error: error.name,
      code: (error as { code?: string }).code ?? null,
    });
  });
  return {
    db: createDrizzle(pool),
    ping: async () => {
      await pool.query('select 1');
    },
    query: text => pool.query(text),
    close: () => pool.end(),
  };
}
