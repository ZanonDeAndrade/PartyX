/**
 * Cor de destaque do evento (0014, 15/10/2026): a partir de uma cor `#RRGGBB`, os tons que a página do evento usa, todos com o
 * contraste WCAG conferido. Puro, sem DOM: a página aplica o resultado por variáveis CSS (`accentStyle`), nunca montando CSS com texto.
 *
 * Superfícies da página do evento: o preto de marca (#0B0B10) e o quadro branco de ingressos. O texto sobre a cor é branco ou o preto
 * de marca, o que der mais contraste; se nenhum chegar a 4,5:1, a cor de fundo anda na luminosidade (mesmo matiz) até o tom mais
 * próximo que chega. Links e linhas usam a própria cor quando ela já se lê na superfície; senão, um tom mais claro ou mais escuro.
 */

export const ACCENT_DEFAULT = '#7C3AED';
const INK = '#0B0B10';
const WHITE = '#FFFFFF';

export type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : null;
}

/** O que a pessoa digitou no campo, em `#RRGGBB` (aceita sem o `#` e em minúsculas); nulo se não for uma cor assim. */
export function normalizeHex(raw: string): string | null {
  const t = raw.trim().replace(/^(?!#)/, '#');
  return /^#[0-9a-f]{6}$/i.test(t) ? t.toUpperCase() : null;
}

export function toHex([r, g, b]: Rgb): string {
  const h = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** Luminância relativa (WCAG 2.x). */
export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Razão de contraste WCAG entre duas cores (1 a 21). */
export function contrast(a: Rgb | string, b: Rgb | string): number {
  const la = luminance(typeof a === 'string' ? parseHex(a)! : a);
  const lb = luminance(typeof b === 'string' ? parseHex(b)! : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [h / 6, s, l];
}

function fromHsl([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [ch(h + 1 / 3) * 255, ch(h) * 255, ch(h - 1 / 3) * 255];
}

const round = (c: Rgb): Rgb => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];

/**
 * O tom mais próximo de `rgb` (mesmo matiz e saturação, só a luminosidade muda) que satisfaz `ok`. `up` clareia, `down` escurece,
 * `both` tenta os dois lados e fica com o primeiro que passar. A própria cor volta se já passar.
 */
function nearest(rgb: Rgb, ok: (c: Rgb) => boolean, dir: 'up' | 'down' | 'both'): Rgb {
  if (ok(rgb)) return rgb;
  const [h, s, l] = toHsl(rgb);
  for (let step = 0.005; step <= 1; step += 0.005) {
    if (dir !== 'down' && l + step <= 1) {
      const c = round(fromHsl([h, s, l + step]));
      if (ok(c)) return c;
    }
    if (dir !== 'up' && l - step >= 0) {
      const c = round(fromHsl([h, s, l - step]));
      if (ok(c)) return c;
    }
  }
  return dir === 'down' ? [0, 0, 0] : [255, 255, 255];
}

/** Mistura com preto (`amount` > 0 escurece) ou com branco (`amount` < 0 clareia). */
function shade([r, g, b]: Rgb, amount: number): Rgb {
  if (amount >= 0) return round([r * (1 - amount), g * (1 - amount), b * (1 - amount)]);
  const a = -amount;
  return round([r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a]);
}

export const TEXT_MIN = 4.5;
const LINE_MIN = 3;

export interface AccentPalette {
  /** A cor escolhida, em maiúsculas. */
  base: string;
  /** Fundo do botão "Continuar", do bloco da data e do cronômetro: a escolhida ou, se nada se lê sobre ela, o tom mais próximo que funciona. */
  fill: string;
  /** Texto sobre `fill`: branco ou o preto de marca. */
  onFill: string;
  /** Contraste de `onFill` sobre `fill` (no mínimo 4,5). */
  fillContrast: number;
  hover: string;
  press: string;
  /** Anel de foco: 3:1 sobre o preto e sobre o branco. */
  focus: string;
  /** Links e frase do cronômetro sobre o preto (4,5:1). */
  onDark: string;
  /** Linhas laterais (Quando, Onde, Classificação) e borda do aviso de menores: 3:1 sobre o preto. */
  line: string;
  /** Texto em destaque no quadro branco de ingressos ("Últimas unidades", links): 4,5:1 sobre o branco. */
  onLight: string;
  /** Fundo suave (passar o mouse nos botões claros, aviso informativo) e o texto sobre ele (4,5:1). */
  soft: string;
  softInk: string;
  /** Fundo do aviso de menores, sobre o preto. */
  tint: string;
  /** Borda do botão quando a cor quase some no quadro branco; nula se não precisa. */
  edge: string | null;
  /** O que o painel avisa: ajuste do fundo, tons diferentes nos links e linhas, cor que some no preto ou no branco. */
  notes: string[];
}

/** Paleta da cor; nulo se o texto não for `#RRGGBB`. */
export function accentPalette(hex: string): AccentPalette | null {
  const base = parseHex(hex);
  if (!base) return null;
  const ink = parseHex(INK)!;
  const white = parseHex(WHITE)!;
  const bestText = (c: Rgb) => Math.max(contrast(white, c), contrast(ink, c));
  const notes: string[] = [];
  const baseHex = toHex(base);

  const fill = nearest(base, c => bestText(c) >= TEXT_MIN, 'both');
  const fillHex = toHex(fill);
  const onFill = contrast(white, fill) >= contrast(ink, fill) ? WHITE : INK;
  if (fillHex !== baseHex) {
    notes.push(
      `Nem texto branco nem preto chegam a 4,5:1 sobre ${baseHex}. O botão, o bloco da data e o cronômetro usam ${fillHex}, o tom mais próximo que se lê bem.`,
    );
  }

  // Passar o mouse e pressionar: na direção que aumenta o contraste do texto. Se a cor já está perto do extremo (branco ou preto), a
  // mudança mal apareceria; aí as duas vão para o outro lado, desde que o texto continue com 4,5:1.
  const text = parseHex(onFill)!;
  const sign = onFill === WHITE ? 1 : -1;
  const flip =
    contrast(shade(fill, sign * 0.12), fill) < 1.08 &&
    [0.12, 0.22].every(a => contrast(shade(fill, -sign * a), text) >= TEXT_MIN);
  const variant = (amount: number) => shade(fill, (flip ? -sign : sign) * amount);

  const focus = nearest(
    base,
    c => contrast(c, ink) >= LINE_MIN && contrast(c, white) >= LINE_MIN,
    luminance(base) < 0.12 ? 'up' : 'down',
  );
  const onDark = nearest(base, c => contrast(c, ink) >= TEXT_MIN, 'up');
  const line = nearest(base, c => contrast(c, ink) >= LINE_MIN, 'up');
  const onLight = nearest(base, c => contrast(c, white) >= TEXT_MIN, 'down');
  const soft = shade(base, -0.86);
  const softInk = nearest(base, c => contrast(c, soft) >= TEXT_MIN, 'down');

  if (toHex(line) !== baseHex) {
    notes.push(`Sobre o fundo preto da página, links e linhas usam um tom mais claro (${toHex(onDark)}) para aparecer bem.`);
  } else if (toHex(onDark) !== baseHex) {
    notes.push(`Sobre o fundo preto da página, os links usam um tom um pouco mais claro (${toHex(onDark)}) para ler bem.`);
  }
  if (toHex(onLight) !== baseHex) {
    notes.push(`No quadro branco de ingressos, o aviso e os links usam um tom mais escuro (${toHex(onLight)}).`);
  }
  if (contrast(fill, ink) < 1.4) {
    notes.push('Cor muito escura: o bloco da data e o cronômetro quase somem sobre o fundo preto da página.');
  }
  const edge = contrast(fill, white) < 1.6 ? toHex(nearest(fill, c => contrast(c, white) >= LINE_MIN, 'down')) : null;
  if (edge) notes.push('Cor muito clara: o botão ganha uma borda mais escura para aparecer no quadro branco.');

  return {
    base: baseHex,
    fill: fillHex,
    onFill,
    fillContrast: Math.max(contrast(white, fill), contrast(ink, fill)),
    hover: toHex(variant(0.12)),
    press: toHex(variant(0.22)),
    focus: toHex(focus),
    onDark: toHex(onDark),
    line: toHex(line),
    onLight: toHex(onLight),
    soft: toHex(soft),
    softInk: toHex(softInk),
    tint: `rgb(${line.join(' ')} / 0.1)`,
    edge,
    notes,
  };
}

/**
 * Variáveis CSS que redefinem os tokens de destaque (`tokens.css`) dentro da página do evento. Os valores vêm só de `accentPalette`
 * (hexadecimais calculados, nunca o texto recebido), então não há como injetar CSS por aqui.
 */
export function accentVars(p: AccentPalette): Record<string, string> {
  const [fr, fg, fb] = parseHex(p.focus)!;
  const vars: Record<string, string> = {
    '--px-violet': p.fill,
    '--px-violet-hover': p.hover,
    '--px-violet-press': p.press,
    '--px-violet-bright': p.focus,
    '--px-violet-soft': p.soft,
    '--px-violet-ink': p.softInk,
    '--px-violet-text': p.onLight,
    '--px-violet-line': p.line,
    '--px-lilac': p.onDark,
    '--px-on-accent': p.onFill,
    '--px-accent-tint': p.tint,
    '--px-focus-glow': `rgb(${fr} ${fg} ${fb} / 0.35)`,
    '--px-info-bg': p.soft,
    '--px-info-fg': p.softInk,
  };
  if (p.edge) vars['--px-accent-edge'] = p.edge;
  return vars;
}

/** Só o bloco da data (card da vitrine): fundo e texto. */
export function stubVars(p: AccentPalette): Record<string, string> {
  return { '--px-violet': p.fill, '--px-on-accent': p.onFill };
}
