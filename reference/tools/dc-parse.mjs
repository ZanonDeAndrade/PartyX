// Parser tolerante para o template do protótipo (HTML + sc-if / sc-for / {{ expr }}).
// Não usa DOM para preservar a caixa dos atributos (onClick, viewBox...).
import fs from 'node:fs';

const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'col', 'wbr']);

export function loadSource(file) {
  const src = fs.readFileSync(file, 'utf8');
  const open = src.indexOf('<x-dc>');
  const close = src.lastIndexOf('</x-dc>');
  const template = src.slice(open + '<x-dc>'.length, close);
  const sm = src.indexOf('<script type="text/x-dc" data-dc-script>');
  const se = src.lastIndexOf('</script>');
  const script = src.slice(sm + '<script type="text/x-dc" data-dc-script>'.length, se);
  return { template, script };
}

const ATTR_RE = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

export function parse(html) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { pushText(top(), html.slice(i)); break; }
    if (lt > i) pushText(top(), html.slice(i, lt));
    if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt); i = e + 3; continue; }
    if (html[lt + 1] === '/') {
      const e = html.indexOf('>', lt);
      const name = html.slice(lt + 2, e).trim();
      // fecha até o elemento correspondente
      let k = stack.length - 1;
      while (k > 0 && stack[k].tag !== name) k--;
      if (k > 0) stack.length = k; else throw new Error('Fecha sem abrir: ' + name + ' @' + lt);
      i = e + 1; continue;
    }
    // tag de abertura: encontra o '>' respeitando aspas
    let j = lt + 1, q = null;
    while (j < html.length) {
      const c = html[j];
      if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break;
      j++;
    }
    let inner = html.slice(lt + 1, j);
    const selfClose = inner.endsWith('/');
    if (selfClose) inner = inner.slice(0, -1);
    const m = inner.match(/^([^\s/>]+)/);
    const tag = m[1];
    const attrs = [];
    const rest = inner.slice(tag.length);
    let am;
    ATTR_RE.lastIndex = 0;
    while ((am = ATTR_RE.exec(rest))) {
      if (!am[1]) continue;
      attrs.push({ name: am[1], value: am[2] ?? am[3] ?? am[4] ?? null });
    }
    const node = { type: 'el', tag, attrs, children: [] };
    top().children.push(node);
    i = j + 1;
    if (tag === 'style' || tag === 'script') {
      const e = html.indexOf('</' + tag + '>', i);
      node.children.push({ type: 'rawtext', text: html.slice(i, e) });
      i = e + tag.length + 3; continue;
    }
    if (!selfClose && !VOID.has(tag.toLowerCase())) stack.push(node);
  }
  return root;
}

function pushText(parent, text) {
  if (text === '') return;
  parent.children.push({ type: 'text', text });
}

export const attr = (n, name) => (n.attrs.find(a => a.name === name) || {}).value;
