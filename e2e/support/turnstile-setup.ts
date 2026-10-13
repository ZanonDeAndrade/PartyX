import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RUN, startServer, testDatabaseUrl, tsx } from './server';

export const TS_DIR = path.join(RUN, 'turnstile');

/**
 * Dois servidores LOCAIS com o Turnstile LIGADO e as chaves de TESTE públicas da Cloudflare: uma de site que sempre aprova e outra
 * que sempre bloqueia; a secreta de teste aceita qualquer token. Banco descartável do PostgreSQL de teste (semente do roteiro).
 */
export default async function setup() {
  rmSync(TS_DIR, { recursive: true, force: true });
  mkdirSync(TS_DIR, { recursive: true });
  const seedFile = path.join(TS_DIR, 'seed.json');
  tsx('e2e/support/seed-roteiro.mts', [seedFile], { TEST_DATABASE_URL: testDatabaseUrl() });
  const { url } = JSON.parse(readFileSync(seedFile, 'utf8'));
  const env = (siteKey: string) => ({
    DATABASE_URL: url,
    DATABASE_URL_DIRECT: url,
    PAYMENT_GATEWAY: 'mock',
    TURNSTILE_ENABLED: 'true',
    TURNSTILE_SITE_KEY: siteKey,
    TURNSTILE_SECRET: '1x0000000000000000000000000000000AA',
  });
  const passa = await startServer(path.join(TS_DIR, 'passa'), 8104, env('1x00000000000000000000AA'));
  const bloqueia = await startServer(path.join(TS_DIR, 'bloqueia'), 8105, env('2x00000000000000000000AB'));
  writeFileSync(path.join(TS_DIR, 'state.json'), JSON.stringify({ passa, bloqueia }));
}
