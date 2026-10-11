// Gera os arquivos da marca a partir da logo original (PNG branco sobre preto opaco, 3375×6000).
// Uso, na raiz do projeto: node reference/tools/brand-assets.mjs assets-originais/IMG_3404.PNG
//
// - Logo inteira: recortada no contorno e com transparência real (a luminância vira o alfa), em branco e em tinta.
// - Símbolo X: as três peças são polígonos de arestas retas. As arestas são medidas com precisão de subpixel e ajustadas por
//   mínimos quadrados; o resultado vira um SVG vetorial (favicon) conferido contra o original antes de ser gravado.
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SRC = process.argv[2];
if (!SRC) throw new Error('Informe o caminho da logo original.');
const INK = '#0B0B10';
const OUT = 'public/brand';
mkdirSync(OUT, { recursive: true });

const { data: g, info } = await sharp(SRC).greyscale().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;

// Componentes conectados (pixels claros, vizinhança de 4).
const lab = new Int32Array(W * H);
const comps = [];
const stack = new Int32Array(W * H);
for (let p = 0; p < W * H; p++) {
  if (g[p] < 128 || lab[p]) continue;
  const id = comps.length + 1;
  let sp = 0;
  stack[sp++] = p;
  lab[p] = id;
  const c = { id, x0: W, x1: 0, y0: H, y1: 0, area: 0 };
  while (sp) {
    const q = stack[--sp];
    const x = q % W;
    const y = (q / W) | 0;
    c.area++;
    c.x0 = Math.min(c.x0, x);
    c.x1 = Math.max(c.x1, x);
    c.y0 = Math.min(c.y0, y);
    c.y1 = Math.max(c.y1, y);
    for (const n of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1])
      if (n >= 0 && !lab[n] && g[n] >= 128) {
        lab[n] = id;
        stack[sp++] = n;
      }
  }
  if (c.area > 50) comps.push(c);
}
const bbox = cs => ({
  x0: Math.min(...cs.map(c => c.x0)),
  x1: Math.max(...cs.map(c => c.x1)),
  y0: Math.min(...cs.map(c => c.y0)),
  y1: Math.max(...cs.map(c => c.y1)),
});
const all = bbox(comps);
// O X: as três maiores peças que alcançam a borda direita ou a base da logo (as letras de PARTY ficam à esquerda e acima).
const xParts = comps
  .filter(c => c.x1 >= all.x1 - 60 || c.y1 >= all.y1 - 2)
  .sort((a, b) => b.area - a.area)
  .slice(0, 3);
if (xParts.length !== 3) throw new Error('Não encontrei as três peças do X.');
const [stroke, ...pieces] = xParts;
const upper = pieces.find(c => c.y0 === stroke.y0);
const lower = pieces.find(c => c !== upper);

// Borda com subpixel: a cobertura (cinza/255) numa janela de 8 px diz onde a aresta corta a linha.
function edgeX(comp, y, side) {
  let first = -1;
  let last = -1;
  for (let x = comp.x0; x <= comp.x1; x++)
    if (lab[y * W + x] === comp.id) {
      if (first < 0) first = x;
      last = x;
    }
  if (first < 0) return null;
  if (side === 'left') {
    const a = first - 4;
    let s = 0;
    for (let x = a; x < a + 8; x++) s += g[y * W + x] / 255;
    return a + 8 - s;
  }
  const a = last - 3;
  let s = 0;
  for (let x = a; x < a + 8; x++) s += g[y * W + x] / 255;
  return a + s;
}
// Reta x = m·y + b pelos centros das linhas (y + 0,5).
function fit(comp, side, ya, yb) {
  let n = 0, sy = 0, sx = 0, syy = 0, sxy = 0;
  for (let y = Math.ceil(ya); y <= Math.floor(yb); y++) {
    const x = edgeX(comp, y, side);
    if (x === null) continue;
    const yc = y + 0.5;
    n++;
    sy += yc;
    sx += x;
    syy += yc * yc;
    sxy += yc * x;
  }
  const m = (n * sxy - sy * sx) / (n * syy - sy * sy);
  return { m, b: (sx - m * sy) / n };
}
const atY = (l, y) => [l.m * y + l.b, y];
const cross = (l1, l2) => {
  const y = (l2.b - l1.b) / (l1.m - l2.m);
  return [l1.m * y + l1.b, y];
};
// Linha (dentro da peça) onde fica o vértice mais à esquerda/direita: ali a borda troca de reta.
function turnRow(comp, side) {
  let best = null;
  for (let y = comp.y0; y <= comp.y1; y++) {
    const x = edgeX(comp, y, side);
    if (x === null) continue;
    if (!best || (side === 'left' ? x < best.x : x > best.x)) best = { x, y };
  }
  return best.y;
}
const M = 14; // linhas ignoradas perto dos vértices
const top = stroke.y0;
const bottom = stroke.y1 + 1;

const sL = fit(stroke, 'left', top + M, bottom - M);
const sR = fit(stroke, 'right', top + M, bottom - M);
const strokePoly = [atY(sL, top), atY(sR, top), atY(sR, bottom), atY(sL, bottom)];

const uTurn = turnRow(upper, 'left');
const uA = fit(upper, 'left', upper.y0 + M, uTurn - M);
const uB = fit(upper, 'left', uTurn + M, upper.y1 - M);
const uC = fit(upper, 'right', upper.y0 + M, upper.y1 - M);
const upperPoly = [atY(uA, top), atY(uC, top), cross(uB, uC), cross(uA, uB)];

const lTurn = turnRow(lower, 'right');
const lD = fit(lower, 'right', lower.y0 + M, lTurn - M);
const lE = fit(lower, 'right', lTurn + M, bottom - M);
const lF = fit(lower, 'left', lower.y0 + M, bottom - M);
const lowerPoly = [cross(lD, lF), cross(lD, lE), atY(lE, bottom), atY(lF, bottom)];

// Símbolo num quadro próprio: origem no canto do X, unidades em pixels do original.
const X = bbox(xParts);
const ox = X.x0;
const oy = top;
const xw = X.x1 + 1 - ox;
const xh = bottom - oy;
const r = v => Math.round(v * 10) / 10;
const pathOf = poly => 'M' + poly.map(([x, y]) => `${r(x - ox)} ${r(y - oy)}`).join('L') + 'Z';
const xPath = [strokePoly, upperPoly, lowerPoly].map(pathOf).join('');

// Conferência: o vetor rasterizado tem de coincidir com as peças do original.
const xSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${xw}" height="${xh}" viewBox="0 0 ${xw} ${xh}"><path d="${xPath}" fill="#fff"/></svg>`;
const raster = await sharp(Buffer.from(xSvg)).greyscale().raw().toBuffer();
let inter = 0, uni = 0, diff = 0;
for (let y = 0; y < xh; y++)
  for (let x = 0; x < xw; x++) {
    const p = (y + oy) * W + (x + ox);
    const orig = xParts.some(c => c.id === lab[p]) ? g[p] : 0;
    const vec = raster[y * xw + x];
    diff += Math.abs(orig - vec);
    if (orig >= 128 && vec >= 128) inter++;
    if (orig >= 128 || vec >= 128) uni++;
  }
const iou = inter / uni;
console.log(`X vetorial: IoU ${(iou * 100).toFixed(3)}%, diferença média ${(diff / (xw * xh)).toFixed(3)} níveis`);
// A diferença que sobra é o antisserrilhado das arestas (faixa de meio pixel no contorno), não erro de forma.
if (iou < 0.99 || diff / (xw * xh) > 2) throw new Error('O vetor do X não confere com o original.');

// Logo inteira com alfa = luminância (limpa o ruído abaixo de 8 e satura acima de 247).
const pad = 0;
const crop = { left: all.x0 - pad, top: all.y0 - pad, width: all.x1 - all.x0 + 1 + 2 * pad, height: all.y1 - all.y0 + 1 + 2 * pad };
const alpha = await sharp(SRC)
  .extract(crop)
  .greyscale()
  .linear(255 / (247 - 8), (-8 * 255) / (247 - 8))
  .raw()
  .toBuffer();
async function logo(color, height, file, { background, palette = true } = {}) {
  const base = sharp({ create: { width: crop.width, height: crop.height, channels: 3, background: color } })
    .joinChannel(alpha, { raw: { width: crop.width, height: crop.height, channels: 1 } })
    .png();
  let img = sharp(await base.toBuffer()).resize({ height, kernel: 'lanczos3' });
  if (background) img = img.flatten({ background });
  const buf = await img.png({ compressionLevel: 9, palette: palette && !background, quality: 100, effort: 10 }).toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  const m = await sharp(buf).metadata();
  console.log(`${OUT}/${file}: ${m.width}×${m.height}, ${(buf.length / 1024).toFixed(1)} KB`);
}
await logo('#ffffff', 120, 'partyx-logo.png'); // site (fundo escuro), até 40 px de altura em tela 3x
await logo(INK, 120, 'partyx-logo-dark.png'); // fundos claros
await logo('#ffffff', 64, 'partyx-logo-email.png', { background: INK }); // e-mail: fundo embutido, nunca branco no branco
// PDF do ingresso (impressão). RGBA sem paleta: o pdfkit desenha errado PNG indexado com transparência.
await logo('#ffffff', 360, 'partyx-logo-print.png', { palette: false });
console.log(`proporção da logo: ${(crop.width / crop.height).toFixed(4)} (${crop.width}×${crop.height} no original)`);

// Ícones: X branco sobre a tinta da marca. O X ocupa ~58% do quadro (respiro para o recorte arredondado do sistema).
const iconSvg = (size, radius) => {
  const s = (size * 0.58) / Math.max(xw, xh);
  const tx = (size - xw * s) / 2;
  const ty = (size - xh * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}"${radius ? ` rx="${radius}"` : ''} fill="${INK}"/><path transform="translate(${r(tx)} ${r(ty)}) scale(${s.toFixed(5)})" d="${xPath}" fill="#fff"/></svg>`;
};
writeFileSync('public/favicon.svg', iconSvg(64, 14) + '\n');
console.log(`public/favicon.svg: ${(iconSvg(64, 14).length / 1024).toFixed(1)} KB`);
for (const [file, size, radius] of [
  ['favicon-32.png', 32, 7],
  ['apple-touch-icon.png', 180, 0],
]) {
  const buf = await sharp(Buffer.from(iconSvg(size, radius)), { density: 72 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(`public/${file}`, buf);
  console.log(`public/${file}: ${size}×${size}, ${(buf.length / 1024).toFixed(1)} KB`);
}
