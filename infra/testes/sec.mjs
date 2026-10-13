import { Client, BASE, seed, cpfFor } from './lib.mjs';
const out = []; const t = (name, ok, info = '') => { out.push({ name, ok: !!ok, info }); console.log(ok ? 'OK    ' : 'ACHADO', name, info); };
const anon = new Client(); const H = (await anon.get('/')).headers;
const A = (await anon.get('/api/public/events')).headers;
t('HTML: X-Content-Type-Options nosniff', H.get('x-content-type-options') === 'nosniff');
t('HTML: frame-ancestors/X-Frame-Options (clickjacking)', /frame-ancestors/.test(H.get('content-security-policy') || '') || H.get('x-frame-options'), H.get('x-frame-options') || (H.get('content-security-policy') || '').slice(0, 80));
t('HTML: CSP presente', H.get('content-security-policy'), (H.get('content-security-policy') || '').slice(0, 160));
t('HTML: Referrer-Policy', H.get('referrer-policy'), H.get('referrer-policy'));
t('HTML: Permissions-Policy (câmera só para o próprio site)', /camera=\(self\)/.test(H.get('permissions-policy') || ''), H.get('permissions-policy'));
t('Cabeçalho Server/X-Powered-By não revela tecnologia', !H.get('x-powered-by'), H.get('server') || '');
t('HSTS só em HTTPS (local: ausente é esperado)', true, 'verificar em homologação: ' + (H.get('strict-transport-security') || 'ausente no local'));
// Arquivos sensíveis
for (const p of ['/.env', '/.env.example', '/.data/emails/', '/dist-server/index.js', '/server/src/config.ts', '/package.json', '/.git/config', '/drizzle/0000_schema_inicial.sql', '/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/api/../.env']) {
  const r = await anon.get(p); const body = r.buf?.toString().slice(0, 300) || '';
  const leaked = r.status === 200 && !/<div id="root"|<!doctype html/i.test(body);
  t(`arquivo sensível não é servido: ${p}`, !leaked, r.status);
}
// Injeção
const inj = ["' OR '1'='1", "'; drop table users;--", '" OR 1=1 --', '%27%20OR%201%3D1', '\\u0000', '<script>alert(1)</script>'];
for (const q of inj) { const r = await anon.get(`/api/public/events?q=${encodeURIComponent(q)}`); t(`busca pública com payload não gera 5xx nem vaza SQL (${q.slice(0, 18)})`, r.status < 500 && !/syntax|pg_|select |relation/i.test(r.buf.toString()), r.status); }
for (const s of ["x' or '1'='1", '../../etc/passwd', '<img src=x onerror=alert(1)>']) { const r = await anon.get(`/api/public/events/${encodeURIComponent(s)}`); t(`slug com payload: 404 limpo (${s.slice(0, 14)})`, r.status === 404 && !/<img/.test(r.buf.toString()), r.status); }
const lg = await anon.post('/api/auth/login', { email: "admin@partyx.test' OR '1'='1", password: "x' OR '1'='1" }); t('login com SQLi: 4xx, sem sessão', lg.status >= 400 && lg.status < 500 && !lg.headers.get('set-cookie'), lg.status);
// Erros sem vazamento
const bad = await anon.req('POST', '/api/auth/login', undefined, { 'content-type': 'application/json' }); t('corpo vazio/ruim: 4xx sem stack trace', bad.status < 500 && !/at .*\.(ts|js):\d+/.test(bad.buf.toString()), bad.status);
const big = await anon.post('/api/auth/login', { email: 'a'.repeat(2_000_000), password: 'x' }, { connection: 'close' }); t('corpo gigante é recusado (não 5xx)', big.status >= 400 && big.status < 500, big.status);
// CSRF / origem
const c = new Client(); await c.signup(900001);
const evil = await c.post('/api/orders', { eventSlug: seed.slug, items: [{ ticketTypeId: seed.pista, quantity: 1 }] }, { origin: 'https://evil.example' }); t('POST com Origin de outro site é recusado (CSRF)', evil.status === 403, evil.status);
const noCsrf = new Client(); noCsrf.cookie = c.cookie; const nc = await noCsrf.post('/api/orders', { eventSlug: seed.slug, items: [{ ticketTypeId: seed.pista, quantity: 1 }] }); t('POST com cookie mas sem token CSRF é recusado', nc.status === 403, nc.status);
const cors = await anon.req('OPTIONS', '/api/orders', undefined, { origin: 'https://evil.example', 'access-control-request-method': 'POST' }); t('CORS não libera outro site', !cors.headers.get('access-control-allow-origin'), cors.headers.get('access-control-allow-origin') || 'sem cabeçalho');
// Cookie
const r2 = await new Client().post('/api/auth/login', { email: 'admin@partyx.test', password: 'festa2026' }); const ck = r2.headers.get('set-cookie') || '';
t('cookie de sessão HttpOnly + SameSite', /httponly/i.test(ck) && /samesite=(lax|strict)/i.test(ck), ck.replace(/=[^;]+/, '=…').slice(0, 100));
t('cookie Secure (só exigível em HTTPS; no local ausente é esperado)', true, /secure/i.test(ck) ? 'presente' : 'ausente no local — conferir em homologação');
// Mass assignment
const ma = new Client(); const lv = (await ma.get('/api/legal/versions')).json;
const reg = await ma.post('/api/auth/register', { name: 'Atacante Ficticio', email: `ma${Date.now()}@partyx.test`, cpf: cpfFor(900002), phone: '11987654321', password: 'festa2026Forte!', acceptedTermsVersion: lv.terms, acceptedPrivacyVersion: lv.privacy, accept: true, role: 'administrador', isActive: true, mustChangePassword: false });
t('cadastro com role=administrador no corpo vira cliente', reg.status === 201 && reg.json.user.role === 'cliente', reg.json?.user?.role);
// Enumeração
const e1 = await new Client().post('/api/auth/login', { email: 'admin@partyx.test', password: 'errada-1' }); const e2 = await new Client().post('/api/auth/login', { email: 'naoexiste@partyx.test', password: 'errada-1' });
t('login: mesma resposta para e-mail existente e inexistente', e1.status === e2.status && e1.json?.erro?.mensagem === e2.json?.erro?.mensagem, `${e1.status}/${e2.status}`);
const f1 = await new Client().post('/api/auth/password/forgot', { email: 'admin@partyx.test' }); const f2 = await new Client().post('/api/auth/password/forgot', { email: 'naoexiste@partyx.test' });
t('recuperação de senha: mesma resposta para existente e inexistente', f1.status === f2.status && JSON.stringify(f1.json) === JSON.stringify(f2.json), `${f1.status}/${f2.status}`);
// Força bruta
const bf = new Client(); const codes = []; for (let i = 0; i < 15; i++) codes.push((await bf.post('/api/auth/login', { email: 'validador@partyx.test', password: 'tentativa' + i })).status);
t('força bruta no login bloqueia (429) em poucas tentativas', codes.includes(429), codes.join(','));
const right = await new Client(bf.ip).post('/api/auth/login', { email: 'validador@partyx.test', password: 'festa2026' }); t('após bloqueio, nem a senha certa entra pelo mesmo IP/e-mail', right.status === 429, right.status);
// Rotas internas / dev
const job = await anon.post('/api/internal/jobs/reconcile-payments'); t('rotina interna sem token: 401/503', [401, 503].includes(job.status), job.status);
const wh = await anon.post('/api/webhooks/payments', { id: 'x', paymentId: 'y', type: 'payment.updated' }); t('webhook sem assinatura: 401', wh.status === 401, wh.status);
// IDOR por id sequencial / formato
for (const p of ['/api/orders/1', '/api/orders/00000000-0000-0000-0000-000000000000', '/api/tickets/../../admin/team']) { const r = await c.get(p); t(`IDOR/formato inválido: ${p.slice(0, 40)} → 404/400`, [400, 404].includes(r.status), r.status); }
// XSS armazenado no OG
console.log('RESUMO', out.filter(o => o.ok).length, 'ok de', out.length);
import { writeFileSync } from 'node:fs'; writeFileSync(process.env.SP + '/sec.json', JSON.stringify(out, null, 1));
