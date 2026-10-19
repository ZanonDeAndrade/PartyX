#!/usr/bin/env node
// Relatório da carga da auditoria: lê os resumos do k6 (fases A e B), as amostras de recursos, a fila de e-mails e as invariantes e
// escreve docs/relatorios/carga/escala-<n>.md com tabelas e gráficos SVG (p50, p95, p99 por rota; conexões, CPU e memória no tempo).
// Uso: node auditoria/carga/relatorio-carga.mjs <pasta da rodada> <pasta de saída> <escala> <k6 A exit> <k6 B exit>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [work, out, escala, aStatus, bStatus] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const read = f => (existsSync(path.join(work, f)) ? JSON.parse(readFileSync(path.join(work, f), 'utf8')) : null);
const a = read('k6-fase-a.json');
const b = read('k6-fase-b.json');
const emails = read('emails.json');
const samples = existsSync(path.join(work, 'recursos.jsonl'))
  ? readFileSync(path.join(work, 'recursos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(s => !s.erro)
  : [];
const invariantes = existsSync(path.join(work, 'invariantes.md')) ? readFileSync(path.join(work, 'invariantes.md'), 'utf8') : '(não rodou)';
const dump = existsSync(path.join(work, 'dump.txt')) ? readFileSync(path.join(work, 'dump.txt'), 'utf8').trim() : '';
const seed = read('seed.json');

const ms = v => (v === undefined || v === null ? '' : `${Math.round(v)} ms`);
const trend = (sum, name) => sum?.metrics?.[name];
function rows(sum, prefix) {
  if (!sum) return [];
  return Object.entries(sum.metrics)
    .filter(([k]) => k.startsWith('http_req_duration{etapa:'))
    .map(([k, v]) => ({ rota: k.slice('http_req_duration{etapa:'.length, -1), n: sum.metrics[`http_reqs{etapa:${k.slice('http_req_duration{etapa:'.length, -1)}}`]?.count ?? 0, p50: v.med, p95: v['p(95)'], p99: v['p(99)'], max: v.max, fase: prefix }))
    .sort((x, y) => x.rota.localeCompare(y.rota));
}
const allRows = [...rows(a, 'A'), ...rows(b, 'B')];

function barChart(title, data, file) {
  const w = 900;
  const rowH = 26;
  const h = 60 + data.length * rowH;
  const max = Math.max(1, ...data.map(d => d.p99 ?? 0));
  const x = v => 260 + (v / max) * 580;
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" font-family="Arial, sans-serif" font-size="12">`,
    `<rect width="${w}" height="${h}" fill="#fff"/>`, `<text x="12" y="22" font-size="15" font-weight="bold">${title}</text>`,
    `<text x="12" y="40" fill="#555">barras: p50 (escuro), p95 (médio), p99 (claro), em ms; eixo até ${Math.round(max)} ms</text>`];
  data.forEach((d, i) => {
    const y = 56 + i * rowH;
    svg.push(`<text x="12" y="${y + 13}">${d.rota} (${d.n})</text>`);
    svg.push(`<rect x="260" y="${y + 2}" width="${x(d.p99) - 260}" height="16" fill="#c7d2fe"/>`);
    svg.push(`<rect x="260" y="${y + 2}" width="${x(d.p95) - 260}" height="16" fill="#818cf8"/>`);
    svg.push(`<rect x="260" y="${y + 2}" width="${x(d.p50) - 260}" height="16" fill="#3730a3"/>`);
    svg.push(`<text x="${Math.min(w - 120, x(d.p99) + 6)}" y="${y + 14}" fill="#333">${Math.round(d.p50)} / ${Math.round(d.p95)} / ${Math.round(d.p99)}</text>`);
  });
  svg.push('</svg>');
  writeFileSync(path.join(out, file), svg.join('\n'));
}
function lineChart(title, series, file, unit) {
  const w = 900, h = 260, pad = 50;
  const n = samples.length;
  const max = Math.max(1, ...series.flatMap(s => samples.map(p => p[s.key] ?? 0)));
  const x = i => pad + (i / Math.max(1, n - 1)) * (w - pad - 20);
  const y = v => h - pad + 10 - (v / max) * (h - pad - 40);
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" font-family="Arial, sans-serif" font-size="12">`, `<rect width="${w}" height="${h}" fill="#fff"/>`,
    `<text x="12" y="22" font-size="15" font-weight="bold">${title}</text>`, `<text x="12" y="40" fill="#555">máximo do eixo: ${Math.round(max)} ${unit}; uma amostra a cada 2 s (${n} amostras)</text>`,
    `<line x1="${pad}" y1="${y(0)}" x2="${w - 20}" y2="${y(0)}" stroke="#999"/>`, `<line x1="${pad}" y1="${y(max)}" x2="${pad}" y2="${y(0)}" stroke="#999"/>`,
    `<text x="4" y="${y(max) + 4}" fill="#555">${Math.round(max)}</text>`, `<text x="4" y="${y(0) + 4}" fill="#555">0</text>`];
  series.forEach((s, si) => {
    const pts = samples.map((p, i) => `${x(i).toFixed(1)},${y(p[s.key] ?? 0).toFixed(1)}`).join(' ');
    svg.push(`<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="1.5"/>`);
    svg.push(`<text x="${pad + 10 + si * 180}" y="${h - 8}" fill="${s.color}">${s.label}</text>`);
  });
  svg.push('</svg>');
  writeFileSync(path.join(out, file), svg.join('\n'));
}
barChart(`Escala ${escala}: tempo por rota (fase A: abertura e pedidos)`, rows(a, 'A'), `escala-${escala}-fase-a.svg`);
barChart(`Escala ${escala}: tempo por rota (fase B: webhooks e portaria)`, rows(b, 'B'), `escala-${escala}-fase-b.svg`);
if (samples.length) {
  lineChart(`Escala ${escala}: conexões abertas no PostgreSQL`, [{ key: 'conexoes', label: 'conexões (total)', color: '#3730a3' }, { key: 'ativas', label: 'ativas', color: '#dc2626' }], `escala-${escala}-conexoes.svg`, 'conexões');
  lineChart(`Escala ${escala}: CPU do servidor (% de um núcleo)`, [{ key: 'cpuPct', label: 'CPU %', color: '#047857' }], `escala-${escala}-cpu.svg`, '%');
  lineChart(`Escala ${escala}: memória RSS do servidor (MB)`, [{ key: 'rssMb', label: 'RSS MB', color: '#b45309' }], `escala-${escala}-memoria.svg`, 'MB');
}
const c = (sum, name) => sum?.metrics?.[name]?.count ?? 0;
const rate = (sum, name) => sum?.metrics?.[name]?.value;
const pct = v => (v === undefined ? '' : `${(v * 100).toFixed(2)}%`);
const maxOf = key => (samples.length ? Math.max(...samples.map(s => s[key] ?? 0)) : null);
const p = (arr, q) => { if (!arr.length) return null; const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const md = [];
md.push(`# Carga da auditoria, escala ${escala} (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`, '');
md.push(`Servidor local empacotado (dist-server), heap de 320 MB, \`DB_POOL_MAX=5\`, gateway fictício; PostgreSQL de teste em Docker. k6 ${a?.metrics ? '1.0.0' : ''}. Fase A k6 exit=${aStatus}; fase B k6 exit=${bStatus} (exit 99 = algum limiar estourado, veja as tabelas).`, '');
md.push(`Semente: capacidade ${seed?.capacity ?? '?'} ingressos; ${seed?.buyers?.length ?? '?'} compradores. ${dump}`, '');
md.push('## Resultado das compras (fase A)', '', '| Métrica | Valor |', '|---|---|');
md.push(`| Compras iniciadas | ${c(a, 'compras_iniciadas')} |`, `| Compras concluídas (pagas, com ingresso) | ${c(a, 'compras_concluidas')} |`, `| Recusadas por estoque (esperado ao esgotar) | ${c(a, 'compras_recusadas_por_estoque')} |`, `| Erros inesperados | ${c(a, 'erros_inesperados')} |`, `| Requisições HTTP com falha (fase A) | ${pct(rate(a, 'http_req_failed'))} |`, `| Compra completa, p95 | ${ms(trend(a, 'compra_completa_ms')?.['p(95)'])} |`, `| Tempo até o primeiro byte da página do evento, p50 / p95 / p99 | ${ms(trend(a, 'ttfb_pagina_evento_ms')?.med)} / ${ms(trend(a, 'ttfb_pagina_evento_ms')?.['p(95)'])} / ${ms(trend(a, 'ttfb_pagina_evento_ms')?.['p(99)'])} |`, `| Usuários virtuais máximos (fase A) | ${a?.metrics?.vus_max?.value ?? ''} |`, '');
md.push('## Webhooks e portaria (fase B)', '', '| Métrica | Valor |', '|---|---|');
md.push(`| Webhooks válidos (200) | ${c(b, 'webhooks_validos_200')} |`, `| Webhooks com assinatura inválida (401, esperado) | ${c(b, 'webhooks_invalidos_401')} |`, `| Webhooks com erro | ${c(b, 'webhooks_erros')} |`, `| Leituras na portaria | ${c(b, 'leituras')} (válidas ${c(b, 'leituras_validas')}, já utilizado ${c(b, 'leituras_ja_utilizado')}, erro ${c(b, 'leituras_erro')}) |`, `| Requisições HTTP com falha (fase B, inclui os 401 esperados) | ${pct(rate(b, 'http_req_failed'))} |`, '');
md.push('## Tempo por rota (ms)', '', '| Fase | Rota | Requisições | p50 | p95 | p99 | máx |', '|---|---|---|---|---|---|---|');
for (const r of allRows) md.push(`| ${r.fase} | ${r.rota} | ${r.n} | ${Math.round(r.p50)} | ${Math.round(r.p95)} | ${Math.round(r.p99)} | ${Math.round(r.max)} |`);
md.push('', `![fase A](escala-${escala}-fase-a.svg)`, '', `![fase B](escala-${escala}-fase-b.svg)`, '');
md.push('## Recursos do servidor e do banco', '', '| Medida | Valor |', '|---|---|');
md.push(`| Conexões abertas no PostgreSQL, máximo (p95) | ${maxOf('conexoes') ?? '?'} (${p(samples.map(s => s.conexoes), 0.95) ?? '?'}) |`, `| Conexões ativas, máximo | ${maxOf('ativas') ?? '?'} |`, `| CPU do processo, máximo (p95) | ${maxOf('cpuPct') ?? '?'}% (${p(samples.map(s => s.cpuPct), 0.95) ?? '?'}%) |`, `| Memória RSS, máximo | ${maxOf('rssMb') ?? '?'} MB |`, '');
if (samples.length) md.push(`![conexões](escala-${escala}-conexoes.svg)`, '', `![cpu](escala-${escala}-cpu.svg)`, '', `![memória](escala-${escala}-memoria.svg)`, '');
md.push('## Fila de e-mails (captura local, sem SMTP)', '', `| E-mails | Enviados | Falhou | Tempo na fila p50 | p95 | máx |`, '|---|---|---|---|---|---|');
md.push(`| ${emails?.n ?? '?'} | ${emails?.enviados ?? '?'} | ${emails?.falhou ?? '?'} | ${emails?.p50_s != null ? Number(emails.p50_s).toFixed(2) + ' s' : '?'} | ${emails?.p95_s != null ? Number(emails.p95_s).toFixed(2) + ' s' : '?'} | ${emails?.max_s != null ? Number(emails.max_s).toFixed(2) + ' s' : '?'} |`, '');
md.push('## Invariantes depois da carga', '', invariantes.trim(), '');
writeFileSync(path.join(out, `escala-${escala}.md`), md.join('\n'));
console.log(`relatório: ${path.join(out, `escala-${escala}.md`)}`);
