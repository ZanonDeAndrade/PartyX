import { defineConfig, devices } from '@playwright/test';

/**
 * Abertura em toda carga de página (16/10/2026), contra o servidor LOCAL com o banco descartável do e2e de texto longo (mesmo
 * `globalSetup`): computador (Chromium, 1280 x 800), Chrome do Android (360 x 800) e motor do Safari (WebKit com viewport do iPhone,
 * 390 x 844). Capturas em e2e/.run/abertura/img (fora do Git).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'abertura.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/abertura/resultados',
  reporter: [['dot']],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    { name: 'computador-chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    {
      name: 'android-chrome',
      use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 },
    },
    {
      name: 'iphone-webkit',
      use: { ...devices['iPhone 13'], browserName: 'webkit', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
    },
  ],
});
