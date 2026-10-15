import { useEffect, useRef, useState } from 'react';
import type { EventDetail } from './api';
import {
  countdownView,
  nextChangeIn,
  pad2,
  remainingSentence,
  type CountdownView,
} from './eventCountdown';
import { dateLong, timeOf } from './format';

/** O estado do cronômetro agora, pela hora do servidor (relógio do aparelho mais a diferença medida na resposta). */
export function readCountdown(event: EventDetail): CountdownView {
  if (!event.countdown) return { kind: 'oculto' };
  return countdownView(Date.now() + (event.clockOffsetMs ?? 0), event.startsAt, event.countdown.liveUntil);
}

const UNITS = [
  ['days', 'Dias'],
  ['hours', 'Horas'],
  ['minutes', 'Min'],
  ['seconds', 'Seg'],
] as const;

/**
 * Cronômetro da página do evento: quatro blocos (dias, horas, minutos e segundos) antes do início e "Acontecendo agora" até o fim.
 * Anda sozinho, uma vez por segundo e só com a aba visível (para com `visibilityState` escondido e volta na hora certa ao reaparecer),
 * sem chamar o servidor. Avisa a página (`onKind`) só quando o estado muda, para ela não se redesenhar a cada segundo.
 * Os números não são anunciados: ficam num `role="timer"`, que não fala as mudanças; o texto por extenso vai até os minutos.
 */
export function EventCountdown({ event, onKind }: { event: EventDetail; onKind: (kind: CountdownView['kind']) => void }) {
  const [view, setView] = useState<CountdownView>(() => readCountdown(event));
  const kind = useRef(view.kind);
  const report = useRef(onKind);
  report.current = onKind;
  const source = useRef(event);
  source.current = event;
  const clock = `${event.startsAt}|${event.countdown?.liveUntil ?? ''}|${event.clockOffsetMs ?? 0}`;

  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'hidden') return; // aba escondida: parado até voltar
      const next = readCountdown(source.current);
      setView(next);
      if (next.kind !== kind.current) {
        kind.current = next.kind;
        report.current(next.kind);
      }
      const wait = nextChangeIn(next);
      if (Number.isFinite(wait)) timer = window.setTimeout(tick, wait);
    };
    tick();
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [clock]);

  if (view.kind === 'oculto') return null;
  if (view.kind === 'agora')
    return (
      <div className="px-wrap px-countdown-row" data-countdown="agora">
        <p className="px-live">
          <span className="px-live-dot" aria-hidden="true" />
          Acontecendo agora
        </p>
      </div>
    );
  return (
    <div className="px-wrap px-countdown-row" data-countdown="antes">
      <div
        className="px-countdown"
        role="timer"
        aria-label={`Contagem até o início: ${dateLong(event.startsAt)}, às ${timeOf(event.startsAt)}`}
      >
        <span className="px-sr">{remainingSentence(view.parts)}.</span>
        {UNITS.map(([unit, label]) => (
          <span key={unit} className="px-cd-block" data-unit={unit} aria-hidden="true">
            <span className="px-cd-num">{pad2(view.parts[unit])}</span>
            <span className="px-cd-label">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
