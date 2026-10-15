import { Client, BASE, seed, pct, policy } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const DURATION = +(process.env.DURATION ?? 180) * 1000, VUS = +(process.env.VUS ?? 200), RPM = +(process.env.RPM ?? 50);
const stats = {}; const rec = (k, r) => { (stats[k] ??= { ms: [], err: 0, n: 0, codes: {} }); const s = stats[k]; s.n++; s.ms.push(r.ms); s.codes[r.status] = (s.codes[r.status] || 0) + 1; if (r.status === 0 || r.status >= 500) s.err++; };
const end = Date.now() + DURATION; const sleep = ms => new Promise(r => setTimeout(r, ms));
async function visitor(i) {
  const c = new Client(); await sleep(Math.random() * 3000);
  while (Date.now() < end) {
    rec('pagina_inicial_html', await c.get('/'));
    rec('api_home', await c.get('/api/public/home'));
    rec('api_lista_eventos', await c.get('/api/public/events'));
    rec('api_pagina_do_evento', await c.get(`/api/public/events/${seed.slug}`));
    await sleep(1500 + Math.random() * 2500);
  }
}
let pista; let done = 0, fail = 0; const pending = [];
async function purchase(i) {
  const c = new Client(); const t = performance.now();
  try {
    const t0 = performance.now(); const lv = (await c.get('/api/legal/versions')).json;
    const r = await c.post('/api/auth/register', { name: `Carga ${i} Ficticio`, email: `carga${i}-${Date.now()}@partyx.test`, cpf: (await import('./lib.mjs')).cpfFor(+(process.env.CPF_BASE ?? 50000) + i), phone: '11987654321', password: 'festa2026Forte!', acceptedTermsVersion: lv.terms, acceptedPrivacyVersion: lv.privacy, accept: true });
    rec('compra_1_cadastro', { status: r.status, ms: performance.now() - t0 }); if (r.status !== 201) throw 0;
    c.csrf = (await c.get('/api/auth/me')).json.csrfToken;
    const o = await c.post('/api/orders', { ...(await policy()), eventSlug: seed.slug, items: [{ ticketTypeId: i % 2 ? seed.pista : seed.vip, quantity: 2 }] }); rec('compra_2_pedido_reserva', o); if (o.status !== 201) throw 0;
    const p = await c.post(`/api/orders/${o.json.order.id}/payment`, { method: 'pix' }); rec('compra_3_pix', p); if (p.status !== 201) throw 0;
    const a = await c.post(`/api/dev/mock-gateway/${o.json.order.id}/aprovado`); rec('compra_4_webhook_confirma', a); if (a.json?.outcome !== 'confirmado') throw 0;
    const tk = await c.get('/api/tickets'); rec('compra_5_meus_ingressos', tk); if ((tk.json?.tickets ?? []).length !== 2) throw 0;
    stats.compra_total ??= { ms: [], err: 0, n: 0, codes: {} }; stats.compra_total.ms.push(performance.now() - t); stats.compra_total.n++; done++;
  } catch { fail++; }
}
const cpuStart = process.cpuUsage();
const visitors = Array.from({ length: VUS }, (_, i) => visitor(i));
let k = 0; const gap = 60000 / RPM;
const arrivals = (async () => { while (Date.now() < end - 20000) { pending.push(purchase(k++)); await sleep(gap); } })();
await arrivals; await Promise.all(pending); await Promise.all(visitors);
const out = { config: { duracao_s: DURATION / 1000, visitantes_simultaneos: VUS, compras_por_minuto: RPM }, compras: { iniciadas: k, concluidas: done, falhas: fail }, etapas: {} };
for (const [name, s] of Object.entries(stats)) out.etapas[name] = { n: s.n, erros_5xx_ou_rede: s.err, p50_ms: pct(s.ms, .5), p95_ms: pct(s.ms, .95), p99_ms: pct(s.ms, .99), max_ms: pct(s.ms, 1), codigos: s.codes };
console.log(JSON.stringify(out, null, 1)); writeFileSync(`${process.env.SP}/${process.env.OUT ?? 'load'}.json`, JSON.stringify(out, null, 1));
