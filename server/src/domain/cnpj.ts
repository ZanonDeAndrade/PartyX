/** CNPJ sem pontuação e em maiúsculas. Aceita o formato numérico e o alfanumérico da Receita Federal (julho de 2026). */
export const normalizeCnpj = (value: string): string => value.replace(/[.\-/\s]/g, '').toUpperCase();

// Cada caractere vale o código ASCII menos 48: "0" a "9" valem 0 a 9, "A" vale 17 e assim por diante (regra da Receita).
function checkDigit(chars: string, weights: number[]): number {
  const sum = [...chars].reduce((total, ch, i) => total + (ch.charCodeAt(0) - 48) * weights[i]!, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** CNPJ válido: 12 caracteres alfanuméricos e 2 dígitos verificadores corretos; recusa sequências repetidas. */
export function isValidCnpj(input: string): boolean {
  const v = normalizeCnpj(input);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(v) || /^(.)\1{13}$/.test(v)) return false;
  return checkDigit(v.slice(0, 12), W1) === Number(v[12]) && checkDigit(v.slice(0, 13), W2) === Number(v[13]);
}

/** 00.000.000/0000-00 (também para o alfanumérico). Supõe CNPJ válido. */
export function formatCnpj(input: string): string {
  const v = normalizeCnpj(input);
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
}
