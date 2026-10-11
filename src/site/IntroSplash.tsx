import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MARK = 'data-px-intro';
/**
 * Prazo máximo, contado desde que o visitante abriu o endereço (não desde a montagem): o vídeo tem 3 s e, se travar ou
 * demorar a carregar, o site aparece mesmo assim, com o fade terminando dentro do prazo. Com o JavaScript lento, sobra
 * menos tempo para a abertura, nunca mais espera.
 */
const BUDGET_MS = 5000;
/** Igual à transição de `.px-intro` no CSS. */
const FADE_MS = 400;

type Phase = 'playing' | 'leaving' | 'done';

/**
 * Abertura em vídeo da vitrine, uma vez por sessão. Quem decide se toca é `public/intro/gate.js`, antes da primeira pintura;
 * aqui só se lê a marca `<html data-px-intro>`. A página é desenhada normalmente por baixo (o HTML com as tags de Open Graph
 * não depende disto) e fica inerte enquanto a abertura está na tela.
 */
export function IntroSplash() {
  const [phase, setPhase] = useState<Phase>(() => (document.documentElement.hasAttribute(MARK) ? 'playing' : 'done'));
  const leave = useCallback(() => setPhase(p => (p === 'playing' ? 'leaving' : p)), []);
  const close = useCallback(() => setPhase('done'), []);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const t = window.setTimeout(close, FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase, close]);

  useEffect(() => {
    if (phase === 'done') document.documentElement.removeAttribute(MARK);
  }, [phase]);

  // A camada estática do primeiro quadro (index.html) cobre a tela até aqui. Com o vídeo montado por cima (ou sem abertura),
  // ela sai da página: não pode reaparecer durante o fade da abertura.
  useLayoutEffect(() => {
    document.querySelector('.px-intro-static')?.remove();
  }, []);

  if (phase === 'done') return null;
  return createPortal(<IntroOverlay leaving={phase === 'leaving'} onLeave={leave} onClose={close} />, document.body);
}

function IntroOverlay({ leaving, onLeave, onClose }: { leaving: boolean; onLeave: () => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);

  // Enquanto a abertura está na tela: sem rolagem, página inerte e Esc para sair. O foco não é movido: com a página inerte,
  // o primeiro Tab já chega ao "Pular". Ao fechar, tudo volta como estava.
  useEffect(() => {
    const html = document.documentElement;
    const root = document.getElementById('root');
    const before = { html: html.style.overflow, body: document.body.style.overflow };
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    if (root) root.inert = true;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onLeave();
    };
    document.addEventListener('keydown', onKey);
    const safety = window.setTimeout(onLeave, Math.max(0, BUDGET_MS - FADE_MS - performance.now()));
    return () => {
      window.clearTimeout(safety);
      document.removeEventListener('keydown', onKey);
      html.style.overflow = before.html;
      document.body.style.overflow = before.body;
      if (root) root.inert = false;
      if (focused && focused !== document.body && focused.isConnected) focused.focus({ preventScroll: true });
    };
  }, [onLeave]);

  // Autoplay: só sem som e em linha (Safari do iPhone, Chrome do Android). Se o navegador recusar (modo de economia de
  // energia, política de autoplay), a abertura fecha na hora. Ao sair, o vídeo para e solta o arquivo.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.play().catch(onClose);
    return () => {
      v.pause();
      v.querySelectorAll('source').forEach(s => s.removeAttribute('src'));
      v.load();
    };
  }, [onClose]);

  return (
    <div
      className={`px-intro${leaving ? ' px-intro-out' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Abertura PartyX"
    >
      <video
        ref={video}
        className="px-intro-video"
        autoPlay
        muted
        playsInline
        preload="auto"
        poster="/intro/partyx-intro-poster.jpg"
        disablePictureInPicture
        disableRemotePlayback
        tabIndex={-1}
        aria-hidden="true"
        onEnded={onLeave}
        onError={onClose}
      >
        <source src="/intro/partyx-intro.webm" type="video/webm" />
        {/* Erro na última fonte = nenhum formato carregou (o erro de <source> não chega ao <video>). */}
        <source src="/intro/partyx-intro.mp4" type="video/mp4" onError={onClose} />
      </video>
      <button type="button" className="px-intro-skip" aria-label="Pular abertura" onClick={onLeave}>
        Pular
      </button>
    </div>
  );
}
