import { defineConfig } from '@playwright/test';

/**
 * Busca só pelo cabeçalho (16/10/2026), contra o servidor LOCAL com o banco descartável do e2e de texto longo (mesmo `globalSetup`):
 * a vitrine sem o formulário, a busca do cabeçalho no computador e pela lupa no celular, com e sem resultado, e os links antigos com
 * `?date=`. Capturas em e2e/.run/busca/img (fora do Git).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'busca.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/busca/resultados',
  reporter: [['dot']],
  use: { actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'retain-on-failure' },
});
