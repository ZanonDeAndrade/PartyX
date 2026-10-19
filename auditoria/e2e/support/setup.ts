import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { request, type APIRequestContext } from '@playwright/test';
import pg from 'pg';
import { startServer, testDatabaseUrl, tsx } from '../../../e2e/support/server';
import { AUDIT_ROOT, PORT, RUN_DIR, type AuditState } from './state';

/**
 * Setup global da auditoria: banco de teste novo com a semente, servidor LOCAL com o gateway FICTÍCIO, lotes no tipo Pista do evento
 * principal e algumas compras pagas pela API (o mesmo caminho do site), para os cenários de transferência, portaria e cancelamento.
 */
async function api(ctx: APIRequestContext, base: string, method: string, p: string, data?: unknown) {
  const me = await ctx.get(`${base}/api/auth/me`);
  const csrf = me.ok() ? ((await me.json()) as { csrfToken?: string }).csrfToken : undefined;
  const res = await ctx.fetch(`${base}/api${p}`, { method, data, headers: { origin: base, ...(csrf ? { 'x-csrf-token': csrf } : {}) } });
  const json = await res.json().catch(() => null);
  if (res.status() >= 400) throw new Error(`${method} ${p} -> ${res.status()} ${JSON.stringify(json)}`);
  return json;
}
async function login(base: string, email: string, password: string) {
  const ctx = await request.newContext();
  const res = await ctx.post(`${base}/api/auth/login`, { data: { email, password }, headers: { origin: base } });
  if (!res.ok()) throw new Error(`login ${email}: ${res.status()}`);
  return ctx;
}

export default async function setup() {
  rmSync(RUN_DIR, { recursive: true, force: true });
  mkdirSync(RUN_DIR, { recursive: true });
  const adminUrl = testDatabaseUrl();
  const seedFile = path.join(RUN_DIR, 'seed.json');
  tsx(path.join(AUDIT_ROOT, 'e2e/support/seed-auditoria.mts'), [seedFile], { TEST_DATABASE_URL: adminUrl });
  const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
  const serverDir = path.join(RUN_DIR, 'server');
  const base = await startServer(serverDir, PORT, {
    DATABASE_URL: seed.url,
    DATABASE_URL_DIRECT: seed.url,
    PAYMENT_GATEWAY: 'mock',
    RESERVATION_MINUTES: '30',
    MAX_TICKETS_PER_ORDER: '6',
  });

  // Os lotes do tipo Pista do evento principal vêm da semente (ticket_lots).

  // Compras pagas pela API com o gateway fictício (Pix aprovado pelo caminho do webhook).
  const legal = (await (await request.newContext()).get(`${base}/api/legal/versions`).then(r => r.json())) as Record<string, string>;
  const cancellationVersion = legal.cancellation ?? legal.cancellationPolicy ?? legal.cancelamento ?? null;
  const pool = new pg.Pool({ connectionString: seed.url, max: 2 });
  const orders: AuditState['orders'] = {};
  const buy = async (key: string, buyer: { email: string; password: string }, slug: string, items: { ticketTypeId: string; quantity: number }[]) => {
    const ctx = await login(base, buyer.email, buyer.password);
    const created = await api(ctx, base, 'POST', '/orders', {
      eventSlug: slug,
      items,
      couponCode: null,
      cancellationAccepted: true,
      cancellationVersion,
    });
    const orderId = created.order.id as string;
    await api(ctx, base, 'POST', `/orders/${orderId}/payment`, { method: 'pix' });
    const approve = await ctx.post(`${base}/api/dev/mock-gateway/${orderId}/aprovado`);
    if (!approve.ok()) throw new Error(`aprovação fictícia ${key}: ${approve.status()}`);
    for (let i = 0; i < 40; i++) {
      const { rows } = await pool.query(`select status from orders where id = $1`, [orderId]);
      if (rows[0]?.status === 'pago') break;
      await new Promise(r => setTimeout(r, 250));
    }
    const { rows } = await pool.query(`select id, short_code, qr_payload from tickets where order_id = $1 order by unit_index`, [orderId]);
    orders[key] = { id: orderId, tickets: rows.map(r => ({ id: r.id, shortCode: r.short_code, qr: r.qr_payload })) };
    await ctx.dispose();
  };
  const ev = seed.events;
  await buy('esgotado', seed.buyers.adulto2, ev.esgotado.slug, [{ ticketTypeId: ev.esgotado.types.unica, quantity: 1 }]);
  await buy('hoje', seed.buyers.adulto1, ev.hoje.slug, [{ ticketTypeId: ev.hoje.types.pista, quantity: 1 }]);
  await buy('principalPista', seed.buyers.adulto1, ev.principal.slug, [{ ticketTypeId: ev.principal.types.pista, quantity: 2 }]);
  await buy('principalVip', seed.buyers.adulto2, ev.principal.slug, [{ ticketTypeId: ev.principal.types.vip, quantity: 1 }]);
  await buy('outro', seed.buyers.adulto3, ev.outro.slug, [{ ticketTypeId: ev.outro.types.pista, quantity: 1 }]);
  await pool.end();

  const state: AuditState = {
    base,
    db: seed.url,
    team: seed.team,
    buyers: seed.buyers,
    events: seed.events,
    promoters: seed.promoters,
    orders,
    lots: seed.lots,
    serverDir,
  };
  writeFileSync(path.join(RUN_DIR, 'state.json'), JSON.stringify(state, null, 1));
  console.log(`\nauditoria: servidor local em ${base}, gateway FICTÍCIO, ${Object.keys(orders).length} pedidos pagos na semente\n`);
}
