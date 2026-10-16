import { defineConfig, devices } from '@playwright/test';

/**
 * Formulários do painel (e campos de data do site) no celular, 16/10/2026: motor do Safari (WebKit com viewport e agente do iPhone,
 * 390 x 844) e Chrome do Android (360 x 800). Mesmo servidor local e banco descartável do e2e de texto longo. Capturas em
 * e2e/.run/painel-celular/img (fora do Git).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'painel-celular.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/painel-celular/resultados',
  reporter: [['dot']],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    contextOptions: { reducedMotion: 'reduce' },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    {
      name: 'iphone-webkit',
      use: { ...devices['iPhone 13'], browserName: 'webkit', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
    },
    {
      name: 'android-chrome',
      use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 },
    },
  ],
});
