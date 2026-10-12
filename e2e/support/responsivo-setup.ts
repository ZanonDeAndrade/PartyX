import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, RUN, startServer, testDatabaseUrl, tsx } from './server';

export const RESP_DIR = path.join(RUN, 'responsivo');
export const RESP_PORT = 8102;

export interface RespState {
  base: string;
  /** IDs dos pedidos, ingressos e QR criados por infra/ui/flows-ui.mts. */
  S: Record<string, string> & { freshQrs: string[]; events: Record<string, string> };
  types: Record<string, Record<string, string>>;
}
export const readRespState = (): RespState => JSON.parse(readFileSync(path.join(RESP_DIR, 'state.json'), 'utf8'));

/**
 * Todas as telas e estados com dados FICTÍCIOS e o gateway fictício (os estados de pedido vêm do simulador local): a mesma semente
 * das capturas de UI (infra/ui/seed-ui.mts e flows-ui.mts), num banco descartável do PostgreSQL de teste.
 */
export default async function setup() {
  rmSync(RESP_DIR, { recursive: true, force: true });
  mkdirSync(RESP_DIR, { recursive: true });
  // Evidências geradas a cada rodada: nenhuma captura antiga fica misturada com a nova.
  rmSync(path.join(ROOT, 'docs/evidencias/responsividade'), { recursive: true, force: true });
  const adminUrl = testDatabaseUrl();
  tsx('infra/ui/seed-ui.mts', [RESP_DIR], { TEST_DATABASE_URL: adminUrl });
  const seed = JSON.parse(readFileSync(path.join(RESP_DIR, 'seed-ui.json'), 'utf8'));
  const base = await startServer(path.join(RESP_DIR, 'server'), RESP_PORT, {
    DATABASE_URL: seed.url,
    DATABASE_URL_DIRECT: seed.url,
    PAYMENT_GATEWAY: 'mock',
    // Pedidos pendentes precisam continuar pendentes durante a varredura inteira.
    RESERVATION_MINUTES: '60',
  });
  tsx('infra/ui/flows-ui.mts', [RESP_DIR], { BASE_URL: base });
  const S = JSON.parse(readFileSync(path.join(RESP_DIR, 'state-ui.json'), 'utf8'));
  const types = Object.fromEntries(
    Object.entries(seed.events as Record<string, { types: Record<string, string> }>).map(([slug, e]) => [slug, e.types]),
  );
  const state: RespState = { base, S, types };
  writeFileSync(path.join(RESP_DIR, 'state.json'), JSON.stringify(state, null, 1));
  console.log(`\nresponsividade: servidor local em ${base}, gateway FICTÍCIO, dados fictícios de infra/ui\n`);
}
