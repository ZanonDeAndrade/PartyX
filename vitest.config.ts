import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Testes de integração fazem login (Argon2) e usam banco real: com a máquina ocupada, 5 s é pouco.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: ['server/**/*.test.ts', 'src/site/**/*.test.ts'],
    // Mexem em papéis do cluster: rodam à parte (`vitest.cluster.config.ts`), depois desta suíte.
    exclude: ['**/node_modules/**', '**/*.cluster.test.ts'],
  },
});
