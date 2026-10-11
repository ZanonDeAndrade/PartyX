import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { APP_ROLE, BACKUP_ROLE, ensureRoles, roleUrl } from '../src/db/appRole';

/**
 * Cria no banco os papéis do PartyX ANTES da primeira migração (a migração 0002 aborta sem `partyx_app`):
 *  - `partyx_app`: aplicação. SEM privilégios de dono: não cria nem apaga tabelas, não apaga pedidos, ingressos nem auditoria.
 *  - `partyx_backup`: só leitura (`pg_read_all_data`), usado pelo backup diário.
 * Criados por SQL com a conexão direta do DONO, nunca pela API do Neon (a API cria o papel dentro de `neon_superuser`, que consegue
 * apagar o histórico: já aconteceu na homologação). Idempotente; a senha de um papel que já existe NÃO é redefinida (use --rotate).
 *
 * A URL (com senha) vai SÓ para a saída padrão; mensagens vão para o erro padrão, sem segredo:
 *   DATABASE_URL_DIRECT=<dono, direta> npm run -s db:create-app-role -- --emit=app    | gcloud secrets versions add database-url        --data-file=-
 *   DATABASE_URL_DIRECT=<dono, direta> npm run -s db:create-app-role -- --emit=backup | gcloud secrets versions add database-url-backup --data-file=-
 * Para emitir as DUAS URLs de uma vez (a senha de um papel só é conhecida na execução que o cria): --emit-to=<pasta nova>
 * grava `database-url` e `database-url-backup` (modo 0600) nessa pasta; quem chama grava nos segredos e APAGA a pasta.
 * Sem --emit nem --emit-to, só garante os papéis.
 */
const owner = process.env.DATABASE_URL_DIRECT;
if (!owner) {
  console.error('defina DATABASE_URL_DIRECT (conexão direta do dono do banco)');
  process.exit(1);
}
const args = process.argv.slice(2);
const emit = args.find(a => a.startsWith('--emit='))?.split('=')[1];
const emitTo = args.find(a => a.startsWith('--emit-to='))?.split('=')[1];
if (emit && emit !== 'app' && emit !== 'backup') {
  console.error('--emit aceita app ou backup');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: owner, max: 1 });
try {
  const { passwords, actions } = await ensureRoles(pool, { rotate: args.includes('--rotate') });
  for (const a of actions) console.error(a);
  if (emitTo) {
    if (!passwords[APP_ROLE] || !passwords[BACKUP_ROLE]) {
      console.error('Algum papel já existia e a senha dele não é conhecida aqui. Use --rotate para gerar as duas senhas.');
      process.exit(2);
    }
    mkdirSync(emitTo, { mode: 0o700 }); // falha se a pasta já existir: nada é sobrescrito
    writeFileSync(join(emitTo, 'database-url'), roleUrl(owner, APP_ROLE, passwords[APP_ROLE]!, true), { mode: 0o600, flag: 'wx' });
    writeFileSync(join(emitTo, 'database-url-backup'), roleUrl(owner, BACKUP_ROLE, passwords[BACKUP_ROLE]!, false), { mode: 0o600, flag: 'wx' });
    console.error(`URLs gravadas em ${emitTo} (apague a pasta depois de gravar nos segredos)`);
  }
  if (emit) {
    const role = emit === 'app' ? APP_ROLE : BACKUP_ROLE;
    const pwd = passwords[role];
    if (!pwd) {
      console.error(`${role} já existia e a senha não é conhecida aqui. Use --rotate para gerar outra e emitir a URL.`);
      process.exit(2);
    }
    process.stdout.write(roleUrl(owner, role, pwd, emit === 'app'));
  }
} finally {
  await pool.end();
}
