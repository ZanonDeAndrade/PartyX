import { api, apiLogin, buyPaid, expect, loginAs, mockStatus, newBuyer, S, sql, test } from './support/fixtures';

const principal = () => S.events.principal!;
const baile = () => S.events.menores!;
const birthAge = (age: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - age);
  d.setUTCDate(d.getUTCDate() - 40);
  return d.toISOString().slice(0, 10);
};

async function gate(browser: import('@playwright/test').Browser) {
  const ctx = await browser.newContext();
  await apiLogin(ctx.request, S.base, S.team.validador.email, S.team.validador.password);
  return ctx;
}
async function admin(browser: import('@playwright/test').Browser) {
  const ctx = await browser.newContext();
  await apiLogin(ctx.request, S.base, S.team.admin.email, S.team.admin.password);
  return ctx;
}

test.describe('transferência: regras do servidor', () => {
  test('ingresso já utilizado, cancelado e de pedido estornado não transferem', async ({ ctx, browser }) => {
    await newBuyer(ctx.request);
    const dest = S.buyers.adulto4!.email;
    const { tickets: used } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    const g = await gate(browser);
    const admit = await api(g.request, S.base, 'POST', '/gate/admit', { eventId: principal().id, ticketId: used[0]!.id, method: 'manual' });
    expect(admit.status).toBe(200);
    expect(admit.json.result).toBe('valido');
    const r1 = await api(ctx.request, S.base, 'POST', `/tickets/${used[0]!.id}/transfer/preview`, { destination: dest });
    expect(r1.status).toBe(409);
    expect(r1.json.erro.mensagem).toMatch(/já utilizado/);
    const { tickets: canc } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    const a = await admin(browser);
    expect((await api(a.request, S.base, 'POST', `/admin/tickets/${canc[0]!.id}/cancel`, { reason: 'Auditoria: caso cancelado', confirm: true })).status).toBe(200);
    const r2 = await api(ctx.request, S.base, 'POST', `/tickets/${canc[0]!.id}/transfer/preview`, { destination: dest });
    expect(r2.status).toBe(409);
    expect(r2.json.erro.mensagem).toMatch(/cancelado/);
    const { orderId, tickets: ref } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    await mockStatus(ctx.request, orderId, 'estornado');
    const r3 = await api(ctx.request, S.base, 'POST', `/tickets/${ref[0]!.id}/transfer/preview`, { destination: dest });
    expect(r3.status).toBe(409);
    await g.close();
    await a.close();
  });

  test('retransferência, QR antigo invalidado na portaria e desfazer pelo administrador com e-mail aos dois', async ({ ctx, browser }) => {
    const a = await newBuyer(ctx.request, { name: 'Primeiro Titular Fictício' });
    const bCtx = await browser.newContext();
    const b = await newBuyer(bCtx.request, { name: 'Segundo Titular Fictício' });
    const cCtx = await browser.newContext();
    const c = await newBuyer(cCtx.request, { name: 'Terceiro Titular Fictício' });
    const { tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    const t = tickets[0]!;
    const oldQr = t.qr_payload;
    expect((await api(ctx.request, S.base, 'POST', `/tickets/${t.id}/transfer`, { destination: b.email, confirm: true })).status).toBe(200);
    // Retransferência: B passa para C.
    await bCtx.clearCookies();
    await apiLogin(bCtx.request, S.base, b.email, b.password);
    const second = await api(bCtx.request, S.base, 'POST', `/tickets/${t.id}/transfer`, { destination: c.email, confirm: true });
    expect(second.status).toBe(200);
    // QR antigo (de A) na portaria: inválido, com a explicação de QR antigo; o novo (de C) é válido.
    const g = await gate(browser);
    const old = await api(g.request, S.base, 'POST', '/gate/scan', { eventId: principal().id, qr: oldQr });
    expect(old.json.result).toBe('invalido');
    expect(JSON.stringify(old.json)).toMatch(/transferido/);
    const current = (await sql<{ qr: string; holder: string }>(S.db, `select qr_payload as qr, holder_user_id as holder from tickets where id = $1`, [t.id]))[0]!;
    expect(current.qr).not.toBe(oldQr);
    // Desfazer a última (C -> B) pelo administrador: volta para B, e-mail para os dois.
    const adm = await admin(browser);
    const undo = await api(adm.request, S.base, 'POST', `/admin/tickets/${t.id}/transfer/undo`, { reason: 'Auditoria: fraude comprovada pela PartyX', confirm: true });
    expect(undo.status).toBe(200);
    const after = (await sql<{ holder: string; qr: string }>(S.db, `select holder_user_id as holder, qr_payload as qr from tickets where id = $1`, [t.id]))[0]!;
    expect(after.holder).not.toBe(current.holder);
    expect(after.qr).not.toBe(current.qr);
    const transfers = await sql<{ n: number }>(S.db, `select count(*)::int as n from ticket_transfers where ticket_id = $1`, [t.id]);
    expect(transfers[0]!.n).toBe(3);
    await g.close();
    await adm.close();
    await bCtx.close();
    await cCtx.close();
  });

  test('idade de quem recebe: evento 18+ recusa conta de 17; evento 16+ exige o Termo de Ciência antes do QR', async ({ ctx, browser }) => {
    const a = await newBuyer(ctx.request, { name: 'Doador Idade Fictício' });
    void a;
    const teenCtx = await browser.newContext();
    const teen = await newBuyer(teenCtx.request, { name: 'Jovem Receptor Fictício', birth: birthAge(17) });
    const { tickets: adult } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    const refused = await api(ctx.request, S.base, 'POST', `/tickets/${adult[0]!.id}/transfer/preview`, { destination: teen.email });
    expect(refused.status).toBe(403);
    expect(refused.json.erro.mensagem).toMatch(/classificação etária|16 anos/);
    const { tickets: kid } = await buyPaid(ctx.request, baile().slug, [{ ticketTypeId: baile().types.pista!, quantity: 1 }]);
    const preview = await api(ctx.request, S.base, 'POST', `/tickets/${kid[0]!.id}/transfer/preview`, { destination: teen.email });
    expect(preview.status).toBe(200);
    expect(JSON.stringify(preview.json)).toMatch(/minor|menor/i);
    expect((await api(ctx.request, S.base, 'POST', `/tickets/${kid[0]!.id}/transfer`, { destination: teen.email, confirm: true })).status).toBe(200);
    const page = await loginAs(teenCtx, teen);
    await page.goto(`${S.base}/ingressos/${kid[0]!.id}`);
    await expect(page.getByRole('heading', { name: 'Aceite o Termo de Ciência para ver o QR Code' })).toBeVisible();
    await expect(page.getByRole('img', { name: /QR Code do ingresso/ })).toHaveCount(0);
    await page.getByLabel('Li e aceito o Termo de Ciência para Menores de Idade.').check();
    await page.getByRole('button', { name: 'Aceitar e mostrar o QR Code' }).click();
    await expect(page.getByRole('img', { name: /QR Code do ingresso/ })).toBeVisible();
    await teenCtx.close();
  });
});
