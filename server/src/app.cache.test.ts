import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadConfig } from './config';
import { createFakeClock } from './providers/clock';

/** Política de cache atrás do Firebase Hosting: API nunca cacheada; assets com hash 1 ano; index.html sempre revalidado. */
function appWithDist() {
  const dist = mkdtempSync(path.join(tmpdir(), 'partyx-dist-'));
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(
    path.join(dist, 'index.html'),
    '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
  );
  writeFileSync(path.join(dist, 'assets', 'index-AbC123.js'), 'console.log(1)');
  writeFileSync(path.join(dist, 'assets', 'index-AbC123.css'), 'body{}');
  writeFileSync(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  mkdirSync(path.join(dist, 'brand'));
  writeFileSync(path.join(dist, 'brand', 'partyx-logo-email.png'), Buffer.alloc(64, 3));
  mkdirSync(path.join(dist, 'intro'));
  writeFileSync(path.join(dist, 'intro', 'partyx-intro.mp4'), Buffer.alloc(4096, 1));
  const config = loadConfig({ APP_ENV: 'local', WEB_DIST_DIR: dist, PAYMENT_GATEWAY: 'none' });
  return createApp({
    config,
    clock: createFakeClock('2026-10-10T12:00:00Z'),
    pingDatabase: async () => {
      throw new Error('banco fora');
    },
  });
}

describe('política de cache', () => {
  const app = appWithDist();
  const cc = async (path: string, init?: RequestInit) => (await app.request(path, init)).headers.get('cache-control');

  it('toda resposta de /api é private, no-store: sucesso, erro do banco, 404 e método errado', async () => {
    for (const p of [
      '/api/health',
      '/api/health/ready',
      '/api/nao-existe',
      '/api/auth/nao-existe',
      '/api/public/events',
    ]) {
      expect(await cc(p), p).toBe('private, no-store');
    }
    expect(await cc('/api/health', { method: 'POST' }), 'POST /api/health').toBe('private, no-store');
    expect((await app.request('/api/health/ready')).status).toBe(503); // o erro também não é cacheado
  });

  it('arquivos com hash em /assets: 1 ano e imutável', async () => {
    for (const p of ['/assets/index-AbC123.js', '/assets/index-AbC123.css'])
      expect(await cc(p), p).toBe('public, max-age=31536000, immutable');
  });

  it('index.html e qualquer rota do app (fallback): no-cache, nunca imutável', async () => {
    for (const p of ['/', '/index.html', '/meus-ingressos', '/rota/que/nao/existe']) {
      const value = await cc(p);
      expect(value, p).toBe('no-cache');
      expect(value ?? '', p).not.toMatch(/immutable|max-age/);
    }
    expect(await cc('/portaria')).toBe('private, no-store'); // redirecionamento dependente da sessão
  });

  it('demais estáticos (ícone) têm prazo curto', async () => {
    expect(await cc('/favicon.svg')).toBe('public, max-age=3600');
  });

  it('vídeo da abertura: tipo certo, aceita Range (Safari do iPhone) e o pedaço também tem prazo curto', async () => {
    for (const [file, type] of [['/intro/partyx-intro.mp4', 'video/mp4']] as const) {
      const full = await app.request(file);
      expect(full.status, file).toBe(200);
      expect(full.headers.get('content-type'), file).toBe(type);
      expect(full.headers.get('cache-control'), file).toBe('public, max-age=3600');
      const part = await app.request(file, { headers: { Range: 'bytes=0-1' } });
      expect(part.status, file).toBe(206);
      expect(part.headers.get('content-range'), file).toBe('bytes 0-1/4096');
      expect(part.headers.get('accept-ranges'), file).toBe('bytes');
      expect(part.headers.get('cache-control'), file).toBe('public, max-age=3600');
    }
  });

  it('só a logo da marca pode ser carregada de outra origem (e-mails); o resto continua same-origin', async () => {
    const logo = await app.request('/brand/partyx-logo-email.png');
    expect(logo.status).toBe(200);
    expect(logo.headers.get('content-type')).toBe('image/png');
    expect(logo.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    for (const p of ['/', '/favicon.svg', '/intro/partyx-intro.mp4', '/assets/index-AbC123.js', '/api/health'])
      expect((await app.request(p)).headers.get('cross-origin-resource-policy'), p).toBe('same-origin');
  });

  it('o cookie de sessão se chama __session (único aceito pelo Firebase Hosting)', async () => {
    const { SESSION_COOKIE } = await import('./auth/sessions');
    expect(SESSION_COOKIE).toBe('__session');
  });
});
