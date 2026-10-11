import { randomBytes } from 'node:crypto';
import type pg from 'pg';

export const APP_ROLE = 'partyx_app';
export const BACKUP_ROLE = 'partyx_backup';

const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
const newPassword = () => randomBytes(24).toString('base64url');

/**
 * Garante os papéis do PartyX. Sem privilégios de dono (sem herança ampla, sem superusuário, sem criar banco ou papel).
 * Papel que já existe não é tocado, a menos que `rotate`. Devolve as senhas SÓ dos papéis criados ou rotacionados.
 */
export async function ensureRoles(pool: pg.Pool, options: { rotate?: boolean } = {}) {
  const passwords: Record<string, string | null> = { [APP_ROLE]: null, [BACKUP_ROLE]: null };
  const actions: string[] = [];
  const attrs = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
  for (const role of [APP_ROLE, BACKUP_ROLE]) {
    const exists = ((await pool.query('select 1 from pg_roles where rolname = $1', [role])).rowCount ?? 0) > 0;
    if (exists && !options.rotate) {
      actions.push(`já existe (não alterado): ${role}`);
      continue;
    }
    const pwd = newPassword();
    await pool.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${ident(role)} WITH ${attrs} PASSWORD '${pwd}'`);
    passwords[role] = pwd;
    actions.push(`${exists ? 'senha trocada' : 'papel criado'}: ${role}`);
  }
  await pool.query(`GRANT pg_read_all_data TO ${ident(BACKUP_ROLE)}`); // backup: só leitura
  const db = ((await pool.query('select current_database() as d')).rows[0] as { d: string }).d;
  await pool.query(`GRANT CONNECT ON DATABASE ${ident(db)} TO ${ident(APP_ROLE)}, ${ident(BACKUP_ROLE)}`);
  return { passwords, actions };
}

/**
 * URL de conexão de um papel, a partir da URL direta do dono. A aplicação usa a conexão POOLED do Neon (host com `-pooler`);
 * o backup usa a DIRETA (o `pg_dump` não funciona por PgBouncer).
 */
export function roleUrl(ownerUrl: string, role: string, password: string, pooled: boolean): string {
  const url = new URL(ownerUrl);
  url.username = role;
  url.password = password;
  if (pooled && url.hostname.endsWith('.neon.tech') && !url.hostname.split('.')[0]!.endsWith('-pooler'))
    url.hostname = url.hostname.replace(/^([^.]+)/, '$1-pooler');
  return url.toString();
}
