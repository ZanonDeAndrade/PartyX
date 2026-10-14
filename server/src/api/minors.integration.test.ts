import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';

/**
 * Regras de menores (14/10/2026): data de nascimento no cadastro, idade na DATA DO EVENTO no checkout, termo de menor aceito e gravado
 * com o pedido, conta antiga sem data, novo aceite dos Termos e correção da data pela PartyX.
 * Hoje (relógio) = 10/10/2026. Evento = 12/12/2026, 22h em São Paulo.
 */
describe.skipIf(!ADMIN_URL)('menores de idade (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const build = (env: Record<string, string> = {}) =>
    createApp({
      config: loadConfig({ APP_ENV: 'local', ...env }),
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender() },
    });
  let app: ReturnType<typeof build>;
  let n = 0;
  const hash = { value: '' };

  /** Navegador simulado de alguém já cadastrado, com a data de nascimento indicada (`null` = conta antiga, sem data). */
  async function person(
    birthDate: string | null,
    o: { role?: 'cliente' | 'administrador'; target?: ReturnType<typeof build>; consent?: string } = {},
  ) {
    const i = ++n;
    const role = o.role ?? 'cliente';
    const email = `pessoa${i}@partyx.test`;
    const { rows } = await sql(
      'insert into users (name, email, cpf, password_hash, role, birth_date) values ($1,$2,$3,$4,$5,$6) returning id',
      [`Pessoa ${i} Teste`, email, role === 'cliente' ? String(20000000000 + i) : null, hash.value, role, birthDate],
    );
    const id = rows[0].id as string;
    if (o.consent)
      // Aceite antigo ANTES do relógio do teste (10/10/2026): o mais recente é o que vale.
      await sql(
        "insert into consents (user_id, terms_version, privacy_version, accepted_at) values ($1,$2,$2,'2026-10-01T12:00:00Z')",
        [id, o.consent],
      );
    const target = o.target ?? app;
    let cookie = '';
    let csrf = '';
    const raw = (method: string, path: string, json?: unknown) => {
      const headers: Record<string, string> = { origin: 'http://localhost', 'x-forwarded-for': '203.0.113.7' };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      if (json !== undefined) headers['content-type'] = 'application/json';
      return target.request(`/api${path}`, {
        method,
        headers,
        body: json === undefined ? undefined : JSON.stringify(json),
      });
    };
    const login = await raw('POST', '/auth/login', { email, password: PASSWORD });
    const loginBody = (await login.clone().json()) as { pendingConsent: boolean };
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    return { id, raw, loginPendingConsent: loginBody.pendingConsent };
  }

  const json = async <T = any>(res: Response) => (await res.json()) as T;
  const code = async (res: Response) => (await json(res)).erro.codigo as string;

  async function event(o: { allowsMinors?: boolean } = {}) {
    const slug = `evento-${++n}`;
    const id = (
      await sql(
        `insert into events (slug,name,starts_at,ends_at,venue,address,description,age_rating,status,allows_minors,judicial_authorization)
         values ($1,'Noite Neon','2026-12-12T22:00:00-03:00','2026-12-13T05:00:00-03:00','Arena','Rua 1','desc',$2,'publicado',$3,$4) returning id`,
        [
          slug,
          o.allowsMinors ? '16 anos' : '18 anos',
          o.allowsMinors ?? false,
          o.allowsMinors ? 'Portaria 12/2026' : null,
        ],
      )
    ).rows[0].id as string;
    const type = (
      await sql(
        `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at)
         values ($1,'Pista',8000,100,'2026-10-01T00:00:00-03:00','2026-12-12T20:00:00-03:00') returning id`,
        [id],
      )
    ).rows[0].id as string;
    return { id, slug, items: [{ ticketTypeId: type, quantity: 1 }] };
  }

  const orders = async (userId: string) =>
    (await sql('select id, buyer_minor from orders where user_id = $1', [userId])).rows as {
      id: string;
      buyer_minor: boolean;
    }[];
  const acceptances = async (userId: string) =>
    (
      await sql(
        'select order_id, term_version, age_at_event, host(ip) as ip from minor_term_acceptances where user_id = $1',
        [userId],
      )
    ).rows;

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    hash.value = await argon2Hasher.hash(PASSWORD);
    app = build();
  });
  afterAll(async () => {
    await testDb?.drop();
  });

  describe('cadastro', () => {
    const body = (o: Record<string, unknown>) => ({
      name: 'Bianca Rocha',
      email: `bianca${++n}@partyx.test`,
      cpf: '52998224725',
      phone: '(55) 99812-4470',
      password: PASSWORD,
      acceptedTermsVersion: 'ficticio-0',
      acceptedPrivacyVersion: 'ficticio-0',
      accept: true,
      ...o,
    });
    const register = (o: Record<string, unknown>) =>
      app.request('/api/auth/register', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' },
        body: JSON.stringify(body(o)),
      });
    const fieldErrors = async (res: Response) =>
      ((await json(res)).erro.detalhes as { campo: string; mensagem: string }[]).filter(d => d.campo === 'birthDate');

    it('exige a data de nascimento e recusa quem tem menos de 16 anos hoje; com 16 completos hoje, cadastra', async () => {
      const sem = await register({ birthDate: '' });
      expect(sem.status).toBe(422);
      expect(await fieldErrors(sem)).toEqual([
        { campo: 'birthDate', mensagem: 'Informe uma data de nascimento válida.' },
      ]);
      const quinze = await register({ birthDate: '2010-10-11' }); // faz 16 amanhã
      expect(await fieldErrors(quinze)).toEqual([
        { campo: 'birthDate', mensagem: 'O cadastro é permitido a partir de 16 anos.' },
      ]);
      expect((await register({ birthDate: '2027-01-01' })).status).toBe(422);
      const ok = await register({ birthDate: '2010-10-10' }); // faz 16 hoje
      expect(ok.status).toBe(201);
      expect((await json(ok)).user.birthDate).toBe('2010-10-10');
      const { rows } = await sql("select birth_date::text as d from users where cpf = '52998224725'");
      expect(rows[0].d).toBe('2010-10-10');
    });
  });

  describe('checkout: idade na data do evento', () => {
    it('evento sem menores: 18 anos (inclusive no dia do aniversário) compra; 17 não, nem na véspera dos 18', async () => {
      const ev = await event();
      const dezessete = await person('2009-06-01');
      const quote = await json(await dezessete.raw('POST', '/checkout/quote', { eventSlug: ev.slug, items: ev.items }));
      expect(quote.summary.buyer).toMatchObject({ age: 17, minor: false, refusal: { code: 'evento_para_maiores' } });
      const recusa = await dezessete.raw('POST', '/orders', { eventSlug: ev.slug, items: ev.items });
      expect(recusa.status).toBe(403);
      expect(await code(recusa)).toBe('evento_para_maiores');
      expect(await orders(dezessete.id)).toHaveLength(0);

      const vespera = await person('2008-12-13'); // faz 18 no dia seguinte ao evento
      expect(await code(await vespera.raw('POST', '/orders', { eventSlug: ev.slug, items: ev.items }))).toBe(
        'evento_para_maiores',
      );

      const aniversario = await person('2008-12-12'); // faz 18 no dia do evento
      const ok = await aniversario.raw('POST', '/orders', { eventSlug: ev.slug, items: ev.items });
      expect(ok.status).toBe(201);
      expect((await json(ok)).order).toMatchObject({ buyerMinor: false, event: { allowsMinors: false } });
      expect((await orders(aniversario.id))[0]!.buyer_minor).toBe(false);
      expect(await acceptances(aniversario.id)).toHaveLength(0);
    });

    it('15 anos na data do evento: ninguém compra, nem em evento com menores (inclusive na véspera dos 16)', async () => {
      const ev = await event({ allowsMinors: true });
      for (const birth of ['2011-06-01', '2010-12-13']) {
        const p = await person(birth);
        const res = await p.raw('POST', '/orders', {
          eventSlug: ev.slug,
          items: ev.items,
          minorTermAccepted: true,
          minorTermVersion: 'ficticio-0',
        });
        expect(res.status, birth).toBe(403);
        expect(await code(res)).toBe('idade_minima');
      }
    });

    it('16 anos no dia do evento: precisa aceitar o termo de menor; o aceite fica gravado com o pedido', async () => {
      const ev = await event({ allowsMinors: true });
      const p = await person('2010-12-12'); // faz 16 no dia do evento
      const quote = await json(await p.raw('POST', '/checkout/quote', { eventSlug: ev.slug, items: ev.items }));
      expect(quote.summary.buyer).toEqual({
        consentPending: false,
        birthDateMissing: false,
        age: 16,
        minor: true,
        minorTermVersion: 'ficticio-0',
        refusal: null,
      });
      const semAceite = await p.raw('POST', '/orders', { eventSlug: ev.slug, items: ev.items });
      expect(semAceite.status).toBe(422);
      expect((await json(semAceite)).erro.detalhes[0].campo).toBe('minorTermAccepted');
      const outraVersao = await p.raw('POST', '/orders', {
        eventSlug: ev.slug,
        items: ev.items,
        minorTermAccepted: true,
        minorTermVersion: '0.9',
      });
      expect(outraVersao.status).toBe(409);
      expect(await code(outraVersao)).toBe('versao_desatualizada');
      expect(await orders(p.id)).toHaveLength(0);

      const ok = await p.raw('POST', '/orders', {
        eventSlug: ev.slug,
        items: ev.items,
        minorTermAccepted: true,
        minorTermVersion: 'ficticio-0',
      });
      expect(ok.status).toBe(201);
      const order = (await json(ok)).order;
      expect(order.buyerMinor).toBe(true);
      expect(await acceptances(p.id)).toEqual([
        { order_id: order.id, term_version: 'ficticio-0', age_at_event: 16, ip: '203.0.113.7' },
      ]);
      expect((await orders(p.id))[0]!.buyer_minor).toBe(true);
    });

    it('17 anos em evento com menores compra com o termo; 18 anos no mesmo evento compra sem termo', async () => {
      const ev = await event({ allowsMinors: true });
      const dezessete = await person('2009-06-01');
      const ok = await dezessete.raw('POST', '/orders', {
        eventSlug: ev.slug,
        items: ev.items,
        minorTermAccepted: true,
        minorTermVersion: 'ficticio-0',
      });
      expect(ok.status).toBe(201);
      expect((await acceptances(dezessete.id))[0]).toMatchObject({ age_at_event: 17 });

      const adulto = await person('1990-01-01');
      const adultoOk = await adulto.raw('POST', '/orders', { eventSlug: ev.slug, items: ev.items });
      expect(adultoOk.status).toBe(201);
      expect((await orders(adulto.id))[0]!.buyer_minor).toBe(false);
      expect(await acceptances(adulto.id)).toHaveLength(0);
    });
  });

  describe('conta antiga, sem data de nascimento', () => {
    it('o checkout pede a data antes de continuar; a pessoa informa uma vez; depois compra', async () => {
      const ev = await event();
      const p = await person(null);
      const quote = await json(await p.raw('POST', '/checkout/quote', { eventSlug: ev.slug, items: ev.items }));
      expect(quote.summary.buyer).toMatchObject({
        birthDateMissing: true,
        refusal: { code: 'data_nascimento_obrigatoria' },
      });
      const recusa = await p.raw('POST', '/orders', { eventSlug: ev.slug, items: ev.items });
      expect(recusa.status).toBe(409);
      expect(await code(recusa)).toBe('data_nascimento_obrigatoria');

      expect((await p.raw('POST', '/me/birth-date', { birthDate: '2026-13-01' })).status).toBe(422);
      expect((await p.raw('POST', '/me/birth-date', { birthDate: '2015-01-01' })).status).toBe(422);
      const ok = await p.raw('POST', '/me/birth-date', { birthDate: '1995-01-01' });
      expect(ok.status).toBe(200);
      const again = await p.raw('POST', '/me/birth-date', { birthDate: '1996-01-01' });
      expect(again.status).toBe(409);
      expect(await code(again)).toBe('data_nascimento_ja_informada');
      expect((await json(await p.raw('GET', '/auth/me'))).user.birthDate).toBe('1995-01-01');
      // A conta não altera a data pela edição de perfil.
      await p.raw('PATCH', '/me', { name: 'Pessoa Nova', phone: '(55) 99812-4470', birthDate: '2001-01-01' });
      expect((await sql('select birth_date::text as d from users where id = $1', [p.id])).rows[0].d).toBe('1995-01-01');

      expect((await p.raw('POST', '/orders', { eventSlug: ev.slug, items: ev.items })).status).toBe(201);
    });
  });

  describe('novo aceite dos Termos e da Privacidade', () => {
    it('quem aceitou a 1.0 aceita a 1.1 no login ou no checkout; até lá não compra', async () => {
      const v11 = build({ TERMS_VERSION: '1.1', PRIVACY_VERSION: '1.1' });
      const ev = await event();
      const p = await person('1990-01-01', { target: v11, consent: '1.0' });
      expect(p.loginPendingConsent).toBe(true);
      expect((await json(await p.raw('GET', '/auth/me'))).pendingConsent).toBe(true);
      const recusa = await p.raw('POST', '/orders', { eventSlug: ev.slug, items: ev.items });
      expect(recusa.status).toBe(409);
      expect(await code(recusa)).toBe('aceite_pendente');

      const versaoVelha = await p.raw('POST', '/me/consents', {
        acceptedTermsVersion: '1.0',
        acceptedPrivacyVersion: '1.0',
        accept: true,
      });
      expect(await code(versaoVelha)).toBe('versao_desatualizada');
      const semMarcar = await p.raw('POST', '/me/consents', {
        acceptedTermsVersion: '1.1',
        acceptedPrivacyVersion: '1.1',
        accept: false,
      });
      expect(semMarcar.status).toBe(422);
      const ok = await p.raw('POST', '/me/consents', {
        acceptedTermsVersion: '1.1',
        acceptedPrivacyVersion: '1.1',
        accept: true,
      });
      expect(ok.status).toBe(200);
      const { rows } = await sql(
        'select terms_version, privacy_version, host(ip) as ip from consents where user_id = $1 order by accepted_at',
        [p.id],
      );
      expect(rows).toEqual([
        { terms_version: '1.0', privacy_version: '1.0', ip: null },
        { terms_version: '1.1', privacy_version: '1.1', ip: '203.0.113.7' },
      ]);
      expect((await json(await p.raw('GET', '/auth/me'))).pendingConsent).toBe(false);
      expect((await p.raw('POST', '/orders', { eventSlug: ev.slug, items: ev.items })).status).toBe(201);
    });

    it('a equipe nunca tem aceite pendente', async () => {
      const v11 = build({ TERMS_VERSION: '1.1', PRIVACY_VERSION: '1.1' });
      const admin = await person(null, { role: 'administrador', target: v11, consent: '1.0' });
      expect(admin.loginPendingConsent).toBe(false);
    });
  });

  describe('correção da data de nascimento pela PartyX', () => {
    it('refaz o aviso de menor dos pedidos de eventos futuros, sem levar a data para a trilha', async () => {
      const ev = await event({ allowsMinors: true });
      const comprador = await person('1990-01-01');
      expect((await comprador.raw('POST', '/orders', { eventSlug: ev.slug, items: ev.items })).status).toBe(201);
      expect((await orders(comprador.id))[0]!.buyer_minor).toBe(false);

      const admin = await person(null, { role: 'administrador' });
      const res = await admin.raw('PATCH', `/admin/users/${comprador.id}/identity`, {
        birthDate: '2009-06-01',
        reason: 'Documento conferido no atendimento',
      });
      expect(res.status).toBe(200);
      expect((await orders(comprador.id))[0]!.buyer_minor).toBe(true);
      const trail = (
        await sql(
          "select after_json::text as a from audit_log where action = 'usuario.identidade' and entity_id = $1",
          [comprador.id],
        )
      ).rows[0].a as string;
      expect(trail).toContain('birthDateCorrected');
      expect(trail).not.toContain('2009-06-01');
      expect(
        (
          await admin.raw('PATCH', `/admin/users/${comprador.id}/identity`, {
            birthDate: '2030-01-01',
            reason: 'teste',
          })
        ).status,
      ).toBe(422);
    });
  });

  describe('evento no painel', () => {
    const body = (o: Record<string, unknown> = {}) => ({
      name: 'Baile Teen',
      startsAt: '2026-12-12T22:00:00-03:00',
      venue: 'Arena',
      address: 'Rua 1',
      description: 'Teste',
      ageRating: '16 anos',
      ...o,
    });
    const fields = async (res: Response) =>
      ((await json(res)).erro.detalhes as { campo: string }[]).map(d => d.campo).sort();

    it('permitir menores exige fim, autorização judicial e classificação abaixo de 18; o fim vem depois do início', async () => {
      const admin = await person(null, { role: 'administrador' });
      const sem = await admin.raw('POST', '/admin/events', body({ allowsMinors: true }));
      expect(sem.status).toBe(422);
      expect(await fields(sem)).toEqual(['endsAt', 'judicialAuthorization']);
      const dezoito = await admin.raw(
        'POST',
        '/admin/events',
        body({
          allowsMinors: true,
          ageRating: '18 anos',
          endsAt: '2026-12-13T05:00:00-03:00',
          judicialAuthorization: 'Portaria 12/2026',
        }),
      );
      expect(await fields(dezoito)).toEqual(['allowsMinors']);
      const fimAntes = await admin.raw('POST', '/admin/events', body({ endsAt: '2026-12-12T21:00:00-03:00' }));
      expect(await fields(fimAntes)).toEqual(['endsAt']);

      const ok = await admin.raw(
        'POST',
        '/admin/events',
        body({ allowsMinors: true, endsAt: '2026-12-13T05:00:00-03:00', judicialAuthorization: 'Portaria 12/2026' }),
      );
      expect(ok.status).toBe(201);
      const created = (await json(ok)).event;
      expect(created).toMatchObject({ allowsMinors: true, judicialAuthorization: 'Portaria 12/2026' });

      // Edição parcial confere o estado final: tirar a autorização de um evento que permite menores é recusado.
      const tirar = await admin.raw('PATCH', `/admin/events/${created.id}`, { judicialAuthorization: null });
      expect(await fields(tirar)).toEqual(['judicialAuthorization']);
      const naoPermite = await admin.raw('PATCH', `/admin/events/${created.id}`, { allowsMinors: false });
      expect(naoPermite.status).toBe(200);
    });

    it('a página pública diz se o evento permite menores', async () => {
      const com = await event({ allowsMinors: true });
      const sem = await event();
      expect((await json(await app.request(`/api/public/events/${com.slug}`))).event).toMatchObject({
        allowsMinors: true,
        endsAt: '2026-12-13T08:00:00.000Z',
      });
      expect((await json(await app.request(`/api/public/events/${sem.slug}`))).event.allowsMinors).toBe(false);
    });
  });
});
