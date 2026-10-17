import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';

export const PASSWORD_TEAM = 'festa2026';
export const PASSWORD_BUYER = 'festa2026Forte';

let pool: pg.Pool | null = null;
/** Consulta direta ao banco de TESTE desta rodada, só para conferir o que a interface mostrou (nunca para pular etapa). */
export async function sql<T = Record<string, unknown>>(url: string, text: string, params: unknown[] = []): Promise<T[]> {
  pool ??= new pg.Pool({ connectionString: url, max: 2 });
  return (await pool.query(text, params)).rows as T[];
}

/** CPF fictício com dígitos verificadores válidos (o Mercado Pago falha a order com CPF inválido). */
export function cpfFor(n: number): string {
  const d = String(100000000 + n)
    .padStart(9, '0')
    .slice(-9)
    .split('')
    .map(Number);
  for (const len of [9, 10]) {
    const sum = d.slice(0, len).reduce((t, x, i) => t + x * (len + 1 - i), 0);
    d.push(((sum * 10) % 11) % 10);
  }
  return d.join('');
}
export const formatCpf = (c: string) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;

/**
 * Sem a abertura (aviso só de teste, lido por src/intro/abertura.js antes do carregamento) e com a seleção de ingresso limpa:
 * cada contexto começa como um visitante novo.
 */
export async function prepareContext(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    (window as unknown as { __partyxSemAbertura?: boolean }).__partyxSemAbertura = true;
  });
}

/**
 * Verificação humana (Turnstile) ligada, como na homologação: espera o widget devolver o token (campo oculto `cf-turnstile-response`)
 * antes de enviar o formulário. Sem isso, o clique sai antes do token e o servidor recusa com 422. No local o Turnstile fica desligado.
 */
export async function humanReady(page: Page) {
  const group = page.getByRole('group', { name: 'Verificação de que você não é um robô' });
  await expect(group).toBeVisible({ timeout: 30_000 });
  const field = group.locator('input[name="cf-turnstile-response"]');
  await expect.poll(async () => ((await field.count()) ? await field.first().inputValue() : ''), { timeout: 30_000 }).not.toBe('');
}

/** Entra pela API (mesmo cookie do navegador). Para os itens em que o login não é o assunto. */
export async function apiLogin(request: APIRequestContext, base: string, email: string, password: string) {
  const res = await request.post(`${base}/api/auth/login`, { data: { email, password }, headers: { origin: base } });
  expect(res.status(), `login ${email}`).toBe(200);
}

/** Chamada à API com a sessão do contexto, origem e token CSRF, como o próprio site faz. */
export async function api(request: APIRequestContext, base: string, method: string, path: string, data?: unknown) {
  const me = await request.get(`${base}/api/auth/me`);
  const csrf = me.ok() ? ((await me.json()) as { csrfToken?: string }).csrfToken : undefined;
  const res = await request.fetch(`${base}/api${path}`, {
    method,
    data,
    headers: { origin: base, ...(csrf ? { 'x-csrf-token': csrf } : {}) },
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status(), json };
}

/** CA-32: a página não pode ter rolagem horizontal. Devolve as larguras para a mensagem do teste. */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflow: el.scrollWidth > el.clientWidth };
  });
}

export async function expectNoOverflow(page: Page, what: string) {
  const r = await horizontalOverflow(page);
  expect(r.overflow, `${what}: scrollWidth ${r.scrollWidth} > clientWidth ${r.clientWidth}`).toBe(false);
}

/** Página do evento: escolhe as quantidades pelos botões "+" e segue para o checkout. */
export async function chooseTickets(page: Page, base: string, slug: string, items: Record<string, number>) {
  await page.goto(`${base}/eventos/${slug}`);
  for (const [type, n] of Object.entries(items))
    for (let i = 0; i < n; i++) await page.getByRole('button', { name: `Mais um ${type}`, exact: true }).click();
  // No celular o botão da lateral some e vale o da barra fixa: clica no "Continuar" visível.
  await page.getByRole('button', { name: 'Continuar', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/checkout/${slug}$`));
}

/** Caixa da Política de Cancelamento, Troca e Reembolso no checkout (D-80 atualizada): sem ela, "Ir para o pagamento" fica desabilitado. */
export async function acceptPolicy(page: Page): Promise<void> {
  const box = page.getByLabel('Li e aceito a Política de Cancelamento, Troca e Reembolso.');
  await expect(box).toBeEnabled();
  await box.check();
}

/** Checkout: revisão, código do promoter opcional e reserva. Devolve o id do pedido criado. */
export async function reserve(page: Page, coupon?: string): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
  if (coupon) {
    await page.getByLabel('Código', { exact: true }).fill(coupon);
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(`${coupon} aplicado. Total inalterado.`)).toBeVisible();
  }
  await acceptPolicy(page);
  await page.getByRole('button', { name: 'Ir para o pagamento' }).first().click();
  await expect(page).toHaveURL(/\/pedido\/[0-9a-f-]{36}$/);
  return page.url().split('/pedido/')[1]!;
}

export async function waitForEmail(
  request: APIRequestContext,
  base: string,
  to: string,
  template: string,
): Promise<{ template: string; to: string; subject: string; link: string | null }> {
  for (let i = 0; i < 40; i++) {
    const res = await request.get(`${base}/api/dev/emails?to=${encodeURIComponent(to)}`);
    const { emails } = (await res.json()) as { emails: { template: string; to: string; subject: string; link: string | null }[] };
    const hit = emails.filter(e => e.template === template).at(-1);
    if (hit) return hit;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`e-mail ${template} para ${to} não chegou`);
}
