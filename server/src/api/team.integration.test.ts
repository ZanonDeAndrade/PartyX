import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { bootstrapFirstAdmin } from '../auth/bootstrap';
import { setMemberActive } from '../auth/team';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost';
const PASSWORD = 'festa2026';
const ID = '0b0f4f55-0a7a-4c3e-9a55-7a3e8f4c9a11';

describe.skipIf(!ADMIN_URL)('equipe e permissões (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  const clock = createFakeClock('2026-10-17T12:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);

  /** Navegador simulado com cookie e token CSRF. */
  const browser = () => {
    let cookie = '';
    let csrf = '';
    const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const res = await app.request(`/api${path}`, {
        method,
        headers: {
          origin: ORIGIN,
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.7',
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = /max-age=0|expires=thu, 01 jan 1970/i.test(set) ? '' : set.split(';')[0]!;
      return res;
    };
    return {
      call,
      async login(email: string, password = PASSWORD) {
        const res = await call('POST', '/auth/login', { email, password });
        if (res.status === 200)
          csrf = ((await (await call('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
        return res;
      },
      send: (method: string, path: string, body?: unknown) => call(method, path, body, { 'x-csrf-token': csrf }),
    };
  };

  let n = 0;
  /** Cria um usuário direto no banco, com senha conhecida e CPF fictício único. */
  async function seed(
    role: 'cliente' | 'validador' | 'administrador',
    extra: { mustChange?: boolean; active?: boolean } = {},
  ) {
    const i = ++n;
    const email = `${role}${i}@partyx.test`;
    const cpf = role === 'cliente' ? validCpf(i) : null;
    const { rows } = await sql(
      `insert into users (name, email, cpf, phone, password_hash, role, is_active, must_change_password)
       values ($1,$2,$3,'55998124470',$4,$5,$6,$7) returning id`,
      [
        `Pessoa ${role} ${i}`,
        email,
        cpf,
        await argon2Hasher.hash(PASSWORD),
        role,
        extra.active ?? true,
        extra.mustChange ?? false,
      ],
    );
    return { id: rows[0].id as string, email };
  }
  function validCpf(seedNumber: number): string {
    const base = String(100000000 + seedNumber * 7919)
      .slice(0, 9)
      .split('')
      .map(Number);
    const d = (arr: number[], w: number) => {
      const r = (arr.reduce((t, x, k) => t + x * (w - k), 0) * 10) % 11;
      return r === 10 ? 0 : r;
    };
    const d1 = d(base, 10);
    const d2 = d([...base, d1], 11);
    return [...base, d1, d2].join('');
  }
  const loggedIn = async (role: 'cliente' | 'validador' | 'administrador') => {
    const u = await seed(role);
    const b = browser();
    expect((await b.login(u.email)).status).toBe(200);
    return { ...u, b };
  };
  const errorCode = async (res: Response) => ((await res.json()) as { erro: { codigo: string } }).erro.codigo;
  const newMember = (o: Record<string, unknown> = {}) => ({
    name: 'Carlos Portaria',
    email: `equipe${++n}@partyx.test`,
    role: 'validador',
    ...o,
  });

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    app = createApp({
      config: loadConfig({ APP_ENV: 'local' }),
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender() },
    });
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql('truncate login_attempts, sessions, password_resets, consents, email_log, audit_log, users cascade');
    clock.set('2026-10-17T12:00:00Z');
  });

  describe('matriz de acesso (RF-07, RF-09, CA-05)', () => {
    /** Rotas públicas por desenho. Qualquer outra rota registrada precisa recusar quem não tem sessão. */
    const PUBLIC = new Set([
      'GET /api/health',
      'GET /api/public/site',
      'GET /api/public/home',
      'GET /api/public/legal/:kind',
      'GET /api/public/events',
      'GET /api/public/events/:slug',
      // Termo de Autorização EM BRANCO do evento (regras de menores): só dados do evento, sem dado pessoal.
      'GET /api/public/events/:slug/autorizacao-menor.pdf',
      'GET /api/legal/versions',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'POST /api/auth/password/forgot',
      'POST /api/auth/password/check',
      'POST /api/auth/password/reset',
      // Entradas de máquina, com autenticação própria (assinatura do gateway; token OIDC do Scheduler). Testadas em payments.*.test.ts.
      'POST /api/webhooks/payments',
      'POST /api/internal/jobs/reconcile-payments',
      'POST /api/internal/jobs/purge-retention',
      'POST /api/internal/tasks/reconcile-order',
      'POST /api/internal/tasks/send-email',
    ]);
    const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, ID);
    const endpoints = () =>
      app.routes
        .filter(r => r.method !== 'ALL' && r.path.startsWith('/api') && !r.path.includes('*'))
        .map(r => ({ method: r.method, path: concrete(r.path.replace(/^\/api/, '')), key: `${r.method} ${r.path}` }));

    it('toda rota não pública recusa requisição sem sessão', async () => {
      const guarded = endpoints().filter(e => !PUBLIC.has(e.key) && !e.key.startsWith('GET /api/health'));
      expect(guarded.length).toBeGreaterThanOrEqual(8); // protege contra o teste passar vazio
      for (const e of guarded) {
        const res = await browser().call(e.method, e.path, e.method === 'GET' ? undefined : {});
        expect([e.key, res.status], e.key).toEqual([e.key, 401]);
      }
    });

    it('NENHUMA resposta de /api é cacheável por CDN: todas as rotas, anônimo e logado, sucesso e erro', async () => {
      // Atrás do Firebase Hosting, qualquer resposta com cache público poderia ser servida a outro usuário.
      const routes = endpoints();
      expect(routes.length).toBeGreaterThanOrEqual(30);
      const seen = new Set<string>();
      const check = async (who: string, res: Response, key: string) => {
        expect([who, key, res.headers.get('cache-control')], `${who} ${key}`).toEqual([who, key, 'private, no-store']);
        seen.add(`${res.status >= 400 ? 'erro' : 'ok'}`);
      };
      for (const e of routes) {
        await check('anônimo', await browser().call(e.method, e.path, e.method === 'GET' ? undefined : {}), e.key);
      }
      // Logado, só leituras (as escritas têm efeito colateral e já são cobertas pelos testes de cada módulo).
      for (const role of ['administrador', 'validador', 'cliente'] as const) {
        const { b } = await loggedIn(role);
        for (const e of routes.filter(r => r.method === 'GET'))
          await check(role, await b.send('GET', e.path), e.key);
        await check(role, await b.call('GET', '/auth/me'), 'GET /api/auth/me');
        await check(role, await b.call('GET', '/rota-que-nao-existe'), 'GET /api/rota-que-nao-existe');
      }
      expect([...seen].sort()).toEqual(['erro', 'ok']); // o teste viu respostas de sucesso E de erro
    });

    it('toda rota de /admin recusa cliente e validador, mesmo por URL direta', async () => {
      const adminRoutes = endpoints().filter(e => e.path.startsWith('/admin'));
      expect(adminRoutes.length).toBeGreaterThanOrEqual(6);
      for (const role of ['cliente', 'validador'] as const) {
        const { b } = await loggedIn(role);
        for (const e of adminRoutes) {
          const res = await b.send(e.method, e.path, e.method === 'GET' ? undefined : {});
          expect([role, e.key, res.status, await errorCode(res)]).toEqual([role, e.key, 403, 'sem_permissao']);
        }
      }
    });

    it('caminho de /admin que nem existe também é negado ao validador (nega por padrão, não 404)', async () => {
      const { b } = await loggedIn('validador');
      for (const path of ['/admin', '/admin/relatorios', '/admin/events/1/export.csv']) {
        expect((await b.call('GET', path)).status, path).toBe(403);
      }
      expect((await browser().call('GET', '/admin/qualquer')).status).toBe(401);
    });

    it('o administrador alcança a área', async () => {
      const { b } = await loggedIn('administrador');
      const res = await b.call('GET', '/admin/team');
      expect(res.status).toBe(200);
    });

    it('validador e cliente seguem usando a própria conta (/me)', async () => {
      const { b } = await loggedIn('validador');
      const res = await b.send('PATCH', '/me', { name: 'Carlos Portaria', phone: '(55) 99812-4470' });
      expect(res.status).toBe(200);
    });
  });

  describe('cadastro público não escolhe perfil (RF-07)', () => {
    it('ignora role e isActive enviados no cadastro e cria sempre cliente', async () => {
      const res = await browser().call('POST', '/auth/register', {
        name: 'Marina Costa',
        email: 'marina@partyx.test',
        cpf: validCpf(901),
        phone: '(55) 99812-4470',
        birthDate: '1995-03-20',
        password: PASSWORD,
        acceptedTermsVersion: 'ficticio-0',
        acceptedPrivacyVersion: 'ficticio-0',
        accept: true,
        role: 'administrador',
        isActive: true,
        mustChangePassword: false,
      });
      expect(res.status).toBe(201);
      const { rows } = await sql("select role from users where email = 'marina@partyx.test'");
      expect(rows[0].role).toBe('cliente');
    });

    it('o próprio cliente não consegue mudar o perfil pela conta', async () => {
      const { b, id } = await loggedIn('cliente');
      await b.send('PATCH', '/me', { name: 'Marina Costa', phone: '(55) 99812-4470', role: 'administrador' });
      expect((await sql('select role from users where id = $1', [id])).rows[0].role).toBe('cliente');
    });
  });

  describe('cadastro da equipe (RF-08)', () => {
    it('cria o acesso com senha temporária aleatória, mostrada só na resposta, e exige a troca', async () => {
      const { b } = await loggedIn('administrador');
      const res = await b.send('POST', '/admin/team', newMember({ phone: '(55) 99812-4470' }));
      expect(res.status).toBe(201);
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      const { member, temporaryPassword } = (await res.json()) as {
        member: Record<string, unknown>;
        temporaryPassword: string;
      };
      expect(temporaryPassword).toMatch(/^[A-Za-z2-9]{12,}$/);
      expect(member).toMatchObject({ role: 'validador', isActive: true, mustChangePassword: true });
      expect(member).not.toHaveProperty('passwordHash');

      // A senha não fica em texto no banco nem na auditoria.
      const stored = await sql('select password_hash from users where id = $1', [member.id]);
      expect(stored.rows[0].password_hash).toMatch(/^\$argon2id\$/);
      const audit = await sql("select before_json, after_json from audit_log where action = 'equipe.criar'");
      expect(JSON.stringify(audit.rows)).not.toContain(temporaryPassword);
      expect(JSON.stringify(audit.rows)).not.toContain('argon2');

      // Duas criações geram senhas diferentes.
      const second = (await (await b.send('POST', '/admin/team', newMember())).json()) as { temporaryPassword: string };
      expect(second.temporaryPassword).not.toBe(temporaryPassword);
    });

    it('com a senha temporária, entra, mas só consegue trocar a senha, ver a conta e sair', async () => {
      const { b: adminB } = await loggedIn('administrador');
      const data = newMember({ role: 'administrador' });
      const created = (await (await adminB.send('POST', '/admin/team', data)).json()) as { temporaryPassword: string };

      const staff = browser();
      const login = await staff.login(data.email, created.temporaryPassword);
      expect(login.status).toBe(200);
      expect(((await login.json()) as { user: { mustChangePassword: boolean } }).user.mustChangePassword).toBe(true);
      expect((await staff.call('GET', '/auth/me')).status).toBe(200);

      // Bloqueado em área restrita (portaria e admin) até trocar.
      expect(await errorCode(await staff.send('GET', '/admin/team'))).toBe('troca_de_senha_obrigatoria');

      const change = await staff.send('POST', '/me/password', {
        currentPassword: created.temporaryPassword,
        newPassword: 'nova-senha-2026',
      });
      expect(change.status).toBe(200);
      const me = (await (await staff.call('GET', '/auth/me')).json()) as { user: { mustChangePassword: boolean } };
      expect(me.user.mustChangePassword).toBe(false);
      // Depois da troca, a área libera.
      expect((await staff.send('GET', '/admin/team')).status).toBe(200);
    });

    it('recusa dados inválidos e e-mail ou CPF repetidos', async () => {
      const { b } = await loggedIn('administrador');
      const bad = await b.send('POST', '/admin/team', { name: 'Só', email: 'xx', role: 'validador' });
      expect(bad.status).toBe(422);
      const roleBad = await b.send('POST', '/admin/team', newMember({ role: 'cliente' }));
      expect(roleBad.status).toBe(422);
      const cpfBad = await b.send('POST', '/admin/team', newMember({ cpf: '11111111111' }));
      expect(cpfBad.status).toBe(422);

      const data = newMember({ cpf: validCpf(700) });
      expect((await b.send('POST', '/admin/team', data)).status).toBe(201);
      const dupEmail = await b.send('POST', '/admin/team', { ...data, cpf: undefined });
      expect(dupEmail.status).toBe(422);
      const dupCpf = await b.send('POST', '/admin/team', newMember({ cpf: validCpf(700) }));
      expect(dupCpf.status).toBe(422);
    });

    it('a lista traz só a equipe, com CPF mascarado', async () => {
      const { b } = await loggedIn('administrador');
      await seed('cliente');
      await b.send('POST', '/admin/team', newMember({ cpf: validCpf(701) }));
      const { team } = (await (await b.call('GET', '/admin/team')).json()) as {
        team: { role: string; cpf: string | null }[];
      };
      expect(team.every(m => m.role !== 'cliente')).toBe(true);
      expect(team.length).toBe(2);
      expect(team.find(m => m.cpf)?.cpf).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
    });
  });

  describe('edição, ativação e desativação (RF-08, CA-06)', () => {
    it('edita nome, telefone e perfil e registra antes e depois', async () => {
      const { b, id: adminId } = await loggedIn('administrador');
      const target = await seed('validador');
      const res = await b.send('PATCH', `/admin/team/${target.id}`, {
        name: 'Carla Nova Portaria',
        phone: '(11) 91234-5678',
        role: 'administrador',
      });
      expect(res.status).toBe(200);
      const { rows } = await sql(
        "select actor_id, before_json, after_json from audit_log where action = 'equipe.editar'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_id).toBe(adminId);
      expect(rows[0].before_json).toMatchObject({ role: 'validador' });
      expect(rows[0].after_json).toMatchObject({ role: 'administrador', name: 'Carla Nova Portaria' });
    });

    it('mudar o perfil derruba as sessões do usuário', async () => {
      const { b } = await loggedIn('administrador');
      const staff = await loggedIn('validador');
      await b.send('PATCH', `/admin/team/${staff.id}`, { role: 'administrador' });
      expect((await staff.b.call('GET', '/auth/me')).status).toBe(401);
    });

    it('usuário desativado não consegue entrar, e a sessão aberta cai na hora (CA-06)', async () => {
      const { b } = await loggedIn('administrador');
      const staff = await loggedIn('validador');
      expect((await staff.b.call('GET', '/auth/me')).status).toBe(200);

      const res = await b.send('POST', `/admin/team/${staff.id}/deactivate`);
      expect(res.status).toBe(200);
      expect((await staff.b.call('GET', '/auth/me')).status).toBe(401);
      expect(
        (await sql('select count(*)::int as n from sessions where user_id = $1 and revoked_at is null', [staff.id]))
          .rows[0].n,
      ).toBe(0);

      const again = await browser().login(staff.email);
      expect(again.status).toBe(403);
      expect(await errorCode(again)).toBe('conta_desativada');
    });

    it('reativar devolve o acesso, e as duas mudanças ficam na trilha', async () => {
      const { b } = await loggedIn('administrador');
      const staff = await seed('validador', { active: false });
      expect((await b.send('POST', `/admin/team/${staff.id}/activate`)).status).toBe(200);
      expect((await browser().login(staff.email)).status).toBe(200);
      await b.send('POST', `/admin/team/${staff.id}/deactivate`);
      const { rows } = await sql('select action from audit_log where entity_id = $1 order by created_at, id', [
        staff.id,
      ]);
      expect(rows.map(r => r.action).sort()).toEqual(['equipe.ativar', 'equipe.desativar']);
    });

    it('repetir a desativação não grava auditoria nova', async () => {
      const { b } = await loggedIn('administrador');
      const staff = await seed('validador');
      await b.send('POST', `/admin/team/${staff.id}/deactivate`);
      await b.send('POST', `/admin/team/${staff.id}/deactivate`);
      expect((await sql("select count(*)::int as n from audit_log where action = 'equipe.desativar'")).rows[0].n).toBe(
        1,
      );
    });

    it('cliente não aparece nestas rotas: responde como se não existisse', async () => {
      const { b } = await loggedIn('administrador');
      const client = await seed('cliente');
      expect((await b.send('POST', `/admin/team/${client.id}/deactivate`)).status).toBe(404);
      expect((await b.send('PATCH', `/admin/team/${client.id}`, { name: 'Outro Nome' })).status).toBe(404);
      expect((await b.send('PATCH', `/admin/team/não-é-uuid`, { name: 'Outro Nome' })).status).toBe(404);
      expect((await sql('select is_active from users where id = $1', [client.id])).rows[0].is_active).toBe(true);
    });

    it('senha temporária nova invalida a senha e as sessões antigas e exige troca', async () => {
      const { b } = await loggedIn('administrador');
      const staff = await loggedIn('validador');
      const res = await b.send('POST', `/admin/team/${staff.id}/temporary-password`);
      expect(res.status).toBe(200);
      const { temporaryPassword } = (await res.json()) as { temporaryPassword: string };
      expect((await staff.b.call('GET', '/auth/me')).status).toBe(401);
      expect((await browser().login(staff.email, PASSWORD)).status).toBe(401);
      const fresh = browser();
      const login = await fresh.login(staff.email, temporaryPassword);
      expect(((await login.json()) as { user: { mustChangePassword: boolean } }).user.mustChangePassword).toBe(true);
      const audit = await sql("select after_json from audit_log where action = 'equipe.senha_temporaria'");
      expect(JSON.stringify(audit.rows)).not.toContain(temporaryPassword);
    });
  });

  describe('elevação de privilégio', () => {
    it('validador não cria administrador nem ativa a si mesmo, por nenhuma rota de /admin', async () => {
      const staff = await loggedIn('validador');
      const attempts: [string, string, unknown][] = [
        ['POST', '/admin/team', newMember({ role: 'administrador' })],
        ['PATCH', `/admin/team/${staff.id}`, { role: 'administrador' }],
        ['POST', `/admin/team/${staff.id}/activate`, undefined],
        ['POST', `/admin/team/${staff.id}/temporary-password`, undefined],
        ['PATCH', `/admin/users/${staff.id}/identity`, { email: 'novo@partyx.test', reason: 'teste de acesso' }],
      ];
      for (const [m, p, body] of attempts) expect((await staff.b.send(m, p, body ?? {})).status, `${m} ${p}`).toBe(403);
      expect((await sql('select role from users where id = $1', [staff.id])).rows[0].role).toBe('validador');
      expect((await sql('select count(*)::int as n from audit_log')).rows[0].n).toBe(0);
    });

    it('cliente com CSRF correto também é barrado', async () => {
      const client = await loggedIn('cliente');
      const res = await client.b.send('POST', '/admin/team', newMember({ role: 'administrador' }));
      expect(res.status).toBe(403);
      expect((await sql("select count(*)::int as n from users where role = 'administrador'")).rows[0].n).toBe(0);
    });

    it('administrador desativado perde a área na hora, mesmo com a sessão antiga em mãos', async () => {
      const a = await loggedIn('administrador');
      const b2 = await loggedIn('administrador');
      expect((await a.b.send('POST', `/admin/team/${b2.id}/deactivate`)).status).toBe(200);
      expect((await b2.b.call('GET', '/admin/team')).status).toBe(401);
    });

    it('mudar a sessão para outro perfil por cabeçalho ou corpo não funciona (o perfil vem só do banco)', async () => {
      const staff = await loggedIn('validador');
      const res = await staff.b.call('GET', '/admin/team', undefined, {
        'x-role': 'administrador',
        'x-user-role': 'administrador',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('proteções do administrador', () => {
    it('não deixa desativar a si mesmo nem trocar o próprio perfil', async () => {
      const a = await loggedIn('administrador');
      await seed('administrador'); // há outro, então a barreira é a regra de autoalteração
      expect(await errorCode(await a.b.send('POST', `/admin/team/${a.id}/deactivate`))).toBe('autoalteracao');
      expect(await errorCode(await a.b.send('PATCH', `/admin/team/${a.id}`, { role: 'validador' }))).toBe(
        'autoalteracao',
      );
    });

    it('nunca fica sem administrador ativo: dois administradores se desativando ao mesmo tempo', async () => {
      // Direto no serviço, sem a fila de login e sessão do HTTP, para as duas transações competirem de verdade.
      const deps = {
        db: createDrizzle(testDb.pool),
        hasher: argon2Hasher,
        clock,
        mailer: new MemoryEmailSender(),
        config: loadConfig({ APP_ENV: 'local' }),
      };
      for (let round = 0; round < 15; round++) {
        await sql("update users set is_active = false where role = 'administrador'");
        const a = await seed('administrador');
        const b2 = await seed('administrador');
        const results = await Promise.allSettled([
          setMemberActive(deps, { id: a.id }, b2.id, false),
          setMemberActive(deps, { id: b2.id }, a.id, false),
        ]);
        expect(
          results.filter(r => r.status === 'fulfilled'),
          `rodada ${round}`,
        ).toHaveLength(1);
        expect(
          (await sql("select count(*)::int as n from users where role = 'administrador' and is_active")).rows[0].n,
          `rodada ${round}`,
        ).toBe(1);
      }
    });

    it('o último administrador ativo não pode perder o perfil por outro administrador', async () => {
      const a = await loggedIn('administrador');
      const target = await seed('administrador', { active: false });
      // Reativar e depois tentar rebaixar o único outro ativo: aqui só há `a` ativo, então rebaixar `a` por si é barrado.
      expect(await errorCode(await a.b.send('PATCH', `/admin/team/${a.id}`, { role: 'validador' }))).toBe(
        'autoalteracao',
      );
      expect((await a.b.send('POST', `/admin/team/${target.id}/deactivate`)).status).toBe(200);
      expect(
        (await sql("select count(*)::int as n from users where role = 'administrador' and is_active")).rows[0].n,
      ).toBe(1);
    });
  });

  describe('correção de e-mail e CPF pelo administrador (RF-06)', () => {
    it('corrige o e-mail do cliente com motivo, grava antes e depois e derruba as sessões dele', async () => {
      const a = await loggedIn('administrador');
      const client = await loggedIn('cliente');
      const res = await a.b.send('PATCH', `/admin/users/${client.id}/identity`, {
        email: 'Correto@PartyX.test',
        reason: 'Erro de digitação no cadastro',
      });
      expect(res.status).toBe(200);
      expect((await sql('select email from users where id = $1', [client.id])).rows[0].email).toBe(
        'correto@partyx.test',
      );
      expect((await client.b.call('GET', '/auth/me')).status).toBe(401);
      const { rows } = await sql(
        "select reason, before_json, after_json from audit_log where action = 'usuario.identidade'",
      );
      expect(rows[0].reason).toBe('Erro de digitação no cadastro');
      expect(rows[0].before_json.email).toBe(client.email);
      expect(rows[0].after_json.email).toBe('correto@partyx.test');
    });

    it('exige motivo, CPF válido e não repetido, e não apaga o CPF do cliente', async () => {
      const a = await loggedIn('administrador');
      const c1 = await seed('cliente');
      const c2 = await seed('cliente');
      const cpf2 = (await sql('select cpf from users where id = $1', [c2.id])).rows[0].cpf as string;
      const call = (body: unknown) => a.b.send('PATCH', `/admin/users/${c1.id}/identity`, body);
      expect((await call({ email: 'x@partyx.test', reason: '' })).status).toBe(422);
      expect((await call({ reason: 'motivo válido' })).status).toBe(422);
      expect((await call({ cpf: '12345678900', reason: 'motivo válido' })).status).toBe(422);
      expect((await call({ cpf: cpf2, reason: 'motivo válido' })).status).toBe(422);
      expect((await call({ cpf: '', reason: 'motivo válido' })).status).toBe(422);
      expect((await call({ cpf: validCpf(555), reason: 'motivo válido' })).status).toBe(200);
    });
  });

  describe('primeiro administrador (bootstrap)', () => {
    const deps = () => ({ db: createDrizzle(testDb.pool), hasher: argon2Hasher, clock });
    const input = { name: 'Admin Inicial', email: 'Admin@PartyX.test' };

    it('cria com senha aleatória, exige troca e é idempotente', async () => {
      const first = await bootstrapFirstAdmin(deps(), input);
      expect(first.status).toBe('criado');
      if (first.status !== 'criado') return;
      expect(first.passwordGenerated).toBe(true);
      expect(first.temporaryPassword.length).toBeGreaterThanOrEqual(12);

      const row = (await sql('select role, must_change_password, email from users')).rows[0];
      expect(row).toMatchObject({ role: 'administrador', must_change_password: true, email: 'admin@partyx.test' });

      expect((await bootstrapFirstAdmin(deps(), input)).status).toBe('ja_existe');
      expect((await bootstrapFirstAdmin(deps(), { ...input, email: 'outro@partyx.test' })).status).toBe('ja_existe');
      expect((await sql('select count(*)::int as n from users')).rows[0].n).toBe(1);

      // O administrador criado consegue entrar com a senha gerada.
      const b = browser();
      expect((await b.login('admin@partyx.test', first.temporaryPassword)).status).toBe(200);
    });

    it('duas execuções simultâneas criam um só administrador', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          bootstrapFirstAdmin(deps(), { name: 'Admin Inicial', email: `admin${i}@partyx.test` }),
        ),
      );
      expect(results.filter(r => r.status === 'criado')).toHaveLength(1);
      expect((await sql("select count(*)::int as n from users where role = 'administrador'")).rows[0].n).toBe(1);
    });

    it('usa a senha informada (Secret Manager), valida a força e nunca promove conta existente', async () => {
      await expect(bootstrapFirstAdmin(deps(), { ...input, password: 'curta' })).rejects.toThrow(/senha inicial/);
      const client = await seed('cliente');
      const taken = await bootstrapFirstAdmin(deps(), { name: 'Admin Inicial', email: client.email });
      expect(taken.status).toBe('email_em_uso');
      expect((await sql('select role from users where id = $1', [client.id])).rows[0].role).toBe('cliente');

      const ok = await bootstrapFirstAdmin(deps(), { ...input, password: 'segredo-do-cofre-1' });
      expect(ok).toMatchObject({ status: 'criado', passwordGenerated: false });
      expect((await browser().login('admin@partyx.test', 'segredo-do-cofre-1')).status).toBe(200);
    });

    it('se o administrador existente está desativado, ainda assim não cria outro', async () => {
      await seed('administrador', { active: false });
      expect((await bootstrapFirstAdmin(deps(), input)).status).toBe('ja_existe');
    });

    it('registra na auditoria sem a senha', async () => {
      const r = await bootstrapFirstAdmin(deps(), input);
      const { rows } = await sql("select actor_id, after_json from audit_log where action = 'equipe.bootstrap'");
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_id).toBeNull();
      if (r.status === 'criado') expect(JSON.stringify(rows)).not.toContain(r.temporaryPassword);
    });
  });
});
