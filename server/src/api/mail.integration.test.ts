import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { simpleParser, type ParsedMail } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { NOT_ALLOWED_REASON } from '../mail/allowlist';
import { enqueueEmail, handleEmailTask, listEmails, MAX_ATTEMPTS, processOutbox, type OutboxDeps } from '../mail/outbox';
import { MemoryTaskQueue } from '../payments/taskQueue';
import { createFakeClock } from '../providers/clock';
import { smtpEmailSender, MemoryEmailSender, type EmailSender, type OutgoingEmail } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { createMockGateway, type MockGateway } from '../payments/mockGateway';
import { createTicketIssuer } from '../tickets/issuer';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';
const MINUTE = 60_000;

/** Remetente que falha um número de vezes e depois funciona. Só guarda o que seria enviado, para conferir o conteúdo. */
class FlakySender implements EmailSender {
  readonly delivered: OutgoingEmail[] = [];
  readonly attempts: OutgoingEmail[] = [];
  failures: number;
  constructor(failures: number) {
    this.failures = failures;
  }
  async send(m: OutgoingEmail) {
    this.attempts.push(m);
    if (this.failures > 0) {
      this.failures--;
      const e = new Error(`falha simulada ao enviar para ${m.to}`); // a mensagem tem o endereço: nunca pode ir para o log nem para a fila
      e.name = 'SimulatedSmtpError';
      throw e;
    }
    this.delivered.push(m);
  }
}

describe.skipIf(!ADMIN_URL)('e-mails transacionais (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  let hash = '';
  let n = 0;
  let mock: MockGateway;
  const config = loadConfig({
    APP_ENV: 'local',
    PAYMENT_GATEWAY: 'none',
    PUBLIC_BASE_URL: 'https://partyx.exemplo.test',
  });
  const deps = (mailer: EmailSender, env: Record<string, string> = {}): OutboxDeps => ({
    db: createDrizzle(testDb.pool),
    clock,
    mailer,
    config: { ...config, ...loadConfig({ APP_ENV: 'local', PUBLIC_BASE_URL: 'https://partyx.exemplo.test', ...env }) },
  });

  const build = (mailer: EmailSender, gateway = mock, taskQueue?: MemoryTaskQueue) =>
    createApp({
      config,
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer, gateway, taskQueue },
      issueTickets: createTicketIssuer(config.qr),
      jobAuth: { verify: async h => h === 'Bearer ok' },
    });

  async function insertUser(role: 'cliente' | 'administrador' = 'cliente', name = 'Marina Costa') {
    const i = ++n;
    const email = `${role}${i}@partyx.test`;
    const id = (
      await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5) returning id', [
        name,
        email,
        role === 'cliente' ? String(40000000000 + i) : null,
        hash,
        role,
      ])
    ).rows[0].id as string;
    return { id, email };
  }
  async function session(app: ReturnType<typeof build>, role: 'cliente' | 'administrador' = 'cliente', name?: string) {
    const u = await insertUser(role, name);
    let cookie = '';
    let csrf = '';
    const raw = (method: string, path: string, body?: unknown) => {
      const headers: Record<string, string> = { origin: 'http://localhost', 'x-forwarded-for': '203.0.113.7' };
      if (cookie) headers.cookie = cookie;
      if (csrf) headers['x-csrf-token'] = csrf;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return app.request(`/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    };
    const login = await raw('POST', '/auth/login', { email: u.email, password: PASSWORD });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    return { ...u, raw, get: (p: string) => raw('GET', p), post: (p: string, b: unknown = {}) => raw('POST', p, b) };
  }
  const json = async <T = any>(res: Response) => (await res.json()) as T;
  const emails = async () =>
    (
      await sql(
        'select id, template, status, attempts, last_error, idempotency_key, sent_at, next_attempt_at from email_log order by created_at, id',
      )
    ).rows;

  async function paidOrder(app: ReturnType<typeof build>, opts: { eventName?: string; qty?: number } = {}) {
    const slug = `evento-${++n}`;
    const eventId = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values ($1,$2,'2026-12-12T22:00:00-03:00','Arena Central','Rua 1','d','Livre','publicado') returning id`,
        [slug, opts.eventName ?? 'Noite Neon Verão'],
      )
    ).rows[0].id as string;
    const typeId = (
      await sql(
        `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'Pista',8000,100,'2026-10-01T00:00:00-03:00','2026-12-12T20:00:00-03:00') returning id`,
        [eventId],
      )
    ).rows[0].id as string;
    const buyer = await session(app, 'cliente', 'Marina Costa');
    const order = (
      await json(
        await buyer.post('/orders', { eventSlug: slug, items: [{ ticketTypeId: typeId, quantity: opts.qty ?? 2 }] }),
      )
    ).order as { id: string };
    await buyer.post(`/orders/${order.id}/payment`, { method: 'pix' });
    const paymentId = (await sql('select gateway_payment_id from orders where id = $1', [order.id])).rows[0]
      .gateway_payment_id as string;
    const approve = async (target = app) => {
      mock.simulate.setStatus(paymentId, 'aprovado');
      const body = JSON.stringify({ id: `evt_${randomBytes(6).toString('hex')}`, paymentId, type: 'payment.approved' });
      return target.request('/api/webhooks/payments', {
        method: 'POST',
        headers: { 'x-mock-signature': mock.simulate.sign(body) },
        body,
      });
    };
    return { buyer, orderId: order.id, paymentId, approve, eventId };
  }

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    hash = await argon2Hasher.hash(PASSWORD);
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql(
      'truncate payment_events, checkins, tickets, reservations, order_items, orders, ticket_types, events, email_log, password_resets, consents, audit_log, sessions, login_attempts, users cascade',
    );
    clock.set('2026-10-10T15:00:00Z');
    mock = createMockGateway(clock);
  });

  describe('fila (outbox)', () => {
    it('enfileirar duas vezes a mesma chave cria um item só; entregar duas vezes envia uma mensagem só', async () => {
      const u = await insertUser();
      const sender = new MemoryEmailSender();
      const d = deps(sender);
      expect(
        await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` }),
      ).toBe(true);
      expect(
        await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` }),
      ).toBe(false);
      expect(await processOutbox(d)).toMatchObject({ claimed: 1, sent: 1 });
      expect(await processOutbox(d)).toMatchObject({ claimed: 0, sent: 0 });
      expect(sender.sent).toHaveLength(1);
      expect((await emails())[0]).toMatchObject({ status: 'enviado', attempts: 1, last_error: null });
    });

    it('lista de homologação (EMAIL_ALLOWLIST): fora da lista não sai e fica registrado, sem alerta; dentro da lista sai', async () => {
      const dentro = await insertUser();
      const fora = await insertUser();
      const sender = new MemoryEmailSender();
      const d = deps(sender, { EMAIL_ALLOWLIST: `${dentro.email}, *@liberado.partyx.test` });
      for (const u of [dentro, fora])
        await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });
      const err = vi.spyOn(process.stderr, 'write');
      try {
        expect(await processOutbox(d)).toMatchObject({ claimed: 2, sent: 1, skipped: 1, failed: 0 });
        expect(err.mock.calls.map(c => String(c[0])).join('')).not.toContain('"alert"');
      } finally {
        err.mockRestore();
      }
      expect(sender.sent.map(m => m.to)).toEqual([dentro.email]);
      const row = async (id: string) =>
        (await sql('select status, last_error, sent_at from email_log where user_id = $1', [id])).rows[0];
      expect(await row(dentro.id)).toMatchObject({ status: 'enviado', last_error: null });
      expect(await row(fora.id)).toMatchObject({ status: 'falhou', last_error: NOT_ALLOWED_REASON, sent_at: null });
      const listed = (await listEmails(d.db, { status: 'falhou' })).find(e => e.lastError === NOT_ALLOWED_REASON);
      expect(listed?.note).toBe('não enviado (fora da lista de homologação)');
      // Nada é reenviado sozinho: a fila não pega o item de novo.
      clock.advance(24 * 60 * MINUTE);
      expect(await processOutbox(d)).toMatchObject({ claimed: 0, sent: 0 });
      // Sem a lista (como em produção), o mesmo destinatário recebe.
      const semLista = deps(sender);
      const outro = await insertUser();
      await enqueueEmail(semLista.db, clock, { userId: outro.id, template: 'cadastro', idempotencyKey: `cadastro:${outro.id}` });
      expect(await processOutbox(semLista)).toMatchObject({ sent: 1, skipped: 0 });
    });

    it('execuções simultâneas da fila enviam cada item uma única vez', async () => {
      const users = await Promise.all(Array.from({ length: 40 }, () => insertUser()));
      const sender = new MemoryEmailSender();
      const d = deps(sender);
      for (const u of users)
        await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });
      // Várias execuções querendo o mesmo lote ao mesmo tempo: a reserva por SKIP LOCKED impede o envio duplicado.
      const runs = await Promise.all(Array.from({ length: 8 }, () => processOutbox(d, { limit: 40 })));
      const rest = await processOutbox(d, { limit: 40 });
      expect(runs.reduce((t, r) => t + r.sent, 0) + rest.sent).toBe(40);
      expect(sender.sent).toHaveLength(40);
      expect(new Set(sender.sent.map(m => m.to)).size).toBe(40);
    });

    it('itens que outra execução está tratando são pulados, sem esperar (SKIP LOCKED)', async () => {
      const users = await Promise.all(Array.from({ length: 5 }, () => insertUser()));
      const sender = new MemoryEmailSender();
      const d = deps(sender);
      for (const u of users)
        await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });
      // Outra execução "em andamento": mantém duas linhas trancadas numa transação aberta.
      const other = await testDb.pool.connect();
      try {
        await other.query('begin');
        await other.query('select id from email_log order by created_at limit 2 for update');
        const outcome = await Promise.race([
          processOutbox(d).then(r => ({ done: true as const, r })),
          new Promise<{ done: false }>(resolve => setTimeout(() => resolve({ done: false }), 3000)),
        ]);
        expect(outcome.done, 'a execução ficou esperando as linhas trancadas').toBe(true);
        if (outcome.done) expect(outcome.r).toMatchObject({ claimed: 3, sent: 3 });
        await other.query('commit');
      } finally {
        other.release();
      }
      expect(await processOutbox(d)).toMatchObject({ sent: 2 });
      expect(sender.sent).toHaveLength(5);
    }, 10_000);

    it('falha: agenda nova tentativa com espera crescente (+2, +10 min), guarda só o NOME do erro e depois entrega com o mesmo Message-ID', async () => {
      const u = await insertUser();
      const sender = new FlakySender(2);
      const d = deps(sender);
      await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });

      expect(await processOutbox(d)).toMatchObject({ sent: 0, retry: 1 });
      let row = (await emails())[0];
      expect(row).toMatchObject({ status: 'pendente', attempts: 1, last_error: 'SimulatedSmtpError' });
      expect(new Date(row.next_attempt_at).getTime()).toBe(clock.now().getTime() + 2 * MINUTE);
      expect(JSON.stringify(row)).not.toContain(u.email); // o texto do erro (com o endereço) não foi guardado

      // Antes da hora, nada acontece.
      expect(await processOutbox(d)).toMatchObject({ claimed: 0 });
      clock.advance(2 * MINUTE);
      expect(await processOutbox(d)).toMatchObject({ retry: 1 });
      expect(new Date((await emails())[0].next_attempt_at).getTime()).toBe(clock.now().getTime() + 10 * MINUTE);

      clock.advance(10 * MINUTE);
      expect(await processOutbox(d)).toMatchObject({ sent: 1 });
      row = (await emails())[0];
      expect(row).toMatchObject({ status: 'enviado', attempts: 3, last_error: null });
      expect(sender.delivered).toHaveLength(1);
      // As três tentativas levaram o mesmo identificador de mensagem: duplicata no provedor é reconhecível.
      expect(new Set(sender.attempts.map(m => m.messageId)).size).toBe(1);
      expect(sender.attempts[0]!.messageId).toMatch(/^<[0-9a-f]{32}@partyx\.exemplo\.test>$/);
    });

    it('esgotadas as tentativas: vira "falhou", dispara o alerta no log e o administrador pode reabrir', async () => {
      const u = await insertUser();
      const sender = new FlakySender(MAX_ATTEMPTS);
      const d = deps(sender);
      await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });
      const err = vi.spyOn(process.stderr, 'write');
      try {
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
          await processOutbox(d);
          clock.advance(13 * 60 * MINUTE); // passa qualquer espera
        }
        const logged = err.mock.calls.map(c => String(c[0])).join('');
        expect(logged).toContain('"alert":"email_falhou"');
        expect(logged).not.toContain(u.email); // nem o endereço, nem o texto do erro
      } finally {
        err.mockRestore();
      }
      const failed = (await emails())[0];
      expect(failed).toMatchObject({ status: 'falhou', attempts: MAX_ATTEMPTS, last_error: 'SimulatedSmtpError' });
      expect(await processOutbox(d)).toMatchObject({ claimed: 0 }); // não tenta mais sozinho

      // O administrador (sessão aberta agora: a da equipe vence por inatividade) vê e reabre; o provedor voltou, então entrega.
      const admin = await session(build(new MemoryEmailSender()), 'administrador');
      const list = await json(await admin.get('/admin/emails?status=falhou'));
      expect(list.emails).toHaveLength(1);
      expect(Object.keys(list.emails[0]).sort()).toEqual([
        'attempts',
        'createdAt',
        'id',
        'lastError',
        'nextAttemptAt',
        'note',
        'orderId',
        'sentAt',
        'status',
        'template',
      ]);
      expect(JSON.stringify(list)).not.toContain(u.email);
      // O provedor voltou: reabrir já tenta entregar (sem isto o item esperaria a varredura diária) e devolve o estado real.
      const reopened = await admin.post(`/admin/emails/${failed.id}/retry`);
      expect([reopened.status, (await json(reopened)).status]).toEqual([200, 'enviado']);
      expect((await sql("select count(*)::int as n from audit_log where action = 'email.reabrir'")).rows[0].n).toBe(1);
      expect((await emails())[0]).toMatchObject({ status: 'enviado', attempts: 1 });
      expect(await processOutbox(d)).toMatchObject({ claimed: 0 }); // nada sobrou para a varredura
    });

    describe('reenvio por Cloud Tasks (+2, +10 e +30 min)', () => {
      let queue: MemoryTaskQueue;
      let d: OutboxDeps;
      const row = async () => (await emails())[0];
      /** Entrega da tarefa pelo Cloud Tasks, no horário em que ela foi agendada. */
      const deliver = async (emailId: string, _attempt: number, delaySeconds: number, deps: OutboxDeps = d) => {
        clock.advance(delaySeconds * 1000);
        return handleEmailTask(deps, { emailId });
      };
      const setup = async (failures: number) => {
        queue = new MemoryTaskQueue();
        const sender = new FlakySender(failures);
        d = { ...deps(sender), taskQueue: queue };
        const u = await insertUser();
        await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });
        return { sender, u };
      };

      it('cada falha agenda a próxima tarefa (+2, +10, +30); a 4ª falha manda para revisão, com trilha e alerta, e para de agendar', async () => {
        const { sender, u } = await setup(MAX_ATTEMPTS);
        const err = vi.spyOn(process.stderr, 'write');
        let id = '';
        try {
          expect(await processOutbox(d)).toMatchObject({ retry: 1 }); // 1ª tentativa, logo depois do fato
          id = (await row()).id;
          expect(queue.emailTasks).toEqual([{ emailId: id, attempt: 1, delaySeconds: 120 }]);
          expect(await deliver(id, 1, 120)).toEqual({ outcome: 'reagendado' });
          expect(queue.emailTasks.at(-1)).toEqual({ emailId: id, attempt: 2, delaySeconds: 600 });
          expect(await deliver(id, 2, 600)).toEqual({ outcome: 'reagendado' });
          expect(queue.emailTasks.at(-1)).toEqual({ emailId: id, attempt: 3, delaySeconds: 1800 });
          expect(await deliver(id, 3, 1800)).toEqual({ outcome: 'revisao_manual' });
          expect(queue.emailTasks).toHaveLength(3); // esgotou: nenhuma tarefa nova
          const logged = err.mock.calls.map(c => String(c[0])).join('');
          expect(logged).toContain('"alert":"email_falhou"');
          expect(logged).not.toContain(u.email);
        } finally {
          err.mockRestore();
        }
        expect(await row()).toMatchObject({ status: 'falhou', attempts: MAX_ATTEMPTS, last_error: 'SimulatedSmtpError' });
        const audit = (await sql("select reason, after_json from audit_log where action = 'email.revisao_manual'")).rows;
        expect(audit).toHaveLength(1);
        expect(audit[0].after_json).toMatchObject({ status: 'falhou', tentativas: MAX_ATTEMPTS, modelo: 'cadastro' });
        expect(JSON.stringify(audit)).not.toContain(u.email);
        expect(sender.delivered).toHaveLength(0);
        // Depois de em revisão, nem a tarefa repetida nem a varredura tentam de novo sozinhas.
        expect(await handleEmailTask(d, { emailId: id })).toEqual({ outcome: 'ja_resolvido' });
        expect(await processOutbox(d)).toMatchObject({ claimed: 0 });
      });

      it('entrega na 3ª retentativa: um e-mail só, com o mesmo Message-ID de todas as tentativas', async () => {
        const { sender } = await setup(3);
        await processOutbox(d);
        const id = (await row()).id;
        expect(await deliver(id, 1, 120)).toEqual({ outcome: 'reagendado' });
        expect(await deliver(id, 2, 600)).toEqual({ outcome: 'reagendado' });
        expect(await deliver(id, 3, 1800)).toEqual({ outcome: 'enviado' });
        expect(await row()).toMatchObject({ status: 'enviado', attempts: 4, last_error: null });
        expect(sender.delivered).toHaveLength(1);
        expect(new Set(sender.attempts.map(m => m.messageId)).size).toBe(1);
      });

      it('tarefa repetida ou simultânea não reenvia: o item é reservado e só vence uma vez', async () => {
        const { sender } = await setup(1);
        await processOutbox(d);
        const id = (await row()).id;
        clock.advance(120_000);
        const results = await Promise.all(Array.from({ length: 6 }, () => handleEmailTask(d, { emailId: id })));
        expect(results.filter(r => r.outcome === 'enviado')).toHaveLength(1);
        expect(sender.delivered).toHaveLength(1);
        expect(await handleEmailTask(d, { emailId: id })).toEqual({ outcome: 'ja_resolvido' });
        expect(sender.attempts).toHaveLength(2);
      });

      it('tarefa que chega antes da hora não envia ("adiado"); a varredura ou a próxima tarefa resolve', async () => {
        const { sender } = await setup(1);
        await processOutbox(d);
        const id = (await row()).id;
        clock.advance(30_000); // só 30 s dos 120 s
        expect(await handleEmailTask(d, { emailId: id })).toEqual({ outcome: 'adiado' });
        expect(sender.attempts).toHaveLength(1);
      });

      it('e-mail inexistente: encerra sem erro, a tarefa não fica reenfileirada', async () => {
        await setup(0);
        expect(await handleEmailTask(d, { emailId: '00000000-0000-4000-8000-000000000000' })).toEqual({ outcome: 'sem_email' });
      });

      it('a fila fora do ar não perde o e-mail: alerta no log e a VARREDURA diária entrega (rede de segurança)', async () => {
        const { sender } = await setup(1);
        queue.failNext = true;
        const err = vi.spyOn(process.stderr, 'write');
        try {
          expect(await processOutbox(d)).toMatchObject({ retry: 1 });
          expect(err.mock.calls.map(c => String(c[0])).join('')).toContain('"alert":"fila_email_falhou"');
        } finally {
          err.mockRestore();
        }
        expect(queue.emailTasks).toHaveLength(0); // nenhuma tarefa existe
        expect(await row()).toMatchObject({ status: 'pendente', attempts: 1 });
        clock.advance(24 * 60 * MINUTE); // a varredura das 04:00 do dia seguinte
        expect(await processOutbox(d)).toMatchObject({ sent: 1 });
        expect(sender.delivered).toHaveLength(1);
      });

      it('sem fila configurada (local, testes) a falha só agenda no banco: a varredura retoma', async () => {
        const sender = new FlakySender(1);
        const plain = deps(sender);
        const u = await insertUser();
        await enqueueEmail(plain.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });
        expect(await processOutbox(plain)).toMatchObject({ retry: 1 });
        clock.advance(2 * MINUTE);
        expect(await processOutbox(plain)).toMatchObject({ sent: 1 });
      });

      it('rota do Cloud Tasks: só com o token; id inválido ou tentativa 4 são recusados; falha de envio devolve 200 e reagenda', async () => {
        queue = new MemoryTaskQueue();
        const sender = new FlakySender(1);
        const app = build(sender, mock, queue);
        const u = await insertUser();
        await enqueueEmail(createDrizzle(testDb.pool), clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });
        const first = await processOutbox({ ...deps(sender), taskQueue: queue });
        expect(first).toMatchObject({ retry: 1 });
        const id = (await row()).id;
        const post = (body: unknown, auth?: string) =>
          app.request('/api/internal/tasks/send-email', {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
            body: JSON.stringify(body),
          });
        expect((await post({ emailId: id, attempt: 1 })).status).toBe(401);
        expect((await post({ emailId: id, attempt: 1 }, 'Bearer errado')).status).toBe(401);
        for (const bad of [{ emailId: 'x', attempt: 1 }, { emailId: id, attempt: 4 }, { emailId: id, attempt: 0 }, {}])
          expect((await post(bad, 'Bearer ok')).status).toBe(422);
        expect((await row()).attempts).toBe(1); // nada foi tentado pelas recusas
        clock.advance(120_000);
        const res = await post({ emailId: id, attempt: 1 }, 'Bearer ok');
        expect([res.status, (await json(res)).outcome]).toEqual([200, 'enviado']);
        expect(sender.delivered).toHaveLength(1);
      });
    });

    it('reabrir com o provedor ainda fora do ar: continua pendente, com nova tentativa agendada (+2 min)', async () => {
      const u = await insertUser();
      const queue = new MemoryTaskQueue();
      const sender = new FlakySender(MAX_ATTEMPTS + 1); // falha as 4 tentativas e mais uma
      const d = { ...deps(sender), taskQueue: queue };
      await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await processOutbox(d);
        clock.advance(31 * MINUTE);
      }
      const failed = (await emails())[0];
      expect(failed.status).toBe('falhou');
      const admin = await session(build(sender, mock, queue), 'administrador');
      const res = await admin.post(`/admin/emails/${failed.id}/retry`);
      expect([res.status, (await json(res)).status]).toEqual([200, 'pendente']);
      expect((await emails())[0]).toMatchObject({ status: 'pendente', attempts: 1 }); // reabriu e a 1ª tentativa nova falhou
      expect(queue.emailTasks.at(-1)).toMatchObject({ emailId: failed.id, attempt: 1, delaySeconds: 120 });
    });

    it('administração: exige perfil de administrador; reabrir o que não falhou ou que "deixou de se aplicar" é recusado', async () => {
      const app = build(new MemoryEmailSender());
      const admin = await session(app, 'administrador');
      const buyer = await session(app, 'cliente');
      expect((await buyer.get('/admin/emails')).status).toBe(403);
      expect((await app.request('/api/admin/emails')).status).toBe(401);
      const u = await insertUser();
      const d = deps(new MemoryEmailSender());
      await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });
      const id = (await emails())[0].id;
      expect((await admin.post(`/admin/emails/${id}/retry`)).status).toBe(409); // ainda pendente
      await sql("update email_log set status = 'falhou', last_error = 'nao_aplicavel:pedido_nao_pago' where id = $1", [
        id,
      ]);
      expect((await admin.post(`/admin/emails/${id}/retry`)).status).toBe(409);
      expect((await admin.post('/admin/emails/nao-uuid/retry')).status).toBe(404);
      expect((await admin.get('/admin/emails?status=qualquer')).status).toBe(422);
    });

    it('sem provedor configurado nada é dado como enviado: o item espera na fila e o alerta chega ao esgotar', async () => {
      const { unconfiguredEmailSender } = await import('../providers/email');
      const u = await insertUser();
      const d = deps(unconfiguredEmailSender);
      await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });
      await processOutbox(d);
      expect((await emails())[0]).toMatchObject({ status: 'pendente', last_error: 'EmailNotConfiguredError' });
      expect((await sql("select count(*)::int as n from email_log where status = 'enviado'")).rows[0].n).toBe(0);
    });
  });

  describe('compra confirmada (RF-36)', () => {
    it('é enfileirada na mesma transação do pagamento e entregue com os dados do pedido e o link para Meus ingressos', async () => {
      const sender = new MemoryEmailSender();
      const app = build(sender);
      const p = await paidOrder(app, { qty: 3 });
      expect((await p.approve()).status).toBe(200);

      expect(sender.sent).toHaveLength(1);
      const m = sender.sent[0]!;
      expect(m.template).toBe('compra_confirmada');
      expect(m.to).toBe(p.buyer.email);
      expect(m.subject).toMatch(/^\[LOCAL\] Compra confirmada · Noite Neon Verão · Pedido PX-\d+$/);
      for (const must of [
        'Noite Neon Verão',
        '12/12/2026 às 22:00',
        'Arena Central',
        '3 ingressos',
        '3 × Pista',
        'https://partyx.exemplo.test/meus-ingressos',
      ]) {
        expect(m.html + m.text, must).toContain(must);
      }
      const row = (await emails())[0];
      expect(row).toMatchObject({
        template: 'compra_confirmada',
        status: 'enviado',
        idempotency_key: `compra:${p.orderId}`,
      });
    });

    it('não leva QR nem código de ingresso, nem anexo', async () => {
      const sender = new MemoryEmailSender();
      const app = build(sender);
      const p = await paidOrder(app, { qty: 2 });
      await p.approve();
      const secrets = (
        await sql('select code, short_code, qr_payload from tickets where order_id = $1', [p.orderId])
      ).rows.flatMap(r => [r.code, r.short_code, r.qr_payload]);
      expect(secrets).toHaveLength(6);
      const body = sender.sent[0]!.html + sender.sent[0]!.text;
      for (const s of secrets) expect(body).not.toContain(s);
      expect(Object.keys(sender.sent[0]!).sort()).toEqual([
        'data',
        'html',
        'messageId',
        'subject',
        'template',
        'text',
        'to',
      ]); // sem campo de anexo
    });

    it('notificações repetidas do gateway enviam um único e-mail', async () => {
      const sender = new MemoryEmailSender();
      const app = build(sender);
      const p = await paidOrder(app);
      await Promise.all([p.approve(), p.approve(), p.approve()]);
      await p.approve();
      expect(sender.sent).toHaveLength(1);
      expect(
        (await sql("select count(*)::int as n from email_log where template = 'compra_confirmada'")).rows[0].n,
      ).toBe(1);
    });

    it('falha de e-mail NUNCA desfaz o pagamento: o pedido fica pago, com ingressos, e o e-mail sai depois pela rotina', async () => {
      const sender = new FlakySender(1);
      const app = build(sender);
      const p = await paidOrder(app);
      const res = await p.approve();
      expect(res.status).toBe(200); // o gateway recebe 200: o pagamento foi processado
      expect((await sql('select status from orders where id = $1', [p.orderId])).rows[0].status).toBe('pago');
      expect((await sql('select count(*)::int as n from tickets where order_id = $1', [p.orderId])).rows[0].n).toBe(2);
      expect((await emails())[0]).toMatchObject({ status: 'pendente', attempts: 1, last_error: 'SimulatedSmtpError' });

      clock.advance(2 * MINUTE);
      const job = await app.request('/api/internal/jobs/reconcile-payments', {
        method: 'POST',
        headers: { authorization: 'Bearer ok' },
      });
      expect((await json(job)).emails).toMatchObject({ sent: 1 });
      expect(sender.delivered).toHaveLength(1);
      expect((await emails())[0].status).toBe('enviado');
    });

    it('SMTP fora do ar na hora do webhook: o webhook não demora mais que o limite e responde 200', async () => {
      const hanging: EmailSender = { send: () => new Promise(() => {}) }; // nunca responde
      const app = build(hanging);
      const p = await paidOrder(app);
      const started = Date.now();
      const res = await p.approve();
      expect(res.status).toBe(200);
      expect(Date.now() - started).toBeLessThan(6000);
      expect((await sql('select status from orders where id = $1', [p.orderId])).rows[0].status).toBe('pago');
    }, 15_000);

    it('pedido estornado antes de o e-mail sair: o e-mail não é enviado (diria o contrário da verdade)', async () => {
      const sender = new FlakySender(1);
      const app = build(sender);
      const p = await paidOrder(app);
      await p.approve(); // falha na primeira tentativa: fica pendente
      mock.simulate.setStatus(p.paymentId, 'estornado');
      const body = JSON.stringify({ id: 'evt-refund', paymentId: p.paymentId, type: 'payment.refunded' });
      await app.request('/api/webhooks/payments', {
        method: 'POST',
        headers: { 'x-mock-signature': mock.simulate.sign(body) },
        body,
      });
      clock.advance(2 * MINUTE);
      const result = await processOutbox(deps(sender));
      expect(result).toMatchObject({ skipped: 1, sent: 0 });
      expect(sender.delivered).toHaveLength(0);
      expect((await emails())[0]).toMatchObject({ status: 'falhou', last_error: 'nao_aplicavel:pedido_nao_pago' });
    });

    it('nome de evento com quebra de linha não injeta cabeçalho', async () => {
      const sender = new MemoryEmailSender();
      const app = build(sender);
      const p = await paidOrder(app, { eventName: 'Festa\r\nBcc: alguem@mal.test' });
      await p.approve();
      expect(sender.sent[0]!.subject).not.toMatch(/[\r\n]/);
    });
  });

  describe('cadastro (CA-01)', () => {
    it('o cadastro envia a confirmação e a falha de e-mail não derruba o cadastro', async () => {
      const sender = new FlakySender(1);
      const app = build(sender);
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Marina Costa',
          email: 'marina@partyx.test',
          cpf: '52998224725',
          phone: '55998124470',
          password: PASSWORD,
          acceptedTermsVersion: 'ficticio-0',
          acceptedPrivacyVersion: 'ficticio-0',
          accept: true,
        }),
      });
      expect(res.status).toBe(201); // a conta existe mesmo com o e-mail falhando
      expect((await emails())[0]).toMatchObject({ template: 'cadastro', status: 'pendente', attempts: 1 });
      clock.advance(2 * MINUTE);
      await processOutbox(deps(sender));
      expect(sender.delivered).toHaveLength(1);
      expect(sender.delivered[0]).toMatchObject({
        to: 'marina@partyx.test',
        subject: '[LOCAL] Sua conta PartyX foi criada',
      });
    });
  });

  describe('recuperação de senha (RF-05)', () => {
    const forgot = (app: ReturnType<typeof build>, email: string) =>
      app.request('/api/auth/password/forgot', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.1' },
        body: JSON.stringify({ email }),
      });
    const stateOf = async (app: ReturnType<typeof build>, token: string) =>
      (
        await json(
          await app.request('/api/auth/password/check', {
            method: 'POST',
            headers: { origin: 'http://localhost', 'content-type': 'application/json' },
            body: JSON.stringify({ token }),
          }),
        )
      ).estado as string;
    const tokenOf = (link: string) => new URL(link).searchParams.get('token')!;

    it('o e-mail leva um link válido que muda a senha uma única vez; nenhum token fica em texto no banco', async () => {
      const sender = new MemoryEmailSender();
      const app = build(sender);
      const u = await insertUser();
      expect((await forgot(app, u.email)).status).toBe(202);
      const m = sender.last('recuperacao_senha')!;
      expect(m.to).toBe(u.email);
      const token = tokenOf(m.data.link!);
      expect(m.data.link).toMatch(/^https:\/\/partyx\.exemplo\.test\/redefinir-senha\?token=/);
      expect(await stateOf(app, token)).toBe('valido');

      // Só o hash está no banco: o token não aparece em nenhuma coluna de nenhuma tabela envolvida.
      const dump = JSON.stringify([
        (await sql('select * from password_resets')).rows,
        (await sql('select * from email_log')).rows,
      ]);
      expect(dump).not.toContain(token);

      const reset = await app.request('/api/auth/password/reset', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: JSON.stringify({ token, password: 'nova-senha-2026' }),
      });
      expect(reset.status).toBe(200);
      expect(await stateOf(app, token)).toBe('utilizado');
    });

    it('depois de uma falha, a nova tentativa gera link novo e o da tentativa anterior deixa de valer', async () => {
      const sender = new FlakySender(1);
      const app = build(sender);
      const u = await insertUser();
      await forgot(app, u.email);
      const first = sender.attempts[0]!;
      const firstToken = tokenOf(first.data.link!);
      expect(sender.delivered).toHaveLength(0);
      clock.advance(2 * MINUTE);
      await processOutbox(deps(sender));
      const second = sender.delivered[0]!;
      const secondToken = tokenOf(second.data.link!);
      expect(secondToken).not.toBe(firstToken);
      expect(await stateOf(app, firstToken)).toBe('expirado');
      expect(await stateOf(app, secondToken)).toBe('valido');
      expect(second.messageId).toBe(first.messageId); // mesma mensagem lógica
    });

    it('o link vale 1 hora a partir do envio', async () => {
      const sender = new MemoryEmailSender();
      const app = build(sender);
      const u = await insertUser();
      await forgot(app, u.email);
      const token = tokenOf(sender.last('recuperacao_senha')!.data.link!);
      clock.advance(59 * MINUTE);
      expect(await stateOf(app, token)).toBe('valido');
      clock.advance(2 * MINUTE);
      expect(await stateOf(app, token)).toBe('expirado');
    });

    it('resposta igual para e-mail que não existe, e nada é enfileirado nem enviado; limite de 3 pedidos por hora', async () => {
      const sender = new MemoryEmailSender();
      const app = build(sender);
      const u = await insertUser();
      const ghost = await forgot(app, 'ninguem@partyx.test');
      const real = await forgot(app, u.email);
      expect([ghost.status, real.status]).toEqual([202, 202]);
      expect(await json(ghost)).toEqual(await json(real));
      expect(
        (await sql("select count(*)::int as n from email_log where template = 'recuperacao_senha'")).rows[0].n,
      ).toBe(1);
      await forgot(app, u.email);
      await forgot(app, u.email);
      expect((await forgot(app, u.email)).status).toBe(202); // 4º: ignorado em silêncio
      expect(sender.sent.filter(m => m.template === 'recuperacao_senha')).toHaveLength(3);
    });

    it('token e endereço de e-mail nunca aparecem no log, nem em caso de falha', async () => {
      const sender = new FlakySender(1);
      const app = build(sender);
      const u = await insertUser();
      const out = vi.spyOn(process.stdout, 'write');
      const err = vi.spyOn(process.stderr, 'write');
      try {
        await forgot(app, u.email);
        clock.advance(2 * MINUTE);
        await processOutbox(deps(sender));
        const logged = [...out.mock.calls, ...err.mock.calls].map(c => String(c[0])).join('\n');
        expect(logged).not.toContain(u.email);
        expect(logged).not.toContain('token=');
        for (const m of sender.attempts) expect(logged).not.toContain(tokenOf(m.data.link!));
      } finally {
        out.mockRestore();
        err.mockRestore();
      }
    });

    it('usuário desativado não recebe: o item deixa de se aplicar', async () => {
      const sender = new MemoryEmailSender();
      const app = build(sender);
      const u = await insertUser();
      await sql('update users set is_active = false where id = $1', [u.id]);
      await enqueueEmail(createDrizzle(testDb.pool), clock, {
        userId: u.id,
        template: 'recuperacao_senha',
        idempotencyKey: 'reset:x',
      });
      expect(await processOutbox(deps(sender))).toMatchObject({ skipped: 1 });
      expect(sender.sent).toHaveLength(0);
      void app;
    });
  });

  describe('ambiente e identificação', () => {
    it('em homologação o assunto leva [HOMOLOGAÇÃO]; em produção não leva prefixo', async () => {
      const u = await insertUser();
      const hml = new MemoryEmailSender();
      const prod = new MemoryEmailSender();
      const base = {
        DATABASE_URL: 'postgres://x',
        SESSION_SECRET: 's'.repeat(40),
        QR_HMAC_KEYS: `1:${randomBytes(32).toString('base64url')}`,
        PUBLIC_BASE_URL: 'https://partyx.exemplo.test',
        TURNSTILE_SECRET: 'segredo-turnstile-teste', TURNSTILE_SITE_KEY: 'chave-site-turnstile-teste',
      };
      const dHml = deps(hml, { APP_ENV: 'homologacao', ...base });
      const dProd = deps(prod, { APP_ENV: 'producao', ...base });
      await enqueueEmail(dHml.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: 'cadastro:a' });
      await processOutbox(dHml);
      await enqueueEmail(dProd.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: 'cadastro:b' });
      await processOutbox(dProd);
      expect(hml.sent[0]!.subject).toBe('[HOMOLOGAÇÃO] Sua conta PartyX foi criada');
      expect(prod.sent[0]!.subject).toBe('Sua conta PartyX foi criada');
      expect(prod.sent[0]!.html).not.toContain('E-mail de teste');
    });
  });

  describe('entrega real por SMTP (servidor SMTP de teste)', () => {
    let server: SMTPServer;
    let port = 0;
    const received: ParsedMail[] = [];
    let rejectNext = false;

    beforeAll(async () => {
      server = new SMTPServer({
        authOptional: true,
        disabledCommands: ['STARTTLS'],
        logger: false,
        onRcptTo(_address, _session, cb) {
          if (rejectNext) {
            rejectNext = false;
            const e = new Error('451 tente depois') as Error & { responseCode: number };
            e.responseCode = 451;
            return cb(e);
          }
          cb();
        },
        onData(stream, _session, cb) {
          simpleParser(stream).then(mail => {
            received.push(mail);
            cb();
          }, cb);
        },
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      port = (server.server.address() as AddressInfo).port;
    });
    afterAll(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
    });
    beforeEach(() => {
      received.length = 0;
      rejectNext = false;
    });

    const sender = () =>
      smtpEmailSender({
        url: `smtp://127.0.0.1:${port}?ignoreTLS=true`,
        from: 'PartyX <ingressos@partyx.exemplo.test>',
        replyTo: 'atendimento@partyx.exemplo.test',
      });
    const outgoing = (over: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
      template: 'cadastro',
      to: 'marina@partyx.test',
      data: {},
      subject: 'Sua conta PartyX foi criada',
      text: 'Olá em texto',
      html: '<p>Olá em HTML</p>',
      messageId: '<abc123@partyx.exemplo.test>',
      ...over,
    });

    it('entrega mensagem com texto e HTML, remetente, resposta, Message-ID e sem anexo', async () => {
      await sender().send(outgoing());
      expect(received).toHaveLength(1);
      const m = received[0]!;
      expect(m.from?.value[0]).toMatchObject({ name: 'PartyX', address: 'ingressos@partyx.exemplo.test' });
      expect(m.replyTo?.text).toBe('atendimento@partyx.exemplo.test');
      expect(m.to).toMatchObject({ text: 'marina@partyx.test' });
      expect(m.subject).toBe('Sua conta PartyX foi criada');
      expect(m.text).toContain('Olá em texto');
      expect(m.html).toContain('Olá em HTML');
      expect(m.messageId).toBe('<abc123@partyx.exemplo.test>');
      expect(m.attachments).toHaveLength(0);
      expect(m.headers.get('auto-submitted')).toBe('auto-generated');
    });

    it('acentos e caracteres especiais no assunto e no corpo chegam intactos', async () => {
      await sender().send(
        outgoing({
          subject: 'Compra confirmada · Noite Neon Verão · Pedido PX-1',
          text: 'ç ã é · “aspas”',
          html: '<p>ç ã é · “aspas”</p>',
        }),
      );
      expect(received[0]!.subject).toBe('Compra confirmada · Noite Neon Verão · Pedido PX-1');
      expect(received[0]!.text).toContain('ç ã é · “aspas”');
    });

    it('quebra de linha no assunto ou no destinatário não vira cabeçalho extra', async () => {
      await sender().send(outgoing({ subject: 'Oi\r\nBcc: mal@mal.test', to: 'marina@partyx.test' }));
      expect(received[0]!.headers.get('bcc')).toBeUndefined();
      expect(received[0]!.subject).not.toMatch(/[\r\n]/);
    });

    it('o servidor recusa o destinatário (451): o envio lança, e a fila registra a falha e tenta de novo', async () => {
      rejectNext = true;
      await expect(sender().send(outgoing())).rejects.toThrow();
      expect(received).toHaveLength(0);

      // Pela fila: falha, nova tentativa, entrega.
      const u = await insertUser();
      rejectNext = true;
      const d = deps(sender());
      await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });
      expect(await processOutbox(d)).toMatchObject({ retry: 1, sent: 0 });
      expect((await emails())[0].status).toBe('pendente');
      clock.advance(2 * MINUTE);
      expect(await processOutbox(d)).toMatchObject({ sent: 1 });
      expect(received).toHaveLength(1);
      expect(received[0]!.to).toMatchObject({ text: u.email });
    });

    it('servidor fora do ar (conexão recusada): lança erro e a fila trata como falha com nova tentativa', async () => {
      const dead = smtpEmailSender({
        url: 'smtp://127.0.0.1:1?ignoreTLS=true',
        from: 'PartyX <ingressos@partyx.exemplo.test>',
      });
      await expect(dead.send(outgoing())).rejects.toThrow();
      const u = await insertUser();
      const d = deps(dead);
      await enqueueEmail(d.db, clock, { userId: u.id, template: 'cadastro', idempotencyKey: `cadastro:${u.id}` });
      expect(await processOutbox(d)).toMatchObject({ retry: 1 });
      const row = (await emails())[0];
      expect(row.status).toBe('pendente');
      expect(JSON.stringify(row)).not.toContain(u.email);
    });
  });
});
