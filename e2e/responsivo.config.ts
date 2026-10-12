import { defineConfig } from '@playwright/test';

/**
 * CA-32: todas as rotas e estados a 360, 390, 768 e 1440 px, contra o servidor LOCAL com dados e gateway fictícios. Falha se a
 * página tiver rolagem horizontal. Resultado em docs/evidencias/responsividade/; capturas em img/, fora do Git.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'responsividade.spec.ts',
  globalSetup: './support/responsivo-setup.ts',
  globalTeardown: './support/responsivo-teardown.ts',
  workers: 4,
  fullyParallel: true,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/responsivo/resultados',
  reporter: [['dot'], ['json', { outputFile: '.run/responsivo/resultado.json' }]],
  use: { actionTimeout: 20_000, navigationTimeout: 30_000, trace: 'retain-on-failure' },
});
