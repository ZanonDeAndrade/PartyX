import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { acceptPolicy, CAPTURAS, chooseTickets, expect, expectNoOverflow, loginAs, newBuyer, orderRow, S, shot, test } from './support/fixtures';

const baile = () => S.events.menores!;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Nascimento para ter `age` anos completos na data do evento (10 dias antes do aniversário seguinte). */
function birthForAge(eventStartsAt: string, age: number) {
  const d = new Date(eventStartsAt);
  d.setUTCFullYear(d.getUTCFullYear() - age);
  d.setUTCDate(d.getUTCDate() - 10);
  return ymd(d);
}

test.describe('menores de idade (16 e 17 anos)', () => {
  for (const age of [17, 16]) {
    test(`comprador de ${age} anos: aceita o Termo de Ciência no checkout, paga e baixa o Termo de Autorização`, async ({ ctx }, info) => {
      const b = await newBuyer(ctx.request, { birth: birthForAge(baile().startsAt, age), name: `Jovem ${age} Fictício` });
      const page = await loginAs(ctx, b);
      await chooseTickets(page, S.base, baile().slug, { Pista: 1 });
      await expect(page.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
      const term = page.getByRole('heading', { name: 'Termo de Ciência para Menores de Idade' });
      await expect(term).toBeVisible();
      await expect(page.getByText(`Você terá ${age} anos na data do evento.`)).toBeVisible();
      await acceptPolicy(page);
      const pay = page.getByRole('button', { name: 'Ir para o pagamento' }).first();
      await expect(pay).toBeDisabled();
      await page.getByLabel('Li e aceito o Termo de Ciência para Menores de Idade.').check();
      await expect(pay).toBeEnabled();
      await expectNoOverflow(page, 'termo de ciência no checkout');
      await shot(page, info, 'menores', `termo-ciencia-${age}`, { full: true });
      await pay.click();
      await expect(page).toHaveURL(/\/pedido\//);
      const orderId = page.url().split('/pedido/')[1]!;
      await page.getByRole('radio', { name: /^Pix/ }).click();
      await page.getByRole('button', { name: /^Gerar Pix de/ }).click();
      await page.getByRole('region', { name: 'Simulador do ambiente local' }).getByRole('button', { name: 'aprovado', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Compra confirmada' })).toBeVisible({ timeout: 30_000 });
      expect((await orderRow(orderId)).status).toBe('pago');
      await page.goto(`${S.base}/meus-ingressos`);
      const link = page.getByRole('link', { name: /Autorização para menores/ }).first();
      await expect(link).toBeVisible();
      await shot(page, info, 'menores', `meus-ingressos-${age}`);
      const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
      const dir = path.join(CAPTURAS, 'menores');
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `termo-autorizacao-${age}-${info.project.name}.pdf`);
      await download.saveAs(file);
      const text = execFileSync('pdftotext', [file, '-']).toString();
      expect(text).toMatch(/Autoriza/i);
      expect(text).toContain(baile().name);
      expect(text.replace(/\D/g, '')).not.toContain(b.cpf);
    });
  }

  test('evento 18+ recusa comprador de 17 anos no servidor, com aviso claro na revisão', async ({ ctx }, info) => {
    const principal = S.events.principal!;
    const b = await newBuyer(ctx.request, { birth: birthForAge(principal.startsAt, 17), name: 'Jovem Dezoito Mais Fictício' });
    const page = await loginAs(ctx, b);
    await chooseTickets(page, S.base, principal.slug, { VIP: 1 });
    await expect(page.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Este evento é só para quem tiver 18 anos ou mais na data do evento.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ir para o pagamento' }).first()).toBeDisabled();
    await shot(page, info, 'menores', 'evento-18-recusa-17');
  });

  test('termo de autorização público do evento que permite menores, sem dado pessoal', async ({ ctx }) => {
    const res = await ctx.request.get(`${S.base}/api/public/events/${baile().slug}/autorizacao-menor.pdf`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/pdf');
    const body = await res.body();
    expect(body.subarray(0, 4).toString()).toBe('%PDF');
    const forbidden = await ctx.request.get(`${S.base}/api/public/events/${S.events.principal!.slug}/autorizacao-menor.pdf`);
    expect(forbidden.status()).toBe(404);
  });
});
