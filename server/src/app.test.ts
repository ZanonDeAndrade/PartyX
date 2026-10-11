import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseJson } from './api/validate';
import { createApp } from './app';
import { loadConfig } from './config';
import { createFakeClock } from './providers/clock';

const clock = createFakeClock('2026-10-17T23:40:00Z');

function distWithIndex() {
  const dir = mkdtempSync(path.join(tmpdir(), 'partyx-dist-'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>PartyX</title><div id="root"></div>');
  return dir;
}

describe('API', () => {
  it('responde o health check com o relógio injetado', async () => {
    const app = createApp({ config: loadConfig({}), clock });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', env: 'local', time: '2026-10-17T23:40:00.000Z' });
  });

  it('readiness informa banco não configurado em ambiente local', async () => {
    const res = await createApp({ config: loadConfig({}), clock }).request('/api/health/ready');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', database: 'não configurado' });
  });

  it('readiness devolve 503 sem vazar detalhes quando o banco falha', async () => {
    const pingDatabase = async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:5432 senha=abc');
    };
    const res = await createApp({ config: loadConfig({}), clock, pingDatabase }).request('/api/health/ready');
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(text).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|senha/);
  });

  it('rota de API inexistente devolve JSON 404, não a página do site', async () => {
    const res = await createApp({ config: loadConfig({}), clock }).request('/api/nao-existe');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/json/);
  });

  it('erro inesperado devolve mensagem genérica, sem stack', async () => {
    const extraApiRoutes = new Hono().get('/boom', () => {
      throw new Error('tabela users coluna password_hash');
    });
    const app = createApp({ config: loadConfig({}), clock, extraApiRoutes });
    const res = await app.request('/api/boom');
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).toContain('erro_interno');
    expect(text).not.toMatch(/password_hash|users|at /);
  });

  it('envia cabeçalhos de segurança e um id por requisição', async () => {
    const res = await createApp({ config: loadConfig({}), clock }).request('/api/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBeTruthy();
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});

describe('front-end estático', () => {
  it('devolve index.html para qualquer rota do app (SPA)', async () => {
    const config = loadConfig({ WEB_DIST_DIR: distWithIndex() });
    const res = await createApp({ config, clock }).request('/eventos/noite-neon');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  });

  it('explica quando o front-end não foi compilado', async () => {
    const config = loadConfig({ WEB_DIST_DIR: path.join(tmpdir(), 'partyx-nao-existe') });
    const res = await createApp({ config, clock }).request('/');
    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/não compilado/);
  });
});

describe('validação no servidor', () => {
  const schema = z.object({ email: z.email(), quantidade: z.number().int().min(1) });
  const build = () => {
    const extraApiRoutes = new Hono().post('/teste', async c => c.json(await parseJson(c, schema)));
    return createApp({ config: loadConfig({}), clock, extraApiRoutes });
  };
  const post = (app: ReturnType<typeof build>, body: string) =>
    app.request('/api/teste', { method: 'POST', body, headers: { 'content-type': 'application/json' } });

  it('aceita dados válidos', async () => {
    const res = await post(build(), JSON.stringify({ email: 'a@b.com', quantidade: 2 }));
    expect(res.status).toBe(200);
  });

  it('recusa campos inválidos informando só o campo e a mensagem', async () => {
    const res = await post(build(), JSON.stringify({ email: 'sem-arroba', quantidade: 0 }));
    const body = (await res.json()) as { erro: { detalhes: { campo: string }[] } };
    expect(res.status).toBe(422);
    expect(body.erro.detalhes.map(d => d.campo).sort()).toEqual(['email', 'quantidade']);
    expect(JSON.stringify(body)).not.toContain('sem-arroba');
  });

  it('recusa corpo que não é JSON', async () => {
    const res = await post(build(), '{quebrado');
    expect(res.status).toBe(400);
  });
});
