import { defineConfig } from '@playwright/test';

/** Botões das telas com Turnstile (cadastro e recuperação de senha) contra servidores LOCAIS com as chaves de teste da Cloudflare. */
export default defineConfig({
  testDir: '.',
  testMatch: 'turnstile.spec.ts',
  globalSetup: './support/turnstile-setup.ts',
  globalTeardown: './support/turnstile-teardown.ts',
  workers: 2,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: '.run/turnstile/resultados',
  reporter: [['list']],
  use: { locale: 'pt-BR', trace: 'retain-on-failure' },
});
