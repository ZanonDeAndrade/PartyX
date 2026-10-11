// Confere o contraste WCAG dos pares de cor usados no site, lendo os valores de src/site/styles/tokens.css.
// Uso: node infra/ui/contrast.mjs   (sai com código 1 se algum par de texto ficar abaixo de AA)
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../../src/site/styles/tokens.css', import.meta.url), 'utf8');
const tok = Object.fromEntries([...css.matchAll(/--(px-[a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));
const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const v = n => (n.startsWith('#') ? n : tok[n]);
// [texto, fundo, uso, mínimo] ; mínimo 4.5 para texto comum, 3 para texto grande (>= 24 px ou 19 px negrito) e elementos de interface.
const pairs = [
  ['px-text', 'px-ops', 'texto principal no fundo claro', 4.5],
  ['px-text-2', 'px-ops', 'texto secundário no claro', 4.5],
  ['px-text-3', 'px-ops', 'texto de apoio no claro', 4.5],
  ['px-text-3', 'px-paper', 'texto de apoio no cartão branco', 4.5],
  ['px-on-ink', 'px-ink', 'texto no preto', 4.5],
  ['px-on-ink-2', 'px-ink', 'secundário no preto', 4.5],
  ['px-on-ink-3', 'px-ink', 'apoio no preto', 4.5],
  ['px-on-ink-2', 'px-ink-2', 'secundário na superfície escura', 4.5],
  ['px-on-ink-3', 'px-ink-2', 'apoio na superfície escura', 4.5],
  ['px-lilac', 'px-ink', 'links e destaques no preto', 4.5],
  ['#ffffff', 'px-violet', 'botão principal', 4.5],
  ['#ffffff', 'px-violet-hover', 'botão principal (hover)', 4.5],
  ['px-violet', 'px-paper', 'link no branco', 4.5],
  ['px-violet', 'px-ops', 'link no fundo claro', 4.5],
  ['px-violet-ink', 'px-violet-soft', 'informação (lilás)', 4.5],
  ['px-ok-fg', 'px-ok-bg', 'estado verde', 4.5],
  ['px-warn-fg', 'px-warn-bg', 'estado amarelo', 4.5],
  ['px-err-fg', 'px-err-bg', 'estado vermelho', 4.5],
  ['px-neu-fg', 'px-neu-bg', 'estado neutro', 4.5],
  ['#ffffff', 'px-ok-solid', 'portaria: válido', 4.5],
  ['px-warn-on', 'px-warn-solid', 'portaria: já utilizado', 4.5],
  ['#ffffff', 'px-err-solid', 'portaria: recusado', 4.5],
  ['#ffffff', 'px-err-fg', 'aviso rápido de erro', 4.5],
  ['px-violet-bright', 'px-ink', 'anel de foco no preto', 3],
  ['px-violet-bright', 'px-paper', 'anel de foco no branco', 3],
  ['#8a8a9e', 'px-paper', 'borda de campo', 3],
];
let bad = 0;
console.log('| Texto | Fundo | Uso | Contraste | Mínimo | Resultado |\n| --- | --- | --- | --- | --- | --- |');
for (const [fg, bg, use, min] of pairs) {
  const r = ratio(v(fg), v(bg));
  const ok = r >= min;
  bad += ok ? 0 : 1;
  console.log(`| \`${fg}\` ${v(fg)} | \`${bg}\` ${v(bg)} | ${use} | ${r.toFixed(2)}:1 | ${min}:1 | ${ok ? 'AA' : 'ABAIXO'} |`);
}
process.exit(bad ? 1 : 0);
