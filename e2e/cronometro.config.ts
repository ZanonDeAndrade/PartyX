import { defineConfig } from '@playwright/test';

/**
 * Cronômetro da página do evento (15/10/2026) no navegador, contra o servidor LOCAL com o banco descartável do e2e de texto longo
 * (mesmo `globalSetup`): antes, durante e depois do evento, virada no zero sem recarregar, relógio do aparelho adiantado e atrasado,
 * pausa com a aba escondida, movimento reduzido, cronômetro desligado e frase personalizada pelo painel. Capturas em
 * e2e/.run/cronometro/img (fora do Git).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'cronometro.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 2,
  fullyParallel: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/cronometro/resultados',
  reporter: [['dot']],
  use: { actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'retain-on-failure' },
});
