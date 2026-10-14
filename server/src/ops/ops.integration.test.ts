import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { argon2Hasher } from '../providers/passwordHasher';
import { issueForOrder } from '../tickets/issuer';
import { buildClosureExport, CLOSURE_SPECS } from './closureExport';
import { feeStatement, previousMonth, renderFeeStatement } from './feeStatement';
import { renderWeeklyReview, weeklyReview } from './weeklyReview';

const ADMIN_URL = process.env.TEST_DATABASE_URL;

describe('previousMonth (função pura)', () => {
  it('mês anterior no fuso do evento, inclusive virada de ano e de fuso', () => {
    expect(previousMonth(new Date('2026-10-05T12:00:00Z'))).toBe('2026-09');
    expect(previousMonth(new Date('2026-01-03T12:00:00Z'))).toBe('2025-12');
    // 01/10 02:00 UTC ainda é 30/09 23:00 em Brasília: o mês corrente é setembro, o anterior é agosto.
    expect(previousMonth(new Date('2026-10-01T02:00:00Z'))).toBe('2026-08');
    expect(previousMonth(new Date('2026-10-01T04:00:00Z'))).toBe('2026-09');
  });
});

describe.skipIf(!ADMIN_URL)('rotinas de operação (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const config = loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none' });
  let db: ReturnType<typeof createDrizzle>;
  let hash = '';
  let n = 0;

  async function seedEvent(name?: string) {
    const ev = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values ($1,$2,'2026-12-12T22:00:00-03:00','Arena','Rua 1','d','Livre','publicado') returning id`,
        [`evento-${++n}`, name ?? `Evento ${n}`],
      )
    ).rows[0].id as string;
    const type = (
      await sql(
        `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,'Pista',8000,500,'2026-08-01T00:00:00-03:00','2026-12-12T20:00:00-03:00') returning id`,
        [ev],
      )
    ).rows[0].id as string;
    return { ev, type };
  }
  /** Pedido pago com ingressos emitidos; `paidAt` fixa o mês da taxa. */
  async function paidOrder(e: { ev: string; type: string }, qty: number, paidAt: string, status = 'pago', issue = true) {
    const u = (
      await sql("insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,'cliente') returning id", [
        `Cliente ${++n} Teste`,
        `c${n}@partyx.test`,
        String(60000000000 + n),
        hash,
      ])
    ).rows[0].id as string;
    const o = (
      await sql(
        "insert into orders (user_id,event_id,total_cents,status,paid_at,payment_method) values ($1,$2,$3,$4,$5,'pix') returning id",
        [u, e.ev, qty * 8000, status, paidAt],
      )
    ).rows[0].id as string;
    const item = (
      await sql('insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,$4,8000) returning id', [o, e.ev, e.type, qty])
    ).rows[0].id as string;
    if (status !== 'pago_sem_estoque' && issue)
      await db.transaction(tx =>
        issueForOrder(tx, config.qr, { id: o, userId: u, eventId: e.ev, items: [{ orderItemId: item, ticketTypeId: e.type, quantity: qty }] }),
      );
    return { o, u };
  }

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    db = createDrizzle(testDb.pool);
    hash = await argon2Hasher.hash('senha-que-nao-pode-vazar');
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql('truncate payment_events, email_log, checkins, tickets, reservations, order_items, orders, ticket_types, events, audit_log, consents, sessions, login_attempts, users cascade');
  });

  describe('extrato mensal da taxa', () => {
    it('conta todos os ingressos do mês, inclusive cancelados e estornados, e respeita a virada de mês no fuso', async () => {
      const e = await seedEvent();
      await paidOrder(e, 2, '2026-09-10T15:00:00Z'); // setembro, segue pago
      const refunded = await paidOrder(e, 3, '2026-09-20T15:00:00Z', 'estornado'); // setembro, estornado
      await sql("update tickets set status = 'cancelado', cancelled_at = now() where order_id = $1", [refunded.o]);
      await paidOrder(e, 1, '2026-10-01T02:30:00Z'); // 30/09 23:30 em Brasília: ainda é setembro
      await paidOrder(e, 4, '2026-10-01T03:30:00Z'); // 01/10 00:30 em Brasília: outubro
      const s = await feeStatement(db, '2026-09');
      expect(s).toMatchObject({ units: 6, feeCents: 600, orders: 3 });
      expect(s.reconciliation.ok).toBe(true);
      expect((await feeStatement(db, '2026-10')).units).toBe(4);
      const text = renderFeeStatement(s, { generatedAt: new Date('2026-10-05T12:00:00Z'), monthlyFeeCents: 15000 });
      expect(text).toContain('não é boleto nem cobrança');
      expect(text).toContain('**R$ 6,00**');
      expect(text).toContain('R$ 156,00'); // 150,00 + 6,00
      expect(text).toContain('**Confere.**');
      expect(text).not.toMatch(/@partyx\.test/); // sem dado pessoal
    });

    it('sem mensalidade informada, não inventa o valor; pagamento sem estoque é exceção e não entra', async () => {
      const e = await seedEvent();
      await paidOrder(e, 2, '2026-09-10T15:00:00Z');
      await paidOrder(e, 1, '2026-09-11T15:00:00Z', 'pago_sem_estoque');
      const s = await feeStatement(db, '2026-09');
      expect(s.units).toBe(2);
      expect(s.exceptions.paidWithoutStock).toHaveLength(1);
      const text = renderFeeStatement(s, { generatedAt: new Date('2026-10-05T12:00:00Z') });
      expect(text).toContain('não informada');
      expect(text).toContain('pagas sem estoque');
    });

    it('conciliação acusa pedido pago sem ingressos que não é "pago sem estoque"', async () => {
      const e = await seedEvent();
      await paidOrder(e, 2, '2026-09-10T15:00:00Z');
      await paidOrder(e, 3, '2026-09-12T15:00:00Z', 'pago', false); // aprovado, mas os ingressos nunca foram emitidos
      const s = await feeStatement(db, '2026-09');
      expect(s.reconciliation.ok).toBe(false);
      expect(renderFeeStatement(s, { generatedAt: new Date() })).toContain('NÃO CONFERE');
    });

    it('mês sem vendas gera extrato zerado, sem erro', async () => {
      const s = await feeStatement(db, '2026-01');
      expect(s).toMatchObject({ units: 0, feeCents: 0 });
      expect(renderFeeStatement(s, { generatedAt: new Date() })).toContain('(nenhum)');
    });
  });

  describe('revisão semanal', () => {
    const now = new Date('2026-10-12T12:00:00Z');

    it('banco saudável: nada exige atenção', async () => {
      const e = await seedEvent();
      await paidOrder(e, 1, '2026-10-10T15:00:00Z');
      const r = await weeklyReview(db, now);
      expect(r.attention).toEqual([]);
      expect(renderWeeklyReview(r)).toContain('Nada exige atenção');
    });

    it('acusa webhook pendente e desistido, e-mail com falha, pago sem estoque, divergência, pedido parado e reserva zumbi', async () => {
      const e = await seedEvent();
      const stuck = await paidOrder(e, 1, '2026-10-01T15:00:00Z', 'pago_sem_estoque');
      await sql("insert into payment_events (gateway_event_id, signature_valid, type, payload_json, attempts) values ('a', true, 'payment.updated', '{}', 1), ('b', true, 'payment.updated', '{}', 10), (null, false, 'invalido', '{}', 0)");
      await sql("insert into email_log (user_id, template, status, idempotency_key, last_error) values ($1, 'compra_confirmada', 'falhou', 'k1', 'timeout'), ($1, 'cadastro', 'pendente', 'k2', null)", [stuck.u]);
      await sql("insert into audit_log (action, entity, entity_id) values ('pagamento.divergente','order',$1), ('pagamento.estorno_fora_de_fluxo','order',$1)", [stuck.o]);
      const old = (await sql("insert into orders (user_id,event_id,total_cents,status,created_at) values ($1,$2,8000,'pendente','2026-10-10T00:00:00Z') returning id", [stuck.u, e.ev])).rows[0].id;
      await sql('insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,1,8000)', [old, e.ev, e.type]);
      await sql("insert into reservations (order_id, ticket_type_id, quantity, expires_at, status) values ($1,$2,1,'2026-10-11T00:00:00Z','ativa')", [old, e.type]);
      const r = await weeklyReview(db, now);
      expect(r.webhooks).toMatchObject({ pending: 1, abandoned: 1, invalidSignatures: 1 });
      expect(r.emails).toMatchObject({ pending: 1, failed: 1 });
      expect(r.orders).toMatchObject({ divergences: 1, reversalsOutsideFlow: 1, pendingTooLong: 1 });
      expect(r.orders.paidWithoutStock).toHaveLength(1);
      expect(r.reservationsActiveButExpired).toBe(1);
      expect(r.attention.length).toBe(9);
      const text = renderWeeklyReview(r);
      expect(text).not.toMatch(/@partyx\.test|Cliente \d+ Teste/);
    });
  });

  describe('exportação de encerramento', () => {
    it('exporta os dados do negócio, neutraliza fórmulas e nunca leva segredos', async () => {
      const e = await seedEvent('=HYPERLINK("http://x")');
      const buyer = await paidOrder(e, 2, '2026-09-10T15:00:00Z');
      await sql("insert into sessions (user_id, token_hash, csrf_token, expires_at) values ($1,'hash-de-sessao-secreto','csrf-secreto', now() + interval '1 day')", [buyer.u]).catch(() => undefined);
      await sql("insert into payment_events (gateway_event_id, signature_valid, type, payload_json) values ('e1', true, 'payment.updated', '{\"segredo\":\"corpo-do-gateway-secreto\"}')");
      const secrets = (await sql('select code, qr_payload from tickets')).rows as { code: string; qr_payload: string }[];
      const files = await buildClosureExport(db);
      expect(files.map(f => f.name)).toEqual([
        'eventos.csv', 'tipos-de-ingresso.csv', 'promoters.csv', 'usuarios.csv', 'aceites.csv', 'aceites-termo-de-menor.csv', 'pedidos.csv',
        'itens-dos-pedidos.csv', 'ingressos.csv', 'entradas-na-portaria.csv', 'trilha-de-auditoria.csv',
      ]);
      const all = files.map(f => f.content).join('\n');
      expect(all).not.toContain(hash);
      expect(all).not.toContain('senha-que-nao-pode-vazar');
      expect(all).not.toContain('hash-de-sessao-secreto');
      expect(all).not.toContain('csrf-secreto');
      expect(all).not.toContain('corpo-do-gateway-secreto');
      for (const s of secrets) {
        expect(all).not.toContain(s.code);
        expect(all).not.toContain(s.qr_payload);
      }
      for (const f of files) {
        expect(f.content.startsWith('﻿')).toBe(true); // BOM do Excel
        expect(f.content.split('\n')[0]).not.toMatch(/senha|password|hash|segredo|token/i);
      }
      const by = (name: string) => files.find(f => f.name === name)!;
      expect(by('eventos.csv').content).toContain("'=HYPERLINK"); // fórmula neutralizada
      expect(by('ingressos.csv').rows).toBe(2);
      expect(by('pedidos.csv').rows).toBe(1);
      expect(by('usuarios.csv').content).toContain('@partyx.test');
      // Toda tabela do esquema exportada tem as colunas listadas à mão (nada de select *).
      for (const spec of CLOSURE_SPECS) expect(spec.columns.some(c => /password|hash|token|qr_payload/.test(c.sql) || c.sql === 'code')).toBe(false);
    });

    it('banco vazio gera arquivos só com o cabeçalho', async () => {
      const files = await buildClosureExport(db);
      expect(files.every(f => f.rows === 0)).toBe(true);
    });
  });
});
