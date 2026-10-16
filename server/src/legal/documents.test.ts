import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { publicRoutes } from '../api/public';
import { loadConfig } from '../config';
import { createOrder } from '../orders/service';
import {
  isLegalKind,
  legalDocument,
  minorDocsBlockers,
  parseBlocks,
  salesBlockers,
  signupBlockers,
  signupTextsProvisional,
} from './documents';

const prod = (extra: Record<string, string> = {}) =>
  loadConfig({
    APP_ENV: 'producao',
    PUBLIC_BASE_URL: 'https://partyx.example.com',
    DATABASE_URL: 'postgres://x',
    SESSION_SECRET: 's'.repeat(40),
    QR_HMAC_KEYS: `1:${randomBytes(32).toString('base64url')}`,
    TURNSTILE_SECRET: 'segredo-turnstile-teste',
    TURNSTILE_SITE_KEY: 'chave-site-turnstile-teste',
    ...extra,
  });
const dirWith = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'px-legal-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, `${name}.txt`), text);
  return dir;
};
const DATES = { TERMS_DATE: '2026-10-01', PRIVACY_DATE: '2026-10-01', CANCELLATION_DATE: '2026-10-02' };
const FULL = {
  'termos-de-uso': '# Seção\n\nTexto dos termos fornecido pela PartyX.',
  privacidade: 'Texto da privacidade.',
  cancelamento: 'Texto do cancelamento.',
};

describe('textos legais (RF-68)', () => {
  it('só aceita os documentos conhecidos: nenhum caminho de arquivo passa', () => {
    // `meia-entrada` deixou de existir em 16/10/2026: não há meia-entrada (D-06).
    for (const bad of ['..', '../etc/passwd', 'termos-de-uso.txt', 'TERMOS-DE-USO', '', '%2e%2e', 'meia-entrada'])
      expect([bad, isLegalKind(bad)]).toEqual([bad, false]);
    for (const ok of [
      'termos-de-uso',
      'privacidade',
      'cancelamento',
      'termo-menor',
      'autorizacao-menor',
    ])
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
      ...DATES,
    };
    expect(salesBlockers(prod(base))).toEqual(['identidade visual sem aprovação escrita do cliente']);
    const { CANCELLATION_DATE: _sem, ...semData } = base;
    expect(salesBlockers(prod({ ...semData, VISUAL_APPROVED: 'true' }))).toEqual([
      'data de vigência não informada: Política de Cancelamento, Troca e Reembolso',
    ]);
    expect(salesBlockers(prod({ ...base, VISUAL_APPROVED: 'true' }))).toEqual([]);
    const semCancel = { ...base, LEGAL_CONTENT_DIR: dirWith({ ...FULL, cancelamento: '' }), VISUAL_APPROVED: 'true' };
    expect(salesBlockers(prod(semCancel))).toEqual(['texto legal ausente: Política de Cancelamento, Troca e Reembolso']);
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
      ...DATES,
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

  it('documento publicado mostra versão e data de vigência; sem data, a data fica nula', () => {
    const config = prod({
      TERMS_VERSION: 'v3',
      PRIVACY_VERSION: 'v2',
      CANCELLATION_VERSION: 'v1',
      LEGAL_CONTENT_DIR: dirWith(FULL),
      TERMS_DATE: '2026-10-01',
    });
    expect(legalDocument(config, 'termos-de-uso')).toMatchObject({
      status: 'oficial',
      version: 'v3',
      effectiveDate: '2026-10-01',
    });
    expect(legalDocument(config, 'privacidade')).toMatchObject({ status: 'oficial', effectiveDate: null });
    expect(legalDocument(loadConfig({ TERMS_DATE: '2026-10-01' }), 'termos-de-uso')).toMatchObject({
      status: 'homologacao',
      effectiveDate: null, // sem texto oficial, nenhuma data é apresentada como vigência
    });
  });

  describe('cadastro (RF-03, D-11, D-84): bloqueado em produção sem os Termos e a Privacidade publicados', () => {
    const published = { TERMS_VERSION: 'v1', PRIVACY_VERSION: 'v1', CANCELLATION_VERSION: 'v1', ...DATES };

    it('produção: fechado por padrão, mesmo com tudo publicado; abre só com SIGNUP_OPEN=true', () => {
      const all = { ...published, LEGAL_CONTENT_DIR: dirWith(FULL) };
      expect(signupBlockers(prod(all))).toEqual(['cadastro fechado por configuração (SIGNUP_OPEN)']);
      expect(signupBlockers(prod({ ...all, SIGNUP_OPEN: 'true' }))).toEqual([]);
    });

    it('produção com a flag ligada: cada texto, versão e data dos Termos e da Privacidade que falta é um bloqueio', () => {
      expect(signupBlockers(prod({ SIGNUP_OPEN: 'true' }))).toHaveLength(6);
      const semTexto = prod({
        ...published,
        SIGNUP_OPEN: 'true',
        LEGAL_CONTENT_DIR: dirWith({ ...FULL, privacidade: '' }),
      });
      expect(signupBlockers(semTexto)).toEqual(['texto legal ausente: Política de Privacidade']);
      const { PRIVACY_DATE: _p, ...semData } = published;
      expect(signupBlockers(prod({ ...semData, SIGNUP_OPEN: 'true', LEGAL_CONTENT_DIR: dirWith(FULL) }))).toEqual([
        'data de vigência não informada: Política de Privacidade',
      ]);
    });

    it('sem a Política de Cancelamento: o cadastro abre, a venda continua bloqueada por ela', () => {
      const semCancelamento = prod({
        SIGNUP_OPEN: 'true',
        SALES_OPEN: 'true',
        VISUAL_APPROVED: 'true',
        TERMS_VERSION: 'v1',
        PRIVACY_VERSION: 'v1',
        TERMS_DATE: '2026-10-14',
        PRIVACY_DATE: '2026-10-14',
        LEGAL_CONTENT_DIR: dirWith({ 'termos-de-uso': FULL['termos-de-uso'], privacidade: FULL.privacidade }),
      });
      expect(signupBlockers(semCancelamento)).toEqual([]);
      expect(salesBlockers(semCancelamento)).toEqual([
        'texto legal ausente: Política de Cancelamento, Troca e Reembolso',
        'versão da Política de Cancelamento, Troca e Reembolso não informada',
        'data de vigência não informada: Política de Cancelamento, Troca e Reembolso',
      ]);
      expect(legalDocument(semCancelamento, 'cancelamento')).toMatchObject({ status: 'pendente', blocks: [] });
    });

    it('fora de produção: aberto e marcado como provisório sem o texto oficial; SIGNUP_OPEN=false fecha', () => {
      const hml = loadConfig({
        APP_ENV: 'homologacao',
        DATABASE_URL: 'postgres://x',
        SESSION_SECRET: 's'.repeat(40),
        QR_HMAC_KEYS: `1:${randomBytes(32).toString('base64url')}`,
      });
      expect(signupBlockers(hml)).toEqual([]);
      expect(signupTextsProvisional(hml)).toBe(true);
      expect(signupTextsProvisional(loadConfig({ LEGAL_CONTENT_DIR: dirWith(FULL) }))).toBe(false);
      expect(signupBlockers(loadConfig({ SIGNUP_OPEN: 'false' }))).toEqual([
        'cadastro fechado por configuração (SIGNUP_OPEN)',
      ]);
      expect(signupTextsProvisional(prod())).toBe(false);
    });
  });

  describe('textos de menores (0009)', () => {
    const MINOR = { 'termo-menor': 'Termo de ciência.', 'autorizacao-menor': '# Como usar\n\nPreencha.' };

    it('produção: compra de menor e autorização só com os dois textos publicados (arquivo, versão e data)', () => {
      expect(minorDocsBlockers(prod())).toEqual([
        'texto legal ausente: Termo de Ciência para Menores de Idade',
        'texto legal ausente: Termo de Autorização e Responsabilidade',
      ]);
      const semData = prod({
        LEGAL_CONTENT_DIR: dirWith({ ...FULL, ...MINOR }),
        MINOR_TERM_VERSION: '1.0',
        MINOR_AUTHORIZATION_VERSION: '1.0',
        MINOR_TERM_DATE: '2026-10-14',
      });
      expect(minorDocsBlockers(semData)).toEqual([
        'data de vigência não informada: Termo de Autorização e Responsabilidade',
      ]);
      const pronto = prod({
        LEGAL_CONTENT_DIR: dirWith({ ...FULL, ...MINOR }),
        MINOR_TERM_VERSION: '1.0',
        MINOR_AUTHORIZATION_VERSION: '1.0',
        MINOR_TERM_DATE: '2026-10-14',
        MINOR_AUTHORIZATION_DATE: '2026-10-14',
      });
      expect(minorDocsBlockers(pronto)).toEqual([]);
      expect(legalDocument(pronto, 'termo-menor')).toMatchObject({
        status: 'oficial',
        version: '1.0',
        effectiveDate: '2026-10-14',
      });
    });

    it('fora de produção: sem arquivo não bloqueia (versão fictícia); com arquivo, vale o texto', () => {
      expect(minorDocsBlockers(loadConfig({}))).toEqual([]);
      expect(legalDocument(loadConfig({}), 'termo-menor').status).toBe('homologacao');
      expect(legalDocument(loadConfig({ LEGAL_CONTENT_DIR: dirWith(MINOR) }), 'autorizacao-menor')).toMatchObject({
        status: 'oficial',
        version: 'ficticio-0',
      });
    });
  });
});
