import { useLayoutEffect, useRef } from 'react';
import { HexColorPicker } from 'react-colorful';

/**
 * Quadrado de saturação e brilho com a barra de matiz logo abaixo (`react-colorful` 5.8.1, versão fixa). Vai no arquivo do painel,
 * que o site público nunca baixa. Não fica num arquivo próprio, pedido só no formulário, porque a biblioteca importa o React como
 * padrão (`import React from 'react'`) e, separada, o empacotador tirava o React do JavaScript do site para um arquivo comum.
 * Mouse, toque (sem rolar a página: `touch-action: none` da biblioteca) e teclado (setas: 5% no quadrado, 18 graus na barra) vêm
 * da biblioteca; os nomes para leitor de tela, que ela escreve em inglês, são trocados aqui por português.
 */
export default function ColorArea({
  color,
  onChange,
  onChangeEnd,
}: {
  /** `#RRGGBB` mostrado no seletor. */
  color: string;
  /** A cada movimento (arrastar ou seta), em `#RRGGBB` maiúsculo. */
  onChange: (hex: string) => void;
  /** Ao soltar o arrasto ou a tecla, com a cor final. */
  onChangeEnd: (hex: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    translate(el);
    // A biblioteca regrava os atributos quando o valor muda; o observador traduz de novo antes da próxima pintura.
    const observer = new MutationObserver(() => translate(el));
    observer.observe(el, { subtree: true, attributes: true, attributeFilter: ['aria-label', 'aria-valuetext', 'aria-valuenow'] });
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root} className="px-color-area">
      <HexColorPicker
        color={color}
        onChange={hex => onChange(hex.toUpperCase())}
        onChangeEnd={hex => onChangeEnd(hex.toUpperCase())}
      />
    </div>
  );
}

const LABELS: Record<string, string> = { Color: 'Saturação e brilho', Hue: 'Matiz' };

/** Troca os nomes e valores em inglês da biblioteca; só escreve quando muda (o observador não entra em laço). */
function translate(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>('[role="slider"]')) {
    const label = el.getAttribute('aria-label');
    if (label && LABELS[label]) el.setAttribute('aria-label', LABELS[label]);
    let text: string | null = null;
    if (el.closest('.react-colorful__hue')) {
      const deg = Number(el.getAttribute('aria-valuenow'));
      if (Number.isFinite(deg)) text = `${deg} graus, ${hueName(deg)}`;
    } else {
      const m = /^Saturation (\d+)%, Brightness (\d+)%$/.exec(el.getAttribute('aria-valuetext') ?? '');
      if (m) text = `Saturação ${m[1]}%, brilho ${m[2]}%`;
    }
    if (text && el.getAttribute('aria-valuetext') !== text) el.setAttribute('aria-valuetext', text);
  }
}

/** Nome da faixa de matiz, para o leitor de tela dizer onde a barra está. */
export function hueName(deg: number): string {
  const h = ((deg % 360) + 360) % 360;
  if (h < 15 || h >= 345) return 'vermelho';
  if (h < 45) return 'laranja';
  if (h < 70) return 'amarelo';
  if (h < 160) return 'verde';
  if (h < 200) return 'ciano';
  if (h < 255) return 'azul';
  if (h < 290) return 'roxo';
  return 'rosa';
}
