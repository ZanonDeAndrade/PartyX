import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { issueForOrder } from '../tickets/issuer';
import { APPEND_ONLY_TABLES, verifyRestore, type Manifest } from './restoreCheck';

const ADMIN_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!ADMIN_URL)('conferência da restauração do backup (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const config = loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none' });
  const JOURNAL = 14; // migrações do repositório (0000 a 0013)
  let n = 0;

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql('alter table orders disable trigger user');
    await sql('alter table tickets disable trigger user');
    await sql(
      'truncate payment_events, email_log, checkins, tickets, reservations, order_items, orders, ticket_types, events, promoters, audit_log, consents, sessions, login_attempts, users cascade',
    );
    await sql('alter table orders enable trigger user');
    await sql('alter table tickets enable trigger user');
  });

  /** Banco "saudável": 1 evento, 2 pedidos pagos com ingressos, 1 entrada na portaria. */
  async function healthy() {
    const ev = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values ('e-${++n}','Evento','2026-12-12T22:00:00-03:00','Arena','R1','d','Livre','publicado') returning id`,
      )
    ).rows[0].id;
    const type = (
      await sql(
        `insert into ticket_types (event_id,name,price_cents,quantity_total,quantity_sold,sales_start_at,sales_end_at) values ($1,'Pista',8000,100,5,'2026-08-01T00:00:00-03:00','2026-12-12T20:00:00-03:00') returning id`,
        [ev],
      )
    ).rows[0].id;
    const validator = (
      await sql(
        "insert into users (name,email,password_hash,role) values ('Val','v@x.com','h','validador') returning id",
      )
    ).rows[0].id;
    const orders: string[] = [];
    for (const qty of [2, 3]) {
      const u = (
        await sql(
          "insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,'h','cliente') returning id",
          [`C${++n}`, `c${n}@x.com`, String(60000000000 + n)],
        )
      ).rows[0].id;
      const o = (
        await sql(
          "insert into orders (user_id,event_id,total_cents,status,paid_at,payment_method) values ($1,$2,$3,'pago',now(),'pix') returning id",
          [u, ev, qty * 8000],
        )
      ).rows[0].id;
      const item = (
        await sql(
          'insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,$4,8000) returning id',
          [o, ev, type, qty],
        )
      ).rows[0].id;
      await createDrizzle(testDb.pool).transaction(tx =>
        issueForOrder(tx, config.qr, {
          id: o,
          userId: u,
          eventId: ev,
          items: [{ orderItemId: item, ticketTypeId: type, quantity: qty }],
        }),
      );
      orders.push(o);
    }
    const t = (await sql('select id from tickets where order_id = $1 limit 1', [orders[0]])).rows[0].id;
    await sql("update tickets set status = 'utilizado', used_at = now(), validated_by = $2 where id = $1", [
      t,
      validator,
    ]);
    await sql(
      "insert into checkins (ticket_id,event_id,validator_id,result,method) values ($1,$2,$3,'valido','camera')",
      [t, ev, validator],
    );
    return { ev, type, orders, ticket: t };
  }

  /** Manifesto no formato do `backup.sh`, com as contagens atuais do banco. */
  async function manifest(): Promise<Manifest> {
    const tables: Record<string, number> = {};
    for (const t of APPEND_ONLY_TABLES) tables[t] = Number((await sql(`select count(*) as n from "${t}"`)).rows[0].n);
    return { generatedAt: '20261006T030000Z', dump: 'partyx-x.dump', server: '18.6', migrations: JOURNAL, tables };
  }
  const run = async (m?: Manifest) => verifyRestore(testDb.pool, m ?? (await manifest()), JOURNAL);
  const failing = (checks: { name: string; ok: boolean }[]) => checks.filter(c => !c.ok).map(c => c.name);

  it('banco saudável: todas as verificações passam', async () => {
    await healthy();
    const checks = await run();
    expect(failing(checks)).toEqual([]);
    expect(checks.length).toBeGreaterThanOrEqual(20);
  });

  it('restauração incompleta: tabela com MENOS linhas que o manifesto reprova; com mais (gravações depois da contagem) passa', async () => {
    await healthy();
    const m = await manifest();
    expect(failing(await run({ ...m, tables: { ...m.tables, orders: m.tables.orders! + 5 } }))).toEqual([
      'linhas de orders',
    ]);
    expect(failing(await run({ ...m, tables: { ...m.tables, orders: m.tables.orders! - 1 } }))).toEqual([]);
    const missing = { ...m.tables };
    delete missing.audit_log;
    expect(failing(await run({ ...m, tables: missing }))).toEqual(['linhas de audit_log']);
  });

  it('migrações a menos que o manifesto ou que o repositório reprovam', async () => {
    await healthy();
    const m = await manifest();
    expect(failing(await run({ ...m, migrations: JOURNAL - 1 }))).toEqual(['migrações aplicadas']);
    expect(failing(await verifyRestore(testDb.pool, m, JOURNAL + 1))).toEqual(['migrações aplicadas']);
  });

  it('tabela fora do manifesto: reprova se ela existe no banco restaurado (cópia de uma cópia anterior só passa sem a tabela)', async () => {
    await healthy();
    const { minor_term_acceptances: _sem, ...semAceites } = (await manifest()).tables;
    const m = { ...(await manifest()), tables: semAceites };
    const check = (await run(m)).find(c => c.name === 'linhas de minor_term_acceptances')!;
    expect(check).toMatchObject({ ok: false, detail: 'a tabela não consta do manifesto' });
  });

  it('cópia anterior a uma release: com o número esperado informado, passa só se restaurado = manifesto = informado', async () => {
    const m = await manifest();
    // O repositório "ganhou" 4 migrações depois da cópia: sem o parâmetro reprova; com o número certo passa.
    expect(failing(await verifyRestore(testDb.pool, m, JOURNAL + 4))).toEqual(['migrações aplicadas']);
    const ok = await verifyRestore(testDb.pool, m, JOURNAL + 4, { exactMigrations: JOURNAL });
    expect(failing(ok)).toEqual([]);
    expect(ok.find(c => c.name === 'migrações aplicadas')!.detail).toContain(`${JOURNAL} esperadas`);
    // Número informado errado, para mais ou para menos, e manifesto divergente continuam reprovando.
    expect(failing(await verifyRestore(testDb.pool, m, JOURNAL + 4, { exactMigrations: JOURNAL - 1 }))).toEqual([
      'migrações aplicadas',
    ]);
    expect(failing(await verifyRestore(testDb.pool, m, JOURNAL + 4, { exactMigrations: JOURNAL + 1 }))).toEqual([
      'migrações aplicadas',
    ]);
    expect(
      failing(
        await verifyRestore(testDb.pool, { ...m, migrations: JOURNAL - 1 }, JOURNAL + 4, { exactMigrations: JOURNAL }),
      ),
    ).toEqual(['migrações aplicadas']);
  });

  it('estoque divergente: vendidos diferente dos ingressos emitidos', async () => {
    const h = await healthy();
    await sql('update ticket_types set quantity_sold = quantity_sold + 1 where id = $1', [h.type]);
    expect(failing(await run())).toEqual(['vendidos = ingressos emitidos, por tipo']);
  });

  it('pedido pago sem ingressos; pedido aprovado sem paid_at', async () => {
    const h = await healthy();
    const u = (await sql('select user_id from orders where id = $1', [h.orders[0]])).rows[0].user_id;
    const o = (
      await sql(
        "insert into orders (user_id,event_id,total_cents,status,paid_at) values ($1,$2,8000,'pago',now()) returning id",
        [u, h.ev],
      )
    ).rows[0].id;
    await sql(
      'insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,1,8000)',
      [o, h.ev, h.type],
    );
    expect(failing(await run())).toContain('pedido pago tem um ingresso por unidade');
    await sql('alter table orders disable trigger user');
    await sql('update orders set paid_at = null where id = $1', [o]).catch(() => undefined);
    await sql('alter table orders enable trigger user');
  });

  it('ingresso "utilizado" sem registro de entrada reprova', async () => {
    const h = await healthy();
    const m = await manifest(); // contagem de antes: a restauração perdeu a linha da entrada
    await sql('alter table checkins disable trigger user');
    await sql('delete from checkins where ticket_id = $1', [h.ticket]);
    await sql('alter table checkins enable trigger user');
    expect(failing(await run(m))).toEqual(['linhas de checkins', 'ingresso utilizado tem a entrada registrada']);
  });

  it('gatilhos de integridade ausentes (restauração sem as regras do banco) reprovam', async () => {
    await healthy();
    await sql('drop trigger orders_paid_at_immutable on orders');
    expect(failing(await run())).toEqual(['regras de integridade do banco restauradas (gatilhos)']);
  });

  it('banco vazio com manifesto cheio: reprova nas tabelas', async () => {
    const m: Manifest = {
      generatedAt: '20261006T030000Z',
      dump: 'x',
      server: '18',
      migrations: JOURNAL,
      tables: Object.fromEntries(APPEND_ONLY_TABLES.map(t => [t, 3])),
    };
    const bad = failing(await run(m));
    expect(bad).toContain('linhas de orders');
    expect(bad).toContain('linhas de tickets');
  });
});
