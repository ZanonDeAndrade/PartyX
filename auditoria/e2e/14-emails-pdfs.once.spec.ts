import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { api, apiLogin, buyPaid, CAPTURAS, capturedEmails, createOrder, expect, mockStatus, newBuyer, S, test } from './support/fixtures';

const principal = () => S.events.principal!;
const baile = () => S.events.menores!;

test.describe('e-mails e PDFs gerados', () => {
  test('todos os modelos de e-mail: conteúdo, links, rodapé e renderização a 360 px', async ({ ctx, browser }) => {
    // Gera os modelos nesta rodada: cadastro, recuperação, compra, transferência (enviada, recebida, desfeita).
    const a = await newBuyer(ctx.request, { name: 'Remetente E-mail Fictício' });
    await ctx.clearCookies();
    const forgot = await ctx.request.post(`${S.base}/api/auth/password/forgot`, { data: { email: a.email }, headers: { origin: S.base } });
    expect(forgot.status()).toBe(202);
    await apiLogin(ctx.request, S.base, a.email, a.password);
    const { tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 1 }]);
    const bCtx = await browser.newContext();
    const b = await newBuyer(bCtx.request, { name: 'Destino E-mail Fictício' });
    expect((await api(ctx.request, S.base, 'POST', `/tickets/${tickets[0]!.id}/transfer`, { destination: b.email, confirm: true })).status).toBe(200);
    const adm = await browser.newContext();
    await apiLogin(adm.request, S.base, S.team.admin.email, S.team.admin.password);
    expect((await api(adm.request, S.base, 'POST', `/admin/tickets/${tickets[0]!.id}/transfer/undo`, { reason: 'Auditoria: fraude comprovada pela PartyX', confirm: true })).status).toBe(200);
    const expected: [string, string][] = [
      ['cadastro', a.email],
      ['recuperacao_senha', a.email],
      ['compra_confirmada', a.email],
      ['transferencia_enviada', a.email],
      ['transferencia_recebida', b.email],
      ['transferencia_desfeita', a.email],
      ['transferencia_desfeita', b.email],
    ];
    for (const [template, to] of expected)
      await expect.poll(() => capturedEmails({ to, template }).length, { timeout: 20_000, message: `${template} para ${to}` }).toBeGreaterThan(0);
    const dir = path.join(CAPTURAS, 'emails');
    mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
    const report: string[] = ['| Modelo | Assunto | Links | Observações |', '|---|---|---|---|'];
    const seen = new Set<string>();
    const all = [...expected, ...(capturedEmails({ template: 'pagamento_sem_estoque' }).length ? [['pagamento_sem_estoque', capturedEmails({ template: 'pagamento_sem_estoque' })[0]!.to] as [string, string]] : [])];
    for (const [template, to] of all) {
      if (seen.has(template)) continue;
      seen.add(template);
      const m = capturedEmails({ to, template }).at(-1)!;
      const links = [...m.html.matchAll(/href="([^"]+)"/g)].map(x => x[1]!.replace(/&amp;/g, '&'));
      const external = links.filter(l => !l.startsWith(S.base) && !l.startsWith('mailto:') && !l.startsWith('https://wa.me') && !l.startsWith('tel:'));
      expect(external, `${template}: links fora do site`).toEqual([]);
      expect(m.html).not.toMatch(/undefined|NaN|\[object/);
      expect(m.txt).not.toMatch(/undefined|NaN/);
      expect(m.subject.startsWith('[LOCAL]')).toBe(true);
      expect(m.txt).toContain('atendimento@partyx.test');
      await page.setContent(m.html);
      await page.screenshot({ path: path.join(dir, `${template}-360.jpg`), type: 'jpeg', quality: 70, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      await page.setViewportSize({ width: 600, height: 800 });
      await page.screenshot({ path: path.join(dir, `${template}-600.jpg`), type: 'jpeg', quality: 70, fullPage: true });
      await page.setViewportSize({ width: 360, height: 800 });
      writeFileSync(path.join(dir, `${template}.html`), m.html);
      report.push(`| ${template} | ${m.subject.replace(/\|/g, '/')} | ${links.length} | ${overflow ? '**rolagem horizontal a 360 px**' : 'cabe a 360 px'} |`);
    }
    writeFileSync(path.join(dir, 'resumo.md'), report.join('\n') + '\n');
    await page.close();
    await bCtx.close();
    await adm.close();
  });

  test('PDF do ingresso, do pedido e Termo de Autorização: A4, texto certo, sem CPF, QR legível', async ({ ctx, browser }) => {
    const b = await newBuyer(ctx.request, { name: 'Dono do PDF Fictício' });
    const { orderId, tickets } = await buyPaid(ctx.request, principal().slug, [{ ticketTypeId: principal().types.vip!, quantity: 2 }]);
    const dir = path.join(CAPTURAS, 'pdfs');
    mkdirSync(dir, { recursive: true });
    const fetchPdf = async (p: string, name: string) => {
      const res = await ctx.request.get(`${S.base}/api${p}`);
      expect(res.status(), p).toBe(200);
      expect(res.headers()['content-type']).toContain('application/pdf');
      const file = path.join(dir, `${name}.pdf`);
      writeFileSync(file, await res.body());
      const info = execFileSync('pdfinfo', [file]).toString();
      const text = execFileSync('pdftotext', ['-layout', file, '-']).toString();
      execFileSync('pdftoppm', ['-jpeg', '-r', '60', '-f', '1', '-l', '1', '-singlefile', file, path.join(dir, `${name}-pagina1`)]);
      return { info, text };
    };
    const t1 = await fetchPdf(`/tickets/${tickets[0]!.id}/pdf`, 'ingresso');
    expect(t1.info).toMatch(/Page size:\s+595\.?\d* x 841\.?\d*/);
    expect(t1.text).toContain(principal().name);
    expect(t1.text).toContain(tickets[0]!.short_code);
    expect(t1.text).toContain(b.name.split(' ')[0]!);
    expect(t1.text.replace(/\D/g, '')).not.toContain(b.cpf);
    expect(t1.text).toMatch(/R\$\s*150,00/);
    const order = await fetchPdf(`/orders/${orderId}/tickets/pdf`, 'pedido');
    expect(order.info).toMatch(/Pages:\s+2/);
    expect(order.text).toContain(tickets[1]!.short_code);
    // QR do PDF legível: a página rasterizada é lida pelo mesmo leitor usado na portaria (jsqr) via pdftoppm em PNG.
    const png = path.join(dir, 'ingresso-qr.png');
    execFileSync('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', '-singlefile', path.join(dir, 'ingresso.pdf'), png.replace(/\.png$/, '')]);
    const qrText = await readQr(png);
    expect(qrText).toBe(tickets[0]!.qr_payload);
    // Termo de Autorização de um pedido de menor.
    const teen = await browser.newContext();
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 17);
    d.setUTCDate(d.getUTCDate() - 40);
    const kid = await newBuyer(teen.request, { name: 'Jovem do Termo Fictício', birth: d.toISOString().slice(0, 10) });
    await teen.clearCookies();
    await apiLogin(teen.request, S.base, kid.email, kid.password);
    const term = (await (await teen.request.get(`${S.base}/api/public/legal/termo-menor`)).json()) as { document?: { version?: string }; version?: string };
    const version = term.document?.version ?? term.version ?? null;
    const created = await createOrder(teen.request, baile().slug, [{ ticketTypeId: baile().types.pista!, quantity: 1 }], { minorTermAccepted: true, minorTermVersion: version });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const kidOrder = created.json.order.id as string;
    await api(teen.request, S.base, 'POST', `/orders/${kidOrder}/payment`, { method: 'pix' });
    await mockStatus(teen.request, kidOrder, 'aprovado');
    const res = await teen.request.get(`${S.base}/api/orders/${kidOrder}/autorizacao-menor.pdf`);
    expect(res.status()).toBe(200);
    const file = path.join(dir, 'termo-autorizacao.pdf');
    writeFileSync(file, await res.body());
    const termInfo = execFileSync('pdfinfo', [file]).toString();
    expect(termInfo).toMatch(/Page size:\s+595\.?\d* x 841\.?\d*/);
    const termText = execFileSync('pdftotext', ['-layout', file, '-']).toString();
    expect(termText).toContain(baile().name);
    expect(termText).toContain(kid.name);
    expect(termText.replace(/\D/g, '')).not.toContain(kid.cpf);
    execFileSync('pdftoppm', ['-jpeg', '-r', '60', '-singlefile', file, path.join(dir, 'termo-autorizacao-pagina1')]);
    await teen.close();
  });
});

async function readQr(png: string): Promise<string | null> {
  const jsqr = (await import('jsqr')).default;
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const code = jsqr(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
  return code?.data ?? null;
}
