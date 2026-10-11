import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Códigos do ingresso (RF-38, RF-39, CA-20, CA-22). Regras puras, sem banco.
 *
 * - `code`: segredo aleatório de 144 bits (18 bytes em base64url, 24 caracteres). Impossível de adivinhar; nunca aparece em lista.
 * - `shortCode`: PX-XXXX-XXXX, 40 bits, para o comprador ditar e a portaria buscar. **Não é credencial**: validar exige o QR.
 * - QR: `PX1.<versão da chave>.<evento>.<code>.<assinatura>`. A assinatura é HMAC-SHA256 (truncado a 128 bits) sobre
 *   o prefixo, a versão, o evento **e** o código. Trocar qualquer caractere invalida a leitura, e um QR de um evento
 *   não vale em outro (o evento entra na assinatura).
 */

export type QrKeys = ReadonlyMap<number, Buffer>;

export const QR_PREFIX = 'PX1';
const MAC_BYTES = 16;

export const newTicketCode = (): string => randomBytes(18).toString('base64url');

/** Sem I, O, 0 e 1, que se confundem ao ditar. 32 símbolos: 256 é múltiplo de 32, então não há viés ao escolher por byte. */
export const SHORT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newShortCode(): string {
  const bytes = randomBytes(8);
  const chars = [...bytes].map(b => SHORT_ALPHABET[b % SHORT_ALPHABET.length]!);
  return `PX-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

const hex32 = (uuid: string): string => uuid.replaceAll('-', '').toLowerCase();
const unhex32 = (h: string): string =>
  `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;

function mac(key: Buffer, signed: string): string {
  return createHmac('sha256', key).update(signed).digest().subarray(0, MAC_BYTES).toString('base64url');
}

/** Monta o conteúdo do QR com a chave da versão indicada. */
export function signQr(keys: QrKeys, keyVersion: number, eventId: string, code: string): string {
  const key = keys.get(keyVersion);
  if (!key) throw new Error(`chave de QR versão ${keyVersion} não configurada`);
  const signed = `${QR_PREFIX}.${keyVersion}.${hex32(eventId)}.${code}`;
  return `${signed}.${mac(key, signed)}`;
}

export type QrCheck =
  | { ok: true; keyVersion: number; eventId: string; code: string }
  | { ok: false; reason: 'formato' | 'versao_desconhecida' | 'assinatura' };

const FORMAT = /^PX1\.(\d{1,4})\.([0-9a-f]{32})\.([A-Za-z0-9_-]{22,64})\.([A-Za-z0-9_-]{22})$/;

/**
 * Confere a assinatura. A comparação é entre o texto da assinatura recalculada e a recebida (não entre bytes
 * decodificados), em tempo constante: o último caractere do base64 tem bits sobrando, e comparar bytes deixaria
 * variações dele passarem.
 */
export function verifyQr(keys: QrKeys, payload: string): QrCheck {
  const m = FORMAT.exec(payload);
  if (!m) return { ok: false, reason: 'formato' };
  const keyVersion = Number(m[1]);
  const key = keys.get(keyVersion);
  if (!key) return { ok: false, reason: 'versao_desconhecida' };
  const [, , eventHex, code, given] = m as unknown as [string, string, string, string, string];
  const expected = mac(key, `${QR_PREFIX}.${keyVersion}.${eventHex}.${code}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'assinatura' };
  return { ok: true, keyVersion, eventId: unhex32(eventHex), code };
}

/** Lê "1:chave,2:chave" (chaves em base64url). Cada chave precisa ter pelo menos 32 bytes. */
export function parseQrKeys(spec: string): QrKeys {
  const keys = new Map<number, Buffer>();
  for (const part of spec
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)) {
    const m = /^(\d{1,4}):([A-Za-z0-9_-]+)$/.exec(part);
    if (!m) throw new Error('QR_HMAC_KEYS: use "versão:chave" separados por vírgula');
    const key = Buffer.from(m[2]!, 'base64url');
    if (key.length < 32) throw new Error(`QR_HMAC_KEYS: a chave da versão ${m[1]} precisa de pelo menos 32 bytes`);
    if (keys.has(Number(m[1]))) throw new Error(`QR_HMAC_KEYS: versão ${m[1]} repetida`);
    keys.set(Number(m[1]), key);
  }
  if (keys.size === 0) throw new Error('QR_HMAC_KEYS: nenhuma chave informada');
  return keys;
}
