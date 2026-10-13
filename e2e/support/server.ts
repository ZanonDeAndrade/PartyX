import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Raiz do repositório e pasta de trabalho dos testes ponta a ponta (fora do Git: `e2e/.run`). */
export const ROOT = path.resolve(import.meta.dirname, '../..');
export const RUN = path.join(ROOT, 'e2e/.run');

/** Banco de teste do `.env.test` (PostgreSQL descartável do docker compose). Nunca o Neon. */
export function testDatabaseUrl(): string {
  // Como em `npm run test:db`: o .env.test é lido pelo shell (tem expansão de variáveis, que o loadEnvFile do Node não faz).
  if (!process.env.TEST_DATABASE_URL && existsSync(path.join(ROOT, '.env.test')))
    process.env.TEST_DATABASE_URL = execFileSync('bash', ['-c', 'set -a; . ./.env.test; printf %s "$TEST_DATABASE_URL"'], {
      cwd: ROOT,
    }).toString();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL ausente: rode `npm run db:test:up` e confira o .env.test');
  if (/neon\.tech/.test(url)) throw new Error('recusado: os testes ponta a ponta só rodam no PostgreSQL de teste');
  return url;
}

export function tsx(script: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  execFileSync(path.join(ROOT, 'node_modules/.bin/tsx'), [script, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PARTYX_ALLOW_MISSING_APP_ROLE: '1', ...env },
  });
}

/** Sobe o servidor LOCAL (APP_ENV=local) com o build do front-end em `dist`. Grava o PID para o encerramento. */
export async function startServer(dir: string, port: number, env: Record<string, string>) {
  mkdirSync(dir, { recursive: true });
  if (!existsSync(path.join(ROOT, 'dist/index.html'))) throw new Error('rode `npx vite build` antes (falta dist/index.html)');
  const log = openSync(path.join(dir, 'server.log'), 'w');
  const child = spawn(
    process.execPath,
    ['--import', path.join(ROOT, 'node_modules/tsx/dist/loader.mjs'), path.join(ROOT, 'server/src/index.ts')],
    {
      // Pasta própria: os e-mails capturados e os banners locais ficam em <dir>/.data, sem misturar com o .data do projeto.
      cwd: dir,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        APP_ENV: 'local',
        PORT: String(port),
        WEB_DIST_DIR: path.join(ROOT, 'dist'),
        PUBLIC_BASE_URL: `http://localhost:${port}`,
        TRUSTED_PROXY_HOPS: '1',
        PARTYX_SUPPORT_EMAIL: 'atendimento@partyx.test',
        PARTYX_SUPPORT_WHATSAPP: '+55 11 90000-0000',
        PARTYX_ALLOW_MISSING_APP_ROLE: '1',
        ...env,
      },
      stdio: ['ignore', log, log],
      detached: true,
    },
  );
  child.unref();
  writeFileSync(path.join(dir, 'server.pid'), String(child.pid));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return base;
    } catch {
      // ainda subindo
    }
    if (child.exitCode !== null) break;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`o servidor não subiu; veja ${path.join(dir, 'server.log')}`);
}

export function stopServer(dir: string) {
  const file = path.join(dir, 'server.pid');
  if (!existsSync(file)) return;
  const pid = Number(readFileSync(file, 'utf8'));
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // já encerrado
    }
  }
}
