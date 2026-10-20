import { defineConfig } from '@playwright/test';

/**
 * Evento privado (D-92) no navegador, contra o servidor LOCAL com o banco descartável do e2e de texto longo (mesmo `globalSetup`): a
 * chave no painel, a aba Acesso, a solicitação pela página do evento (sem login, logado, enviada, recusada, autorizada), a página
 * Solicitações e o selo na vitrine. Capturas a 360, 390 e 1280 px em e2e/.run/acesso/img.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'acesso.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 2,
  fullyParallel: true,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/acesso/resultados',
  reporter: [['dot']],
  use: { actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'retain-on-failure' },
});
