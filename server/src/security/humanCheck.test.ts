import { describe, expect, it, vi } from 'vitest';
import { TURNSTILE_VERIFY_URL, turnstileVerifier } from './humanCheck';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const verifier = (fetchImpl: typeof fetch, timeoutMs?: number) => turnstileVerifier('segredo-de-teste-123', { fetchImpl, timeoutMs });

describe('turnstileVerifier', () => {
  it('confirmado pela Cloudflare: ok; envia a chave e o token como formulário, sem IP', async () => {
    const f = vi.fn(async () => json({ success: true, 'error-codes': [] }));
    expect(await verifier(f as unknown as typeof fetch).verify('token-abc')).toBe('ok');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(String(init.body));
    expect([body.get('secret'), body.get('response')]).toEqual(['segredo-de-teste-123', 'token-abc']);
    expect(body.has('remoteip')).toBe(false); // o IP pode ser forjado: não vai como prova
  });

  it('token recusado, vencido ou já usado: invalid', async () => {
    for (const code of ['invalid-input-response', 'timeout-or-duplicate', 'bad-request']) {
      const f = vi.fn(async () => json({ success: false, 'error-codes': [code] }));
      expect(await verifier(f as unknown as typeof fetch).verify('t'), code).toBe('invalid');
    }
  });

  it('token ausente, vazio ou grande demais: invalid, sem chamar a Cloudflare', async () => {
    const f = vi.fn();
    const v = verifier(f as unknown as typeof fetch);
    for (const t of [undefined, '', 'x'.repeat(2049)]) expect(await v.verify(t)).toBe('invalid');
    expect(f).not.toHaveBeenCalled();
  });

  it('falha fechada: erro de rede, HTTP 500, resposta estranha, chave rejeitada e tempo esgotado viram "unavailable"', async () => {
    const cases: [string, typeof fetch][] = [
      ['rede', (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch],
      ['http 500', (async () => json({}, 500)) as unknown as typeof fetch],
      ['sem success', (async () => json({ ok: true })) as unknown as typeof fetch],
      ['não é JSON', (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch],
      ['erro interno', (async () => json({ success: false, 'error-codes': ['internal-error'] })) as unknown as typeof fetch],
      ['chave inválida', (async () => json({ success: false, 'error-codes': ['invalid-input-secret'] })) as unknown as typeof fetch],
    ];
    for (const [name, f] of cases) expect(await verifier(f).verify('t'), name).toBe('unavailable');
    const hang = (async (_u: unknown, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abortado'))))) as unknown as typeof fetch;
    expect(await verifier(hang, 40).verify('t')).toBe('unavailable');
  });

  it('o log de indisponibilidade leva o alerta e NUNCA a chave nem o token', async () => {
    const out: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((c: unknown) => (out.push(String(c)), true)) as never);
    try {
      await verifier((async () => { throw new Error('falha'); }) as unknown as typeof fetch).verify('token-secreto-xyz');
    } finally {
      spy.mockRestore();
    }
    const all = out.join('');
    expect(all).toContain('verificacao_humana_indisponivel');
    expect(all).not.toContain('segredo-de-teste-123');
    expect(all).not.toContain('token-secreto-xyz');
  });
});
