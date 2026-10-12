import { createHmac, randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { sql } from './helpers';
import type { RoteiroState } from './roteiro-setup';

/**
 * Pagamento no roteiro, com o gateway escolhido no setup:
 * - `sandbox`: Mercado Pago, ambiente de TESTE. O cartão é digitado no Card Payment Brick (campos seguros do Mercado Pago, titular
 *   APRO aprova e OTHE recusa) e o Pix com pagador APRO é aprovado pelo próprio Mercado Pago. A ENTREGA do webhook é montada aqui e
 *   assinada com a assinatura secreta da aplicação da PartyX, porque o Mercado Pago não alcança o servidor local e as notificações
 *   das compras de teste vêm assinadas pela aplicação do usuário de teste (docs/pagamento-mercadopago.md). O servidor reconsulta a
 *   order REAL antes de agir.
 * - `ficticio`: gateway fictício do ambiente local. Aprovação e recusa pelos botões do simulador na própria página do pedido.
 */
export interface Notification {
  send(): Promise<{ status: number; body: any }>;
}

const MP = 'https://api.mercadopago.com';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let lastCharge = 0;

/** O antifraude do ambiente de teste recusa rajadas (`high_risk`): espaça as cobranças em pelo menos 8 s. */
async function spaceCharges() {
  const wait = lastCharge + 8000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCharge = Date.now();
}

async function mpOrder(id: string) {
  const res = await fetch(`${MP}/v1/orders/${id}`, { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } });
  return (await res.json()) as { status?: string; status_detail?: string };
}

export function payments(state: RoteiroState) {
  const gatewayId = async (orderId: string) => {
    for (let i = 0; i < 40; i++) {
      const [row] = await sql<{ gid: string | null }>(state.db, `select gateway_payment_id as gid from orders where id = $1`, [
        orderId,
      ]);
      if (row?.gid) return row.gid;
      await sleep(250);
    }
    throw new Error('pedido sem cobrança no gateway');
  };

  /** Notificação do tópico order no formato do Mercado Pago, assinada (manifesto id;request-id;ts). Reenviável sem mudar nada. */
  const notification = (gid: string, action: string): Notification => {
    const ts = String(Math.floor(Date.now() / 1000));
    const rid = randomUUID();
    const v1 = createHmac('sha256', process.env.MP_WEBHOOK_SECRET!)
      .update(`id:${gid.toLowerCase()};request-id:${rid};ts:${ts};`)
      .digest('hex');
    const body = JSON.stringify({
      action,
      api_version: 'v1',
      data: { id: gid, type: 'online' },
      date_created: new Date().toISOString(),
      live_mode: false,
      type: 'order',
      user_id: state.mpCollector,
    });
    return {
      async send() {
        const res = await fetch(`${state.base}/api/webhooks/payments?data.id=${gid}&type=order`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid },
          body,
        });
        return { status: res.status, body: await res.json().catch(() => null) };
      },
    };
  };

  const simulate = async (page: Page, status: 'aprovado' | 'recusado') => {
    await page.getByRole('region', { name: 'Simulador do ambiente local' }).getByRole('button', { name: status, exact: true }).click();
  };

  return {
    label: state.gateway === 'sandbox' ? 'Mercado Pago (ambiente de teste)' : 'gateway fictício (local)',

    /** Escolhe Pix e gera a cobrança. A tela precisa mostrar o QR e o copia e cola. */
    async startPix(page: Page) {
      if (state.gateway === 'sandbox') await spaceCharges();
      await page.getByRole('radio', { name: /^Pix/ }).click();
      await page.getByRole('button', { name: /^Gerar Pix de/ }).click();
      await expect(page.getByRole('heading', { name: 'Pague com Pix' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Pix copia e cola' })).not.toBeEmpty();
    },

    /**
     * Pix pago. Sandbox: espera o Mercado Pago aprovar a order (pagador APRO) e entrega a notificação assinada; devolve a notificação
     * para o item 11 reenviá-la idêntica. Fictício: botão "aprovado" do simulador (a notificação é montada no servidor).
     */
    async approvePix(page: Page, orderId: string): Promise<Notification | null> {
      if (state.gateway === 'ficticio') {
        await simulate(page, 'aprovado');
        return null;
      }
      const gid = await gatewayId(orderId);
      let status = '';
      for (let i = 0; i < 60 && status !== 'processed'; i++) {
        status = (await mpOrder(gid)).status ?? '';
        if (status !== 'processed') await sleep(3000);
      }
      expect(status, 'o Mercado Pago (teste) não aprovou o Pix do pagador APRO em 3 min').toBe('processed');
      const n = notification(gid, 'order.processed');
      expect((await n.send()).status).toBe(200);
      return n;
    },

    /** Cartão: APRO aprova e OTHE recusa (nomes de titular da documentação do Mercado Pago; no fictício, o simulador). */
    async payCard(page: Page, orderId: string, holder: 'APRO' | 'OTHE') {
      await page.getByRole('radio', { name: /^Cartão de crédito/ }).click();
      if (state.gateway === 'ficticio') {
        // O fictício "leva" a uma página externa que não existe; a resposta vem do simulador, como faria o retorno do gateway.
        await page.route('https://pagamento.ficticio.invalid/**', r =>
          r.fulfill({ contentType: 'text/html', body: '<h1>Pagamento fictício</h1>' }),
        );
        await page.getByRole('button', { name: 'Continuar para o cartão' }).click();
        await page.waitForURL(/pagamento\.ficticio\.invalid/);
        await page.goto(`${state.base}/pedido/${orderId}`);
        await simulate(page, holder === 'APRO' ? 'aprovado' : 'recusado');
        return;
      }
      await spaceCharges();
      await page.getByRole('button', { name: 'Continuar para o cartão' }).click();
      await expect(page.getByRole('heading', { name: 'Pague com cartão' })).toBeVisible();
      // Campos seguros do Mercado Pago: um quadro por campo; dentro de cada um há campos ocultos auxiliares.
      const frame = (name: string) => page.frameLocator(`iframe[name="${name}"]`).locator(`input#${name}`);
      await expect(frame('cardNumber')).toBeVisible({ timeout: 30_000 });
      // Visa de teste da documentação (o mesmo da suíte do sandbox). Digitado tecla a tecla: o Brick consulta a bandeira pelo BIN.
      await frame('cardNumber').pressSequentially('4235647728025682', { delay: 40 });
      await frame('expirationDate').pressSequentially('1130', { delay: 40 });
      await frame('securityCode').pressSequentially('123', { delay: 40 });
      await page.locator('.px-card-brick input[name="HOLDER_NAME"]').fill(holder);
      await page.locator('.px-card-brick input[name="DOCUMENT"]').pressSequentially('12345678909', { delay: 20 });
      await page.keyboard.press('Tab');
      // O Brick valida os campos seguros de forma assíncrona: um clique cedo demais mostra "Preencha todos os dados". Nesse caso,
      // espera e clica de novo (no máximo 3 vezes); o servidor só recebe o token quando o Brick aceita o envio.
      const incomplete = page.getByText('Preencha todos os dados para continuar');
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.waitForTimeout(1000);
        await page.getByRole('button', { name: /^Pagar/ }).click();
        const left = await Promise.race([
          page.waitForURL(u => !u.pathname.startsWith('/pedido/'), { timeout: 8000 }).then(() => 'saiu'),
          incomplete.waitFor({ state: 'visible', timeout: 8000 }).then(() => 'incompleto'),
          page.getByRole('heading', { name: 'Pague com cartão' }).waitFor({ state: 'detached', timeout: 8000 }).then(() => 'enviado'),
        ]).catch(() => 'enviado');
        if (left !== 'incompleto') return;
        await page.getByRole('button', { name: 'Fechar' }).or(page.locator('[aria-label="close"], [aria-label="Fechar"]')).first().click().catch(() => {});
      }
      throw new Error('o Brick não aceitou o envio do cartão em 3 tentativas');
    },

    /** Sandbox: notificação montada para a cobrança do pedido (item 11). Fictício: null. */
    async notificationFor(orderId: string, action = 'order.processed') {
      if (state.gateway === 'ficticio') return null;
      return notification(await gatewayId(orderId), action);
    },
  };
}
