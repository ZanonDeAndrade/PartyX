import { expect, expectNoOverflow, S, shot, test } from './support/fixtures';

const norm = (t: string) => t.replace(/\s+/g, ' ').toLowerCase();

test.describe('vitrine e página do evento', () => {
  test('início: destaque, próximos eventos, sem arquivado, rascunho nem encerrado', async ({ ctx }, info) => {
    const page = await ctx.newPage();
    await page.goto(`${S.base}/`);
    await expect(page.getByRole('heading', { name: 'Festa Auditoria' }).first()).toBeVisible();
    // innerText segue o CSS (maiúsculas, espaço fixo): compara sem caixa e com espaços normalizados.
    const text = norm(await page.locator('main').innerText());
    expect(text).toContain('baile auditoria 16+');
    expect(text).not.toContain('arquivado auditoria');
    expect(text).not.toContain('rascunho auditoria');
    expect(text).not.toContain('evento encerrado auditoria');
    await expectNoOverflow(page, 'início');
    await shot(page, info, 'vitrine', 'inicio', { full: true });
  });

  test('busca pelo cabeçalho encontra por parte do nome e mostra vazio para termo inexistente', async ({ ctx }, info) => {
    const page = await ctx.newPage();
    await page.goto(`${S.base}/eventos?q=baile`);
    await expect(page.getByRole('heading', { name: 'Baile Auditoria 16+' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Festa Auditoria' })).toHaveCount(0);
    await shot(page, info, 'vitrine', 'busca-baile');
    await page.goto(`${S.base}/eventos?q=nadaexiste`);
    await expect(page.getByRole('heading', { name: /Nenhum evento encontrado/ })).toBeVisible();
    await expectNoOverflow(page, 'busca vazia');
    await shot(page, info, 'vitrine', 'busca-vazia');
  });

  test('página do evento à venda: preço com a taxa de serviço, formas de pagamento, compartilhar', async ({ ctx }, info) => {
    const page = await ctx.newPage();
    await page.goto(`${S.base}/eventos/${S.events.principal!.slug}`);
    await expect(page.getByRole('heading', { name: 'Festa Auditoria' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mais um Pista', exact: true })).toBeEnabled();
    const text = norm(await page.locator('main').innerText());
    // O tipo VIP tem estoque farto; o 1º lote da Pista esgota durante as rodadas paralelas e muda de preço.
    expect(text).toContain('r$ 150,00 + r$ 7,90 taxa');
    expect(text).toContain('formas de pagamento');
    expect(text).toContain('pix');
    expect(text).toContain('cartão de crédito ou débito');
    expect(text).toContain('18 anos');
    expect(text).toContain('galpão fictício');
    expect(text).toContain('até 6 por pedido');
    await expect(page.getByRole('button', { name: /Compartilhar/ }).first()).toBeVisible();
    await expectNoOverflow(page, 'página do evento');
    await shot(page, info, 'vitrine', 'evento-a-venda', { full: true });
  });

  test('evento em breve: tipo marcado, sem botão de compra', async ({ ctx }, info) => {
    const page = await ctx.newPage();
    await page.goto(`${S.base}/eventos/${S.events.breve!.slug}`);
    await expect(page.getByRole('heading', { name: 'Em Breve Auditoria' })).toBeVisible();
    await expect(page.getByText('Em breve').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mais um Pista', exact: true })).toHaveCount(0);
    await expectNoOverflow(page, 'em breve');
    await shot(page, info, 'vitrine', 'evento-em-breve');
  });

  test('vendas encerradas pelo período: aviso e sem compra', async ({ ctx }, info) => {
    const page = await ctx.newPage();
    await page.goto(`${S.base}/eventos/${S.events.encerradas!.slug}`);
    await expect(page.getByText('Vendas encerradas').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mais um Pista', exact: true })).toHaveCount(0);
    await shot(page, info, 'vitrine', 'evento-vendas-encerradas');
  });

  test('evento encerrado pelo administrador: marcado como encerrado e fora da vitrine', async ({ ctx }, info) => {
    const page = await ctx.newPage();
    await page.goto(`${S.base}/eventos/${S.events.encerrado!.slug}`);
    await expect(page.getByText('Evento encerrado').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Mais um/ })).toHaveCount(0);
    await shot(page, info, 'vitrine', 'evento-encerrado');
  });

  test('evento esgotado: aviso claro e sem compra', async ({ ctx }, info) => {
    const page = await ctx.newPage();
    await page.goto(`${S.base}/eventos/${S.events.esgotado!.slug}`);
    await expect(page.getByText(/esgotad/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Mais um/ })).toHaveCount(0);
    await shot(page, info, 'vitrine', 'evento-esgotado');
  });

  test('evento arquivado e rascunho: página não existe (404 do servidor e tela de não encontrado)', async ({ ctx }, info) => {
    const page = await ctx.newPage();
    for (const key of ['arquivado', 'rascunho'] as const) {
      const res = await page.goto(`${S.base}/eventos/${S.events[key]!.slug}`);
      expect(res?.status(), key).toBe(404);
      await expect(page.getByRole('heading', { name: 'Esta página não existe' })).toBeVisible();
      const api = await ctx.request.get(`${S.base}/api/public/events/${S.events[key]!.slug}`);
      expect(api.status(), `API ${key}`).toBe(404);
    }
    await shot(page, info, 'vitrine', 'evento-nao-encontrado');
  });
});
