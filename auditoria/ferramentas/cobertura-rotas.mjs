#!/usr/bin/env node
// Matriz de cobertura por rota da API: para cada rota registrada em server/src/api/*.ts, conta em quantos arquivos de teste
// (vitest de integração, unitário, sandbox, Playwright e scripts de homologação) o caminho aparece. Heurística textual, só leitura.
// Uso: node auditoria/ferramentas/cobertura-rotas.mjs [--md]  (imprime Markdown com --md; JSON sem a opção)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const md = process.argv.includes('--md');

function walk(dir, pred, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === 'node_modules' || name === '.run' || name === 'dist') continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

const apiFiles = walk(path.join(ROOT, 'server/src/api'), f => f.endsWith('.ts') && !f.includes('.test.'));
const routes = [];
for (const f of apiFiles) {
  const src = readFileSync(f, 'utf8');
  const re = /^\s*[a-zA-Z]+\.(get|post|put|patch|delete|all)\(\s*(['"`])([^'"`]+)\2/gm;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    routes.push({ method: m[1].toUpperCase(), path: m[3], file: path.relative(ROOT, f), line });
  }
}

const kinds = [
  { kind: 'integração', files: walk(path.join(ROOT, 'server/src'), f => f.endsWith('.integration.test.ts')) },
  { kind: 'unitário', files: walk(path.join(ROOT, 'server/src'), f => f.endsWith('.test.ts') && !f.includes('.integration.') && !f.includes('.sandbox.') && !f.includes('.cluster.')) },
  { kind: 'sandbox MP', files: walk(path.join(ROOT, 'server/src'), f => f.endsWith('.sandbox.test.ts')) },
  { kind: 'e2e', files: walk(path.join(ROOT, 'e2e'), f => f.endsWith('.ts') || f.endsWith('.mts')) },
  { kind: 'scripts hml', files: walk(path.join(ROOT, 'infra/testes'), f => f.endsWith('.mjs') || f.endsWith('.mts')) },
];
const sources = kinds.map(k => ({ kind: k.kind, texts: k.files.map(f => ({ f: path.relative(ROOT, f), t: readFileSync(f, 'utf8') })) }));

const front = walk(path.join(ROOT, 'src/site'), f => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.')).map(f => readFileSync(f, 'utf8')).join('\n');

function regexFor(p) {
  // /orders/:id/payment -> /orders/[^/'"`?\s]+/payment ; também aceita ${...} nos templates
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/\\\*$/, '/');
  const withParams = esc.replace(/:[a-zA-Z]+/g, '(?:[^/\'"`?\\s]+)');
  return new RegExp(withParams + '(?=[\'"`?\\s)/]|$)');
}

function areaOf(p) {
  if (p.startsWith('/admin')) return 'admin';
  if (p.startsWith('/gate')) return 'portaria';
  if (p.startsWith('/internal') || p.startsWith('/webhooks')) return 'rotina/webhook';
  if (p.startsWith('/health') || p.startsWith('/media') || p.startsWith('/dev')) return 'técnica';
  if (p.startsWith('/public') || p.startsWith('/legal') || p.startsWith('/auth/register') || p.startsWith('/auth/login') || p.startsWith('/auth/password') || p === '/auth/logout') return 'pública';
  return 'comprador';
}

const rows = routes.map(r => {
  const re = regexFor(r.path);
  const hits = {};
  for (const s of sources) hits[s.kind] = s.texts.filter(x => re.test(x.t)).map(x => x.f);
  const total = Object.values(hits).reduce((a, b) => a + b.length, 0);
  return { ...r, area: areaOf(r.path), front: re.test(front), hits, total };
});

if (!md) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const order = ['pública', 'comprador', 'portaria', 'admin', 'rotina/webhook', 'técnica'];
  console.log('| Área | Método | Rota | Integração | Unitário | Sandbox MP | E2E | Scripts hml | Front usa | Situação |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const area of order)
    for (const r of rows.filter(x => x.area === area).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))) {
      const n = k => r.hits[k].length;
      const situacao = r.total === 0 ? '**sem teste**' : n('e2e') > 0 && (n('integração') > 0 || n('unitário') > 0) ? 'API + interface' : n('integração') > 0 ? 'só API' : n('e2e') > 0 ? 'só interface' : 'parcial';
      console.log(`| ${area} | ${r.method} | \`${r.path}\` | ${n('integração')} | ${n('unitário')} | ${n('sandbox MP')} | ${n('e2e')} | ${n('scripts hml')} | ${r.front ? 'sim' : 'não'} | ${situacao} |`);
    }
  const semTeste = rows.filter(r => r.total === 0);
  console.log(`\nRotas: ${rows.length}. Sem nenhuma ocorrência em teste: ${semTeste.length}${semTeste.length ? ' (' + semTeste.map(r => `${r.method} ${r.path}`).join('; ') + ')' : ''}.`);
}
