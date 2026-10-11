import fs from 'node:fs';
const EXPORTS = {
  '../lib/format': 'T BRLF brl pad fD fT fTs fDT fDTs WD WDL MO MOL fShort fLong norm cpfFull cpfOk fmtCPF maskCPF maskEmail mCPF mPhone',
  '../lib/constants': 'LS NOW0 MIN DAY RES_MIN AL PERIODS',
  '../lib/badges': 'B bd OST PST KST EST ob pb kb eb',
  '../lib/rng': 'xr', '../lib/qr': 'pxQR', '../lib/beep': 'beep', '../data/seed': 'buildData', './routes': 'R PATH',
};
function imports(code, base, self) {
  const lines = [];
  for (const [mod, names] of Object.entries(EXPORTS)) {
    const used = names.split(' ').filter(n => new RegExp('(?<![\\w$.])' + n.replace('$', '\\$') + '(?![\\w$])').test(code));
    if (!used.length) continue;
    let path = mod;
    if (base === 'views') path = mod.startsWith('./') ? '../' + mod.slice(2) : mod;       // views/ -> ../routes ; ../lib stays ../lib? views is src/logic/views => ../../lib
    lines.push([mod, used]);
  }
  return lines;
}
function rel(from, mod) { // from: dir of file relative to src, mod: key in EXPORTS (relative to src/logic)
  const target = mod.startsWith('./') ? 'logic/' + mod.slice(2) : mod.replace('../', '');
  const fromParts = from.split('/').filter(Boolean), tParts = target.split('/');
  let i = 0; while (i < fromParts.length && fromParts[i] === tParts[i]) i++;
  const up = fromParts.length - i; return (up ? '../'.repeat(up) : './') + tParts.slice(i).join('/');
}
export function addImports(file, dir) {
  let code = fs.readFileSync(file, 'utf8');
  const hdr = [];
  for (const [mod, names] of Object.entries(EXPORTS)) {
    const used = names.split(' ').filter(n => new RegExp('(?<![\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(code));
    if (used.length) hdr.push(`import { ${used.join(', ')} } from '${rel(dir, mod)}';`);
  }
  fs.writeFileSync(file, hdr.join('\n') + '\n' + code);
}
// raw -> PartyXLogic.ts
let raw = fs.readFileSync('src/logic/PartyXLogic.raw.ts', 'utf8');
raw = raw.replace('class PartyXLogic extends Logic<AppState> {', `export class PartyXLogic extends Logic<AppState> {
  scroller: HTMLElement | null = null;
  _mob = false;
  _sk: string | null = null;
  _st: any = null;
  _navKey = '';
  tt: ReturnType<typeof setTimeout> | undefined;
  lt: ReturnType<typeof setTimeout> | undefined;
  iv: ReturnType<typeof setInterval> | undefined;
  onResize: () => void = () => {};`);
raw = raw.replace('  state = this.initState();', '  state: AppState = this.initState();');
for (const [fn, f] of [['pubV', 'public'], ['authV', 'auth'], ['ckV', 'checkout'], ['meV', 'account'], ['admV', 'admin'], ['gateV', 'gate'], ['overV', 'overlays']]) raw = raw.replace(`this.${fn}(ctx)`, `${fn}(this, ctx)`);
raw = raw.replace('Object.assign(V, ', 'Object.assign(V, ');
const viewImports = `import { pubV } from './views/public';\nimport { authV } from './views/auth';\nimport { ckV } from './views/checkout';\nimport { meV } from './views/account';\nimport { admV } from './views/admin';\nimport { gateV } from './views/gate';\nimport { overV } from './views/overlays';\nimport { Logic } from './Logic';\nimport type { AppState } from '../types';\n`;
fs.writeFileSync('src/logic/PartyXLogic.ts', viewImports + raw);
fs.unlinkSync('src/logic/PartyXLogic.raw.ts');
addImports('src/logic/PartyXLogic.ts', 'logic');
for (const f of fs.readdirSync('src/logic/views')) addImports('src/logic/views/' + f, 'logic/views');
addImports('src/logic/demo.ts', 'logic');
addImports('src/logic/routes.ts', 'logic');
addImports('src/lib/constants.ts', 'lib'); addImports('src/lib/format.ts', 'lib'); addImports('src/lib/badges.ts', 'lib');
