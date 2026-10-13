import { defineConfig } from '@playwright/test';

/**
 * Roteiro 11.2 do PDF pela interface, contra o servidor LOCAL (nunca homologação nem produção). Um trabalhador, em série: cada item
 * usa o que o anterior criou. `E2E_GATEWAY=sandbox|ficticio` escolhe o gateway (sem a variável: sandbox se houver credenciais de
 * teste no .env.local). Evidências em docs/evidencias/roteiro-11-2/<gateway>/ (capturas e PDF em img/, fora do Git).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'roteiro-11-2.spec.ts',
  globalSetup: './support/roteiro-setup.ts',
  globalTeardown: './support/roteiro-teardown.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // Homologação: cada Pix pode esperar até 10 min pela aprovação do Mercado Pago de teste (o item 14 faz mais uma compra).
  timeout: process.env.E2E_BASE_URL ? 900_000 : 300_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/roteiro/resultados',
  reporter: [['list'], ['json', { outputFile: '.run/roteiro/resultado.json' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', actionTimeout: 20_000, navigationTimeout: 30_000 },
});
