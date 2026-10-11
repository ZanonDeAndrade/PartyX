/** Dinheiro é sempre um inteiro em centavos. Nunca ponto flutuante. */
export type Cents = number;

export function assertCents(value: number): asserts value is Cents {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Valor em centavos precisa ser inteiro: ${value}`);
}

/** Converte texto em reais ("123,45" ou "1.234,50") para centavos, sem passar por float. */
export function reaisToCents(text: string): Cents {
  const match = text.trim().match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/);
  if (!match) throw new RangeError(`Valor em reais inválido: "${text}"`);
  const whole = Number(match[1]!.replaceAll('.', ''));
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const cents = whole * 100 + fraction;
  assertCents(cents);
  return cents;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: Cents): string {
  assertCents(cents);
  return brl.format(cents / 100);
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, v) => {
    assertCents(v);
    return total + v;
  }, 0);
}
