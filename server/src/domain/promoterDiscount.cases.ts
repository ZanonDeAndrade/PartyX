/**
 * Tabela de casos do desconto por promoter (D-91), usada pelos testes do servidor (domain/promoterDiscount.ts) e da tela
 * (src/site/promoterDiscount.ts), para as duas contas nunca divergirem. [preço em centavos, tipo, valor, desconto esperado].
 */
export const DISCOUNT_CASES: readonly (readonly [number, 'percentual' | 'fixo', number, number])[] = [
  // 10% de R$ 30,00 = R$ 3,00.
  [3000, 'percentual', 1000, 300],
  // 12,5% de R$ 30,00 = R$ 3,75 (porcentagem com uma casa).
  [3000, 'percentual', 1250, 375],
  // 7,25% de R$ 25,00 = 181,25 → R$ 1,81 (com centavos: arredonda para BAIXO).
  [2500, 'percentual', 725, 181],
  // 33,33% de R$ 10,00 = 333,3 → R$ 3,33.
  [1000, 'percentual', 3333, 333],
  // 1% de R$ 0,99 = 0,99 → 0 (desconto menor que um centavo não acontece).
  [99, 'percentual', 100, 0],
  // 100%: o ingresso fica em R$ 0,00.
  [3000, 'percentual', 10000, 3000],
  // Valor fixo menor que o preço.
  [3000, 'fixo', 500, 500],
  // Valor fixo igual ao preço: R$ 0,00.
  [3000, 'fixo', 3000, 3000],
  // Valor fixo maior que o preço: nunca abaixo de zero.
  [2500, 'fixo', 4000, 2500],
  // Um centavo.
  [3000, 'fixo', 1, 1],
];
