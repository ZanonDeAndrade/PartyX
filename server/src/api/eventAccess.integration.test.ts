import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { anonymizeSubject } from '../privacy/service';
import { purgeExpired } from '../privacy/retention';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { issueForOrder } from '../tickets/issuer';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';

/** CPF válido a partir de 9 dígitos (dígitos verificadores calculados). */
function cpfFrom(seed: number): string {
  const base = String(100000000 + seed).slice(-9);
  const digit = (s: string) => {
    const sum = [...s].reduce((t, d, i) => t + Number(d) * (s.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = digit(base);
  return base + d1 + digit(base + d1);
}
const dotted = (cpf: string) => `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

/**
 * Evento privado com lista de autorizados (D-92). Hoje (relógio) = 10/10/2026; evento = 12/12/2026, 22h em São Paulo, fim às 5h do dia
 * 13 (08h UTC); vendas de 01/10 a 12/12, 20h.
 */
describe.skipIf(!ADMIN_URL)('evento privado (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const config = loadConfig({ APP_ENV: 'local' });
  let mailer = new MemoryEmailSender();
  const build = () =>
    createApp({
      config,
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer },
    });
  let app: ReturnType<typeof build>;
  let n = 0;
  const hash = { value: '' };

  /** Requisições com cookie e CSRF da sessão, de um IP escolhido. */
  function client(ip = '203.0.113.7') {
    let cookie = '';
    let csrf = '';
    const raw = (method: string, path: string, body?: unknown) => {
      const headers: Record<string, string> = {
        origin: 'http://localhost',
        'x-forwarded-for': ip,
        'user-agent': 'Teste/1.0',
      };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return app.request(`/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    };
    const enter = async (res: Response) => {
      cookie = res.headers.get('set-cookie')!.split(';')[0]!;
      csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    };
    const login = async (email: string) => {
      cookie = '';
      csrf = '';
      const res = await raw('POST', '/auth/login', { email, password: PASSWORD });
      expect(res.status).toBe(200);
      await enter(res);
    };
    return { raw, login, enter };
  }

  type Person = Awaited<ReturnType<typeof person>>;
  /** Conta já cadastrada e logada. */
  async function person(role: 'cliente' | 'administrador' = 'cliente', ip?: string) {
    const i = ++n;
    const email = `pessoa${i}@partyx.test`;
    const cpf = role === 'cliente' ? cpfFrom(i * 7919) : null;
    const name = `Pessoa${i} Souza`;
    const { rows } = await sql(
      "insert into users (name, email, cpf, password_hash, role, birth_date) values ($1,$2,$3,$4,$5,'1990-05-01') returning id",
      [name, email, cpf, hash.value, role],
    );
    const c = client(ip);
    await c.login(email);
    return { id: rows[0].id as string, email, cpf: cpf!, name, raw: c.raw };
  }

  const json = async <T = any>(res: Response) => (await res.json()) as T;
  const code = async (res: Response) => (await json(res)).erro.codigo as string;

  async function event(o: { isPrivate?: boolean; startsAt?: string; endsAt?: string | null } = {}) {
    const slug = `privado-${++n}`;
    const id = (
      await sql(
        `insert into events (slug,name,starts_at,ends_at,venue,address,description,age_rating,status,is_private)
         values ($1,'Festa Fechada',$2,$3,'Casa','Rua 1','desc','18 anos','publicado',$4) returning id`,
        [
          slug,
          o.startsAt ?? '2026-12-12T22:00:00-03:00',
          o.endsAt === undefined ? '2026-12-13T05:00:00-03:00' : o.endsAt,
          o.isPrivate ?? true,
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
    return { id, slug, type };
  }
  type Ev = Awaited<ReturnType<typeof event>>;

  const orderBody = (ev: Ev, quantity = 1) => ({
    eventSlug: ev.slug,
    items: [{ ticketTypeId: ev.type, quantity }],
    cancellationAccepted: true,
    cancellationVersion: 'ficticio-0',
  });
  const quote = (p: Person, ev: Ev) =>
    p.raw('POST', '/checkout/quote', { eventSlug: ev.slug, items: orderBody(ev).items });

  /** Pedido pago com ingressos emitidos pelo emissor de verdade. */
  async function buy(p: Person, ev: Ev, quantity = 1) {
    const res = await p.raw('POST', '/orders', orderBody(ev, quantity));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
    const orderId = (await json(res)).order.id as string;
    await sql("update orders set status = 'pago', paid_at = now(), payment_method = 'pix' where id = $1", [orderId]);
    const items = (await sql('select id, ticket_type_id, quantity from order_items where order_id = $1', [orderId]))
      .rows;
    await createDrizzle(testDb.pool).transaction(tx =>
      issueForOrder(tx, config.qr, {
        id: orderId,
        userId: p.id,
        eventId: ev.id,
        items: items.map(i => ({ orderItemId: i.id, ticketTypeId: i.ticket_type_id, quantity: i.quantity })),
      }),
    );
    const tickets = (await sql('select id from tickets where order_id = $1 order by unit_index', [orderId])).rows as {
      id: string;
    }[];
    return { orderId, tickets };
  }

  const access = async (p: Person, ev: Ev) => (await json(await p.raw('GET', `/events/${ev.slug}/access`))).access;
  const request = (p: Person, ev: Ev) => p.raw('POST', `/events/${ev.slug}/access-request`);
  const list = async (admin: Person, ev: Ev, body: Record<string, unknown> = {}) =>
    json(await admin.raw('POST', `/admin/events/${ev.id}/access/search`, body));
  const rows = async (ev: Ev) =>
    (await sql('select * from event_access where event_id = $1 order by created_at, id', [ev.id])).rows;
  const audits = async (action: string) =>
    (await sql('select * from audit_log where action = $1 order by created_at', [action])).rows;
  const sent = (template: string) => mailer.sent.filter(m => m.template === template);

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    hash.value = await argon2Hasher.hash(PASSWORD);
    app = build();
  });
  beforeEach(() => {
    clock.set('2026-10-10T15:00:00Z');
    mailer = new MemoryEmailSender();
    app = build();
  });
  afterAll(async () => {
    await testDb?.drop();
  });

  describe('chave no painel e vitrine', () => {
    it('liga e desliga com trilha própria; a vitrine e a página mostram só o selo, nada da lista', async () => {
      const admin = await person('administrador');
      const ev = await event({ isPrivate: false });
      const on = await admin.raw('PATCH', `/admin/events/${ev.id}`, { isPrivate: true });
      expect(on.status).toBe(200);
      expect((await json(on)).event.isPrivate).toBe(true);
      const trail = (await audits('evento.privado')).filter(a => a.entity_id === ev.id);
      expect(trail.map(a => [a.before_json, a.after_json])).toEqual([[{ privado: false }, { privado: true }]]);

      await admin.raw('POST', `/admin/events/${ev.id}/access`, {
        email: 'convidada@partyx.test',
        name: 'Convidada Um',
      });
      const anon = client();
      const page = await json(await anon.raw('GET', `/public/events/${ev.slug}`));
      expect(page.event.privado).toBe(true);
      const search = await json(await anon.raw('GET', '/public/events?q=Festa'));
      expect(JSON.stringify(search)).toContain(ev.slug);
      for (const body of [JSON.stringify(page), JSON.stringify(search)]) {
        expect(body).not.toContain('convidada@partyx.test');
        expect(body).not.toContain('Convidada Um');
      }
      // Sem sessão, a situação não sai.
      expect((await anon.raw('GET', `/events/${ev.slug}/access`)).status).toBe(401);

      await admin.raw('PATCH', `/admin/events/${ev.id}`, { isPrivate: false });
      expect((await audits('evento.privado')).filter(a => a.entity_id === ev.id)).toHaveLength(2);
      expect((await rows(ev)).length).toBe(1); // desligar mantém a lista
    });

    it('cliente não mexe na lista nem nas solicitações', async () => {
      const p = await person();
      const ev = await event();
      expect((await p.raw('POST', `/admin/events/${ev.id}/access`, { email: 'x@partyx.test' })).status).toBe(403);
      expect((await p.raw('POST', `/admin/events/${ev.id}/access/search`, {})).status).toBe(403);
      expect((await p.raw('GET', '/admin/access-requests')).status).toBe(403);
      expect((await p.raw('POST', '/admin/access/decide', { ids: [ev.id], decision: 'aprovar' })).status).toBe(403);
    });
  });

  describe('lista no painel', () => {
    it('adiciona por e-mail ou CPF, normaliza, recusa inválido e não duplica a mesma pessoa', async () => {
      const admin = await person('administrador');
      const ev = await event();
      const cpf = cpfFrom(424242);
      const a = await admin.raw('POST', `/admin/events/${ev.id}/access`, {
        email: '  Ana@PartyX.test ',
        name: ' Ana  Lima ',
      });
      expect([a.status, (await json(a)).resultado]).toEqual([201, 'adicionada']);
      const b = await admin.raw('POST', `/admin/events/${ev.id}/access`, { cpf: dotted(cpf) });
      expect((await json(b)).resultado).toBe('adicionada');
      expect((await admin.raw('POST', `/admin/events/${ev.id}/access`, { email: 'ana@partyx.test' })).status).toBe(201);
      expect((await json(await admin.raw('POST', `/admin/events/${ev.id}/access`, { cpf }))).resultado).toBe(
        'ja_autorizada',
      );
      expect(await code(await admin.raw('POST', `/admin/events/${ev.id}/access`, { name: 'Sem nada' }))).toBe(
        'dados_invalidos',
      );
      expect(await code(await admin.raw('POST', `/admin/events/${ev.id}/access`, { cpf: '111.111.111-11' }))).toBe(
        'dados_invalidos',
      );
      const r = await rows(ev);
      expect(r.map(x => [x.email_normalized, x.cpf, x.name, x.status, x.origin])).toEqual(
        expect.arrayContaining([
          ['ana@partyx.test', null, 'Ana Lima', 'autorizada', 'painel'],
          [null, cpf, null, 'autorizada', 'painel'],
        ]),
      );
      expect(r).toHaveLength(2);
      // Trilha sem e-mail nem CPF inteiros.
      const trail = JSON.stringify(await audits('acesso.adicionar'));
      expect(trail).toContain('an***@partyx.test');
      expect(trail).not.toContain('ana@partyx.test');
      expect(trail).not.toContain(cpf);
    });

    it('importa lista colada: conta adicionadas, já autorizadas, erros e repetidas pela linha', async () => {
      const admin = await person('administrador');
      const ev = await event();
      await admin.raw('POST', `/admin/events/${ev.id}/access`, { email: 'ja@partyx.test' });
      const text = [
        'Bia Rocha; bia@partyx.test',
        `${dotted(cpfFrom(1001))}, Caio Reis`,
        'ja@partyx.test',
        'linha sem contato',
        'BIA@partyx.test',
        '',
      ].join('\n');
      const res = await json(await admin.raw('POST', `/admin/events/${ev.id}/access/import`, { text }));
      expect(res).toMatchObject({ adicionadas: 2, atualizadas: 0, jaAutorizadas: 1, repetidas: [5] });
      expect(res.erros.map((e: { line: number }) => e.line)).toEqual([4]);
      expect((await rows(ev)).length).toBe(3);
      expect(await audits('acesso.importar')).toHaveLength(1);
      const tooMany = Array.from({ length: 1001 }, (_, i) => `p${i}@partyx.test`).join('\n');
      expect((await admin.raw('POST', `/admin/events/${ev.id}/access/import`, { text: tooMany })).status).toBe(422);
    });

    it('busca (no corpo, nunca na URL), filtra por situação, mostra CPF mascarado, remove e exporta CSV mascarado', async () => {
      const admin = await person('administrador');
      const ev = await event();
      const cpf = cpfFrom(5150);
      await admin.raw('POST', `/admin/events/${ev.id}/access`, { cpf, name: 'Duda Prado' });
      await admin.raw('POST', `/admin/events/${ev.id}/access`, { email: 'eva@partyx.test' });
      const all = await list(admin, ev);
      expect(all.total).toBe(2);
      expect(all.counts).toEqual({ autorizada: 2, pendente: 0, recusada: 0 });
      expect(JSON.stringify(all)).not.toContain(cpf);
      const duda = all.people.find((p: { name: string }) => p.name === 'Duda Prado');
      expect(duda.cpf).toBe(`***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`);
      expect(duda.hasAccount).toBe(false);
      expect((await list(admin, ev, { q: 'duda' })).total).toBe(1);
      expect((await list(admin, ev, { q: cpf.slice(3, 9) })).total).toBe(1);
      expect((await list(admin, ev, { q: 'EVA@' })).total).toBe(1);
      expect((await list(admin, ev, { status: 'pendente' })).total).toBe(0);

      const csv = await admin.raw('GET', `/admin/exports/events/${ev.id}/access.csv`);
      expect(csv.status).toBe(200);
      expect(csv.headers.get('content-type')).toContain('text/csv');
      const body = await csv.text();
      expect(body).toContain('Duda Prado');
      expect(body).toContain(`***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`);
      expect(body).not.toContain(cpf);
      expect(await audits('exportacao.autorizados')).toHaveLength(1);

      const del = await admin.raw('DELETE', `/admin/access/${duda.id}`);
      expect(del.status).toBe(200);
      expect((await list(admin, ev)).total).toBe(1);
      expect(JSON.stringify(await audits('acesso.remover'))).not.toContain(cpf);
    });
  });

  describe('quem pode comprar', () => {
    it('sem estar na lista: resumo e pedido recusados com erro claro e nada gravado', async () => {
      const ev = await event();
      const p = await person();
      const q = await quote(p, ev);
      expect([q.status, await code(q)]).toEqual([403, 'evento_privado']);
      const o = await p.raw('POST', '/orders', orderBody(ev));
      expect(o.status).toBe(403);
      expect((await json(o)).erro.mensagem).toBe(
        'Este evento é privado. Só pessoas autorizadas pelo organizador podem comprar.',
      );
      expect((await sql('select count(*)::int as n from orders where event_id = $1', [ev.id])).rows[0].n).toBe(0);
      expect(
        (await sql('select count(*)::int as n from reservations where ticket_type_id = $1', [ev.type])).rows[0].n,
      ).toBe(0);
    });

    it('pessoa cadastrada ANTES de ter conta, pelo e-mail ou pelo CPF, é reconhecida ao criar a conta e compra', async () => {
      const admin = await person('administrador');
      const ev = await event();
      const cpf = cpfFrom(777001);
      await admin.raw('POST', `/admin/events/${ev.id}/access`, { email: 'Futura@PartyX.test' });
      await admin.raw('POST', `/admin/events/${ev.id}/access`, { cpf: dotted(cpf) });
      expect((await list(admin, ev)).people.every((p: { hasAccount: boolean }) => !p.hasAccount)).toBe(true);

      const signup = async (email: string, cpfValue: string) => {
        const c = client();
        const res = await c.raw('POST', '/auth/register', {
          name: 'Nova Pessoa',
          email,
          cpf: cpfValue,
          phone: '(55) 99812-4470',
          birthDate: '1995-03-20',
          password: PASSWORD,
          acceptedTermsVersion: 'ficticio-0',
          acceptedPrivacyVersion: 'ficticio-0',
          accept: true,
        });
        expect(res.status).toBe(201);
        await c.enter(res);
        const id = (await sql('select id from users where email = $1', [email.toLowerCase()])).rows[0].id as string;
        return { id, email, cpf: cpfValue, name: 'Nova Pessoa', raw: c.raw } as Person;
      };
      const byEmail = await signup('futura@partyx.test', cpfFrom(777002));
      const byCpf = await signup('outra@partyx.test', cpf);
      for (const p of [byEmail, byCpf]) {
        expect(await access(p, ev)).toEqual({ privado: true, situacao: 'autorizada', podeSolicitar: false });
        expect((await quote(p, ev)).status).toBe(200);
        await buy(p, ev);
      }
      // Entrar de novo também reconhece (a situação é calculada, não gravada no cadastro).
      expect((await list(admin, ev)).people.every((p: { hasAccount: boolean }) => p.hasAccount)).toBe(true);
    });

    it('chave LIGADA no meio da venda: pago continua pago, pendente continua; pedido novo só com autorização', async () => {
      const admin = await person('administrador');
      const ev = await event({ isPrivate: false });
      const early = await person();
      const pending = await person();
      const paid = await buy(early, ev, 2);
      const open = await pending.raw('POST', '/orders', orderBody(ev));
      expect(open.status).toBe(201);
      const openId = (await json(open)).order.id as string;

      await admin.raw('PATCH', `/admin/events/${ev.id}`, { isPrivate: true });
      expect((await sql('select status::text from orders where id = $1', [paid.orderId])).rows[0].status).toBe('pago');
      expect(
        (await sql("select count(*)::int as n from tickets where order_id = $1 and status = 'valido'", [paid.orderId]))
          .rows[0].n,
      ).toBe(2);
      expect((await sql('select status::text from orders where id = $1', [openId])).rows[0].status).toBe('pendente');
      expect((await json(await early.raw('GET', '/tickets'))).tickets).toHaveLength(2);

      expect(await code(await early.raw('POST', '/orders', orderBody(ev)))).toBe('evento_privado');
      await admin.raw('POST', `/admin/events/${ev.id}/access`, { email: early.email });
      expect((await early.raw('POST', '/orders', orderBody(ev))).status).toBe(201);
    });

    it('chave DESLIGADA no meio da venda: todos compram e a lista fica', async () => {
      const admin = await person('administrador');
      const ev = await event();
      await admin.raw('POST', `/admin/events/${ev.id}/access`, { email: 'lista@partyx.test' });
      const p = await person();
      expect(await code(await p.raw('POST', '/orders', orderBody(ev)))).toBe('evento_privado');
      await admin.raw('PATCH', `/admin/events/${ev.id}`, { isPrivate: false });
      expect(await access(p, ev)).toEqual({ privado: false, situacao: 'livre', podeSolicitar: false });
      await buy(p, ev);
      expect((await rows(ev)).map(r => r.email_normalized)).toEqual(['lista@partyx.test']);
    });

    it('janelas de venda continuam valendo para quem está autorizado', async () => {
      const admin = await person('administrador');
      const ev = await event();
      const p = await person();
      await admin.raw('POST', `/admin/events/${ev.id}/access`, { cpf: p.cpf });
      await sql("update ticket_types set sales_start_at = '2026-11-01T00:00:00-03:00' where id = $1", [ev.type]);
      const res = await p.raw('POST', '/orders', orderBody(ev));
      expect(res.status).not.toBe(201);
      expect(await code(res)).not.toBe('evento_privado');
    });
  });

  describe('solicitação de acesso', () => {
    it('um toque cria a solicitação pendente com os dados da conta; repetir não cria outra; e-mail "Solicitação recebida"', async () => {
      const ev = await event();
      const p = await person();
      expect(await access(p, ev)).toEqual({ privado: true, situacao: 'nenhuma', podeSolicitar: true });
      const first = await request(p, ev);
      expect(first.status).toBe(201);
      expect((await json(first)).access).toMatchObject({ situacao: 'pendente', criada: true });
      const again = await request(p, ev);
      expect(again.status).toBe(200);
      expect((await json(again)).access).toMatchObject({ situacao: 'pendente', criada: false });
      const r = await rows(ev);
      expect(r.map(x => [x.user_id, x.status, x.origin, x.email_normalized, x.cpf])).toEqual([
        [p.id, 'pendente', 'solicitacao', null, null],
      ]);
      expect(await access(p, ev)).toEqual({ privado: true, situacao: 'pendente', podeSolicitar: false });
      const mail = sent('acesso_solicitado');
      expect(mail).toHaveLength(1);
      expect(mail[0]!.to).toBe(p.email);
      expect(mail[0]!.subject).toContain('Solicitação recebida');
      expect(mail[0]!.text).toContain(`/eventos/${ev.slug}`);
      expect(await audits('acesso.solicitar')).toHaveLength(1);
      // Pendente não compra.
      expect(await code(await p.raw('POST', '/orders', orderBody(ev)))).toBe('evento_privado');
    });

    it('duas solicitações ao mesmo tempo da mesma conta viram uma linha só', async () => {
      const ev = await event();
      const p = await person();
      const res = await Promise.all([request(p, ev), request(p, ev), request(p, ev)]);
      expect(res.map(r => r.status).sort()).toEqual([200, 200, 201]);
      expect(await rows(ev)).toHaveLength(1);
    });

    it('vale antes de as vendas abrirem; evento aberto ou já encerrado não aceita', async () => {
      const ev = await event();
      await sql("update ticket_types set sales_start_at = '2026-11-20T00:00:00-03:00' where id = $1", [ev.type]);
      const p = await person();
      expect((await request(p, ev)).status).toBe(201);
      const open = await event({ isPrivate: false });
      expect(await code(await request(p, open))).toBe('evento_nao_privado');
      const over = await event();
      await sql("update events set status = 'encerrado', closed_at = now() where id = $1", [over.id]);
      expect(await access(p, over)).toMatchObject({ situacao: 'nenhuma', podeSolicitar: false });
      expect(await code(await request(p, over))).toBe('evento_encerrado');
    });

    it('quem já está na lista pelo painel não cria solicitação; recebe a situação', async () => {
      const admin = await person('administrador');
      const ev = await event();
      const p = await person();
      await admin.raw('POST', `/admin/events/${ev.id}/access`, { email: p.email.toUpperCase() });
      const res = await request(p, ev);
      expect(res.status).toBe(200);
      expect((await json(res)).access.situacao).toBe('autorizada');
      expect(await rows(ev)).toHaveLength(1);
      expect(sent('acesso_solicitado')).toHaveLength(0);
    });

    it('aprovar e recusar, uma a uma e em lote, com observação; e-mail só na aprovação; tudo na trilha', async () => {
      const admin = await person('administrador');
      const ev = await event();
      const [a, b, c, d] = [await person(), await person(), await person(), await person()];
      const count = async () =>
        (await json(await admin.raw('GET', '/admin/access-requests/count'))).pendentes as number;
      const before = await count();
      for (const p of [a, b, c, d]) {
        await request(p, ev);
        clock.advance(1000);
      }
      const pend = await json(await admin.raw('GET', `/admin/access-requests?eventId=${ev.id}`));
      expect(pend.total).toBe(4);
      expect(pend.requests[0].event).toMatchObject({ id: ev.id, slug: ev.slug });
      expect(pend.requests.map((r: { name: string }) => r.name)).toEqual([a.name, b.name, c.name, d.name]); // mais antiga primeiro
      expect(JSON.stringify(pend)).not.toContain(a.cpf);
      expect(await count()).toBe(before + 4);
      const idOf = (p: Person) => pend.requests.find((r: { name: string }) => r.name === p.name).id as string;

      mailer.sent.length = 0;
      const one = await admin.raw('POST', '/admin/access/decide', { ids: [idOf(a)], decision: 'aprovar' });
      expect((await json(one)).alteradas).toBe(1);
      const batch = await admin.raw('POST', '/admin/access/decide', {
        ids: [idOf(b), idOf(c)],
        decision: 'recusar',
        note: 'Lista fechada pelo organizador',
      });
      expect((await json(batch)).alteradas).toBe(2);
      await admin.raw('POST', '/admin/access/decide', { ids: [idOf(d)], decision: 'aprovar', note: 'Amiga da casa' });

      expect(await access(a, ev)).toMatchObject({ situacao: 'autorizada' });
      expect(await access(b, ev)).toEqual({ privado: true, situacao: 'recusada', podeSolicitar: false });
      // Recusada não solicita de novo pela tela (premissa 4).
      expect((await json(await request(b, ev))).access).toMatchObject({ situacao: 'recusada', criada: false });
      const liberado = sent('acesso_liberado');
      expect(liberado.map(m => m.to).sort()).toEqual([a.email, d.email].sort());
      expect(liberado[0]!.subject).toContain('Acesso liberado');
      expect(liberado[0]!.text).toContain(`/eventos/${ev.slug}`);
      expect(mailer.sent.filter(m => m.to === b.email || m.to === c.email)).toHaveLength(0);
      expect(await audits('acesso.aprovar')).toHaveLength(2);
      const refused = await audits('acesso.recusar');
      expect(refused).toHaveLength(2);
      expect(refused[0].after_json.observacao).toBe('Lista fechada pelo organizador');
      expect(await count()).toBe(before);

      // O painel pode aprovar depois quem foi recusada (a mesma linha); o e-mail sai uma vez.
      await admin.raw('POST', '/admin/access/decide', { ids: [idOf(b)], decision: 'aprovar' });
      expect(await access(b, ev)).toMatchObject({ situacao: 'autorizada' });
      await buy(b, ev);
      // Aprovar de novo quem já está autorizada não muda nada nem reenvia.
      const same = await admin.raw('POST', '/admin/access/decide', { ids: [idOf(a)], decision: 'aprovar' });
      expect((await json(same)).alteradas).toBe(0);
      expect(sent('acesso_liberado').filter(m => m.to === a.email)).toHaveLength(1);
    });

    it('a API só devolve a situação da própria conta', async () => {
      const admin = await person('administrador');
      const ev = await event();
      const a = await person();
      const b = await person();
      await admin.raw('POST', `/admin/events/${ev.id}/access`, { email: a.email });
      const mine = await json(await b.raw('GET', `/events/${ev.slug}/access`));
      expect(mine).toEqual({ access: { privado: true, situacao: 'nenhuma', podeSolicitar: true } });
      expect(JSON.stringify(mine)).not.toContain(a.email);
      // Não há parâmetro para perguntar por outra pessoa: e-mail ou id na consulta são ignorados.
      const tricky = await json(
        await b.raw('GET', `/events/${ev.slug}/access?email=${encodeURIComponent(a.email)}&userId=${a.id}`),
      );
      expect(tricky).toEqual(mine);
    });

    it('limite: 10 solicitações por conta por hora (somando eventos) e 30 por IP por hora', async () => {
      const p = await person();
      const evs: Ev[] = [];
      for (let i = 0; i < 11; i++) evs.push(await event());
      for (let i = 0; i < 10; i++) expect((await request(p, evs[i]!)).status).toBe(201);
      const over = await request(p, evs[10]!);
      expect([over.status, await code(over)]).toEqual([429, 'muitas_requisicoes']);
      expect(await rows(evs[10]!)).toHaveLength(0);
      clock.advance(61 * 60_000);
      await sql('select 1');
      const later = await person();
      expect((await request(later, evs[10]!)).status).toBe(201);

      // Por IP: contas diferentes atrás do mesmo IP.
      app = build();
      const shared = '198.51.100.40';
      const people = [
        await person('cliente', shared),
        await person('cliente', shared),
        await person('cliente', shared),
        await person('cliente', shared),
      ];
      const many: Ev[] = [];
      for (let i = 0; i < 8; i++) many.push(await event());
      const statuses: number[] = [];
      for (const ev of many) for (const q of people) statuses.push((await request(q, ev)).status);
      expect(statuses.slice(0, 30).every(s => s === 201)).toBe(true);
      expect(statuses.slice(30)).toEqual([429, 429]);
    });
  });

  describe('transferência', () => {
    it('ingresso de evento privado só vai para conta autorizada; o desfazer pelo painel continua', async () => {
      const admin = await person('administrador');
      const ev = await event();
      const holder = await person();
      const outsider = await person();
      const friend = await person();
      await admin.raw('POST', `/admin/events/${ev.id}/access`, { email: holder.email });
      const { tickets } = await buy(holder, ev, 2);

      const preview = await holder.raw('POST', `/tickets/${tickets[0]!.id}/transfer/preview`, {
        destination: outsider.email,
      });
      expect([preview.status, await code(preview)]).toEqual([403, 'destino_nao_autorizado']);
      const blocked = await holder.raw('POST', `/tickets/${tickets[0]!.id}/transfer`, {
        destination: outsider.cpf,
        confirm: true,
      });
      const err = (await json(blocked)).erro;
      expect([blocked.status, err.codigo]).toEqual([403, 'destino_nao_autorizado']);
      expect(err.mensagem).toContain('essa conta não está autorizada');
      expect(
        (await sql('select holder_user_id from tickets where id = $1', [tickets[0]!.id])).rows[0].holder_user_id,
      ).toBe(holder.id);

      await admin.raw('POST', `/admin/events/${ev.id}/access`, { cpf: dotted(friend.cpf) });
      const ok = await holder.raw('POST', `/tickets/${tickets[0]!.id}/transfer`, {
        destination: friend.email,
        confirm: true,
      });
      expect(ok.status).toBe(200);
      const undo = await admin.raw('POST', `/admin/tickets/${tickets[0]!.id}/transfer/undo`, {
        reason: 'Conferência do teste D-92',
        confirm: true,
      });
      expect(undo.status).toBe(200);
    });

    it('quem comprou antes de a chave ligar só transfere para conta autorizada', async () => {
      const admin = await person('administrador');
      const ev = await event({ isPrivate: false });
      const early = await person();
      const other = await person();
      const { tickets } = await buy(early, ev);
      await admin.raw('PATCH', `/admin/events/${ev.id}`, { isPrivate: true });
      expect(
        await code(
          await early.raw('POST', `/tickets/${tickets[0]!.id}/transfer`, { destination: other.email, confirm: true }),
        ),
      ).toBe('destino_nao_autorizado');
      await admin.raw('POST', `/admin/events/${ev.id}/access`, { email: other.email });
      expect(
        (await early.raw('POST', `/tickets/${tickets[0]!.id}/transfer`, { destination: other.email, confirm: true }))
          .status,
      ).toBe(200);
    });
  });

  describe('privacidade e retenção', () => {
    it('a limpeza diária apaga a lista 6 meses depois do fim do evento (ou do início, sem fim), e repetir não apaga mais nada', async () => {
      const admin = await person('administrador');
      const withEnd = await event(); // fim 13/12/2026 08:00 UTC
      const noEnd = await event({ endsAt: null }); // início 13/12/2026 01:00 UTC
      const later = await event({ startsAt: '2027-03-01T22:00:00-03:00', endsAt: null });
      for (const ev of [withEnd, noEnd, later])
        await admin.raw('POST', `/admin/events/${ev.id}/access`, { email: `r${ev.slug}@partyx.test` });
      const db = createDrizzle(testDb.pool);
      const purge = () => purgeExpired({ db, clock, config });

      clock.set('2027-06-13T00:59:59Z');
      expect((await purge()).eventAccess).toBe(0);
      clock.set('2027-06-13T01:00:00Z');
      expect((await purge()).eventAccess).toBe(1);
      expect(await rows(noEnd)).toHaveLength(0);
      expect(await rows(withEnd)).toHaveLength(1);
      clock.set('2027-06-13T08:00:00Z');
      expect((await purge()).eventAccess).toBeGreaterThanOrEqual(1); // e as listas dos outros eventos de teste, todos de dezembro
      expect(await rows(withEnd)).toHaveLength(0);
      expect((await purge()).eventAccess).toBe(0);
      expect(await rows(later)).toHaveLength(1);
      // A trilha fica (sem dado pessoal inteiro).
      expect((await audits('acesso.adicionar')).length).toBeGreaterThanOrEqual(3);
    });

    it('a anonimização do titular apaga as linhas dele (conta, e-mail e CPF)', async () => {
      const admin = await person('administrador');
      const ev1 = await event();
      const ev2 = await event();
      const p = await person();
      await admin.raw('POST', `/admin/events/${ev1.id}/access`, { cpf: p.cpf });
      await request(p, ev2);
      await anonymizeSubject({ db: createDrizzle(testDb.pool), clock, hasher: argon2Hasher }, admin.id, p.id, {
        reference: 'PX-TESTE-92',
        reason: 'Pedido do titular para o teste da D-92',
      });
      expect(await rows(ev1)).toHaveLength(0);
      expect(await rows(ev2)).toHaveLength(0);
      const trail = (await audits('privacidade.anonimizacao')).at(-1);
      expect(trail.after_json.accessRemoved).toBe(2);
    });
  });
});
