export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

function checkDigit(digits: number[], weightStart: number): number {
  const sum = digits.reduce((total, d, i) => total + d * (weightStart - i), 0);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** CPF válido: 11 dígitos, não repetidos, com os dois dígitos verificadores corretos (RF-02). */
export function isValidCpf(input: string): boolean {
  const digits = onlyDigits(input);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const nums = [...digits].map(Number);
  return checkDigit(nums.slice(0, 9), 10) === nums[9] && checkDigit(nums.slice(0, 10), 11) === nums[10];
}

/** CPF mascarado para telas da portaria e do administrador: ***.456.789-** */
export function maskCpf(cpf: string): string {
  const d = onlyDigits(cpf);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '';
}
