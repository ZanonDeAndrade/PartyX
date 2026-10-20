import { describe, expect, it } from 'vitest';
import {
  ACCESS_LIMITS,
  accessPurgeAfter,
  checkNote,
  checkPerson,
  effectiveStatus,
  maskEmail,
  parseAccessList,
} from './eventAccess';

const CPF = '52998224725';

describe('evento privado (D-92): pessoa da lista', () => {
  it('e-mail ou CPF basta; e-mail em minúsculas, CPF só por dígitos, nome opcional sem espaços sobrando', () => {
    expect(checkPerson({ email: '  Ana.Souza@Example.COM ' })).toEqual({
      ok: true,
      person: { email: 'ana.souza@example.com', cpf: null, name: null },
    });
    expect(checkPerson({ cpf: '529.982.247-25', name: '  Ana   Souza ' })).toEqual({
      ok: true,
      person: { email: null, cpf: CPF, name: 'Ana Souza' },
    });
    expect(checkPerson({ email: 'a@b.co', cpf: CPF })).toMatchObject({
      ok: true,
      person: { email: 'a@b.co', cpf: CPF },
    });
  });

  it('recusa sem e-mail nem CPF, e-mail sem formato, CPF inválido e nome longo', () => {
    expect(checkPerson({ name: 'Ana' })).toEqual({ ok: false, message: 'Informe o e-mail ou o CPF da pessoa.' });
    expect(checkPerson({ email: 'ana@' })).toMatchObject({ ok: false });
    expect(checkPerson({ cpf: '111.111.111-11' })).toMatchObject({
      ok: false,
      message: expect.stringContaining('CPF'),
    });
    expect(checkPerson({ cpf: '1234' })).toMatchObject({ ok: false });
    expect(checkPerson({ email: 'a@b.co', name: 'x'.repeat(121) })).toMatchObject({ ok: false });
  });
});

describe('evento privado (D-92): lista colada', () => {
  it('uma por linha, em qualquer ordem, com vírgula, ponto e vírgula ou tabulação; linhas vazias ignoradas', () => {
    const r = parseAccessList(
      ['Ana Souza; ana@example.com', '', '529.982.247-25, Bruno Lima', 'carla@example.com\t111.444.777-35', ' '].join(
        '\n',
      ),
    );
    if ('tooMany' in r) throw new Error('não esperado');
    expect(r.errors).toEqual([]);
    expect(r.people).toEqual([
      { line: 1, person: { email: 'ana@example.com', cpf: null, name: 'Ana Souza' } },
      { line: 3, person: { email: null, cpf: CPF, name: 'Bruno Lima' } },
      { line: 4, person: { email: 'carla@example.com', cpf: '11144477735', name: null } },
    ]);
  });

  it('aponta as linhas com erro e as repetidas dentro da própria lista, sem parar nas outras', () => {
    const r = parseAccessList(
      ['ana@example.com', 'só um nome', '123.456.789-00', 'ANA@example.com', 'a@x.co; b@x.co', CPF, CPF].join('\r\n'),
    );
    if ('tooMany' in r) throw new Error('não esperado');
    expect(r.people.map(p => p.line)).toEqual([1, 6]);
    expect(r.errors.map(e => e.line)).toEqual([2, 3, 5]);
    expect(r.errors[2]!.message).toBe('Mais de um e-mail na mesma linha.');
    expect(r.repeated).toEqual([4, 7]);
  });

  it(`até ${ACCESS_LIMITS.importMax} linhas preenchidas por vez`, () => {
    const many = Array.from({ length: ACCESS_LIMITS.importMax }, (_, i) => `p${i}@example.com`).join('\n');
    expect('tooMany' in parseAccessList(many)).toBe(false);
    expect(parseAccessList(`${many}\nmais@example.com`)).toEqual({ tooMany: true });
    expect('tooMany' in parseAccessList(`${many}\n\n\n`)).toBe(false);
  });
});

describe('evento privado (D-92): situação, máscaras e retenção', () => {
  it('autorizada vale antes de pendente, e pendente antes de recusada; sem linha, nenhuma', () => {
    expect(effectiveStatus([])).toBeNull();
    expect(effectiveStatus(['recusada', 'autorizada'])).toBe('autorizada');
    expect(effectiveStatus(['recusada', 'pendente'])).toBe('pendente');
    expect(effectiveStatus(['recusada'])).toBe('recusada');
  });

  it('e-mail mascarado para a trilha', () => {
    expect(maskEmail('marina@example.com')).toBe('ma***@example.com');
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
    expect(maskEmail('sem-arroba')).toBe('***');
  });

  it('observação opcional até 500 caracteres; vazia vira nula', () => {
    expect(checkNote('  ')).toEqual({ ok: true, note: null });
    expect(checkNote(' ok ')).toEqual({ ok: true, note: 'ok' });
    expect(checkNote('x'.repeat(501))).toMatchObject({ ok: false });
  });

  it('6 meses depois do fim (ou do início, sem fim), como o interval do PostgreSQL', () => {
    const at = (iso: string) => new Date(iso);
    expect(
      accessPurgeAfter({ startsAt: at('2026-10-24T23:00:00Z'), endsAt: at('2026-10-25T06:00:00Z') }).toISOString(),
    ).toBe('2027-04-25T06:00:00.000Z');
    expect(accessPurgeAfter({ startsAt: at('2026-10-24T23:00:00Z'), endsAt: null }).toISOString()).toBe(
      '2027-04-24T23:00:00.000Z',
    );
    expect(accessPurgeAfter({ startsAt: at('2026-08-31T22:00:00Z'), endsAt: null }).toISOString()).toBe(
      '2027-02-28T22:00:00.000Z',
    );
    expect(accessPurgeAfter({ startsAt: at('2027-08-31T22:00:00Z'), endsAt: null }).toISOString()).toBe(
      '2028-02-29T22:00:00.000Z',
    );
  });
});
