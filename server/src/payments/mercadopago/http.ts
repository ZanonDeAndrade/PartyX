import { GatewayError, GatewayKeyReusedError, GatewayRejectedError } from '../gateway';

/**
 * Chamadas HTTP à API do Mercado Pago (`https://api.mercadopago.com`), com `fetch` e sem SDK. Tudo do Mercado Pago fica
 * dentro de `payments/mercadopago/`.
 *
 * - Tempo limite por tentativa. Nova tentativa **só** em operação idempotente (consulta, ou criação com o mesmo
 *   `X-Idempotency-Key`) e só para falha de rede, tempo esgotado, 429 ou 5xx.
 * - O token vai só no cabeçalho `Authorization`. Nenhuma mensagem de erro carrega token, corpo enviado ou resposta: só o
 *   código HTTP e o código de erro do Mercado Pago (ex.: `idempotency_key_already_used`).
 */
export const MP_API = 'https://api.mercadopago.com';

export interface MpHttpOptions {
  accessToken: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Por tentativa. Padrão 7 s: duas tentativas cabem nos 22 s que o Mercado Pago espera a resposta do webhook. */
  timeoutMs?: number;
  /** Tentativas extras em operação idempotente. Padrão 1. */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface MpRequest {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  /** Pode repetir com segurança (consulta, ou criação com chave de idempotência). */
  idempotent: boolean;
  /**
   * HTTP 402 da criação de order: "a order foi criada, mas alguma transação falhou" (ex.: cartão recusado). A order vem em `data`
   * e é devolvida como resposta normal, para a recusa seguir o mesmo caminho da reconsulta.
   */
  acceptFailedOrder?: boolean;
}

/** Código de erro do Mercado Pago (`errors[0].code`), quando houver. Só letras, números e sublinhado: nunca ecoa texto livre. */
function errorCode(body: unknown): string {
  const errors = (body as { errors?: { code?: unknown }[] } | null)?.errors;
  const code = Array.isArray(errors) ? errors[0]?.code : undefined;
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,60}$/.test(code) ? code.toLowerCase() : 'sem_codigo';
}

export function createMpHttp(options: MpHttpOptions) {
  const base = (options.baseUrl ?? MP_API).replace(/\/$/, '');
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 7000;
  const retries = options.retries ?? 1;
  const sleep = options.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));

  async function once<T>(req: MpRequest): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.accessToken}`,
      Accept: 'application/json',
      ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(req.idempotencyKey ? { 'X-Idempotency-Key': req.idempotencyKey } : {}),
      ...req.headers,
    };
    let res: Response;
    try {
      res = await doFetch(`${base}${req.path}`, {
        method: req.method,
        headers,
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new GatewayError(timeout ? 'mercadopago: tempo esgotado' : 'mercadopago: falha de rede', true);
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (res.ok) {
      if (body === null || typeof body !== 'object') throw new GatewayError('mercadopago: resposta ilegível', true);
      return body as T;
    }
    const data = (body as { data?: unknown } | null)?.data;
    if (res.status === 402 && req.acceptFailedOrder && data && typeof data === 'object') return data as T;
    // 423: a mesma chave de idempotência ainda está em processamento. Repetir depois é seguro.
    if (res.status === 429 || res.status === 423 || res.status >= 500)
      throw new GatewayError(`mercadopago: HTTP ${res.status}`, true);
    if (res.status === 401 || res.status === 403) {
      // Credencial errada ou sem permissão: configuração nossa, não recusa do comprador. Não adianta repetir.
      throw new GatewayError(`mercadopago: credencial recusada (HTTP ${res.status})`, false);
    }
    if (res.status === 404) throw new GatewayRejectedError('mercadopago_nao_encontrado');
    // Mesma chave, corpo diferente: a primeira criação pode ter dado certo no Mercado Pago (provado no ambiente de teste, 12/10/2026).
    if (res.status === 409 && errorCode(body) === 'idempotency_key_already_used') throw new GatewayKeyReusedError();
    throw new GatewayRejectedError(`mercadopago_${res.status}_${errorCode(body)}`);
  }

  return {
    async request<T>(req: MpRequest): Promise<T> {
      let attempt = 0;
      for (;;) {
        try {
          return await once<T>(req);
        } catch (error) {
          const retryable =
            error instanceof GatewayError && !(error instanceof GatewayRejectedError) && error.retryable;
          if (!req.idempotent || !retryable || attempt >= retries) throw error;
          await sleep(300 * 3 ** attempt);
          attempt++;
        }
      }
    },
  };
}

export type MpHttp = ReturnType<typeof createMpHttp>;
