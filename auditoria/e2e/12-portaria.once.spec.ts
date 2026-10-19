import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scanQr } from '../../e2e/support/camera';
import { api, apiLogin, buyPaid, CAPTURAS, expect, expectNoOverflow, loginAs, newBuyer, S, shot, sql, test } from './support/fixtures';

const principal = () => S.events.principal!;

test.describe('portaria', () => {
  test('leitura pela câmera simulada: válido, reutilizado, cancelado, transferido (QR antigo), de outro evento, adulterado', async ({ ctx, browser }) => {
    await newBuyer(ctx.request);
    const { tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 3 }]);
    const adm = await browser.newContext();
    await apiLogin(adm.request, S.base, S.team.admin.email, S.team.admin.password);
    expect((await api(adm.request, S.base, 'POST', `/admin/tickets/${tickets[1]!.id}/cancel`, { reason: 'Auditoria: caso cancelado na portaria', confirm: true })).status).toBe(200);
    // Transferido: o QR antigo do terceiro ingresso deixa de valer.
    const dest = S.buyers.adulto5!;
    const oldQr = tickets[2]!.qr_payload;
    expect((await api(ctx.request, S.base, 'POST', `/tickets/${tickets[2]!.id}/transfer`, { destination: dest.email, confirm: true })).status).toBe(200);
    const other = S.orders.outro!.tickets[0]!;
    const adulterated = tickets[0]!.qr_payload.slice(0, -2) + (tickets[0]!.qr_payload.endsWith('A') ? 'BB' : 'AA');
    const cases: [string, string, 'ok' | 'warn' | 'err', RegExp][] = [
      ['valido', tickets[0]!.qr_payload, 'ok', /^Válido/],
      ['reutilizado', tickets[0]!.qr_payload, 'warn', /^Já utilizado/],
      ['cancelado', tickets[1]!.qr_payload, 'err', /^Cancelado/],
      ['transferido-qr-antigo', oldQr, 'err', /^Inválido/],
      ['outro-evento', other.qr, 'err', /^Outro evento/],
      ['adulterado', adulterated, 'err', /^Inválido/],
    ];
    const dir = path.join(CAPTURAS, 'portaria');
    mkdirSync(dir, { recursive: true });
    for (const [name, qr, tone, title] of cases) {
      const scan = await scanQr(S.base, principal().id, qr, { email: S.team.validador.email });
      try {
        await scan.page.screenshot({ path: path.join(dir, `camera-${name}.jpg`), type: 'jpeg', quality: 70 });
        expect(scan.result!.title, name).toMatch(title);
        expect(scan.result!.tone, name).toBe(tone);
        if (name === 'transferido-qr-antigo') expect(scan.result!.text).toMatch(/transferido/);
        if (name === 'reutilizado') expect(scan.result!.text).toMatch(/\d{2}:\d{2}/);
        await expectNoOverflow(scan.page, `portaria ${name}`);
      } finally {
        await scan.close();
      }
    }
    expect((await sql<{ s: string }>(S.db, `select status as s from tickets where id = $1`, [tickets[0]!.id]))[0]!.s).toBe('utilizado');
    await adm.close();
  });

  test('busca manual: por nome, por código e por CPF, com CPF mascarado; confirmar entrada', async ({ ctx, browser }, info) => {
    const b = await newBuyer(ctx.request, { name: 'Busca Manual Fictícia' });
    const { tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 2 }]);
    const g = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await loginAs(g, 'validador');
    await page.goto(`${S.base}/portaria/${principal().id}`);
    await page.getByRole('tab', { name: 'Busca manual' }).click();
    const search = async (q: string) => {
      await page.getByLabel('Código, nome, CPF ou e-mail').fill(q);
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(page.locator('.px-gate-hits li').first().or(page.locator('.px-gate-empty'))).toBeVisible();
    };
    await search('Busca Manual');
    const hits = page.locator('.px-gate-hits li');
    await expect(hits).toHaveCount(2);
    const body = await page.locator('main').innerText();
    expect(body.replace(/\D/g, '')).not.toContain(b.cpf);
    expect(/CPF ([^\n]+)/.exec(await hits.first().innerText())?.[1] ?? '').toMatch(/\*/);
    await expectNoOverflow(page, 'busca manual');
    await shot(page, info, 'portaria', 'busca-por-nome', { all: true });
    await search(b.cpf);
    await expect(hits).toHaveCount(2);
    await search(tickets[0]!.short_code);
    await expect(hits).toHaveCount(1);
    await hits.first().getByRole('button', { name: 'Confirmar entrada' }).click();
    await expect(page.locator('.px-gate-result .px-gate-title')).toHaveText(/^Válido/);
    await shot(page, info, 'portaria', 'entrada-manual-confirmada', { all: true });
    expect((await sql<{ s: string }>(S.db, `select status as s from tickets where id = $1`, [tickets[0]!.id]))[0]!.s).toBe('utilizado');
    await g.close();
  });

  test('câmera negada pelo aparelho: mensagem clara e caminho para a busca manual', async ({ browser }, info) => {
    const g = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: [] });
    const page = await loginAs(g, 'validador');
    await page.goto(`${S.base}/portaria/${principal().id}`);
    await page.getByRole('button', { name: 'Iniciar leitura' }).click();
    await expect(page.getByText(/câmera foi bloqueada|Não foi possível usar a câmera/)).toBeVisible({ timeout: 15_000 });
    await shot(page, info, 'portaria', 'camera-negada', { all: true });
    await expect(page.getByRole('tab', { name: 'Busca manual' })).toBeVisible();
    await g.close();
  });

  test('dois validadores no mesmo ingresso ao mesmo tempo: uma entrada só', async ({ ctx, browser }) => {
    await newBuyer(ctx.request);
    const { tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    const v1 = await browser.newContext();
    const v2 = await browser.newContext();
    await apiLogin(v1.request, S.base, S.team.validador.email, S.team.validador.password);
    await apiLogin(v2.request, S.base, S.team.validador2.email, S.team.validador2.password);
    const body = { eventId: principal().id, qr: tickets[0]!.qr_payload };
    const [r1, r2] = await Promise.all([api(v1.request, S.base, 'POST', '/gate/scan', body), api(v2.request, S.base, 'POST', '/gate/scan', body)]);
    const results = [r1.json.result, r2.json.result].sort();
    expect(results).toEqual(['ja_utilizado', 'valido']);
    const checkins = await sql<{ n: number }>(S.db, `select count(*)::int as n from checkins where ticket_id = $1 and result = 'valido'`, [tickets[0]!.id]);
    expect(checkins[0]!.n).toBe(1);
    await v1.close();
    await v2.close();
  });

  test('lista de contingência impressa: PDF e CSV do evento, com CPF mascarado', async ({ browser }, info) => {
    const adm = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await loginAs(adm, 'admin');
    await page.goto(`${S.base}/admin/eventos/${principal().id}`);
    await page.getByRole('tab', { name: /Entradas|Portaria/ }).click().catch(() => {});
    const pdfLink = page.getByRole('link', { name: 'Baixar PDF para imprimir' }).first();
    if (await pdfLink.count()) {
      await shot(page, info, 'portaria', 'lista-contingencia-painel');
    }
    const pdf = await adm.request.get(`${S.base}/api/admin/exports/events/${principal().id}/contingency.pdf`);
    expect(pdf.status()).toBe(200);
    const dir = path.join(CAPTURAS, 'portaria');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'lista-contingencia.pdf');
    const buf = await pdf.body();
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    writeFileSync(file, buf);
    const text = execFileSync('pdftotext', [file, '-']).toString();
    expect(text).toContain(principal().name);
    expect(text).toMatch(/\*\*\*/);
    expect(text).toMatch(/CONFIDENCIAL/i);
    execFileSync('pdftoppm', ['-jpeg', '-r', '50', '-singlefile', file, path.join(dir, 'lista-contingencia-pagina1')]);
    const csv = await adm.request.get(`${S.base}/api/admin/exports/events/${principal().id}/contingency.csv`);
    expect(csv.status()).toBe(200);
    const body = await csv.body();
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    await adm.close();
  });
});
