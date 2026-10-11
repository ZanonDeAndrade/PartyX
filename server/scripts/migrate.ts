import { runMigrations } from '../src/db/migrate';
import { logger } from '../src/logger';

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  logger.error('migração: defina DATABASE_URL_DIRECT (ou DATABASE_URL)');
  process.exit(1);
}

// Só o ambiente local pode dispensar o papel `partyx_app`. Homologação e produção abortam se ele não existir.
const appEnv = process.env.APP_ENV ?? 'local';
await runMigrations(url, 'drizzle', { allowMissingAppRole: appEnv === 'local', expectedEnvironment: appEnv });
logger.info('migrações aplicadas', { appEnv: process.env.APP_ENV ?? 'local' });
