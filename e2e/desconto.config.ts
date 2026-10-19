import { defineConfig } from '@playwright/test';

/**
 * Desconto por promoter (D-91) no navegador, contra o servidor LOCAL com o banco descartável do e2e de texto longo (mesmo
 * `globalSetup`, taxa de serviço de 5%): o painel cria o promoter com desconto, o comprador aplica o código no checkout, o código que
 * zeraria o pedido é recusado e a página do pedido mostra o desconto. Capturas em e2e/.run/desconto/img.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'desconto.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 2,
  fullyParallel: true,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/desconto/resultados',
  reporter: [['dot']],
  use: { actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'retain-on-failure' },
});
