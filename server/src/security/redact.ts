/**
 * Mascaramento de dados sensíveis antes de qualquer linha de log (seção 10 e LGPD): senha, token, segredo, cookie, CPF
 * inteiro, número de cartão (PAN) e CVV nunca podem aparecer. Atua por **nome do campo** e por **formato do valor**.
 */
const SENSITIVE_KEY =
  /(senha|password|passwd|token|secret|segredo|authorization|cookie|set-cookie|api[-_]?key|hmac|signature|assinatura|cvv|cvc|security[-_]?code|card[-_]?number|numero[-_]?cartao|pan$|^cpf$|cpf[-_]?(completo|full)|credential|qr[-_]?payload|private[-_]?key|smtp[-_]?url|database[-_]?url)/i;

const MASK = '[redigido]';

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Mascara, dentro de um texto livre, o que tem formato de dado sensível. */
export function redactText(text: string): string {
  return (
    text
      // Cabeçalhos e URLs com credencial.
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [token]')
      .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s@]+)@/gi, '$1$2:[redigido]@')
      // JWT.
      .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[jwt]')
      // QR do ingresso.
      .replace(/\bPX1\.[A-Za-z0-9._-]{10,}/g, '[qr]')
      // Cartão: 13 a 19 dígitos (com espaço ou hífen) que passam no cálculo de Luhn.
      .replace(/\b(?:\d[ -]?){12,18}\d\b/g, m => {
        const digits = m.replace(/\D/g, '');
        return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? '[pan]' : m;
      })
      // CPF formatado ou só dígitos (11): fica só o fim.
      .replace(/\b(\d{3})\.(\d{3})\.(\d{3})-(\d{2})\b/g, '***.***.***-$4')
      .replace(/(?<![\d.])\d{11}(?![\d])/g, m => `*******${m.slice(-2)}`)
      // E-mail: mantém a primeira letra e o domínio.
      .replace(/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2')
  );
}

export function redact(value: unknown, key = '', depth = 0): unknown {
  if (depth > 8) return MASK;
  if (key && SENSITIVE_KEY.test(key)) return value === null || value === undefined ? value : MASK;
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(v => redact(v, '', depth + 1));
  if (value instanceof Date) return value;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redact(v, k, depth + 1)]),
    );
  return value;
}
