import { expect, expectNoOverflow, loginAs, S, shot, test } from './support/fixtures';

const pages: [string, RegExp][] = [
  ['/admin', /Visão geral/],
  ['/admin/pedidos', /Pedidos/],
  ['/admin/eventos', /Eventos/],
  ['/admin/eventos/novo', /Criar evento/],
  ['/admin/ingressos', /Ingressos/],
  ['/admin/compradores', /Compradores/],
  ['/admin/promoters', /Promoters/],
  ['/admin/equipe', /Equipe/],
  ['/admin/entradas', /Entradas/],
  ['/admin/excecoes', /Exceções de pagamento/],
  ['/admin/relatorios/vendas', /Relatório de vendas/],
  ['/admin/relatorios/promoters', /Ranking de promoters/],
  ['/admin/relatorios/taxa-mensal', /Relatório mensal da taxa/],
  ['/admin/configuracoes', /Configurações/],
  ['/admin/conta', /Minha conta/],
];

test.describe('painel do administrador: todas as páginas abrem e cabem na tela', () => {
  test('páginas do painel, sem rolagem horizontal', async ({ ctx }, info) => {
    const page = await loginAs(ctx, 'admin');
    for (const [path, title] of pages) {
      await page.goto(`${S.base}${path}`);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectNoOverflow(page, path);
      await shot(page, info, 'admin', path.replace(/^\//, '').replace(/\//g, '-') || 'inicio');
    }
  });

  test('detalhe do evento principal e abas (tipos, ingressos, compradores)', async ({ ctx }, info) => {
    const page = await loginAs(ctx, 'admin');
    await page.goto(`${S.base}/admin/eventos/${S.events.principal!.id}`);
    await expect(page.getByRole('heading', { level: 1, name: S.events.principal!.name })).toBeVisible();
    await expectNoOverflow(page, 'evento (admin)');
    await shot(page, info, 'admin', 'evento-detalhe');
    for (const tab of ['Ingressos', 'Compradores']) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForLoadState('networkidle');
      await expectNoOverflow(page, `aba ${tab}`);
    }
    await shot(page, info, 'admin', 'evento-aba-compradores');
  });

  test('validador e cliente: acesso negado ao painel; validador entra na portaria', async ({ ctx }, info) => {
    const page = await loginAs(ctx, 'validador');
    await page.goto(`${S.base}/admin`);
    await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
    await shot(page, info, 'admin', 'acesso-negado-validador');
    await page.goto(`${S.base}/portaria`);
    await expect(page.getByRole('heading', { name: 'Portaria' })).toBeVisible();
    await expectNoOverflow(page, 'portaria (lista)');
    await shot(page, info, 'portaria', 'lista-de-eventos');
    const cli = await loginAs(ctx, S.buyers.adulto3!);
    await cli.goto(`${S.base}/portaria`);
    await expect(cli.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
  });
});
