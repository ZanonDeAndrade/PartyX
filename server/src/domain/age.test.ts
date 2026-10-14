import { describe, expect, it } from 'vitest';
import { ageOn, ageOnEvent, birthDateProblem, isCalendarDate, purchaseAge } from './age';

describe('idade (regras de menores)', () => {
  it('data do calendário: formato AAAA-MM-DD e dia que existe', () => {
    for (const ok of ['2008-02-29', '2010-12-31', '1900-01-01']) expect(isCalendarDate(ok), ok).toBe(true);
    for (const bad of ['2009-02-29', '2010-13-01', '2010-1-01', '01/02/2010', '', '2010-02-30'])
      expect(isCalendarDate(bad), bad).toBe(false);
  });

  it('anos completos: aniversário conta no próprio dia, não na véspera', () => {
    expect(ageOn('2010-05-10', '2026-05-09')).toBe(15);
    expect(ageOn('2010-05-10', '2026-05-10')).toBe(16);
    expect(ageOn('2010-05-10', '2026-12-31')).toBe(16);
  });

  it('nascido em 29/02 completa o ano em 01/03 nos anos não bissextos', () => {
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
    expect(ageOn('2008-02-29', '2028-02-29')).toBe(20);
  });

  it('a data do evento é o dia de início em São Paulo, mesmo que em UTC já seja o dia seguinte', () => {
    const startsAt = new Date('2026-11-21T02:30:00Z'); // 20/11/2026 às 23h30 em São Paulo
    expect(ageOnEvent('2008-11-21', startsAt)).toBe(17); // faz 18 no dia 21: no dia 20 ainda tem 17
    expect(ageOnEvent('2008-11-20', startsAt)).toBe(18);
  });

  describe('quem compra (idade na data do evento)', () => {
    const startsAt = new Date('2026-11-20T23:00:00Z'); // 20/11/2026, 20h em São Paulo
    const comMenores = { startsAt, allowsMinors: true };
    const semMenores = { startsAt, allowsMinors: false };

    it('15 anos: ninguém compra', () => {
      expect(purchaseAge('2011-01-15', comMenores)).toEqual({ ok: false, age: 15, reason: 'menor_de_16' });
      expect(purchaseAge('2011-01-15', semMenores)).toEqual({ ok: false, age: 15, reason: 'menor_de_16' });
    });

    it('16 e 17 anos: só em evento que permite menores, e como menor', () => {
      expect(purchaseAge('2010-01-15', comMenores)).toEqual({ ok: true, age: 16, minor: true });
      expect(purchaseAge('2009-01-15', comMenores)).toEqual({ ok: true, age: 17, minor: true });
      expect(purchaseAge('2010-01-15', semMenores)).toEqual({ ok: false, age: 16, reason: 'evento_sem_menores' });
      expect(purchaseAge('2009-01-15', semMenores)).toEqual({ ok: false, age: 17, reason: 'evento_sem_menores' });
    });

    it('18 anos: compra em qualquer evento, sem termo', () => {
      expect(purchaseAge('2008-01-15', comMenores)).toEqual({ ok: true, age: 18, minor: false });
      expect(purchaseAge('2008-01-15', semMenores)).toEqual({ ok: true, age: 18, minor: false });
    });

    it('aniversário no dia do evento: faz 16 e entra como menor; faz 18 e já é maior', () => {
      expect(purchaseAge('2010-11-20', comMenores)).toEqual({ ok: true, age: 16, minor: true });
      expect(purchaseAge('2010-11-21', comMenores)).toEqual({ ok: false, age: 15, reason: 'menor_de_16' });
      expect(purchaseAge('2008-11-20', semMenores)).toEqual({ ok: true, age: 18, minor: false });
      expect(purchaseAge('2008-11-21', semMenores)).toEqual({ ok: false, age: 17, reason: 'evento_sem_menores' });
    });
  });

  it('cadastro: data válida, não futura e 16 anos completos hoje', () => {
    const today = '2026-10-14';
    expect(birthDateProblem('2010-10-14', today)).toBeNull(); // faz 16 hoje
    expect(birthDateProblem('2010-10-15', today)).toBe('O cadastro é permitido a partir de 16 anos.');
    expect(birthDateProblem('2027-01-01', today)).toBe('Informe uma data de nascimento válida.');
    expect(birthDateProblem('1899-12-31', today)).toBe('Informe uma data de nascimento válida.');
    expect(birthDateProblem('2010-02-30', today)).toBe('Informe uma data de nascimento válida.');
    expect(birthDateProblem('1980-06-01', today)).toBeNull();
  });
});
