/**
 * Tabela de casos da taxa de serviço (D-90), usada pelos testes do servidor (domain/serviceFee.ts) e da tela (src/site/serviceFee.ts),
 * para as duas contas nunca divergirem. [preço em centavos, porcentagem em centésimos de ponto, mínimo em centavos, taxa esperada].
 */
export const SERVICE_FEE_CASES: readonly (readonly [number, number, number, number])[] = [
  // R$ 30,00 a 5%: 3000 × 500 / 9500 = 157,89 → 158 (o exemplo aprovado pelo Bernardo em 18/10/2026).
  [3000, 500, 0, 158],
  // R$ 40,00 a 5%: 210,53 → 211.
  [4000, 500, 0, 211],
  // Conta exata não sobe: R$ 95,00 a 5% = 500,00 → 500.
  [9500, 500, 0, 500],
  // R$ 1,00 a 5%: 5,26 → 6.
  [100, 500, 0, 6],
  // R$ 30,00 a 2,99%: 92,46 → 93.
  [3000, 299, 0, 93],
  // R$ 30,00 a 4,98%: 157,23 → 158.
  [3000, 498, 0, 158],
  // Mínimo maior que a conta: R$ 10,00 a 5% = 52,63 → 53, mínimo R$ 1,00 → 100.
  [1000, 500, 100, 100],
  // Mínimo menor que a conta: vale a conta.
  [10000, 500, 100, 527],
  // 0% e mínimo 0: sem taxa.
  [3000, 0, 0, 0],
  // 0% com mínimo: só o mínimo.
  [3000, 0, 150, 150],
  // Limite de 20%: R$ 30,00 → 750,00 exatos.
  [3000, 2000, 0, 750],
  // Preço alto (R$ 100.000,00 a 5%): sem estouro de inteiro.
  [10_000_000, 500, 0, 526_316],
];
