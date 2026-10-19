import { defineConfig } from '@playwright/test';

/**
 * Logos das formas de pagamento no navegador, contra o servidor LOCAL com o build atual e o banco descartável do e2e de texto longo
 * (mesmo `globalSetup`): página do evento (cartões brancos, alt, texto do bloco, alturas, arquivos do próprio domínio com hash e cache
 * longo) e os botões de forma de pagamento do checkout. Capturas a 360, 390 e 1280 px em e2e/.run/formas-pagamento/img.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'formas-pagamento.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 2,
  fullyParallel: true,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/formas-pagamento/resultados',
  reporter: [['dot']],
  use: { actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'retain-on-failure' },
});
