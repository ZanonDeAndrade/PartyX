// Gera docs/rastreabilidade/matriz-requisitos.md a partir de:
//  - reference/docs/documentacao.txt (texto oficial de RF/CA e seção 18.1)
//  - reference/PartyX Documentação.dc.html (cobertura do design por tela)
// Uso único (Prompt 01). A matriz em Markdown passa a ser editada à mão; não rode de novo sem copiar o status.
import fs from 'node:fs';

const doc = fs.readFileSync('reference/docs/documentacao.txt', 'utf8').split('\n');
const design = fs.readFileSync('reference/PartyX Documentação.dc.html', 'utf8');

// ---------- texto oficial ----------
const SKIP = [/^PartyX — Documentação de Desenvolvimento/, /^Page \d+ of 32/, /^-- \d+ of 32 --/, /^\s*$/];
const reqs = new Map(); // id -> { text, module, section }
let section = '', module_ = '', cur = null;
const MOD = {
  '8.1': 'Usuários, cadastro e acesso',
  '8.2': 'Gestão de eventos, ingressos e promoters',
  '8.3': 'Vitrine de eventos',
  '8.4': 'Compra',
  '8.5': 'Ingresso digital',
  '8.6': 'Validação na entrada',
  '8.7': 'Painel administrativo e relatórios',
  '8.8': 'Design e responsividade',
  '9.3': 'Integração de pagamento (Etapa 3)',
};
for (const raw of doc) {
  const line = raw.trim();
  const h = line.match(/^(8\.[1-8]|9\.3)\s/);
  if (h) { section = h[1]; module_ = MOD[section]; cur = null; continue; }
  if (/^\d{1,2}\.\s+[A-ZÀ-Ú]/.test(line)) { module_ = ''; cur = null; continue; }
  if (/^(Requisitos|Critérios de aceite):$/.test(line)) { cur = null; continue; }
  if (/^\d+(\.\d+)?\s+[A-ZÀ-Ú]/.test(line) && !/^(RF|CA)-/.test(line) && !SKIP.some(r => r.test(line))) { if (!h) cur = null; }
  const m = line.match(/^((?:RF-\d{2})|(?:CA-\d{2})|(?:CA-P\d))\s+(.*)$/);
  if (m && module_ && !reqs.has(m[1])) { cur = { id: m[1], text: m[2], module: module_, section }; reqs.set(m[1], cur); continue; }
  if (cur && !SKIP.some(r => r.test(line))) {
    if (/^(\d+\.\d+|\d+\.)\s/.test(line) && !/^\d+\s*$/.test(line)) { cur = null; continue; }
    cur.text += ' ' + line;
  }
}

// ---------- cobertura do design ----------
const unesc = s => s.replace(/\\'/g, "'");
const STATUS = { ok: 'Representado', impl: 'Representado; validação depende da implementação', cli: 'Representado; depende de insumo da PartyX' };
const design_ = new Map();
for (const m of design.matchAll(/row\('(RF-\d+)', '((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)', '(\w+)'\)/g)) design_.set(m[1], { screens: unesc(m[3]), status: STATUS[m[5]] });
for (const m of design.matchAll(/car\('(CA-[\w]+)', '((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)', '(\w+)'\)/g)) design_.set(m[1], { screens: unesc(m[3]), status: STATUS[m[4]] });

// ---------- Anexo I (seção 18.1) e prompts do plano ----------
const range = (p, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${p}-${String(a + i).padStart(2, '0')}`);
const ANEXO = new Map();
const setAnexo = (n, ids) => ids.forEach(i => ANEXO.set(i, n));
setAnexo('1', [...range('RF', 1, 6), 'RF-10', ...range('CA', 1, 4)]);
setAnexo('2', [...range('RF', 20, 27), ...range('CA', 12, 14)]);
setAnexo('3', [...range('RF', 28, 37), ...range('CA', 15, 19)]);
setAnexo('4', [...range('RF', 38, 43), ...range('CA', 20, 22)]);
setAnexo('5', [...range('RF', 44, 54), ...range('CA', 23, 27)]);
setAnexo('6', [...range('RF', 11, 19), ...range('CA', 7, 11)]);
setAnexo('7', [...range('RF', 55, 64), ...range('CA', 28, 31)]);
setAnexo('8', [...range('RF', 7, 9), 'CA-05', 'CA-06']);
setAnexo('11', [...range('RF', 65, 68), 'CA-32', 'CA-33']);
setAnexo('3 e 10', ['CA-P1', 'CA-P2', 'CA-P3', 'CA-P4', 'CA-P5']);

const IMPL = new Map(), TEST = new Map();
const add = (map, prompt, ids) => ids.forEach(i => { if (!map.has(i)) map.set(i, []); if (!map.get(i).includes(prompt)) map.get(i).push(prompt); });
// implementação (índice das etapas)
add(IMPL, '05', [...range('RF', 1, 6), 'RF-10', ...range('CA', 1, 4)]);
add(IMPL, '06', [...range('RF', 7, 9), 'CA-05', 'CA-06']);
add(IMPL, '07', [...range('RF', 11, 19), ...range('CA', 7, 11)]);
add(IMPL, '08', [...range('RF', 20, 27), ...range('CA', 12, 14)]);
add(IMPL, '09', ['RF-17', ...range('RF', 28, 33), 'RF-37', ...range('CA', 15, 17)]);
add(IMPL, '10', range('RF', 29, 34));
add(IMPL, '11', ['RF-34', 'RF-35', 'CA-P1', 'CA-P2']);
add(IMPL, '12', ['RF-35', 'RF-37', 'CA-18', 'CA-P1', 'CA-P2', 'CA-P3', 'CA-P4', 'CA-P5']);
add(IMPL, '13', [...range('RF', 38, 43), ...range('CA', 20, 22)]);
add(IMPL, '14', ['RF-36', 'RF-67', 'CA-01']);
add(IMPL, '15', [...range('RF', 44, 54), ...range('CA', 23, 27)]);
add(IMPL, '16', [...range('RF', 55, 57), 'RF-61', 'RF-62']);
add(IMPL, '17', [...range('RF', 58, 60), 'CA-19', ...range('CA', 28, 30)]);
add(IMPL, '18', ['RF-63', 'RF-64', 'CA-31']);
add(IMPL, '19', [...range('RF', 65, 68), 'CA-14', 'CA-32', 'CA-33']);
// testes
add(TEST, '21', ['CA-16', 'CA-17']);
add(TEST, '22', ['CA-P3', 'CA-P4', 'CA-P5', 'CA-29']);
add(TEST, '23', [...range('CA', 22, 27)]);
add(TEST, '24', [...range('CA', 1, 33), ...range('CA-P', 1, 5).map(x => x)]);
// CA-P1..P5 usam o formato CA-P1; corrige o range acima
for (const k of [...TEST.keys()]) if (/^CA-P0/.test(k)) TEST.delete(k);
add(TEST, '24', ['CA-P1', 'CA-P2', 'CA-P3', 'CA-P4', 'CA-P5']);
add(TEST, '26', [...range('RF', 1, 68), ...range('CA', 1, 33), 'CA-P1', 'CA-P2', 'CA-P3', 'CA-P4', 'CA-P5']);

// ---------- saída ----------
const ids = [...range('RF', 1, 68), ...range('CA', 1, 33), 'CA-P1', 'CA-P2', 'CA-P3', 'CA-P4', 'CA-P5'];
const missing = ids.filter(i => !reqs.has(i));
if (missing.length) { console.error('Sem texto oficial:', missing.join(', ')); process.exit(1); }
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const prompts = a => (a && a.length ? a.map(p => 'P' + p).join(', ') : '—');
const hdr = '| ID | Requisito (texto da documentação) | Módulo | Anexo I | Implementar em | Testar em | Design (telas) | Situação do design | Implementação real | Evidência |\n|---|---|---|---|---|---|---|---|---|---|';
const row = id => {
  const r = reqs.get(id), d = design_.get(id) || {};
  const testOnly = !IMPL.has(id) && TEST.has(id);
  return `| ${id} | ${cell(r.text)} | ${cell(r.module)} | ${ANEXO.get(id) || '—'} | ${prompts(IMPL.get(id))} | ${prompts((TEST.get(id) || []).filter(p => p !== '26' || true))} | ${cell(d.screens) || '—'} | ${cell(d.status) || '—'} | Não iniciada | — |`;
};
const out = [];
out.push(`# Matriz de rastreabilidade

Gerada em 01/10/2026 a partir de \`reference/docs/documentacao.txt\` (versão 1.0, 32 páginas) e da cobertura do design (\`src/docs\`, página Documentação).

**Como ler**

- **Implementar em / Testar em**: número do prompt do plano de 30 etapas (ex.: P05 é o Prompt 05). P26 repete todos os critérios no fechamento interno.
- **Design (telas)**: telas do protótipo que representam o requisito. O protótipo é só front-end com dados simulados: **não comprova** segurança, estoque, pagamento nem validação reais.
- **Implementação real**: \`Não iniciada\` | \`Em andamento\` | \`Implementada\` | \`Verificada\`. Nada passa a \`Verificada\` sem a evidência registrada na última coluna (teste, commit, captura ou ata).
- **Evidência**: caminho do teste, commit, relatório ou registro datado. Vazio significa que não existe evidência.
- Se o contrato e os Anexos I e II divergirem deste material, prevalece o contrato (ver \`../registros/divergencias.md\`). O contrato assinado **não está no repositório**.

Totais: ${68} requisitos (RF-01 a RF-68), ${33} critérios de aceite (CA-01 a CA-33) e 5 critérios de pagamento (CA-P1 a CA-P5).

## Requisitos funcionais (RF-01 a RF-68)

${hdr}`);
range('RF', 1, 68).forEach(i => out.push(row(i)));
out.push('\n## Critérios de aceite (CA-01 a CA-33)\n\n' + hdr);
range('CA', 1, 33).forEach(i => out.push(row(i)));
out.push('\n## Critérios de aceite de pagamento (CA-P1 a CA-P5)\n\n' + hdr);
['CA-P1', 'CA-P2', 'CA-P3', 'CA-P4', 'CA-P5'].forEach(i => out.push(row(i)));
out.push(`
## Matriz Anexo I para requisitos (seção 18.1)

| Anexo I | Tema | Requisitos | Critérios de aceite |
|---|---|---|---|
| 1 | Cadastro e acesso dos clientes | RF-01 a RF-06, RF-10 | CA-01 a CA-04 |
| 2 | Vitrine de eventos | RF-20 a RF-27 | CA-12 a CA-14 |
| 3 | Compra de ingressos | RF-28 a RF-37 + Etapa 3 | CA-15 a CA-19 |
| 4 | Ingresso digital com QR Code | RF-38 a RF-43 | CA-20 a CA-22 |
| 5 | Validação na entrada | RF-44 a RF-54 | CA-23 a CA-27 |
| 6 | Gestão de eventos e ingressos | RF-11 a RF-19 | CA-07 a CA-11 |
| 7 | Painel administrativo | RF-55 a RF-64 | CA-28 a CA-31 |
| 8 | Usuários e permissões | RF-07 a RF-09 | CA-05, CA-06 |
| 9 | Segurança e proteção de dados | Seção 10 | Roteiro 11.2, itens 14 e 20 |
| 10 | Integração do fluxo de venda e acesso | Etapa 3 + RF-35, RF-50, RF-61 | CA-18, CA-23, roteiro 11.2 item 16 |
| 11 | Design, publicação e entregáveis | RF-65 a RF-68, Etapas 5 e 6 | CA-32, CA-33 |
| 12 | Itens não incluídos | Seção 16 | — |
`);
fs.mkdirSync('docs/rastreabilidade', { recursive: true });
fs.writeFileSync('docs/rastreabilidade/matriz-requisitos.md', out.join('\n') + '\n');
const noDesign = ids.filter(i => !design_.has(i));
console.log('requisitos:', ids.length, '| sem cobertura de design:', noDesign.join(', ') || 'nenhum');
