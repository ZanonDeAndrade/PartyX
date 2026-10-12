import { defineConfig } from 'vitest/config';

/**
 * Testes contra o ambiente de teste REAL do Mercado Pago (etapa 07): criam orders, estornam pela API e reconsultam. Precisam das
 * credenciais de teste no ambiente (MP_ACCESS_TOKEN, MP_PUBLIC_KEY, MP_WEBHOOK_SECRET) e do banco de teste. Um arquivo por vez e
 * sem paralelismo: o antifraude do ambiente de teste recusa (`high_risk`) rajadas de cobranças.
 */
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 60_000,
    include: ['server/src/**/*.sandbox.test.ts'],
    fileParallelism: false,
  },
});
