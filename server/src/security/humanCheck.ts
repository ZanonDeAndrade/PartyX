import { logger } from '../logger';

/**
 * Verificação de que quem pede é uma pessoa (Cloudflare Turnstile), feita NO SERVIDOR. O navegador só entrega um token de uso único;
 * quem confere é a API da Cloudflare, com a chave secreta (Secret Manager). Existe porque os limites por IP podem ser contornados
 * quando o `run.app` é chamado direto (o `X-Forwarded-For` é forjável ali): o token não é forjável.
 *
 * Resultado:
 * - `ok`: a Cloudflare confirmou.
 * - `invalid`: token ausente, vencido, já usado ou recusado.
 * - `unavailable`: a Cloudflare não respondeu a tempo ou respondeu algo inesperado. A rota **recusa** (falha fechada): liberar sem
 *   verificar abriria o cadastro e a recuperação ao abuso justamente quando o serviço está fora.
 */
export type HumanCheck = 'ok' | 'invalid' | 'unavailable';

export interface HumanVerifier {
  verify(token: string | undefined): Promise<HumanCheck>;
}

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** Limite do tamanho do token pela Cloudflare. */
const MAX_TOKEN = 2048;
/** Códigos que indicam problema do lado da Cloudflare ou da nossa configuração, não do visitante. */
const SERVER_SIDE_ERRORS = new Set(['internal-error', 'invalid-input-secret', 'missing-input-secret']);

export function turnstileVerifier(
  secret: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): HumanVerifier {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  return {
    async verify(token) {
      if (!token || token.length > MAX_TOKEN) return 'invalid'; // nem chama a Cloudflare
      try {
        const res = await doFetch(TURNSTILE_VERIFY_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret, response: token }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`http_${res.status}`);
        const body = (await res.json()) as { success?: unknown; 'error-codes'?: unknown };
        if (typeof body.success !== 'boolean') throw new Error('resposta_inesperada');
        if (body.success) return 'ok';
        const codes = Array.isArray(body['error-codes']) ? (body['error-codes'] as string[]) : [];
        if (codes.some(c => SERVER_SIDE_ERRORS.has(c))) throw new Error(`cloudflare_${codes.join('+')}`);
        return 'invalid';
      } catch (error) {
        logger.error('verificação humana indisponível', {
          error: error instanceof Error ? error.message.slice(0, 80) : 'desconhecido',
          alert: 'verificacao_humana_indisponivel',
        });
        return 'unavailable';
      }
    },
  };
}
