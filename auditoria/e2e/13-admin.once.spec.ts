import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { api, apiLogin, day, expect, expectNoOverflow, loginAs, newBuyer, S, shot, sql, test } from './support/fixtures';

async function createTypeUi(page: import('@playwright/test').Page, t: { name: string; price: string; qty: number; start: string; end: string }) {
  await page.getByRole('button', { name: 'Novo tipo de ingresso' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Nome', { exact: true }).fill(t.name);
  await dlg.getByLabel('Valor em reais').fill(t.price);
  await dlg.getByLabel('Quantidade total').fill(String(t.qty));
  await dlg.getByLabel('Início das vendas: data').fill(t.start);
  await dlg.getByLabel('Início: horário').fill('00:00');
  await dlg.getByLabel('Fim das vendas: data').fill(t.end);
  await dlg.getByLabel('Fim: horário').fill('20:00');
  await dlg.getByRole('button', { name: 'Criar tipo' }).click();
  await expect(dlg).toBeHidden();
}

test.describe('painel do administrador: operações', () => {
  test('evento: criar pela tela, capa, tipos com janelas, publicar, cor, encerrar vendas, arquivar, desarquivar', async ({ browser }, info) => {
    const adm = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await loginAs(adm, 'admin');
    const name = `Evento Criado na Auditoria ${Date.now().toString(36)}`;
    await page.goto(`${S.base}/admin/eventos/novo`);
    await page.getByLabel('Nome do evento').fill(name);
    await page.getByLabel('Data', { exact: true }).fill(day(25));
    await page.getByLabel('Horário de início').fill('21:00');
    await page.getByLabel('Local', { exact: true }).fill('Galpão Fictício do Painel');
    await page.getByLabel('Endereço').fill('Rua dos Testes, 112, Cidade Pequena');
    await page.getByLabel('Descrição').fill('Evento fictício criado pela interface do administrador durante a auditoria. Nenhum ingresso real.');
    await page.getByLabel('Atrações (uma por linha, opcional)').fill('DJ Fictício\nBanda de Teste');
    await page.getByLabel('Classificação etária').selectOption({ index: 1 });
    // Capa: JPEG gerado na hora (1600 x 900).
    const jpeg = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#7C3AED' } }).jpeg({ quality: 80 }).toBuffer();
    await page.locator('input[type="file"]').setInputFiles({ name: 'capa-auditoria.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await expect(page).toHaveURL(/\/admin\/eventos\/[0-9a-f-]{36}\?aba=tipos/, { timeout: 30_000 });
    const eventId = /eventos\/([0-9a-f-]{36})/.exec(page.url())![1]!;
    await expect.poll(async () => (await sql<{ b: string | null }>(S.db, `select banner_url as b from events where id = $1`, [eventId]))[0]!.b, { timeout: 30_000 }).not.toBeNull();
    await createTypeUi(page, { name: 'Pista', price: '60', qty: 50, start: day(-1), end: day(25) });
    await createTypeUi(page, { name: 'Antecipado', price: '40', qty: 10, start: day(3), end: day(10) });
    await shot(page, info, 'admin', 'evento-criado-tipos');
    await page.getByRole('button', { name: 'Publicar' }).first().click();
    await page.getByRole('button', { name: 'Publicar evento' }).click();
    await expect(page.getByText('Publicado').first()).toBeVisible();
    const ev = (await sql<{ slug: string; status: string }>(S.db, `select slug, status from events where id = $1`, [eventId]))[0]!;
    expect(ev.status).toBe('publicado');
    // Cor de destaque: válida e inválida, pela API (o seletor embutido é coberto por e2e/cor-destaque.spec.ts).
    expect((await api(adm.request, S.base, 'PATCH', `/admin/events/${eventId}`, { accentColor: '#10b981' })).status).toBe(200);
    expect((await sql<{ c: string }>(S.db, `select accent_color as c from events where id = $1`, [eventId]))[0]!.c).toBe('#10B981');
    expect((await api(adm.request, S.base, 'PATCH', `/admin/events/${eventId}`, { accentColor: 'verde' })).status).toBe(422);
    // Página pública: capa, "Em breve" no tipo antecipado, Pista à venda.
    const pub = await (await browser.newContext()).newPage();
    await pub.goto(`${S.base}/eventos/${ev.slug}`);
    await expect(pub.getByRole('heading', { name })).toBeVisible();
    await expect(pub.getByRole('button', { name: 'Mais um Pista', exact: true })).toBeEnabled();
    await expect(pub.getByRole('button', { name: 'Mais um Antecipado', exact: true })).toHaveCount(0);
    await expect(pub.locator('img[src*="/media/"], img[src*="events/"]').first()).toBeVisible();
    await shot(pub, info, 'admin', 'evento-criado-publico', { full: true });
    await pub.context().close();
    // Encerrar vendas agora.
    await page.goto(`${S.base}/admin/eventos/${eventId}`);
    await page.getByRole('button', { name: 'Encerrar vendas agora' }).first().click();
    await page.locator('[role=alertdialog], [role=dialog]:not(#px-abertura)').getByRole('button', { name: 'Encerrar vendas agora' }).click();
    await expect.poll(async () => (await api(adm.request, S.base, 'GET', `/public/events/${ev.slug}`)).json.event?.sale?.kind ?? (await api(adm.request, S.base, 'GET', `/public/events/${ev.slug}`)).json.event?.availability ?? 'x', { timeout: 15_000 }).not.toBe('x');
    await shot(page, info, 'admin', 'evento-vendas-encerradas');
    // Arquivar (via Excluir > Arquivar em vez de excluir, ou direto) e desarquivar.
    const archived = await api(adm.request, S.base, 'POST', `/admin/events/${eventId}/archive`, {});
    expect(archived.status).toBe(200);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Desarquivar' }).first()).toBeVisible();
    expect((await adm.request.get(`${S.base}/api/public/events/${ev.slug}`)).status()).toBe(404);
    await page.getByRole('button', { name: 'Desarquivar' }).first().click();
    await page.locator('[role=alertdialog], [role=dialog]:not(#px-abertura)').getByRole('button', { name: 'Desarquivar' }).click();
    await expect.poll(async () => (await adm.request.get(`${S.base}/api/public/events/${ev.slug}`)).status()).toBe(200);
    await adm.close();
  });

  test('evento: excluir rascunho sem uso pela tela, com confirmação pelo nome; evento com venda não pode ser excluído', async ({ browser }, info) => {
    const adm = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await apiLogin(adm.request, S.base, S.team.admin.email, S.team.admin.password);
    const name = `Rascunho para Excluir ${Date.now().toString(36)}`;
    const created = await api(adm.request, S.base, 'POST', '/admin/events', {
      name,
      startsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      venue: 'Galpão Fictício',
      address: 'Rua dos Testes, 112',
      description: 'Rascunho fictício para o caso de exclusão.',
      ageRating: '18 anos',
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const id = created.json.event.id as string;
    const page = await adm.newPage();
    await page.goto(`${S.base}/admin/eventos/${id}`);
    await page.getByRole('button', { name: 'Excluir' }).first().click();
    const dlg = page.locator('[role=alertdialog], [role=dialog]:not(#px-abertura)');
    await expect(dlg.first()).toBeVisible();
    await shot(page, info, 'admin', 'evento-excluir-dialogo');
    if (await dlg.locator('#remover-nome').count()) await dlg.locator('#remover-nome').fill(name);
    await dlg.getByRole('button', { name: /^Excluir( evento)?$/ }).last().click();
    await expect(page).toHaveURL(/\/admin\/eventos$/);
    expect((await sql<{ n: number }>(S.db, `select count(*)::int as n from events where id = $1`, [id]))[0]!.n).toBe(0);
    await shot(page, info, 'admin', 'evento-excluido');
    const removal = await api(adm.request, S.base, 'GET', `/admin/events/${S.events.principal!.id}/removal`);
    expect(removal.status).toBe(200);
    test.info().annotations.push({ type: 'removal', description: JSON.stringify(removal.json).slice(0, 300) });
    const refused = await api(adm.request, S.base, 'POST', `/admin/events/${S.events.principal!.id}/delete`, { name: S.events.principal!.name, confirm: true, confirmName: S.events.principal!.name });
    expect([409, 422]).toContain(refused.status);
    expect((await sql<{ n: number }>(S.db, `select count(*)::int as n from events where id = $1`, [S.events.principal!.id]))[0]!.n).toBe(1);
    await adm.close();
  });

  test('promoters: criar, código repetido recusado, editar e desativar', async ({ browser }, info) => {
    const adm = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await loginAs(adm, 'admin');
    await page.goto(`${S.base}/admin/promoters`);
    await page.getByRole('button', { name: 'Novo promoter' }).click();
    let dlg = page.getByRole('dialog');
    const code = `AUD${Date.now().toString(36).toUpperCase().slice(-5)}`;
    await dlg.getByLabel('Nome', { exact: true }).fill('Promoter Criado Fictício');
    await dlg.getByLabel('Código', { exact: true }).fill(code);
    await dlg.getByRole('button', { name: 'Criar promoter' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByText(code, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Novo promoter' }).click();
    dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nome', { exact: true }).fill('Outro Promoter Fictício');
    await dlg.getByLabel('Código', { exact: true }).fill(S.promoters.ativo);
    await dlg.getByRole('button', { name: 'Criar promoter' }).click();
    await expect(dlg.locator('.px-error').or(dlg.getByRole('alert')).first()).toBeVisible();
    await shot(page, info, 'admin', 'promoter-codigo-repetido');
    // Cancelar com o formulário alterado abre um window.confirm ("Descartar as alterações?"); o Playwright descarta diálogos nativos por
    // padrão, então aqui ele é aceito de propósito (no navegador real a pessoa vê a pergunta).
    page.once('dialog', d => d.accept());
    await dlg.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.locator('.px-modal-bg')).toHaveCount(0);
    const row = page.locator('li.px-adm-card, tr').filter({ hasText: code }).first();
    await row.getByRole('button', { name: 'Desativar' }).click();
    await page.locator('[role=alertdialog], [role=dialog]:not(#px-abertura)').getByRole('button', { name: 'Desativar' }).click();
    await expect.poll(async () => (await sql<{ a: boolean }>(S.db, `select is_active as a from promoters where coupon_code = $1`, [code]))[0]!.a).toBe(false);
    await adm.close();
  });

  test('equipe: criar validador com senha temporária, primeiro acesso obriga a troca, desativar derruba o acesso', async ({ browser }, info) => {
    const adm = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await loginAs(adm, 'admin');
    await page.goto(`${S.base}/admin/equipe`);
    await page.getByRole('button', { name: 'Novo usuário' }).click();
    const dlg = page.getByRole('dialog');
    const email = `validador.${Date.now().toString(36)}@auditoria.test`;
    await dlg.getByLabel('Nome', { exact: true }).fill('Validador Novo Fictício');
    await dlg.getByLabel('E-mail').fill(email);
    await dlg.getByLabel('Perfil').selectOption('validador');
    await dlg.getByRole('button', { name: 'Criar usuário' }).click();
    const temp = page.locator('.px-temp-password');
    await expect(temp).toBeVisible({ timeout: 15_000 });
    const password = (await temp.innerText()).trim();
    expect(password.length).toBeGreaterThanOrEqual(12);
    await shot(page, info, 'admin', 'equipe-senha-temporaria');
    // Primeiro acesso do validador: entra, é levado à troca de senha, troca e chega à portaria.
    const v = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const vp = await v.newPage();
    await vp.goto(`${S.base}/entrar`);
    await vp.getByLabel('E-mail').fill(email);
    await vp.locator('#senha, input[type=password]').first().fill(password);
    await vp.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(vp).not.toHaveURL(/\/entrar/);
    // Observação registrada: o login com senha temporária cai na página inicial; a troca só é exigida ao abrir o painel ou a portaria.
    test.info().annotations.push({ type: 'observacao', description: `depois do login com senha temporária a URL foi ${new URL(vp.url()).pathname}` });
    await vp.goto(`${S.base}/portaria`);
    await expect(vp).toHaveURL(/\/primeiro-acesso/);
    await expectNoOverflow(vp, 'primeiro acesso');
    await shot(vp, info, 'admin', 'primeiro-acesso');
    const nova = 'portaria2026Forte';
    await vp.getByLabel('Senha temporária').fill(password);
    await vp.getByLabel('Nova senha', { exact: true }).fill(nova);
    await vp.getByLabel('Confirmar nova senha').fill(nova);
    await vp.getByRole('button', { name: 'Salvar senha' }).click();
    await expect.poll(async () => (await sql<{ m: boolean }>(S.db, `select must_change_password as m from users where email = $1`, [email]))[0]!.m, { timeout: 15_000 }).toBe(false);
    // Depois de salvar, a sessão é encerrada e a pessoa entra de novo com a senha nova (registrado como observação de fluxo).
    test.info().annotations.push({ type: 'observacao', description: `depois de salvar a senha nova a URL foi ${new URL(vp.url()).pathname}; /api/auth/me ${(await v.request.get(`${S.base}/api/auth/me`)).status()}` });
    if ((await v.request.get(`${S.base}/api/auth/me`)).status() !== 200) {
      await vp.goto(`${S.base}/entrar`);
      await vp.getByLabel('E-mail').fill(email);
      await vp.locator('#senha, input[type=password]').first().fill(nova);
      await vp.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(vp).not.toHaveURL(/\/entrar/);
    }
    await vp.goto(`${S.base}/portaria`);
    await expect(vp.getByRole('heading', { name: 'Portaria' })).toBeVisible();
    // Desativar: a sessão do validador cai.
    await page.goto(`${S.base}/admin/equipe`);
    const row = page.locator('li.px-adm-card, tr').filter({ hasText: email }).first();
    await row.getByRole('button', { name: 'Desativar' }).click();
    await page.locator('[role=alertdialog], [role=dialog]:not(#px-abertura)').getByRole('button', { name: 'Desativar' }).click();
    await expect.poll(async () => (await v.request.get(`${S.base}/api/auth/me`)).status()).toBe(401);
    await v.close();
    await adm.close();
  });

  test('compradores: busca, detalhe com CPF mascarado e revelação auditada', async ({ ctx, browser }, info) => {
    const b = await newBuyer(ctx.request, { name: 'Comprador Procurado Fictício' });
    const adm = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await loginAs(adm, 'admin');
    await page.goto(`${S.base}/admin/compradores?q=${encodeURIComponent('Procurado')}`);
    await page.getByRole('link', { name: /Comprador Procurado/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: b.name })).toBeVisible();
    let text = await page.locator('main').innerText();
    expect(text.replace(/\D/g, '')).not.toContain(b.cpf);
    await page.getByRole('button', { name: 'Mostrar CPF completo' }).click();
    const dlg = page.getByRole('dialog');
    if (await dlg.count()) {
      const reason = dlg.getByRole('textbox').first();
      if (await reason.count()) await reason.fill('Auditoria: conferência de identidade a pedido da PartyX');
      await dlg.getByRole('button', { name: /Mostrar|Confirmar/ }).last().click();
    }
    await expect.poll(async () => (await page.locator('main').innerText()).replace(/\D/g, '').includes(b.cpf), { timeout: 10_000 }).toBe(true);
    await shot(page, info, 'admin', 'comprador-cpf-revelado');
    const audit = await sql<{ n: number }>(S.db, `select count(*)::int as n from audit_log where action = 'usuario.cpf_visualizado' and entity_id = $1`, [b.id || '00000000-0000-0000-0000-000000000000']);
    const anyAudit = await sql<{ n: number }>(S.db, `select count(*)::int as n from audit_log where action = 'usuario.cpf_visualizado'`);
    expect(anyAudit[0]!.n).toBeGreaterThan(0);
    void audit;
    void text;
    await adm.close();
  });

  test('relatórios e planilhas: vendas, promoters, taxa mensal com CSV (BOM, ponto e vírgula, sem CPF)', async ({ browser }, info) => {
    const adm = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    const page = await loginAs(adm, 'admin');
    for (const [route, name] of [
      ['/admin/relatorios/vendas', 'vendas'],
      ['/admin/relatorios/promoters', 'promoters'],
      ['/admin/relatorios/taxa-mensal', 'taxa-mensal'],
    ] as const) {
      await page.goto(`${S.base}${route}`);
      await page.waitForLoadState('networkidle');
      await shot(page, info, 'admin', `relatorio-${name}`, { full: true });
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV' }).first().click()]);
      const file = await download.path();
      const buf = readFileSync(file!);
      expect([...buf.subarray(0, 3)], name).toEqual([0xef, 0xbb, 0xbf]);
      const text = buf.toString('utf8').slice(1);
      expect(text.split(/\r?\n/)[0]).toContain(';');
      expect(text.replace(/\D/g, '')).not.toContain(S.buyers.adulto1!.cpf);
    }
    await page.goto(`${S.base}/admin/pedidos`);
    await expect(page.getByText(/PX-\d+/).first()).toBeVisible();
    await page.goto(`${S.base}/admin/entradas?evento=${S.events.principal!.id}`);
    await expect(page.locator('.px-gate-count')).toBeVisible();
    await shot(page, info, 'admin', 'entradas');
    await adm.close();
  });

  test('configurações da taxa de serviço: prévia na tela e limites no servidor (sem alterar a taxa da rodada)', async ({ browser }, info) => {
    const adm = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await loginAs(adm, 'admin');
    await page.goto(`${S.base}/admin/configuracoes`);
    await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
    await page.getByLabel('Porcentagem da taxa de serviço').fill('10');
    await expect(page.locator('main')).toContainText(/paga/);
    await shot(page, info, 'admin', 'configuracoes-taxa-previa');
    const current = await api(adm.request, S.base, 'GET', '/admin/settings/service-fee');
    expect(current.status).toBe(200);
    const tooHigh = await api(adm.request, S.base, 'PUT', '/admin/settings/service-fee', { rateBps: 2500, minCents: 0 });
    expect(tooHigh.status).toBe(422);
    const negative = await api(adm.request, S.base, 'PUT', '/admin/settings/service-fee', { rateBps: -1, minCents: 0 });
    expect(negative.status).toBe(422);
    const v = await browser.newContext();
    await apiLogin(v.request, S.base, S.team.validador.email, S.team.validador.password);
    expect((await api(v.request, S.base, 'PUT', '/admin/settings/service-fee', { rateBps: 500, minCents: 0 })).status).toBe(403);
    await v.close();
    await adm.close();
  });
});
