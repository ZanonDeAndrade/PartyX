/** Qualquer coisa que faça consultas (pool do `pg`, ou o `database` da aplicação). */
export interface Queryable {
  query(text: string): Promise<{ rows: unknown[] }>;
}

/**
 * Marca de ambiente DENTRO do banco. Impede que a produção use o banco da homologação (e o inverso) por engano de URL, de segredo ou
 * de copiar e colar: o banco declara a que ambiente pertence e a aplicação e a migração recusam um banco de outro ambiente.
 *
 * A marca é o **comentário do banco** (`COMMENT ON DATABASE ... IS 'partyx-env:producao'`). Foi a escolha que funciona no Neon: o dono
 * NÃO consegue definir parâmetros personalizados (`ALTER DATABASE ... SET partyx.x` dá "permission denied to set parameter"), mas consegue
 * comentar o próprio banco; qualquer papel lê o comentário; ele existe antes de qualquer migração; e o papel da aplicação não o altera. Vale mesmo que alguém aponte o segredo de produção para o Neon errado: o host não importa,
 * a marca é do banco.
 *
 * Ambientes de nuvem (homologacao e producao) EXIGEM a marca; banco sem marca é recusado (a marca é posta por `deploy.sh roles`,
 * `npm run db:env -- mark <ambiente>`). O ambiente local não confere nada.
 */
export const CLOUD_ENVIRONMENTS = ['homologacao', 'producao'] as const;
export type CloudEnvironment = (typeof CLOUD_ENVIRONMENTS)[number];
export const isCloudEnvironment = (v: string): v is CloudEnvironment => (CLOUD_ENVIRONMENTS as readonly string[]).includes(v);

export type EnvironmentCheck =
  | { ok: true }
  | { ok: false; reason: 'sem_marca' | 'outro_ambiente'; message: string };

/** Julgamento puro: o ambiente esperado contra a marca lida do banco. */
export function judgeDatabaseEnvironment(expected: string, marker: string | null): EnvironmentCheck {
  if (!isCloudEnvironment(expected)) return { ok: true }; // local e testes: sem conferência
  if (!marker)
    return {
      ok: false,
      reason: 'sem_marca',
      message: `O banco não tem marca de ambiente e este é ${expected}. Marque-o (npm run db:env -- mark ${expected}) depois de confirmar que é o banco certo.`,
    };
  if (marker !== expected)
    return {
      ok: false,
      reason: 'outro_ambiente',
      message: `RECUSADO: este é o ambiente ${expected}, mas o banco pertence ao ambiente ${marker}. Confira a DATABASE_URL.`,
    };
  return { ok: true };
}

const PREFIX = 'partyx-env:';

export async function readDatabaseEnvironment(pool: Queryable): Promise<string | null> {
  const r = await pool.query(
    "select shobj_description(oid, 'pg_database') as c from pg_database where datname = current_database()",
  );
  const comment = (r.rows[0] as { c: string | null } | undefined)?.c ?? null;
  return comment?.startsWith(PREFIX) ? comment.slice(PREFIX.length).trim() || null : null;
}

/** Marca o banco (precisa do dono). Vale para conexões novas. Só aceita ambientes de nuvem. */
export async function markDatabaseEnvironment(pool: Queryable, env: CloudEnvironment): Promise<void> {
  if (!isCloudEnvironment(env)) throw new Error(`ambiente inválido: ${env}`);
  const db = ((await pool.query('select current_database() as d')).rows[0] as { d: string }).d;
  await pool.query(`COMMENT ON DATABASE "${db.replaceAll('"', '""')}" IS '${PREFIX}${env}'`);
}

/** Marca o banco, mas recusa remarcar um banco que já pertence a OUTRO ambiente (a marca não se troca por engano). */
export async function markDatabaseEnvironmentSafely(pool: Queryable, env: CloudEnvironment): Promise<void> {
  const current = await readDatabaseEnvironment(pool);
  if (current && current !== env) throw new DatabaseEnvironmentError(`RECUSADO: o banco já pertence a ${current}. Não vou remarcar.`);
  await markDatabaseEnvironment(pool, env);
}

/** Lança se o banco não for do ambiente esperado. */
export async function assertDatabaseEnvironment(pool: Queryable, expected: string): Promise<void> {
  const verdict = judgeDatabaseEnvironment(expected, isCloudEnvironment(expected) ? await readDatabaseEnvironment(pool) : null);
  if (!verdict.ok) throw new DatabaseEnvironmentError(verdict.message);
}

export class DatabaseEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseEnvironmentError';
  }
}

/** Identificador do endpoint do Neon (ep-...), sem `-pooler`: a URL pooled e a direta do mesmo banco têm o mesmo. */
export function neonEndpointId(url: string): string | null {
  try {
    return new URL(url).hostname.split('.')[0]!.replace(/-pooler$/, '') || null;
  } catch {
    return null;
  }
}
