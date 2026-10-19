#!/usr/bin/env node
// Matriz dos cenários Playwright da auditoria: lê um ou mais resultado.json (reporter json) e imprime, em Markdown, cada cenário com o
// estado por projeto (navegador e largura). Quando o mesmo cenário aparece em mais de um arquivo, vale o último (reexecução).
// Uso: node auditoria/ferramentas/resumo-e2e.mjs resultado1.json [resultado2.json ...]
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('uso: resumo-e2e.mjs <resultado.json> [...]');
  process.exit(2);
}
const PROJECTS = ['chromium-1280', 'chromium-390', 'chromium-360', 'webkit-1280', 'webkit-390', 'webkit-360', 'firefox-1280', 'firefox-390', 'firefox-360'];
const cell = { expected: 'ok', flaky: 'ok (2ª)', unexpected: '**falhou**', skipped: 'pulado' };
const matrix = new Map(); // key file::title -> { file, title, byProject: {}, notes: [] }
for (const f of files) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const walk = s => {
    for (const x of s.suites || []) walk(x);
    for (const sp of s.specs || [])
      for (const t of sp.tests) {
        const key = `${sp.file.replace(/^.*\//, '')}::${sp.title}`;
        const e = matrix.get(key) ?? { file: sp.file.replace(/^.*\//, ''), title: sp.title, byProject: {}, notes: new Set() };
        e.byProject[t.projectName] = t.status;
        for (const res of t.results) for (const a of res.annotations ?? []) e.notes.add(`${a.type}: ${a.description ?? ''}`);
        for (const a of t.annotations ?? []) e.notes.add(`${a.type}: ${a.description ?? ''}`);
        matrix.set(key, e);
      }
  };
  walk(r);
}
const rows = [...matrix.values()].sort((a, b) => a.file.localeCompare(b.file) || a.title.localeCompare(b.title));
const once = rows.filter(r => r.file.includes('.once.'));
const ui = rows.filter(r => !r.file.includes('.once.'));
console.log('### Cenários de interface (9 projetos: navegador e largura)\n');
console.log('| Arquivo | Cenário | ' + PROJECTS.map(p => p.replace('chromium', 'Chr').replace('webkit', 'WK').replace('firefox', 'FF')).join(' | ') + ' |');
console.log('|---|---|' + PROJECTS.map(() => '---').join('|') + '|');
for (const r of ui) console.log(`| ${r.file.replace('.ui.spec.ts', '')} | ${r.title.replace(/\|/g, '/')} | ${PROJECTS.map(p => cell[r.byProject[p]] ?? '') .join(' | ')} |`);
console.log('\n### Cenários de regra de servidor, portaria, admin, e-mails, PDFs e LGPD (uma vez, Chromium 1280)\n');
console.log('| Arquivo | Cenário | Resultado | Observações |');
console.log('|---|---|---|---|');
for (const r of once) console.log(`| ${r.file.replace('.once.spec.ts', '')} | ${r.title.replace(/\|/g, '/')} | ${cell[r.byProject['chromium-1280']] ?? ''} | ${[...r.notes].join('; ').replace(/\|/g, '/')} |`);
const all = rows.flatMap(r => Object.values(r.byProject));
const count = s => all.filter(x => x === s).length;
console.log(`\nTotal: ${all.length} execuções: ${count('expected')} passaram, ${count('flaky')} passaram na segunda tentativa, ${count('unexpected')} falharam, ${count('skipped')} puladas. Cenários distintos: ${rows.length} (${ui.length} de interface, ${once.length} únicos).`);
