import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { exportSubjectData, anonymizeSubject } from '../privacy/service';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { issueForOrder } from '../tickets/issuer';
import { loadContingency } from '../exports/service';

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

/**
 * Transferência de ingresso (D-87) e aceite da Política de Cancelamento no checkout (D-80 atualizada). Hoje (relógio) = 10/10/2026;
 * evento = 12/12/2026, 22h em São Paulo (01h UTC do dia 13); prazo da transferência: 20h em São Paulo.
 */
describe.skipIf(!ADMIN_URL)('transferência de ingresso (integração)', () => {
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

  type Person = Awaited<ReturnType<typeof person>>;
  /** Conta já cadastrada e logada. `birthDate: null` = conta antiga, sem data de nascimento. */
  async function person(birthDate: string | null, role: 'cliente' | 'administrador' | 'validador' = 'cliente') {
    const i = ++n;
    const email = `pessoa${i}@partyx.test`;
    const cpf = role === 'cliente' ? cpfFrom(i * 7919) : null;
    const name = `Maria${i} da Silva Oliveira`;
    const { rows } = await sql(
      'insert into users (name, email, cpf, password_hash, role, birth_date) values ($1,$2,$3,$4,$5,$6) returning id',
      [name, email, cpf, hash.value, role, birthDate],
    );
    const id = rows[0].id as string;
    let cookie = '';
    let csrf = '';
    const raw = (method: string, path: string, body?: unknown) => {
      const headers: Record<string, string> = {
        origin: 'http://localhost',
        'x-forwarded-for': '203.0.113.7',
        'user-agent': 'Teste/1.0',
      };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return app.request(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    };
    /** Entra de novo (depois de mexer no relógio, a sessão antiga venceu). */
    const login = async () => {
      cookie = '';
      csrf = '';
      const res = await raw('POST', '/auth/login', { email, password: PASSWORD });
      cookie = res.headers.get('set-cookie')!.split(';')[0]!;
      csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    };
    await login();
    return { id, email, cpf: cpf!, name, raw, login };
  }

  const json = async <T = any>(res: Response) => (await res.json()) as T;
  const code = async (res: Response) => (await json(res)).erro.codigo as string;

  async function event(o: { allowsMinors?: boolean; startsAt?: string } = {}) {
    const slug = `evento-${++n}`;
    const id = (
      await sql(
        `insert into events (slug,name,starts_at,ends_at,venue,address,description,age_rating,status,allows_minors)
         values ($1,'Noite Neon',$2,'2026-12-13T05:00:00-03:00','Arena','Rua 1','desc',$3,'publicado',$4) returning id`,
        [slug, o.startsAt ?? '2026-12-12T22:00:00-03:00', o.allowsMinors ? '16 anos' : '18 anos', o.allowsMinors ?? false],
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

  /** Compra paga com `quantity` ingressos, emitidos pelo emissor de verdade (QR assinado). Devolve os ingressos. */
  async function buy(p: Person, ev: Awaited<ReturnType<typeof event>>, quantity = 1, minor = false) {
    const res = await p.raw('POST', '/orders', {
      eventSlug: ev.slug,
      items: [{ ticketTypeId: ev.type, quantity }],
      cancellationAccepted: true,
      cancellationVersion: 'ficticio-0',
      ...(minor ? { minorTermAccepted: true, minorTermVersion: 'ficticio-0' } : {}),
    });
    expect(res.status).toBe(201);
    const orderId = (await json(res)).order.id as string;
    await sql("update orders set status = 'pago', paid_at = now(), payment_method = 'pix' where id = $1", [orderId]);
    const items = (await sql('select id, ticket_type_id, quantity from order_items where order_id = $1', [orderId])).rows;
    await createDrizzle(testDb.pool).transaction(tx =>
      issueForOrder(tx, config.qr, {
        id: orderId,
        userId: p.id,
        eventId: ev.id,
        items: items.map(i => ({ orderItemId: i.id, ticketTypeId: i.ticket_type_id, quantity: i.quantity })),
      }),
    );
    const tickets = (
      await sql('select id, qr_payload, short_code from tickets where order_id = $1 order by unit_index', [orderId])
    ).rows as { id: string; qr_payload: string; short_code: string }[];
    return { orderId, tickets };
  }

  const ticketRow = async (id: string) =>
    (
      await sql(
        'select holder_user_id, holder_name, holder_minor, short_code, qr_payload, code, status::text as status from tickets where id = $1',
        [id],
      )
    ).rows[0];
  const transfer = (p: Person, ticketId: string, destination: string) =>
    p.raw('POST', `/tickets/${ticketId}/transfer`, { destination, confirm: true });
  const scan = async (v: Person, eventId: string, qr: string) =>
    json(await v.raw('POST', '/gate/scan', { eventId, qr }));

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

  describe('transferência válida', () => {
    it('conferência mostra só o nome mascarado; transferir troca titular, código e QR; o QR antigo é recusado na portaria', async () => {
      const ev = await event();
      const a = await person('1990-05-01');
      const b = await person('1995-03-02');
      const v = await person(null, 'validador');
      const { orderId, tickets } = await buy(a, ev, 2);
      const t = tickets[0]!;

      // Conferência por e-mail e por CPF (com máscara de digitação): só "Maria S. O.", nada muda.
      const byEmail = await json(await a.raw('POST', `/tickets/${t.id}/transfer/preview`, { destination: b.email.toUpperCase() }));
      expect(byEmail).toEqual({ recipient: `Maria${b.name.slice(5, b.name.indexOf(' '))} S. O.`, allowsMinors: false });
      const formatted = `${b.cpf.slice(0, 3)}.${b.cpf.slice(3, 6)}.${b.cpf.slice(6, 9)}-${b.cpf.slice(9)}`;
      expect((await a.raw('POST', `/tickets/${t.id}/transfer/preview`, { destination: formatted })).status).toBe(200);
      expect((await ticketRow(t.id)).holder_user_id).toBe(a.id);

      // Sem a confirmação explícita, recusa.
      expect((await a.raw('POST', `/tickets/${t.id}/transfer`, { destination: b.email })).status).toBe(422);

      const before = await ticketRow(t.id);
      const res = await transfer(a, t.id, b.email);
      expect(res.status).toBe(200);
      expect((await json(res)).transfer.recipient).toMatch(/^Maria\d+ S\. O\.$/);
      const after = await ticketRow(t.id);
      expect(after.holder_user_id).toBe(b.id);
      expect(after.holder_name).toBe(b.name);
      expect(after.holder_minor).toBe(false);
      expect(after.code).not.toBe(before.code);
      expect(after.short_code).not.toBe(before.short_code);
      expect(after.qr_payload).not.toBe(before.qr_payload);
      expect(after.status).toBe('valido');

      // Os dois lados de Meus ingressos.
      const mineA = (await json(await a.raw('GET', '/tickets'))).tickets as { id: string }[];
      expect(mineA.map(x => x.id)).toEqual([tickets[1]!.id]);
      const mineB = (await json(await b.raw('GET', '/tickets'))).tickets as {
        id: string;
        receivedFrom: { name: string } | null;
        transferUntil: string;
        minorTermPending: boolean;
      }[];
      expect(mineB).toHaveLength(1);
      expect(mineB[0]).toMatchObject({ id: t.id, minorTermPending: false, transferUntil: '2026-12-12T23:00:00.000Z' });
      expect(mineB[0]!.receivedFrom!.name).toMatch(/^Maria\d+ S\. O\.$/);
      expect((await a.raw('GET', `/tickets/${t.id}`)).status).toBe(404);
      expect((await json(await b.raw('GET', `/tickets/${t.id}`))).ticket.qrPayload).toBe(after.qr_payload);

      // O pedido continua do comprador; a página dele mostra o transferido, e o PDF do pedido só o que ficou com ele.
      expect((await sql('select user_id from orders where id = $1', [orderId])).rows[0].user_id).toBe(a.id);
      const order = (await json(await a.raw('GET', `/orders/${orderId}`))).order;
      expect(order.transferred).toHaveLength(1);
      expect(order.transferred[0].to).toMatch(/^Maria\d+ S\. O\.$/);
      expect(((await json(await a.raw('GET', `/orders/${orderId}/tickets`))).tickets as unknown[]).length).toBe(1);
      expect((await b.raw('GET', `/orders/${orderId}`)).status).toBe(404);

      // Histórico e trilha (sem o código secreto nem o QR).
      const hist = (await sql('select from_user_id, to_user_id, actor_id, old_short_code, new_short_code from ticket_transfers where ticket_id = $1', [t.id])).rows;
      expect(hist).toEqual([
        { from_user_id: a.id, to_user_id: b.id, actor_id: a.id, old_short_code: before.short_code, new_short_code: after.short_code },
      ]);
      const audit = (await sql("select actor_id, after_json from audit_log where action = 'ingresso.transferir' and entity_id = $1", [t.id])).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0].actor_id).toBe(a.id);
      expect(JSON.stringify(audit[0].after_json)).not.toContain(after.code);

      // Portaria: o QR antigo é recusado com a explicação; o novo entra, com o nome de quem recebeu.
      const old = await scan(v, ev.id, before.qr_payload);
      expect(old.result).toBe('invalido');
      expect(old.message).toBe('QR antigo: este ingresso foi transferido e este QR não vale mais');
      expect(old.ticket).toBeNull();
      const ok = await scan(v, ev.id, after.qr_payload);
      expect(ok.result).toBe('valido');
      expect(ok.ticket.holderName).toBe(b.name);

      // E-mails dos dois lados, na fila (o local entrega na hora).
      const templates = (await sql('select user_id, template::text as template from email_log where idempotency_key like $1 order by template', [`transferencia:%`])).rows;
      expect(templates).toEqual(
        expect.arrayContaining([
          { user_id: a.id, template: 'transferencia_enviada' },
          { user_id: b.id, template: 'transferencia_recebida' },
        ]),
      );
      const sentToB = mailer.sent.find(m => m.to === b.email);
      expect(sentToB?.subject).toContain('Você recebeu um ingresso');
      expect(sentToB?.text).not.toContain(after.code);
    });

    it('duas transferências seguidas (A para B, B para C); quem recebeu pode transferir de novo', async () => {
      const ev = await event();
      const [a, b, c] = [await person('1990-01-01'), await person('1991-01-01'), await person('1992-01-01')];
      const { tickets } = await buy(a, ev);
      const t = tickets[0]!.id;
      expect((await transfer(a, t, b.email)).status).toBe(200);
      clock.advance(60_000);
      expect((await transfer(a, t, c.email)).status).toBe(404); // não é mais de A
      expect((await transfer(b, t, c.cpf)).status).toBe(200);
      expect((await ticketRow(t)).holder_user_id).toBe(c.id);
      const chain = (await sql('select from_user_id, to_user_id from ticket_transfers where ticket_id = $1 order by created_at, id', [t])).rows;
      expect(chain).toEqual([
        { from_user_id: a.id, to_user_id: b.id },
        { from_user_id: b.id, to_user_id: c.id },
      ]);
      // Para B não aparece mais; para C aparece recebido de B.
      expect(((await json(await b.raw('GET', '/tickets'))).tickets as unknown[]).length).toBe(0);
      const mineC = (await json(await c.raw('GET', '/tickets'))).tickets;
      expect(mineC[0].receivedFrom.name).toBe(`Maria${b.name.slice(5, b.name.indexOf(' '))} S. O.`);
    });

    it('duas transferências simultâneas do mesmo ingresso: uma passa, a outra recebe 404 ou 409, e nada fica pela metade', async () => {
      const ev = await event();
      const [a, b, c] = [await person('1990-01-01'), await person('1991-01-01'), await person('1992-01-01')];
      const { tickets } = await buy(a, ev);
      const t = tickets[0]!.id;
      const results = await Promise.all([transfer(a, t, b.email), transfer(a, t, c.email)]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([404, 409]).toContain(statuses[1]);
      const rows = (await sql('select to_user_id from ticket_transfers where ticket_id = $1', [t])).rows;
      expect(rows).toHaveLength(1);
      expect((await ticketRow(t)).holder_user_id).toBe(rows[0].to_user_id);
      expect((await sql("select count(*)::int as n from audit_log where action = 'ingresso.transferir' and entity_id = $1", [t])).rows[0].n).toBe(1);
    });
  });

  describe('recusas', () => {
    it('destino inexistente, a própria conta, conta sem data de nascimento, equipe e formato inválido', async () => {
      const ev = await event();
      const a = await person('1990-01-01');
      const old = await person(null);
      const staff = await person('1980-01-01', 'administrador');
      const { tickets } = await buy(a, ev);
      const t = tickets[0]!.id;
      const preview = (destination: string) => a.raw('POST', `/tickets/${t}/transfer/preview`, { destination });
      expect(await code(await preview('ninguem@partyx.test'))).toBe('conta_nao_encontrada');
      expect(await code(await preview(cpfFrom(999_999)))).toBe('conta_nao_encontrada');
      expect(await code(await preview(a.email))).toBe('mesma_conta');
      expect(await code(await preview(old.email))).toBe('destino_sem_data_nascimento');
      expect(await code(await preview(staff.email))).toBe('conta_nao_encontrada');
      expect((await preview('123')).status).toBe(422);
      expect(await code(await transfer(a, t, old.email))).toBe('destino_sem_data_nascimento');
      expect((await ticketRow(t)).holder_user_id).toBe(a.id);
    });

    it('idade na data do evento: menor de 16 recusa; 16 ou 17 só em evento com menores; evento 18+ só para maiores', async () => {
      const adulto = await person('1990-01-01');
      // Evento em 12/12/2026: 15 anos (faz 16 em 2027), 17 anos e 18 completos no próprio dia.
      const quinze = await person('2011-01-10');
      const dezessete = await person('2009-06-01');
      const dezoito = await person('2008-12-12');
      const semMenores = await event();
      const comMenores = await event({ allowsMinors: true });
      const t18 = (await buy(adulto, semMenores, 3)).tickets.map(t => t.id);
      const t16 = (await buy(adulto, comMenores, 2)).tickets.map(t => t.id);

      // Menor de 16: recusa nos dois eventos, com a mesma mensagem (quem transfere não fica sabendo a idade).
      expect(await code(await transfer(adulto, t16[0]!, quinze.email))).toBe('destino_classificacao');
      expect(await code(await transfer(adulto, t18[0]!, quinze.email))).toBe('destino_classificacao');
      // 17 em evento só para maiores: recusa; 18 completos no dia: aceita.
      expect(await code(await transfer(adulto, t18[0]!, dezessete.email))).toBe('destino_classificacao');
      expect((await transfer(adulto, t18[1]!, dezoito.email)).status).toBe(200);

      // 17 em evento com menores: aceita, e o QR só aparece depois do Termo de Ciência.
      expect((await transfer(adulto, t16[0]!, dezessete.email)).status).toBe(200);
      expect((await ticketRow(t16[0]!)).holder_minor).toBe(true);
      const pending = (await json(await dezessete.raw('GET', `/tickets/${t16[0]}`))).ticket;
      expect(pending.minorTermPending).toBe(true);
      expect(pending.qrPayload).toBeNull();
      expect(await code(await dezessete.raw('GET', `/tickets/${t16[0]}/pdf`))).toBe('termo_pendente');

      // Portaria: sem o aceite, não entra (nem com a confirmação do validador).
      const v = await person(null, 'validador');
      const blocked = await json(
        await v.raw('POST', '/gate/admit', { eventId: comMenores.id, ticketId: t16[0], method: 'manual', minorCheck: 'autorizacao_recebida' }),
      );
      expect(blocked.result).toBe('menor_confirmar');
      expect(blocked.message).toContain('precisa aceitar o Termo de Ciência');
      expect((await ticketRow(t16[0]!)).status).toBe('valido');

      // Aceite: caixa obrigatória, versão vigente; grava versão, idade, IP e navegador; o QR aparece.
      expect((await dezessete.raw('POST', `/tickets/${t16[0]}/termo-menor`, { accepted: false, termVersion: 'ficticio-0' })).status).toBe(422);
      expect(await code(await dezessete.raw('POST', `/tickets/${t16[0]}/termo-menor`, { accepted: true, termVersion: 'velha' }))).toBe('versao_desatualizada');
      const accepted = await json(await dezessete.raw('POST', `/tickets/${t16[0]}/termo-menor`, { accepted: true, termVersion: 'ficticio-0' }));
      expect(accepted.ticket.minorTermPending).toBe(false);
      expect(accepted.ticket.qrPayload).toBe((await ticketRow(t16[0]!)).qr_payload);
      const acc = (await sql('select term_version, age_at_event, host(ip) as ip, user_agent from ticket_minor_acceptances where user_id = $1', [dezessete.id])).rows;
      expect(acc).toEqual([{ term_version: 'ficticio-0', age_at_event: 17, ip: '203.0.113.7', user_agent: 'Teste/1.0' }]);
      // Depois do aceite, a portaria pede a conferência da autorização, como para o comprador menor.
      const minorScan = await scan(v, comMenores.id, (await ticketRow(t16[0]!)).qr_payload);
      expect(minorScan.result).toBe('menor_confirmar');
      expect(minorScan.ticket.buyerMinor).toBe(true);
      // A autorização do ingresso sai em nome de quem recebeu.
      const pdf = await dezessete.raw('GET', `/tickets/${t16[0]}/autorizacao-menor.pdf`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get('content-type')).toBe('application/pdf');
    });

    it('fora do prazo de 2 horas, ingresso usado, cancelado, de pedido estornado ou contestado, e evento encerrado', async () => {
      const ev = await event();
      const a = await person('1990-01-01');
      const b = await person('1991-01-01');
      const v = await person(null, 'validador');
      const { orderId, tickets } = await buy(a, ev, 4);
      const [t1, t2, t3] = tickets.map(t => t.id);

      // Usado: entra na portaria e depois não transfere.
      expect((await scan(v, ev.id, tickets[0]!.qr_payload)).result).toBe('valido');
      expect(await code(await transfer(a, t1!, b.email))).toBe('transferencia_indisponivel');
      // Cancelado pelo painel.
      await sql("update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'teste' where id = $1", [t2]);
      expect((await json(await transfer(a, t2!, b.email))).erro.mensagem).toBe('Ingresso cancelado não pode ser transferido.');

      // Prazo: até 20h de 12/12 em São Paulo (2 horas antes das 22h). Às 19h59 passa; às 20h01, não.
      clock.set('2026-12-12T22:59:00Z');
      await a.login();
      expect((await a.raw('POST', `/tickets/${t3}/transfer/preview`, { destination: b.email })).status).toBe(200);
      clock.set('2026-12-12T23:01:00Z');
      expect((await json(await transfer(a, t3!, b.email))).erro.mensagem).toBe(
        'O prazo para transferir terminou: a transferência vai até 2 horas antes do início do evento.',
      );
      clock.set('2026-10-10T15:00:00Z');
      await a.login();

      // Pedido estornado ou contestado.
      for (const status of ['estornado', 'contestado']) {
        await sql(`update orders set status = '${status}' where id = $1`, [orderId]);
        expect((await json(await transfer(a, t3!, b.email))).erro.mensagem).toBe(
          'Ingresso de pedido estornado, contestado ou cancelado não pode ser transferido.',
        );
      }
      await sql("update orders set status = 'pago' where id = $1", [orderId]);
      // Evento encerrado.
      await sql("update events set status = 'encerrado', closed_at = now() where id = $1", [ev.id]);
      expect(await code(await transfer(a, t3!, b.email))).toBe('transferencia_indisponivel');
      expect((await sql('select count(*)::int as n from ticket_transfers where ticket_id = any($1)', [[t1, t2, t3]])).rows[0].n).toBe(0);
    });
  });

  describe('painel: desfazer em caso de fraude', () => {
    it('motivo obrigatório; volta para quem transferiu com QR novo; trilha com motivo; cadeia desfeita uma por vez', async () => {
      const ev = await event();
      const [a, b, c] = [await person('1990-01-01'), await person('1991-01-01'), await person('1992-01-01')];
      const admin = await person('1980-01-01', 'administrador');
      const { tickets } = await buy(a, ev);
      const t = tickets[0]!.id;
      await transfer(a, t, b.email);
      clock.advance(60_000);
      await transfer(b, t, c.email);
      clock.advance(60_000);
      const atC = await ticketRow(t);

      const undo = (body: unknown) => admin.raw('POST', `/admin/tickets/${t}/transfer/undo`, body);
      expect((await undo({ reason: 'oi', confirm: true })).status).toBe(422);
      expect((await undo({ reason: 'Venda com Pix devolvido', confirm: false })).status).toBe(422);
      // Cliente não tem acesso.
      expect((await c.raw('POST', `/admin/tickets/${t}/transfer/undo`, { reason: 'Venda com Pix devolvido', confirm: true })).status).toBe(403);

      const res = await undo({ reason: 'Venda com Pix devolvido', confirm: true });
      expect(res.status).toBe(200);
      const detail = await json(res);
      expect(detail.ticket.holder.id).toBe(b.id);
      expect(detail.transfers).toHaveLength(3);
      expect(detail.transfers[0]).toMatchObject({ byStaff: true, reason: 'Venda com Pix devolvido' });
      const atB = await ticketRow(t);
      expect(atB.holder_user_id).toBe(b.id);
      expect(atB.code).not.toBe(atC.code);
      const audit = (await sql("select actor_id, reason from audit_log where action = 'ingresso.transferencia_desfeita' and entity_id = $1", [t])).rows;
      expect(audit).toEqual([{ actor_id: admin.id, reason: 'Venda com Pix devolvido' }]);

      // A anterior (A para B) também pode ser desfeita; depois disso, não há mais o que desfazer.
      clock.advance(60_000);
      expect((await undo({ reason: 'Fraude confirmada pela PartyX', confirm: true })).status).toBe(200);
      expect((await ticketRow(t)).holder_user_id).toBe(a.id);
      expect((await ticketRow(t)).holder_minor).toBeNull(); // voltou para quem comprou: vale o pedido
      expect(await code(await undo({ reason: 'De novo, por engano', confirm: true }))).toBe('desfazer_indisponivel');
      // O histórico não aceita alteração nem exclusão.
      await expect(sql("update ticket_transfers set reason = 'x' where ticket_id = $1", [t])).rejects.toThrow(/apenas inclusão/);
      await expect(sql('delete from ticket_transfers where ticket_id = $1', [t])).rejects.toThrow();
    });

    it('ingresso já usado: não desfaz', async () => {
      const ev = await event();
      const [a, b] = [await person('1990-01-01'), await person('1991-01-01')];
      const admin = await person('1980-01-01', 'administrador');
      const v = await person(null, 'validador');
      const { tickets } = await buy(a, ev);
      await transfer(a, tickets[0]!.id, b.email);
      await scan(v, ev.id, (await ticketRow(tickets[0]!.id)).qr_payload);
      const res = await admin.raw('POST', `/admin/tickets/${tickets[0]!.id}/transfer/undo`, { reason: 'Fraude confirmada', confirm: true });
      expect(await code(res)).toBe('desfazer_indisponivel');
    });
  });

  describe('portaria, contingência, anonimização e dados da pessoa', () => {
    it('busca por CPF e e-mail acha o titular atual; a contingência sai com o nome e o CPF dele', async () => {
      const ev = await event();
      const [a, b] = [await person('1990-01-01'), await person('1991-01-01')];
      const v = await person(null, 'validador');
      const { tickets } = await buy(a, ev, 2);
      await transfer(a, tickets[0]!.id, b.email);
      const search = async (q: string) => (await json(await v.raw('POST', '/gate/search', { eventId: ev.id, q }))).hits;
      expect((await search(b.cpf)).map((h: { ticketId: string }) => h.ticketId)).toEqual([tickets[0]!.id]);
      expect((await search(a.cpf)).map((h: { ticketId: string }) => h.ticketId)).toEqual([tickets[1]!.id]);
      expect((await search(b.email)).map((h: { holderName: string }) => h.holderName)).toEqual([b.name]);

      const list = await loadContingency({ db: createDrizzle(testDb.pool), clock } as never, ev.id);
      const rows = list.admit.map(t => ({ name: t.holderName, cpf: t.cpf }));
      expect(rows).toEqual(
        expect.arrayContaining([
          { name: b.name, cpf: `***.${b.cpf.slice(3, 6)}.${b.cpf.slice(6, 9)}-**` },
          { name: a.name, cpf: `***.${a.cpf.slice(3, 6)}.${a.cpf.slice(6, 9)}-**` },
        ]),
      );
    });

    it('anonimizar quem comprou não apaga o nome de quem recebeu; a exportação de dados não mostra o nome dele', async () => {
      const ev = await event();
      const [a, b] = [await person('1990-01-01'), await person('1991-01-01')];
      const admin = await person('1980-01-01', 'administrador');
      const { tickets } = await buy(a, ev, 2);
      await transfer(a, tickets[0]!.id, b.email);
      const deps = { db: createDrizzle(testDb.pool), clock, hasher: argon2Hasher };

      const data = await exportSubjectData(deps as never, a.id);
      const own = data.orders[0]!.tickets;
      expect(own).toEqual(
        expect.arrayContaining([expect.objectContaining({ transferred: true, holderName: null, code: null })]),
      );
      expect(JSON.stringify(data)).not.toContain(b.name);
      expect(data.transfers).toEqual([expect.objectContaining({ direction: 'enviada', other: expect.stringMatching(/^Maria\d+ S\. O\.$/) })]);
      expect(data.cancellationAcceptances).toEqual([
        expect.objectContaining({ policyVersion: 'ficticio-0', ip: '203.0.113.7', userAgent: 'Teste/1.0' }),
      ]);
      const dataB = await exportSubjectData(deps as never, b.id);
      expect(dataB.receivedTickets).toHaveLength(1);
      expect(dataB.transfers[0]!.direction).toBe('recebida');

      await anonymizeSubject(deps as never, admin.id, a.id, {
        reference: 'PROT-2026-01',
        reason: 'Pedido de exclusão feito pelo titular',
        confirm: true,
        acknowledgeValidTickets: true,
      } as never);
      expect((await ticketRow(tickets[0]!.id)).holder_name).toBe(b.name);
      expect((await ticketRow(tickets[1]!.id)).holder_name).toBe('Titular removido');
      const ip = (await sql('select ip from cancellation_acceptances where user_id = $1', [a.id])).rows;
      expect(ip).toEqual([{ ip: null }]);
    });
  });

  describe('aceite da Política de Cancelamento no checkout (D-80 atualizada)', () => {
    it('sem a caixa: 422; versão antiga: 409; com o aceite: grava versão, data, IP, navegador e pedido', async () => {
      const ev = await event();
      const a = await person('1990-01-01');
      const body = { eventSlug: ev.slug, items: [{ ticketTypeId: ev.type, quantity: 1 }] };
      const sem = await a.raw('POST', '/orders', body);
      expect(sem.status).toBe(422);
      expect((await json(sem)).erro.detalhes).toEqual([
        { campo: 'cancellationAccepted', mensagem: 'Para continuar, leia e aceite a Política de Cancelamento, Troca e Reembolso.' },
      ]);
      expect(await code(await a.raw('POST', '/orders', { ...body, cancellationAccepted: true, cancellationVersion: '0.9' }))).toBe(
        'versao_desatualizada',
      );
      expect((await sql('select count(*)::int as n from orders where user_id = $1', [a.id])).rows[0].n).toBe(0);
      const ok = await a.raw('POST', '/orders', { ...body, cancellationAccepted: true, cancellationVersion: 'ficticio-0' });
      expect(ok.status).toBe(201);
      const orderId = (await json(ok)).order.id;
      const rows = (
        await sql(
          'select user_id, order_id, policy_version, accepted_at, host(ip) as ip, user_agent from cancellation_acceptances where order_id = $1',
          [orderId],
        )
      ).rows;
      expect(rows).toEqual([
        {
          user_id: a.id,
          order_id: orderId,
          policy_version: 'ficticio-0',
          accepted_at: new Date('2026-10-10T15:00:00Z'),
          ip: '203.0.113.7',
          user_agent: 'Teste/1.0',
        },
      ]);
      // A versão vigente aparece para o checkout mandar com o aceite.
      expect((await json(await a.raw('GET', '/legal/versions'))).cancellation).toBe('ficticio-0');
    });

    it('Termos e Privacidade 1.2: quem aceitou a 1.1 aceita de novo no próximo login e o checkout recusa até lá', async () => {
      const prev = app;
      app = createApp({
        config: loadConfig({ APP_ENV: 'local', TERMS_VERSION: '1.2', PRIVACY_VERSION: '1.2' }),
        clock,
        auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer },
      });
      try {
        const a = await person('1990-01-01');
        await sql(
          "insert into consents (user_id, terms_version, privacy_version, accepted_at) values ($1,'1.1','1.1','2026-10-01T12:00:00Z')",
          [a.id],
        );
        expect((await json(await a.raw('GET', '/auth/me'))).pendingConsent).toBe(true);
        const ev = await event();
        const res = await a.raw('POST', '/orders', {
          eventSlug: ev.slug,
          items: [{ ticketTypeId: ev.type, quantity: 1 }],
          cancellationAccepted: true,
          cancellationVersion: 'ficticio-0',
        });
        expect(await code(res)).toBe('aceite_pendente');
        const accept = { acceptedTermsVersion: '1.2', acceptedPrivacyVersion: '1.2', accept: true };
        expect((await a.raw('POST', '/me/consents', accept)).status).toBeLessThan(300);
        expect((await json(await a.raw('GET', '/auth/me'))).pendingConsent).toBe(false);
      } finally {
        app = prev;
      }
    });
  });
});
