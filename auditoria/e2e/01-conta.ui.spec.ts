import { cpfFor, expect, expectNoOverflow, formatCpf, loginAs, newBuyer, S, shot, sql, test, waitForEmail } from './support/fixtures';

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const today = new Date();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const yearsAgo = (years: number, extraDays: number) => {
  const d = new Date(today);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - extraDays);
  return ymd(d);
};

async function fillSignup(page: import('@playwright/test').Page, b: { name: string; email: string; cpf: string; birth: string }) {
  await page.goto(`${S.base}/criar-conta`);
  await page.getByLabel('Nome completo').fill(b.name);
  await page.getByLabel('E-mail').fill(b.email);
  await page.getByLabel('CPF').fill(b.cpf);
  await page.getByLabel('Telefone com DDD').fill('11987654321');
  await page.locator('#nascimento').fill(b.birth);
  await page.locator('#senha').fill('festa2026Forte');
  await page.locator('#aceite').check();
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
}

test.describe('conta do comprador', () => {
  test('cadastro: maior de idade, 17 e 16 anos aceitos; menor de 16 recusado', async ({ ctx }, info) => {
    const page = await ctx.newPage();
    const cases = [
      { label: 'maior', birth: '1990-05-10' },
      { label: '17 anos', birth: yearsAgo(17, 10) },
      { label: '16 anos', birth: yearsAgo(16, 10) },
    ];
    for (const c of cases) {
      const id = unique();
      await fillSignup(page, { name: `Cadastro ${c.label} Fictício`, email: `cad.${id}@auditoria.test`, cpf: formatCpf(cpfFor(Number.parseInt(id, 36) % 800_000_000)), birth: c.birth });
      await expect(page.getByRole('heading', { name: 'Conta criada' })).toBeVisible();
      await expectNoOverflow(page, `conta criada (${c.label})`);
      if (c.label === '17 anos') await shot(page, info, 'conta', 'cadastro-17-anos');
      await ctx.clearCookies();
    }
    const id = unique();
    await fillSignup(page, { name: 'Menor de 16 Fictício', email: `cad.${id}@auditoria.test`, cpf: formatCpf(cpfFor(Number.parseInt(id, 36) % 800_000_000)), birth: yearsAgo(15, 300) });
    await expect(page.locator('#nascimento')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.px-error').filter({ hasText: /16 anos/ })).toBeVisible();
    await shot(page, info, 'conta', 'cadastro-menor-de-16-recusado');
  });

  test('cadastro: CPF inválido e e-mail repetido são recusados com mensagem no campo', async ({ ctx }, info) => {
    const page = await ctx.newPage();
    const id = unique();
    await fillSignup(page, { name: 'CPF Inválido Fictício', email: `cad.${id}@auditoria.test`, cpf: '123.456.789-00', birth: '1990-05-10' });
    await expect(page.locator('#cpf')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.px-error').filter({ hasText: /CPF/ })).toBeVisible();
    await shot(page, info, 'conta', 'cadastro-cpf-invalido');
    // E-mail já cadastrado (comprador da semente), CPF novo.
    await fillSignup(page, { name: 'Repetido Fictício', email: S.buyers.adulto1!.email, cpf: formatCpf(cpfFor(Number.parseInt(id, 36) % 800_000_000)), birth: '1990-05-10' });
    await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.px-error').filter({ hasText: /e-mail/i })).toBeVisible();
    await shot(page, info, 'conta', 'cadastro-email-repetido');
    const n = await sql<{ n: number }>(S.db, `select count(*)::int as n from users where email = $1`, [S.buyers.adulto1!.email]);
    expect(n[0]!.n).toBe(1);
  });

  test('login com senha errada, login certo, logout e volta protegida', async ({ ctx }, info) => {
    const b = await newBuyer(ctx.request);
    await ctx.clearCookies();
    const page = await ctx.newPage();
    await page.goto(`${S.base}/entrar`);
    await page.getByLabel('E-mail').fill(b.email);
    await page.locator('#senha, input[type=password]').first().fill('senha-errada-123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await shot(page, info, 'conta', 'login-senha-errada');
    await page.locator('#senha, input[type=password]').first().fill(b.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).not.toHaveURL(/\/entrar/);
    expect((await ctx.request.get(`${S.base}/api/auth/me`)).status()).toBe(200);
    await page.goto(`${S.base}/minha-conta`);
    await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible();
    await expectNoOverflow(page, 'minha conta');
    await shot(page, info, 'conta', 'minha-conta');
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await expect.poll(async () => (await ctx.request.get(`${S.base}/api/auth/me`)).status()).toBe(401);
    await page.goto(`${S.base}/meus-ingressos`);
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('recuperação de senha pelo link do e-mail; link usado uma vez só', async ({ ctx }, info) => {
    const b = await newBuyer(ctx.request);
    await ctx.clearCookies();
    const page = await ctx.newPage();
    await page.goto(`${S.base}/recuperar-senha`);
    await page.getByLabel('E-mail').fill(b.email);
    await page.getByRole('button', { name: 'Enviar link' }).click();
    await expect(page.getByRole('heading').first()).toBeVisible();
    const mail = await waitForEmail(ctx.request, S.base, b.email, 'recuperacao_senha');
    expect(mail.link).toContain('/redefinir-senha?token=');
    await page.goto(mail.link!.replace(/^https?:\/\/[^/]+/, S.base));
    const nova = 'novaSenha2026Forte';
    await page.getByLabel('Nova senha', { exact: true }).fill(nova);
    await page.getByLabel('Confirmar nova senha').fill(nova);
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(page.getByText(/senha (foi )?alterada/i).first()).toBeVisible();
    await shot(page, info, 'conta', 'senha-redefinida');
    await page.goto(mail.link!.replace(/^https?:\/\/[^/]+/, S.base));
    await expect(page.getByRole('heading', { name: /não é válido|já foi usado|utilizado|expirou/i })).toBeVisible();
    await page.goto(`${S.base}/entrar`);
    await page.getByLabel('E-mail').fill(b.email);
    await page.locator('#senha, input[type=password]').first().fill(nova);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).not.toHaveURL(/\/entrar/);
  });

  test('troca de senha em Minha conta exige a senha atual e derruba as outras sessões', async ({ ctx, browser }, info) => {
    const b = await newBuyer(ctx.request);
    const page = await loginAs(ctx, b);
    // Segunda sessão (outro aparelho).
    const other = await browser.newContext();
    const r = await other.request.post(`${S.base}/api/auth/login`, { data: { email: b.email, password: b.password }, headers: { origin: S.base } });
    expect(r.status()).toBe(200);
    await page.goto(`${S.base}/minha-conta`);
    await page.getByRole('button', { name: 'Alterar senha' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Senha atual').fill('errada-123456');
    await dlg.getByLabel('Nova senha', { exact: true }).fill('outraSenha2026Forte');
    await dlg.getByLabel('Confirmar nova senha').fill('outraSenha2026Forte');
    await dlg.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(dlg.getByRole('alert').or(dlg.locator('.px-error')).first()).toBeVisible();
    await dlg.getByLabel('Senha atual').fill(b.password);
    await dlg.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(page.getByText('Senha alterada.')).toBeVisible();
    await shot(page, info, 'conta', 'senha-alterada');
    // A sessão atual continua; a outra cai.
    expect((await ctx.request.get(`${S.base}/api/auth/me`)).status()).toBe(200);
    await expect.poll(async () => (await other.request.get(`${S.base}/api/auth/me`)).status()).toBe(401);
    await other.close();
  });

  test('não existe na interface: excluir a própria conta nem baixar os próprios dados (LGPD)', async ({ ctx }) => {
    const b = await newBuyer(ctx.request);
    const page = await loginAs(ctx, b);
    await page.goto(`${S.base}/minha-conta`);
    await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible();
    const text = (await page.locator('main').innerText()).toLowerCase();
    // Registro do que a tela oferece hoje: o direito é exercido pela PartyX, por API do administrador (docs/lgpd.md).
    expect(text).not.toMatch(/excluir (minha )?conta|apagar (minha )?conta/);
    expect(text).not.toMatch(/baixar (meus )?dados|exportar (meus )?dados|cópia dos dados/);
  });
});
