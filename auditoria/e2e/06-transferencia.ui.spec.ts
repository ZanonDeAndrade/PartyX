import { api, buyPaid, capturedEmails, expect, expectNoOverflow, loginAs, newBuyer, S, shot, test } from './support/fixtures';

const principal = () => S.events.principal!;

test.describe('transferência de ingresso', () => {
  test('caminho feliz: conferência do nome mascarado, confirmação, os dois lados e os dois e-mails', async ({ ctx, browser }, info) => {
    const a = await newBuyer(ctx.request, { name: 'Alice Doadora Fictícia' });
    const bCtx = await browser.newContext();
    const b = await newBuyer(bCtx.request, { name: 'Beatriz Receptora Fictícia' });
    const { tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    const t = tickets[0]!;
    const page = await loginAs(ctx, a);
    await page.goto(`${S.base}/ingressos/${t.id}`);
    await expect(page.getByRole('heading', { name: principal().name })).toBeVisible();
    await expect(page.getByText(/Para passar o ingresso a outra pessoa, use Transferir até/)).toBeVisible();
    await page.getByRole('link', { name: 'Transferir' }).click();
    await expect(page.getByRole('heading', { name: 'Transferir ingresso' })).toBeVisible();
    await expectNoOverflow(page, 'transferir');
    await page.getByLabel('E-mail ou CPF de quem vai receber').fill(b.email);
    await page.getByRole('button', { name: 'Continuar' }).click();
    // Nome mascarado: o primeiro nome e iniciais; o nome inteiro não aparece.
    await expect(page.getByText('Beatriz Receptora Fictícia')).toHaveCount(0);
    await expect(page.getByText(/Beatriz/)).toBeVisible();
    await shot(page, info, 'transferencia', 'conferencia');
    await page.getByRole('button', { name: 'Confirmar transferência' }).click();
    await expect(page.getByRole('heading', { name: 'Ingresso transferido' })).toBeVisible();
    await shot(page, info, 'transferencia', 'transferido');
    // Quem transferiu não vê mais o ingresso; quem recebeu vê, com o QR.
    await page.goto(`${S.base}/ingressos/${t.id}`);
    await expect(page.getByText('Ingresso não encontrado')).toBeVisible();
    const pb = await loginAs(bCtx, b);
    await pb.goto(`${S.base}/ingressos/${t.id}`);
    await expect(pb.getByRole('img', { name: /QR Code do ingresso/ })).toBeVisible();
    await expect(pb.getByText(/Recebido de/)).toBeVisible();
    await shot(pb, info, 'transferencia', 'recebido');
    // Código curto novo: o antigo não vale mais.
    const r = await api(bCtx.request, S.base, 'GET', `/tickets/${t.id}`);
    expect(r.status).toBe(200);
    expect(r.json.ticket.shortCode).not.toBe(t.short_code);
    // E-mails dos dois lados, pela captura local.
    await expect.poll(() => capturedEmails({ to: a.email, template: 'transferencia_enviada' }).length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect.poll(() => capturedEmails({ to: b.email, template: 'transferencia_recebida' }).length, { timeout: 15_000 }).toBeGreaterThan(0);
    const sent = capturedEmails({ to: a.email, template: 'transferencia_enviada' })[0]!;
    expect(sent.txt).not.toContain(b.email);
    await bCtx.close();
  });

  test('conta inexistente e a própria conta são recusadas com mensagem', async ({ ctx }, info) => {
    const a = await newBuyer(ctx.request, { name: 'Carlos Doador Fictício' });
    const { tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    const page = await loginAs(ctx, a);
    await page.goto(`${S.base}/ingressos/${tickets[0]!.id}/transferir`);
    const field = page.getByLabel('E-mail ou CPF de quem vai receber');
    await field.fill('ninguem.inexistente@auditoria.test');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('alert')).toContainText('Não encontramos uma conta de cliente com esse e-mail ou CPF');
    await shot(page, info, 'transferencia', 'conta-inexistente');
    await field.fill(a.email);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('alert').or(page.locator('.px-error')).filter({ hasText: /já está na sua conta/ })).toBeVisible();
    await shot(page, info, 'transferencia', 'para-si-mesmo');
  });

  test('dentro das 2 horas antes do evento: a transferência não é oferecida e a API recusa', async ({ ctx }, info) => {
    const owner = S.buyers.adulto1!;
    const t = S.orders.hoje!.tickets[0]!;
    const page = await loginAs(ctx, owner);
    await page.goto(`${S.base}/ingressos/${t.id}`);
    await expect(page.getByRole('heading', { name: S.events.hoje!.name })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Transferir' })).toHaveCount(0);
    await shot(page, info, 'transferencia', 'prazo-encerrado');
    const r = await api(ctx.request, S.base, 'POST', `/tickets/${t.id}/transfer/preview`, { destination: S.buyers.adulto4!.email });
    expect(r.status).toBe(409);
    expect(r.json?.erro?.mensagem ?? '').toMatch(/2 horas/);
  });
});
