import { defineConfig } from '@playwright/test';

/**
 * Relatório da taxa mensal com a regra por forma de pagamento (D-93) no navegador, contra o servidor LOCAL com o banco descartável do
 * e2e de texto longo (mesmo `globalSetup`): outubro de 2026 com pedidos por Pix e cartão antes e depois de 21/10. Capturas a 360 e
 * 1280 px em e2e/.run/taxa-pix/img.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'taxa-pix.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/taxa-pix/resultados',
  reporter: [['dot']],
  use: { actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'retain-on-failure' },
});
