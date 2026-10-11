import { createDatabase } from '../src/db/client';
import { loadConfig } from '../src/config';
import { logger } from '../src/logger';
import { expireOverdue } from '../src/orders/service';
import { systemClock } from '../src/providers/clock';

/**
 * Marca como vencidos as reservas e os pedidos pendentes cujo prazo passou. Seguro rodar a qualquer momento e em paralelo.
 * O estoque já volta sem esta rotina; ela acerta os estados para painel e relatórios. O agendamento autenticado
 * (Cloud Scheduler) entra no Prompt 12, junto com a reconsulta de pagamentos pendentes.
 */
const config = loadConfig();
if (!config.DATABASE_URL) {
  logger.error('expirar reservas: defina DATABASE_URL');
  process.exit(1);
}
const database = createDatabase(config);
try {
  const result = await expireOverdue({ db: database.db, clock: systemClock });
  logger.info('reservas vencidas processadas', result);
} finally {
  await database.close();
}
