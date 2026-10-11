import { loadConfig } from '../src/config';
import { createDatabase } from '../src/db/client';
import { logger } from '../src/logger';
import { backfillTickets } from '../src/tickets/issuer';

/** Emite os ingressos que faltam em pedidos já pagos. Idempotente: seguro rodar a qualquer momento e em paralelo. */
const config = loadConfig();
if (!config.DATABASE_URL) {
  logger.error('emitir ingressos pendentes: defina DATABASE_URL');
  process.exit(1);
}
const database = createDatabase(config);
try {
  logger.info('ingressos pendentes processados', await backfillTickets({ db: database.db, qr: config.qr }));
} finally {
  await database.close();
}
