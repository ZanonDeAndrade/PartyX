export function pxQR(seed: string, clear = false) {
  const n = 25;
  let h = 2166136261;
  for (const c of String(seed)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const rnd = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
  const m: boolean[][] = [];
  for (let y = 0; y < n; y++) {
    m[y] = [];
    for (let x = 0; x < n; x++) m[y][x] = rnd() < 0.5;
  }
  const fi = (ox, oy) => {
    for (let y = -1; y < 8; y++)
      for (let x = -1; x < 8; x++) {
        const X = ox + x,
          Y = oy + y;
        if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
        const ins = x >= 0 && y >= 0 && x < 7 && y < 7;
        const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        m[Y][X] = ins && (d === 3 || d <= 1);
      }
  };
  fi(0, 0);
  fi(n - 7, 0);
  fi(0, n - 7);
  for (let i = 8; i < n - 8; i++) {
    m[6][i] = i % 2 === 0;
    m[i][6] = i % 2 === 0;
  }
  for (let y = -2; y <= 2; y++)
    for (let x = -2; x <= 2; x++) {
      const d = Math.max(Math.abs(x), Math.abs(y));
      m[18 + y][18 + x] = d !== 1;
    }
  if (clear) for (let y = 10; y < 15; y++) for (let x = 9; x < 16; x++) m[y][x] = false;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += 'M' + x + ' ' + y + 'h1v1h-1z';
  return d;
}
