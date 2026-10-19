#!/usr/bin/env node
// Roda as invariantes de auditoria/consultas/invariantes.sql numa transação SÓ LEITURA e imprime uma tabela. Nunca altera nada.
// Uso: node auditoria/ferramentas/invariantes.mjs "<url do banco>" [--json]
// Em produção, use a URL do papel partyx_backup (só leitura), nunca a do dono. Nenhum dado pessoal é impresso: só contagens e ids.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const url = process.argv[2];
if (!url) {
  console.error('uso: node auditoria/ferramentas/invariantes.mjs "<url do banco>" [--json]');
  process.exit(2);
}
const json = process.argv.includes('--json');
const sqlFile = path.resolve(import.meta.dirname, '../consultas/invariantes.sql');
const blocks = readFileSync(sqlFile, 'utf8')
  .split(/^-- @nome /m)
  .slice(1)
  .map(b => {
    const [title, ...rest] = b.split('\n');
    const query = rest.filter(l => !l.startsWith('--')).join('\n').trim().replace(/;\s*$/, '');
    return { title: title.trim(), query };
  });
if (blocks.some(b => /\b(insert|update|delete|alter|drop|truncate|create)\b/i.test(b.query))) {
  console.error('recusado: há comando de escrita no arquivo de invariantes');
  process.exit(2);
}
const client = new pg.Client({ connectionString: url, statement_timeout: 60_000 });
await client.connect();
const results = [];
try {
  await client.query('begin transaction read only');
  await client.query("set local transaction read only");
  for (const b of blocks) {
    const started = Date.now();
    try {
      const r = await client.query(b.query);
      results.push({ invariante: b.title, violacoes: r.rowCount, ms: Date.now() - started, amostra: r.rows.slice(0, 3).map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'string' && v.length > 40 ? v.slice(0, 12) + '…' : v]))) });
    } catch (e) {
      results.push({ invariante: b.title, violacoes: null, ms: Date.now() - started, erro: e instanceof Error ? e.message.slice(0, 120) : 'erro' });
    }
  }
  await client.query('rollback');
} finally {
  await client.end();
}
if (json) console.log(JSON.stringify(results, null, 1));
else {
  console.log('| Invariante | Violações | Tempo |');
  console.log('|---|---|---|');
  for (const r of results) console.log(`| ${r.invariante} | ${r.erro ? 'ERRO: ' + r.erro : r.violacoes === 0 ? 'nenhuma' : '**' + r.violacoes + '**'} | ${r.ms} ms |`);
  const bad = results.filter(r => r.erro || (r.violacoes ?? 1) > 0);
  console.log(bad.length ? `\n${bad.length} invariante(s) com violação ou erro.` : '\nTodas as invariantes conferem.');
  if (bad.length) for (const b of bad) if (b.amostra?.length) console.log(`\n${b.invariante}: amostra ${JSON.stringify(b.amostra)}`);
}
process.exit(results.some(r => r.erro || (r.violacoes ?? 1) > 0) ? 1 : 0);
