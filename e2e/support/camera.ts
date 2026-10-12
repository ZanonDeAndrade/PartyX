import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import QRCode from 'qrcode';
import { apiLogin, PASSWORD_TEAM, prepareContext } from './helpers';

/**
 * Portaria com a câmera SIMULADA do Chromium: o QR de verdade (o mesmo conteúdo do ingresso) vira um vídeo que o navegador entrega
 * como se fosse a câmera, e a página lê com o mesmo leitor do celular. Não substitui o ensaio com aparelhos (seção 11.4).
 */
async function qrVideo(text: string): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), 'partyx-qr-'));
  const png = path.join(dir, 'qr.png');
  const y4m = path.join(dir, 'qr.y4m');
  await QRCode.toFile(png, text, { width: 360, margin: 4 });
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-loop',
    '1',
    '-i',
    png,
    '-vf',
    'pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p',
    '-t',
    '2',
    '-r',
    '10',
    y4m,
  ]);
  return y4m;
}

export interface ScanResult {
  title: string;
  tone: 'ok' | 'warn' | 'err';
  text: string;
  background: string;
}

/**
 * Abre a portaria do evento como validador, aponta a "câmera" para o QR e devolve o resultado mostrado em tela cheia.
 * `keep` deixa a página aberta para captura; quem chama fecha com `close()`.
 */
export async function scanQr(
  base: string,
  eventId: string,
  qr: string,
  opts: {
    email?: string;
    password?: string;
    viewport?: { width: number; height: number };
    /** Antes de abrir a portaria (ex.: interceptar a consulta ao servidor). */
    before?: (page: Page) => Promise<unknown>;
    /** false: não espera resultado (câmera lendo, falha de rede); devolve `result: null` depois de 1,5 s. */
    waitResult?: boolean;
  } = {},
): Promise<{ result: ScanResult | null; page: Page; close: () => Promise<void> }> {
  const video = await qrVideo(qr);
  const browser: Browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
  });
  const width = opts.viewport?.width ?? 390;
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: 390, height: 844 },
    isMobile: width < 768,
    hasTouch: width < 768,
    permissions: ['camera'],
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  await prepareContext(ctx);
  await apiLogin(ctx.request, base, opts.email ?? 'validador@exemplo.com', opts.password ?? PASSWORD_TEAM);
  const page = await ctx.newPage();
  if (opts.before) await opts.before(page);
  await page.goto(`${base}/portaria/${eventId}`);
  await page.getByRole('button', { name: 'Iniciar leitura' }).click();
  if (opts.waitResult === false) {
    await page.waitForTimeout(1500);
    return { result: null, page, close: () => browser.close() };
  }
  const box = page.locator('.px-gate-result');
  await expect(box).toBeVisible({ timeout: 15_000 });
  const cls = (await box.getAttribute('class')) ?? '';
  const result: ScanResult = {
    title: ((await box.locator('.px-gate-title').textContent()) ?? '').trim(),
    tone: (/px-gate-r-(ok|warn|err)/.exec(cls)?.[1] ?? 'err') as ScanResult['tone'],
    text: await box.innerText(),
    background: await box.evaluate(el => getComputedStyle(el).backgroundColor),
  };
  return { result, page, close: () => browser.close() };
}
