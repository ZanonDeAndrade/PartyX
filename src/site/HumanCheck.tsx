import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { HUMAN_FAILED_MESSAGE, HUMAN_TIMEOUT_MS, type HumanState } from './humanGate';

/**
 * Desafio Cloudflare Turnstile no cadastro e na recuperação de senha. A chave PÚBLICA vem de `/api/public/site`; sem ela
 * (local, testes, homologação sem chave) o componente não aparece e a tela segue sem desafio. Quem confere o token é o servidor.
 * O token vale para UMA tentativa: depois de cada envio a tela muda `resetKey` para pedir outro.
 */
interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(tag);
  });
  return loading;
}

export type { HumanState } from './humanGate';

export function HumanCheck({ onChange, resetKey = 0 }: { onChange: (s: HumanState) => void; resetKey?: number }) {
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // "Tentar de novo" monta o widget outra vez (e recarrega o script, se foi ele que falhou).
  const [attempt, setAttempt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const report = useRef(onChange);
  report.current = onChange;

  useEffect(() => {
    const c = new AbortController();
    api
      .site(c.signal)
      .then(s => {
        setSiteKey(s.turnstileSiteKey);
        if (!s.turnstileSiteKey) report.current({ required: false, token: null, phase: 'desligado' });
      })
      // Sem a configuração, a tela segue sem desafio; se o servidor exigir, ele recusa com mensagem clara.
      .catch(() => report.current({ required: false, token: null, phase: 'desligado' }));
    return () => c.abort();
  }, []);

  useEffect(() => {
    if (!siteKey || !box.current) return;
    let id: string | undefined;
    let dead = false;
    let got = false;
    const fail = () => {
      if (dead) return;
      setFailed(true);
      report.current({ required: true, token: null, phase: 'falhou' });
    };
    // O token precisa chegar no prazo; se chegar depois (rede lenta), ainda vale.
    let timer = window.setTimeout(() => !got && fail(), HUMAN_TIMEOUT_MS);
    setFailed(false);
    report.current({ required: true, token: null, phase: 'verificando' });
    loadScript()
      .then(() => {
        if (dead || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          language: 'pt-br',
          callback: (token: string) => {
            got = true;
            window.clearTimeout(timer);
            setFailed(false);
            report.current({ required: true, token, phase: 'pronto' });
          },
          // Token vencido: o widget busca outro sozinho; o botão volta a esperar, com novo prazo.
          'expired-callback': () => {
            got = false;
            window.clearTimeout(timer);
            timer = window.setTimeout(() => !got && fail(), HUMAN_TIMEOUT_MS);
            report.current({ required: true, token: null, phase: 'verificando' });
          },
          'error-callback': () => {
            window.clearTimeout(timer);
            fail();
          },
        });
      })
      .catch(() => {
        window.clearTimeout(timer);
        fail();
      });
    return () => {
      dead = true;
      window.clearTimeout(timer);
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, resetKey, attempt]);

  if (!siteKey) return null;
  return (
    <div className="px-human-wrap">
      <div
        ref={box}
        key={attempt}
        className="px-human"
        role="group"
        aria-label="Verificação de que você não é um robô"
      />
      {failed ? (
        <div className="px-human-fail">
          <p className="px-notice px-notice-err" role="alert">
            {HUMAN_FAILED_MESSAGE}
          </p>
          <button type="button" className="px-btn px-btn-ghost" onClick={() => setAttempt(n => n + 1)}>
            Tentar de novo
          </button>
        </div>
      ) : null}
    </div>
  );
}
