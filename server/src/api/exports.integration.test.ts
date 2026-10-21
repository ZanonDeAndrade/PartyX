import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { createTicketIssuer, issueForOrder } from '../tickets/issuer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'festa2026';

describe.skipIf(!ADMIN_URL)('exportações e contingência (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const clock = createFakeClock('2026-12-12T15:00:00Z'); // 12:00 em Brasília
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const config = loadConfig({ APP_ENV: 'local', PAYMENT_GATEWAY: 'none' });
  let app: ReturnType<typeof createApp>;
  let hash = '';
  let n = 0;

  type Role = 'cliente' | 'validador' | 'administrador';
  async function session(role: Role = 'administrador', name?: string) {
    const i = ++n;
    const email = `${role}${i}@partyx.test`;
    const id = (
      await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5) returning id', [
        name ?? `Pessoa ${role} ${i}`,
        email,
        role === 'cliente' ? String(60000000000 + i) : null,
        hash,
        role,
      ])
    ).rows[0].id as string;
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
    const login = await raw('POST', '/auth/login', { email, password: PASSWORD });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await (await raw('GET', '/auth/me')).json()) as { csrfToken: string }).csrfToken;
    return {
      id,
      email,
      raw,
      get: (p: string) => raw('GET', p),
      post: (p: string, b: unknown = {}) => raw('POST', p, b),
    };
  }
  const json = async <T = any>(res: Response) => (await res.json()) as T;

  async function event(name = 'Noite Neon Verão', status = 'publicado', caps: { Pista?: number; VIP?: number } = {}) {
    const id = (
      await sql(
        `insert into events (slug,name,starts_at,venue,address,description,age_rating,status) values ($1,$2,'2026-12-20T22:00:00-03:00','Arena','Rua 1','d','Livre',$3) returning id`,
        [`evento-${++n}`, name, status],
      )
    ).rows[0].id as string;
    const mk = async (tname: string, price: number, total: number) =>
      (
        await sql(
          `insert into ticket_types (event_id,name,price_cents,quantity_total,sales_start_at,sales_end_at) values ($1,$2,$3,$4,'2026-10-01T00:00:00-03:00','2026-12-20T20:00:00-03:00') returning id`,
          [id, tname, price, total],
        )
      ).rows[0].id as string;
    return {
      id,
      name,
      types: { Pista: await mk('Pista', 8000, caps.Pista ?? 100), VIP: await mk('VIP', 20000, caps.VIP ?? 50) },
    };
  }

  /** Pedido direto no banco, no estado e na data pedidos, com ingressos pelo emissor de verdade quando pago. */
  async function order(
    e: Awaited<ReturnType<typeof event>>,
    o: {
      buyer?: { name?: string; email?: string; cpf?: string };
      status?: string;
      paidAt?: string | null;
      createdAt?: string;
      items?: [keyof typeof e.types, number][];
      coupon?: string;
    } = {},
  ) {
    const i = ++n;
    const name = o.buyer?.name ?? 'Marina Costa';
    const email = o.buyer?.email ?? `comprador${i}@partyx.test`;
    const userId = (
      await sql('insert into users (name,email,cpf,password_hash,role) values ($1,$2,$3,$4,$5) returning id', [
        name,
        email,
        o.buyer?.cpf ?? String(70000000000 + i),
        hash,
        'cliente',
      ])
    ).rows[0].id as string;
    const items = o.items ?? [['Pista', 2]];
    const prices = { Pista: 8000, VIP: 20000 };
    const total = items.reduce((t, [k, q]) => t + q * prices[k], 0);
    const status = o.status ?? 'pago';
    const paidAt =
      status === 'pendente' || status === 'expirado' || status === 'nao_concluido'
        ? null
        : (o.paidAt ?? '2026-12-12T15:00:00Z');
    let promoterId: string | null = null;
    if (o.coupon)
      promoterId = (
        await sql(
          "insert into promoters (name, coupon_code) values ('Promoter', $1) on conflict (coupon_code) do update set name = excluded.name returning id",
          [o.coupon],
        )
      ).rows[0].id;
    const orderId = (
      await sql(
        `insert into orders (user_id,event_id,total_cents,status,paid_at,payment_method,created_at,promoter_id,gateway_payment_id) values ($1,$2,$3,$4,$5,'pix',$6,$7,$8) returning id`,
        [userId, e.id, total, status, paidAt, o.createdAt ?? paidAt ?? '2026-12-12T14:00:00Z', promoterId, `gw_${i}`],
      )
    ).rows[0].id as string;
    const orderItems: { orderItemId: string; ticketTypeId: string; quantity: number }[] = [];
    for (const [k, q] of items) {
      const itemId = (
        await sql(
          `insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,$4,$5) returning id`,
          [orderId, e.id, e.types[k], q, prices[k]],
        )
      ).rows[0].id as string;
      orderItems.push({ orderItemId: itemId, ticketTypeId: e.types[k], quantity: q });
    }
    if (status === 'pago' || status === 'estornado' || status === 'contestado') {
      await createDrizzle(testDb.pool).transaction(tx =>
        issueForOrder(tx, config.qr, { id: orderId, userId, eventId: e.id, items: orderItems }),
      );
      if (status !== 'pago')
        await sql(
          "update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'estorno' where order_id = $1",
          [orderId],
        );
      await sql('update ticket_types set quantity_sold = quantity_sold + $2 where id = $1', [
        orderItems[0]!.ticketTypeId,
        items.reduce((t, [, q]) => t + q, 0),
      ]);
    }
    const tix = (
      await sql(
        'select t.id, t.short_code, t.qr_payload from tickets t join ticket_types y on y.id = t.ticket_type_id where t.order_id = $1 order by y.name, t.unit_index',
        [orderId],
      )
    ).rows as { id: string; short_code: string; qr_payload: string }[];
    return { id: orderId, userId, email, name, tickets: tix, total };
  }

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    hash = await argon2Hasher.hash(PASSWORD);
    app = createApp({
      config,
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender() },
      issueTickets: createTicketIssuer(config.qr),
    });
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql(
      'truncate payment_events, checkins, tickets, reservations, order_items, orders, ticket_types, events, promoters, email_log, audit_log, sessions, login_attempts, users cascade',
    );
    await sql('alter sequence order_number_seq restart with 10001');
    clock.set('2026-12-12T15:00:00Z');
  });

  /** Lê o CSV como o Excel leria: sem BOM, separador ";", aspas duplicadas. */
  const parseCsv = (text: string): string[][] => {
    const body = text.replace(/^﻿/, '');
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i]!;
      if (quoted) {
        if (ch === '"' && body[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ';') {
        row.push(cell);
        cell = '';
      } else if (ch === '\r') {
        /* CRLF */
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else cell += ch;
    }
    return rows;
  };
  const pdfText = (buf: Buffer) => {
    const dir = mkdtempSync(join(tmpdir(), 'px-pdf-'));
    const file = join(dir, 'a.pdf');
    writeFileSync(file, buf);
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  };

  describe('acesso e cabeçalhos', () => {
    it('só administrador: visitante 401, cliente e validador 403, em todas as rotas', async () => {
      const e = await event();
      await order(e);
      const client = await session('cliente');
      const staff = await session('validador');
      const paths = [
        '/admin/exports/orders.csv',
        `/admin/exports/events/${e.id}/tickets.csv`,
        `/admin/exports/events/${e.id}/buyers.csv`,
        '/admin/exports/sales.csv',
        '/admin/exports/promoters.csv',
        '/admin/exports/fee.csv',
        `/admin/exports/events/${e.id}/contingency.csv`,
        `/admin/exports/events/${e.id}/contingency.pdf`,
      ];
      for (const p of paths) {
        const anon = await app.request(`/api${p}`, { headers: { origin: 'http://localhost' } });
        expect([p, anon.status]).toEqual([p, 401]);
        expect([p, (await client.get(p)).status]).toEqual([p, 403]);
        expect([p, (await staff.get(p)).status]).toEqual([p, 403]);
      }
      expect((await sql("select count(*)::int as n from audit_log where action like 'exportacao.%'")).rows[0].n).toBe(
        0,
      );
    });

    it('arquivo para baixar, sem cache, nunca exibido no navegador', async () => {
      const e = await event();
      await order(e);
      const adm = await session();
      const csv = await adm.get('/admin/exports/orders.csv');
      expect(csv.status).toBe(200);
      expect(csv.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      expect(csv.headers.get('cache-control')).toBe('private, no-store');
      expect(csv.headers.get('x-content-type-options')).toBe('nosniff');
      expect(csv.headers.get('content-disposition')).toMatch(
        /^attachment; filename="pedidos[a-z0-9_-]*\.csv"; filename\*=UTF-8''/,
      );
      const pdf = await adm.get(`/admin/exports/events/${e.id}/contingency.pdf`);
      expect(pdf.headers.get('content-type')).toBe('application/pdf');
      expect(pdf.headers.get('content-disposition')).toMatch(/^attachment; filename="contingencia[-_]/);
      expect(pdf.headers.get('cache-control')).toBe('private, no-store');
    });

    it('filtro inválido é 422 e id de evento inexistente é 404', async () => {
      const adm = await session();
      expect((await adm.get('/admin/exports/orders.csv?status=qualquer')).status).toBe(422);
      expect((await adm.get('/admin/exports/events/nao-e-uuid/tickets.csv')).status).toBe(404);
      expect((await adm.get('/admin/exports/events/00000000-0000-4000-8000-000000000000/contingency.pdf')).status).toBe(
        404,
      );
    });
  });

  describe('CSV', () => {
    it('abre no Excel: BOM, ponto e vírgula, CRLF, acentos preservados, valores com vírgula decimal', async () => {
      const e = await event('Noite São João – Édição Ção');
      await order(e, { buyer: { name: 'José d’Ávila Ñandú', email: 'jose@partyx.test' } });
      const adm = await session();
      const bytes = Buffer.from(await (await adm.get('/admin/exports/orders.csv')).arrayBuffer());
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const text = bytes.toString('utf8');
      expect(text).toContain('\r\n');
      expect(text).not.toMatch(/[^\r]\n/);
      const rows = parseCsv(text);
      expect(rows[0]![0]).toBe('Pedido');
      expect(rows[1]![3]).toBe('Noite São João – Édição Ção');
      expect(rows[1]![4]).toBe('José d’Ávila Ñandú');
      expect(rows[1]![12]).toBe('160,00');
      expect(rows[1]![5]).toMatch(/^\d{3}\.\*{3}\.\*{3}-\d{2}$|\*/);
      expect(rows[1]![5]).not.toMatch(/^\d{11}$/);
    });

    it('valores que começam com fórmula são neutralizados em todo campo de texto digitado pelo usuário', async () => {
      const e = await event('=HYPERLINK("http://x")');
      await order(e, { buyer: { name: "=cmd|' /C calc'!A0", email: '+1@partyx.test' } });
      await order(e, { buyer: { name: '@SUM(1+1)', email: 'a@partyx.test' } });
      await order(e, { buyer: { name: '-2+3', email: 'b@partyx.test' } });
      const adm = await session();
      for (const path of [
        '/admin/exports/orders.csv',
        `/admin/exports/events/${e.id}/buyers.csv`,
        `/admin/exports/events/${e.id}/tickets.csv`,
        `/admin/exports/events/${e.id}/contingency.csv`,
      ]) {
        const rows = parseCsv(await (await adm.get(path)).text());
        for (const r of rows)
          for (const cell of r) expect([path, cell]).not.toEqual([path, expect.stringMatching(/^[\s]*[=+@|]/)]);
        const neutralized = rows.flat().filter(c => /^'[=@+-]/.test(c));
        expect(neutralized.length).toBeGreaterThan(0);
      }
    });

    it('primeira célula nunca é "ID" (o Excel trataria como arquivo SYLK)', async () => {
      const e = await event();
      await order(e);
      const adm = await session();
      for (const path of [
        '/admin/exports/orders.csv',
        `/admin/exports/events/${e.id}/tickets.csv`,
        `/admin/exports/events/${e.id}/buyers.csv`,
        '/admin/exports/sales.csv',
        '/admin/exports/promoters.csv',
        '/admin/exports/fee.csv',
        `/admin/exports/events/${e.id}/contingency.csv`,
      ])
        expect([path, (await (await adm.get(path)).text()).replace(/^﻿/, '').startsWith('ID')]).toEqual([path, false]);
    });

    it('filtros e totais batem com a tela: pedidos', async () => {
      const a = await event('Evento A');
      const b = await event('Evento B');
      await order(a); // 160,00
      await order(a, { items: [['VIP', 1]] }); // 200,00
      await order(a, { status: 'pendente' });
      await order(b);
      const adm = await session();
      for (const qs of [
        '',
        `?eventId=${a.id}`,
        `?eventId=${a.id}&status=pago`,
        '?status=pendente',
        '?from=2026-12-13',
      ]) {
        const screen = await json(await adm.get(`/admin/orders${qs ? qs + '&' : '?'}pageSize=100`));
        const rows = parseCsv(await (await adm.get(`/admin/exports/orders.csv${qs}`)).text());
        const data = rows.slice(1, 1 + screen.total);
        expect([qs, data.length]).toEqual([qs, screen.total]);
        expect(data.map(r => r[0]).sort()).toEqual(screen.orders.map((o: any) => `PX-${o.number}`).sort());
        const footer = Object.fromEntries(rows.slice(1 + screen.total + 1).map(r => [r[0], r[1]]));
        expect(footer['Total de pedidos listados']).toBe(String(screen.total));
        const paidSum = screen.orders
          .filter((o: any) => o.status === 'pago')
          .reduce((t: number, o: any) => t + o.totalCents, 0);
        expect(footer['Soma dos pedidos com situação Pago (R$)']).toBe((paidSum / 100).toFixed(2).replace('.', ','));
      }
    });

    it('ingressos: filtro por situação e totais por situação', async () => {
      const e = await event();
      const o = await order(e, { items: [['Pista', 3]] });
      const validator = await session('validador');
      await sql("update tickets set status = 'utilizado', used_at = now(), validated_by = $2 where id = $1", [
        o.tickets[0]!.id,
        validator.id,
      ]);
      await sql(
        "update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'teste' where id = $1",
        [o.tickets[1]!.id],
      );
      const adm = await session();
      const all = parseCsv(await (await adm.get(`/admin/exports/events/${e.id}/tickets.csv`)).text());
      expect(all.slice(1, 4)).toHaveLength(3);
      const footer = Object.fromEntries(all.slice(5).map(r => [r[0], r[1]]));
      expect(footer['Total de ingressos listados']).toBe('3');
      expect([footer['Válidos'], footer['Utilizados'], footer['Cancelados']]).toEqual(['1', '1', '1']);
      const used = parseCsv(await (await adm.get(`/admin/exports/events/${e.id}/tickets.csv?status=utilizado`)).text());
      expect(used[1]![0]).toBe(o.tickets[0]!.short_code);
      expect(used[1]![7]).not.toBe('');
      expect(used[2]![0]).toBe('');
    });

    it('relatórios: vendas, promoters e taxa exportam os mesmos números da tela', async () => {
      const e = await event();
      await order(e, { coupon: 'ANA10' });
      await order(e, { items: [['VIP', 2]] });
      const adm = await session();
      const screen = await json(await adm.get(`/admin/reports/sales?eventId=${e.id}`));
      const rows = parseCsv(await (await adm.get(`/admin/exports/sales.csv?eventId=${e.id}`)).text());
      expect(rows.slice(1, 1 + screen.lines.length)).toHaveLength(screen.lines.length);
      const total = rows.find(r => r[0] === 'TOTAL')!;
      // Colunas: Evento, Tipo, Lote (0013), Ingressos, Valor dos ingressos, Desconto e Valor líquido (D-91), Taxa de serviço e Total
      // cobrado (D-90).
      expect(rows[0]).toEqual([
        'Evento',
        'Tipo de ingresso',
        'Lote',
        'Ingressos',
        'Valor dos ingressos (R$)',
        'Desconto de promoter (R$)',
        'Valor líquido dos ingressos (R$)',
        'Taxa de serviço (R$)',
        'Total cobrado (R$)',
      ]);
      const reais = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
      expect(total[3]).toBe(String(screen.totals.tickets));
      expect(total[4]).toBe(reais(screen.totals.cents));
      expect(total[5]).toBe(reais(screen.totals.discountCents));
      expect(total[6]).toBe(reais(screen.totals.netCents));
      expect(total[7]).toBe(reais(screen.totals.serviceFeeCents));
      expect(total[8]).toBe(reais(screen.totals.chargedCents));
      const rank = parseCsv(await (await adm.get('/admin/exports/promoters.csv')).text());
      expect(rank[1]![2]).toBe('ANA10');
      const fee = parseCsv(await (await adm.get('/admin/exports/fee.csv?month=2026-12')).text());
      const f = Object.fromEntries(fee.map(r => [r[0], r[1]]));
      const feeScreen = await json(await adm.get('/admin/reports/fee?month=2026-12'));
      expect(f['Ingressos no repasse (unidades)']).toBe(String(feeScreen.units));
      expect(f['Total a repassar (R$)']).toBe((feeScreen.feeCents / 100).toFixed(2).replace('.', ','));
      expect(f['Ingressos pagos por Pix']).toBe(String(feeScreen.pixUnits));
    });

    it('a busca digitada (CPF/e-mail) não vai para a auditoria; quem, o quê e quando vão', async () => {
      const e = await event();
      await order(e, { buyer: { name: 'Marina', email: 'marina@partyx.test', cpf: '52998224725' } });
      const adm = await session();
      await adm.get(`/admin/exports/orders.csv?eventId=${e.id}&q=marina@partyx.test`);
      await adm.get(`/admin/exports/events/${e.id}/contingency.pdf`);
      const log = (
        await sql(
          "select actor_id, action, entity, entity_id, after_json, created_at from audit_log where action like 'exportacao.%' order by created_at, action",
        )
      ).rows;
      expect(log.map(r => r.action).sort()).toEqual(['exportacao.contingencia', 'exportacao.pedidos']);
      for (const r of log) {
        expect(r.actor_id).toBe(adm.id);
        expect(r.entity_id).toBe(e.id);
        expect(JSON.stringify(r.after_json)).not.toMatch(/marina|52998224725/i);
        expect(r.after_json.linhas).toBeGreaterThan(0);
      }
      expect(log.find(r => r.action === 'exportacao.pedidos')!.after_json.filtros.q).toBe(true);
    });

    it('exportação acima do teto é recusada, não cortada em silêncio', async () => {
      const { MAX_EXPORT_ROWS } = await import('../exports/service');
      expect(MAX_EXPORT_ROWS).toBe(50_000);
    });
  });

  describe('contingência', () => {
    it('lista: cancelados à parte, ordem alfabética sem depender de acento, CPF mascarado', async () => {
      const e = await event();
      await order(e, { buyer: { name: 'Álvaro Zé', cpf: '52998224725' }, items: [['Pista', 1]] });
      await order(e, { buyer: { name: 'Bruno', cpf: '11144477735' }, items: [['VIP', 1]] });
      await order(e, { buyer: { name: 'Ana', cpf: '39053344705' }, items: [['Pista', 1]] });
      const x = await order(e, { buyer: { name: 'Cancelado Silva' }, items: [['Pista', 1]] });
      await sql("update tickets set status = 'cancelado', cancelled_at = now(), cancel_reason = 'x' where id = $1", [
        x.tickets[0]!.id,
      ]);
      const adm = await session();
      const rows = parseCsv(await (await adm.get(`/admin/exports/events/${e.id}/contingency.csv`)).text());
      expect(rows.slice(1, 5).map(r => r[2])).toEqual(['Álvaro Zé', 'Ana', 'Bruno', 'Cancelado Silva']);
      expect(rows[4]![5]).toContain('NÃO LIBERAR');
      for (const r of rows.slice(1, 5)) expect(r[3]).not.toMatch(/\d{11}/);
      expect(rows[1]![3]).toMatch(/^\d{3}\.\*\*\*\.\*\*\*-\d{2}$|\*\*\*/);
      const footer = Object.fromEntries(rows.slice(6).map(r => [r[0], r[1]]));
      expect(footer['Ingressos para liberar']).toBe('3');
      expect(footer['Cancelados (não liberar)']).toBe('1');
    });

    it('PDF legível com volume representativo: 3.000 ingressos, todas as linhas presentes, páginas numeradas', async () => {
      const e = await event('Festa Grande', 'publicado', { Pista: 5000, VIP: 5000 });
      const user = (
        await sql(
          "insert into users (name,email,cpf,password_hash,role) values ('Volume','volume@partyx.test','52998224725',$1,'cliente') returning id",
          [hash],
        )
      ).rows[0].id as string;
      const orderId = (
        await sql(
          "insert into orders (user_id,event_id,total_cents,status,paid_at,payment_method,gateway_payment_id) values ($1,$2,24000000,'pago','2026-12-12T15:00:00Z','pix','gw_vol') returning id",
          [user, e.id],
        )
      ).rows[0].id as string;
      const N = 3000;
      const itemId = (
        await sql(
          'insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,$4,8000) returning id',
          [orderId, e.id, e.types.Pista, N],
        )
      ).rows[0].id as string;
      await createDrizzle(testDb.pool).transaction(tx =>
        issueForOrder(tx, config.qr, {
          id: orderId,
          userId: user,
          eventId: e.id,
          items: [{ orderItemId: itemId, ticketTypeId: e.types.Pista, quantity: N }],
        }),
      );
      await sql(
        "update tickets set holder_name = 'Convidado ' || lpad(unit_index::text, 4, '0') || ' Ção' where order_id = $1",
        [orderId],
      );
      const adm = await session();
      const res = await adm.get(`/admin/exports/events/${e.id}/contingency.pdf`);
      expect(res.status).toBe(200);
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      const text = pdfText(buf);
      const codes = (await sql('select short_code from tickets where order_id = $1', [orderId])).rows.map(
        r => r.short_code as string,
      );
      expect(codes).toHaveLength(N);
      for (const code of codes) if (!text.includes(code)) throw new Error(`código ${code} ausente do PDF`);
      expect(text).toContain('Convidado 0001 Ção');
      expect(text).toContain('Convidado 3000 Ção');
      expect(text).toContain('Ingressos para liberar: 3000');
      const pages = Number(/Página 1 de (\d+)/.exec(text)![1]);
      expect(pages).toBeGreaterThan(40);
      expect(text).toContain(`Página ${pages} de ${pages}`);
      expect(text).toContain('CONFIDENCIAL');
      expect(text).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/); // CPF completo nunca
    }, 120_000);
  });
});
