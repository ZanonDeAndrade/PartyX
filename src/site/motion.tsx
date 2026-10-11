/**
 * Movimento do site (biblioteca `motion`, com LazyMotion: o núcleo vai no pacote principal e os recursos de animação
 * chegam depois, em pacote próprio).
 * Durações e curvas espelham os tokens de styles/tokens.css. Regras:
 * - só `transform` e `opacity`; nada que desloque o layout;
 * - com "reduzir movimento" do aparelho, tudo vira troca instantânea (`useReducedMotion`);
 * - o QR Code do ingresso NUNCA é animado; a portaria nunca espera animação.
 */
import { AnimatePresence, LazyMotion, m, MotionConfig, useReducedMotion } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';

/** Os recursos de animação (cerca de 24 kB comprimidos) chegam depois: a página aparece sem esperar por eles. */
const loadFeatures = () => import('./motion-features').then(r => r.default);

export const DUR = { micro: 0.18, open: 0.24, enter: 0.34, page: 0.46 } as const;
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/** Envolve o site: carrega só os recursos de animação usados e respeita "reduzir movimento" em todos os componentes. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: DUR.enter, ease: EASE_OUT }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

export { AnimatePresence, m, useReducedMotion };

/** Verdadeiro só na primeira montagem do componente: a entrada escalonada não se repete a cada nova busca. */
export function useFirstMount(): boolean {
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return first.current;
}

/**
 * Entrada escalonada curta (cartões da vitrine). Cada item sobe 12 px e aparece; o atraso para no oitavo item, para a lista
 * longa não "escorrer". Sem animação quando `play` é falso (renderizações seguintes) ou com movimento reduzido.
 */
export function staggerIn(index: number, play: boolean) {
  if (!play) return {};
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DUR.enter, ease: EASE_OUT, delay: Math.min(index, 7) * 0.045 },
  } as const;
}

/**
 * Texto que troca rolando na direção da mudança (quantidade, total). O valor antigo sai e o novo entra; a largura é a do
 * novo valor, sem empurrar o resto (o container corta o excesso verticalmente).
 */
export function Roll({ value, className }: { value: string; className?: string }) {
  const reduce = useReducedMotion();
  const prev = useRef(value);
  const dir = useRef(1);
  if (prev.current !== value) {
    const a = Number(prev.current.replace(/\D/g, '')) || 0;
    const b = Number(value.replace(/\D/g, '')) || 0;
    dir.current = b >= a ? 1 : -1;
    prev.current = value;
  }
  if (reduce) return <span className={className}>{value}</span>;
  return (
    <span className={`px-roll ${className ?? ''}`}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir.current}>
        <m.span
          key={value}
          custom={dir.current}
          initial={{ y: `${60 * dir.current}%`, opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: `${-60 * dir.current}%`, opacity: 0 }}
          transition={{ duration: DUR.micro, ease: EASE_OUT }}
          style={{ display: 'inline-block' }}
        >
          {value}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
