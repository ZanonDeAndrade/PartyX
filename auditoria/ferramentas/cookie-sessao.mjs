#!/usr/bin/env node
// Devolve o valor do cookie __session de um comprador da semente (para o Lighthouse abrir as páginas logadas). Só servidor local.
// Uso: node auditoria/ferramentas/cookie-sessao.mjs <state.json> [chave do comprador]
import { readFileSync } from 'node:fs';

const S = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(S.base)) throw new Error('só servidor local');
const b = S.buyers[process.argv[3] ?? 'adulto1'];
const res = await fetch(`${S.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: S.base }, body: JSON.stringify({ email: b.email, password: b.password }) });
if (!res.ok) throw new Error(`login ${res.status}`);
const cookie = res.headers.get('set-cookie')?.match(/__session=([^;]+)/)?.[1];
if (!cookie) throw new Error('sem cookie');
process.stdout.write(cookie);
