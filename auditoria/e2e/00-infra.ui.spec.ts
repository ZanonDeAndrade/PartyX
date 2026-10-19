import { expect, expectNoOverflow, S, shot, test } from './support/fixtures';

test.describe('infraestrutura da auditoria', () => {
  test('a vitrine abre, lista os eventos da semente e não tem rolagem horizontal', async ({ ctx }, info) => {
    const page = await ctx.newPage();
    await page.goto(`${S.base}/`);
    await expect(page.getByRole('heading', { name: 'Festa Auditoria' }).first()).toBeVisible();
    await expectNoOverflow(page, 'vitrine');
    await shot(page, info, 'vitrine', 'inicio', { all: true });
  });
});
