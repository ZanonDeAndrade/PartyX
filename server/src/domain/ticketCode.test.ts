import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  newShortCode,
  newTicketCode,
  parseQrKeys,
  QR_PREFIX,
  SHORT_ALPHABET,
  signQr,
  verifyQr,
  type QrKeys,
} from './ticketCode';

const k1 = randomBytes(32);
const k2 = randomBytes(32);
const keys: QrKeys = new Map([
  [1, k1],
  [2, k2],
]);
const EVENT = '0b0f4f55-0a7a-4c3e-9a55-7a3e8f4c9a11';
const OTHER_EVENT = '7c3e8f4c-9a11-4c3e-9a55-0b0f4f550a7a';
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

describe('código do ingresso', () => {
  it('tem pelo menos 128 bits (144), só base64url, e não se repete em 20 mil gerações', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const c = newTicketCode();
      expect(c).toMatch(/^[A-Za-z0-9_-]{24}$/);
      seen.add(c);
    }
    expect(seen.size).toBe(20_000);
    expect(Buffer.from(newTicketCode(), 'base64url').length * 8).toBeGreaterThanOrEqual(128);
  });
  it('os caracteres saem bem distribuídos (sem viés grosseiro)', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) for (const ch of newTicketCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    const total = 4000 * 24;
    for (const ch of B64URL) expect((counts.get(ch) ?? 0) / total, ch).toBeGreaterThan(0.008); // esperado 1/64 = 0,0156
  });
  it('o código curto tem o formato da portaria, sem I, O, 0 e 1, e quase nunca repete', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const c = newShortCode();
      expect(c).toMatch(/^PX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(4990);
    expect(SHORT_ALPHABET).toHaveLength(32);
    expect(SHORT_ALPHABET).not.toMatch(/[IO01]/);
  });
});

describe('QR assinado (RF-39)', () => {
  const code = newTicketCode();
  const payload = signQr(keys, 1, EVENT, code);

  it('tem prefixo, versão da chave, evento, código e assinatura, e é curto para ler bem', () => {
    const parts = payload.split('.');
    expect(parts).toHaveLength(5);
    expect(parts.slice(0, 2)).toEqual([QR_PREFIX, '1']);
    expect(parts[2]).toBe(EVENT.replaceAll('-', ''));
    expect(parts[3]).toBe(code);
    expect(parts[4]).toHaveLength(22);
    expect(payload.length).toBeLessThan(100);
  });
  it('lê de volta o evento e o código', () => {
    expect(verifyQr(keys, payload)).toEqual({ ok: true, keyVersion: 1, eventId: EVENT, code });
  });
  it('é determinístico para os mesmos dados e muda com a chave', () => {
    expect(signQr(keys, 1, EVENT, code)).toBe(payload);
    expect(signQr(keys, 2, EVENT, code)).not.toBe(payload);
  });

  it('alterar QUALQUER caractere, em qualquer posição, invalida a leitura (CA-22)', () => {
    let tested = 0;
    for (let i = 0; i < payload.length; i++) {
      for (const replacement of ['A', 'z', '0', '_', '-', '.', 'x']) {
        if (payload[i] === replacement) continue;
        const tampered = payload.slice(0, i) + replacement + payload.slice(i + 1);
        expect(verifyQr(keys, tampered).ok, `posição ${i} → ${replacement}`).toBe(false);
        tested++;
      }
    }
    expect(tested).toBeGreaterThan(500);
  });
  it('acrescentar ou tirar caracteres também invalida', () => {
    for (const bad of [
      payload + 'A',
      payload.slice(0, -1),
      ' ' + payload,
      payload + ' ',
      payload.toLowerCase(),
      payload.toUpperCase(),
      '',
      'PX1',
      payload.replace('PX1', 'PX2'),
    ]) {
      expect(verifyQr(keys, bad).ok, bad).toBe(false);
    }
  });
  it('o último caractere da assinatura (com bits sobrando no base64) também não aceita variação', () => {
    const mac = payload.split('.')[4]!;
    const last = mac[mac.length - 1]!;
    for (const c of B64URL) {
      if (c === last) continue;
      expect(verifyQr(keys, payload.slice(0, -1) + c).ok, c).toBe(false);
    }
  });
  it('um QR de um evento não vale em outro: o evento está na assinatura', () => {
    const swapped = payload.replace(EVENT.replaceAll('-', ''), OTHER_EVENT.replaceAll('-', ''));
    expect(verifyQr(keys, swapped)).toEqual({ ok: false, reason: 'assinatura' });
  });
  it('versão de chave desconhecida ou trocada: recusa com o motivo', () => {
    expect(verifyQr(keys, payload.replace('PX1.1.', 'PX1.9.'))).toEqual({ ok: false, reason: 'versao_desconhecida' });
    expect(verifyQr(keys, payload.replace('PX1.1.', 'PX1.2.'))).toEqual({ ok: false, reason: 'assinatura' });
    expect(verifyQr(new Map([[2, k2]]), payload)).toEqual({ ok: false, reason: 'versao_desconhecida' });
  });
  it('assinatura de outra chave nunca confere', () => {
    const forged = signQr(new Map([[1, randomBytes(32)]]), 1, EVENT, code);
    expect(verifyQr(keys, forged)).toEqual({ ok: false, reason: 'assinatura' });
  });
  it('rotação: ingresso emitido com a versão 1 continua válido depois de a 2 passar a ser a atual', () => {
    const old = signQr(keys, 1, EVENT, code);
    const fresh = signQr(keys, 2, EVENT, newTicketCode());
    expect(verifyQr(keys, old)).toMatchObject({ ok: true, keyVersion: 1 });
    expect(verifyQr(keys, fresh)).toMatchObject({ ok: true, keyVersion: 2 });
  });
  it('assinar com versão sem chave é erro de configuração, não QR sem assinatura', () => {
    expect(() => signQr(keys, 7, EVENT, code)).toThrow(/versão 7/);
  });
});

describe('chaves configuradas', () => {
  const b64 = (n: number) => randomBytes(n).toString('base64url');
  it('lê várias versões', () => {
    const parsed = parseQrKeys(`1:${b64(32)}, 2:${b64(48)}`);
    expect([...parsed.keys()]).toEqual([1, 2]);
  });
  it('recusa chave curta, versão repetida, formato errado e vazio', () => {
    expect(() => parseQrKeys(`1:${b64(16)}`)).toThrow(/32 bytes/);
    expect(() => parseQrKeys(`1:${b64(32)},1:${b64(32)}`)).toThrow(/repetida/);
    expect(() => parseQrKeys('abc')).toThrow(/versão:chave/);
    expect(() => parseQrKeys('')).toThrow();
  });
});
