import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Validação da assinatura das notificações (Webhooks) do Mercado Pago, sem SDK:
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 *
 * 1. O cabeçalho `x-signature` traz `ts=<instante>,v1=<hmac>`.
 * 2. Manifesto: `id:<data.id da URL>;request-id:<x-request-id>;ts:<ts>;` (parte ausente sai do manifesto; o data.id
 *    alfanumérico vai em minúsculas).
 * 3. HMAC-SHA256 do manifesto com a assinatura secreta da aplicação, em hexadecimal, comparado em tempo constante.
 * 4. `ts` precisa estar dentro da tolerância (a documentação sugere comparar com o instante do recebimento).
 *    A documentação diz que `ts` vem em milissegundos, mas o exemplo dela está em segundos: aceita os dois.
 */

/** Tolerância entre o `ts` da notificação e o relógio do servidor, em segundos. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureResult =
  'ok' | 'assinatura_ausente' | 'formato_invalido' | 'assinatura_invalida' | 'fora_do_prazo';

export function buildManifest(parts: { dataId: string | null; requestId: string | null; ts: string }): string {
  let manifest = '';
  if (parts.dataId) manifest += `id:${parts.dataId.toLowerCase()};`;
  if (parts.requestId) manifest += `request-id:${parts.requestId};`;
  return `${manifest}ts:${parts.ts};`;
}

export function signManifest(manifest: string, secret: string): string {
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

export function verifySignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
  nowMs: number;
  toleranceSeconds?: number;
}): SignatureResult {
  if (!input.xSignature) return 'assinatura_ausente';
  if (input.xSignature.length > 300) return 'formato_invalido';
  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of input.xSignature.split(',')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === 'ts') ts = value;
    else if (key === 'v1') v1 = value;
  }
  if (!ts || !/^\d{9,14}$/.test(ts) || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return 'formato_invalido';
  if (input.xRequestId && (input.xRequestId.length > 200 || /[;\s]/.test(input.xRequestId))) return 'formato_invalido';
  if (input.dataId && !/^[A-Za-z0-9_-]{1,64}$/.test(input.dataId)) return 'formato_invalido';

  const expected = Buffer.from(
    signManifest(buildManifest({ dataId: input.dataId, requestId: input.xRequestId, ts }), input.secret),
    'hex',
  );
  const given = Buffer.from(v1.toLowerCase(), 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'assinatura_invalida';

  const n = Number(ts);
  const tsMs = n >= 1e12 ? n : n * 1000;
  const tolerance = (input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS) * 1000;
  if (Math.abs(input.nowMs - tsMs) > tolerance) return 'fora_do_prazo';
  return 'ok';
}
