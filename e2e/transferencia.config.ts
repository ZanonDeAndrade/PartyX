import { defineConfig } from '@playwright/test';

/**
 * Transferência de ingresso (D-87) e aceite da Política de Cancelamento no checkout, no navegador, contra o servidor LOCAL com o banco
 * descartável do e2e de texto longo (mesmo `globalSetup`): as duas telas de Meus ingressos, a transferência, a página do pedido, o
 * Termo de Ciência de quem recebe com 17 anos, o desfazer no painel e a caixa da Política. Capturas em e2e/.run/transferencia/img.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'transferencia.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 2,
  fullyParallel: true,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/transferencia/resultados',
  reporter: [['dot']],
  use: { actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'retain-on-failure' },
});
