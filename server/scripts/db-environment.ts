import pg from 'pg';
import {
  DatabaseEnvironmentError,
  assertDatabaseEnvironment,
  isCloudEnvironment,
  markDatabaseEnvironmentSafely,
  neonEndpointId,
  readDatabaseEnvironment,
} from '../src/db/environment';

/**
 * Marca de ambiente do banco. Uso (com a conexão DIRETA em DATABASE_URL_DIRECT; nada de URL ou senha é impresso):
 *   npm run -s db:env -- show                      mostra a marca
 *   npm run -s db:env -- mark producao             marca o banco (precisa do dono; recusa se já tiver OUTRA marca)
 *   npm run -s db:env -- check producao            sai com 1 se o banco não for de produção (usado pelo deploy.sh)
 * Em `check`, se DATABASE_URL_POOLED também vier, confere que as duas URLs são do MESMO banco do Neon (mesmo endpoint).
 */
const [cmd, envArg] = process.argv.slice(2);
const direct = process.env.DATABASE_URL_DIRECT;
if (!cmd || !direct) {
  console.error('uso: DATABASE_URL_DIRECT=<url direta> npm run db:env -- show|mark|check [homologacao|producao]');
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: direct, max: 1 });
try {
  if (cmd === 'show') {
    console.log((await readDatabaseEnvironment(pool)) ?? '(sem marca)');
  } else if (cmd === 'mark') {
    if (!envArg || !isCloudEnvironment(envArg)) throw new Error('informe homologacao ou producao');
    await markDatabaseEnvironmentSafely(pool, envArg);
    console.log(`banco marcado como ${envArg}`);
  } else if (cmd === 'check') {
    if (!envArg) throw new Error('informe o ambiente esperado');
    await assertDatabaseEnvironment(pool, envArg);
    const pooled = process.env.DATABASE_URL_POOLED;
    if (pooled && neonEndpointId(pooled) !== neonEndpointId(direct))
      throw new DatabaseEnvironmentError('RECUSADO: a URL pooled e a direta apontam para bancos diferentes.');
    console.log(`ok: o banco é de ${envArg}`);
  } else throw new Error(`comando desconhecido: ${cmd}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'erro');
  process.exitCode = error instanceof DatabaseEnvironmentError ? 1 : 2;
} finally {
  await pool.end();
}
