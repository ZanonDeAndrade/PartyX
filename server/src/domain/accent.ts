/**
 * Cor de destaque do evento (0014, 15/10/2026). Regras puras, sem I/O.
 *
 * O servidor só aceita `#RRGGBB` e guarda em maiúsculas; os tons legíveis (texto sobre a cor, links, linhas, foco) são derivados na
 * página (`src/site/accent.ts`) e aplicados por variável CSS. Nada aqui monta CSS.
 */

/** Valida e normaliza. Vazio ou nulo: o roxo da PartyX (nulo). */
export function checkAccentColor(raw: string | null | undefined): { value: string | null } | { problem: string } {
  if (raw === null || raw === undefined || raw.trim() === '') return { value: null };
  const value = raw.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return { problem: 'Use uma cor no formato #RRGGBB (por exemplo, #7C3AED).' };
  return { value: value.toUpperCase() };
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/**
 * Sugestão pela capa: a cor mais presente entre as **vivas** (ignora preto, branco e cinza, que não servem de destaque). Recebe os pixels
 * já reduzidos (RGB ou RGBA, `channels` por pixel). Agrupa em faixas de cor (3 bits por canal) e pesa cada pixel pela saturação e pelo
 * brilho; devolve a média da faixa mais pesada. Sem cor viva na capa: nulo.
 */
export function suggestAccent(pixels: Uint8Array, channels: number): string | null {
  const buckets = new Map<number, { w: number; r: number; g: number; b: number; n: number }>();
  for (let i = 0; i + 2 < pixels.length; i += channels) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const value = max / 255;
    const saturation = max === 0 ? 0 : (max - min) / max;
    if (saturation < 0.3 || value < 0.2) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const bucket = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0, n: 0 };
    bucket.w += saturation * (0.4 + 0.6 * value);
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n += 1;
    buckets.set(key, bucket);
  }
  let best: { w: number; r: number; g: number; b: number; n: number } | null = null;
  for (const bucket of buckets.values()) if (!best || bucket.w > best.w) best = bucket;
  if (!best) return null;
  return `#${hex2(best.r / best.n)}${hex2(best.g / best.n)}${hex2(best.b / best.n)}`.toUpperCase();
}
