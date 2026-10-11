import { loadConfig } from '../src/config';
import { createDatabase } from '../src/db/client';
import { logger } from '../src/logger';
import { backfillBannerVariants } from '../src/media/bannerVariants';
import { bannerStorageFor } from '../src/providers/bannerStorage';

/**
 * Versões menores dos banners enviados antes da migração 0007 (`npm run banners:versoes`).
 * Padrão: só confere e conta (nada é gravado). Para gravar: `-- --executar`.
 * Em produção, além disso, `--producao-confirmado`: é decisão humana, depois de conferir a contagem sem gravar.
 */
const args = new Set(process.argv.slice(2));
const execute = args.has('--executar');
const config = loadConfig();
if (!config.DATABASE_URL) {
  logger.error('versões dos banners: defina DATABASE_URL');
  process.exit(1);
}
if (execute && config.APP_ENV === 'producao' && !args.has('--producao-confirmado')) {
  logger.error('versões dos banners: em produção, rode primeiro sem --executar e confirme com --producao-confirmado');
  process.exit(1);
}
const storage = bannerStorageFor(config);
if (!storage) {
  logger.error('versões dos banners: armazenamento não configurado (BANNER_BUCKET)');
  process.exit(1);
}
const database = createDatabase(config);
try {
  const report = await backfillBannerVariants(
    {
      db: database.db,
      storage,
      fetchImage: async url => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      },
    },
    { execute },
  );
  logger.info(execute ? 'versões dos banners gravadas' : 'versões dos banners: conferência sem gravar', {
    pendentes: report.pending,
    atualizados: report.updated,
    ignorados: report.skipped.length,
  });
  for (const s of report.skipped) logger.warn('banner ignorado', { eventId: s.eventId, motivo: s.reason });
} finally {
  await database.close();
}
