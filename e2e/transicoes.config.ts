import { defineConfig } from '@playwright/test';

/**
 * Transições do site (15/10/2026) no navegador, contra o servidor LOCAL com o banco descartável do e2e de texto longo (mesmo
 * `globalSetup`): entrada da página do evento (capa desfocada que fica nítida e cascata em até 700 ms), menos movimento, "Continuar"
 * sem espera, vitrine ao aparecer na tela, passar o mouse, troca de página (vitrine para o evento e de volta, 19/10/2026, com as
 * variantes A e B gravadas), painel e portaria. Capturas e vídeos em e2e/.run/transicoes (fora do Git).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'transicoes.spec.ts',
  globalSetup: './support/textos-longos-setup.ts',
  workers: 2,
  fullyParallel: true,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: '.run/transicoes/resultados',
  reporter: [['dot']],
  use: { actionTimeout: 15_000, navigationTimeout: 30_000, trace: 'retain-on-failure' },
});
