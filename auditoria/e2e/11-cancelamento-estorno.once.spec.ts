import { api, apiLogin, buyPaid, expect, loginAs, mockStatus, newBuyer, orderRow, S, shot, test, ticketsOf } from './support/fixtures';

const principal = () => S.events.principal!;

test.describe('cancelamento e estorno: estado do pedido e dos ingressos', () => {
  test('administrador cancela um ingresso pela tela: pedido continua pago, ingresso cancelado, sem estorno', async ({ ctx, browser }, info) => {
    await newBuyer(ctx.request);
    const { orderId, tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 2 }]);
    const adm = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await loginAs(adm, 'admin');
    await page.goto(`${S.base}/admin/ingressos/${tickets[0]!.id}`);
    await page.getByRole('button', { name: 'Cancelar ingresso' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('textbox').first().fill('Auditoria: pedido do comprador registrado pela PartyX');
    const confirm = dlg.getByRole('checkbox');
    if (await confirm.count()) await confirm.first().check();
    await dlg.getByRole('button', { name: /Cancelar ingresso|Confirmar/ }).last().click();
    await expect(page.getByText(/cancelado/i).first()).toBeVisible();
    await shot(page, info, 'cancelamento', 'ingresso-cancelado-admin');
    const t = await ticketsOf(orderId);
    expect(t.map(x => x.status).sort()).toEqual(['cancelado', 'valido']);
    expect((await orderRow(orderId)).status).toBe('pago');
    await adm.close();
  });

  test('administrador cancela todos os ingressos válidos do pedido pela tela do pedido', async ({ ctx, browser }, info) => {
    await newBuyer(ctx.request);
    const { orderId } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 2 }]);
    const adm = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await loginAs(adm, 'admin');
    await page.goto(`${S.base}/admin/pedidos/${orderId}`);
    await expect(page.getByRole('heading', { level: 1, name: /Pedido PX-/ })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar todos os ingressos válidos do pedido' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('textbox').first().fill('Auditoria: cancelamento do pedido a pedido da PartyX');
    const confirm = dlg.getByRole('checkbox');
    if (await confirm.count()) await confirm.first().check();
    await dlg.getByRole('button', { name: /Cancelar/ }).last().click();
    await expect.poll(async () => (await ticketsOf(orderId)).every(t => t.status === 'cancelado')).toBe(true);
    await shot(page, info, 'cancelamento', 'pedido-ingressos-cancelados');
    expect((await orderRow(orderId)).status).toBe('pago');
    const text = (await page.locator('main').innerText()).toLowerCase();
    expect(text).toMatch(/estorno|reembolso|devolver/);
  });

  test('estorno total pelo gateway: pedido estornado, ingressos cancelados, comprador vê o estado; utilizado fica utilizado', async ({ ctx, browser }, info) => {
    const b = await newBuyer(ctx.request);
    const { orderId, tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 2 }]);
    const g = await browser.newContext();
    await apiLogin(g.request, S.base, S.team.validador.email, S.team.validador.password);
    expect((await api(g.request, S.base, 'POST', '/gate/admit', { eventId: principal().id, ticketId: tickets[0]!.id, method: 'manual' })).json.result).toBe('valido');
    expect((await mockStatus(ctx.request, orderId, 'estornado')).status).toBe(200);
    await expect.poll(async () => (await orderRow(orderId)).status).toBe('estornado');
    const t = await ticketsOf(orderId);
    expect(t.map(x => x.status).sort()).toEqual(['cancelado', 'utilizado']);
    const page = await loginAs(ctx, b);
    await page.goto(`${S.base}/pedido/${orderId}`);
    await expect(page.getByText(/estornad/i).first()).toBeVisible();
    await shot(page, info, 'cancelamento', 'pedido-estornado-comprador');
    await page.goto(`${S.base}/meus-ingressos`);
    await shot(page, info, 'cancelamento', 'meus-ingressos-apos-estorno');
    await g.close();
  });

  test('contestação (chargeback) pelo gateway: pedido contestado, ingressos cancelados, portaria vermelha', async ({ ctx, browser }) => {
    await newBuyer(ctx.request);
    const { orderId, tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    expect((await mockStatus(ctx.request, orderId, 'contestado')).status).toBe(200);
    await expect.poll(async () => (await orderRow(orderId)).status).toBe('contestado');
    expect((await ticketsOf(orderId))[0]!.status).toBe('cancelado');
    const g = await browser.newContext();
    await apiLogin(g.request, S.base, S.team.validador.email, S.team.validador.password);
    const scan = await api(g.request, S.base, 'POST', '/gate/scan', { eventId: principal().id, qr: tickets[0]!.qr_payload });
    expect(scan.json.result).toBe('cancelado');
    // A taxa mensal continua contando o ingresso (paid_at preservado).
    expect((await orderRow(orderId)).paid_at).not.toBeNull();
    await g.close();
  });

  test('evento cancelado com estorno de todos os pedidos: não existe como operação única', async ({ ctx }) => {
    const adm = ctx;
    await apiLogin(adm.request, S.base, S.team.admin.email, S.team.admin.password);
    const ev = await api(adm.request, S.base, 'GET', `/admin/events/${principal().id}`);
    expect(ev.status).toBe(200);
    // Rotas existentes: encerrar, parar vendas, arquivar, excluir (só sem uso). Nenhuma estorna; o estorno é feito pela PartyX no Mercado Pago,
    // pedido a pedido, e o webhook cancela os ingressos (teste acima). Registro: lacuna de operação, não de regra.
    for (const p of [`/admin/events/${principal().id}/cancel`, `/admin/events/${principal().id}/refund-all`]) {
      const r = await api(adm.request, S.base, 'POST', p, {});
      expect(r.status).toBe(404);
    }
  });
});
