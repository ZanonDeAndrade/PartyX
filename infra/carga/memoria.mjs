// Pré-carregado só no servidor da carga (run-carga.sh): grava a cada 2 s a memória do processo separada em partes, para distinguir
// heap do V8 (objetos JS) de memória nativa (RSS menos heap). Uma linha por amostra: segundos rss heapTotal heapUsed external (MB).
import { appendFileSync } from 'node:fs';

const arquivo = process.env.CARGA_MEMORIA_ARQUIVO;
const inicio = Date.now();
const mb = bytes => (bytes / 1048576).toFixed(1);
if (arquivo)
  setInterval(() => {
    const m = process.memoryUsage();
    const s = ((Date.now() - inicio) / 1000).toFixed(0);
    appendFileSync(arquivo, `${s} ${mb(m.rss)} ${mb(m.heapTotal)} ${mb(m.heapUsed)} ${mb(m.external)}\n`);
  }, 2000).unref();
