import { api, apiLogin, buyPaid, capturedEmails, createOrder, expect, expireReservation, mockStatus, newBuyer, orderRow, S, sql, test, ticketsOf } from './support/fixtures';

const principal = () => S.events.principal!;

test.describe('webhook e conciliação (gateway fictício pelo caminho real do webhook)', () => {
  test('notificação duplicada não duplica ingressos nem linhas de evento', async ({ ctx }) => {
    await newBuyer(ctx.request);
    const { orderId, tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 2 }]);
    expect(tickets).toHaveLength(2);
    for (let i = 0; i < 3; i++) expect((await mockStatus(ctx.request, orderId, 'aprovado')).status).toBe(200);
    const after = await ticketsOf(orderId);
    expect(after.map(t => t.id)).toEqual(tickets.map(t => t.id));
    const evs = (
      await sql<{ n: number; distintos: number }>(S.db, `select count(*)::int as n, count(distinct gateway_event_id)::int as distintos from payment_events where order_id = $1`, [orderId])
    )[0]!;
    expect(evs.n).toBe(evs.distintos);
  });

  test('fora de ordem: estorno seguido de aprovação tardia não revive o pedido', async ({ ctx }) => {
    await newBuyer(ctx.request);
    const { orderId, tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    expect((await mockStatus(ctx.request, orderId, 'estornado')).status).toBe(200);
    await expect.poll(async () => (await orderRow(orderId)).status).toBe('estornado');
    expect((await ticketsOf(orderId))[0]!.status).toBe('cancelado');
    expect((await mockStatus(ctx.request, orderId, 'aprovado')).status).toBe(200);
    expect((await orderRow(orderId)).status).toBe('estornado');
    expect((await ticketsOf(orderId))[0]!.status).toBe('cancelado');
    expect((await ticketsOf(orderId))[0]!.id).toBe(tickets[0]!.id);
    // paid_at não muda com o estorno (taxa mensal continua contando).
    expect((await orderRow(orderId)).paid_at).not.toBeNull();
  });

  test('assinatura inválida: 401, nada muda', async ({ ctx }) => {
    await newBuyer(ctx.request);
    const created = await createOrder(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    const orderId = created.json.order.id as string;
    await api(ctx.request, S.base, 'POST', `/orders/${orderId}/payment`, { method: 'pix' });
    const gid = (await sql<{ g: string }>(S.db, `select gateway_payment_id as g from orders where id = $1`, [orderId]))[0]!.g;
    const body = JSON.stringify({ id: 'evt_falso', paymentId: gid, type: 'payment.aprovado' });
    const res = await ctx.request.post(`${S.base}/api/webhooks/payments`, { data: body, headers: { 'content-type': 'application/json', 'x-mock-signature': 'assinatura-invalida' } });
    expect(res.status()).toBe(401);
    expect((await orderRow(orderId)).status).toBe('pendente');
    const noSig = await ctx.request.post(`${S.base}/api/webhooks/payments`, { data: body, headers: { 'content-type': 'application/json' } });
    expect(noSig.status()).toBe(401);
  });

  test('pagamento que chega depois da reserva vencer, com estoque: confirma e emite', async ({ ctx }) => {
    await newBuyer(ctx.request);
    const created = await createOrder(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    const orderId = created.json.order.id as string;
    await api(ctx.request, S.base, 'POST', `/orders/${orderId}/payment`, { method: 'pix' });
    await expireReservation(orderId);
    const seen = await api(ctx.request, S.base, 'GET', `/orders/${orderId}`);
    expect(seen.json.order.status).toBe('expirado');
    expect((await mockStatus(ctx.request, orderId, 'aprovado')).status).toBe(200);
    await expect.poll(async () => (await orderRow(orderId)).status).toBe('pago');
    expect(await ticketsOf(orderId)).toHaveLength(1);
  });

  test('pagamento tardio sem estoque: pago_sem_estoque, nada emitido, aviso aos administradores e exceção no painel', async ({ ctx, browser }) => {
    // Tipo próprio com 5 unidades: A reserva as 5 e deixa vencer; B compra as 5; o pagamento de A chega depois.
    const admCreate = await browser.newContext();
    await apiLogin(admCreate.request, S.base, S.team.admin.email, S.team.admin.password);
    const typeRes = await api(admCreate.request, S.base, 'POST', `/admin/events/${principal().id}/ticket-types`, {
      name: `Sem estoque ${Date.now().toString(36)}`,
      priceCents: 4000,
      quantityTotal: 5,
      salesStartAt: new Date(Date.now() - 86_400_000).toISOString(),
      salesEndAt: principal().startsAt,
    });
    expect(typeRes.status, JSON.stringify(typeRes.json)).toBe(201);
    const typeId = typeRes.json.ticketType.id as string;
    await admCreate.close();
    const a = await newBuyer(ctx.request);
    void a;
    const created = await createOrder(ctx.request, principal().slug, [{ ticketTypeId: typeId, quantity: 5 }]);
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const orderA = created.json.order.id as string;
    await api(ctx.request, S.base, 'POST', `/orders/${orderA}/payment`, { method: 'pix' });
    await expireReservation(orderA);
    await api(ctx.request, S.base, 'GET', `/orders/${orderA}`);
    const bCtx = await browser.newContext();
    await newBuyer(bCtx.request);
    const bought = await buyPaid(bCtx.request, principal().slug, [{ ticketTypeId: typeId, quantity: 5 }]);
    expect(bought.tickets).toHaveLength(5);
    expect((await mockStatus(ctx.request, orderA, 'aprovado')).status).toBe(200);
    await expect.poll(async () => (await orderRow(orderA)).status).toBe('pago_sem_estoque');
    expect(await ticketsOf(orderA)).toHaveLength(0);
    const sold = (await sql<{ n: number }>(S.db, `select count(*)::int as n from tickets where ticket_type_id = $1 and status <> 'cancelado'`, [typeId]))[0]!.n;
    expect(sold).toBeLessThanOrEqual(5);
    await expect.poll(() => capturedEmails({ template: 'pagamento_sem_estoque' }).length, { timeout: 15_000 }).toBeGreaterThan(0);
    const adm = await browser.newContext();
    await apiLogin(adm.request, S.base, S.team.admin.email, S.team.admin.password);
    const ex = await api(adm.request, S.base, 'GET', '/admin/payments/exceptions');
    expect(ex.status).toBe(200);
    expect(JSON.stringify(ex.json)).toContain(orderA);
    await adm.close();
    await bCtx.close();
  });

  test('rotina diária e tarefas do Cloud Tasks não são chamáveis no ambiente local (503, sem OIDC)', async ({ ctx }) => {
    for (const p of ['/internal/jobs/reconcile-payments', '/internal/tasks/reconcile-order', '/internal/tasks/send-email', '/internal/jobs/purge-retention']) {
      const res = await ctx.request.post(`${S.base}/api${p}`, { data: {} });
      expect([401, 503]).toContain(res.status());
    }
  });
});
