import { readFileSync } from 'node:fs';
export const SP = process.env.SP ?? '.';
export const seed = JSON.parse(readFileSync(`${SP}/seed24.json`, 'utf8'));
export const BASE = process.env.BASE_URL ?? 'http://localhost:8099';
let ipn = 0;
export const nextIp = () => `10.${(ipn >> 16) & 255}.${(ipn >> 8) & 255}.${ipn++ & 255}`;

export function cpfFor(n) {
  const d = String(100000000 + n).padStart(9, '0').split('').map(Number);
  for (let t = 9; t <= 10; t++) {
    const s = d.reduce((a, v, i) => a + v * (t + 1 - i), 0);
    d.push(((s * 10) % 11) % 10);
  }
  return d.join('');
}

export class Client {
  constructor(ip = nextIp()) { this.ip = ip; this.cookie = ''; this.csrf = ''; }
  async req(method, path, body, extra = {}) {
    const t0 = performance.now();
    const headers = { origin: BASE, 'x-forwarded-for': this.ip, ...extra };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.csrf) headers['x-csrf-token'] = this.csrf;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let res;
    try {
      res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { return { status: 0, ms: performance.now() - t0, error: String(e) }; }
    const sc = res.headers.get('set-cookie');
    if (sc && /partyx|session|sid/i.test(sc)) this.cookie = sc.split(';')[0];
    const buf = Buffer.from(await res.arrayBuffer());
    let json = null;
    if ((res.headers.get('content-type') || '').includes('json')) { try { json = JSON.parse(buf.toString()); } catch {} }
    return { status: res.status, ms: performance.now() - t0, json, headers: res.headers, buf };
  }
  get(p, e) { return this.req('GET', p, undefined, e); }
  post(p, b = {}, e) { return this.req('POST', p, b, e); }
  async login(email, password = 'festa2026') {
    const r = await this.post('/api/auth/login', { email, password });
    if (r.status !== 200) throw new Error('login ' + r.status + ' ' + JSON.stringify(r.json));
    const me = await this.get('/api/auth/me'); this.csrf = me.json.csrfToken; return r;
  }
  async signup(i) {
    const lv = (await this.get('/api/legal/versions')).json;
    const r = await this.post('/api/auth/register', {
      name: `Comprador ${i} Ficticio`, email: `comp${i}-${Date.now()}@exemplo.com`, cpf: cpfFor(i + 1000), phone: '11987654321',
      password: 'festa2026Forte!', acceptedTermsVersion: lv.terms, acceptedPrivacyVersion: lv.privacy, accept: true,
    });
    if (r.status !== 201) throw new Error('signup ' + r.status + ' ' + JSON.stringify(r.json));
    const me = await this.get('/api/auth/me'); this.csrf = me.json.csrfToken; return r;
  }
}
export const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : null; };
