import { rollbackLastMigration } from '../src/db/migrate';
import { logger } from '../src/logger';

const tag = process.argv[2];
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

if (!tag || !url) {
  logger.error('uso: npm run db:rollback -- <tag da última migração>, com DATABASE_URL_DIRECT definida');
  process.exit(1);
}
if (process.env.APP_ENV === 'producao') {
  // Em produção, reverter é decisão humana com backup recente: faça por SQL revisado, não por este atalho.
  logger.error('rollback bloqueado em produção');
  process.exit(1);
}

await rollbackLastMigration(url, tag);
logger.info('migração revertida', { tag });
