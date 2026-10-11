import { useEffect, useRef, useState } from 'react';
import { api } from './api';

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

export interface HumanState {
  /** O servidor vai exigir o token. */
  required: boolean;
  token: string | null;
}

export function HumanCheck({ onChange, resetKey = 0 }: { onChange: (s: HumanState) => void; resetKey?: number }) {
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const report = useRef(onChange);
  report.current = onChange;

  useEffect(() => {
    const c = new AbortController();
    api
      .site(c.signal)
      .then(s => {
        setSiteKey(s.turnstileSiteKey);
        report.current({ required: Boolean(s.turnstileSiteKey), token: null });
      })
      .catch(() => report.current({ required: false, token: null }));
    return () => c.abort();
  }, []);

  useEffect(() => {
    if (!siteKey || !box.current) return;
    let id: string | undefined;
    let dead = false;
    report.current({ required: true, token: null });
    loadScript()
      .then(() => {
        if (dead || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          language: 'pt-br',
          callback: (token: string) => report.current({ required: true, token }),
          'expired-callback': () => report.current({ required: true, token: null }),
          'error-callback': () => report.current({ required: true, token: null }),
        });
      })
      .catch(() => report.current({ required: true, token: null }));
    return () => {
      dead = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, resetKey]);

  if (!siteKey) return null;
  return <div ref={box} className="px-human" role="group" aria-label="Verificação de que você não é um robô" />;
}
