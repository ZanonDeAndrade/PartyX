import { defineConfig } from 'vitest/config';

/** Testes que mexem em papéis do PostgreSQL (do cluster inteiro). Rodam sozinhos, depois da suíte principal. */
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: ['server/src/**/*.cluster.test.ts'],
    fileParallelism: false,
  },
});
