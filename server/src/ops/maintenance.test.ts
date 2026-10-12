import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createFakeClock } from '../providers/clock';
import { openDuringMaintenance } from './maintenance';

const clock = createFakeClock('2026-10-17T23:40:00Z');
const CONTACT = {
  PARTYX_SUPPORT_EMAIL: 'atendimento@exemplo.test',
  PARTYX_SUPPORT_WHATSAPP: '+55 11 91234-5678',
  PARTYX_SUPPORT_HOURS: 'Segunda a sexta, das 10h às 18h',
  PARTYX_LEGAL_NAME: 'Empresa Exemplo Ltda',
};
function dist() {
  const dir = mkdtempSync(path.join(tmpdir(), 'partyx-dist-'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>PartyX</title><div id="root"></div>');
  return dir;
}
const app = (env: Record<string, string>) => createApp({ config: loadConfig({ WEB_DIST_DIR: dist(), ...env }), clock });

describe('manutenção (G06)', () => {
  it('ligada: qualquer página vira o aviso 503, sem cache, com o contato da PartyX e sem prometer 24 horas', async () => {
    const a = app({ MAINTENANCE_MODE: 'true', ...CONTACT });
    for (const p of ['/', '/eventos/noite-neon', '/criar-conta', '/admin', '/portaria', '/qualquer']) {
      const res = await a.request(p);
      expect(res.status, p).toBe(503);
      expect(res.headers.get('cache-control'), p).toBe('no-store');
      const html = await res.text();
      expect(html).toContain('Site em manutenção');
      expect(html).toContain('mailto:atendimento@exemplo.test');
      expect(html).toContain('https://wa.me/5511912345678');
      expect(html).toContain('Segunda a sexta, das 10h às 18h');
      expect(html).toContain('Empresa Exemplo Ltda');
      expect(html).not.toMatch(/24\s*h|24 horas|vinte e quatro/i);
      expect(html).not.toMatch(/—/);
      expect(html).not.toContain('<script');
    }
    expect((await a.request('/', { method: 'HEAD' })).status).toBe(503);
  });

  it('ligada: a API responde 503 manutencao com o contato; alterações também são recusadas', async () => {
    const a = app({ MAINTENANCE_MODE: 'true', ...CONTACT });
    const res = await a.request('/api/public/site');
    expect(res.status).toBe(503);
    const body = (await res.json()) as { erro: { codigo: string; detalhes: { contato: unknown } } };
    expect(body.erro.codigo).toBe('manutencao');
    expect(body.erro.detalhes.contato).toEqual({
      email: 'atendimento@exemplo.test',
      whatsapp: '+55 11 91234-5678',
      hours: 'Segunda a sexta, das 10h às 18h',
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await a.request('/api/auth/register', { method: 'POST', body: '{}' })).status).toBe(503);
    expect((await a.request('/qualquer', { method: 'POST' })).status).toBe(503);
  });

  it('ligada: saúde, webhook do gateway, rotinas internas e a logo continuam fora do bloqueio', async () => {
    const a = app({ MAINTENANCE_MODE: 'true' });
    expect((await a.request('/api/health')).status).toBe(200);
    expect((await a.request('/api/health/ready')).status).toBe(200);
    for (const p of [
      '/api/webhooks/payments',
      '/api/internal/jobs/reconcile-payments',
      '/api/internal/tasks/send-email',
      '/brand/partyx-logo.png',
      '/favicon.svg',
    ])
      expect(openDuringMaintenance(p), p).toBe(true);
    for (const p of [
      '/',
      '/api/public/site',
      '/api/auth/login',
      '/api/admin/emails',
      '/api/gate/scan',
      '/api/webhooks',
    ])
      expect(openDuringMaintenance(p), p).toBe(false);
    // Sem as dependências de pagamento o webhook nem é montado: responde 404, não o aviso de manutenção.
    expect((await a.request('/api/webhooks/payments', { method: 'POST' })).status).not.toBe(503);
  });

  it('sem contato configurado: produção não inventa canal; fora de produção sinaliza "a fornecer"', async () => {
    const prod = createApp({
      config: loadConfig({
        APP_ENV: 'producao',
        PUBLIC_BASE_URL: 'https://partyx.example.com',
        DATABASE_URL: 'postgres://x',
        SESSION_SECRET: 's'.repeat(40),
        QR_HMAC_KEYS: `1:${Buffer.alloc(32, 7).toString('base64url')}`,
        MAINTENANCE_MODE: 'true',
        WEB_DIST_DIR: dist(),
      }),
      clock,
    });
    const html = await (await prod.request('/', { headers: { host: 'partyx.example.com' } })).text();
    expect(html).toContain('Site em manutenção');
    expect(html).not.toMatch(/a fornecer|mailto:|wa\.me/);
    const local = await (await app({ MAINTENANCE_MODE: 'true' }).request('/')).text();
    expect(local).toContain('Canais de atendimento da PartyX: a fornecer');
  });

  it('desligada: o site responde normalmente', async () => {
    const a = app({ MAINTENANCE_MODE: 'false', ...CONTACT });
    expect((await a.request('/')).status).toBe(200);
    expect((await a.request('/api/health')).status).toBe(200);
  });
});
