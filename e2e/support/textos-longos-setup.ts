import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { RUN, startServer, stopServer, testDatabaseUrl, tsx } from './server';

export const TEXTOS_DIR = path.join(RUN, 'textos-longos');
export const TEXTOS_PORT = 8103;

export interface TextosState {
  base: string;
  eventId: string;
  typeId: string;
  orderId: string;
  ticketId: string;
}
export const readTextosState = (): TextosState => JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'state.json'), 'utf8'));

/** Banco descartável com os textos longos (seed-textos-longos.mts) e o servidor LOCAL com o build atual do front-end. */
export default async function setup() {
  rmSync(TEXTOS_DIR, { recursive: true, force: true });
  mkdirSync(TEXTOS_DIR, { recursive: true });
  tsx('e2e/support/seed-textos-longos.mts', [TEXTOS_DIR]);
  const seed = JSON.parse(readFileSync(path.join(TEXTOS_DIR, 'seed.json'), 'utf8'));
  const base = await startServer(path.join(TEXTOS_DIR, 'server'), TEXTOS_PORT, {
    DATABASE_URL: seed.url,
    DATABASE_URL_DIRECT: seed.url,
    PAYMENT_GATEWAY: 'mock',
  });
  writeFileSync(path.join(TEXTOS_DIR, 'state.json'), JSON.stringify({ base, ...seed }, null, 1));
  return async () => {
    stopServer(path.join(TEXTOS_DIR, 'server'));
    // Apaga o banco descartável: um banco que sobrasse com permissões para o partyx_app impediria os testes de cluster
    // (appRole.cluster.test.ts) de apagar e recriar o papel.
    const admin = new pg.Client({ connectionString: testDatabaseUrl() });
    await admin.connect();
    await admin.query(`drop database if exists ${new URL(seed.url).pathname.slice(1)} with (force)`).finally(() => admin.end());
  };
}
