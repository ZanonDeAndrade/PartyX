import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase } from '../src/db/client';
import { loadConfig } from '../src/config';
import { buildClosureExport, README_TEXT } from '../src/ops/closureExport';

/**
 * Exportação de encerramento do contrato (Anexo II, item 5). Uso: `npm run ops:export-closure -- <pasta-de-saída>`.
 * Grava CSVs numa pasta nova (recusa uma que já tenha arquivos). Entregue ao cliente por canal seguro e apague as cópias
 * locais depois da entrega. Contém dados pessoais.
 */
const out = process.argv[2];
if (!out) {
  console.error('informe a pasta de saída');
  process.exit(1);
}
const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error('defina DATABASE_URL');
  process.exit(1);
}
mkdirSync(out, { recursive: true, mode: 0o700 });
const database = createDatabase(config);
try {
  const files = await buildClosureExport(database.db);
  for (const f of files) writeFileSync(join(out, f.name), f.content, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(out, 'LEIA-ME.txt'), README_TEXT, { flag: 'wx', mode: 0o600 });
  for (const f of files) console.log(`${f.name}: ${f.rows} linha(s)`);
} finally {
  await database.close();
}
