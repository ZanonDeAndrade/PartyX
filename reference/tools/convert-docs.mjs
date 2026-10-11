// Converte o template do protótipo (sc-if / sc-for / {{ expr }}) em componentes React + TSX.
// Uso único: o resultado em src/ passa a ser a fonte; este script fica como registro de como foi gerado.
import fs from 'node:fs';
import path from 'node:path';
import { loadSource, parse, attr } from './dc-parse.mjs';

const E = n => n.children.filter(c => c.type === 'el');

// ---------- registro de componentes (sc-if com este `value` vira um componente próprio) ----------
const REG = {};

// ---------- expressões ----------
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*/;
function wraps(e) { let d = 0; for (let i = 0; i < e.length - 1; i++) { if (e[i] === '(') d++; else if (e[i] === ')') { d--; if (d === 0) return false; } } return true; }
function findEq(e) {
  let d = 0;
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (c === '[' || c === '(') d++; else if (c === ']' || c === ')') d--;
    else if (d === 0 && (c === '=' || c === '!') && e[i + 1] === '=') {
      if (i > 0 && (e[i - 1] === '=' || e[i - 1] === '!')) continue;
      if (!e.slice(0, i).trim()) continue;
      return { i, op: e[i + 2] === '=' ? c + '==' : c + '=' };
    }
  }
  return null;
}
function cx(src, scope) {
  const e = String(src).trim();
  if (!e) return 'undefined';
  if (e[0] === '(' && e.at(-1) === ')' && wraps(e)) return '(' + cx(e.slice(1, -1), scope) + ')';
  const eq = findEq(e);
  if (eq) { const op = eq.op === '==' ? '===' : eq.op === '!=' ? '!==' : eq.op; return '(' + cx(e.slice(0, eq.i), scope) + ' ' + op + ' ' + cx(e.slice(eq.i + eq.op.length), scope) + ')'; }
  if (e[0] === '!') return '!' + cx(e.slice(1), scope);
  if (['true', 'false', 'null', 'undefined'].includes(e)) return e;
  if (/^-?\d+(\.\d+)?$/.test(e)) return e;
  if (e.length >= 2 && (e[0] === '"' || e[0] === "'") && e.at(-1) === e[0]) return JSON.stringify(e.slice(1, -1));
  const head = e.match(IDENT);
  if (!head) throw new Error('expressão não suportada: ' + e);
  let out = scope.has(head[0]) ? head[0] : 'vm.' + head[0];
  let i = head[0].length;
  while (i < e.length) {
    if (e[i] === '.') { const m = e.slice(i + 1).match(IDENT) || e.slice(i + 1).match(/^\d+/); if (!m) throw new Error('caminho inválido: ' + e); out += /^\d/.test(m[0]) ? `?.[${m[0]}]` : '?.' + m[0]; i += 1 + m[0].length; }
    else if (e[i] === '[') { let d = 1, j = i + 1; while (j < e.length && d > 0) { if (e[j] === '[') d++; else if (e[j] === ']') { d--; if (d === 0) break; } j++; } out += '?.[' + cx(e.slice(i + 1, j), scope) + ']'; i = j + 1; }
    else throw new Error('caminho inválido: ' + e);
  }
  return out;
}
const splitInterp = s => s.split(/\{\{([\s\S]+?)\}\}/g); // ímpares = expressões

// ---------- estilo ----------
function splitDecls(css) {
  const out = []; let cur = '', dp = 0, br = 0, q = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(') dp++; if (c === ')') dp--;
    if (css.startsWith('{{', i)) { br++; cur += '{{'; i++; continue; }
    if (css.startsWith('}}', i)) { br--; cur += '}}'; i++; continue; }
    if (c === ';' && dp === 0 && br === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
const camel = p => p.startsWith('--') ? p : (p.startsWith('-') ? p.slice(1) : p).replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^ms([A-Z])/, 'Ms$1');
function styleExpr(raw, scope) {
  if (/^\s*\{\{[\s\S]+?\}\}\s*$/.test(raw) && splitInterp(raw).length === 3) return `cssToObj(${cx(splitInterp(raw)[1], scope)})`;
  const props = []; let dynamic = false;
  for (const d of splitDecls(raw)) {
    const k = d.indexOf(':'); if (k < 0) continue;
    let prop = d.slice(0, k).trim(); let val = d.slice(k + 1).trim();
    prop = camel(prop);
    const key = /^[A-Za-z_$][\w$]*$/.test(prop) ? prop : JSON.stringify(prop);
    const parts = splitInterp(val);
    if (parts.length === 1) props.push(`${key}: ${JSON.stringify(val)}`);
    else {
      dynamic = true;
      const js = parts.map((p, i) => i & 1 ? '${' + cx(p, scope) + " ?? ''}" : p.replace(/[`\\$]/g, m => '\\' + m)).join('');
      props.push(`${key}: \`${js}\``);
    }
  }
  return `{ ${props.join(', ')} }${dynamic ? ' as CSSProperties' : ''}`;
}

// ---------- atributos ----------
const ATTR_MAP = { class: 'className', for: 'htmlFor', inputmode: 'inputMode', autocomplete: 'autoComplete', tabindex: 'tabIndex', colspan: 'colSpan', maxlength: 'maxLength' };
function attrToJsx(a, scope, tag) {
  let { name, value } = a;
  if (name.startsWith('hint-')) return null;
  if (name === 'list' || name === 'as') return null;
  let jname = ATTR_MAP[name] || name;
  if (/^on[a-z]/.test(jname) && !/^on[A-Z]/.test(jname)) jname = 'on' + jname[2].toUpperCase() + jname.slice(3);
  if (!jname.startsWith('aria-') && !jname.startsWith('data-') && jname.includes('-')) jname = jname.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (value === null) return jname;
  if (jname === 'style') return `style={${styleExpr(value, scope)}}`;
  const parts = splitInterp(value);
  if (parts.length === 1) return jname === 'rows' || jname === 'colSpan' ? `${jname}={${Number(value)}}` : `${jname}=${JSON.stringify(value)}`;
  if (parts.length === 3 && !parts[0].trim() && !parts[2].trim()) {
    let ex = cx(parts[1], scope);
    if (jname === 'value') ex = `${ex} ?? ''`;
    if (jname === 'checked') ex = `${ex} ?? false`;
    return `${jname}={${ex}}`;
  }
  const tpl = parts.map((p, i) => i & 1 ? '${' + cx(p, scope) + " ?? ''}" : p.replace(/[`\\$]/g, m => '\\' + m)).join('');
  return `${jname}={\`${tpl}\`}`;
}

// ---------- geração ----------
const INLINE = new Set(['span', 'b', 'a', 'i', 'em', 'strong', 'small', 'code', 'label']);
const files = new Map(); // caminho -> conteúdo
const queue = [];

function esc(t) { return t.replace(/[{}<>]/g, c => `{'${c}'}`); }

function genChildren(nodes, ctx, parentStyle) {
  const out = [];
  nodes.forEach((n, idx) => {
    if (n.type === 'rawtext') return;
    if (n.type === 'text') {
      const t = n.text;
      if (!t.includes('{{')) {
        if (!t.trim()) { if (t.includes('\n') || t === '') return; const prev = nodes[idx - 1], next = nodes[idx + 1]; const inl = x => x && (x.type === 'text' || (x.type === 'el' && INLINE.has(x.tag))); if (inl(prev) && inl(next)) out.push("{' '}"); return; }
        let s = t.replace(/\s+/g, ' ');
        if (/^\s*\n/.test(t)) s = s.trimStart(); if (/\n\s*$/.test(t)) s = s.trimEnd();
        if (!s) return;
        const lead = s.startsWith(' '), trail = s.endsWith(' ');
        let core = esc(s.trim());
        out.push((lead ? "{' '}" : '') + core + (trail ? "{' '}" : ''));
        return;
      }
      const parts = splitInterp(t);
      const flexParent = /display:\s*(inline-)?(flex|grid)/.test(parentStyle || '');
      const hasLit = parts.some((p, i) => !(i & 1) && p.trim());
      let s = '';
      parts.forEach((p, i) => {
        if (i & 1) { const ex = cx(p, ctx.scope); s += (flexParent && hasLit) ? `<span>{${ex}}</span>` : `{${ex}}`; }
        else { let lit = p.replace(/\s+/g, ' '); if (i === 0 && /^\s*\n/.test(p)) lit = lit.trimStart(); if (i === parts.length - 1 && /\n\s*$/.test(p)) lit = lit.trimEnd(); if (!lit) return; const lead = lit.startsWith(' '), trail = lit.endsWith(' '); s += (lead ? "{' '}" : '') + esc(lit.trim()) + (trail ? "{' '}" : ''); }
      });
      if (s) out.push(s);
      return;
    }
    out.push(genNode(n, ctx));
  });
  return out.filter(x => x !== '');
}

function wrap(children) { return children.length === 1 && children[0].startsWith('<') && !children[0].startsWith('<>') ? children[0] : `<>${children.join('')}</>`; }

function genNode(n, ctx) {
  if (n.tag === 'sc-if') {
    const val = attr(n, 'value');
    const cond = cx(splitInterp(val)[1], ctx.scope);
    const reg = REG[val];
    if (reg && !ctx.noSplit) {
      const [name, dir] = reg;
      ctx.uses.set(name, dir);
      queue.push({ name, dir, nodes: n.children });
      return `{${cond} ? <${name} vm={vm} /> : null}`;
    }
    const kids = genChildren(n.children, ctx);
    if (!kids.length) return '';
    return `{${cond} ? (${wrap(kids)}) : null}`;
  }
  if (n.tag === 'sc-for') {
    const list = cx(splitInterp(attr(n, 'list'))[1], ctx.scope);
    const as = attr(n, 'as') || 'item';
    const scope = new Set([...ctx.scope, as, '$index']);
    ctx.usesFragment = true;
    const kids = genChildren(n.children, { ...ctx, scope });
    const body = kids.join('');
    const used = new RegExp('(?<![\\w$.])' + as.replace('$', '\\$') + '(?![\\w$])').test(body);
    ctx.usesLoose = true;
    return `{(${list} ?? []).map((${used ? as : '_' + as}: Loose, $index: number) => (<Fragment key={$index}>${body}</Fragment>))}`;
  }
  const tag = n.tag;
  const styleStatic = (attr(n, 'style') || '');
  const attrs = n.attrs.map(a => attrToJsx(a, ctx.scope, tag)).filter(Boolean);
  if ((tag === 'input' || tag === 'textarea') && n.attrs.some(a => a.name === 'value') && !n.attrs.some(a => a.name === 'onChange' || a.name === 'onchange')) attrs.push('readOnly');
  const open = `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
  const kids = genChildren(n.children, ctx, styleStatic);
  if (!kids.length) return open + ' />';
  return `${open}>${kids.join('')}</${tag}>`;
}

function emit(name, dir, nodes) {
  const ctx = { scope: new Set(), uses: new Map(), usesFragment: false };
  const kids = genChildren(nodes, ctx);
  const body = kids.length ? wrap(kids) : 'null';
  const rel = to => { const from = dir; const f = from.split('/'), t = to.split('/'); let i = 0; while (i < f.length && f[i] === t[i]) i++; return (f.length - i ? '../'.repeat(f.length - i) : './') + t.slice(i).join('/'); };
  const imports = [];
  const needCss = /as CSSProperties/.test(body);
  if (ctx.usesFragment || needCss) imports.push(`import { ${[ctx.usesFragment ? 'Fragment' : '', needCss ? 'type CSSProperties' : ''].filter(Boolean).join(', ')} } from 'react';`);
  imports.push(`import type { ViewModel } from '${rel('logic')}/viewTypes';`);
  if (/\bLoose\b/.test(body)) imports.push(`import type { Loose } from '${rel('types')}';`);
  for (const [n, d] of ctx.uses) imports.push(`import { ${n} } from '${rel(d)}/${n}';`);
  const src = `${imports.join('\n')}\n\nexport function ${name}({ vm }: { vm: ViewModel }) {\n  return ${body};\n}\n`;
  files.set(`src/${dir}/${name}.tsx`, src);
}

// ---------- documentos ----------
const LINKS = [['PartyX Protótipo.dc.html', '/'], ['PartyX Documentação.dc.html', '/docs'], ['PartyX Fundamentos.dc.html', '/docs/fundamentos'], ['PartyX E-mails e PDF.dc.html', '/docs/emails']];
const fixLinks = t => LINKS.reduce((a, [from, to]) => a.split(from).join(to), t);
const DOCS = [
  ['PartyX Documentação', 'Documentation', { pw: false }],
  ['PartyX Fundamentos', 'Foundations', null],
  ['PartyX E-mails e PDF', 'Emails', null],
];
for (const [file, name] of DOCS) {
  const { template, script } = loadSource(`reference/${file}.dc.html`);
  const root = parse(template);
  const nodes = root.children.filter(c => !(c.type === 'el' && c.tag === 'helmet'));
  emit(`${name}View`, 'docs', nodes);
  // lógica
  let js = script.replace(/function pxQR\([^)]*\) \{[\s\S]*?\n\}\n/, '');
  const usesQr = /pxQR\(/.test(js);
  const hasState = /\n\s+state = \{/.test(js);
  js = js.replace('class Component extends DCLogic {', `export class ${name}Logic extends Logic<${hasState ? 'DocState' : 'Record<string, never>'}> {` + (hasState ? '' : '\n  state: Record<string, never> = {};'));
  js = js.replace(/\n\s+state = \{([^}]*)\};/, (m, body) => `\n  state: DocState = {${body}};`);
  js = js.replace('renderVals() {', 'renderVals(): Loose {');
  const header = `import { Logic } from '../logic/Logic';\nimport type { Loose } from '../types';\n` + (usesQr ? "import { pxQR } from '../lib/qr';\n" : '') + (hasState ? 'interface DocState { pw: boolean; accept: boolean; qty: number }\n' : '');
  files.set(`src/docs/${name}Logic.ts`, header + js.trim() + '\n');
}
while (queue.length) { const q = queue.shift(); emit(q.name, q.dir, q.nodes); }
for (const [p, s] of files) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, fixLinks(s)); }
console.log([...files.keys()].join('\n'));
