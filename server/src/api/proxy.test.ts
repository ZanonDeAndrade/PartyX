import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createFakeClock } from '../providers/clock';

/**
 * O serviço atrás de um intermediário (Vercel, como ponte temporária para o domínio, ou Firebase Hosting): o Cloud Run
 * recebe `Host` com o endereço run.app e o domínio público em `X-Forwarded-Host`. A Vercel regrava o `X-Forwarded-For`
 * com o IP do visitante, e o Google acrescenta o IP da Vercel no fim (docs/operacao/vercel.md).
 */
const clock = createFakeClock('2026-10-14T18:00:00Z');
const RUN = 'partyx-391817439013.southamerica-east1.run.app';
const VISITANTE = '177.86.10.20';
const VERCEL = '76.76.21.142';

const prod = (publicBaseUrl = 'https://partyx.com.br') =>
  createApp({
    config: { ...loadConfig({}), APP_ENV: 'producao', PUBLIC_BASE_URL: publicBaseUrl, TRUSTED_PROXY_HOPS: 2 },
    clock,
  });

/** Pedido como a Vercel entrega ao Cloud Run num rewrite externo. */
const viaVercel = (forwardedHost: string, extra: Record<string, string> = {}) => ({
  host: RUN,
  'x-forwarded-host': forwardedHost,
  'x-forwarded-for': `${VISITANTE}, ${VERCEL}`,
  'x-real-ip': VISITANTE,
  'x-forwarded-proto': 'https',
  'x-vercel-id': 'gru1::abcde-1760464800000-0123456789ab',
  ...extra,
});

describe('atrás da Vercel (rewrite externo para o Cloud Run)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('aceita o domínio público e mostra a origem com o IP do visitante mascarado', async () => {
    const res = await prod().request(`https://${RUN}/api/health/origem`, { headers: viaVercel('partyx.com.br') });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({
      host: 'partyx.com.br',
      intermediario: 'vercel',
      ip: '177.86.x.x',
      itensNoEncaminhamento: 2,
      protocolo: 'https',
      consulta: '',
      cabecalhos: { 'x-request-id': null, 'x-signature': null },
    });
    expect(body).not.toContain(VISITANTE);
    expect(body).not.toContain(VERCEL);
  });

  it('mostra a query string e os cabeçalhos da assinatura do Mercado Pago como chegaram (a assinatura só como resumo)', async () => {
    const signature = 'ts=1760464800,v1=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const lines: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => (lines.push(String(chunk)), true));
    const res = await prod().request(`https://${RUN}/api/health/origem?data.id=123456789&type=payment&teste=1`, {
      headers: viaVercel('partyx.com.br', { 'x-request-id': 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e', 'x-signature': signature }),
    });
    const body = (await res.json()) as { consulta: string; cabecalhos: Record<string, string | null> };
    expect(body.consulta).toBe('?data.id=123456789&type=payment&teste=1');
    expect(body.cabecalhos['x-request-id']).toBe('bb56a2f1-6aae-46ac-982e-9dcd3581d08e');
    expect(body.cabecalhos['x-signature']).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(JSON.stringify(body)).not.toContain('v1=');
    const line = JSON.parse(lines.find(l => l.includes('origem do pedido'))!);
    expect(line.parametros).toEqual(['data.id', 'type', 'teste']);
    expect(line.cabecalhosPresentes).toEqual(['x-request-id', 'x-signature']);
    expect(lines.join('')).not.toContain('123456789&');
    expect(lines.join('')).not.toContain('v1=');
  });

  it('grava a origem no log com o IP mascarado, nunca o completo', async () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => (lines.push(String(chunk)), true));
    await prod().request(`https://${RUN}/api/health/origem`, { headers: viaVercel('partyx.com.br') });
    const line = lines.find(l => l.includes('origem do pedido'));
    expect(line).toBeDefined();
    expect(JSON.parse(line!)).toMatchObject({ severity: 'INFO', intermediario: 'vercel', ip: '177.86.x.x' });
    expect(lines.join('')).not.toContain(VISITANTE);
  });

  it('o IP vem da cadeia, não do que o visitante tenta forjar (a Vercel descarta; aqui sobra só a posição confiável)', async () => {
    const res = await prod().request(`https://${RUN}/api/health/origem`, {
      headers: viaVercel('partyx.com.br', { 'x-forwarded-for': `6.6.6.6, ${VISITANTE}, ${VERCEL}` }),
    });
    expect(((await res.json()) as { ip: string }).ip).toBe('177.86.x.x');
  });

  it('IPv6 do visitante também sai mascarado', async () => {
    const res = await prod().request(`https://${RUN}/api/health/origem`, {
      headers: viaVercel('partyx.com.br', { 'x-forwarded-for': `2804:14c:5b8:8e00::1, ${VERCEL}` }),
    });
    expect(((await res.json()) as { ip: string }).ip).toBe('2804:14c::x');
  });

  it('o resto da aplicação também passa pela barreira com o domínio público', async () => {
    const res = await prod().request(`https://${RUN}/api/nao-existe`, { headers: viaVercel('partyx.com.br') });
    expect(res.status).toBe(404); // chegou ao roteamento da API: a barreira deixou passar
  });

  it.each([
    ['o endereço próprio do projeto na Vercel', 'partyx-ponte.vercel.app'],
    ['o www (a Vercel redireciona para a raiz; ele nunca deve chegar aqui)', 'www.partyx.com.br'],
    ['o endereço antigo do Firebase, depois da troca', 'partyx-producao.web.app'],
    ['uma lista no cabeçalho', 'partyx.com.br, outro.example.com'],
    ['o domínio com porta', 'partyx.com.br:8443'],
  ])('recusa com 403 %s', async (_nome, forwardedHost) => {
    const app = prod();
    for (const path of ['/', '/api/health/origem', '/api/webhooks/payments']) {
      const res = await app.request(`https://${RUN}${path}`, { headers: viaVercel(forwardedHost) });
      expect([path, res.status]).toEqual([path, 403]);
    }
  });

  it('direto no run.app, sem domínio, recusa; as duas rotas de saúde seguem abertas para o teste rápido', async () => {
    const app = prod();
    expect((await app.request(`https://${RUN}/api/health/origem`, { headers: { host: RUN } })).status).toBe(403);
    expect((await app.request(`https://${RUN}/`, { headers: { host: RUN } })).status).toBe(403);
    expect((await app.request(`https://${RUN}/api/health`, { headers: { host: RUN } })).status).toBe(200);
    expect((await app.request(`https://${RUN}/api/health/ready`, { headers: { host: RUN } })).status).toBe(200);
  });

  it('a volta ao Firebase (endereço web.app) segue funcionando e é identificada na origem', async () => {
    const res = await prod('https://partyx-producao.web.app').request(`https://${RUN}/api/health/origem`, {
      headers: {
        host: RUN,
        'x-forwarded-host': 'partyx-producao.web.app',
        'x-forwarded-for': `${VISITANTE}, 192.178.11.130`,
        via: '1.1 Firebase Hosting',
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ host: 'partyx-producao.web.app', intermediario: 'firebase', ip: '177.86.x.x' });
  });
});
