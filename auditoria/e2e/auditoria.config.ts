import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Auditoria de entrega (19/10/2026): cenários de ponta a ponta no servidor LOCAL (gateway fictício), em Chromium, WebKit e Firefox a
 * 360, 390 e 1280 px. Os arquivos `*.ui.spec.ts` rodam nos 9 projetos; os `*.once.spec.ts` (regras de servidor, concorrência, portaria
 * com câmera simulada, e-mails e PDFs) rodam uma vez, em chromium-1280.
 * Uso: npx vite build && npx playwright test -c auditoria/e2e/auditoria.config.ts [--project=chromium-360]
 */
const RUN = path.join(import.meta.dirname, '.run');
const mobile = (width: number, height: number, browserName: 'chromium' | 'webkit' | 'firefox') => ({
  browserName,
  viewport: { width, height },
  deviceScaleFactor: 2,
  // Firefox não aceita isMobile/hasTouch no Playwright.
  ...(browserName === 'firefox' ? {} : { isMobile: true, hasTouch: true }),
  ...(browserName === 'webkit' ? { userAgent: devices['iPhone 13'].userAgent } : {}),
  ...(browserName === 'chromium' ? { userAgent: devices['Pixel 7'].userAgent } : {}),
});
const ui = { testMatch: /.*\.ui\.spec\.ts/ };
const once = { testMatch: /.*\.(ui|once)\.spec\.ts/ };

export default defineConfig({
  testDir: '.',
  globalSetup: './support/setup.ts',
  globalTeardown: './support/teardown.ts',
  workers: Number(process.env.AUDIT_WORKERS ?? 3),
  fullyParallel: true,
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(RUN, 'resultados'),
  reporter: [['list'], ['json', { outputFile: path.join(RUN, 'resultado.json') }]],
  use: {
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium-1280', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } }, ...once },
    { name: 'chromium-390', use: mobile(390, 844, 'chromium'), ...ui },
    { name: 'chromium-360', use: mobile(360, 780, 'chromium'), ...ui },
    { name: 'webkit-1280', use: { browserName: 'webkit', viewport: { width: 1280, height: 800 } }, ...ui },
    { name: 'webkit-390', use: mobile(390, 844, 'webkit'), ...ui },
    { name: 'webkit-360', use: mobile(360, 780, 'webkit'), ...ui },
    { name: 'firefox-1280', use: { browserName: 'firefox', viewport: { width: 1280, height: 800 } }, ...ui },
    { name: 'firefox-390', use: mobile(390, 844, 'firefox'), ...ui },
    { name: 'firefox-360', use: mobile(360, 780, 'firefox'), ...ui },
  ],
});
