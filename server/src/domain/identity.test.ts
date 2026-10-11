import { describe, expect, it } from 'vitest';
import { isValidCpf, maskCpf, onlyDigits } from './cpf';
import { hasFullName, isEmailFormat, isPhoneValid, normalizeEmail, normalizeName, normalizePhone } from './identity';
import { hashToken, newToken, passwordProblem } from './password';

describe('CPF', () => {
  it('aceita CPFs com dígitos verificadores corretos, com ou sem máscara', () => {
    for (const ok of ['12345678909', '123.456.789-09', '52998224725', '529.982.247-25'])
      expect(isValidCpf(ok)).toBe(true);
  });

  it('recusa dígito verificador errado, tamanho errado e sequências repetidas', () => {
    for (const bad of [
      '12345678900',
      '12345678908',
      '123',
      '',
      '11111111111',
      '00000000000',
      '123456789012',
      'abcdefghijk',
    ]) {
      expect(isValidCpf(bad), bad).toBe(false);
    }
  });

  it('mascara o CPF para a equipe', () => {
    expect(maskCpf('12345678909')).toBe('***.456.789-**');
    expect(maskCpf('123')).toBe('');
    expect(onlyDigits('123.456.789-09')).toBe('12345678909');
  });
});

describe('identidade', () => {
  it('normaliza e-mail para minúsculas sem espaços', () => {
    expect(normalizeEmail('  Maria.Silva@Exemplo.COM ')).toBe('maria.silva@exemplo.com');
  });

  it('valida formato de e-mail', () => {
    expect(isEmailFormat('a@b.co')).toBe(true);
    for (const bad of ['', 'a@b', 'a b@c.com', '@b.com', 'a@@b.com']) expect(isEmailFormat(bad)).toBe(false);
    expect(isEmailFormat(`${'a'.repeat(250)}@b.com`)).toBe(false);
  });

  it('exige nome e sobrenome', () => {
    expect(hasFullName('Marina Costa')).toBe(true);
    expect(hasFullName('Marina')).toBe(false);
    expect(hasFullName('   ')).toBe(false);
    expect(normalizeName('  Marina   Costa ')).toBe('Marina Costa');
  });

  it('guarda o telefone só com dígitos e exige DDD', () => {
    expect(normalizePhone('(55) 99812-4470')).toBe('55998124470');
    expect(isPhoneValid('55998124470')).toBe(true);
    expect(isPhoneValid('5533334444')).toBe(true);
    for (const bad of ['', '998124470', '0998124470', '559981244701']) expect(isPhoneValid(bad)).toBe(false);
  });
});

describe('senha e tokens', () => {
  it('exige 8 caracteres com letras e números', () => {
    expect(passwordProblem('festa2026')).toBeNull();
    for (const bad of ['curta1', 'somenteletras', '12345678', '']) expect(passwordProblem(bad)).not.toBeNull();
    expect(passwordProblem('a1'.repeat(70))).toMatch(/128/);
  });

  it('gera tokens de 256 bits e guarda só o hash', () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });
});
