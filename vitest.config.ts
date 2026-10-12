import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Testes de integração fazem login (Argon2) e usam banco real: com a máquina ocupada, 5 s é pouco.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: ['server/**/*.test.ts', 'src/site/**/*.test.ts'],
    // Mexem em papéis do cluster: rodam à parte (`vitest.cluster.config.ts`), depois desta suíte. Os de sandbox falam com o
    // Mercado Pago de verdade e exigem credenciais de teste: só por `npm run test:sandbox` (`vitest.sandbox.config.ts`).
    exclude: ['**/node_modules/**', '**/*.cluster.test.ts', '**/*.sandbox.test.ts'],
  },
});
