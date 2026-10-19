import { acceptPolicy, api, apiLogin, buyPaid, chooseTickets, expect, loginAs, newBuyer, S, shot, sql, test, typeRow } from './support/fixtures';

const principal = () => S.events.principal!;

async function adminCtx(browser: import('@playwright/test').Browser) {
  const ctx = await browser.newContext();
  await apiLogin(ctx.request, S.base, S.team.admin.email, S.team.admin.password);
  return ctx;
}

test.describe('concorrência no estoque', () => {
  test('dois compradores disputam a última unidade ao mesmo tempo: só um reserva', async ({ browser }, info) => {
    const adm = await adminCtx(browser);
    const name = `Ultima ${Date.now().toString(36)}`;
    const created = await api(adm.request, S.base, 'POST', `/admin/events/${principal().id}/ticket-types`, {
      name,
      priceCents: 5000,
      quantityTotal: 1,
      salesStartAt: new Date(Date.now() - 86_400_000).toISOString(),
      salesEndAt: principal().startsAt,
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const typeId = created.json.ticketType.id as string;
    const pages = [];
    for (let i = 0; i < 2; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const b = await newBuyer(ctx.request, { name: `Disputa ${i} Fictício` });
      const page = await loginAs(ctx, b);
      await chooseTickets(page, S.base, principal().slug, { [name]: 1 });
      await expect(page.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
      await acceptPolicy(page);
      pages.push(page);
    }
    await Promise.all(pages.map(p => p.getByRole('button', { name: 'Ir para o pagamento' }).first().click()));
    const outcome = async (p: import('@playwright/test').Page) => {
      await expect.poll(async () => /\/pedido\//.test(p.url()) || (await p.getByRole('alert').count()) > 0, { timeout: 20_000 }).toBe(true);
      return /\/pedido\//.test(p.url());
    };
    const results = await Promise.all(pages.map(outcome));
    expect(results.filter(Boolean)).toHaveLength(1);
    const loser = pages[results.indexOf(false)]!;
    await shot(loser, info, 'concorrencia', 'ultima-unidade-perdedor');
    const t = await typeRow(typeId);
    expect(t.sold + t.reserved).toBeLessThanOrEqual(t.total);
    for (const p of pages) await p.context().close();
    await adm.close();
  });

  test('lote esgota no meio do pedido: o servidor recalcula o preço e a tela pede nova conferência', async ({ browser }, info) => {
    // Tipo próprio com 2 lotes: 1º lote com 1 unidade a R$ 50,00 e 2º lote com 9 a R$ 70,00.
    const adm = await adminCtx(browser);
    const name = `Lotes ${Date.now().toString(36)}`;
    const created = await api(adm.request, S.base, 'POST', `/admin/events/${principal().id}/ticket-types`, {
      name,
      priceCents: 5000,
      quantityTotal: 10,
      salesStartAt: new Date(Date.now() - 86_400_000).toISOString(),
      salesEndAt: principal().startsAt,
    });
    const typeId = created.json.ticketType.id as string;
    const lots = (await sql<{ id: string }>(S.db, `select id from ticket_lots where ticket_type_id = $1 order by position`, [typeId]));
    expect(lots).toHaveLength(1);
    expect((await api(adm.request, S.base, 'PATCH', `/admin/lots/${lots[0]!.id}`, { name: '1º lote', quantity: 1 })).status).toBe(200);
    expect((await api(adm.request, S.base, 'POST', `/admin/ticket-types/${typeId}/lots`, { name: '2º lote', priceCents: 7000, quantity: 9, leftoverPolicy: 'passar' })).status).toBe(201);
    // A vê o preço do 1º lote na revisão.
    const aCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const a = await newBuyer(aCtx.request, { name: 'Lote A Fictício' });
    const pa = await loginAs(aCtx, a);
    await chooseTickets(pa, S.base, principal().slug, { [name]: 1 });
    await expect(pa.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
    expect((await pa.locator('.px-ck-aside').first().innerText())).toContain('50,00');
    // B compra a última unidade do 1º lote pela API.
    const bCtx = await browser.newContext();
    await newBuyer(bCtx.request, { name: 'Lote B Fictício' });
    await buyPaid(bCtx.request, principal().slug, [{ ticketTypeId: typeId, quantity: 1 }]);
    // A confirma: o preço mudou (2º lote); a tela avisa e mostra o valor novo em vez de cobrar diferente do que mostrou.
    await acceptPolicy(pa);
    await pa.getByRole('button', { name: 'Ir para o pagamento' }).first().click();
    await expect(pa.getByRole('alert').first()).toBeVisible({ timeout: 15_000 });
    const alert = (await pa.getByRole('alert').first().innerText()).replace(/\s+/g, ' ');
    await shot(pa, info, 'concorrencia', 'lote-virou-no-meio');
    expect(pa.url()).not.toMatch(/\/pedido\//);
    await expect.poll(async () => (await pa.locator('.px-ck-aside').first().innerText()).includes('70,00'), { timeout: 15_000 }).toBe(true);
    test.info().annotations.push({ type: 'mensagem', description: alert });
    await aCtx.close();
    await bCtx.close();
    await adm.close();
  });
});
