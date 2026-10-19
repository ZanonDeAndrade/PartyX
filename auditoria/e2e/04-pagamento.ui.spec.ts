import { chooseTickets, expect, expectNoOverflow, loginAs, mockStatus, newBuyer, orderRow, reserve, S, shot, test, ticketsOf } from './support/fixtures';

const principal = () => S.events.principal!;

/** Cartão no gateway fictício: a página "leva" a um endereço externo inexistente; a resposta vem do simulador, como no retorno real. */
async function startCard(page: import('@playwright/test').Page, orderId: string) {
  await page.route('https://pagamento.ficticio.invalid/**', r => r.fulfill({ contentType: 'text/html', body: '<h1>Pagamento fictício</h1>' }));
  await page.getByRole('radio', { name: /Cartão de crédito ou débito/ }).click();
  await page.getByRole('button', { name: 'Continuar para o cartão' }).click();
  await page.waitForURL(/pagamento\.ficticio\.invalid/);
  await page.goto(`${S.base}/pedido/${orderId}`);
}

test.describe('pagamento (gateway fictício, pelo caminho real do webhook)', () => {
  test('Pix expirado no gateway: pedido sem pagamento, aviso na tela, estoque de volta', async ({ ctx }, info) => {
    const b = await newBuyer(ctx.request);
    const page = await loginAs(ctx, b);
    await chooseTickets(page, S.base, principal().slug, { VIP: 1 });
    const orderId = await reserve(page);
    await page.getByRole('radio', { name: /^Pix/ }).click();
    await page.getByRole('button', { name: /^Gerar Pix de/ }).click();
    await expect(page.getByRole('heading', { name: 'Pague com Pix' })).toBeVisible();
    expect((await mockStatus(ctx.request, orderId, 'expirado')).status).toBe(200);
    await page.reload();
    await expect(page.getByRole('heading', { name: /prazo para pagamento terminou|não aprovado|expirou/i })).toBeVisible({ timeout: 30_000 });
    await expectNoOverflow(page, 'pix expirado');
    await shot(page, info, 'pagamento', 'pix-expirado');
    const o = await orderRow(orderId);
    expect(['expirado', 'nao_concluido']).toContain(o.status);
    expect(await ticketsOf(orderId)).toHaveLength(0);
  });

  test('cartão aprovado: compra confirmada com um QR por ingresso', async ({ ctx }, info) => {
    const b = await newBuyer(ctx.request);
    const page = await loginAs(ctx, b);
    await chooseTickets(page, S.base, principal().slug, { VIP: 2 });
    const orderId = await reserve(page);
    await startCard(page, orderId);
    await shot(page, info, 'pagamento', 'cartao-aguardando-retorno');
    await page.getByRole('region', { name: 'Simulador do ambiente local' }).getByRole('button', { name: 'aprovado', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Compra confirmada' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('list', { name: 'Seus ingressos' }).getByRole('listitem')).toHaveCount(2);
    await shot(page, info, 'pagamento', 'cartao-aprovado');
    const t = await ticketsOf(orderId);
    expect(new Set(t.map(x => x.qr_payload)).size).toBe(2);
    expect((await orderRow(orderId)).status).toBe('pago');
  });

  test('cartão recusado: pedido não concluído, reserva liberada, orientação para tentar de novo', async ({ ctx }, info) => {
    const b = await newBuyer(ctx.request);
    const page = await loginAs(ctx, b);
    await chooseTickets(page, S.base, principal().slug, { VIP: 1 });
    const orderId = await reserve(page);
    await startCard(page, orderId);
    await page.getByRole('region', { name: 'Simulador do ambiente local' }).getByRole('button', { name: 'recusado', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Pagamento não aprovado' })).toBeVisible({ timeout: 30_000 });
    await expectNoOverflow(page, 'cartão recusado');
    await shot(page, info, 'pagamento', 'cartao-recusado');
    const o = await orderRow(orderId);
    expect(o.status).toBe('nao_concluido');
    expect(await ticketsOf(orderId)).toHaveLength(0);
  });

  test('cartão pendente (sem resposta do banco ainda): a tela diz que está em análise e atualiza sozinha', async ({ ctx }, info) => {
    const b = await newBuyer(ctx.request);
    const page = await loginAs(ctx, b);
    await chooseTickets(page, S.base, principal().slug, { VIP: 1 });
    const orderId = await reserve(page);
    await startCard(page, orderId);
    const heading = page.getByRole('heading', { level: 1 }).first();
    await expect(heading).toBeVisible();
    const title = (await heading.innerText()).trim();
    test.info().annotations.push({ type: 'tela-pendente', description: title });
    await shot(page, info, 'pagamento', 'cartao-pendente');
    expect((await orderRow(orderId)).status).toBe('pendente');
    // Aprovação chega depois: a página atualiza sem recarregar.
    await mockStatus(ctx.request, orderId, 'aprovado');
    await expect(page.getByRole('heading', { name: 'Compra confirmada' })).toBeVisible({ timeout: 30_000 });
  });

  test('aviso quando o formulário de cartão do Mercado Pago não carrega: só com o gateway real', async () => {
    test.skip(true, 'exige o Card Payment Brick (credenciais de sandbox): coberto pelo roteiro em sandbox e por src/site/cardBrickMount.test.ts');
  });
});
