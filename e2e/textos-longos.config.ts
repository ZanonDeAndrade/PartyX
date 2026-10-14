import { defineConfig } from '@playwright/test';

/**
 * Texto longo digitado pelo admin ou pelo comprador (300 caracteres sem espaço, URL, emojis) em 360, 768 e 1280 px, contra o
 * servidor LOCAL com dados fictícios. Falha com rolagem horizontal, texto que escapa da própria caixa ou palavra curta partida
 * no meio (preço, data, código espremidos). Capturas em e2e/.run/textos-longos/img, fora do Git.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'textos-longos.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 3,
  fullyParallel: true,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/textos-longos/resultados',
  reporter: [['dot']],
  use: { actionTimeout: 20_000, navigationTimeout: 30_000, trace: 'retain-on-failure' },
});
