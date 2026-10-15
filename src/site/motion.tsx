/**
 * Movimento do site (15/10/2026), sem biblioteca: CSS e, onde precisa de JavaScript, a Web Animations API. As durações e curvas
 * ficam nos tokens de styles/tokens.css (--px-enter-*, --px-hover-dur, --px-admin-fade, --px-gate-flash); aqui só classes e índices.
 * Regras:
 * - só `opacity`, `transform` e `filter`; nada que desloque o layout;
 * - com "reduzir movimento" do aparelho, nada anima (regra global em src/index.css) e os cartões já nascem visíveis;
 * - o QR Code do ingresso NUNCA é animado; a portaria nunca espera animação; nenhuma animação segura um clique.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
  type RefCallback,
} from 'react';

const REDUCE = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches;

/** "Reduzir movimento" do aparelho, acompanhando a mudança com a página aberta. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCE);
    const update = () => setReduce(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduce;
}

/** Posição na cascata (`--i`), usada pela classe `px-in`: cada posição espera um passo (--px-enter-step). */
export const cascade = (index: number): CSSProperties => ({ '--i': index }) as CSSProperties;

// ---------- cartões que entram ao aparecer na tela ----------

/** Cartões já mostrados nesta visita: voltar à vitrine não repete a entrada. */
const revealed = new Set<string>();
const listeners = new WeakMap<Element, (index: number) => void>();
let observer: IntersectionObserver | null = null;

function revealObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    entries => {
      // Os que apareceram juntos entram em cascata, na ordem da página (de cima para baixo, da esquerda para a direita).
      const shown = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
      shown.forEach((entry, i) => {
        observer!.unobserve(entry.target);
        listeners.get(entry.target)?.(Math.min(i, 7));
        listeners.delete(entry.target);
      });
    },
    { threshold: 0.12 },
  );
  return observer;
}

/**
 * Entrada de um cartão quando ele aparece na tela (IntersectionObserver), só na primeira vez nesta visita. Antes de aparecer fica
 * transparente (`data-reveal="wait"`); ao aparecer, entra com o padrão do site (`data-reveal="in"`), em cascata com os que apareceram
 * junto; no fim, o atributo sai. Sem IntersectionObserver ou com menos movimento: o cartão já nasce visível.
 */
export function useReveal(id: string): {
  ref: RefCallback<HTMLElement>;
  props: { 'data-reveal'?: 'wait' | 'in'; style?: CSSProperties; onAnimationEnd?: (e: AnimationEvent) => void };
} {
  const [phase, setPhase] = useState<'wait' | 'in' | 'done'>(() =>
    revealed.has(id) || prefersReducedMotion() || typeof IntersectionObserver === 'undefined' ? 'done' : 'wait',
  );
  const [index, setIndex] = useState(0);
  const node = useRef<HTMLElement | null>(null);
  const ref = useCallback<RefCallback<HTMLElement>>(
    el => {
      if (node.current && node.current !== el) {
        revealObserver().unobserve(node.current);
        listeners.delete(node.current);
      }
      node.current = el;
      if (!el || phase !== 'wait') return;
      listeners.set(el, i => {
        revealed.add(id);
        setIndex(i);
        setPhase('in');
      });
      revealObserver().observe(el);
    },
    [id, phase],
  );
  if (phase === 'wait') return { ref, props: { 'data-reveal': 'wait' } };
  if (phase === 'in') {
    const done = (e: AnimationEvent) => {
      if (e.target === e.currentTarget) setPhase('done');
    };
    return { ref, props: { 'data-reveal': 'in', style: cascade(index), onAnimationEnd: done } };
  }
  return { ref, props: {} };
}

// ---------- número que rola ----------

/**
 * Texto que troca rolando na direção da mudança (quantidade, total): o valor novo entra deslizando 60% e assenta em 180 ms; a primeira
 * exibição não anima. Com menos movimento, troca direto (regra em base.css).
 */
export function Roll({ value, className }: { value: string; className?: string }) {
  const prev = useRef(value);
  const dir = useRef(0);
  if (prev.current !== value) {
    const a = Number(prev.current.replace(/\D/g, '')) || 0;
    const b = Number(value.replace(/\D/g, '')) || 0;
    dir.current = b >= a ? 1 : -1;
    prev.current = value;
  }
  return (
    <span className={`px-roll ${className ?? ''}`}>
      <span key={value} className={dir.current ? 'px-roll-in' : undefined} style={{ '--dir': dir.current } as CSSProperties}>
        {value}
      </span>
    </span>
  );
}
