import { createDatabase } from '../src/db/client';
import { loadConfig } from '../src/config';
import { systemClock } from '../src/providers/clock';
import { renderWeeklyReview, weeklyReview } from '../src/ops/weeklyReview';

/** Revisão semanal (somente leitura). Uso: `npm run ops:weekly`. Sai com código 2 se algo exige atenção. */
const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error('defina DATABASE_URL');
  process.exit(1);
}
const database = createDatabase(config);
try {
  const review = await weeklyReview(database.db, systemClock.now());
  console.log(renderWeeklyReview(review));
  if (review.attention.length > 0) process.exitCode = 2;
} finally {
  await database.close();
}
