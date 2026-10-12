import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, stopServer } from './server';
import { RESP_DIR } from './responsivo-setup';

interface Row {
  id: string;
  route: string;
  state: string;
  width: number;
  scrollWidth: number;
  clientWidth: number;
  inner: string[];
  ok: boolean;
  file: string;
}

/** Para o servidor e consolida o resultado de cada tela e largura em docs/evidencias/responsividade/resultado.md. */
export default async function teardown() {
  stopServer(path.join(RESP_DIR, 'server'));
  const file = path.join(RESP_DIR, 'resultados.jsonl');
  if (!existsSync(file)) return;
  const all: (Row & { start?: boolean })[] = readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map(l => JSON.parse(l));
  const rows = all.filter(r => !r.start);
  const widths = [360, 390, 768, 1440];
  const key = (r: Row) => `${r.id}|${r.state}`;
  const order = (id: string) => [/^P/, /^E05/, /^A/, /^ADM22/, /^C/, /^U/, /^V/, /^G/, /^ADM/, /^E/, /^INTRO/].findIndex(re => re.test(id));
  const screens = [...new Map(all.map(r => [key(r), r])).values()].sort(
    (a, b) => order(a.id) - order(b.id) || a.id.localeCompare(b.id, 'pt-BR', { numeric: true }) || a.state.localeCompare(b.state, 'pt-BR'),
  );
  const cell = (r: Row | undefined) =>
    !r ? 'não medido' : r.ok ? `ok ([captura](${r.file}))` : `**FALHA** ${r.scrollWidth} > ${r.clientWidth} ([captura](${r.file}))`;
  const fails = rows.filter(r => !r.ok);
  const inner = rows.filter(r => r.inner.length);
  const missing = all.filter(r => r.start && !rows.some(m => key(m) === key(r) && m.width === r.width)).length;
  const out = [
    '# Responsividade (CA-32): resultado da varredura',
    '',
    `Gerado em ${new Date().toISOString()} pelo Playwright (e2e/responsividade.spec.ts), Chromium, servidor local com dados e gateway **fictícios**.`,
    'Critério: a página falha se `document.documentElement.scrollWidth > clientWidth` (rolagem horizontal). Medida na largura do aparelho, depois do carregamento e da ação de cada estado.',
    'As capturas ficam em `img/`, **fora do Git** (`.gitignore`): os links só abrem na máquina que rodou a varredura ou no arquivo zip guardado à parte.',
    '',
    `Telas e estados: **${screens.length}**; larguras: ${widths.join(', ')} px; medições: **${rows.length}**; falhas: **${fails.length}**; não medidos (teste interrompido antes da medida): **${missing}**.`,
    '',
    '| Tela | Estado | Rota | 360 | 390 | 768 | 1440 |',
    '|---|---|---|---|---|---|---|',
    ...screens.map(
      s =>
        `| ${s.id} | ${s.state} | \`${s.route.replace(/[0-9a-f-]{36}/g, ':id')}\` | ${widths
          .map(w => cell(rows.find(r => key(r) === key(s) && r.width === w)))
          .join(' | ')} |`,
    ),
    '',
    '## Rolagem horizontal interna (não reprova pelo critério; para revisão)',
    '',
    inner.length
      ? inner.map(r => `- ${r.id} "${r.state}" a ${r.width}px: ${r.inner.join('; ')}`).join('\n')
      : 'Nenhum elemento com rolagem horizontal própria transbordando.',
    '',
  ];
  mkdirSync(path.join(ROOT, 'docs/evidencias/responsividade'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs/evidencias/responsividade/resultado.md'), out.join('\n'));
}
