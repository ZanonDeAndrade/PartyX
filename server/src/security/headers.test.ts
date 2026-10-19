import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createFakeClock } from '../providers/clock';

/** Pagamento com cartão (Mercado Pago): nonce da CSP para o script do perfil do aparelho, igual no cabeçalho e no HTML. */
function appWith(gateway: 'mercadopago' | 'none') {
  const dist = mkdtempSync(path.join(tmpdir(), 'partyx-csp-'));
  writeFileSync(
    path.join(dist, 'index.html'),
    '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8" /><title>PartyX</title></head><body><div id="root"></div></body></html>',
  );
  // Valores fictícios gerados na hora: o teste só precisa de uma configuração válida do gateway.
  const fake = () => `TEST-${randomBytes(16).toString('hex')}`;
  const mp =
    gateway === 'mercadopago'
      ? {
          MP_ACCESS_TOKEN: fake(),
          MP_PUBLIC_KEY: fake(),
          MP_WEBHOOK_SECRET: fake(),
          MP_COLLECTOR_ID: '123456789',
          GATEWAY_ENVIRONMENT: 'sandbox',
        }
      : {};
  const config = loadConfig({ APP_ENV: 'local', WEB_DIST_DIR: dist, PAYMENT_GATEWAY: gateway, ...mp });
  return createApp({ config, clock: createFakeClock('2026-10-19T12:00:00Z') });
}

const scriptSrc = (res: Response) => res.headers.get('content-security-policy')!.match(/script-src ([^;]*)/)![1]!;
const metaNonce = (html: string) => html.match(/<meta property="csp-nonce" nonce="([^"]+)">/)?.[1];

describe('CSP com o Mercado Pago', () => {
  const app = appWith('mercadopago');

  it('cada página do app leva um nonce novo, o mesmo no script-src e no <meta> do HTML; sem unsafe-inline nem unsafe-eval', async () => {
    const seen = new Set<string>();
    for (const route of ['/', '/pedido/00000000-0000-4000-8000-000000000001', '/eventos/inexistente', '/minha-conta']) {
      const res = await app.request(route);
      const html = await res.text();
      const nonce = metaNonce(html);
      expect(nonce, route).toMatch(/^[A-Za-z0-9+/]{20,}={0,2}$/);
      expect(scriptSrc(res), route).toContain(`'nonce-${nonce}'`);
      expect(scriptSrc(res), route).not.toMatch(/unsafe-(inline|eval)/);
      expect(html.indexOf('csp-nonce'), route).toBeGreaterThan(html.indexOf('charset')); // o charset continua primeiro
      seen.add(nonce!);
    }
    expect(seen.size).toBe(4);
  });

  it('domínios medidos do Brick e do antifraude; a telemetria (api.mercadolibre.com) fica bloqueada', async () => {
    const csp = (await app.request('/api/health')).headers.get('content-security-policy')!;
    const dir = (name: string) => csp.match(new RegExp(`${name} ([^;]*)`))![1]!.split(' ');
    expect(dir('script-src')).toEqual(expect.arrayContaining(['https://sdk.mercadopago.com', 'https://http2.mlstatic.com']));
    expect(dir('connect-src')).toEqual(
      expect.arrayContaining([
        'https://api.mercadopago.com',
        'https://http2.mlstatic.com',
        'https://api-static.mercadopago.com',
        'https://secure-fields.mercadopago.com',
        'https://www.mercadolibre.com',
      ]),
    );
    expect(dir('img-src')).toEqual(
      expect.arrayContaining(['https://www.mercadopago.com.br', 'https://www.mercadolibre.com', 'https://www.mercadolivre.com']),
    );
    expect(dir('frame-src')).toEqual(['https://secure-fields.mercadopago.com']);
    expect(csp).not.toContain('api.mercadolibre.com');
  });
});

describe('CSP sem o Mercado Pago', () => {
  it('sem nonce: nem no cabeçalho nem no HTML', async () => {
    const res = await appWith('none').request('/pedido/00000000-0000-4000-8000-000000000001');
    expect(scriptSrc(res)).not.toContain('nonce-');
    expect(await res.text()).not.toContain('csp-nonce');
  });
});
