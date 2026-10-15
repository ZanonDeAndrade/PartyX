import { defineConfig } from '@playwright/test';

/**
 * Cor de destaque do evento (0014) no navegador, contra o servidor LOCAL com o banco descartável do e2e de texto longo (mesmo
 * `globalSetup`): cores calculadas na página (bloco da data, cronômetro, linhas, aviso de menores, "Continuar", foco), o cabeçalho
 * com o roxo da PartyX, o bloco da data no card da vitrine e o campo no painel. Capturas em e2e/.run/cor-destaque/img (fora do Git).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'cor-destaque.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 2,
  fullyParallel: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/cor-destaque/resultados',
  reporter: [['dot']],
  use: { actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'retain-on-failure' },
});
