// Banners FICTÍCIOS para as capturas de tela: luzes de palco desfocadas, feixes, grão e a silhueta do público.
// Nada aqui é foto real nem marca de terceiros. Uso: chamado por seed-ui.mts.
import sharp from 'sharp';

interface Look {
  bg: string;
  lights: [string, number, number, number][]; // cor, x, y, raio (em fração da largura)
  beams: [string, number, number][]; // cor, x de origem, ângulo
}

const LOOKS: Record<string, Look> = {
  roxo: {
    bg: '#09060f',
    lights: [
      ['#7c3aed', 0.22, 0.28, 0.32],
      ['#c026d3', 0.7, 0.18, 0.26],
      ['#2563eb', 0.88, 0.62, 0.22],
      ['#f5f3ff', 0.5, 0.12, 0.05],
    ],
    beams: [
      ['#a78bfa', 0.5, -18],
      ['#e879f9', 0.5, 14],
      ['#c4b5fd', 0.3, -32],
    ],
  },
  ambar: {
    bg: '#0d0805',
    lights: [
      ['#f59e0b', 0.3, 0.3, 0.3],
      ['#ef4444', 0.75, 0.25, 0.24],
      ['#fde68a', 0.55, 0.1, 0.06],
    ],
    beams: [
      ['#fbbf24', 0.55, -12],
      ['#fca5a5', 0.55, 22],
    ],
  },
  ciano: {
    bg: '#03090c',
    lights: [
      ['#06b6d4', 0.65, 0.3, 0.3],
      ['#22c55e', 0.2, 0.4, 0.22],
      ['#e0f2fe', 0.45, 0.15, 0.05],
    ],
    beams: [
      ['#67e8f9', 0.4, 10],
      ['#86efac', 0.7, -24],
      ['#a5f3fc', 0.4, -30],
    ],
  },
  rosa: {
    bg: '#0e0509',
    lights: [
      ['#ec4899', 0.4, 0.25, 0.3],
      ['#8b5cf6', 0.82, 0.4, 0.26],
      ['#fff1f2', 0.62, 0.1, 0.05],
    ],
    beams: [
      ['#f9a8d4', 0.62, -8],
      ['#c4b5fd', 0.62, 26],
    ],
  },
  branco: {
    bg: '#07070a',
    lights: [
      ['#e5e7eb', 0.5, 0.2, 0.18],
      ['#6d28d9', 0.15, 0.6, 0.28],
      ['#6d28d9', 0.9, 0.55, 0.24],
    ],
    beams: [
      ['#ffffff', 0.5, -20],
      ['#ffffff', 0.5, 0],
      ['#ffffff', 0.5, 20],
    ],
  },
};

function crowd(w: number, h: number, seed: number): string {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let d = `M0 ${h}`;
  let x = 0;
  while (x < w) {
    const r = 18 + rnd() * 26;
    const top = h - 70 - rnd() * 90;
    d += ` L${x} ${top + r} Q${x} ${top} ${x + r} ${top} Q${x + 2 * r} ${top} ${x + 2 * r} ${top + r}`;
    // braços levantados de vez em quando
    if (rnd() > 0.82) d += ` L${x + 2 * r + 4} ${top - 60 - rnd() * 40} L${x + 2 * r + 14} ${top - 58} L${x + 2 * r + 10} ${top + r}`;
    x += 2 * r - 6;
  }
  return d + ` L${w} ${h} Z`;
}

export async function banner(look: keyof typeof LOOKS, seed: number, w = 1600, h = 900): Promise<Buffer> {
  const L = LOOKS[look]!;
  const lights = L.lights
    .map(
      ([c, x, y, r], i) =>
        `<radialGradient id="l${i}"><stop offset="0" stop-color="${c}" stop-opacity="0.95"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
         <circle cx="${x * w}" cy="${y * h}" r="${r * w}" fill="url(#l${i})"/>`,
    )
    .join('');
  const beams = L.beams
    .map(
      ([c, x, a], i) =>
        `<linearGradient id="b${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="0.55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>
         <polygon points="${x * w - 6},0 ${x * w + 6},0 ${x * w + 160},${h} ${x * w - 160},${h}" fill="url(#b${i})" transform="rotate(${a} ${x * w} 0)"/>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="${L.bg}"/>
    <g>${lights}</g><g style="mix-blend-mode:screen">${beams}</g>
    <path d="${crowd(w, h, seed)}" fill="#020203"/>
  </svg>`;
  const base = await sharp(Buffer.from(svg)).blur(6).toBuffer();
  // Grão de filme: ruído leve por cima.
  const noise = Buffer.alloc(w * h);
  let s = seed + 7;
  for (let i = 0; i < noise.length; i++) noise[i] = 128 + ((((s = (s * 1664525 + 1013904223) >>> 0) >>> 24) - 128) >> 2);
  const grain = await sharp(noise, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
  return sharp(base)
    .composite([{ input: grain, blend: 'soft-light' }])
    .jpeg({ quality: 86 })
    .toBuffer();
}
