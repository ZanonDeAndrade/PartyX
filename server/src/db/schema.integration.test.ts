import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from './testing';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PG = { unique: '23505', check: '23514', fk: '23503', integrity: '23000' } as const;

/** Espera que a instrução falhe com o código SQLSTATE indicado. */
async function violates(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e as { code?: string; message?: string },
  );
  expect(error, 'a instrução deveria ter sido recusada pelo banco').not.toBeNull();
  expect(error!.code).toBe(code);
}

describe.skipIf(!ADMIN_URL)('esquema do PostgreSQL (integração)', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let q: pg.Pool['query'];
  let n = 0;
  const next = () => ++n;

  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const shortCode = () => {
    const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomBytes(1)[0]! % ALPHABET.length]).join('');
    return `PX-${pick()}-${pick()}`;
  };
  const secret = () => randomBytes(16).toString('base64url'); // 128 bits = 22 caracteres

  // ---------- fábricas ----------
  const user = async (o: Record<string, unknown> = {}) => {
    const i = next();
    const row = {
      name: `Pessoa ${i}`,
      email: `pessoa${i}@partyx.test`,
      cpf: String(10_000_000_000 + i),
      password_hash: 'hash',
      role: 'cliente',
      ...o,
    };
    const r = await q('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5) returning id', [
      row.name,
      row.email,
      row.cpf,
      row.password_hash,
      row.role,
    ]);
    return r.rows[0].id as string;
  };
  const staff = (role: 'validador' | 'administrador' = 'validador') => user({ role, cpf: null });
  const event = async (slug = `evento-${next()}`) => {
    const r = await q(
      `insert into events (slug,name,starts_at,venue,address,description,age_rating)
       values ($1,'Evento',now() + interval '10 days','Local','Endereço','Descrição','18 anos') returning id`,
      [slug],
    );
    return r.rows[0].id as string;
  };
  const ticketType = async (eventId: string, o: { price?: number; total?: number } = {}) => {
    const r = await q(
      `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at)
       values ($1,$2,$3,$4,now() - interval '1 day',now() + interval '5 days') returning id`,
      [eventId, `Tipo ${next()}`, o.price ?? 8000, o.total ?? 100],
    );
    return r.rows[0].id as string;
  };
  const order = async (userId: string, eventId: string, o: { status?: string; paidAt?: string | null } = {}) => {
    const r = await q(
      `insert into orders (user_id,event_id,total_cents,status,paid_at) values ($1,$2,8000,$3,$4) returning id, number`,
      [userId, eventId, o.status ?? 'pendente', o.paidAt ?? null],
    );
    return r.rows[0] as { id: string; number: number };
  };
  const item = async (orderId: string, eventId: string, typeId: string, quantity = 1) => {
    const r = await q(
      'insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,$4,8000) returning id',
      [orderId, eventId, typeId, quantity],
    );
    return r.rows[0].id as string;
  };
  const ticket = async (
    itemId: string,
    orderId: string,
    typeId: string,
    eventId: string,
    o: { unit?: number; code?: string } = {},
  ) => {
    const r = await q(
      `insert into tickets (order_item_id,order_id,ticket_type_id,event_id,unit_index,holder_name,code,short_code,qr_payload)
       values ($1,$2,$3,$4,$5,'Marina Costa',$6,$7,'payload') returning id`,
      [itemId, orderId, typeId, eventId, o.unit ?? 1, o.code ?? secret(), shortCode()],
    );
    return r.rows[0].id as string;
  };
  /** Pedido pago completo com um ingresso. */
  const paidSale = async (eventId?: string) => {
    const ev = eventId ?? (await event());
    const buyer = await user();
    const type = await ticketType(ev);
    const o = await order(buyer, ev, { status: 'pago', paidAt: new Date().toISOString() });
    const it = await item(o.id, ev, type);
    const t = await ticket(it, o.id, type, ev);
    return { ev, buyer, type, order: o, item: it, ticket: t };
  };

  beforeAll(async () => {
    db = await createTestDatabase(ADMIN_URL!);
    q = db.pool.query.bind(db.pool) as pg.Pool['query'];
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe('migrações', () => {
    it('criam as 14 tabelas da documentação, as 4 técnicas e a de aceites de menor (0009)', async () => {
      const r = await q("select table_name from information_schema.tables where table_schema = 'public' order by 1");
      const tables = r.rows.map(x => x.table_name as string);
      const doc = [
        'users',
        'password_resets',
        'consents',
        'events',
        'ticket_types',
        'promoters',
        'reservations',
        'orders',
        'order_items',
        'tickets',
        'checkins',
        'payment_events',
        'email_log',
        'audit_log',
      ];
      expect(tables).toEqual(expect.arrayContaining(doc));
      expect(tables).toEqual(
        expect.arrayContaining([
          'sessions',
          'login_attempts',
          'global_limit_counters',
          'job_leases',
          'minor_term_acceptances',
          'ticket_lots',
          'order_item_lots',
          'ticket_transfers',
          'ticket_minor_acceptances',
          'cancellation_acceptances',
          'service_fee_settings',
        ]),
      );
      expect(tables).toHaveLength(25);
    });

    it('0016: titular do ingresso preenchido com o comprador (também para quem não o informa); histórico só de inclusão', async () => {
      const s = await paidSale();
      const row = (await q('select holder_user_id, holder_minor from tickets where id = $1', [s.ticket])).rows[0];
      expect(row).toEqual({ holder_user_id: s.buyer, holder_minor: null });
      const other = await user();
      const t = (
        await q(
          `insert into ticket_transfers (ticket_id,event_id,from_user_id,to_user_id,actor_id,old_short_code,new_short_code,old_code_sha256)
           values ($1,$2,$3,$4,$3,'PX-AAAA-AAAA','PX-BBBB-BBBB',$5) returning id`,
          [s.ticket, s.ev, s.buyer, other, 'a'.repeat(64)],
        )
      ).rows[0].id;
      await expect(q("update ticket_transfers set reason = 'x' where id = $1", [t])).rejects.toThrow(/apenas inclusão/);
      await expect(q('delete from ticket_transfers where id = $1', [t])).rejects.toThrow();
      // Desfazer exige motivo; transferência do titular não tem; para a mesma conta, não.
      await expect(
        q(
          `insert into ticket_transfers (ticket_id,event_id,from_user_id,to_user_id,actor_id,reverts_id,old_short_code,new_short_code,old_code_sha256)
           values ($1,$2,$3,$4,$3,$5,'PX-BBBB-BBBB','PX-CCCC-CCCC',$6)`,
          [s.ticket, s.ev, other, s.buyer, t, 'b'.repeat(64)],
        ),
      ).rejects.toThrow(/ticket_transfers_reason_on_revert/);
      await expect(
        q(
          `insert into ticket_transfers (ticket_id,event_id,from_user_id,to_user_id,actor_id,old_short_code,new_short_code,old_code_sha256)
           values ($1,$2,$3,$3,$3,'PX-BBBB-BBBB','PX-CCCC-CCCC',$4)`,
          [s.ticket, s.ev, other, 'c'.repeat(64)],
        ),
      ).rejects.toThrow(/ticket_transfers_other_account/);
      await q("insert into cancellation_acceptances (user_id,order_id,policy_version) values ($1,$2,'1.0')", [s.buyer, s.order.id]);
      await expect(q('delete from cancellation_acceptances where order_id = $1', [s.order.id])).rejects.toThrow();
    });

    it('podem rodar de novo sem erro nem duplicar o histórico', async () => {
      const { runMigrations } = await import('./migrate');
      await runMigrations(db.url);
      const r = await q('select count(*)::int as n from drizzle.__drizzle_migrations');
      expect(r.rows[0].n).toBe(18);
    });
  });

  describe('usuários', () => {
    it('e-mail é único sem diferenciar maiúsculas e sempre minúsculo', async () => {
      await user({ email: 'maria@partyx.test' });
      await violates(user({ email: 'maria@partyx.test' }), PG.unique);
      await violates(user({ email: 'Joana@PartyX.test' }), PG.check);
    });

    it('CPF é único, tem 11 dígitos e é obrigatório para cliente', async () => {
      await user({ cpf: '12345678909' });
      await violates(user({ cpf: '12345678909' }), PG.unique);
      await violates(user({ cpf: '123' }), PG.check);
      await violates(user({ cpf: null }), PG.check); // cliente sem CPF
      await expect(staff('administrador')).resolves.toBeTruthy(); // equipe pode não ter
    });

    it('recusa e-mail malformado', async () => {
      await violates(user({ email: 'sem-arroba' }), PG.check);
    });
  });

  describe('eventos, tipos e promoters', () => {
    it('slug é único e só aceita letras minúsculas, números e hífens', async () => {
      await event('noite-neon');
      await violates(event('noite-neon'), PG.unique);
      await violates(event('Noite Neon'), PG.check);
    });

    it('tipo de ingresso recusa preço zero, capacidade zero, vendido acima do total e janela invertida', async () => {
      const ev = await event();
      await violates(ticketType(ev, { price: 0 }), PG.check);
      await violates(ticketType(ev, { total: 0 }), PG.check);
      const type = await ticketType(ev, { total: 10 });
      await violates(q('update ticket_types set quantity_sold = 11 where id = $1', [type]), PG.check);
      await violates(q('update ticket_types set quantity_sold = -1 where id = $1', [type]), PG.check);
      await violates(q('update ticket_types set sales_end_at = sales_start_at where id = $1', [type]), PG.check);
    });

    it('nome do tipo é único dentro do evento', async () => {
      const ev = await event();
      await q(
        "insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'Pista',1000,5,now(),now()+interval '1 day')",
        [ev],
      );
      await violates(
        q(
          "insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'Pista',2000,5,now(),now()+interval '1 day')",
          [ev],
        ),
        PG.unique,
      );
    });

    it('promoter: código único, maiúsculo, de 3 a 20 caracteres', async () => {
      const add = (code: string) => q('insert into promoters (name,coupon_code) values ($1,$2)', ['P', code]);
      await add('DUDA');
      await violates(add('DUDA'), PG.unique);
      await violates(add('duda2'), PG.check);
      await violates(add('AB'), PG.check);
      await violates(add('A'.repeat(21)), PG.check);
    });

    it('evento e tipo só saem do banco sem uso: com pedido (em qualquer situação) ou leitura de portaria, recusa (0011)', async () => {
      const restrict = '23001';
      const free = await event();
      await ticketType(free);
      await violates(q('delete from events where id = $1', [free]), PG.fk); // o tipo ainda aponta para ele: sai primeiro
      await q('delete from ticket_types where event_id = $1', [free]);
      await q('delete from events where id = $1', [free]);

      const withOrder = await event();
      const type = await ticketType(withOrder);
      await order(await user(), withOrder, { status: 'expirado' });
      await violates(q('delete from ticket_types where id = $1', [type]), restrict);
      await violates(q('delete from events where id = $1', [withOrder]), restrict);

      const withCheckin = await event();
      await q("insert into checkins (event_id, validator_id, result, method) values ($1, $2, 'invalido', 'manual')", [
        withCheckin,
        await staff(),
      ]);
      await violates(q('delete from events where id = $1', [withCheckin]), restrict);
    });

    it('updated_at é atualizado pelo banco', async () => {
      const ev = await event();
      const before = (await q('select updated_at from events where id = $1', [ev])).rows[0].updated_at as Date;
      await new Promise(r => setTimeout(r, 15));
      await q("update events set name = 'Novo nome' where id = $1", [ev]);
      const after = (await q('select updated_at from events where id = $1', [ev])).rows[0].updated_at as Date;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });
  });

  describe('menores de idade (0009)', () => {
    it('data de nascimento é opcional no banco (contas antigas), mas não antes de 1900', async () => {
      const id = await user();
      await q("update users set birth_date = '2009-05-10' where id = $1", [id]);
      await violates(q("update users set birth_date = '1899-12-31' where id = $1", [id]), PG.check);
    });

    it('evento só permite menores com horário de fim (sem autorização judicial desde a 0010); o fim vem depois do início', async () => {
      const ev = await event();
      await violates(q('update events set allows_minors = true where id = $1', [ev]), PG.check);
      await q("update events set allows_minors = true, ends_at = starts_at + interval '6 hours' where id = $1", [ev]);
      await violates(q('update events set ends_at = starts_at where id = $1', [ev]), PG.check);
      const novo = await event();
      expect((await q('select allows_minors from events where id = $1', [novo])).rows[0].allows_minors).toBe(false);
    });

    it('aceite do termo de menor: um por pedido, só 16 ou 17 anos e nunca apagado', async () => {
      const ev = await event();
      const buyer = await user();
      const o = await order(buyer, ev);
      const accept = (age: number) =>
        q('insert into minor_term_acceptances (user_id, order_id, term_version, age_at_event) values ($1,$2,$3,$4)', [
          buyer,
          o.id,
          '1.0',
          age,
        ]);
      await violates(accept(15), PG.check);
      await violates(accept(18), PG.check);
      await accept(16);
      await violates(accept(17), PG.unique);
      await expect(q('delete from minor_term_acceptances where order_id = $1', [o.id])).rejects.toThrow();
      expect((await q('select buyer_minor from orders where id = $1', [o.id])).rows[0].buyer_minor).toBe(false);
    });

    it('a confirmação da autorização de menor só existe numa entrada válida', async () => {
      const sale = await paidSale();
      const validator = await staff();
      await violates(
        q(
          "insert into checkins (ticket_id,event_id,validator_id,result,method,minor_authorization_received) values ($1,$2,$3,'ja_utilizado','camera',true)",
          [sale.ticket, sale.ev, validator],
        ),
        PG.check,
      );
      await q(
        "insert into checkins (ticket_id,event_id,validator_id,result,method,minor_authorization_received) values ($1,$2,$3,'valido','camera',true)",
        [sale.ticket, sale.ev, validator],
      );
    });
  });

  describe('pedidos', () => {
    it('numera pedidos a partir de PX-10001, em sequência', async () => {
      const ev = await event();
      const buyer = await user();
      const a = await order(buyer, ev);
      const b = await order(buyer, ev);
      expect(a.number).toBeGreaterThanOrEqual(10001);
      expect(b.number).toBe(a.number + 1);
    });

    it('item não aceita tipo de ingresso de outro evento', async () => {
      const evA = await event();
      const evB = await event();
      const typeB = await ticketType(evB);
      const buyer = await user();
      const o = await order(buyer, evA);
      await violates(item(o.id, evA, typeB), PG.fk);
    });

    it('item não aceita um evento diferente do pedido', async () => {
      const evA = await event();
      const evB = await event();
      const typeB = await ticketType(evB);
      const buyer = await user();
      const o = await order(buyer, evA);
      await violates(item(o.id, evB, typeB), PG.fk);
    });

    it('pedido pago exige paid_at; pedido pendente não pode ter paid_at', async () => {
      const ev = await event();
      const buyer = await user();
      for (const status of ['pago', 'estornado', 'contestado', 'pago_sem_estoque']) {
        await violates(order(buyer, ev, { status }), PG.check);
      }
      await violates(order(buyer, ev, { status: 'pendente', paidAt: new Date().toISOString() }), PG.check);
    });

    it('paid_at original não muda nem quando o pedido é estornado', async () => {
      const sale = await paidSale();
      await q("update orders set status = 'estornado' where id = $1", [sale.order.id]); // status muda
      await violates(
        q("update orders set paid_at = paid_at + interval '1 day' where id = $1", [sale.order.id]),
        PG.integrity,
      );
      await violates(q('update orders set paid_at = null where id = $1', [sale.order.id]), PG.integrity);
    });

    it('permite definir paid_at uma vez (pedido que expirou e foi pago depois)', async () => {
      const ev = await event();
      const buyer = await user();
      const o = await order(buyer, ev, { status: 'expirado' });
      await q("update orders set status = 'pago_sem_estoque', paid_at = now() where id = $1", [o.id]);
      const r = await q('select status, paid_at from orders where id = $1', [o.id]);
      expect(r.rows[0].status).toBe('pago_sem_estoque');
      expect(r.rows[0].paid_at).not.toBeNull();
    });

    it('pedido, item e ingresso não podem ser apagados fisicamente', async () => {
      const sale = await paidSale();
      await violates(q('delete from tickets where id = $1', [sale.ticket]), PG.integrity);
      await violates(q('delete from order_items where id = $1', [sale.item]), PG.integrity);
      await violates(q('delete from orders where id = $1', [sale.order.id]), PG.integrity);
    });

    it('gateway_payment_id é único quando informado', async () => {
      const ev = await event();
      const buyer = await user();
      const a = await order(buyer, ev);
      const b = await order(buyer, ev);
      await q("update orders set gateway_payment_id = 'pay_1' where id = $1", [a.id]);
      await violates(q("update orders set gateway_payment_id = 'pay_1' where id = $1", [b.id]), PG.unique);
    });
  });

  describe('reservas', () => {
    it('só existem para uma linha de pedido e uma por tipo no pedido', async () => {
      const ev = await event();
      const type = await ticketType(ev);
      const buyer = await user();
      const o = await order(buyer, ev);
      const add = () =>
        q(
          "insert into reservations (order_id,ticket_type_id,quantity,expires_at) values ($1,$2,2,now()+interval '10 minutes')",
          [o.id, type],
        );
      await violates(add(), PG.fk); // ainda sem linha no pedido
      await item(o.id, ev, type, 2);
      await add();
      await violates(add(), PG.unique);
    });

    it('recusa quantidade zero', async () => {
      const ev = await event();
      const type = await ticketType(ev);
      const o = await order(await user(), ev);
      await item(o.id, ev, type);
      await violates(
        q('insert into reservations (order_id,ticket_type_id,quantity,expires_at) values ($1,$2,0,now())', [
          o.id,
          type,
        ]),
        PG.check,
      );
    });
  });

  describe('ingressos', () => {
    it('emissão é idempotente: a mesma unidade do mesmo item não duplica', async () => {
      const ev = await event();
      const type = await ticketType(ev);
      const o = await order(await user(), ev, { status: 'pago', paidAt: new Date().toISOString() });
      const it1 = await item(o.id, ev, type, 3);
      await ticket(it1, o.id, type, ev, { unit: 1 });
      await ticket(it1, o.id, type, ev, { unit: 2 });
      await ticket(it1, o.id, type, ev, { unit: 3 });
      await violates(ticket(it1, o.id, type, ev, { unit: 2 }), PG.unique);
      const r = await q('select count(distinct code)::int as n from tickets where order_item_id = $1', [it1]);
      expect(r.rows[0].n).toBe(3); // três ingressos, três códigos
    });

    it('código é único, tem ao menos 128 bits e usa só caracteres seguros', async () => {
      const sale = await paidSale();
      const code = secret();
      await ticket(sale.item, sale.order.id, sale.type, sale.ev, { unit: 2, code });
      await violates(ticket(sale.item, sale.order.id, sale.type, sale.ev, { unit: 3, code }), PG.unique);
      await violates(ticket(sale.item, sale.order.id, sale.type, sale.ev, { unit: 4, code: 'curto' }), PG.check);
      await violates(
        ticket(sale.item, sale.order.id, sale.type, sale.ev, { unit: 5, code: 'a'.repeat(22) + ' ?' }),
        PG.check,
      );
    });

    it('código curto segue o formato PX-XXXX-XXXX sem caracteres ambíguos', async () => {
      const sale = await paidSale();
      const bad = (sc: string) => q('update tickets set short_code = $2 where id = $1', [sale.ticket, sc]);
      await violates(bad('PX-0000-1111'), PG.check); // 0 e 1 não existem no alfabeto
      await violates(bad('PX-ABCD-EFGO'), PG.check); // O não existe
      await violates(bad('px-abcd-efgh'), PG.check);
    });

    it('ingresso não pode apontar para item de outro pedido ou evento', async () => {
      const sale = await paidSale();
      const outro = await paidSale();
      await violates(ticket(sale.item, outro.order.id, sale.type, sale.ev, { unit: 9 }), PG.fk);
      await violates(ticket(sale.item, sale.order.id, outro.type, sale.ev, { unit: 9 }), PG.fk);
      await violates(ticket(sale.item, sale.order.id, sale.type, outro.ev, { unit: 9 }), PG.fk);
    });

    it('estados são coerentes: utilizado exige validador e hora; cancelado exige hora; válido é limpo', async () => {
      const sale = await paidSale();
      const validator = await staff();
      await violates(q("update tickets set status = 'utilizado' where id = $1", [sale.ticket]), PG.check);
      await q("update tickets set status = 'utilizado', used_at = now(), validated_by = $2 where id = $1", [
        sale.ticket,
        validator,
      ]);
      await violates(q("update tickets set status = 'valido' where id = $1", [sale.ticket]), PG.check); // used_at continua preenchido
      const other = await paidSale();
      await violates(q("update tickets set status = 'cancelado' where id = $1", [other.ticket]), PG.check);
      await q(
        "update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'Solicitação do comprador' where id = $1",
        [other.ticket],
      );
    });

    it('cancelar o ingresso mantém o registro e o pedido (histórico preservado)', async () => {
      const sale = await paidSale();
      await q("update tickets set status = 'cancelado', cancelled_at = now() where id = $1", [sale.ticket]);
      const r = await q('select count(*)::int as n from tickets where id = $1', [sale.ticket]);
      expect(r.rows[0].n).toBe(1);
    });
  });

  describe('portaria', () => {
    it('o banco aceita no máximo uma entrada válida por ingresso (CA-25)', async () => {
      const sale = await paidSale();
      const v1 = await staff();
      const v2 = await staff();
      const checkin = (validator: string, result: string) =>
        q("insert into checkins (ticket_id,event_id,validator_id,result,method) values ($1,$2,$3,$4,'camera')", [
          sale.ticket,
          sale.ev,
          validator,
          result,
        ]);
      await checkin(v1, 'valido');
      await violates(checkin(v2, 'valido'), PG.unique); // dois aparelhos ao mesmo tempo: só um vence
      await checkin(v2, 'ja_utilizado'); // a tentativa repetida é registrada
      await checkin(v2, 'ja_utilizado');
      const r = await q(
        'select result, count(*)::int as n from checkins where ticket_id = $1 group by 1 order by 2 desc',
        [sale.ticket],
      );
      expect(r.rows).toEqual([
        { result: 'ja_utilizado', n: 2 },
        { result: 'valido', n: 1 },
      ]);
    });

    it('registra código inexistente e ingresso de outro evento sem exigir ingresso', async () => {
      const ev = await event();
      const v = await staff();
      await q(
        "insert into checkins (event_id,validator_id,result,method,code_presented) values ($1,$2,'invalido','camera','abc')",
        [ev, v],
      );
      await violates(
        q("insert into checkins (event_id,validator_id,result,method) values ($1,$2,'valido','camera')", [ev, v]),
        PG.check,
      );
      const sale = await paidSale();
      await q(
        "insert into checkins (ticket_id,event_id,validator_id,result,method) values ($1,$2,$3,'outro_evento','manual')",
        [sale.ticket, ev, v],
      );
    });

    it('limita o código apresentado a 64 caracteres', async () => {
      const ev = await event();
      const v = await staff();
      await violates(
        q(
          "insert into checkins (event_id,validator_id,result,method,code_presented) values ($1,$2,'invalido','camera',$3)",
          [ev, v, 'x'.repeat(65)],
        ),
        PG.check,
      );
    });
  });

  describe('webhooks do gateway', () => {
    const add = (id: string | null, valid: boolean, processed = false) =>
      q(
        "insert into payment_events (gateway_event_id,signature_valid,type,payload_json,processed_at) values ($1,$2,'payment.approved','{}', $3)",
        [id, valid, processed ? new Date().toISOString() : null],
      );

    it('o mesmo evento válido não entra duas vezes (CA-P3)', async () => {
      await add('evt_1', true);
      await violates(add('evt_1', true), PG.unique);
    });

    it('eventos com assinatura inválida são registrados e não ocupam o identificador de um evento real (CA-P4)', async () => {
      await add('evt_2', false);
      await add('evt_2', false);
      await add('evt_2', true); // o evento real continua podendo chegar
      const r = await q("select count(*)::int as n from payment_events where gateway_event_id = 'evt_2'");
      expect(r.rows[0].n).toBe(3);
    });

    it('evento com assinatura inválida nunca é marcado como processado', async () => {
      await violates(add('evt_3', false, true), PG.check);
    });
  });

  describe('e-mails', () => {
    it('chave de idempotência impede o mesmo e-mail duas vezes', async () => {
      const sale = await paidSale();
      const add = () =>
        q("insert into email_log (user_id,order_id,template,idempotency_key) values ($1,$2,'compra_confirmada',$3)", [
          sale.buyer,
          sale.order.id,
          `compra:${sale.order.id}`,
        ]);
      await add();
      await violates(add(), PG.unique);
    });

    it('e-mail enviado exige data de envio', async () => {
      const sale = await paidSale();
      await violates(
        q("insert into email_log (user_id,template,status,idempotency_key) values ($1,'cadastro','enviado',$2)", [
          sale.buyer,
          `x:${next()}`,
        ]),
        PG.check,
      );
    });
  });

  describe('auditoria', () => {
    it('aceita inclusão e recusa alteração e exclusão', async () => {
      const admin = await staff('administrador');
      const r = await q(
        "insert into audit_log (actor_id,action,entity,entity_id,reason) values ($1,'ticket.cancel','tickets',gen_random_uuid(),'teste') returning id",
        [admin],
      );
      const id = r.rows[0].id as string;
      await violates(q("update audit_log set reason = 'adulterado' where id = $1", [id]), PG.integrity);
      await violates(q('delete from audit_log where id = $1', [id]), PG.integrity);
    });
  });

  describe('relatório mensal da taxa (CA-29)', () => {
    it('conta o ingresso pelo paid_at original, mesmo cancelado, reembolsado ou estornado', async () => {
      const ev = await event();
      const type = await ticketType(ev, { total: 50 });
      const buyer = await user();
      const march = '2027-03-15T15:00:00Z';
      const april = '2027-04-02T15:00:00Z';
      const mk = async (status: string, paidAt: string, units: number) => {
        const o = await order(buyer, ev, { status: 'pago', paidAt });
        const it1 = await item(o.id, ev, type, units);
        for (let u = 1; u <= units; u++) await ticket(it1, o.id, type, ev, { unit: u });
        if (status !== 'pago') await q('update orders set status = $2 where id = $1', [o.id, status]);
        return o.id;
      };
      await mk('pago', march, 2);
      const estornado = await mk('estornado', march, 1);
      const contestado = await mk('contestado', march, 1);
      await mk('pago', april, 3); // outro mês
      await q("update tickets set status = 'cancelado', cancelled_at = now() where order_id = any($1)", [
        [estornado, contestado],
      ]);

      const r = await q(
        `select count(t.id)::int as unidades
           from tickets t join orders o on o.id = t.order_id
          where t.event_id = $1
            and o.paid_at >= '2027-03-01T03:00:00Z' and o.paid_at < '2027-04-01T03:00:00Z'`, // mês de março no fuso de São Paulo
        [ev],
      );
      expect(r.rows[0].unidades).toBe(4); // 2 pagos + 1 estornado + 1 contestado
    });
  });
});

describe.skipIf(!ADMIN_URL)('papel da aplicação (partyx_app)', () => {
  it('lê e escreve, mas não apaga histórico nem altera a estrutura', async () => {
    const pgModule = await import('pg');
    const admin = new pgModule.default.Client({ connectionString: ADMIN_URL! });
    await admin.connect();
    await admin.query(
      "do $$ begin if not exists (select 1 from pg_roles where rolname = 'partyx_app') then create role partyx_app login password 'app_test_only'; end if; end $$",
    );
    // Senha sempre a de teste: outro teste pode ter criado o papel com uma senha aleatória.
    await admin.query("alter role partyx_app with login password 'app_test_only'");
    await admin.end();

    const db = await createTestDatabase(ADMIN_URL!); // o papel já existe: a migração 0002 concede os privilégios
    const url = new URL(db.url);
    url.username = 'partyx_app';
    url.password = 'app_test_only';
    const app = new pgModule.default.Pool({ connectionString: url.toString(), max: 1 });
    try {
      await app.query("insert into promoters (name, coupon_code) values ('Duda', 'DUDA')");
      await app.query("update promoters set name = 'Duda M.' where coupon_code = 'DUDA'");
      await violates(app.query("delete from promoters where coupon_code = 'DUDA'"), '42501'); // sem DELETE
      await violates(app.query('drop table promoters'), '42501'); // não é dono
      await violates(app.query('create table intruso (id int)'), '42501');
      await violates(app.query("update audit_log set reason = 'x'"), '42501'); // auditoria só recebe inclusão
      await app.query("insert into login_attempts (email_normalized, succeeded) values ('a@b.com', false)");
      await app.query("delete from login_attempts where email_normalized = 'a@b.com'"); // dados temporários podem ser limpos
      // Evento sem uso sai com os tipos (0011); com pedido, o banco recusa, mesmo para a aplicação.
      const ev = async (slug: string) =>
        (
          await app.query(
            "insert into events (slug,name,starts_at,venue,address,description,age_rating) values ($1,'E',now()+interval '9 days','L','A','D','Livre') returning id",
            [slug],
          )
        ).rows[0].id as string;
      const typeOf = (id: string) =>
        app.query(
          "insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'Pista',100,10,now(),now()+interval '1 day')",
          [id],
        );
      const free = await ev('sem-uso');
      await typeOf(free);
      await app.query('delete from ticket_types where event_id = $1', [free]);
      await app.query('delete from events where id = $1', [free]);
      const used = await ev('com-pedido');
      await typeOf(used);
      const buyer = (
        await app.query(
          "insert into users (name,email,cpf,password_hash,role) values ('Ana Souza','ana-app@partyx.test','52998224725','x','cliente') returning id",
        )
      ).rows[0].id;
      await app.query('insert into orders (user_id,event_id,total_cents) values ($1,$2,100)', [buyer, used]);
      await violates(app.query('delete from ticket_types where event_id = $1', [used]), '23001');
      await violates(app.query('delete from events where id = $1', [used]), '23001');
      await violates(app.query('delete from orders where event_id = $1', [used]), '42501'); // histórico continua sem DELETE
    } finally {
      await app.end();
      await db.drop();
    }
  });
});

describe.skipIf(!ADMIN_URL)('reversão de migrações', () => {
  it('reverte na ordem inversa e recusa reverter fora de ordem', async () => {
    const { rollbackLastMigration } = await import('./migrate');
    const db = await createTestDatabase(ADMIN_URL!); // sem opção: a taxa fica como a migração 0017 grava (0%)
    try {
      const tag0 = '0000_schema_inicial';
      const tag1 = '0001_regras_de_integridade';
      const tag2 = '0002_permissoes_da_aplicacao';
      const tag3 = '0003_anonimizacao_lgpd';
      const tag4 = '0004_limites_globais';
      const tag5 = '0005_excecoes_pagamento';
      const tag6 = '0006_encerramento_do_evento';
      const tag7 = '0007_banner_responsivo';
      const tag8 = '0008_recusa_do_pagamento';
      const tag9 = '0009_menores_de_idade';
      const tag10 = '0010_sem_autorizacao_judicial';
      const tag11 = '0011_excluir_e_arquivar_evento';
      const tag12 = '0012_cronometro_do_evento';
      const tag13 = '0013_lotes_por_tipo';
      const tag14 = '0014_cor_de_destaque';
      const tag15 = '0015_capa_desfocada';
      const tag16 = '0016_transferencia_e_aceite_da_politica';
      const tag17 = '0017_taxa_de_servico';
      await expect(rollbackLastMigration(db.url, tag0)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag15)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag5)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag6)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag7)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag8)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag9)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag10)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag11)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag12)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag13)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag14)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag16)).rejects.toThrow(/não é a última/);

      // 0017: nasce com 0% e mínimo 0 (sem taxa até o painel gravar); recusa com pedido que tem taxa de serviço; sem ele, apaga a
      // configuração e as colunas, e o
      // pedido continua com o total.
      const q17 = db.pool.query.bind(db.pool);
      expect((await q17('select rate_bps, min_cents from service_fee_settings')).rows).toEqual([{ rate_bps: 0, min_cents: 0 }]);
      const u17 = (
        await q17("insert into users (name,email,cpf,password_hash,role) values ('Ana','ana17@partyx.test','52998224725','x','cliente') returning id")
      ).rows[0].id;
      const ev17 = (
        await q17("insert into events (slug,name,starts_at,venue,address,description,age_rating) values ('ev-17','E',now()+interval '9 days','L','A','D','Livre') returning id")
      ).rows[0].id;
      const o17 = (
        await q17('insert into orders (user_id,event_id,total_cents,service_fee_cents,service_fee_rate_bps) values ($1,$2,3158,158,500) returning id', [u17, ev17])
      ).rows[0].id;
      await expect(q17('update orders set service_fee_cents = 3158 where id = $1', [o17])).rejects.toThrow(/orders_service_fee_valid/);
      await expect(rollbackLastMigration(db.url, tag17)).rejects.toThrow(/pedidos com taxa de serviço/);
      await q17('update orders set service_fee_cents = 0 where id = $1', [o17]);
      await rollbackLastMigration(db.url, tag17);
      expect((await q17("select to_regclass('service_fee_settings') as t")).rows[0].t).toBeNull();
      expect(
        (await q17("select count(*)::int as n from information_schema.columns where column_name in ('service_fee_cents','unit_service_fee_cents','gateway_fee_cents','gateway_net_cents')")).rows[0].n,
      ).toBe(0);
      expect((await q17('select total_cents from orders where id = $1', [o17])).rows[0].total_cents).toBe(3158);
      await q17('alter table orders disable trigger orders_forbid_delete');
      await q17('delete from orders where id = $1', [o17]);
      await q17('alter table orders enable trigger orders_forbid_delete');
      await q17('delete from events where id = $1', [ev17]);
      await q17('delete from users where id = $1', [u17]).catch(async () => {
        await q17('alter table users disable trigger users_forbid_delete');
        await q17('delete from users where id = $1', [u17]);
        await q17('alter table users enable trigger users_forbid_delete');
      });

      // 0016: recusa com transferência gravada (quem é o titular de cada ingresso); sem ela, apaga as três tabelas e o titular do
      // ingresso, e o ingresso continua (do comprador, como antes).
      const q16 = db.pool.query.bind(db.pool);
      const u16 = (
        await q16("insert into users (name,email,cpf,password_hash,role) values ('Ana','ana16@partyx.test','52998224725','x','cliente') returning id")
      ).rows[0].id;
      const u16b = (
        await q16("insert into users (name,email,cpf,password_hash,role) values ('Bia','bia16@partyx.test','11144477735','x','cliente') returning id")
      ).rows[0].id;
      const ev16 = (
        await q16("insert into events (slug,name,starts_at,venue,address,description,age_rating) values ('ev-16','E',now()+interval '9 days','L','A','D','Livre') returning id")
      ).rows[0].id;
      const type16 = (
        await q16("insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'Pista',100,10,now(),now()+interval '1 day') returning id", [ev16])
      ).rows[0].id;
      const o16 = (await q16('insert into orders (user_id,event_id,total_cents) values ($1,$2,100) returning id', [u16, ev16])).rows[0].id;
      const i16 = (await q16('insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,1,100) returning id', [o16, ev16, type16])).rows[0].id;
      const t16 = (
        await q16(
          "insert into tickets (order_item_id,order_id,ticket_type_id,event_id,unit_index,holder_name,code,short_code,qr_payload) values ($1,$2,$3,$4,1,'Ana','abcdefghijklmnopqrstuvwx','PX-AAAA-BBBB','p') returning id",
          [i16, o16, type16, ev16],
        )
      ).rows[0].id;
      await q16(
        `insert into ticket_transfers (ticket_id,event_id,from_user_id,to_user_id,actor_id,old_short_code,new_short_code,old_code_sha256)
         values ($1,$2,$3,$4,$3,'PX-AAAA-BBBB','PX-CCCC-DDDD',$5)`,
        [t16, ev16, u16, u16b, 'f'.repeat(64)],
      );
      await expect(rollbackLastMigration(db.url, tag16)).rejects.toThrow(/transferências de ingresso gravadas/);
      await q16('alter table ticket_transfers disable trigger ticket_transfers_forbid_delete');
      await q16('delete from ticket_transfers');
      await rollbackLastMigration(db.url, tag16);
      expect(
        (await q16("select to_regclass('ticket_transfers') as a, to_regclass('cancellation_acceptances') as b, to_regclass('ticket_minor_acceptances') as c")).rows[0],
      ).toEqual({ a: null, b: null, c: null });
      expect(
        (await q16("select count(*)::int as n from information_schema.columns where table_name = 'tickets' and column_name in ('holder_user_id','holder_minor')")).rows[0].n,
      ).toBe(0);
      expect((await q16('select holder_name from tickets where id = $1', [t16])).rows[0].holder_name).toBe('Ana');
      await q16('alter table tickets disable trigger tickets_forbid_delete');
      await q16('delete from tickets where id = $1', [t16]);
      await q16('alter table tickets enable trigger tickets_forbid_delete');
      await q16('alter table order_items disable trigger order_items_forbid_delete');
      await q16('delete from order_items where id = $1', [i16]);
      await q16('alter table order_items enable trigger order_items_forbid_delete');
      await q16('alter table orders disable trigger orders_forbid_delete');
      await q16('delete from orders where id = $1', [o16]);
      await q16('alter table orders enable trigger orders_forbid_delete');
      await q16('alter table ticket_types disable trigger ticket_types_delete_only_unused');
      await q16('delete from ticket_types where id = $1', [type16]);
      await q16('alter table ticket_types enable trigger ticket_types_delete_only_unused');
      await q16('delete from events where id = $1', [ev16]);
      await q16('delete from users where id = any($1)', [[u16, u16b]]).catch(async () => {
        await q16('alter table users disable trigger users_forbid_delete');
        await q16('delete from users where id = any($1)', [[u16, u16b]]);
        await q16('alter table users enable trigger users_forbid_delete');
      });

      // 0015: só a coluna da miniatura da capa (e a regra dela); reverter a apaga, e o evento e a capa ficam.
      const ev15 = (
        await db.pool.query(
          "insert into events (slug,name,starts_at,venue,address,description,age_rating,banner_url,banner_placeholder) values ('ev-15','E',now()+interval '9 days','L','A','D','Livre','https://b.test/x.webp','data:image/webp;base64,AAAA') returning id",
        )
      ).rows[0].id;
      await rollbackLastMigration(db.url, tag15);
      expect(
        (await db.pool.query("select count(*)::int as n from information_schema.columns where table_name = 'events' and column_name = 'banner_placeholder'"))
          .rows[0].n,
      ).toBe(0);
      expect((await db.pool.query('select banner_url from events where id = $1', [ev15])).rows[0].banner_url).toBe('https://b.test/x.webp');
      await db.pool.query('delete from events where id = $1', [ev15]);

      // 0014: só a coluna da cor de destaque (e a regra do formato); reverter a apaga, e o evento continua (roxo da PartyX).
      const ev14 = (
        await db.pool.query(
          "insert into events (slug,name,starts_at,venue,address,description,age_rating,accent_color) values ('ev-14','E',now()+interval '9 days','L','A','D','Livre','#15803D') returning id",
        )
      ).rows[0].id;
      await rollbackLastMigration(db.url, tag14);
      expect(
        (await db.pool.query("select count(*)::int as n from information_schema.columns where table_name = 'events' and column_name = 'accent_color'"))
          .rows[0].n,
      ).toBe(0);
      expect((await db.pool.query('select count(*)::int as n from events where id = $1', [ev14])).rows[0].n).toBe(1);
      await db.pool.query('delete from events where id = $1', [ev14]);

      // 0013: recusa com tipo em mais de um lote; com só o "Lote único", apaga lotes, divisão dos pedidos e o lote do ingresso.
      const q13 = db.pool.query.bind(db.pool);
      const ev13 = (
        await q13(
          "insert into events (slug,name,starts_at,venue,address,description,age_rating) values ('ev-13','E',now()+interval '9 days','L','A','D','Livre') returning id",
        )
      ).rows[0].id;
      const type13 = (
        await q13(
          "insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'Pista',100,10,now(),now()+interval '1 day') returning id",
          [ev13],
        )
      ).rows[0].id;
      await q13(
        "insert into ticket_lots (ticket_type_id,event_id,position,name,price_cents,quantity,status) values ($1,$2,1,'1º lote',100,5,'a_venda'), ($1,$2,2,'2º lote',150,5,'aguardando')",
        [type13, ev13],
      );
      await expect(rollbackLastMigration(db.url, tag13)).rejects.toThrow(/mais de um lote/);
      await q13("delete from ticket_lots where name = '2º lote'");
      await rollbackLastMigration(db.url, tag13);
      expect((await q13("select to_regclass('ticket_lots') as a, to_regclass('order_item_lots') as b")).rows[0]).toEqual({
        a: null,
        b: null,
      });
      expect(
        (await q13("select count(*)::int as n from information_schema.columns where table_name = 'tickets' and column_name = 'lot_id'"))
          .rows[0].n,
      ).toBe(0);
      await q13('alter table ticket_types disable trigger ticket_types_delete_only_unused');
      await q13('delete from ticket_types where id = $1', [type13]);
      await q13('alter table ticket_types enable trigger ticket_types_delete_only_unused');
      await q13('delete from events where id = $1', [ev13]);

      // 0012: só as colunas do cronômetro (e a regra da frase); reverter as apaga.
      const countdownColumns = async () =>
        (
          await db.pool.query(
            "select count(*)::int as n from information_schema.columns where table_name = 'events' and column_name in ('countdown_enabled','countdown_phrase')",
          )
        ).rows[0].n;
      expect(await countdownColumns()).toBe(2);
      await rollbackLastMigration(db.url, tag12);
      expect(await countdownColumns()).toBe(0);

      // 0011: recusa enquanto houver evento arquivado (voltaria para a vitrine); sem ele, apaga a coluna e volta a recusar QUALQUER
      // exclusão de evento e de tipo (gatilhos da 0001).
      const q11 = db.pool.query.bind(db.pool);
      const ev11 = (
        await q11(
          "insert into events (slug,name,starts_at,venue,address,description,age_rating,archived_at) values ('ev-11','E',now()+interval '9 days','L','A','D','16 anos',now()) returning id",
        )
      ).rows[0].id;
      await q11(
        "insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'Pista',100,10,now(),now()+interval '1 day')",
        [ev11],
      );
      await expect(rollbackLastMigration(db.url, tag11)).rejects.toThrow(/arquivados/);
      await q11("update events set archived_at = null where slug = 'ev-11'");
      await rollbackLastMigration(db.url, tag11);
      const archivedColumn = (
        await q11("select count(*)::int as n from information_schema.columns where table_name = 'events' and column_name = 'archived_at'")
      ).rows[0].n;
      expect(archivedColumn).toBe(0);
      await expect(q11('delete from ticket_types where event_id = $1', [ev11])).rejects.toMatchObject({ code: '23000' });
      await expect(q11('delete from events where id = $1', [ev11])).rejects.toMatchObject({ code: '23000' });
      await q11('alter table ticket_types disable trigger ticket_types_forbid_delete');
      await q11('delete from ticket_types where event_id = $1', [ev11]);
      await q11('alter table ticket_types enable trigger ticket_types_forbid_delete');
      await q11('alter table events disable trigger events_forbid_delete');
      await q11('delete from events where id = $1', [ev11]);
      await q11('alter table events enable trigger events_forbid_delete');

      // 0010: recusa enquanto houver evento com menores sem o número (a regra antiga não aceitaria); sem ele, volta a exigir.
      const q10 = db.pool.query.bind(db.pool);
      await q10(
        "insert into events (slug,name,starts_at,ends_at,venue,address,description,age_rating,allows_minors) values ('ev-10','E',now()+interval '9 days',now()+interval '10 days','L','A','D','16 anos',true)",
      );
      await expect(rollbackLastMigration(db.url, tag10)).rejects.toThrow(/sem número de autorização judicial/);
      await q10("update events set judicial_authorization = 'Portaria 1/2026' where slug = 'ev-10'");
      await rollbackLastMigration(db.url, tag10);
      await expect(q10("update events set judicial_authorization = null where slug = 'ev-10'")).rejects.toMatchObject({
        code: '23514',
      });
      await q10('alter table events disable trigger events_forbid_delete');
      await q10("delete from events where slug = 'ev-10'");
      await q10('alter table events enable trigger events_forbid_delete');

      // 0009: recusa enquanto houver aceite do termo de menor (prova); sem prova, apaga a tabela e as colunas de menores.
      const q9 = db.pool.query.bind(db.pool);
      const u = (
        await q9(
          "insert into users (name,email,cpf,password_hash,role) values ('Ana Souza','ana9@partyx.test','52998224725','x','cliente') returning id",
        )
      ).rows[0].id;
      const ev = (
        await q9(
          "insert into events (slug,name,starts_at,venue,address,description,age_rating) values ('ev-9','E',now()+interval '9 days','L','A','D','16 anos') returning id",
        )
      ).rows[0].id;
      const o = (await q9('insert into orders (user_id,event_id,total_cents) values ($1,$2,100) returning id', [u, ev]))
        .rows[0].id;
      await q9(
        "insert into minor_term_acceptances (user_id,order_id,term_version,age_at_event) values ($1,$2,'1.0',16)",
        [u, o],
      );
      await expect(rollbackLastMigration(db.url, tag9)).rejects.toThrow(/termo de menor/);
      await q9('alter table minor_term_acceptances disable trigger minor_term_acceptances_forbid_delete');
      await q9('delete from minor_term_acceptances');
      await q9('alter table minor_term_acceptances enable trigger minor_term_acceptances_forbid_delete');
      await q9('alter table orders disable trigger orders_forbid_delete');
      await q9('delete from orders');
      await q9('alter table orders enable trigger orders_forbid_delete');
      await q9('alter table events disable trigger events_forbid_delete');
      await q9('delete from events');
      await q9('alter table events enable trigger events_forbid_delete');
      await q9('alter table users disable trigger users_forbid_delete');
      await q9('delete from users');
      await q9('alter table users enable trigger users_forbid_delete');
      await rollbackLastMigration(db.url, tag9);
      const minorColumns = (
        await q9(
          "select count(*)::int as n from information_schema.columns where (table_name, column_name) in (('users','birth_date'),('events','allows_minors'),('orders','buyer_minor'),('checkins','minor_authorization_received'))",
        )
      ).rows[0].n;
      expect(minorColumns).toBe(0);
      expect((await q9("select to_regclass('minor_term_acceptances') as t")).rows[0].t).toBeNull();

      // 0008: só as três colunas da recusa e da tentativa de cobrança em orders; reverter as apaga.
      const declineColumns = async () =>
        (
          await db.pool.query(
            "select count(*)::int as n from information_schema.columns where table_name = 'orders' and column_name in ('gateway_status_detail','decline_reason','payment_attempt')",
          )
        ).rows[0].n;
      expect(await declineColumns()).toBe(3);
      await rollbackLastMigration(db.url, tag8);
      expect(await declineColumns()).toBe(0);

      // 0007: só a coluna das larguras do banner; reverter a apaga e o banner continua pela banner_url.
      const widthsColumn = async () =>
        (
          await db.pool.query(
            "select count(*)::int as n from information_schema.columns where table_name = 'events' and column_name = 'banner_widths'",
          )
        ).rows[0].n;
      expect(await widthsColumn()).toBe(1);
      await rollbackLastMigration(db.url, tag7);
      expect(await widthsColumn()).toBe(0);

      // 0006: preenche closed_at dos encerrados a partir da trilha (ou de updated_at), sem mexer em updated_at.
      await rollbackLastMigration(db.url, tag6);
      const evs = await db.pool.query(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values
           ('com-trilha','Com Trilha','2026-12-12T22:00:00-03:00','A','R','d','Livre','encerrado'),
           ('sem-trilha','Sem Trilha','2026-12-12T22:00:00-03:00','A','R','d','Livre','encerrado'),
           ('publicado','Publicado','2026-12-12T22:00:00-03:00','A','R','d','Livre','publicado')
         returning id, slug, updated_at`,
      );
      const byslug = Object.fromEntries(evs.rows.map(r => [r.slug, r]));
      await db.pool.query(
        "insert into audit_log (action, entity, entity_id, created_at) values ('evento.encerrar', 'event', $1, '2026-12-13T02:00:00Z'), ('evento.encerrar', 'event', $1, '2026-12-13T03:00:00Z')",
        [byslug['com-trilha'].id],
      );
      const { runMigrations: reapply } = await import('./migrate');
      await reapply(db.url);
      const after = Object.fromEntries(
        (await db.pool.query('select slug, closed_at, updated_at from events')).rows.map(r => [r.slug, r]),
      );
      expect(new Date(after['com-trilha'].closed_at).toISOString()).toBe('2026-12-13T02:00:00.000Z'); // o primeiro registro
      expect(new Date(after['sem-trilha'].closed_at).getTime()).toBe(
        new Date(byslug['sem-trilha'].updated_at).getTime(),
      );
      expect(after.publicado.closed_at).toBeNull();
      for (const slug of ['com-trilha', 'sem-trilha', 'publicado'])
        expect(new Date(after[slug].updated_at).getTime(), slug).toBe(new Date(byslug[slug].updated_at).getTime());
      const trig = await db.pool.query("select tgenabled from pg_trigger where tgname = 'events_set_updated_at'");
      expect(trig.rows[0].tgenabled).toBe('O'); // gatilho religado
      expect(await widthsColumn()).toBe(1); // a reaplicação trouxe da 0007 à 0017 de volta: elas saem antes da 0006
      expect(await declineColumns()).toBe(3);
      await rollbackLastMigration(db.url, tag17);
      await rollbackLastMigration(db.url, tag16);
      await rollbackLastMigration(db.url, tag15);
      await rollbackLastMigration(db.url, tag14);
      await rollbackLastMigration(db.url, tag13);
      await rollbackLastMigration(db.url, tag12);
      await rollbackLastMigration(db.url, tag11);
      await rollbackLastMigration(db.url, tag10);
      await rollbackLastMigration(db.url, tag9);
      await rollbackLastMigration(db.url, tag8);
      await rollbackLastMigration(db.url, tag7);
      await rollbackLastMigration(db.url, tag6);
      expect(
        (
          await db.pool.query(
            "select count(*)::int as n from information_schema.columns where table_name = 'events' and column_name = 'closed_at'",
          )
        ).rows[0].n,
      ).toBe(0);

      // 0005 recusa reverter se já houver aviso de pagamento sem estoque (perderia o registro de que os administradores foram avisados).
      const admin = (
        await db.pool.query(
          "insert into users (name,email,password_hash,role) values ('Adm','adm@x.test','h','administrador') returning id",
        )
      ).rows[0].id;
      await db.pool.query(
        "insert into email_log (user_id, template, idempotency_key) values ($1, 'pagamento_sem_estoque', 'sem_estoque:x')",
        [admin],
      );
      await expect(rollbackLastMigration(db.url, tag5)).rejects.toThrow(/perderia esse registro/);
      await db.pool.query('delete from email_log');
      await db.pool.query(
        "insert into email_log (user_id, template, idempotency_key) values ($1, 'cadastro', 'cadastro:x')",
        [admin],
      );
      await rollbackLastMigration(db.url, tag5);
      expect(
        (
          await db.pool.query(
            "select count(*)::int as n from information_schema.tables where table_name = 'job_leases'",
          )
        ).rows[0].n,
      ).toBe(0);
      const values = (await db.pool.query('select unnest(enum_range(null::email_template))::text as v')).rows.map(
        r => r.v,
      );
      expect(values).toEqual(['cadastro', 'recuperacao_senha', 'compra_confirmada']);
      expect((await db.pool.query('select template::text as t from email_log')).rows).toEqual([{ t: 'cadastro' }]); // dado preservado
      await db.pool.query('delete from email_log');

      await expect(rollbackLastMigration(db.url, tag1)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag2)).rejects.toThrow(/não é a última/);
      await expect(rollbackLastMigration(db.url, tag3)).rejects.toThrow(/não é a última/);
      await rollbackLastMigration(db.url, tag4);
      expect(
        (
          await db.pool.query(
            "select count(*)::int as n from information_schema.tables where table_name = 'global_limit_counters'",
          )
        ).rows[0].n,
      ).toBe(0);
      await rollbackLastMigration(db.url, tag3);
      await rollbackLastMigration(db.url, tag2);
      await rollbackLastMigration(db.url, tag1);
      let r = await db.pool.query(
        "select count(*)::int as n from pg_trigger where tgname = 'orders_paid_at_immutable'",
      );
      expect(r.rows[0].n).toBe(0);

      await rollbackLastMigration(db.url, tag0);
      r = await db.pool.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
      expect(r.rows[0].n).toBe(0);

      // e volta a aplicar tudo
      const { runMigrations } = await import('./migrate');
      await runMigrations(db.url);
      r = await db.pool.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
      expect(r.rows[0].n).toBe(25); // 18 até a 0008 + minor_term_acceptances (0009) + ticket_lots e order_item_lots (0013) + as três da 0016 + service_fee_settings (0017)
    } finally {
      await db.drop();
    }
  });
});
