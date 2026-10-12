import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * D-16: os contatos públicos são DA PARTYX e vêm só da configuração (`PARTYX_*`). Nenhum e-mail ou telefone real fica escrito no
 * código do site, do servidor ou nas páginas estáticas; em especial, nunca o contato da contratada. Só passam os exemplos de
 * formulário e documentação (domínios reservados para exemplo, placeholder do gateway de teste).
 */
const ROOTS = ['src/site', 'server/src', 'public', 'index.html', 'infra/producao/hosting-public'];
const ALLOWED_EMAIL_DOMAINS = new Set(['exemplo.com', 'exemplo.test', 'example.com', 'testuser.com']);
const ALLOWED_PHONES = new Set(['(11) 98765-4321', '+55 11 91234-5678']);

function files(entry: string): string[] {
  const st = statSync(entry, { throwIfNoEntry: false });
  if (!st) return [];
  if (st.isFile()) return [entry];
  return readdirSync(entry).flatMap(name => files(path.join(entry, name)));
}

const sources = ROOTS.flatMap(files).filter(
  f => /\.(ts|tsx|html|css|json|txt)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes(`${path.sep}testing`),
);

describe('nenhum contato fixo no código (D-16)', () => {
  it('varre um conjunto real de arquivos', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it('e-mails escritos no código são só exemplos', () => {
    const found = sources.flatMap(f =>
      [...readFileSync(f, 'utf8').matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)]
        .filter(m => /\.[a-z]{2,}$/i.test(m[1]!) && !ALLOWED_EMAIL_DOMAINS.has(m[1]!.toLowerCase()))
        .map(m => `${f}: ${m[0]}`),
    );
    expect(found).toEqual([]);
  });

  it('telefones escritos no código são só exemplos', () => {
    const found = sources.flatMap(f =>
      [...readFileSync(f, 'utf8').matchAll(/(?:\+55\s?)?\(?\b\d{2}\)?\s?9?\d{4}-\d{4}\b/g)]
        .filter(m => ![...ALLOWED_PHONES].some(ok => ok.includes(m[0].trim()) || m[0].includes(ok)))
        .map(m => `${f}: ${m[0]}`),
    );
    expect(found).toEqual([]);
  });
});
