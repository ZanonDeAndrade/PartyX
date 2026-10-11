import { describe, expect, it } from 'vitest';
import { logger } from '../logger';
import { redact, redactText } from './redact';

describe('mascaramento de logs', () => {
  it('campos sensíveis por nome: senha, token, segredo, cookie, CPF, cartão, CVV', () => {
    const out = redact({
      password: 'festa2026',
      senha: 'x',
      sessionToken: 'abc',
      authorization: 'Bearer abcdefghijkl',
      cookie: '__session=1',
      cpf: '52998224725',
      cvv: '123',
      cardNumber: '4111111111111111',
      hmacKey: 'k',
      qrPayload: 'PX1.x',
      orderId: 'abc-123',
      nested: { apiKey: 'zzz', status: 'ok' },
      list: [{ secret: 's' }],
    }) as Record<string, any>;
    for (const k of [
      'password',
      'senha',
      'sessionToken',
      'authorization',
      'cookie',
      'cpf',
      'cvv',
      'cardNumber',
      'hmacKey',
      'qrPayload',
    ])
      expect([k, out[k]]).toEqual([k, '[redigido]']);
    expect(out.orderId).toBe('abc-123');
    expect(out.nested).toEqual({ apiKey: '[redigido]', status: 'ok' });
    expect(out.list).toEqual([{ secret: '[redigido]' }]);
  });

  it('valores sensíveis dentro de texto livre: PAN (com Luhn), CPF, e-mail, tokens, URL com senha', () => {
    expect(redactText('cartão 4111 1111 1111 1111 recusado')).toBe('cartão [pan] recusado');
    expect(redactText('pedido 1234567890123 ok')).toBe('pedido 1234567890123 ok'); // 13 dígitos sem Luhn: não é cartão
    expect(redactText('cpf 529.982.247-25 e 52998224725')).toBe('cpf ***.***.***-25 e *******25');
    expect(redactText('de maria.souza@exemplo.com para x')).toBe('de m***@exemplo.com para x');
    expect(redactText('Authorization: Bearer abcdef1234567890')).toContain('Bearer [token]');
    expect(redactText('postgres://app:SenhaSecreta@host/db')).toBe('postgres://app:[redigido]@host/db');
    expect(redactText('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcDEF')).toBe('[jwt]');
    expect(redactText('qr PX1.1.abcdef0123.AAAAAAAAAAAA.BBBBBBBBBBBBBBBB')).toBe('qr [qr]');
  });

  it('o logger aplica o mascaramento mesmo quando alguém passa dado sensível por engano', () => {
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => (lines.push(String(chunk)), true)) as typeof process.stdout.write;
    try {
      logger.info('login de 52998224725 por ana@exemplo.com', { password: 'festa2026', token: 'abc', orderId: 'o1' });
    } finally {
      process.stdout.write = orig;
    }
    const line = lines.join('');
    expect(line).not.toMatch(/festa2026|52998224725|ana@|"abc"/);
    expect(line).toContain('"orderId":"o1"');
    expect(JSON.parse(line).severity).toBe('INFO');
  });

  it('não quebra com valores estranhos (ciclos profundos, nulos, números)', () => {
    let deep: any = {};
    const root = deep;
    for (let i = 0; i < 30; i++) deep = deep.a = {};
    expect(() => JSON.stringify(redact({ root, n: null, x: 1, d: new Date(0) }))).not.toThrow();
  });
});
