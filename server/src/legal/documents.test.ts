import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { publicRoutes } from '../api/public';
import { loadConfig } from '../config';
import { createOrder } from '../orders/service';
import { isLegalKind, legalDocument, parseBlocks, salesBlockers } from './documents';

const prod = (extra: Record<string, string> = {}) =>
  loadConfig({
    APP_ENV: 'producao',
    DATABASE_URL: 'postgres://x',
    SESSION_SECRET: 's'.repeat(40),
    QR_HMAC_KEYS: `1:${randomBytes(32).toString('base64url')}`,
    TURNSTILE_SECRET: 'segredo-turnstile-teste', TURNSTILE_SITE_KEY: 'chave-site-turnstile-teste',
    ...extra,
  });
const dirWith = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'px-legal-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, `${name}.txt`), text);
  return dir;
};
const FULL = {
  'termos-de-uso': '# Seção\n\nTexto dos termos fornecido pela PartyX.',
  privacidade: 'Texto da privacidade.',
  cancelamento: 'Texto do cancelamento.',
};

describe('textos legais (RF-68)', () => {
  it('só aceita os quatro documentos conhecidos: nenhum caminho de arquivo passa', () => {
    for (const bad of ['..', '../etc/passwd', 'termos-de-uso.txt', 'TERMOS-DE-USO', '', '%2e%2e'])
      expect([bad, isLegalKind(bad)]).toEqual([bad, false]);
    for (const ok of ['termos-de-uso', 'privacidade', 'cancelamento', 'meia-entrada'])
      expect(isLegalKind(ok)).toBe(true);
  });

  it('texto vira blocos simples, nunca HTML', () => {
    const blocks = parseBlocks('# Título\r\n\r\nPrimeiro <b>parágrafo</b>\nsegue.\n\n\n\nSegundo.');
    expect(blocks).toEqual([
      { type: 'heading', text: 'Título' },
      { type: 'paragraph', text: 'Primeiro <b>parágrafo</b>\nsegue.' },
      { type: 'paragraph', text: 'Segundo.' },
    ]);
  });

  it('com arquivo: oficial, com a versão configurada; sem arquivo fora de produção: aviso de homologação sem texto jurídico', () => {
    const config = prod({
      TERMS_VERSION: 'v3',
      PRIVACY_VERSION: 'v2',
      CANCELLATION_VERSION: 'v1',
      LEGAL_CONTENT_DIR: dirWith(FULL),
    });
    expect(legalDocument(config, 'termos-de-uso')).toMatchObject({ status: 'oficial', version: 'v3' });
    expect(legalDocument(config, 'cancelamento')).toMatchObject({ status: 'oficial', version: 'v1' });
    const local = loadConfig({});
    const doc = legalDocument(local, 'privacidade');
    expect(doc.status).toBe('homologacao');
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]!.text).toMatch(/HOMOLOGAÇÃO/);
  });

  it('produção sem arquivo: pendente e sem nenhum texto', () => {
    expect(legalDocument(prod({ TERMS_VERSION: 'v1', PRIVACY_VERSION: 'v1' }), 'termos-de-uso')).toMatchObject({
      status: 'pendente',
      version: null,
      blocks: [],
    });
  });

  it('arquivo vazio ou grande demais conta como ausente', () => {
    const big = 'x'.repeat(200_001);
    const config = prod({ LEGAL_CONTENT_DIR: dirWith({ ...FULL, privacidade: '', cancelamento: big }) });
    expect(legalDocument(config, 'privacidade').status).toBe('pendente');
    expect(legalDocument(config, 'cancelamento').status).toBe('pendente');
  });

  it('pendências de produção: textos, versões e aprovação visual, um por um', () => {
    expect(salesBlockers(loadConfig({}))).toEqual([]);
    expect(salesBlockers(prod()).length).toBeGreaterThanOrEqual(5);
    const base = {
      TERMS_VERSION: 'v1',
      PRIVACY_VERSION: 'v1',
      CANCELLATION_VERSION: 'v1',
      LEGAL_CONTENT_DIR: dirWith(FULL),
    };
    expect(salesBlockers(prod(base))).toEqual(['identidade visual sem aprovação escrita do cliente']);
    expect(salesBlockers(prod({ ...base, VISUAL_APPROVED: 'true' }))).toEqual([]);
    const semCancel = { ...base, LEGAL_CONTENT_DIR: dirWith({ ...FULL, cancelamento: '' }), VISUAL_APPROVED: 'true' };
    expect(salesBlockers(prod(semCancel))).toEqual(['texto legal ausente: Política de Cancelamento']);
  });

  it('produção não vende com SALES_OPEN=true enquanto houver pendência do cliente; com tudo pronto passa desta trava', async () => {
    const pendente = prod({ SALES_OPEN: 'true' });
    const deps = { db: null as never, clock: { now: () => new Date() }, config: pendente } as never;
    await expect(createOrder(deps, 'u', { eventSlug: 'x', items: [] } as never)).rejects.toMatchObject({
      status: 503,
      code: 'vendas_fechadas',
    });
    const pronta = prod({
      SALES_OPEN: 'true',
      TERMS_VERSION: 'v1',
      PRIVACY_VERSION: 'v1',
      CANCELLATION_VERSION: 'v1',
      LEGAL_CONTENT_DIR: dirWith(FULL),
      VISUAL_APPROVED: 'true',
    });
    // Passou da trava de venda: falha adiante (banco ausente), não com 503 de vendas fechadas.
    const err = await createOrder({ ...(deps as object), config: pronta } as never, 'u', {
      eventSlug: 'x',
      items: [],
    } as never).catch(e => e);
    expect(err?.code).not.toBe('vendas_fechadas');
  });

  it('rota pública: documento por nome, 404 para qualquer outro, tema provisório até a aprovação', async () => {
    const config = prod({ TERMS_VERSION: 'v1', PRIVACY_VERSION: 'v1', LEGAL_CONTENT_DIR: dirWith(FULL) });
    const app = new Hono().route('/', publicRoutes({ config } as never));
    app.onError((e, c) => c.json({}, ((e as { status?: number }).status as 404) ?? 500));
    const ok = await app.request('/public/legal/privacidade');
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { document: { status: string } }).document.status).toBe('oficial');
    expect((await app.request('/public/legal/..%2Fsegredo')).status).toBe(404);
    expect((await app.request('/public/legal/qualquer')).status).toBe(404);
    expect(((await (await app.request('/public/site')).json()) as { provisionalTheme: boolean }).provisionalTheme).toBe(
      true,
    );
    const aprovado = new Hono().route('/', publicRoutes({ config: prod({ VISUAL_APPROVED: 'true' }) } as never));
    expect(
      ((await (await aprovado.request('/public/site')).json()) as { provisionalTheme: boolean }).provisionalTheme,
    ).toBe(false);
  });
});
