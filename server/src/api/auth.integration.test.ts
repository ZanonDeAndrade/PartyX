import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { loadConfig, type Config } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender, unconfiguredEmailSender, type EmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import type { HumanCheck, HumanVerifier } from '../security/humanCheck';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost';
const CPF_A = '12345678909';
const CPF_B = '52998224725';

describe.skipIf(!ADMIN_URL)('autenticação (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let n = 0;
  const clock = createFakeClock('2026-10-17T12:00:00Z');
  let mailer: MemoryEmailSender;

  const config = (extra: Record<string, string> = {}): Config =>
    loadConfig({ APP_ENV: 'local', PUBLIC_BASE_URL: 'https://homolog.partyx.test', ...extra });

  /** Monta a API contra o banco de teste. */
  const build = (opts: { cfg?: Config; mail?: EmailSender; human?: HumanVerifier } = {}) => {
    const cfg = opts.cfg ?? config();
    return createApp({
      config: cfg,
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: opts.mail ?? mailer, human: opts.human },
    });
  };
  let app: ReturnType<typeof build>;

  /** Navegador simulado: guarda o cookie e envia o Origin. */
  const browser = (target: () => typeof app = () => app) => {
    let cookie = '';
    let csrf = '';
    const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const res = await target().request(`/api${path}`, {
        method,
        headers: {
          origin: ORIGIN,
          host: 'localhost',
          'content-type': 'application/json',
          'user-agent': 'teste',
          'x-forwarded-for': '203.0.113.7',
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get('set-cookie');
      if (set)
        cookie =
          set.startsWith('__session=;') || /max-age=0|expires=thu, 01 jan 1970/i.test(set) ? '' : set.split(';')[0]!;
      return res;
    };
    return {
      call,
      get cookie() {
        return cookie;
      },
      /** Lê o token CSRF da sessão atual. */
      async arm() {
        const me = await call('GET', '/auth/me');
        csrf = ((await me.json()) as { csrfToken: string }).csrfToken;
        return csrf;
      },
      /** Requisição que altera dados, como a interface faz: com X-CSRF-Token. */
      secured: (method: string, path: string, body?: unknown) => call(method, path, body, { 'x-csrf-token': csrf }),
    };
  };

  const person = (o: Record<string, unknown> = {}) => {
    const i = ++n;
    return {
      name: 'Marina Costa',
      email: `marina${i}@partyx.test`,
      cpf: CPF_A,
      phone: '(55) 99812-4470',
      birthDate: '1995-03-20',
      password: 'festa2026',
      acceptedTermsVersion: 'ficticio-0',
      acceptedPrivacyVersion: 'ficticio-0',
      accept: true,
      ...o,
    };
  };
  /** CPF válido diferente para cada pessoa. */
  const nextCpf = (() => {
    const pool = [CPF_A, CPF_B, '11144477735', '39053344705', '16899535009', '98765432100'.slice(0, 9)];
    return (i: number) => pool[i % 5]!;
  })();

  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql(
      'truncate login_attempts, sessions, password_resets, consents, email_log, global_limit_counters, users cascade',
    );
    clock.set('2026-10-17T12:00:00Z');
    mailer = new MemoryEmailSender();
    app = build();
  });

  const errorOf = async (res: Response) =>
    ((await res.json()) as { erro: { codigo: string; mensagem: string; detalhes?: unknown } }).erro;
  const fields = async (res: Response) =>
    ((await errorOf(res)).detalhes as { campo: string; mensagem: string }[]).map(d => d.campo).sort();

  describe('cadastro', () => {
    it('cria a conta, registra o aceite com versão, data e IP, envia a confirmação e abre a sessão (CA-01)', async () => {
      const b = browser();
      const res = await b.call('POST', '/auth/register', person());
      expect(res.status).toBe(201);
      const { user } = (await res.json()) as { user: Record<string, unknown> };
      expect(user).toMatchObject({ name: 'Marina Costa', role: 'cliente', cpf: '***.456.789-**' });
      expect(user).not.toHaveProperty('passwordHash');

      const cookie = res.headers.get('set-cookie')!;
      expect(cookie).toMatch(/__session=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);

      const row = (await sql('select * from users')).rows[0];
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
      expect(row.cpf).toBe(CPF_A);
      expect(row.phone).toBe('55998124470');
      expect(row.password_hash).not.toContain('festa2026');

      const consent = (await sql('select terms_version, privacy_version, accepted_at, host(ip) as ip from consents'))
        .rows[0];
      expect(consent).toMatchObject({ terms_version: 'ficticio-0', privacy_version: 'ficticio-0', ip: '203.0.113.7' });
      expect(new Date(consent.accepted_at).toISOString()).toBe('2026-10-17T12:00:00.000Z');

      expect(mailer.last('cadastro')?.to).toBe(row.email);
      expect((await sql("select status from email_log where template = 'cadastro'")).rows[0].status).toBe('enviado');
      const me = await b.call('GET', '/auth/me');
      expect(me.status).toBe(200); // já entra logado, como no protótipo
    });

    it('recusa CPF inválido, CPF curto, nome sem sobrenome, telefone sem DDD, e-mail ruim e senha fraca', async () => {
      const bad = async (o: Record<string, unknown>) => {
        const res = await browser().call('POST', '/auth/register', person(o));
        expect(res.status).toBe(422);
        return fields(res);
      };
      expect(await bad({ cpf: '12345678900' })).toEqual(['cpf']);
      expect(await bad({ cpf: '123' })).toEqual(['cpf']);
      expect(await bad({ name: 'Marina' })).toEqual(['name']);
      expect(await bad({ phone: '9981' })).toEqual(['phone']);
      expect(await bad({ email: 'sem-arroba' })).toEqual(['email']);
      expect(await bad({ password: 'curta1' })).toEqual(['password']);
      expect(await bad({ cpf: 'x', name: 'A', email: 'b' })).toEqual(['cpf', 'email', 'name']);
      expect((await sql('select count(*)::int as n from users')).rows[0].n).toBe(0);
    });

    it('sem marcar o aceite, a conta não é criada (CA-03)', async () => {
      const res = await browser().call('POST', '/auth/register', person({ accept: false }));
      expect(res.status).toBe(422);
      expect(await fields(res)).toEqual(['accept']);
      expect((await sql('select count(*)::int as n from users')).rows[0].n).toBe(0);
    });

    it('recusa o aceite de uma versão desatualizada dos textos', async () => {
      const res = await browser().call('POST', '/auth/register', person({ acceptedTermsVersion: 'v0' }));
      expect(res.status).toBe(409);
      expect((await errorOf(res)).codigo).toBe('versao_desatualizada');
    });

    it('recusa e-mail e CPF já cadastrados, dizendo qual campo (CA-02)', async () => {
      const first = person();
      expect((await browser().call('POST', '/auth/register', first)).status).toBe(201);

      const sameEmail = await browser().call(
        'POST',
        '/auth/register',
        person({ email: first.email.toUpperCase(), cpf: CPF_B }),
      );
      expect(await fields(sameEmail)).toEqual(['email']);
      const sameCpf = await browser().call('POST', '/auth/register', person({ cpf: '123.456.789-09' }));
      expect(await fields(sameCpf)).toEqual(['cpf']);
      const both = await browser().call('POST', '/auth/register', { ...first });
      expect(await fields(both)).toEqual(['cpf', 'email']);
      expect((await sql('select count(*)::int as n from users')).rows[0].n).toBe(1);
    });

    it('duas requisições simultâneas com o mesmo e-mail criam uma única conta', async () => {
      const p = person();
      const results = await Promise.all([1, 2, 3].map(() => browser().call('POST', '/auth/register', { ...p })));
      expect(results.map(r => r.status).sort()).toEqual([201, 422, 422]);
      expect((await sql('select count(*)::int as n from users')).rows[0].n).toBe(1);
      expect((await sql('select count(*)::int as n from consents')).rows[0].n).toBe(1);
    });

    it('em produção, sem os textos legais do cliente, o cadastro real é bloqueado', async () => {
      const cfg = config({
        APP_ENV: 'producao',
        PUBLIC_BASE_URL: ORIGIN,
        DATABASE_URL: 'postgres://x',
        SESSION_SECRET: 'x'.repeat(40),
        QR_HMAC_KEYS: `1:${randomBytes(32).toString('base64url')}`,
        TURNSTILE_SECRET: 'segredo-turnstile-teste',
        TURNSTILE_SITE_KEY: 'chave-site-turnstile-teste',
      });
      expect(cfg.legal).toMatchObject({ ready: false, provisional: false });
      const res = await browser(() => build({ cfg })).call('POST', '/auth/register', person());
      expect(res.status).toBe(503);
      expect((await errorOf(res)).codigo).toBe('cadastro_indisponivel');
      expect((await sql('select count(*)::int as n from users')).rows[0].n).toBe(0);
    });

    const prodBase = () => ({
      APP_ENV: 'producao',
      PUBLIC_BASE_URL: ORIGIN,
      DATABASE_URL: 'postgres://x',
      QR_HMAC_KEYS: `1:${randomBytes(32).toString('base64url')}`,
      SESSION_SECRET: 'x'.repeat(40),
      TERMS_VERSION: '2026-10',
      PRIVACY_VERSION: '2026-10',
      CANCELLATION_VERSION: '2026-10',
      TERMS_DATE: '2026-10-01',
      PRIVACY_DATE: '2026-10-01',
      CANCELLATION_DATE: '2026-10-01',
    });
    const legalDir = (files: Record<string, string>) => {
      const dir = mkdtempSync(join(tmpdir(), 'px-legal-'));
      for (const [k, v] of Object.entries(files)) writeFileSync(join(dir, `${k}.txt`), v);
      return dir;
    };
    const OFFICIAL = { 'termos-de-uso': 'Termos.', privacidade: 'Privacidade.', cancelamento: 'Cancelamento.' };

    it('em produção, com versões mas sem textos publicados ou sem a flag, o cadastro continua bloqueado', async () => {
      const semFlag = config({ ...prodBase(), LEGAL_CONTENT_DIR: legalDir(OFFICIAL) });
      const semTexto = config({
        ...prodBase(),
        SIGNUP_OPEN: 'true',
        LEGAL_CONTENT_DIR: legalDir({ privacidade: 'P.' }),
      });
      for (const cfg of [semFlag, semTexto]) {
        const b = browser(() => build({ cfg }));
        expect(await (await b.call('GET', '/legal/versions')).json()).toMatchObject({ ready: false });
        const res = await b.call(
          'POST',
          '/auth/register',
          person({ acceptedTermsVersion: '2026-10', acceptedPrivacyVersion: '2026-10' }),
        );
        expect(res.status).toBe(503);
        expect((await errorOf(res)).codigo).toBe('cadastro_indisponivel');
      }
      expect((await sql('select count(*)::int as n from users')).rows[0].n).toBe(0);
    });

    it('em produção com os três textos publicados e SIGNUP_OPEN=true, o cadastro funciona e registra as versões', async () => {
      const cfg = config({ ...prodBase(), SIGNUP_OPEN: 'true', LEGAL_CONTENT_DIR: legalDir(OFFICIAL) });
      const b = browser(() => build({ cfg }));
      expect(await (await b.call('GET', '/legal/versions')).json()).toEqual({
        terms: '2026-10',
        privacy: '2026-10',
        termsDate: '2026-10-01',
        privacyDate: '2026-10-01',
        cancellation: '2026-10',
        cancellationDate: '2026-10-01',
        ready: true,
        provisional: false,
      });
      const res = await b.call(
        'POST',
        '/auth/register',
        person({ acceptedTermsVersion: '2026-10', acceptedPrivacyVersion: '2026-10' }),
      );
      expect(res.status).toBe(201);
      expect(res.headers.get('set-cookie')).toMatch(/Secure/i); // fora do ambiente local o cookie é Secure
      const consent = (await sql('select terms_version, privacy_version, accepted_at from consents')).rows;
      expect(consent).toHaveLength(1);
      expect(consent[0]).toMatchObject({ terms_version: '2026-10', privacy_version: '2026-10' });
      expect(consent[0].accepted_at).toBeInstanceOf(Date);
      // Versão diferente da publicada: recusa e pede novo aceite.
      const old = await browser(() => build({ cfg })).call(
        'POST',
        '/auth/register',
        person({ acceptedTermsVersion: '2026-09', acceptedPrivacyVersion: '2026-10' }),
      );
      expect(old.status).toBe(409);
    });

    it('em produção sem a Política de Cancelamento (D-84): Termos e Privacidade publicados bastam para cadastrar', async () => {
      const { CANCELLATION_VERSION: _v, CANCELLATION_DATE: _d, ...semCancelamento } = prodBase();
      const cfg = config({
        ...semCancelamento,
        SIGNUP_OPEN: 'true',
        LEGAL_CONTENT_DIR: legalDir({ 'termos-de-uso': 'Termos.', privacidade: 'Privacidade.' }),
      });
      const b = browser(() => build({ cfg }));
      expect(await (await b.call('GET', '/legal/versions')).json()).toMatchObject({ ready: true, provisional: false });
      const res = await b.call(
        'POST',
        '/auth/register',
        person({ acceptedTermsVersion: '2026-10', acceptedPrivacyVersion: '2026-10' }),
      );
      expect(res.status).toBe(201);
      expect((await sql('select count(*)::int as n from consents')).rows[0].n).toBe(1);
    });

    it('informa as versões em vigor e marca as fictícias como provisórias', async () => {
      const res = await browser().call('GET', '/legal/versions');
      expect(await res.json()).toEqual({
        terms: 'ficticio-0',
        privacy: 'ficticio-0',
        termsDate: null,
        privacyDate: null,
        cancellation: 'ficticio-0',
        cancellationDate: null,
        ready: true,
        provisional: true,
      });
    });

    it('fora de produção, versões informadas sem o texto oficial continuam provisórias (aviso de homologação)', async () => {
      const cfg = config({ TERMS_VERSION: 'v9', PRIVACY_VERSION: 'v9' });
      const res = await browser(() => build({ cfg })).call('GET', '/legal/versions');
      expect(await res.json()).toMatchObject({ terms: 'v9', ready: true, provisional: true });
    });

    it('SIGNUP_OPEN=false fecha o cadastro também fora de produção', async () => {
      const cfg = config({ SIGNUP_OPEN: 'false' });
      const res = await browser(() => build({ cfg })).call('POST', '/auth/register', person());
      expect(res.status).toBe(503);
    });
  });

  describe('login, sessão e logout', () => {
    const signup = async (o: Record<string, unknown> = {}) => {
      const p = person({ cpf: nextCpf(n), ...o });
      const b = browser();
      expect((await b.call('POST', '/auth/register', p)).status).toBe(201);
      await b.call('POST', '/auth/logout', undefined, { 'x-csrf-token': await b.arm() });
      return p;
    };

    it('entra com e-mail e senha, em qualquer caixa de letras', async () => {
      const p = await signup();
      const b = browser();
      const res = await b.call('POST', '/auth/login', { email: p.email.toUpperCase(), password: p.password });
      expect(res.status).toBe(200);
      expect((await b.call('GET', '/auth/me')).status).toBe(200);
      const user = (await sql('select last_login_at from users')).rows[0];
      expect(user.last_login_at).not.toBeNull();
    });

    it('e-mail inexistente e senha errada recebem a mesma resposta (sem enumeração)', async () => {
      const p = await signup();
      const wrongPassword = await browser().call('POST', '/auth/login', { email: p.email, password: 'errada123' });
      const unknown = await browser().call('POST', '/auth/login', {
        email: 'ninguem@partyx.test',
        password: 'errada123',
      });
      expect(wrongPassword.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(await errorOf(wrongPassword)).toEqual(await errorOf(unknown));
    });

    it('5 falhas em 15 minutos bloqueiam, mesmo com a senha certa, e liberam depois (RF-10)', async () => {
      const p = await signup();
      for (let i = 0; i < 5; i++) {
        expect((await browser().call('POST', '/auth/login', { email: p.email, password: 'errada123' })).status).toBe(
          401,
        );
      }
      const blocked = await browser().call('POST', '/auth/login', { email: p.email, password: p.password });
      expect(blocked.status).toBe(429);
      const err = await errorOf(blocked);
      expect(err.codigo).toBe('login_bloqueado');
      expect((err.detalhes as { tentarNovamenteEmSegundos: number }).tentarNovamenteEmSegundos).toBeGreaterThan(0);

      clock.advance(16 * 60_000);
      expect((await browser().call('POST', '/auth/login', { email: p.email, password: p.password })).status).toBe(200);
    });

    it('entrar com sucesso zera a contagem de falhas', async () => {
      const p = await signup();
      for (let i = 0; i < 4; i++)
        await browser().call('POST', '/auth/login', { email: p.email, password: 'errada123' });
      expect((await browser().call('POST', '/auth/login', { email: p.email, password: p.password })).status).toBe(200);
      for (let i = 0; i < 4; i++)
        expect((await browser().call('POST', '/auth/login', { email: p.email, password: 'errada123' })).status).toBe(
          401,
        );
      expect((await browser().call('POST', '/auth/login', { email: p.email, password: p.password })).status).toBe(200);
    });

    it('o bloqueio de um e-mail não afeta outro', async () => {
      const p = await signup();
      const q = await signup({ email: 'outra@partyx.test' });
      for (let i = 0; i < 5; i++)
        await browser().call('POST', '/auth/login', { email: p.email, password: 'errada123' });
      expect((await browser().call('POST', '/auth/login', { email: q.email, password: q.password })).status).toBe(200);
    });

    it('conta desativada: só quem acerta a senha descobre (CA-06)', async () => {
      const p = await signup();
      await sql('update users set is_active = false');
      const wrong = await browser().call('POST', '/auth/login', { email: p.email, password: 'errada123' });
      expect((await errorOf(wrong)).codigo).toBe('credenciais_invalidas');
      const right = await browser().call('POST', '/auth/login', { email: p.email, password: p.password });
      expect(right.status).toBe(403);
      expect((await errorOf(right)).codigo).toBe('conta_desativada');
    });

    it('desativar o usuário derruba a sessão que já estava aberta', async () => {
      const b = browser();
      await b.call('POST', '/auth/register', person());
      expect((await b.call('GET', '/auth/me')).status).toBe(200);
      await sql('update users set is_active = false');
      expect((await b.call('GET', '/auth/me')).status).toBe(401);
    });

    it('logout revoga a sessão no servidor, não só o cookie', async () => {
      const b = browser();
      await b.call('POST', '/auth/register', person());
      const stolen = b.cookie;
      await b.call('POST', '/auth/logout', undefined, { 'x-csrf-token': await b.arm() });
      const replay = await app.request('/api/auth/me', { headers: { cookie: stolen } });
      expect(replay.status).toBe(401);
    });

    it('guarda só o hash do token da sessão', async () => {
      const b = browser();
      await b.call('POST', '/auth/register', person());
      const token = b.cookie.split('=')[1]!;
      const rows = (await sql('select token_hash from sessions')).rows;
      expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(rows)).not.toContain(token);
    });

    it('sessão do cliente vence por inatividade em 7 dias; a da equipe em 30 minutos', async () => {
      const client = browser();
      await client.call('POST', '/auth/register', person());
      const hash = await argon2Hasher.hash('senha1234');
      await sql(
        "insert into users (name,email,password_hash,role) values ('Carla Menezes','carla@partyx.exemplo',$1,'administrador')",
        [hash],
      );
      const admin = browser();
      expect(
        (await admin.call('POST', '/auth/login', { email: 'carla@partyx.exemplo', password: 'senha1234' })).status,
      ).toBe(200);

      clock.advance(31 * 60_000);
      expect((await admin.call('GET', '/auth/me')).status).toBe(401);
      expect((await client.call('GET', '/auth/me')).status).toBe(200);

      clock.advance(8 * 24 * 3_600_000);
      expect((await client.call('GET', '/auth/me')).status).toBe(401);
    });

    it('a sessão vence no limite absoluto mesmo com uso contínuo', async () => {
      const b = browser();
      await b.call('POST', '/auth/register', person());
      for (let day = 0; day < 29; day++) {
        clock.advance(24 * 3_600_000);
        expect((await b.call('GET', '/auth/me')).status).toBe(200);
      }
      clock.advance(2 * 24 * 3_600_000 - 1000);
      expect((await b.call('GET', '/auth/me')).status).toBe(401);
    });
  });

  describe('CSRF e origem', () => {
    it('ação autenticada que altera dados exige o token CSRF da sessão', async () => {
      const b = browser();
      await b.call('POST', '/auth/register', person());
      const without = await b.call('PATCH', '/me', { name: 'Outro Nome', phone: '55998124470' });
      expect(without.status).toBe(403);
      expect((await errorOf(without)).codigo).toBe('csrf_invalido');
      const wrong = await b.call(
        'PATCH',
        '/me',
        { name: 'Outro Nome', phone: '55998124470' },
        { 'x-csrf-token': 'adulterado' },
      );
      expect(wrong.status).toBe(403);
      await b.arm();
      expect((await b.secured('PATCH', '/me', { name: 'Outro Nome', phone: '55998124470' })).status).toBe(200);
    });

    it('o token CSRF de uma sessão não vale em outra', async () => {
      const a = browser();
      await a.call('POST', '/auth/register', person());
      const tokenA = await a.arm();
      const b = browser();
      await b.call('POST', '/auth/register', person({ cpf: CPF_B }));
      const res = await b.call(
        'PATCH',
        '/me',
        { name: 'Fulano Silva', phone: '55998124470' },
        { 'x-csrf-token': tokenA },
      );
      expect(res.status).toBe(403);
    });

    it('recusa requisição que altera dados vinda de outra origem', async () => {
      const res = await browser().call(
        'POST',
        '/auth/login',
        { email: 'a@b.com', password: 'x' },
        { origin: 'https://site-malicioso.example' },
      );
      expect(res.status).toBe(403);
      expect((await errorOf(res)).codigo).toBe('origem_invalida');
    });

    it('aceita o endereço público configurado como origem', async () => {
      const res = await browser().call(
        'POST',
        '/auth/login',
        { email: 'a@b.com', password: 'x' },
        { origin: 'https://homolog.partyx.test' },
      );
      expect(res.status).toBe(401); // chegou à autenticação
    });

    it('leitura (GET) não exige token CSRF', async () => {
      const b = browser();
      await b.call('POST', '/auth/register', person());
      expect((await b.call('GET', '/auth/me')).status).toBe(200);
    });
  });

  describe('recuperação de senha', () => {
    const registered = async () => {
      const p = person();
      const b = browser();
      await b.call('POST', '/auth/register', p);
      return { p, b };
    };
    const tokenFrom = (m: { data: Record<string, string> } | undefined) =>
      new URL(m!.data.link!).searchParams.get('token')!;

    it('resposta idêntica para e-mail existente e inexistente; só o existente recebe o link (CA-04)', async () => {
      const { p } = await registered();
      const known = await browser().call('POST', '/auth/password/forgot', { email: p.email });
      const unknown = await browser().call('POST', '/auth/password/forgot', { email: 'ninguem@partyx.test' });
      expect(known.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(await known.json()).toEqual(await unknown.json());
      expect(mailer.sent.filter(m => m.template === 'recuperacao_senha')).toHaveLength(1);
    });

    it('o link troca a senha uma vez só e não funciona uma segunda vez (CA-04)', async () => {
      const { p } = await registered();
      await browser().call('POST', '/auth/password/forgot', { email: p.email });
      const token = tokenFrom(mailer.last('recuperacao_senha'));
      const b = browser();
      expect(
        ((await (await b.call('POST', '/auth/password/check', { token })).json()) as { estado: string }).estado,
      ).toBe('valido');

      const first = await b.call('POST', '/auth/password/reset', { token, password: 'novasenha99' });
      expect(first.status).toBe(200);
      const second = await b.call('POST', '/auth/password/reset', { token, password: 'outrasenha99' });
      expect(second.status).toBe(400);
      expect((await errorOf(second)).codigo).toBe('link_utilizado');
      expect(
        ((await (await b.call('POST', '/auth/password/check', { token })).json()) as { estado: string }).estado,
      ).toBe('utilizado');

      expect((await browser().call('POST', '/auth/login', { email: p.email, password: 'novasenha99' })).status).toBe(
        200,
      );
      expect((await browser().call('POST', '/auth/login', { email: p.email, password: p.password })).status).toBe(401);
    });

    it('o link vale 1 hora', async () => {
      const { p } = await registered();
      await browser().call('POST', '/auth/password/forgot', { email: p.email });
      const token = tokenFrom(mailer.last('recuperacao_senha'));
      clock.advance(59 * 60_000);
      expect(
        ((await (await browser().call('POST', '/auth/password/check', { token })).json()) as { estado: string }).estado,
      ).toBe('valido');
      clock.advance(2 * 60_000);
      const res = await browser().call('POST', '/auth/password/reset', { token, password: 'novasenha99' });
      expect((await errorOf(res)).codigo).toBe('link_expirado');
    });

    it('link inexistente ou adulterado é recusado', async () => {
      const res = await browser().call('POST', '/auth/password/reset', {
        token: 'x'.repeat(43),
        password: 'novasenha99',
      });
      expect((await errorOf(res)).codigo).toBe('link_invalido');
    });

    it('um pedido novo invalida o link anterior', async () => {
      const { p } = await registered();
      await browser().call('POST', '/auth/password/forgot', { email: p.email });
      const old = tokenFrom(mailer.last('recuperacao_senha'));
      await browser().call('POST', '/auth/password/forgot', { email: p.email });
      const fresh = tokenFrom(mailer.last('recuperacao_senha'));
      expect(
        (await errorOf(await browser().call('POST', '/auth/password/reset', { token: old, password: 'novasenha99' })))
          .codigo,
      ).toBe('link_expirado');
      expect(
        (await browser().call('POST', '/auth/password/reset', { token: fresh, password: 'novasenha99' })).status,
      ).toBe(200);
    });

    it('recusa senha fraca sem consumir o link', async () => {
      const { p } = await registered();
      await browser().call('POST', '/auth/password/forgot', { email: p.email });
      const token = tokenFrom(mailer.last('recuperacao_senha'));
      const weak = await browser().call('POST', '/auth/password/reset', { token, password: 'curta' });
      expect(weak.status).toBe(422);
      expect((await browser().call('POST', '/auth/password/reset', { token, password: 'novasenha99' })).status).toBe(
        200,
      );
    });

    it('trocar a senha por recuperação encerra as sessões abertas', async () => {
      const { p, b } = await registered();
      expect((await b.call('GET', '/auth/me')).status).toBe(200);
      await browser().call('POST', '/auth/password/forgot', { email: p.email });
      await browser().call('POST', '/auth/password/reset', {
        token: tokenFrom(mailer.last('recuperacao_senha')),
        password: 'novasenha99',
      });
      expect((await b.call('GET', '/auth/me')).status).toBe(401);
    });

    it('no máximo 3 pedidos por hora por conta; os demais são ignorados em silêncio', async () => {
      const { p } = await registered();
      for (let i = 0; i < 5; i++)
        expect((await browser().call('POST', '/auth/password/forgot', { email: p.email })).status).toBe(202);
      expect(mailer.sent.filter(m => m.template === 'recuperacao_senha')).toHaveLength(3);
      clock.advance(61 * 60_000);
      await browser().call('POST', '/auth/password/forgot', { email: p.email });
      expect(mailer.sent.filter(m => m.template === 'recuperacao_senha')).toHaveLength(4);
    });

    it('o banco guarda só o hash do token e o e-mail de recuperação fica registrado', async () => {
      const { p } = await registered();
      await browser().call('POST', '/auth/password/forgot', { email: p.email });
      const token = tokenFrom(mailer.last('recuperacao_senha'));
      const rows = (await sql('select token_hash from password_resets')).rows;
      expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(rows)).not.toContain(token);
      expect((await sql("select status from email_log where template = 'recuperacao_senha'")).rows[0].status).toBe(
        'enviado',
      );
    });

    it('sem provedor de e-mail configurado, não afirma envio: fica na fila com a falha e segue respondendo igual', async () => {
      const unconfigured = () => build({ mail: unconfiguredEmailSender });
      const p = person();
      const b = browser(unconfigured);
      expect((await b.call('POST', '/auth/register', p)).status).toBe(201); // o cadastro não depende do e-mail
      const res = await browser(unconfigured).call('POST', '/auth/password/forgot', { email: p.email });
      expect(res.status).toBe(202);
      // Sem provedor, o item fica na fila com a falha registrada e nova tentativa agendada. Nunca consta como enviado.
      const logs = (await sql('select template, status, attempts, last_error from email_log order by template')).rows;
      expect(logs).toEqual([
        { template: 'cadastro', status: 'pendente', attempts: 1, last_error: 'EmailNotConfiguredError' },
        { template: 'recuperacao_senha', status: 'pendente', attempts: 1, last_error: 'EmailNotConfiguredError' },
      ]);
    });
  });

  describe('verificação humana (Cloudflare Turnstile) no cadastro e na recuperação', () => {
    /** Verificador falso com as regras do Turnstile: token de uso único; "fora" simula a Cloudflare indisponível. */
    const makeHuman = () => {
      const spent = new Set<string>();
      const human = {
        calls: 0,
        async verify(token: string | undefined): Promise<HumanCheck> {
          human.calls++;
          if (token === 'fora') return 'unavailable';
          if (token?.startsWith('bom-') && !spent.has(token)) {
            spent.add(token);
            return 'ok';
          }
          return 'invalid';
        },
      };
      return human;
    };
    let human: ReturnType<typeof makeHuman>;
    let protectedApp: ReturnType<typeof build>;
    beforeEach(() => {
      human = makeHuman();
      protectedApp = build({ human });
    });
    const call = (path: string, body: unknown, ip = '203.0.113.7') =>
      protectedApp.request(`/api${path}`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify(body),
      });
    const users = async () => (await sql('select count(*)::int as n from users')).rows[0].n as number;
    const recoveryEmails = async () =>
      (await sql("select count(*)::int as n from email_log where template = 'recuperacao_senha'")).rows[0].n as number;

    it('cadastro: sem token 422 (sem chamar a Cloudflare), token recusado 422, Cloudflare fora 503; nada é criado', async () => {
      const p = person();
      const none = await call('/auth/register', p);
      expect([none.status, (await errorOf(none)).codigo]).toEqual([422, 'verificacao_humana_obrigatoria']);
      expect(human.calls).toBe(0); // nem gasta a cota da Cloudflare
      const bad = await call('/auth/register', { ...p, captchaToken: 'ruim' });
      expect([bad.status, (await errorOf(bad)).codigo]).toEqual([422, 'verificacao_humana_invalida']);
      const down = await call('/auth/register', { ...p, captchaToken: 'fora' });
      expect([down.status, (await errorOf(down)).codigo]).toEqual([503, 'verificacao_indisponivel']);
      expect(await users()).toBe(0);
    });

    it('cadastro: com token válido cria a conta; o MESMO token não vale duas vezes', async () => {
      const first = await call('/auth/register', { ...person(), captchaToken: 'bom-1' });
      expect(first.status).toBe(201);
      const reuse = await call('/auth/register', { ...person({ cpf: CPF_B }), captchaToken: 'bom-1' });
      expect([reuse.status, (await errorOf(reuse)).codigo]).toEqual([422, 'verificacao_humana_invalida']);
      expect(await users()).toBe(1);
    });

    it('recuperação: mesma regra; sem token nenhum e-mail é gerado, nem para conta que existe', async () => {
      const p = person();
      expect((await call('/auth/register', { ...p, captchaToken: 'bom-1' })).status).toBe(201);
      const none = await call('/auth/password/forgot', { email: p.email });
      expect([none.status, (await errorOf(none)).codigo]).toEqual([422, 'verificacao_humana_obrigatoria']);
      expect((await call('/auth/password/forgot', { email: p.email, captchaToken: 'ruim' })).status).toBe(422);
      expect((await call('/auth/password/forgot', { email: p.email, captchaToken: 'fora' })).status).toBe(503);
      expect(await recoveryEmails()).toBe(0);
      const ok = await call('/auth/password/forgot', { email: p.email, captchaToken: 'bom-2' });
      expect(ok.status).toBe(202);
      expect(await recoveryEmails()).toBe(1);
    });

    it('IP FORJADO não abre a porta: 60 requisições com IPs diferentes e sem token não criam conta nem e-mail', async () => {
      // É o ataque que motivou a verificação: chamando o run.app direto, o X-Forwarded-For é do atacante e cada pedido parece de um IP novo.
      const victim = person();
      expect((await call('/auth/register', { ...victim, captchaToken: 'bom-1' })).status).toBe(201);
      const results = await Promise.all(
        Array.from({ length: 60 }, (_, i) => {
          const ip = `198.51.100.${i + 1}`;
          return i % 2 === 0
            ? call('/auth/register', person({ cpf: CPF_B }), ip)
            : call('/auth/password/forgot', { email: victim.email }, ip);
        }),
      );
      expect(results.every(r => r.status === 422)).toBe(true);
      expect(await users()).toBe(1);
      expect(await recoveryEmails()).toBe(0);
      expect(human.calls).toBe(1); // só o cadastro legítimo chegou na Cloudflare
    });

    it('limite POR CONTA na recuperação vale mesmo com IPs forjados e tokens válidos: no máximo 3 e-mails por hora', async () => {
      const victim = person();
      expect((await call('/auth/register', { ...victim, captchaToken: 'bom-0' })).status).toBe(201);
      for (let i = 1; i <= 12; i++) {
        const r = await call(
          '/auth/password/forgot',
          { email: victim.email, captchaToken: `bom-${i}` },
          `198.51.100.${i}`,
        );
        expect(r.status).toBe(202); // a resposta é sempre a mesma: não revela o limite
      }
      expect(await recoveryEmails()).toBe(3);
    });

    it('o limite por IP continua como camada extra, sobre o token', async () => {
      const codes: number[] = [];
      for (let i = 1; i <= 24; i++)
        codes.push(
          (
            await call(
              '/auth/password/forgot',
              { email: 'ninguem@partyx.test', captchaToken: `bom-${i}` },
              '203.0.113.99',
            )
          ).status,
        );
      expect(codes.slice(0, 20).every(c => c === 202)).toBe(true);
      expect(codes.slice(20).every(c => c === 429)).toBe(true);
    });

    it('login e as demais rotas não pedem o desafio', async () => {
      const p = person();
      expect((await call('/auth/register', { ...p, captchaToken: 'bom-1' })).status).toBe(201);
      expect((await call('/auth/login', { email: p.email, password: p.password })).status).toBe(200);
    });

    it('sem verificador configurado (local, testes, homologação sem chave) o cadastro segue sem token', async () => {
      expect((await browser().call('POST', '/auth/register', person())).status).toBe(201);
    });
  });

  describe('limites GLOBAIS de cadastro e de recuperação (no banco, sem depender de IP)', () => {
    it('cadastro aceita tetos configuráveis por IP e global sem compartilhar o bloqueio local entre IPs', async () => {
      expect(config().SIGNUPS_PER_IP_PER_HOUR).toBe(100);
      expect(config().GLOBAL_SIGNUPS_PER_HOUR).toBe(1000);
      const capped = build({ cfg: config({ SIGNUPS_PER_IP_PER_HOUR: '2', GLOBAL_SIGNUPS_PER_HOUR: '10' }) });
      const send = (i: number, ip: string) =>
        capped.request('/api/auth/register', {
          method: 'POST',
          headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': ip },
          body: JSON.stringify(person({ cpf: cpfFor(i) })),
        });
      expect((await send(1, '198.51.100.1')).status).toBe(201);
      expect((await send(2, '198.51.100.1')).status).toBe(201);
      expect((await send(3, '198.51.100.1')).status).toBe(429);
      expect((await send(4, '198.51.100.2')).status).toBe(201);
    });
    /** CPF válido e diferente para cada índice. */
    const cpfFor = (i: number) => {
      const d = String(100000000 + i * 7919)
        .slice(0, 9)
        .split('')
        .map(Number);
      const dv = (a: number[], w: number) => {
        const r = (a.reduce((t, x, k) => t + x * (w - k), 0) * 10) % 11;
        return r === 10 ? 0 : r;
      };
      const d1 = dv(d, 10);
      return [...d, d1, dv([...d, d1], 11)].join('');
    };
    let limited: ReturnType<typeof build>;
    beforeEach(() => {
      limited = build({ cfg: config({ GLOBAL_SIGNUPS_PER_HOUR: '3', GLOBAL_RECOVERIES_PER_HOUR: '5' }) });
    });
    const post = (path: string, body: unknown, ip: string) =>
      limited.request(`/api${path}`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify(body),
      });
    const signup = (i: number, ip = `198.51.100.${i + 1}`, over: Record<string, unknown> = {}) =>
      post('/auth/register', person({ cpf: cpfFor(i), ...over }), ip);
    const users = async () => (await sql('select count(*)::int as n from users')).rows[0].n as number;
    const stderr = () => {
      const spy = vi.spyOn(process.stderr, 'write');
      return {
        spy,
        alerts: () => spy.mock.calls.map(c => String(c[0])).filter(l => l.includes('"alert":"limite_global_atingido"')),
      };
    };

    it('cadastro: o 4º do total é recusado com 429 mesmo com IPs todos diferentes (IP forjado não fura); nada é criado', async () => {
      for (let i = 1; i <= 3; i++) expect((await signup(i)).status, `cadastro ${i}`).toBe(201);
      const res = await signup(4);
      expect([res.status, (await errorOf(res)).codigo]).toEqual([429, 'limite_global']);
      expect(await users()).toBe(3);
      for (let i = 5; i <= 12; i++) expect((await signup(i, `203.0.113.${i}`)).status).toBe(429);
      expect(await users()).toBe(3);
    });

    it('cadastro: tentativa INVÁLIDA não gasta o limite (CPF repetido, senha fraca, sem aceite), então lixo em massa não bloqueia quem se cadastra de verdade', async () => {
      expect((await signup(1)).status).toBe(201);
      for (let k = 0; k < 15; k++) {
        const dup = await signup(1, `192.0.2.${k + 1}`, { email: `outro${k}@partyx.test` }); // CPF já cadastrado
        expect(dup.status).toBe(422);
      }
      expect((await signup(2, '192.0.2.200', { password: '123' })).status).toBe(422);
      expect((await signup(3, '192.0.2.201', { accept: false })).status).toBe(422);
      expect(await users()).toBe(1);
      expect((await signup(2)).status).toBe(201);
      expect((await signup(3)).status).toBe(201);
      expect((await signup(4)).status).toBe(429); // agora sim: 3 contas criadas
    });

    it('cadastro: a janela desliza: 61 minutos depois volta a aceitar', async () => {
      for (let i = 1; i <= 3; i++) await signup(i);
      expect((await signup(4)).status).toBe(429);
      clock.advance(61 * 60_000);
      expect((await signup(4)).status).toBe(201);
    });

    it('recuperação: o 6º pedido do total é recusado (429), de IPs diferentes, exista a conta ou não; a resposta antes do limite continua igual', async () => {
      const real = person();
      expect((await signup(1, '198.51.100.1', { email: real.email })).status).toBe(201);
      const first = await post('/auth/password/forgot', { email: real.email }, '10.0.0.1');
      const unknown = await post('/auth/password/forgot', { email: 'ninguem@partyx.test' }, '10.0.0.2');
      expect([first.status, unknown.status]).toEqual([202, 202]);
      expect(await first.json()).toEqual(await unknown.json());
      for (let i = 3; i <= 5; i++)
        expect((await post('/auth/password/forgot', { email: `x${i}@partyx.test` }, `10.0.0.${i}`)).status).toBe(202);
      const over = await post('/auth/password/forgot', { email: real.email }, '10.0.0.99');
      const overUnknown = await post('/auth/password/forgot', { email: 'ninguem@partyx.test' }, '10.0.0.98');
      expect([over.status, overUnknown.status]).toEqual([429, 429]); // existir ou não a conta não muda nada
      expect((await errorOf(over)).codigo).toBe('limite_global');
      clock.advance(61 * 60_000);
      expect((await post('/auth/password/forgot', { email: real.email }, '10.0.0.77')).status).toBe(202);
    });

    it('recuperação: o limite por CONTA (3 por hora) continua valendo por dentro do global', async () => {
      const wide = build({ cfg: config({ GLOBAL_RECOVERIES_PER_HOUR: '100' }) });
      const p = person();
      expect(
        (
          await wide.request('/api/auth/register', {
            method: 'POST',
            headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' },
            body: JSON.stringify(p),
          })
        ).status,
      ).toBe(201);
      for (let i = 0; i < 8; i++)
        await wide.request('/api/auth/password/forgot', {
          method: 'POST',
          headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${i + 1}` },
          body: JSON.stringify({ email: p.email }),
        });
      expect(mailer.sent.filter(m => m.template === 'recuperacao_senha')).toHaveLength(3);
    });

    it('ALERTA: ao atingir qualquer limite global sai UM alerta `limite_global_atingido` por tipo, com o tipo e o limite, sem dado pessoal', async () => {
      const a = stderr();
      try {
        for (let i = 1; i <= 3; i++) await signup(i);
        for (let i = 4; i <= 14; i++) await signup(i, `203.0.113.${i}`);
        for (let i = 1; i <= 5; i++) await post('/auth/password/forgot', { email: `y${i}@partyx.test` }, `10.2.0.${i}`);
        for (let i = 6; i <= 20; i++)
          await post('/auth/password/forgot', { email: `y${i}@partyx.test` }, `10.2.0.${i}`);
        const lines = a.alerts();
        expect(lines).toHaveLength(2); // um de cadastro e um de recuperação, apesar de dezenas de recusas
        expect(lines.some(l => l.includes('"kind":"cadastro"') && l.includes('"limitPerHour":3'))).toBe(true);
        expect(lines.some(l => l.includes('"kind":"recuperacao"') && l.includes('"limitPerHour":5'))).toBe(true);
        expect(lines.join('')).not.toMatch(/@partyx\.test|marina|\d{11}/);
      } finally {
        a.spy.mockRestore();
      }
    });

    it('S-02: cada resposta "já tem cadastro" conta no teto global; atingido, TODO cadastro (novo ou repetido) responde 429 igual, sem oráculo', async () => {
      const dups = build({ cfg: config({ GLOBAL_SIGNUP_DUPLICATES_PER_HOUR: '4' }) });
      const send = (body: unknown, ip: string) =>
        dups.request('/api/auth/register', {
          method: 'POST',
          headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': ip },
          body: JSON.stringify(body),
        });
      const known = person({ cpf: cpfFor(1) });
      expect((await send(known, '198.51.100.1')).status).toBe(201);
      // Contas novas não gastam o teto de repetidos.
      for (let i = 2; i <= 6; i++) expect((await send(person({ cpf: cpfFor(i) }), `198.51.100.${i}`)).status).toBe(201);
      // Abaixo do teto, a mensagem clara do CA-02 continua, campo a campo.
      for (let k = 0; k < 4; k++) {
        const res = await send({ ...known, email: `outra${k}@partyx.test` }, `192.0.2.${k + 1}`);
        expect(res.status).toBe(422);
        expect(JSON.stringify(await res.json())).toContain('Este CPF já tem cadastro');
      }
      const a = stderr();
      try {
        // Teto atingido: o CPF já cadastrado e um CPF novo recebem a MESMA resposta, de IPs diferentes; nada é criado.
        const again = await send({ ...known, email: 'mais@partyx.test' }, '203.0.113.1');
        const fresh = await send(person({ cpf: cpfFor(50) }), '203.0.113.2');
        expect([again.status, fresh.status]).toEqual([429, 429]);
        const [e1, e2] = [await errorOf(again), await errorOf(fresh)];
        expect(e1).toEqual(e2);
        expect(e1.codigo).toBe('limite_global');
        expect(await users()).toBe(6);
        for (let k = 0; k < 10; k++) await send(person({ cpf: cpfFor(60 + k) }), `203.0.113.${10 + k}`);
        const lines = a.alerts();
        expect(lines).toHaveLength(1); // um alerta por balde, não por recusa
        expect(lines[0]).toContain('"kind":"cadastro_existente"');
        expect(lines[0]).toContain('"limitPerHour":4');
        expect(lines.join('')).not.toMatch(/@partyx\.test|\d{11}/);
      } finally {
        a.spy.mockRestore();
      }
      // A janela desliza: uma hora depois o cadastro volta.
      clock.advance(61 * 60_000);
      expect((await send(person({ cpf: cpfFor(51) }), '203.0.113.3')).status).toBe(201);
    });

    it('S-02: a corrida de dois cadastros iguais (o banco decide) também conta como resposta "já tem cadastro"', async () => {
      const p = person({ cpf: cpfFor(7) });
      const res = await Promise.all([1, 2].map(i => signup(7, `198.51.100.${70 + i}`, { email: p.email })));
      expect(res.map(r => r.status).sort()).toEqual([201, 422]);
      const n = await sql(
        "select coalesce(sum(count), 0)::int as n from global_limit_counters where kind = 'cadastro_existente'",
      );
      expect(n.rows[0].n).toBe(1);
    });

    it('com o Turnstile DESLIGADO (padrão) o cadastro e a recuperação não pedem token e a tela não recebe chave nem script', async () => {
      const site = (await (await limited.request('/api/public/site')).json()) as { turnstileSiteKey: string | null };
      expect(site.turnstileSiteKey).toBeNull();
      const html = await limited.request('/');
      expect(html.headers.get('content-security-policy') ?? '').not.toContain('cloudflare');
      expect((await signup(1)).status).toBe(201); // sem captchaToken
      expect((await post('/auth/password/forgot', { email: 'ninguem@partyx.test' }, '10.3.0.1')).status).toBe(202);
    });
  });

  describe('conta do cliente', () => {
    it('edita nome e telefone, mas não e-mail nem CPF (RF-06)', async () => {
      const p = person();
      const b = browser();
      await b.call('POST', '/auth/register', p);
      await b.arm();
      const res = await b.secured('PATCH', '/me', {
        name: 'Marina C. Souza',
        phone: '(55) 3333-4444',
        email: 'outro@partyx.test',
        cpf: CPF_B,
      });
      expect(res.status).toBe(200);
      const row = (await sql('select name, phone, email, cpf from users')).rows[0];
      expect(row).toEqual({ name: 'Marina C. Souza', phone: '5533334444', email: p.email, cpf: CPF_A });
    });

    it('valida nome e telefone ao editar', async () => {
      const b = browser();
      await b.call('POST', '/auth/register', person());
      await b.arm();
      const res = await b.secured('PATCH', '/me', { name: 'Marina', phone: '12' });
      expect(await fields(res)).toEqual(['name', 'phone']);
    });

    it('exige login para editar', async () => {
      const res = await browser().call('PATCH', '/me', { name: 'Marina Costa', phone: '55998124470' });
      expect(res.status).toBe(401);
    });

    it('troca a senha com a senha atual e encerra as outras sessões, mantendo a atual', async () => {
      const p = person();
      const a = browser();
      await a.call('POST', '/auth/register', p);
      const other = browser();
      await other.call('POST', '/auth/login', { email: p.email, password: p.password });
      await a.arm();

      const wrongCurrent = await a.secured('POST', '/me/password', {
        currentPassword: 'errada123',
        newPassword: 'novasenha99',
      });
      expect(await fields(wrongCurrent)).toEqual(['currentPassword']);
      const same = await a.secured('POST', '/me/password', { currentPassword: p.password, newPassword: p.password });
      expect(await fields(same)).toEqual(['newPassword']);

      expect(
        (await a.secured('POST', '/me/password', { currentPassword: p.password, newPassword: 'novasenha99' })).status,
      ).toBe(200);
      expect((await a.call('GET', '/auth/me')).status).toBe(200);
      expect((await other.call('GET', '/auth/me')).status).toBe(401);
      expect((await browser().call('POST', '/auth/login', { email: p.email, password: 'novasenha99' })).status).toBe(
        200,
      );
    });
  });

  describe('o que nunca vai para o log', () => {
    const captured: string[] = [];
    let spy: ReturnType<typeof vi.spyOn>[];
    beforeEach(() => {
      captured.length = 0;
      const grab = (chunk: unknown) => {
        captured.push(String(chunk));
        return true;
      };
      spy = [
        vi.spyOn(process.stdout, 'write').mockImplementation(grab as never),
        vi.spyOn(process.stderr, 'write').mockImplementation(grab as never),
      ];
    });
    afterEach(() => spy.forEach(s => s.mockRestore()));

    it('CPF, senha, e-mail e tokens não aparecem em nenhuma linha de log, nem em erros', async () => {
      const p = person({ password: 'senha-secreta-777' });
      const b = browser();
      await b.call('POST', '/auth/register', p);
      await b.call('POST', '/auth/login', { email: p.email, password: 'errada-000' });
      await browser().call('POST', '/auth/password/forgot', { email: p.email });
      const token = new URL(mailer.last('recuperacao_senha')!.data.link!).searchParams.get('token')!;
      await browser().call('POST', '/auth/password/reset', { token, password: 'nova-secreta-888' });
      await browser(() => build({ mail: unconfiguredEmailSender })).call('POST', '/auth/password/forgot', {
        email: p.email,
      });

      const all = captured.join('');
      for (const secret of [
        CPF_A,
        'senha-secreta-777',
        'errada-000',
        'nova-secreta-888',
        token,
        p.email,
        b.cookie.split('=')[1] ?? 'ø',
      ]) {
        expect(all, `vazou: ${secret.slice(0, 6)}…`).not.toContain(secret);
      }
    });
  });
});
