import { defineConfig } from '@playwright/test';

/**
 * Menu de Documentos sem a meia-entrada (16/10/2026), contra o servidor LOCAL com o banco descartável do e2e de texto longo (mesmo
 * `globalSetup`): o menu lateral, o rodapé e o redirecionamento da página antiga. Capturas em e2e/.run/documentos/img (fora do Git).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'documentos.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/documentos/resultados',
  reporter: [['dot']],
  use: { actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'retain-on-failure' },
});
