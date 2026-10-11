import { describe, expect, it } from 'vitest';
import { brl, dateShort, eventPath, searchPath, shareLinks, timeOf } from './format';

describe('formatação da vitrine', () => {
  it('valor em reais a partir de centavos', () => {
    expect(brl(8000).replace(/\s/g, ' ')).toBe('R$ 8.000,00'.replace('8.000', '80'));
    expect(brl(15050).replace(/\s/g, ' ')).toBe('R$ 150,50');
  });
  it('hora e data no fuso de Brasília, não no do navegador', () => {
    expect(timeOf('2026-12-13T01:00:00.000Z')).toBe('22:00');
    expect(dateShort('2026-12-13T01:00:00.000Z')).toMatch(/12/); // ainda dia 12 em Brasília
  });
  it('monta a busca só com o que foi preenchido e codifica o texto', () => {
    expect(searchPath('', '')).toBe('/eventos');
    expect(searchPath(' festa neon ', '2026-12-12')).toBe('/eventos?q=festa+neon&date=2026-12-12');
    expect(searchPath('a&b=c', '')).toBe('/eventos?q=a%26b%3Dc');
    expect(eventPath('noite-neon')).toBe('/eventos/noite-neon');
  });
  it('links de compartilhamento codificam o endereço e o título', () => {
    const l = shareLinks('https://x.test/eventos/a?b=1&c=2', 'Festa & Cia');
    expect(l.whatsapp).toBe(
      'https://wa.me/?text=Festa%20%26%20Cia%20https%3A%2F%2Fx.test%2Feventos%2Fa%3Fb%3D1%26c%3D2',
    );
    expect(l.facebook).toContain('u=https%3A%2F%2Fx.test%2Feventos%2Fa%3Fb%3D1%26c%3D2');
  });
});

describe('formulários do painel: fuso do evento, valor e atrações', () => {
  it('data e horário digitados valem no fuso do evento (São Paulo, UTC-3) e voltam iguais', async () => {
    const { zonedInputsToIso, isoToZonedInputs } = await import('./format');
    const iso = zonedInputsToIso('2026-12-12', '22:00');
    expect(iso).toBe('2026-12-12T22:00:00-03:00');
    expect(new Date(iso!).toISOString()).toBe('2026-12-13T01:00:00.000Z');
    expect(isoToZonedInputs('2026-12-13T01:00:00.000Z')).toEqual({ date: '2026-12-12', time: '22:00' });
    expect(isoToZonedInputs(zonedInputsToIso('2027-01-01', '00:05')!)).toEqual({ date: '2027-01-01', time: '00:05' });
  });

  it('campos vazios ou datas impossíveis não viram instante', async () => {
    const { zonedInputsToIso } = await import('./format');
    for (const [d, t] of [
      ['', '22:00'],
      ['2026-12-12', ''],
      ['2026-02-31', '10:00'],
      ['2026-13-01', '10:00'],
      ['2026-12-12', '24:00'],
      ['12/12/2026', '22:00'],
    ])
      expect(zonedInputsToIso(d!, t!), `${d} ${t}`).toBeNull();
  });

  it('máscara de R$: só dígitos contam, em centavos inteiros; zero fica zero', async () => {
    const { centsFromMasked, maskedFromCents } = await import('./format');
    expect(centsFromMasked('80,00')).toBe(8000);
    expect(centsFromMasked('R$ 1.234,56')).toBe(123456);
    expect(centsFromMasked('8000')).toBe(8000);
    expect(centsFromMasked('abc')).toBe(0);
    expect(centsFromMasked('0,00')).toBe(0);
    expect(centsFromMasked('-5')).toBe(5); // sinal ignorado: o servidor recusa zero e negativo de qualquer forma
    expect(maskedFromCents(8000)).toBe('80,00');
    expect(maskedFromCents(123456)).toBe('1.234,56');
    expect(maskedFromCents(5)).toBe('0,05');
  });

  it('atrações: uma por linha, sem linha vazia nem espaço sobrando', async () => {
    const { attractionsFromText } = await import('./format');
    expect(attractionsFromText('  DJ   Exemplo \n\nBanda Fictícia\n ')).toEqual(['DJ Exemplo', 'Banda Fictícia']);
  });
});

describe('validações do painel: CPF, e-mail e código de promoter', () => {
  it('CPF com dígitos verificadores, repetidos recusados, máscara enquanto digita', async () => {
    const { isCpfValid, maskCpfInput } = await import('./format');
    expect(isCpfValid('529.982.247-25')).toBe(true);
    expect(isCpfValid('52998224724')).toBe(false);
    expect(isCpfValid('111.111.111-11')).toBe(false);
    expect(isCpfValid('1234')).toBe(false);
    expect(maskCpfInput('52998224725')).toBe('529.982.247-25');
    expect(maskCpfInput('5299')).toBe('529.9');
    expect(maskCpfInput('529982247')).toBe('529.982.247');
  });
  it('e-mail e código de promoter (maiúsculas, 3 a 20, sem acento nem símbolo)', async () => {
    const { isEmailLike, normalizeCoupon, isCouponValid } = await import('./format');
    expect(isEmailLike('a@b.co')).toBe(true);
    expect(isEmailLike('a@b')).toBe(false);
    expect(normalizeCoupon(' marina10 ')).toBe('MARINA10');
    expect(isCouponValid('MARINA10')).toBe(true);
    for (const bad of ['AB', 'A'.repeat(21), 'JOÃO', 'MARI NA', 'MARI-NA']) expect(isCouponValid(bad), bad).toBe(false);
  });
});
