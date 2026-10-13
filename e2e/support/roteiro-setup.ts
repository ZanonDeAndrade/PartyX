import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { assertDatabaseEnvironment } from '../../server/src/db/environment';
import { newRunId, type RoteiroRun } from './run';
import { ROOT, RUN, startServer, testDatabaseUrl, tsx } from './server';

export const ROTEIRO_DIR = path.join(RUN, 'roteiro');
export const ROTEIRO_PORT = 8101;

export interface RoteiroState {
  base: string;
  db: string;
  /** `sandbox`: Mercado Pago, ambiente de teste (credenciais de usuário de teste). `ficticio`: gateway fictício local. */
  gateway: 'sandbox' | 'ficticio';
  otherEvent: { id: string; slug: string; type: string };
  mpCollector?: string;
  /** Rodada contra a HOMOLOGAÇÃO (E2E_BASE_URL): sem servidor local, e-mails pela caixa de captura, dados sufixados pela rodada. */
  remote: boolean;
  run: RoteiroRun;
}

/** Em homologação, a URL do banco (com senha) não vai para o arquivo de estado: fica só na variável de ambiente do processo. */
export const readState = (): RoteiroState => {
  const state = JSON.parse(readFileSync(path.join(ROTEIRO_DIR, 'state.json'), 'utf8')) as RoteiroState;
  if (state.db === 'env:E2E_DATABASE_URL') state.db = process.env.E2E_DATABASE_URL ?? '';
  return state;
};

/** Só a homologação: Hosting `partyx-hml.web.app` ou o run.app do serviço `partyx-hml`. Qualquer outra base é recusada. */
function homologacaoBase(raw: string): string {
  const u = new URL(raw);
  const ok = u.protocol === 'https:' && (u.host === 'partyx-hml.web.app' || /^partyx-hml-[a-z0-9.-]+\.run\.app$/.test(u.host));
  if (!ok || /prod/i.test(u.host)) throw new Error(`recusado: E2E_BASE_URL precisa ser a homologação (recebido ${u.host})`);
  return u.origin;
}

/**
 * Escolhe o gateway: `E2E_GATEWAY=sandbox|ficticio`; sem a variável, usa o sandbox do Mercado Pago se as credenciais de TESTE
 * estiverem no `.env.local` (`scripts/setup-mp-credentials.sh`) e o fictício se não estiverem. Recusa conta que não seja usuário
 * de teste. Nada aqui imprime token ou assinatura secreta.
 */
async function chooseGateway(): Promise<{ gateway: RoteiroState['gateway']; env: Record<string, string>; collector?: string }> {
  const wanted = process.env.E2E_GATEWAY ?? 'auto';
  if (wanted === 'ficticio') return { gateway: 'ficticio', env: { PAYMENT_GATEWAY: 'mock' } };
  const local = path.join(ROOT, '.env.local');
  if (existsSync(local)) process.loadEnvFile(local);
  const { MP_ACCESS_TOKEN: token, MP_PUBLIC_KEY: pub, MP_WEBHOOK_SECRET: secret } = process.env;
  if (!token || !pub || !secret) {
    if (wanted === 'sandbox') throw new Error('E2E_GATEWAY=sandbox sem as credenciais de teste do Mercado Pago no .env.local');
    return { gateway: 'ficticio', env: { PAYMENT_GATEWAY: 'mock' } };
  }
  const me = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${token}` } });
  const body = (await me.json().catch(() => null)) as { id?: number; tags?: string[] } | null;
  if (!me.ok || !body?.id) throw new Error(`Mercado Pago: não foi possível conferir a conta (${me.status})`);
  if (!body.tags?.includes('test_user'))
    throw new Error('recusado: as credenciais do .env.local não são de usuário de teste do Mercado Pago');
  const collector = String(body.id);
  if (process.env.MP_COLLECTOR_ID && process.env.MP_COLLECTOR_ID !== collector)
    throw new Error('MP_COLLECTOR_ID não confere com a conta das credenciais');
  return {
    gateway: 'sandbox',
    collector,
    env: {
      PAYMENT_GATEWAY: 'mercadopago',
      GATEWAY_ENVIRONMENT: 'sandbox',
      MP_ACCESS_TOKEN: token,
      MP_PUBLIC_KEY: pub,
      MP_WEBHOOK_SECRET: secret,
      MP_COLLECTOR_ID: collector,
    },
  };
}

export default async function setup() {
  rmSync(ROTEIRO_DIR, { recursive: true, force: true });
  mkdirSync(ROTEIRO_DIR, { recursive: true });
  if (process.env.E2E_BASE_URL) return setupHomologacao(process.env.E2E_BASE_URL);
  const adminUrl = testDatabaseUrl();
  const { gateway, env, collector } = await chooseGateway();
  const seedFile = path.join(ROTEIRO_DIR, 'seed.json');
  tsx('e2e/support/seed-roteiro.mts', [seedFile], { TEST_DATABASE_URL: adminUrl });
  const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
  const base = await startServer(path.join(ROTEIRO_DIR, 'server'), ROTEIRO_PORT, {
    DATABASE_URL: seed.url,
    DATABASE_URL_DIRECT: seed.url,
    // 30 min: o mínimo do Pix no Mercado Pago (D-03). Abaixo disso o Pix nem aparece com o gateway real.
    RESERVATION_MINUTES: '30',
    ...env,
  });
  const state: RoteiroState = {
    base,
    db: seed.url,
    gateway,
    otherEvent: seed.otherEvent,
    mpCollector: collector,
    remote: false,
    run: seed.run,
  };
  writeFileSync(path.join(ROTEIRO_DIR, 'state.json'), JSON.stringify(state, null, 1));
  console.log(`\nroteiro 11.2: servidor local em ${base}, gateway ${gateway === 'sandbox' ? 'SANDBOX do Mercado Pago' : 'FICTÍCIO'}\n`);
}

/**
 * Rodada contra a HOMOLOGAÇÃO, sempre com o Mercado Pago de TESTE. Exige E2E_DATABASE_URL (banco com a marca `partyx-env:homologacao`,
 * conferida aqui e na semente) e E2E_SMTP_URL (caixa de captura). Nada é apagado depois: os dados ficam identificados pela rodada.
 */
async function setupHomologacao(rawBase: string) {
  const base = homologacaoBase(rawBase);
  const db = process.env.E2E_DATABASE_URL;
  if (!db) throw new Error('E2E_DATABASE_URL ausente (use infra/testes/roteiro-hml.sh)');
  if (!process.env.E2E_SMTP_URL) throw new Error('E2E_SMTP_URL ausente (use infra/testes/roteiro-hml.sh)');
  const pool = new pg.Pool({ connectionString: db, max: 1 });
  try {
    await assertDatabaseEnvironment(pool, 'homologacao');
  } finally {
    await pool.end();
  }
  if (process.env.E2E_GATEWAY && process.env.E2E_GATEWAY !== 'sandbox') throw new Error('homologação: só com o Mercado Pago de teste');
  process.env.E2E_GATEWAY = 'sandbox';
  const { gateway, collector } = await chooseGateway();
  const health = await fetch(`${base}/api/health/ready`);
  if (!health.ok) throw new Error(`homologação fora do ar: /api/health/ready ${health.status}`);
  const runId = process.env.E2E_RUN_ID ?? newRunId();
  const seedFile = path.join(ROTEIRO_DIR, 'seed.json');
  tsx('e2e/support/seed-roteiro.mts', [seedFile], { E2E_REMOTE_DB: db, E2E_RUN_ID: runId });
  const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
  const state: RoteiroState = {
    base,
    db: seed.url,
    gateway,
    otherEvent: seed.otherEvent,
    mpCollector: collector,
    remote: true,
    run: seed.run,
  };
  writeFileSync(path.join(ROTEIRO_DIR, 'state.json'), JSON.stringify(state, null, 1));
  console.log(`\nroteiro 11.2: HOMOLOGAÇÃO ${base}, rodada ${runId}, Mercado Pago de TESTE\n`);
}
