import { describe, expect, it } from 'vitest';
import { formatCnpj, isValidCnpj, normalizeCnpj } from './cnpj';

describe('CNPJ', () => {
  it('aceita o numérico com ou sem pontuação e recusa dígito verificador errado', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11.444.777/0001-61')).toBe(true);
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(isValidCnpj('11222333000171')).toBe(false);
  });

  it('aceita o alfanumérico da Receita (exemplo oficial 12.ABC.345/01DE-35), em qualquer caixa', () => {
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj('12abc34501de35')).toBe(true);
    expect(isValidCnpj('12ABC34501DE36')).toBe(false);
    expect(isValidCnpj('12ABC34501DEA5')).toBe(false); // verificadores são sempre números
  });

  it('recusa tamanho errado, repetição e caracteres estranhos', () => {
    for (const bad of [
      '',
      '1122233300018',
      '112223330001811',
      '00000000000000',
      '11111111111111',
      '11.222.333/0001-8!',
    ])
      expect(isValidCnpj(bad), bad).toBe(false);
  });

  it('formata e normaliza', () => {
    expect(normalizeCnpj(' 11.222.333/0001-81 ')).toBe('11222333000181');
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
  });
});
