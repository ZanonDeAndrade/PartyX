import { acceptPolicy, chooseTickets, createOrder, expect, expectNoOverflow, expireReservation, loginAs, newBuyer, orderRow, reserve, S, shot, test, ticketsOf } from './support/fixtures';

const principal = () => S.events.principal!;

test.describe('checkout e reserva', () => {
  test('compra de 1 ingresso: revisão com taxa de serviço, reserva com cronômetro, Pix aprovado, confirmação', async ({ ctx }, info) => {
    const b = await newBuyer(ctx.request);
    const page = await loginAs(ctx, b);
    await chooseTickets(page, S.base, principal().slug, { VIP: 1 });
    await expect(page.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
    const aside = await page.getByRole('complementary', { name: 'Resumo do pedido' }).or(page.locator('.px-ck-aside')).first().innerText();
    expect(aside).toContain('Taxa de serviço');
    // VIP R$ 150,00 a 5%: 15000 x 500 / 9500 = 789,47 -> R$ 7,90; total R$ 157,90.
    expect(aside).toContain('157,90');
    await expectNoOverflow(page, 'revisão do pedido');
    await shot(page, info, 'checkout', 'revisao', { full: true });
    const orderId = await reserve(page);
    await expect(page.getByLabel(/Faltam \d{2}:\d{2}/)).toBeVisible();
    await expectNoOverflow(page, 'pedido com cronômetro');
    await shot(page, info, 'checkout', 'pagamento-escolha');
    await page.getByRole('radio', { name: /^Pix/ }).click();
    await page.getByRole('button', { name: /^Gerar Pix de/ }).click();
    await expect(page.getByRole('heading', { name: 'Pague com Pix' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Pix copia e cola' })).not.toBeEmpty();
    await expectNoOverflow(page, 'pix');
    await shot(page, info, 'checkout', 'pix-gerado');
    await page.getByRole('region', { name: 'Simulador do ambiente local' }).getByRole('button', { name: 'aprovado', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Compra confirmada' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('list', { name: 'Seus ingressos' }).getByRole('listitem')).toHaveCount(1);
    await expectNoOverflow(page, 'compra confirmada');
    await shot(page, info, 'checkout', 'compra-confirmada', { full: true });
    const o = await orderRow(orderId);
    expect(o.status).toBe('pago');
    expect(o.total_cents).toBe(15000 + 790);
    expect(o.service_fee_cents).toBe(790);
    expect(await ticketsOf(orderId)).toHaveLength(1);
  });

  test('6 ingressos: o botão "+" trava no limite; a API recusa 7', async ({ ctx }, info) => {
    const b = await newBuyer(ctx.request);
    const page = await loginAs(ctx, b);
    await page.goto(`${S.base}/eventos/${principal().slug}`);
    const plus = page.getByRole('button', { name: 'Mais um Pista', exact: true });
    for (let i = 0; i < 6; i++) await plus.click();
    await expect(plus).toBeDisabled();
    await expect(page.getByRole('group', { name: 'Quantidade de Pista' }).locator('output')).toHaveText('6');
    await expect(page.getByRole('button', { name: 'Mais um VIP', exact: true })).toBeDisabled();
    await shot(page, info, 'checkout', 'limite-6-na-tela');
    await page.getByRole('button', { name: 'Continuar', exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
    const orderId = await reserve(page);
    expect((await orderRow(orderId)).status).toBe('pendente');
    const r = await createOrder(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 7 }]);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  test('código de promoter: inexistente e desativado recusados; válido aplica sem desconto', async ({ ctx }, info) => {
    const b = await newBuyer(ctx.request);
    const page = await loginAs(ctx, b);
    await chooseTickets(page, S.base, principal().slug, { VIP: 1 });
    const before = await page.locator('.px-ck-aside').first().innerText();
    for (const code of ['NAOEXISTE', S.promoters.inativo]) {
      await page.getByLabel('Código', { exact: true }).fill(code);
      await page.getByRole('button', { name: 'Aplicar' }).click();
      await expect(page.locator('#cupom-erro')).toBeVisible();
    }
    await shot(page, info, 'checkout', 'promoter-invalido');
    await page.getByLabel('Código', { exact: true }).fill(S.promoters.ativo);
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(`${S.promoters.ativo} aplicado. Total inalterado.`)).toBeVisible();
    const after = await page.locator('.px-ck-aside').first().innerText();
    expect(after.replace(/\s+/g, ' ')).toContain('157,90');
    expect(before.replace(/\s+/g, ' ')).toContain('157,90');
    await shot(page, info, 'checkout', 'promoter-valido');
    await acceptPolicy(page);
    await page.getByRole('button', { name: 'Ir para o pagamento' }).first().click();
    await expect(page).toHaveURL(/\/pedido\//);
    const orderId = page.url().split('/pedido/')[1]!;
    const o = await orderRow(orderId);
    expect(o.total_cents).toBe(15790);
  });

  test('reserva de 30 minutos expirando: aviso na tela, pedido expirado e estoque de volta', async ({ ctx }, info) => {
    const b = await newBuyer(ctx.request);
    const page = await loginAs(ctx, b);
    await chooseTickets(page, S.base, principal().slug, { Camarote: 1 });
    const orderId = await reserve(page);
    await page.getByRole('radio', { name: /^Pix/ }).click();
    await page.getByRole('button', { name: /^Gerar Pix de/ }).click();
    await expect(page.getByRole('heading', { name: 'Pague com Pix' })).toBeVisible();
    await expireReservation(orderId);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'O prazo para pagamento terminou' })).toBeVisible({ timeout: 30_000 });
    await expectNoOverflow(page, 'prazo terminou');
    await shot(page, info, 'checkout', 'reserva-expirada');
    expect((await orderRow(orderId)).status).toBe('expirado');
    expect(await ticketsOf(orderId)).toHaveLength(0);
  });

  test('compra exige login: visitante escolhe ingressos, entra e volta ao checkout com a seleção', async ({ ctx }, info) => {
    const b = await newBuyer(ctx.request);
    await ctx.clearCookies();
    const page = await ctx.newPage();
    await page.goto(`${S.base}/eventos/${principal().slug}`);
    await page.getByRole('button', { name: 'Mais um VIP', exact: true }).click();
    await page.getByRole('button', { name: 'Mais um VIP', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/entrar\?voltar=/);
    await shot(page, info, 'checkout', 'login-para-comprar');
    await page.getByLabel('E-mail').fill(b.email);
    await page.locator('#senha, input[type=password]').first().fill(b.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/checkout/${principal().slug}$`));
    await expect(page.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
    const aside = (await page.locator('.px-ck-aside').first().innerText()).replace(/\s+/g, ' ');
    expect(aside).toMatch(/2\s*(x|×)?\s*VIP|VIP\s*(x|×)\s*2|2 VIP/);
  });
});
