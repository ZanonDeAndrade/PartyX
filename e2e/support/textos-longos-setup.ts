import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RUN, startServer, stopServer, tsx } from './server';

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
  return () => stopServer(path.join(TEXTOS_DIR, 'server'));
}
