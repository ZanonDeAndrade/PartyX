// Extrai a lógica do protótipo para módulos TypeScript (uso único; o resultado em src/ é a fonte).
import fs from 'node:fs';
import { loadSource } from './dc-parse.mjs';

const { script } = loadSource('reference/PartyX Protótipo.dc.html');
const L = script.split('\n'); // L[0] é o resto da linha do <script>; as linhas seguintes alinham com o arquivo original - 1464
const line = n => L[n - 1464];
const range = (a, b) => L.slice(a - 1464, b - 1464 + 1).join('\n');
const exp = s => s.replace(/^(const|function) /gm, 'export $1 ');
const write = (p, s) => { fs.mkdirSync(p.replace(/\/[^/]+$/, ''), { recursive: true }); fs.writeFileSync(p, s); };

// ---- lib ----
write('src/lib/format.ts', exp([line(1466), range(1482, 1501)].join('\n')) + '\n');
write('src/lib/rng.ts', exp(line(1468)) + '\n');
write('src/lib/qr.ts', exp(range(1469, 1481)) + '\n');
write('src/lib/constants.ts', "import { T } from './format';\n\n" + exp([line(1465), line(1467), line(1502), line(1513)].join('\n')) + '\n');
write('src/lib/badges.ts', exp(range(1503, 1512)) + '\n');
write('src/lib/beep.ts', exp(line(1631)) + '\n');
write('src/data/seed.ts',
  "import { AL, DAY, MIN, NOW0, RES_MIN } from '../lib/constants';\nimport { T, cpfFull, fT, norm } from '../lib/format';\nimport { xr } from '../lib/rng';\nimport type { Database } from '../types';\n\n" +
  exp(range(1515, 1615)).replace('function buildData()', 'function buildData(): Database') + '\n');
write('src/logic/routes.ts', exp(range(1617, 1629)) + '\n');

// ---- classe ----
const start = L.findIndex(l => l.startsWith('class Component extends DCLogic'));
const body = L.slice(start + 1);
// remove o fechamento da classe e o que vem depois
let end = body.length - 1;
while (end > 0 && body[end].trim() !== '}') end--;
const members = [];
let cur = null;
for (let i = 0; i < end; i++) {
  const ln = body[i];
  if (/^  [A-Za-z_$][\w$]*\s*(\(|=)/.test(ln)) { cur = { name: ln.match(/^  ([A-Za-z_$][\w$]*)/)[1], lines: [ln] }; members.push(cur); }
  else if (cur) cur.lines.push(ln);
}
const VIEW = { pubV: 'public', authV: 'auth', ckV: 'checkout', meV: 'account', admV: 'admin', gateV: 'gate', overV: 'overlays' };
const MOVE = new Set(['notesFor', 'indexGroups']);
const core = [];
const views = {};
for (const m of members) {
  if (VIEW[m.name]) views[m.name] = m;
  else if (MOVE.has(m.name)) views[m.name] = m;
  else core.push(m);
}
fs.writeFileSync('tools/.members.json', JSON.stringify({ core: core.map(c => c.name), views: Object.keys(views) }, null, 1));

const dedent = s => s.replace(/^ {2}/gm, '');
const toFn = (m, file) => {
  const txt = m.lines.join('\n');
  const sig = txt.match(/^  ([A-Za-z_$][\w$]*)\(([^)]*)\) \{/);
  let out;
  if (VIEW[m.name]) {
    out = txt.replace(/^  ([A-Za-z_$][\w$]*)\((\{[^}]*\})\) \{/, (_, n, p) => `export function ${n}(app: PartyXLogic, ${p}: ViewCtx): Loose {`);
  } else {
    out = txt.replace(/^  ([A-Za-z_$][\w$]*)\(([^)]*)\) \{/, (_, n, p) => `export function ${n}(app: PartyXLogic${p ? ', ' + p : ''}) {`);
  }
  void sig;
  return dedent(out).replace(/\bthis\b/g, 'app');
};
const byFile = {};
for (const [name, m] of Object.entries(views)) {
  const file = VIEW[name] || 'demo';
  (byFile[file] ||= []).push(toFn(m, file));
}
const HEAD = `import type { PartyXLogic } from '../PartyXLogic';\nimport type { Loose, ViewCtx } from '../viewTypes';\n`;
for (const [file, fns] of Object.entries(byFile)) {
  const p = file === 'demo' ? 'src/logic/demo.ts' : `src/logic/views/${file}.ts`;
  write(p, (file === 'demo' ? HEAD.replace(/'\.\.\//g, "'./") : HEAD) + '\n' + fns.join('\n\n') + '\n');
}

const classHead = `class PartyXLogic extends Logic<AppState> {`;
write('src/logic/PartyXLogic.raw.ts', classHead + '\n' + core.map(m => m.lines.join('\n')).join('\n') + '\n}\n');
console.log('core members:', core.length, 'views:', Object.keys(views).join(','));
